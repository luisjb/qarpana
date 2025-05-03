const pool = require('../db');


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

        // Obtener todos los lotes activos
        const lotesResult = await client.query('SELECT id, cultivo_id, fecha_siembra FROM lotes WHERE activo = true');
        
        const hoy = new Date();

        for (const lote of lotesResult.rows) {
            try {

                // Verificar si ya se alcanzó el máximo de días para este lote
                const { rows: [maxDays] } = await client.query(`
                    SELECT MAX(GREATEST(indice_dias, COALESCE(dias_correccion, 0))) as max_dias
                    FROM coeficiente_cultivo cc
                    WHERE cc.cultivo_id = $1
                `, [lote.cultivo_id]);
                
                const maxDiasSimulacion = maxDays.max_dias || 150; // Valor por defecto si no se encuentra el cultivo

                const fechaSiembra = new Date(lote.fecha_siembra);
                const diasDesdeSiembra = Math.floor((hoy - fechaSiembra) / (1000 * 60 * 60 * 24));

                // Si ya se alcanzó o superó el máximo de días, saltamos este lote
                if (diasDesdeSiembra > maxDiasSimulacion) {
                    console.log(`Lote ${lote.id} ha alcanzado el máximo de días (${maxDiasSimulacion}). Días actuales: ${diasDesdeSiembra}`);
                    continue;
                }
                
                // Obtener o crear el registro de cambios_diarios para hoy
                let cambioDiario = await obtenerOCrearCambioDiario(client, lote.id, hoy, diasDesdeSiembra);

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

                // Actualizar KC
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

                console.log('Lluvia efectiva calculada:', {
                    loteId: lote.id,
                    fecha: hoy,
                    precipitaciones: cambioDiario.precipitaciones,
                    lluviaEfectiva: cambioDiario.lluvia_efectiva
                });
                
            } catch (error) {
                console.error(`Error procesando lote ${lote.id}:`, error);
                throw error;
            }
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Error en la actualización diaria:', e);
        throw e;
    } finally {
        client.release();
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
        return { lote_id: loteId, fecha_cambio: fecha, dias: dias };
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
    const coeficientesResult = await client.query(
        'SELECT indice_kc, indice_dias, COALESCE(dias_correccion, indice_dias) as dias_efectivos FROM coeficiente_cultivo WHERE cultivo_id = $1 ORDER BY dias_efectivos',
        [lote.cultivo_id]
    );
    const coeficientes = coeficientesResult.rows;

    let puntoAnterior = coeficientes[0];
    let puntoSiguiente = coeficientes[coeficientes.length - 1];

    for (let i = 0; i < coeficientes.length - 1; i++) {
        if (diasDesdeSiembra >= coeficientes[i].dias_efectivos && diasDesdeSiembra < coeficientes[i+1].dias_efectivos) {
            puntoAnterior = coeficientes[i];
            puntoSiguiente = coeficientes[i+1];
            break;
        }
    }

    const m = (puntoSiguiente.indice_kc - puntoAnterior.indice_kc) / (puntoSiguiente.dias_efectivos - puntoAnterior.dias_efectivos);
    const b = puntoAnterior.indice_kc - m * puntoAnterior.dias_efectivos;

    const kc = m * diasDesdeSiembra + b;

    cambioDiario.kc = kc;
    return cambioDiario;
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

    const evapotranspiracionKC = cambioDiario.evapotranspiracion * cambioDiario.kc;

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
        estrato_alcanzado
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
        sanitizeNumeric(estrato_alcanzado)
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
            estrato_alcanzado
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (lote_id, fecha_cambio)
        DO UPDATE SET
            dias = EXCLUDED.dias,
            crecimiento_radicular = EXCLUDED.crecimiento_radicular,
            kc = EXCLUDED.kc,
            capacidad_extraccion = EXCLUDED.capacidad_extraccion,
            lluvia_efectiva = EXCLUDED.lluvia_efectiva,
            agua_util_diaria = EXCLUDED.agua_util_diaria,
            estrato_alcanzado = EXCLUDED.estrato_alcanzado
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