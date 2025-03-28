const pool = require('../db');

exports.getSimulationData = async (req, res) => {
    const { loteId } = req.params;
    const { campaña } = req.query;

    try {
        const { rows: [maxDays] } = await pool.query(`
            SELECT MAX(GREATEST(indice_dias, COALESCE(dias_correccion, 0))) as max_dias
            FROM coeficiente_cultivo cc
            JOIN lotes l ON l.cultivo_id = cc.cultivo_id
            WHERE l.id = $1
        `, [loteId]);
        
        const maxDiasSimulacion = maxDays.max_dias;

        
        const result = await pool.query(`
            SELECT l.*, c.nombre_cultivo, c.indice_crecimiento_radicular, c.indice_capacidad_extraccion,
                    cd.fecha_cambio, cd.precipitaciones, cd.riego_cantidad, cd.evapotranspiracion,
                    cd.agua_util_diaria, cd.lluvia_efectiva, cd.kc, cd.dias, cd.crecimiento_radicular,
                    l.porcentaje_agua_util_umbral, l.agua_util_total, l.capacidad_almacenamiento_2m, l.fecha_siembra,
                    (SELECT array_agg(valor ORDER BY estratos) 
                        FROM agua_util_inicial 
                        WHERE lote_id = l.id) as valores_estratos,
                    l.utilizar_un_metro
                FROM lotes l
                JOIN cultivos c ON l.cultivo_id = c.id
                LEFT JOIN cambios_diarios cd ON l.id = cd.lote_id
                WHERE l.id = $1
                ${campaña ? 'AND l.campaña = $2' : ''}
                AND (cd.fecha_cambio >= l.fecha_siembra OR cd.fecha_cambio IS NULL)
                ORDER BY cd.fecha_cambio`, 
            campaña ? [loteId, campaña] : [loteId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lote no encontrado o sin datos' });
        }

        const lote = result.rows[0];
        const cambios = result.rows;

        const cambiosFiltrados = cambios.filter(cambio => {
            return cambio.dias <= maxDiasSimulacion;
        });

        // Función auxiliar para sumar valores numéricos con manejo de nulos
        const sumarValores = (array, propiedad) => {
            return array.reduce((sum, item) => {
                const valor = parseFloat(item[propiedad]);
                if (!isNaN(valor)) {
                    return sum + valor;
                }
                return sum;
            }, 0);
        };

        const aguaUtilTotal = lote.valores_estratos 
        ? lote.valores_estratos.reduce((sum, valor) => sum + parseFloat(valor), 0)
        : 0;
    
        // Calcular agua útil inicial a 1m y 2m
        const auInicial1m = lote.valores_estratos 
            ? lote.valores_estratos.slice(0, 5).reduce((sum, valor) => sum + parseFloat(valor), 0)
            : 0;
        const auInicial2m = aguaUtilTotal;

        console.log('agua util total:', aguaUtilTotal);
        console.log('agua util inicial 1m:', auInicial1m);
        console.log('agua util inicial 2m:', auInicial2m);

        // Calcular acumulados
        let lluviasEfectivasAcumuladas = 0;
        let riegoAcumulado = 0;

        // Calcular las sumas solo si hay cambios diarios
        if (cambios && cambios.length > 0) {
            lluviasEfectivasAcumuladas = sumarValores(cambios, 'lluvia_efectiva');
            riegoAcumulado = sumarValores(cambios, 'riego_cantidad');
        }

       
         // Cálculos 
        const fechas = cambios.map(c => c.fecha_cambio);
        const lluvias = cambios.map(c => c.precipitaciones || 0);
        const riego = cambios.map(c => c.riego_cantidad || 0);
        const aguaUtil = cambios.map(c => c.agua_util_diaria || 0);
        const aguaUtil50 = aguaUtil.map(au => au * 0.5);

        const lluviasEficientesAcumuladas = cambios.reduce((sum, c) => sum + (c.lluvia_efectiva || 0), 0);

        // Obtener estado fenológico actual
        const diasDesdeSiembra = Math.floor(
            (new Date() - new Date(lote.fecha_siembra)) / (1000 * 60 * 60 * 24)
        );

        const { rows: pronosticos } = await pool.query(`
            SELECT fecha_pronostico, agua_util_diaria
            FROM pronostico 
            WHERE lote_id = $1 
            AND fecha_pronostico > $2
            ORDER BY fecha_pronostico ASC 
            LIMIT 8
        `, [loteId, cambios[cambios.length - 1]?.fecha_cambio || new Date()]);

        
        const estadoFenologico = await getEstadoFenologico(loteId, diasDesdeSiembra);

        console.log('Días desde siembra:', diasDesdeSiembra);
        console.log('Estados fenológicos:', estadoFenologico);

        // Obtener todos los estados fenológicos
        const estadosFenologicos = await getEstadosFenologicos(loteId);

        

        const ensureNumber = (value) => {
            const num = Number(value);
            return isNaN(num) ? null : num;
        };

        // Función para calcular el agua útil acumulada por estratos
        const calcularAguaUtilPorEstratos = (dia, valoresEstratos, aguaUtilTotal, porcentajeUmbral, 
            indice_crecimiento_radicular, evapotranspiracion, etc, lluvia_efectiva, riego_cantidad, 
            aguaUtilAnterior, estratoAnterior, indice_capacidad_extraccion, kc, utilizarUnMetro, aguaUtil1mAnterior, aguaUtil2mAnterior, esPrimerDia) => {

            const estratoAnteriorCorregido = estratoAnterior === 0 || estratoAnterior === undefined || estratoAnterior === null ? 1 : estratoAnterior;


            if (!valoresEstratos || !dia) {
                return {
                    aguaUtilDiaria:  aguaUtilAnterior || 17,
                    aguaUtilUmbral: 0,
                    estratosDisponibles: estratoAnteriorCorregido,
                    porcentajeAguaUtil: 0,
                    profundidadRaices: 0,
                    aguaUtil1m: aguaUtil1mAnterior || 17,
                    aguaUtil2m: aguaUtil2mAnterior || 17
                };
            }
            
            const numEstratos = utilizarUnMetro ? Math.min(valoresEstratos.length, 5) : valoresEstratos.length;
            const PROFUNDIDAD_POR_ESTRATO = 20; // 20 cm por estrato
            const DIAS_SIN_CRECIMIENTO = 6; // Días iniciales sin crecimiento radicular

            const crecimientoRadicular = parseFloat(indice_crecimiento_radicular);
            const crecimientoValido = !isNaN(crecimientoRadicular) && crecimientoRadicular > 0 
            ? crecimientoRadicular 
            : 0.1; // Valor por defecto

            
            // Calculamos la profundidad alcanzada por las raíces usando el índice específico del cultivo
            const diasEfectivos = dia <= DIAS_SIN_CRECIMIENTO ? 0 : dia - DIAS_SIN_CRECIMIENTO;
            const profundidadRaices = Math.min(
                diasEfectivos * parseFloat(indice_crecimiento_radicular),
                numEstratos * PROFUNDIDAD_POR_ESTRATO // máximo total
            );
            
            // Calculamos cuántos estratos están disponibles (cambio cada PROFUNDIDAD_POR_ESTRATO cm)
            const estratosDisponibles = Math.max(1, Math.min(
                Math.floor(profundidadRaices / PROFUNDIDAD_POR_ESTRATO) + 1,
                numEstratos
            ));
        
            // Aseguramos que no haya saltos de más de un estrato por vez
            const estratosDisponiblesFinales = Math.max(
                estratosDisponibles,
                estratoAnteriorCorregido
            );
            
            // Valor por estrato (agua útil total dividida por número de estratos)
            const valorPorEstrato = parseFloat(aguaUtilTotal) / numEstratos;

            const etcCalculado = Math.max(0, (parseFloat(evapotranspiracion || 0) * parseFloat(kc || 0)) || 0);
            
            const aguaUtilAnteriorValor = aguaUtilAnterior === 0 ? valorPorEstrato * 0.1 : aguaUtilAnterior;


            // Calculamos la capacidad de extracción como porcentaje del agua útil anterior
            const capacidadExtraccion = Math.max(
                0.8, // Valor mínimo para evitar quedar atrapado en 0
                aguaUtilAnteriorValor ? 
                    (parseFloat(aguaUtilAnteriorValor) * parseFloat(indice_capacidad_extraccion)) / 100 : 0.8
            );
        

            // Aplicamos los cambios diarios
            const etr = Math.min(
                etcCalculado,
                capacidadExtraccion
            );
            const gananciaAgua = parseFloat(lluvia_efectiva || 0) + parseFloat(riego_cantidad || 0);
            
            // Calculamos el agua útil diaria
            let aguaUtilDiaria;
            console.log('------------------- aguaUtilAnterior:', aguaUtilAnterior);
            if (aguaUtilAnterior === undefined) {
                // Primer día: consideramos el primer estrato
                aguaUtilDiaria = parseFloat(valoresEstratos[0]) - etr + gananciaAgua;
                console.log('------------------- primer dia aguaUtilDiaria--------------------:', aguaUtilDiaria);
            } else {
                // Días subsiguientes: siempre sumamos el agua útil anterior
                aguaUtilDiaria = aguaUtilAnterior;
                console.log('------------------- aguaUtilDiaria anterior:', aguaUtilDiaria);
                
                if (estratosDisponiblesFinales > estratoAnteriorCorregido) {
                    // Si alcanzamos un nuevo estrato, sumamos su valor
                    for (let i = estratoAnteriorCorregido; i < estratosDisponiblesFinales; i++) {
                        if (i < valoresEstratos.length) {
                            aguaUtilDiaria += parseFloat(valoresEstratos[i] || 0);
                        }
                    }
                }
                
                // Aplicamos pérdidas y ganancias
                aguaUtilDiaria = aguaUtilDiaria - etr + gananciaAgua;
            }
        
            aguaUtilDiaria = Math.max(0, aguaUtilDiaria);
        
            //aguaUtilDiaria = Math.min(aguaUtilDiaria, aguaUtilMaximaActual);
            
            // Calculamos el agua útil máxima disponible actual
            const aguaUtilMaximaActual = valorPorEstrato * estratosDisponiblesFinales;

            const aguaUtilDisponibleActual = valoresEstratos
            .slice(0, estratosDisponiblesFinales)
            .reduce((sum, valor) => sum + parseFloat(valor), 0);            
            
            // Calculamos el porcentaje de agua útil
            const porcentajeAguaUtil = aguaUtilMaximaActual > 0 ? 
                (aguaUtilDiaria / aguaUtilMaximaActual) * 100 : 1;
                
            // Calculamos el agua útil umbral
            const aguaUtilUmbral = aguaUtilMaximaActual * (porcentajeUmbral / 100);

            // Usamos los valores iniciales que ya hemos calculado
            const valorAuInicial1m = auInicial1m;
            const valorAuInicial2m = auInicial2m;

            console.log('valorAuInicial1m:', valorAuInicial1m);
            console.log('valorAuInicial2m:', valorAuInicial2m);

            let aguaUtil1m, aguaUtil2m;
            console.log('aguaUtil1mAnterior:', aguaUtil1mAnterior);
            console.log(esPrimerDia);

            const esPrimerDiaReal = esPrimerDia || (dia && parseInt(dia) === 1);

            console.log('esPrimerDiaReal:', esPrimerDiaReal);
            // Calcular agua útil a 1m y 2m
            if (esPrimerDiaReal) {
                // First day calculation - use initial values
                aguaUtil1m = Math.max(0, valorAuInicial1m - etr + gananciaAgua);
                aguaUtil2m = Math.max(0, valorAuInicial2m - etr + gananciaAgua);
                console.log('------------------- primer dia aguaUtil1m-----------------:', aguaUtil1m);
                console.log('------------------- primer dia aguaUtil2m-----------------:', aguaUtil2m);
            } else {
                // Subsequent days - start with previous day's values
                // Si el valor anterior es 0 o muy bajo, usamos un valor mínimo
                const valorBase1m = aguaUtil1mAnterior <= 0 ? valorAuInicial1m * 0.1 : aguaUtil1mAnterior;
                const valorBase2m = aguaUtil2mAnterior <= 0 ? valorAuInicial2m * 0.1 : aguaUtil2mAnterior;
                console.log('------------------- aguaUtil1mAnterior:', aguaUtil1mAnterior);
                console.log('------------------- aguaUtil2mAnterior:', aguaUtil2mAnterior);
                console.log('------------------- valorBase1m:', valorBase1m);
                console.log('------------------- valorBase2m:', valorBase2m);
                
                aguaUtil1m = Math.max(0, valorBase1m - etr + gananciaAgua);
                aguaUtil2m = Math.max(0, valorBase2m - etr + gananciaAgua);

                console.log('------------------- aguaUtil1m:', aguaUtil1m);
                console.log('------------------- aguaUtil2m:', aguaUtil2m);
            }
            
            
            return {
                aguaUtilDiaria,
                aguaUtilUmbral,
                estratosDisponibles: estratosDisponiblesFinales,
                porcentajeAguaUtil,
                profundidadRaices,
                aguaUtil1m,
                aguaUtil2m
            };
        };


        // Procesamos los datos día a día
        let datosSimulacion = [];
        cambiosFiltrados.forEach((cambio, index) => {
        
            const resultados = calcularAguaUtilPorEstratos(
                cambio.dias,
                lote.valores_estratos,
                lote.utilizar_un_metro ? lote.agua_util_total : lote.capacidad_almacenamiento_2m,
                lote.porcentaje_agua_util_umbral,
                lote.indice_crecimiento_radicular,
                cambio.evapotranspiracion,
                cambio.etc,
                cambio.lluvia_efectiva,
                cambio.riego_cantidad,
                index > 0 ? datosSimulacion[index - 1]?.aguaUtilDiaria : undefined,
                index > 0 ? datosSimulacion[index - 1]?.estratosDisponibles : undefined,
                lote.indice_capacidad_extraccion, 
                cambio.kc,
                lote.utilizar_un_metro,
                index > 0 ? datosSimulacion[index - 1]?.aguaUtil1m : undefined,
                index > 0 ? datosSimulacion[index - 1]?.aguaUtil2m : undefined,
                index === 0 //  parámetro: true si es el primer día, false en caso contrario
            );

            datosSimulacion.push({
                fecha: cambio.fecha_cambio,
                ...resultados,
                diasDesdeSiembra: cambio.dias
            });
        });
        
        const ultimoDato = datosSimulacion.length > 0 ? datosSimulacion[datosSimulacion.length - 1] : { aguaUtilDiaria: 0, aguaUtil1m: 0, aguaUtil2m: 0 };




        const ultimaAguaUtil = datosSimulacion[datosSimulacion.length - 1]?.aguaUtilDiaria || 0;
        // Obtener también los últimos valores de 1m y 2m
        const ultimaAguaUtil1m = datosSimulacion[datosSimulacion.length - 1]?.aguaUtil1m || 0;
        const ultimaAguaUtil2m = datosSimulacion[datosSimulacion.length - 1]?.aguaUtil2m || 0;
        const proyeccion = await calcularProyeccionAU(loteId, ultimaAguaUtil, ultimaAguaUtil1m, ultimaAguaUtil2m);
        const ultimoDiaHistorico = cambios[cambios.length - 1]?.dias || 0;
        proyeccion.proyeccionCompleta = proyeccion.proyeccionCompleta.filter((p, index) => {
            const diasTotales = ultimoDiaHistorico + index + 1;
            return diasTotales <= maxDiasSimulacion;
        });

        const simulationData = {
            fechas: cambios.map(c => c.fecha_cambio) || [],
            lluvias: cambios.map(c => c.precipitaciones || 0) || [],
            riego: cambios.map(c => c.riego_cantidad || 0) || [],
            // Usar los datos calculados en vez de los valores de la base de datos
            aguaUtil: datosSimulacion.map(d => d.aguaUtilDiaria || 0) || [],
            estadoFenologico: await getEstadoFenologico(loteId, diasDesdeSiembra),
            estadosFenologicos: await getEstadosFenologicos(loteId),
            fechaSiembra: lote.fecha_siembra,
            auInicial1m: auInicial1m,
            auInicial2m: auInicial2m,
            agua_util_total: parseFloat(lote.agua_util_total || 0),
            capacidad_almacenamiento_2m: parseFloat(lote.capacidad_almacenamiento_2m || 0),
            lluviasEfectivasAcumuladas: cambios.reduce((sum, c) => sum + (parseFloat(c.lluvia_efectiva) || 0), 0),
            riegoAcumulado: cambios.reduce((sum, c) => sum + (parseFloat(c.riego_cantidad) || 0), 0),
            cultivo: lote.nombre_cultivo,
            variedad: lote.variedad,
            porcentajeAguaUtilUmbral: parseFloat(lote.porcentaje_agua_util_umbral || 0),
            // Usar el último valor calculado para el porcentaje
            porcentajeAguaUtil: datosSimulacion.length > 0 ? 
                datosSimulacion[datosSimulacion.length - 1].porcentajeAguaUtil : 0,
            valores_estratos: lote.valores_estratos,
            estratosDisponibles: datosSimulacion.map(d => d.estratosDisponibles),
            fechasProyeccion: (proyeccion.proyeccionCompleta || []).map(p => p.fecha),
            aguaUtilProyectada: (() => {
                const ultimoValorReal = datosSimulacion[datosSimulacion.length - 1]?.aguaUtilDiaria || 0;
                return proyeccion.proyeccionCompleta.map(p => p.agua_util_diaria)
            })(),
            proyeccionAU10Dias: proyeccion.aguaUtilDia8 || 0,
            proyeccionAU1mDia8: proyeccion.aguaUtil1mDia8 || 0,  // New property
            proyeccionAU2mDia8: proyeccion.aguaUtil2mDia8 || 0,  // New property
            porcentajeProyectado: proyeccion.porcentajeProyectado,
            porcentajeProyectado2m: proyeccion.porcentajeProyectado2m,
            fechaActualizacion: new Date().toISOString().split('T')[0],

            // Para el widget de proyección
            porcentajeProyectado: proyeccion.porcentajeProyectado,
            aguaUtilUmbral: (() => {
                const porcentajeUmbral = parseFloat(lote.porcentaje_agua_util_umbral) / 100;
                const numEstratos = lote.utilizar_un_metro ? Math.min(lote.valores_estratos.length, 5) : lote.valores_estratos.length;
                const valorPorEstrato = parseFloat(lote.utilizar_un_metro ? lote.agua_util_total : lote.capacidad_almacenamiento_2m) / numEstratos;
                
                // Calculamos umbrales históricos
                const umbralesHistoricos = datosSimulacion.map(d => {
                    const aguaUtilMaximaActual = valorPorEstrato * d.estratosDisponibles;
                    return aguaUtilMaximaActual * porcentajeUmbral;
                });
            
                // Obtenemos el último estrato histórico
                const ultimoEstratoHistorico = datosSimulacion[datosSimulacion.length - 1]?.estratosDisponibles || 1;
                
                // Para la proyección, usamos un array temporal y forEach en lugar de map
                const umbralesProyectados = [];
                let valorAnterior = umbralesHistoricos[umbralesHistoricos.length - 1];
                
                proyeccion.proyeccionCompleta.forEach((p, index) => {
                    if (index === 0) {
                        // Para el primer día, usamos el último valor histórico
                        umbralesProyectados.push(valorAnterior);
                        return;
                    }
                    
                    const estratoAnterior = proyeccion.proyeccionCompleta[index - 1].estratos_disponibles;
                    
                    // Si hay cambio de estrato, calculamos nuevo valor
                    if (p.estratos_disponibles > estratoAnterior) {
                        valorAnterior = (valorPorEstrato * p.estratos_disponibles) * porcentajeUmbral;
                    }
                    
                    umbralesProyectados.push(valorAnterior);
                });
            
                return [...umbralesHistoricos, ...umbralesProyectados];
            })(),
            etc: [
                // Para datos históricos
                ...cambios.map(c => {
                    const etcValor = parseFloat(c.evapotranspiracion || 0) * parseFloat(c.kc || 0);
                    return etcValor;
                }),
                // Para proyección
                ...proyeccion.proyeccionCompleta.map(p => {
                    const etcValor = parseFloat(p.evapotranspiracion || 0) * parseFloat(p.kc || 0);
                    return etcValor;
                })
            ],
            capacidadExtraccion: [
                // Para datos históricos
                ...datosSimulacion.map((d, index) => {
                    const aguaUtilAnterior = index === 0 ? d.aguaUtilDiaria : datosSimulacion[index - 1].aguaUtilDiaria;
                    return (aguaUtilAnterior * parseFloat(lote.indice_capacidad_extraccion)) / 100;
                }),
                // Para proyección
                ...proyeccion.proyeccionCompleta.map((p, index) => {
                    const aguaUtilAnterior = index === 0 ? 
                        datosSimulacion[datosSimulacion.length - 1].aguaUtilDiaria : 
                        proyeccion.proyeccionCompleta[index - 1].agua_util_diaria;
                    return (aguaUtilAnterior * parseFloat(lote.indice_capacidad_extraccion)) / 100;
                })
            ],
            kc: [
                ...cambios.map(c => c.kc || 0),
                ...proyeccion.proyeccionCompleta.map(p => p.kc || 0)
            ],
            evapotranspiracion: [
                ...cambios.map(c => c.evapotranspiracion || 0),
                ...proyeccion.proyeccionCompleta.map(p => p.evapotranspiracion || 0)
            ],
            lluviasEfectivas: [
                ...cambios.map(c => c.lluvia_efectiva || 0),
                ...proyeccion.proyeccionCompleta.map(p => p.lluvia_efectiva || 0)
            ],
            aguaUtil1m: datosSimulacion.map(d => d.aguaUtil1m || 0),
            aguaUtil2m: datosSimulacion.map(d => d.aguaUtil2m || 0),
            porcentajeAu1m: parseFloat(lote.agua_util_total) > 0 ? (ultimoDato.aguaUtil1m / parseFloat(lote.agua_util_total)) * 100 : 0,
            porcentajeAu2m: parseFloat(lote.capacidad_almacenamiento_2m) > 0 ? (ultimoDato.aguaUtil2m / parseFloat(lote.capacidad_almacenamiento_2m)) * 100 : 0
        };

        // También vamos a agregar un console.log para verificar los valores
        console.log('ETC valores:', simulationData.etc.slice(0, 5)); // Ver primeros 5 valores
        console.log('Evapotranspiracion valores:', simulationData.evapotranspiracion.slice(0, 5));

        console.log('Datos de simulación enviados:', {
            ultimoCambio: {
                fecha: cambios[cambios.length - 1]?.fecha_cambio,
                aguaUtil: cambios[cambios.length - 1]?.agua_util_diaria
            },
            proyeccion: {
                fechas: simulationData.fechasProyeccion,
                valores: simulationData.aguaUtilProyectada,
                dia8: simulationData.proyeccionAU10Dias
            }
        });

        res.json(simulationData);
    } catch (error) {
        console.error('Error al obtener datos de simulación:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
};


async function getEstadoFenologico(loteId, diasDesdeSiembra) {
    try {
        console.log('Calculando estado fenológico para lote:', loteId, 'días:', diasDesdeSiembra);
        
        // Primero verificamos si hay estados fenológicos para este lote
        const { rows: [count] } = await pool.query(
            'SELECT COUNT(*) FROM estado_fenologico WHERE lote_id = $1',
            [loteId]
        );
        
        if (count.count === '0') {
            console.log('No hay estados fenológicos registrados para el lote:', loteId);
            // Aquí podrías insertar estados fenológicos por defecto si lo deseas
            await insertarEstadosFenologicosDefault(loteId);
        }

        const result = await pool.query(`
            SELECT ef.fenologia, ef.dias
            FROM estado_fenologico ef
            WHERE ef.lote_id = $1 
            ORDER BY ef.dias ASC`,
            [loteId]
        );

        // Si no hay estados fenológicos después de intentar insertar los default
        if (result.rows.length === 0) {
            return 'Desconocido';
        }

        // Encontrar el estado fenológico correspondiente a los días actuales
        let estadoActual = result.rows[0].fenologia; // Estado inicial por defecto
        for (const estado of result.rows) {
            if (diasDesdeSiembra <= estado.dias) {
                estadoActual = estado.fenologia;
                break;
            }
        }

        console.log('Estado fenológico encontrado para días', diasDesdeSiembra, ':', estadoActual);
        return estadoActual;

    } catch (error) {
        console.error('Error en getEstadoFenologico:', error);
        return 'Desconocido';
    }
}

const calcularUmbralPorEstrato = (valores_estratos, estrato, porcentajeUmbral) => {
    const aguaUtilTotal = valores_estratos
        .slice(0, estrato)
        .reduce((sum, valor) => parseFloat(sum) + parseFloat(valor), 0);
    return (aguaUtilTotal * porcentajeUmbral) / 100;
};

async function insertarEstadosFenologicosDefault(loteId) {
    try {
        // Obtener información del cultivo
        const { rows: [lote] } = await pool.query(`
            SELECT l.cultivo_id, c.nombre_cultivo 
            FROM lotes l 
            JOIN cultivos c ON l.cultivo_id = c.id 
            WHERE l.id = $1`, 
            [loteId]
        );

        if (!lote) return;

        // Estados fenológicos por defecto para soja (ajusta según tus necesidades)
        const estadosDefault = lote.nombre_cultivo.toLowerCase() === 'soja' ? [
            { fenologia: 'Siembra', dias: 0 },
            { fenologia: 'Vegetativo', dias: 20 },
            { fenologia: 'Floración', dias: 45 },
            { fenologia: 'Llenado', dias: 75 },
            { fenologia: 'Madurez', dias: 120 }
        ] : [
            { fenologia: 'Siembra', dias: 0 },
            { fenologia: 'Vegetativo', dias: 30 },
            { fenologia: 'Desarrollo', dias: 60 },
            { fenologia: 'Madurez', dias: 90 }
        ];

        // Insertar estados fenológicos por defecto
        for (const estado of estadosDefault) {
            await pool.query(
                'INSERT INTO estado_fenologico (lote_id, fenologia, dias) VALUES ($1, $2, $3)',
                [loteId, estado.fenologia, estado.dias]
            );
        }

        console.log('Estados fenológicos por defecto insertados para lote:', loteId);
    } catch (error) {
        console.error('Error al insertar estados fenológicos por defecto:', error);
    }
}

async function getEstadosFenologicos(loteId) {
    try {
        const result = await pool.query(
            'SELECT fenologia, dias FROM estado_fenologico WHERE lote_id = $1 ORDER BY dias',
            [loteId]
        );
        return result.rows;
    } catch (error) {
        console.error('Error al obtener estados fenológicos:', error);
        return [];
    }
}

async function obtenerAguaUtilInicial(loteId) {
    try {
        const result = await pool.query(
            'SELECT SUM(valor) as agua_util_total FROM agua_util_inicial WHERE lote_id = $1',
            [loteId]
        );
        return result.rows[0]?.agua_util_total || 0;
    } catch (error) {
        console.error('Error al obtener agua útil inicial:', error);
        return 0;
    }
}

function calcularPorcentajeAguaUtil(aguaUtilActual, aguaUtilTotal) {
    return aguaUtilTotal > 0 ? Math.round((aguaUtilActual / aguaUtilTotal) * 100) : 0;
}

async function calcularProyeccionAU(loteId, aguaUtilInicial, aguaUtil1mInicial, aguaUtil2mInicial) {
    try {
        // Obtener datos del lote y último cambio diario
        const { rows: [ultimoCambio] } = await pool.query(`
            SELECT cd.*, l.agua_util_total, l.porcentaje_agua_util_umbral,
                   l.fecha_siembra, c.indice_crecimiento_radicular, c.indice_capacidad_extraccion,
                   cd.dias as ultimo_dia,
                   l.capacidad_almacenamiento_2m, l.utilizar_un_metro,
                   (SELECT array_agg(valor ORDER BY estratos) 
                    FROM agua_util_inicial 
                    WHERE lote_id = l.id) as valores_estratos
            FROM cambios_diarios cd
            JOIN lotes l ON cd.lote_id = l.id
            JOIN cultivos c ON l.cultivo_id = c.id
            WHERE cd.lote_id = $1 
            ORDER BY cd.fecha_cambio DESC
            LIMIT 1
        `, [loteId]);
 
        // Si no hay datos, retornar valores por defecto
        if (!ultimoCambio) {
            console.log(`No hay datos de cambios diarios para el lote ${loteId}`);
            return { 
                proyeccionCompleta: [], 
                aguaUtilDia8: 0, 
                aguaUtil1mDia8: 0,
                aguaUtil2mDia8: 0,
                porcentajeProyectado: 0,
                porcentajeProyectado2m: 0
            };
        }

        // Obtener datos de simulación para proporciones entre 1m y 2m
        const simulationData = await getLastSimulationData(loteId);
        
        // Parsear valor inicial principal
        const aguaUtilAnterior = parseFloat(aguaUtilInicial) || 0;
        
        // Determinar las capacidades totales
        const capacidad1m = parseFloat(ultimoCambio.agua_util_total || 0);
        const capacidad2m = parseFloat(ultimoCambio.capacidad_almacenamiento_2m || 0);
        
        // MODIFICACIÓN: Usar exactamente los valores de simulationData
        // Si no existe simulationData, usar aguaUtilInicial para todos
        let aguaUtil1mAnterior = parseFloat(aguaUtil1mInicial) || 0;
        let aguaUtil2mAnterior = parseFloat(aguaUtil2mInicial) || 0;
        
        
        // Días desde la siembra y datos de crecimiento
        let diasAcumulados = parseInt(ultimoCambio.ultimo_dia) || 0;
        const indiceCrecimientoRadicular = parseFloat(ultimoCambio.indice_crecimiento_radicular) || 0.1;
        const estratosAlcanzados = ultimoCambio.estrato_alcanzado || 1;
 
        // Obtener datos de pronóstico
        const { rows: pronosticos } = await pool.query(`
            SELECT 
                fecha_pronostico,
                prono_dias,
                precipitaciones,
                evapotranspiracion,
                etc,
                lluvia_efectiva
            FROM pronostico 
            WHERE lote_id = $1 
            AND fecha_pronostico > $2
            ORDER BY fecha_pronostico ASC 
            LIMIT 7
        `, [loteId, ultimoCambio.fecha_cambio]);
        
        // Si no hay pronósticos, retornar valores iniciales
        if (pronosticos.length === 0) {
            console.log(`No hay pronósticos disponibles para el lote ${loteId}`);
            return {
                proyeccionCompleta: [],
                aguaUtilDia8: aguaUtilAnterior,
                aguaUtil1mDia8: aguaUtil1mAnterior,
                aguaUtil2mDia8: aguaUtil2mAnterior,
                porcentajeProyectado: (aguaUtil1mAnterior / capacidad1m) * 100,
                porcentajeProyectado2m: (aguaUtil2mAnterior / capacidad2m) * 100
            };
        }
 
        // Preparar valores para la proyección
        const aguaUtilTotal1m = capacidad1m || 100; // Valor por defecto: 100mm
        const aguaUtilTotal2m = capacidad2m || 200; // Valor por defecto: 200mm
        
        // Logging para depuración
        console.log('Valores iniciales para proyección (valores exactos):', {
            loteId,
            aguaUtilInicial,
            aguaUtil1mAnterior,
            aguaUtil2mAnterior,
            capacidad1m,
            capacidad2m
        });
        
        // Función auxiliar para calcular estrato basado en profundidad
        const calcularEstrato = (profundidadRaiz) => {
            return Math.min(
                Math.floor(profundidadRaiz / 20) + 1,
                ultimoCambio.valores_estratos ? ultimoCambio.valores_estratos.length : 10
            );
        };
        
        // Variables para tracking de valores
        let aguaUtilZonaRadicular = aguaUtilAnterior;
        let aguaUtil1m = aguaUtil1mAnterior;
        let aguaUtil2m = aguaUtil2mAnterior;
        
        // Array para almacenar proyección completa
        let proyeccionCompleta = [];
 
        // Calcular proyección para cada día del pronóstico
        for (const pronostico of pronosticos) {
            diasAcumulados++;
            
            // Calcular profundidad de raíces y estratos disponibles
            const profundidadRaiz = diasAcumulados * indiceCrecimientoRadicular;
            const nuevoEstrato = calcularEstrato(profundidadRaiz);

            // Calcular capacidad de extracción basada en el agua útil actual
            const capacidadExtraccion = (aguaUtilZonaRadicular * parseFloat(ultimoCambio.indice_capacidad_extraccion || 5)) / 100;
            
            // Calcular evapotranspiración real y ganancia de agua
            const etc = parseFloat(pronostico.etc || 0);
            const etr = Math.min(etc, capacidadExtraccion);
            const gananciaAgua = parseFloat(pronostico.lluvia_efectiva || 0);
            
            // Logging para depuración
            console.log('Ganancia de agua:', gananciaAgua, 'ETR:', etr, 
                'Agua útil anterior:', aguaUtilZonaRadicular, 
                'Agua útil 1m anterior:', aguaUtil1m, 
                'Agua útil 2m anterior:', aguaUtil2m);
 
            // Actualizar valores para cada profundidad usando la misma fórmula
            // pero con sus propios valores iniciales
            aguaUtilZonaRadicular = Math.max(0, aguaUtilZonaRadicular - etr + gananciaAgua);
            aguaUtil1m = Math.max(0, aguaUtil1m - etr + gananciaAgua);
            aguaUtil2m = Math.max(0, aguaUtil2m - etr + gananciaAgua);
            
            // Calcular porcentajes con los denominadores correctos
            const porcentajeAguaUtil = aguaUtilTotal1m > 0 ? (aguaUtil1m / aguaUtilTotal1m) * 100 : 0;
            const porcentajeAguaUtil2m = aguaUtilTotal2m > 0 ? (aguaUtil2m / aguaUtilTotal2m) * 100 : 0;
            
            // Calcular agua útil máxima actual si se tienen valores de estratos
            let aguaUtilMaximaActual = 0;
            if (ultimoCambio.valores_estratos && Array.isArray(ultimoCambio.valores_estratos)) {
                aguaUtilMaximaActual = ultimoCambio.valores_estratos
                    .slice(0, estratosAlcanzados)
                    .reduce((sum, valor) => sum + parseFloat(valor || 0), 0);
            }
            
            // Añadir día a la proyección completa
            proyeccionCompleta.push({
                fecha: pronostico.fecha_pronostico,
                agua_util_diaria: aguaUtilZonaRadicular,
                agua_util_1m: aguaUtil1m,
                agua_util_2m: aguaUtil2m,
                estratos_disponibles: estratosAlcanzados, // En proyección, mantener el mismo estrato
                lluvia_efectiva: pronostico.lluvia_efectiva,
                etc: pronostico.etc,
                kc: pronostico.kc || 1,
                evapotranspiracion: pronostico.evapotranspiracion || 0,
                porcentajeAguaUtil: porcentajeAguaUtil,
                porcentajeAguaUtil2m: porcentajeAguaUtil2m,
                aguaUtilMaximaActual
            });
        }

        // Construir objeto de respuesta con los resultados proyectados
        // Usamos el día 7 (índice 6) como el día final de proyección
        const proyeccionFinal = {
            proyeccionCompleta,
            aguaUtilDia8: proyeccionCompleta[6]?.agua_util_diaria || aguaUtilZonaRadicular,
            aguaUtil1mDia8: proyeccionCompleta[6].agua_util_1m  ,
            aguaUtil2mDia8: proyeccionCompleta[6].agua_util_2m ,
            porcentajeProyectado: proyeccionCompleta[6]?.porcentajeAguaUtil || 
                (aguaUtilTotal1m > 0 ? (aguaUtil1m / aguaUtilTotal1m) * 100 : 0),
            porcentajeProyectado2m: proyeccionCompleta[6]?.porcentajeAguaUtil2m || 
                (aguaUtilTotal2m > 0 ? (aguaUtil2m / aguaUtilTotal2m) * 100 : 0)
        };

        // Logging final para depuración
        console.log('Proyección calculada con 1m y 2m:', {
            valorInicial: aguaUtilInicial,
            valorFinal1m: proyeccionFinal.aguaUtil1mDia8,
            valorFinal2m: proyeccionFinal.aguaUtil2mDia8,
            porcentaje1m: proyeccionFinal.porcentajeProyectado,
            porcentaje2m: proyeccionFinal.porcentajeProyectado2m
        });

        return proyeccionFinal;
 
    } catch (error) {
        console.error('Error en calcularProyeccionAU:', error);
        return {
            proyeccionCompleta: [],
            aguaUtilDia8: 0,
            aguaUtil1mDia8: 0,
            aguaUtil2mDia8: 0,
            porcentajeProyectado: 0,
            porcentajeProyectado2m: 0
        };
    }
}

async function getLastSimulationData(loteId) {
    try {
        // Obtener los datos más recientes del lote y cambios diarios
        const { rows } = await pool.query(`
            SELECT 
                cd.agua_util_diaria,
                l.agua_util_total, 
                l.capacidad_almacenamiento_2m,
                l.utilizar_un_metro,
                cd.estrato_alcanzado
            FROM cambios_diarios cd
            JOIN lotes l ON cd.lote_id = l.id
            WHERE cd.lote_id = $1
            ORDER BY cd.fecha_cambio DESC
            LIMIT 1
        `, [loteId]);

        if (rows.length === 0) {
            console.log(`No se encontraron datos para el lote ${loteId}`);
            return null;
        }

        const ultimoCambio = rows[0];
        
        // Obtener estratos de agua útil inicial para cálculos proporcionales
        const { rows: valoresEstratos } = await pool.query(`
            SELECT estratos, valor
            FROM agua_util_inicial
            WHERE lote_id = $1
            ORDER BY estratos
        `, [loteId]);
        
        // Convertir a array para más fácil manipulación
        const estratosArray = valoresEstratos.map(v => ({
            estrato: v.estratos,
            valor: parseFloat(v.valor || 0)
        }));
        
        // Calcular totales para diferentes profundidades
        // 1m = primeros 5 estratos (0-100cm)
        // 2m = todos los estratos disponibles (hasta 200cm)
        const totalAgua1m = estratosArray
            .filter(v => v.estrato <= 5)
            .reduce((sum, v) => sum + v.valor, 0);
            
        const totalAgua2m = estratosArray
            .reduce((sum, v) => sum + v.valor, 0);
            
        // Usar capacidades configuradas o calcular en base a estratos
        const capacidad1m = parseFloat(ultimoCambio.agua_util_total || 0) || totalAgua1m;
        const capacidad2m = parseFloat(ultimoCambio.capacidad_almacenamiento_2m || 0) || totalAgua2m;
        
        // Valor actual de agua útil en la zona radicular
        const aguaUtilActual = parseFloat(ultimoCambio.agua_util_diaria || 0);
        
        // Determinar el estrato alcanzado actualmente
        const estratoAlcanzado = ultimoCambio.estrato_alcanzado || 
            Math.min(5, estratosArray.length); // Si no hay valor, asumimos al menos el estrato 5 (1m)
            
        // Calcular la distribución actual de agua por estratos
        // Estrategia 1: Proporción basada en estratos originales
        const aguaEstratos = estratosArray.slice(0, estratoAlcanzado);
        const totalEstratos = aguaEstratos.reduce((sum, e) => sum + e.valor, 0);
        
        // Calculamos proporciones basadas en configuración y datos disponibles
        let proportion1m, proportion2m;
        
        if (ultimoCambio.utilizar_un_metro) {
            // Si está configurado para usar solo 1m
            proportion1m = 1;  // 1m = zona radicular
            proportion2m = capacidad2m / capacidad1m; // 2m como proporción de 1m
        } else {
            // Si usa la zona radicular completa
            if (estratoAlcanzado <= 5) {
                // Si la zona radicular está dentro de 1m
                proportion1m = 1; // 1m incluye toda la zona radicular
                proportion2m = 1; // 2m incluye toda la zona radicular
            } else {
                // Si la zona radicular es más profunda que 1m
                // Calculamos la proporción de agua que está en el primer metro
                const agua1mPresente = estratosArray
                    .filter(v => v.estrato <= 5)
                    .reduce((sum, v) => sum + v.valor, 0);
                    
                proportion1m = totalEstratos > 0 ? agua1mPresente / totalEstratos : 0.7;
                proportion2m = 1; // 2m incluye toda la zona radicular
            }
        }
        
        // Calculamos los valores actuales
        const aguaUtil1m = aguaUtilActual * proportion1m;
        const aguaUtil2m = aguaUtilActual * proportion2m;
        
        // Logging para depuración
        console.log('Datos de simulación para lote:', loteId, {
            aguaUtilActual,
            estratoAlcanzado,
            capacidad1m,
            capacidad2m,
            proportion1m,
            proportion2m,
            aguaUtil1m,
            aguaUtil2m
        });
        
        // Retornar todos los datos calculados
        return {
            aguaUtil1m,
            aguaUtil2m,
            totalAgua1m,
            totalAgua2m,
            capacidad1m,
            capacidad2m,
            proportion1m,
            proportion2m,
            estratoAlcanzado
        };
    } catch (error) {
        console.error('Error al obtener datos de simulación:', error);
        return null;
    }
}

exports.getSummaryData = async (req, res) => {
    const { loteId } = req.params;

    try {
        // Obtenemos los datos básicos del lote
        const { rows: [lote] } = await pool.query(`
            SELECT l.id, l.nombre_lote, l.especie, l.variedad, l.campaña
            FROM lotes l
            WHERE l.id = $1
        `, [loteId]);

        if (!lote) {
            return res.status(404).json({ error: 'Lote no encontrado' });
        }

        // Reutilizamos la lógica de cálculo del getSimulationData
        // Creamos un objeto simulado para req y res
        const mockReq = { 
            params: { loteId },
            query: { campaña: lote.campaña }
        };
        
        let simulationData = null;
        
        // Objeto res simulado que capturará los datos de simulación
        const mockRes = {
            json: (data) => {
                simulationData = data;
            }
        };

        // Llamamos a getSimulationData con nuestros objetos simulados
        await exports.getSimulationData(mockReq, mockRes);
        
        // Si no tenemos datos, devolvemos un error
        if (!simulationData) {
            return res.status(404).json({ error: 'No se pudieron obtener datos de simulación' });
        }

        // Extraemos solo los datos que necesitamos para el resumen
        const lastIndex = simulationData.aguaUtil.length - 1;
        
        // Creamos un objeto resumen con los datos relevantes
        const resumen = {
            loteId: lote.id,
            nombreLote: lote.nombre_lote,
            especie: lote.especie,
            variedad: lote.variedad,
            campana: lote.campaña,
            // Usamos el último valor de cada array
            aguaUtilZonaRadicular: simulationData.aguaUtil[lastIndex],
            aguaUtil1m: simulationData.aguaUtil1m[lastIndex],
            aguaUtil2m: simulationData.aguaUtil2m[lastIndex],
            porcentajeAguaUtil: simulationData.porcentajeAguaUtil,
            porcentajeAu1m: simulationData.porcentajeAu1m,
            porcentajeAu2m: simulationData.porcentajeAu2m,
            ultimaFecha: simulationData.fechas[lastIndex]
        };

        // Agregamos un log para verificar los valores
        console.log(`Resumen para lote ${loteId} (usando datos de simulación):`, {
            id: lote.id,
            nombre: lote.nombre_lote,
            aguaUtil1m: resumen.aguaUtil1m,
            aguaUtil2m: resumen.aguaUtil2m,
            porcentajeAu1m: resumen.porcentajeAu1m,
            porcentajeAu2m: resumen.porcentajeAu2m
        });

        res.json(resumen);
    } catch (error) {
        console.error('Error al obtener datos de resumen:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
};