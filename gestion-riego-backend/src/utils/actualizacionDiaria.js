const pool = require('../db');
const omixomService = require('./omixomService');

const sanitizeNumeric = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numValue = parseFloat(value);
    return isNaN(numValue) ? null : numValue;
};

async function actualizacionDiaria() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // NUEVA FUNCIONALIDAD: Consultar estaciones meteorológicas antes de procesar lotes
        //console.log('Consultando datos de estaciones meteorológicas...');
        const estacionesConsultadas = await consultarEstacionesMeteorologicas(client);

        // Obtener todos los lotes activos
        const lotesResult = await client.query('SELECT id, cultivo_id, fecha_siembra FROM lotes WHERE activo = true');
        
        // CORREGIDO: Procesar para la fecha de HOY (los datos de estación ya vienen acumulados para hoy)
        const hoy = new Date();

        //console.log(`Procesando datos para la fecha: ${hoy.toISOString().split('T')[0]} (datos acumulados de últimas 24h)`);

        for (const lote of lotesResult.rows) {
            try {
                // Verificar si ya se alcanzó el máximo de días para este lote
                const { rows: [maxDays] } = await client.query(`
                    SELECT MAX(GREATEST(cc.indice_dias, COALESCE(ccl.dias_correccion, cc.indice_dias))) as max_dias
                    FROM coeficiente_cultivo cc
                    LEFT JOIN coeficiente_cultivo_lote ccl ON ccl.lote_id = $2 AND ccl.coeficiente_cultivo_id = cc.id
                    WHERE cc.cultivo_id = $1
                `, [lote.cultivo_id, lote.id]);

                const maxDiasSimulacion = maxDays.max_dias || 150;

                const fechaSiembra = new Date(lote.fecha_siembra);
                const diasDesdeSiembra = Math.floor((hoy - fechaSiembra) / (1000 * 60 * 60 * 24));

                if (diasDesdeSiembra > maxDiasSimulacion) {
                    console.log(`Lote ${lote.id} ha alcanzado el máximo de días (${maxDiasSimulacion}). Días actuales: ${diasDesdeSiembra}`);
                    continue;
                }
                
                // Obtener o crear el registro de cambios_diarios para HOY
                let cambioDiario = await obtenerOCrearCambioDiario(client, lote.id, hoy, diasDesdeSiembra);

                // NUEVA FUNCIONALIDAD: Aplicar datos de estación solo si se consultaron estaciones
                if (estacionesConsultadas) {
                    await aplicarDatosEstacionALote(client, lote.id, hoy, cambioDiario);
                }

                // Obtener precipitaciones existentes
                const precipitacionesResult = await client.query(
                    'SELECT precipitaciones FROM cambios_diarios WHERE lote_id = $1 AND fecha_cambio = $2',
                    [lote.id, hoy]
                );

                if (precipitacionesResult.rows.length > 0) {
                    cambioDiario.precipitaciones = precipitacionesResult.rows[0].precipitaciones;
                }

                // Actualizar lluvia efectiva antes de otros cálculos
                cambioDiario = actualizarLluviaEficiente(cambioDiario);

                // Actualizar crecimiento radicular
                cambioDiario = await actualizarCrecimientoRadicular(client, lote, diasDesdeSiembra, cambioDiario);

                // Actualizar KC y ETC
                cambioDiario = await actualizarKC(client, lote, diasDesdeSiembra, cambioDiario);

                // Actualizar capacidad de extracción
                cambioDiario = await actualizarCapacidadExtraccion(client, lote, cambioDiario);

                // Actualizar lluvia eficiente
                cambioDiario = await actualizarLluviaEficiente(cambioDiario);

                // Actualizar agua útil diaria
                cambioDiario = await actualizarAguaUtilDiaria(client, lote, cambioDiario);

                // Asegurar que el objeto cambioDiario tenga todas las propiedades necesarias
                if (!cambioDiario.lote_id) cambioDiario.lote_id = lote.id;
                if (!cambioDiario.fecha_cambio) cambioDiario.fecha_cambio = hoy;

                // Actualizar el registro en la base de datos
                await actualizarCambioDiario(client, cambioDiario);

                /*console.log('Lote procesado:', {
                    loteId: lote.id,
                    fecha: hoy.toISOString().split('T')[0],
                    evapotranspiracion: cambioDiario.evapotranspiracion || 'No disponible',
                    precipitaciones: cambioDiario.precipitaciones || 0,
                    lluviaEfectiva: cambioDiario.lluvia_efectiva || 0
                });*/
                
            } catch (error) {
                console.error(`Error procesando lote ${lote.id}:`, error);
                // No lanzar el error para que continúe con los otros lotes
                // throw error;
            }
        }

        await client.query('COMMIT');
        console.log('Actualización diaria completada con éxito');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error en la actualización diaria:', e);
        throw e;
    } finally {
        client.release();
    }
}

async function consultarEstacionesMeteorologicas(client) {
    try {
        // CAMBIO: Obtener estaciones ÚNICAS y los campos que las usan
        const { rows: estacionesUnicas } = await client.query(`
            SELECT 
                c.estacion_id,
                array_agg(c.id) as campos_ids,
                array_agg(c.nombre_campo) as nombres_campos
            FROM campos c
            WHERE c.estacion_id IS NOT NULL 
            AND c.estacion_id != ''
            GROUP BY c.estacion_id
        `);

        console.log(`Encontradas ${estacionesUnicas.length} estaciones meteorológicas únicas`);

        if (estacionesUnicas.length === 0) {
            console.log('No hay estaciones meteorológicas configuradas. Continuando sin datos de estación.');
            return false;
        }

        // Crear tabla temporal para datos de estaciones
        await client.query(`
            CREATE TEMP TABLE IF NOT EXISTS temp_datos_estacion (
                campo_id BIGINT,
                fecha DATE,
                evapotranspiracion NUMERIC,
                temperatura NUMERIC,
                humedad NUMERIC,
                precipitaciones NUMERIC,
                PRIMARY KEY (campo_id, fecha)
            ) ON COMMIT PRESERVE ROWS
        `);

        let estacionesExitosas = 0;

        // CAMBIO: Iterar por estaciones únicas, no por campos
        for (const estacion of estacionesUnicas) {
            try {
                console.log(`Consultando estación ${estacion.estacion_id} (usada por campos: ${estacion.nombres_campos.join(', ')})...`);
                
                // UNA SOLA consulta por estación
                const datosEstacion = await omixomService.obtenerUltimoDatoEstacion(estacion.estacion_id);
                
                if (datosEstacion && datosEstacion.length > 0) {
                    // Aplicar los datos a TODOS los campos que usan esta estación
                    for (const campoId of estacion.campos_ids) {
                        await guardarDatosEstacion(client, campoId, datosEstacion);
                    }
                    estacionesExitosas++;
                    console.log(`✓ Datos obtenidos para estación ${estacion.estacion_id}`);
                    console.log(`  Evapotranspiración: ${datosEstacion[0].evapotranspiracion} mm/día`);
                    console.log(`  Aplicado a ${estacion.campos_ids.length} campos`);
                } else {
                    console.log(`⚠ No se obtuvieron datos para estación ${estacion.estacion_id}`);
                }
            } catch (error) {
                console.error(`✗ Error consultando estación ${estacion.estacion_id}:`, error.message);
                // Continuar con la siguiente estación
            }
        }

        console.log(`Resumen consulta estaciones: ${estacionesExitosas}/${estacionesUnicas.length} estaciones exitosas`);
        return true;

    } catch (error) {
        console.error('Error en consultarEstacionesMeteorologicas:', error);
        return false;
    }
}

async function guardarDatosEstacion(client, campoId, datosEstacion) {
    try {
        // Insertar cada dato de la estación
        for (const dato of datosEstacion) {
            await client.query(`
                INSERT INTO temp_datos_estacion 
                (campo_id, fecha, evapotranspiracion, temperatura, humedad, precipitaciones)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (campo_id, fecha) 
                DO UPDATE SET
                    evapotranspiracion = EXCLUDED.evapotranspiracion,
                    temperatura = EXCLUDED.temperatura,
                    humedad = EXCLUDED.humedad,
                    precipitaciones = EXCLUDED.precipitaciones
            `, [
                campoId,
                dato.fecha,
                sanitizeNumeric(dato.evapotranspiracion),
                sanitizeNumeric(dato.temperatura),
                sanitizeNumeric(dato.humedad),
                sanitizeNumeric(dato.precipitaciones)
            ]);
        }
    } catch (error) {
        console.error('Error guardando datos de estación:', error);
        throw error;
    }
}

async function aplicarDatosEstacionALote(client, loteId, fecha, cambioDiario) {
    try {
        // Verificar si existe la tabla temporal
        const { rows: tablaExiste } = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'temp_datos_estacion'
            )
        `);

        if (!tablaExiste[0].exists) {
            //console.log('Tabla temporal de datos de estación no existe. Saltando aplicación de datos.');
            return;
        }

        // Obtener datos de estación para la fecha específica (HOY)
        const { rows: datosEstacion } = await client.query(`
            SELECT tde.evapotranspiracion, tde.temperatura, tde.humedad, tde.precipitaciones
            FROM temp_datos_estacion tde
            JOIN lotes l ON l.campo_id = tde.campo_id
            WHERE l.id = $1 AND tde.fecha = $2
        `, [loteId, fecha.toISOString().split('T')[0]]);

        if (datosEstacion.length > 0) {
            const datos = datosEstacion[0];
            
            //console.log(`📊 Aplicando datos de estación al lote ${loteId} para fecha ${fecha.toISOString().split('T')[0]}`);
            
            // Aplicar datos de la estación al cambio diario solo si son válidos
            if (datos.evapotranspiracion !== null && !isNaN(datos.evapotranspiracion)) {
                cambioDiario.evapotranspiracion = parseFloat(datos.evapotranspiracion);
                //console.log(`✅ Evapotranspiración de estación aplicada al lote ${loteId}: ${cambioDiario.evapotranspiracion} mm/día`);
            }
            
            if (datos.temperatura !== null && !isNaN(datos.temperatura)) {
                cambioDiario.temperatura = parseFloat(datos.temperatura);
               // console.log(`✅ Temperatura de estación aplicada al lote ${loteId}: ${cambioDiario.temperatura}°C`);
            }
            
            if (datos.humedad !== null && !isNaN(datos.humedad)) {
                cambioDiario.humedad = parseFloat(datos.humedad);
                //console.log(`✅ Humedad de estación aplicada al lote ${loteId}: ${cambioDiario.humedad}%`);
            }
            
            if (datos.precipitaciones !== null && !isNaN(datos.precipitaciones)) {
                cambioDiario.precipitaciones = parseFloat(datos.precipitaciones);
                //console.log(`✅ Precipitaciones de estación aplicadas al lote ${loteId}: ${cambioDiario.precipitaciones} mm`);
            }
        } else {
            console.log(`ℹ No hay datos de estación disponibles para el lote ${loteId} en la fecha ${fecha.toISOString().split('T')[0]}`);
        }
    } catch (error) {
        console.error(`Error aplicando datos de estación al lote ${loteId}:`, error);
        // No lanzar error para que continúe el procesamiento
    }
}

async function obtenerOCrearCambioDiario(client, loteId, fecha, dias) {
    const result = await client.query(
        'SELECT * FROM cambios_diarios WHERE lote_id = $1 AND fecha_cambio = $2',
        [loteId, fecha]
    );

    if (result.rows.length > 0) {
        return result.rows[0];
    } else {
        return { 
            lote_id: loteId, 
            fecha_cambio: fecha, 
            dias: dias,
            evapotranspiracion: null,
            temperatura: null,
            humedad: null,
            precipitaciones: null
        };
    }
}

async function actualizarCrecimientoRadicular(client, lote, diasDesdeSiembra, cambioDiario) {
    if (diasDesdeSiembra > 6) {
        const cultivoResult = await client.query(
            'SELECT indice_crecimiento_radicular FROM cultivos WHERE id = $1',
            [lote.cultivo_id]
        );
        
        if (cultivoResult.rows.length > 0) {
            const indiceCrecimientoRadicular = sanitizeNumeric(cultivoResult.rows[0].indice_crecimiento_radicular);
            
            const ultimoCrecimientoResult = await client.query(
                'SELECT crecimiento_radicular FROM cambios_diarios WHERE lote_id = $1 AND fecha_cambio < $2 ORDER BY fecha_cambio DESC LIMIT 1',
                [lote.id, cambioDiario.fecha_cambio]
            );
            
            let nuevoCrecimientoRadicular = null;
            if (ultimoCrecimientoResult.rows.length > 0) {
                const ultimoCrecimiento = sanitizeNumeric(ultimoCrecimientoResult.rows[0].crecimiento_radicular);
                if (ultimoCrecimiento !== null && indiceCrecimientoRadicular !== null) {
                    nuevoCrecimientoRadicular = ultimoCrecimiento + indiceCrecimientoRadicular;
                }
            } else if (indiceCrecimientoRadicular !== null) {
                nuevoCrecimientoRadicular = indiceCrecimientoRadicular;
            }
            
            cambioDiario.crecimiento_radicular = nuevoCrecimientoRadicular;
        }
    }
    return cambioDiario;
}

async function actualizarKC(client, lote, diasDesdeSiembra, cambioDiario) {
    // Usar la función calcularKCPorPendiente mejorada
    const kc = await calcularKCPorPendiente(client, lote.id, diasDesdeSiembra);
    cambioDiario.kc = kc;
    
    // NUEVO: Calcular ETC automáticamente si hay evapotranspiración
    if (cambioDiario.evapotranspiracion !== null && cambioDiario.evapotranspiracion !== undefined) {
        cambioDiario.etc = cambioDiario.evapotranspiracion * kc;
        //console.log(`✅ ETC calculado para lote ${lote.id}: ${cambioDiario.evapotranspiracion} * ${kc} = ${cambioDiario.etc}`);
    }
    
    return cambioDiario;
}

// Función calcularKCPorPendiente agregada al archivo actualizacionDiaria
async function calcularKCPorPendiente(client, loteId, diasDesdeSiembra) {
    // Primero obtenemos el cultivo_id del lote
    const { rows: [lote] } = await client.query(
        'SELECT cultivo_id FROM lotes WHERE id = $1',
        [loteId]
    );

    if (!lote) return 1; // Valor por defecto si no se encuentra el lote

    // Obtenemos los coeficientes del cultivo, considerando días de corrección
    const { rows: coeficientes } = await client.query(`
        SELECT 
            cc.indice_kc,
            COALESCE(ccl.dias_correccion, cc.indice_dias) as dias_efectivos,
            cc.indice_dias as dias_originales
        FROM coeficiente_cultivo cc
        LEFT JOIN coeficiente_cultivo_lote ccl ON ccl.lote_id = $2 AND ccl.coeficiente_cultivo_id = cc.id
        WHERE cc.cultivo_id = $1
        ORDER BY dias_efectivos ASC`,
        [lote.cultivo_id, loteId] );

    // Si no hay coeficientes, retornamos un valor por defecto
    if (!coeficientes.length) return 1;

    // Si estamos antes del primer período, usamos el KC inicial
    if (diasDesdeSiembra <= coeficientes[0].dias_efectivos) {
        return coeficientes[0].indice_kc;
    }

    // Buscamos el intervalo correcto para calcular la pendiente
    for (let i = 0; i < coeficientes.length - 1; i++) {
        const periodoActual = coeficientes[i];
        const periodoSiguiente = coeficientes[i + 1];

        if (diasDesdeSiembra > periodoActual.dias_efectivos && 
            diasDesdeSiembra <= periodoSiguiente.dias_efectivos) {
            
            // Calculamos la pendiente (a) entre los dos períodos
            const a = (periodoSiguiente.indice_kc - periodoActual.indice_kc) / 
                     (periodoSiguiente.dias_efectivos - periodoActual.dias_efectivos);
            
            // Calculamos el intercepto (b)
            const b = periodoActual.indice_kc - (a * periodoActual.dias_efectivos);
            
            // Calculamos el KC para el día actual usando y = ax + b
            const kc = (a * diasDesdeSiembra) + b;

            return kc;
        }
    }

    // Si estamos después del último período, usamos el último KC
    return coeficientes[coeficientes.length - 1].indice_kc;
}

async function actualizarCapacidadExtraccion(client, lote, cambioDiario) {
    const cultivoResult = await client.query('SELECT indice_capacidad_extraccion FROM cultivos WHERE id = $1', [lote.cultivo_id]);
    const indiceCapacidadExtraccion = cultivoResult.rows[0].indice_capacidad_extraccion;

    // Obtener el agua útil diaria del día anterior
    const diaAnteriorResult = await client.query(
        'SELECT agua_util_diaria FROM cambios_diarios WHERE lote_id = $1 AND fecha_cambio < $2 ORDER BY fecha_cambio DESC LIMIT 1',
        [lote.id, cambioDiario.fecha_cambio]
    );

    let aguaUtilAnterior;
    if (diaAnteriorResult.rows.length > 0) {
        aguaUtilAnterior = diaAnteriorResult.rows[0].agua_util_diaria;
    } else {
        // Si no hay día anterior, usar el agua útil inicial del primer estrato
        aguaUtilAnterior = await obtenerAguaUtilInicialEstrato(client, lote.id, 1);
    }

    cambioDiario.capacidad_extraccion = indiceCapacidadExtraccion * aguaUtilAnterior;

    return cambioDiario;
}

function actualizarLluviaEficiente(cambioDiario) {
    const precipitaciones = sanitizeNumeric(cambioDiario.precipitaciones);
    
    // Si no hay precipitaciones, la lluvia efectiva es 0
    if (precipitaciones === null || precipitaciones === 0) {
        cambioDiario.lluvia_efectiva = 0;
        return cambioDiario;
    }

    // Aplicar la fórmula según corresponda
    if (precipitaciones < 15) {
        cambioDiario.lluvia_efectiva = precipitaciones;
    } else {
        // Fórmula: 2.43 * PP^0.667
        cambioDiario.lluvia_efectiva = parseFloat((2.43 * Math.pow(precipitaciones, 0.667)).toFixed(2));
    }

    return cambioDiario;
}

async function actualizarAguaUtilDiaria(client, lote, cambioDiario) {
    const diaAnteriorResult = await client.query(
        `SELECT agua_util_diaria, crecimiento_radicular, MAX(estrato_alcanzado) as ultimo_estrato, fecha_cambio
         FROM cambios_diarios 
         WHERE lote_id = $1 AND fecha_cambio < $2 
         GROUP BY agua_util_diaria, crecimiento_radicular, fecha_cambio
         ORDER BY fecha_cambio DESC 
         LIMIT 1`,
        [lote.id, cambioDiario.fecha_cambio]
    );

    let aguaUtilDiaria;
    const estratoActual = Math.floor(cambioDiario.crecimiento_radicular / 20) + 1;

    if (diaAnteriorResult.rows.length > 0) {
        aguaUtilDiaria = diaAnteriorResult.rows[0].agua_util_diaria;
        const ultimoEstratoAlcanzado = diaAnteriorResult.rows[0].ultimo_estrato;
        
        // Verificar si ha alcanzado un nuevo estrato
        if (estratoActual > ultimoEstratoAlcanzado) {
            // Sumar el agua útil inicial del nuevo estrato alcanzado
            const nuevoEstratoAgua = await obtenerAguaUtilInicialEstrato(client, lote.id, estratoActual);
            aguaUtilDiaria += nuevoEstratoAgua;
        }
    } else {
        // Es el primer día, obtener agua útil inicial del primer estrato
        aguaUtilDiaria = await obtenerAguaUtilInicialEstrato(client, lote.id, 1);
    }

    const evapotranspiracionKC = (cambioDiario.evapotranspiracion || 0) * cambioDiario.kc;

    // Calcular el agua útil diaria
    const perdidaAgua = Math.min(cambioDiario.capacidad_extraccion, evapotranspiracionKC);
    cambioDiario.agua_util_diaria = aguaUtilDiaria - perdidaAgua + cambioDiario.lluvia_efectiva + (cambioDiario.riego_cantidad || 0);

    // Actualizar el estrato alcanzado
    cambioDiario.estrato_alcanzado = estratoActual;

    return cambioDiario;
}

async function obtenerAguaUtilInicialEstrato(client, loteId, estrato) {
    const result = await client.query(
        'SELECT valor FROM agua_util_inicial WHERE lote_id = $1 AND estratos = $2',
        [loteId, estrato]
    );
    return result.rows.length > 0 ? result.rows[0].valor : 0;
}

async function actualizarCambioDiario(client, cambioDiario) {
    const {
        lote_id,
        fecha_cambio,
        dias,
        crecimiento_radicular,
        kc,
        capacidad_extraccion,
        lluvia_efectiva,
        agua_util_diaria,
        estrato_alcanzado,
        evapotranspiracion,
        temperatura,
        humedad,
        precipitaciones,
        etc  // AGREGAR ETC
    } = cambioDiario;

    // Asegurar que todos los valores estén sanitizados
    const valoresParaInsertar = [
        lote_id,
        fecha_cambio,
        sanitizeNumeric(dias),
        sanitizeNumeric(crecimiento_radicular),
        sanitizeNumeric(kc),
        sanitizeNumeric(capacidad_extraccion),
        sanitizeNumeric(lluvia_efectiva),
        sanitizeNumeric(agua_util_diaria),
        sanitizeNumeric(estrato_alcanzado),
        sanitizeNumeric(evapotranspiracion),
        sanitizeNumeric(temperatura),
        sanitizeNumeric(humedad),
        sanitizeNumeric(precipitaciones),
        sanitizeNumeric(etc)  // AGREGAR ETC
    ];

    const query = `
        INSERT INTO cambios_diarios (
            lote_id,
            fecha_cambio,
            dias,
            crecimiento_radicular,
            kc,
            capacidad_extraccion,
            lluvia_efectiva,
            agua_util_diaria,
            estrato_alcanzado,
            evapotranspiracion,
            temperatura,
            humedad,
            precipitaciones,
            etc
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (lote_id, fecha_cambio)
        DO UPDATE SET
            dias = EXCLUDED.dias,
            crecimiento_radicular = EXCLUDED.crecimiento_radicular,
            kc = EXCLUDED.kc,
            capacidad_extraccion = EXCLUDED.capacidad_extraccion,
            lluvia_efectiva = EXCLUDED.lluvia_efectiva,
            agua_util_diaria = EXCLUDED.agua_util_diaria,
            estrato_alcanzado = EXCLUDED.estrato_alcanzado,
            evapotranspiracion = COALESCE(EXCLUDED.evapotranspiracion, cambios_diarios.evapotranspiracion),
            temperatura = COALESCE(EXCLUDED.temperatura, cambios_diarios.temperatura),
            humedad = COALESCE(EXCLUDED.humedad, cambios_diarios.humedad),
            precipitaciones = COALESCE(EXCLUDED.precipitaciones, cambios_diarios.precipitaciones),
            etc = COALESCE(EXCLUDED.etc, cambios_diarios.etc)
    `;

    try {
        await client.query(query, valoresParaInsertar);
    } catch (error) {
        console.error('Error en actualizarCambioDiario:');
        console.error('Query:', query);
        console.error('Valores:', valoresParaInsertar);
        throw error;
    }
}

module.exports = actualizacionDiaria;