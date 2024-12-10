const pool = require('../db');

exports.getSimulationData = async (req, res) => {
    const { loteId } = req.params;
    const { campaña } = req.query;

    try {
        const result = await pool.query(`
            SELECT 
                l.*,
                c.nombre_cultivo,
                c.indice_crecimiento_radicular,
                c.indice_capacidad_extraccion,
                cd.fecha_cambio,
                cd.precipitaciones,
                cd.riego_cantidad,
                cd.evapotranspiracion,
                cd.agua_util_diaria,
                cd.lluvia_efectiva,
                cd.kc,
                cd.dias,
                cd.crecimiento_radicular,
                cd.estrato_alcanzado,
                (SELECT array_agg(valor ORDER BY estratos) 
                    FROM agua_util_inicial 
                    WHERE lote_id = l.id) as valores_estratos
            FROM lotes l
            JOIN cultivos c ON l.cultivo_id = c.id
            LEFT JOIN cambios_diarios cd ON l.id = cd.lote_id
            WHERE l.id = $1
            ${campaña ? 'AND l.campaña = $2' : ''}
            ORDER BY cd.fecha_cambio`, 
            campaña ? [loteId, campaña] : [loteId]
        );




        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lote no encontrado o sin datos' });
        }

        
        const lote = result.rows[0];
        const cambios = result.rows;

        

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
        const diasDesdeSiembra = cambios.length > 0 ? 
        Math.floor((new Date(cambios[cambios.length - 1].fecha_cambio) - new Date(lote.fecha_siembra)) / (1000 * 60 * 60 * 24)) :
        Math.floor((new Date() - new Date(lote.fecha_siembra)) / (1000 * 60 * 60 * 24));
        
        const estadoFenologico = await getEstadoFenologico(loteId, diasDesdeSiembra);

        console.log('Días desde siembra:', diasDesdeSiembra);
        console.log('Estados fenológicos:', estadoFenologico);

        // Obtener todos los estados fenológicos
        const estadosFenologicos = await getEstadosFenologicos(loteId);

        // Cálculo de proyección a 10 días
        const proyeccionAU10Dias = await calcularProyeccionAU(loteId);

        const proyeccion = await calcularProyeccionAU(loteId);
        const todasLasFechas = [
            ...cambios.map(c => c.fecha_cambio),
            ...proyeccion.proyeccionCompleta.map(p => p.fecha)
        ];

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
            aguaUtilAnterior, estratoAnterior) => {
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
            
            // Calculamos la profundidad alcanzada por las raíces usando el índice específico del cultivo
            const profundidadRaices = Math.min(
                parseFloat(dia) * parseFloat(indice_crecimiento_radicular),
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
            
            // Aplicamos los cambios diarios
            const perdidaAgua = Math.max(
                parseFloat(evapotranspiracion || 0),
                parseFloat(etc || 0)
            );
            const gananciaAgua = parseFloat(lluvia_efectiva || 0) + parseFloat(riego_cantidad || 0);
            
            // Calculamos el agua útil diaria
            let aguaUtilDiaria;

            if (aguaUtilAnterior === undefined) {
                // Primer día: consideramos el primer estrato
                aguaUtilDiaria = valorPorEstrato - perdidaAgua + gananciaAgua;
            } else {
                // Días subsiguientes: siempre sumamos el agua útil anterior
                aguaUtilDiaria = aguaUtilAnterior;
                
                if (estratosDisponiblesFinales > estratoAnterior) {
                    // Si alcanzamos un nuevo estrato, sumamos su valor
                    aguaUtilDiaria += valorPorEstrato;
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
            const porcentajeAguaUtil = (aguaUtilDiaria / aguaUtilDisponibleActual) * 100;

        
            // Calculamos el agua útil umbral
            const aguaUtilUmbral = aguaUtilMaximaActual * (porcentajeUmbral / 100);
        
            // Para debug
            console.log('Cálculos de agua útil:', {
                estratosDisponibles: estratosDisponiblesFinales,
                aguaUtilDisponibleActual,
                aguaUtilDiaria,
                porcentajeAguaUtil
            });

             console.log('Salida función:', {
                aguaUtilDiaria,
                aguaUtilUmbral,
                estratosDisponibles,
                porcentajeAguaUtil,
                profundidadRaices,
                gananciaAgua,
                perdidaAgua
            });
        
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
        cambios.forEach((cambio, index) => {
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
                index > 0 ? datosSimulacion[index - 1]?.estratosDisponibles : undefined
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
        

        const simulationData = {
            fechas: cambios.map(c => c.fecha_cambio),
            lluvias: cambios.map(c => c.precipitaciones || 0),
            riego: cambios.map(c => c.riego_cantidad || 0),
            aguaUtil: cambios.map(c => c.agua_util_diaria || 0),
            aguaUtilUmbral: cambios.map(() => (parseFloat(lote.agua_util_total || 0) * parseFloat(lote.porcentaje_agua_util_umbral || 0)) / 100),
            estadoFenologico: estadoFenologico,
            estadosFenologicos: await getEstadosFenologicos(loteId),
            fechaSiembra: lote.fecha_siembra,
            auInicial: parseFloat(lote.agua_util_total || 0),
            lluviasEfectivasAcumuladas: cambios.reduce((sum, c) => sum + (parseFloat(c.lluvia_efectiva) || 0), 0),
            riegoAcumulado: cambios.reduce((sum, c) => sum + (parseFloat(c.riego_cantidad) || 0), 0),
            cultivo: lote.nombre_cultivo,
            variedad: lote.variedad,
            porcentajeAguaUtilUmbral: parseFloat(lote.porcentaje_agua_util_umbral || 0),
            porcentajeAguaUtil: cambios.length > 0 ? 
                (parseFloat(cambios[cambios.length - 1].agua_util_diaria || 0) / parseFloat(lote.agua_util_total || 1)) * 100 : 0,
            valores_estratos: lote.valores_estratos,
            estratosDisponibles: cambios.map(c => c.estrato_alcanzado || 0),
            // Agregamos los datos de proyección
            fechasProyeccion: proyeccionResult.rows.map(p => p.fecha_pronostico),
            aguaUtilProyectada: proyeccionResult.rows.map(p => p.agua_util_diaria || 0),
            proyeccionAU10Dias: proyeccionResult.rows[7]?.agua_util_diaria || 0,
            fechaActualizacion: new Date().toISOString().split('T')[0]
        };

        /*console.log('Datos de simulación procesados:', {
            aguaUtil: simulationData.aguaUtil,
            porcentajeAguaUtil: simulationData.porcentajeAguaUtil
        });*/

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

async function calcularProyeccionAU(loteId) {
    try {
        // Obtener último estado
        const { rows: [ultimoCambio] } = await pool.query(`
            SELECT cd.*, l.agua_util_total, l.porcentaje_agua_util_umbral, 
                   l.indice_crecimiento_radicular,
                   (SELECT array_agg(valor ORDER BY estratos) 
                    FROM agua_util_inicial 
                    WHERE lote_id = l.id) as valores_estratos
            FROM cambios_diarios cd
            JOIN lotes l ON cd.lote_id = l.id
            WHERE cd.lote_id = $1
            ORDER BY cd.fecha_cambio DESC
            LIMIT 1
        `, [loteId]);

        if (!ultimoCambio) return { aguaUtilDia8: 0, proyeccionCompleta: [] };

        // Obtener pronósticos futuros
        const { rows: pronosticos } = await pool.query(`
            SELECT * FROM pronostico 
            WHERE lote_id = $1 
            AND fecha_pronostico > $2
            ORDER BY fecha_pronostico ASC 
            LIMIT 8
        `, [loteId, ultimoCambio.fecha_cambio]);

        let aguaUtilProyectada = ultimoCambio.agua_util_diaria || 0;
        let proyeccion = [];
        let estratoActual = ultimoCambio.estrato_alcanzado || 1;

        // Calcular proyección día por día
        for (const pronostico of pronosticos) {
            const diasProyectados = Math.floor(
                (new Date(pronostico.fecha_pronostico) - new Date(ultimoCambio.fecha_cambio)) / (1000 * 60 * 60 * 24)
            );

            // Calcular pérdidas y ganancias del día
            const perdidaAgua = pronostico.evapotranspiracion || 0;
            const gananciaAgua = (pronostico.lluvia_efectiva || 0);

            // Calcular agua útil del día
            aguaUtilProyectada = Math.max(0, aguaUtilProyectada - perdidaAgua + gananciaAgua);

            proyeccion.push({
                fecha: pronostico.fecha_pronostico,
                aguaUtil: aguaUtilProyectada,
                evapotranspiracion: pronostico.evapotranspiracion,
                lluviaEfectiva: pronostico.lluvia_efectiva
            });
        }

        // Retornar tanto el valor del día 8 como la proyección completa
        return {
            aguaUtilDia8: proyeccion.length >= 8 ? proyeccion[7].aguaUtil : aguaUtilProyectada,
            proyeccionCompleta: proyeccion
        };
    } catch (error) {
        console.error('Error en calcularProyeccionAU:', error);
        return { aguaUtilDia8: 0, proyeccionCompleta: [] };
    }

}
