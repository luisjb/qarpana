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
                    l.porcentaje_agua_util_umbral, l.agua_util_total, l.fecha_siembra,
                    (SELECT array_agg(valor ORDER BY estratos) 
                        FROM agua_util_inicial 
                        WHERE lote_id = l.id) as valores_estratos
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
        
        
        
        console.log('Datos del lote:', {
            agua_util_total: lote.agua_util_total,
            porcentaje_agua_util_umbral: lote.porcentaje_agua_util_umbral
        });

        console.log('Muestra de cambios diarios:', cambios.slice(0, 3).map(c => ({
            fecha: c.fecha_cambio,
            agua_util_diaria: c.agua_util_diaria,
            precipitaciones: c.precipitaciones,
            riego: c.riego_cantidad
        })));
        
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

        // Calcular acumulados
        let lluviasEfectivasAcumuladas = 0;
        let riegoAcumulado = 0;

        // Calcular las sumas solo si hay cambios diarios
        if (cambios && cambios.length > 0) {
            lluviasEfectivasAcumuladas = sumarValores(cambios, 'lluvia_efectiva');
            riegoAcumulado = sumarValores(cambios, 'riego_cantidad');
        }

        /*console.log('Datos crudos de cambios:', cambios.map(c => ({
            fecha: c.fecha_cambio,
            lluvia: c.precipitaciones,
            lluvia_efectiva: c.lluvia_efectiva,
            riego: c.riego_cantidad,
            evap: c.evapotranspiracion,
            etc: c.etc
        })));*/

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

        /*console.log('Datos crudos:', cambios.map(c => ({
            fecha: c.fecha_cambio,
            lluvia: c.precipitaciones,
            lluviaEfectiva: c.lluvia_efectiva,
            evapotranspiracion: c.evapotranspiracion,
            etc: c.etc,
            aguaUtilDiaria: c.agua_util_diaria
        })));*/

          // Función para calcular el agua útil acumulada por estratos
        const calcularAguaUtilPorEstratos = (dia, valoresEstratos, aguaUtilTotal, porcentajeUmbral, 
            indice_crecimiento_radicular, evapotranspiracion, etc, lluvia_efectiva, riego_cantidad, 
            aguaUtilAnterior, estratoAnterior, indice_capacidad_extraccion, kc) => {
            /*console.log('Entrada función:', {
                dia,
                valoresEstratos,
                aguaUtilTotal,
                porcentajeUmbral,
                indice_crecimiento_radicular,
                evapotranspiracion,
                etc,
                lluvia_efectiva,
                riego_cantidad,
                aguaUtilAnterior,
                estratoAnterior
            });*/

            if (!valoresEstratos || !dia) {
                return {
                    aguaUtilDiaria: 0,
                    aguaUtilUmbral: 0,
                    estratosDisponibles: 0,
                    porcentajeAguaUtil: 0,
                    profundidadRaices: 0
                };
            }
            
            

            const numEstratos = valoresEstratos.length;
            const PROFUNDIDAD_POR_ESTRATO = 20; // 20 cm por estrato
            const DIAS_SIN_CRECIMIENTO = 6; // Días iniciales sin crecimiento radicular

            
            // Calculamos la profundidad alcanzada por las raíces usando el índice específico del cultivo
            // Calculamos la profundidad alcanzada por las raíces considerando los días sin crecimiento
            const diasEfectivos = dia <= DIAS_SIN_CRECIMIENTO ? 0 : dia - DIAS_SIN_CRECIMIENTO;
            const profundidadRaices = Math.min(
                diasEfectivos * parseFloat(indice_crecimiento_radicular),
                numEstratos * PROFUNDIDAD_POR_ESTRATO // máximo total
            );
            
            // Calculamos cuántos estratos están disponibles (cambio cada PROFUNDIDAD_POR_ESTRATO cm)
            const estratosDisponibles = Math.min(
                Math.floor(profundidadRaices / PROFUNDIDAD_POR_ESTRATO) + 1,
                numEstratos
            );
        
            // Aseguramos que no haya saltos de más de un estrato por vez
            const estratosDisponiblesFinales = estratoAnterior ? 
                Math.min(estratosDisponibles, estratoAnterior + 1) : 
                estratosDisponibles;
            
            // Valor por estrato (agua útil total dividida por número de estratos)
            const valorPorEstrato = parseFloat(aguaUtilTotal) / numEstratos;

            const etcCalculado = parseFloat(evapotranspiracion || 0) * parseFloat(kc || 0);

            // Calculamos la capacidad de extracción como porcentaje del agua útil anterior
            const capacidadExtraccion = aguaUtilAnterior ? 
            (parseFloat(aguaUtilAnterior) * parseFloat(indice_capacidad_extraccion)) / 100 : 0;

            // Aplicamos los cambios diarios
            const perdidaAgua = Math.min(
                etcCalculado,
                capacidadExtraccion
            );
            const gananciaAgua = parseFloat(lluvia_efectiva || 0) + parseFloat(riego_cantidad || 0);
            
            // Calculamos el agua útil diaria
            let aguaUtilDiaria;

            if (aguaUtilAnterior === undefined) {
                // Primer día: consideramos el primer estrato
                aguaUtilDiaria = parseFloat(valoresEstratos[0]) - perdidaAgua + gananciaAgua;
            } else {
                // Días subsiguientes: siempre sumamos el agua útil anterior
                aguaUtilDiaria = aguaUtilAnterior;
                
                if (estratosDisponiblesFinales > estratoAnterior) {
                    // Si alcanzamos un nuevo estrato, sumamos su valor
                    const nuevoEstrato = estratoAnterior || 0;
                    aguaUtilDiaria += parseFloat(valoresEstratos[nuevoEstrato]);
                }
                
                // Aplicamos pérdidas y ganancias
                aguaUtilDiaria = aguaUtilDiaria - perdidaAgua + gananciaAgua;
            }
        
            aguaUtilDiaria = Math.max(0, aguaUtilDiaria);
        
            
                // Limitamos el agua útil diaria al máximo disponible
                //aguaUtilDiaria = Math.min(aguaUtilDiaria, aguaUtilMaximaActual);
            
            // Calculamos el agua útil máxima disponible actual
            const aguaUtilMaximaActual = valorPorEstrato * estratosDisponiblesFinales;

            const aguaUtilDisponibleActual = valoresEstratos
            .slice(0, estratosDisponiblesFinales)
            .reduce((sum, valor) => sum + parseFloat(valor), 0);            
            
            // Calculamos el porcentaje de agua útil
            const porcentajeAguaUtil = (aguaUtilDiaria / aguaUtilMaximaActual) * 100;

        
            // Calculamos el agua útil umbral
            const aguaUtilUmbral = aguaUtilMaximaActual * (porcentajeUmbral / 100);
        
            // Para debug
            console.log('Cálculos de agua útil:', {
                estratosDisponibles: estratosDisponiblesFinales,
                aguaUtilDisponibleActual,
                aguaUtilDiaria,
                porcentajeAguaUtil,
                capacidadExtraccion,
                etcCalculado: parseFloat(etcCalculado || 0),
                perdidaAguaUsada: perdidaAgua,
                nuevoEstratoValor: estratosDisponiblesFinales > estratoAnterior ? 
                    valoresEstratos[estratoAnterior || 0] : 'No hay nuevo estrato'
            });

            /* console.log('Salida función:', {
                aguaUtilDiaria,
                aguaUtilUmbral,
                estratosDisponibles,
                porcentajeAguaUtil,
                profundidadRaices,
                gananciaAgua,
                perdidaAgua
            });*/
        
            return {
                aguaUtilDiaria,
                aguaUtilUmbral,
                estratosDisponibles: estratosDisponiblesFinales,
                porcentajeAguaUtil,
                profundidadRaices
            };
        };


        // Procesamos los datos día a día
        let datosSimulacion = [];
        cambiosFiltrados.forEach((cambio, index) => {
            console.log('Datos cambio diario:', {
                fecha: cambio.fecha_cambio,
                evapotranspiracion: cambio.evapotranspiracion,
                etc: cambio.etc,
                kc: cambio.kc,
                perdidaAgua: Math.max(cambio.evapotranspiracion || 0, cambio.etc || 0)
            });
            const resultados = calcularAguaUtilPorEstratos(
                cambio.dias,
                lote.valores_estratos,
                lote.agua_util_total,
                lote.porcentaje_agua_util_umbral,
                lote.indice_crecimiento_radicular,
                cambio.evapotranspiracion,
                cambio.etc,
                cambio.lluvia_efectiva,
                cambio.riego_cantidad,
                index > 0 ? datosSimulacion[index - 1]?.aguaUtilDiaria : undefined,
                index > 0 ? datosSimulacion[index - 1]?.estratosDisponibles : undefined,
                lote.indice_capacidad_extraccion, 
                cambio.kc  

            );

            /*console.log('Día', cambio.dias, {
                aguaUtilDiaria: resultados.aguaUtilDiaria,
                estratosDisponibles: resultados.estratosDisponibles,
                perdidaAgua: Math.max(cambio.evapotranspiracion || 0, cambio.etc || 0),
                gananciaAgua: (cambio.lluvia_efectiva || 0) + (cambio.riego_cantidad || 0)
            });*/

            datosSimulacion.push({
                fecha: cambio.fecha_cambio,
                ...resultados,
                diasDesdeSiembra: cambio.dias
            });
        });
        
        const ultimaAguaUtil = datosSimulacion[datosSimulacion.length - 1]?.aguaUtilDiaria || 0;
        const proyeccion = await calcularProyeccionAU(loteId, ultimaAguaUtil);
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
            //aguaUtilUmbral: datosSimulacion.map(d => d.aguaUtilUmbral),
            estadoFenologico: await getEstadoFenologico(loteId, diasDesdeSiembra),
            estadosFenologicos: await getEstadosFenologicos(loteId),
            fechaSiembra: lote.fecha_siembra,
            auInicial: aguaUtilTotal,
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
            fechaActualizacion: new Date().toISOString().split('T')[0],

            // Para el widget de proyección
            porcentajeProyectado: proyeccion.porcentajeProyectado,
            aguaUtilUmbral: (() => {
                const porcentajeUmbral = parseFloat(lote.porcentaje_agua_util_umbral) / 100;
                const numEstratos = lote.valores_estratos.length;
                const valorPorEstrato = parseFloat(lote.agua_util_total) / numEstratos;
                
                // Calculamos umbrales históricos
                const umbralesHistoricos = datosSimulacion.map(d => {
                    const aguaUtilMaximaActual = valorPorEstrato * d.estratosDisponibles;
                    return aguaUtilMaximaActual * porcentajeUmbral;
                });
            
                // Obtenemos el último estrato histórico
                const ultimoEstratoHistorico = datosSimulacion[datosSimulacion.length - 1]?.estratosDisponibles || 1;
                
                // Para la proyección, continuamos desde el último valor histórico
                const umbralesProyectados = proyeccion.proyeccionCompleta.map((p, index) => {
                    // Si es el primer día de proyección, usar el último estrato histórico
                    if (index === 0) {
                        const aguaUtilMaximaActual = valorPorEstrato * ultimoEstratoHistorico;
                        return aguaUtilMaximaActual * porcentajeUmbral;
                    }
                    
                    // Para los siguientes días, verificar si hay cambio de estrato
                    const estratoAnterior = index === 0 ? 
                        ultimoEstratoHistorico : 
                        proyeccion.proyeccionCompleta[index - 1].estratos_disponibles;
                        
                    // Si el estrato actual es mayor, sumar el nuevo valor
                    if (p.estratos_disponibles > estratoAnterior) {
                        const aguaUtilMaximaActual = valorPorEstrato * p.estratos_disponibles;
                        return aguaUtilMaximaActual * porcentajeUmbral;
                    }
                    
                    // Si no hay cambio de estrato, mantener el valor anterior
                    return umbralesProyectados[index - 1];
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
        };

        // También vamos a agregar un console.log para verificar los valores
        console.log('ETC valores:', simulationData.etc.slice(0, 5)); // Ver primeros 5 valores
        console.log('Evapotranspiracion valores:', simulationData.evapotranspiracion.slice(0, 5));

        /*console.log('Datos de simulación finales:', {
            aguaUtilMuestra: simulationData.aguaUtil.slice(0, 3),
            porcentajeAguaUtil: simulationData.porcentajeAguaUtil,
            estratosDisponibles: simulationData.estratosDisponibles.slice(0, 3)
        });*/
        


        /*console.log('Datos de simulación procesados:', {
            aguaUtil: simulationData.aguaUtil,
            porcentajeAguaUtil: simulationData.porcentajeAguaUtil
        });*/
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

async function calcularProyeccionAU(loteId, aguaUtilInicial) {
    try {
        const { rows: [ultimoCambio] } = await pool.query(`
            SELECT cd.*, l.agua_util_total, l.porcentaje_agua_util_umbral,
                   l.fecha_siembra, c.indice_crecimiento_radicular, c.indice_capacidad_extraccion,
                   cd.dias as ultimo_dia,
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
 
        if (!ultimoCambio) return { proyeccionCompleta: [], aguaUtilDia8: 0 };
 
        let aguaUtilAnterior = parseFloat(aguaUtilInicial);

        let diasAcumulados = parseInt(ultimoCambio.ultimo_dia);
        const indiceCrecimientoRadicular = parseFloat(ultimoCambio.indice_crecimiento_radicular);

        const estratosAlcanzados = ultimoCambio.estrato_alcanzado || 1;
        const aguaUtilDisponible = ultimoCambio.valores_estratos
            ?.slice(0, estratosAlcanzados)
            .reduce((sum, valor) => sum + parseFloat(valor), 0) || 0;
 
        console.log('Punto de partida proyección:', {
            aguaUtilAnterior,
            aguaUtilDisponible,
            fecha: ultimoCambio.fecha_cambio
        });
 
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
 
        let proyeccionCompleta = [];

         // Función auxiliar para calcular estrato basado en profundidad
         const calcularEstrato = (profundidadRaiz) => {
            return Math.min(
                Math.floor(profundidadRaiz / 20) + 1,
                ultimoCambio.valores_estratos.length
            );
        };
 
        for (const pronostico of pronosticos) {

            diasAcumulados++;

            const profundidadRaiz = diasAcumulados * indiceCrecimientoRadicular;
            const nuevoEstrato = calcularEstrato(profundidadRaiz);

            const capacidadExtraccion = (aguaUtilAnterior * parseFloat(ultimoCambio.indice_capacidad_extraccion)) / 100;
            
            const perdidaAgua = Math.min(
                parseFloat(pronostico.etc || 0),
                capacidadExtraccion
            );
            const gananciaAgua = parseFloat(pronostico.lluvia_efectiva || 0);
 
            aguaUtilAnterior = Math.max(0, aguaUtilAnterior - perdidaAgua + gananciaAgua);
 
            const aguaUtilMaximaActual = ultimoCambio.valores_estratos
                .slice(0, estratosAlcanzados)
                .reduce((sum, valor) => sum + parseFloat(valor), 0);
            
            proyeccionCompleta.push({
                fecha: pronostico.fecha_pronostico,
                agua_util_diaria: aguaUtilAnterior,
                estratos_disponibles: estratosAlcanzados,
                lluvia_efectiva: pronostico.lluvia_efectiva,
                etc: pronostico.etc,
                aguaUtilMaximaActual,
                porcentajeAguaUtil: (aguaUtilAnterior / aguaUtilMaximaActual) * 100
            });
        }

        const proyeccionFinal = {
            proyeccionCompleta,
            aguaUtilDia8: proyeccionCompleta[6]?.agua_util_diaria || 0, // Cambiado de 7 a 6 (índice)
            porcentajeProyectado: proyeccionCompleta[6]?.porcentajeAguaUtil || 0
        };
 
        console.log('Proyección calculada:', {
            valorInicial: aguaUtilInicial,
            valorFinal: proyeccionFinal.aguaUtilDia8,
            porcentaje: proyeccionFinal.porcentajeProyectado
        });
 
        return proyeccionFinal;
 
    } catch (error) {
        console.error('Error en calcularProyeccionAU:', error);
        return {
            proyeccionCompleta: [],
            aguaUtilDia8: 0,
            porcentajeProyectado: 0
        };
    }
 }

