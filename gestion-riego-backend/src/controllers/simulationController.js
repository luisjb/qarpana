const pool = require('../db');

exports.getSimulationData = async (req, res) => {
    const { loteId } = req.params;
    const { campaña } = req.query;

    try {
        const result = await pool.query(`
             SELECT l.*, c.nombre_cultivo, c.indice_crecimiento_radicular, c.indice_capacidad_extraccion,
                   cd.fecha_cambio, cd.precipitaciones, cd.riego_cantidad, cd.evapotranspiracion,
                   cd.agua_util_diaria, cd.lluvia_efectiva, cd.kc, cd.dias, cd.crecimiento_radicular,
                   l.porcentaje_agua_util_umbral, l.agua_util_total,
                   (SELECT array_agg(valor ORDER BY estratos) 
                    FROM agua_util_inicial 
                    WHERE lote_id = l.id) as valores_estratos
            FROM lotes l
            JOIN cultivos c ON l.cultivo_id = c.id
            LEFT JOIN cambios_diarios cd ON l.id = cd.lote_id
            WHERE l.id = $1
            ${campaña ? 'AND l.campaña = $2' : ''}
            ORDER BY cd.fecha_cambio
        `, campaña ? [loteId, campaña] : [loteId]);

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

        const aguaUtilTotal = parseFloat(lote.agua_util_total) || 0;


        // Calcular acumulados
        let lluviasEfectivasAcumuladas = 0;
        let riegoAcumulado = 0;

        // Calcular las sumas solo si hay cambios diarios
        if (cambios && cambios.length > 0) {
            lluviasEfectivasAcumuladas = sumarValores(cambios, 'lluvia_efectiva');
            riegoAcumulado = sumarValores(cambios, 'riego_cantidad');
        }

        console.log('Valores acumulados calculados:', {
            lluviasEfectivasAcumuladas,
            riegoAcumulado,
            cantidadRegistros: cambios.length,
            muestraValores: cambios.map(c => ({
                lluvia_efectiva: c.lluvia_efectiva,
                riego_cantidad: c.riego_cantidad
            }))
        });

        // Cálculos 
        const fechas = cambios.map(c => c.fecha_cambio);
        const lluvias = cambios.map(c => c.precipitaciones || 0);
        const riego = cambios.map(c => c.riego_cantidad || 0);
        const aguaUtil = cambios.map(c => c.agua_util_diaria || 0);
        const aguaUtil50 = aguaUtil.map(au => au * 0.5);

        const lluviasEficientesAcumuladas = cambios.reduce((sum, c) => sum + (c.lluvia_efectiva || 0), 0);

        // Obtener estado fenológico actual
        const diasDesdeSiembra = cambios[cambios.length - 1]?.dias || 0;
        const estadoFenologico = await getEstadoFenologico(loteId, diasDesdeSiembra);

        // Obtener todos los estados fenológicos
        const estadosFenologicos = await getEstadosFenologicos(loteId);

        // Cálculo de proyección a 10 días
        const proyeccionAU10Dias = await calcularProyeccionAU(loteId);

        const ensureNumber = (value) => {
            const num = Number(value);
            return isNaN(num) ? null : num;
        };

          // Función para calcular el agua útil acumulada por estratos
          const calcularAguaUtilPorEstratos = (dia, valoresEstratos, aguaUtilTotal, porcentajeUmbral, indice_crecimiento_radicular, evapotranspiracion, etc, lluvia_efectiva, riego_cantidad, aguaUtilAnterior, estratoAnterior) => {
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
        
            // Calculamos la profundidad alcanzada por las raíces en cm
            const profundidadRaices = parseFloat(dia) * parseFloat(indice_crecimiento_radicular || 0);
            
            // Calculamos cuántos estratos están disponibles
            const estratosDisponibles = Math.min(
                Math.floor(profundidadRaices / PROFUNDIDAD_POR_ESTRATO) + 1,
                numEstratos
            );
        
            // Valor por estrato (agua útil total dividida por número de estratos)
            const valorPorEstrato = parseFloat(aguaUtilTotal) / numEstratos;
        
            // Aplicamos los cambios diarios (esto ocurre todos los días)
            const perdidaAgua = Math.max(
                parseFloat(evapotranspiracion || 0),
                parseFloat(etc || 0)
            );
            const gananciaAgua = parseFloat(lluvia_efectiva || 0) + parseFloat(riego_cantidad || 0);
            
            // Calculamos el agua útil diaria
            let aguaUtilDiaria;
            
            if (aguaUtilAnterior === undefined) {
                // Primer día: valor de agua por estrato - pérdida + ganancia
                aguaUtilDiaria = valorPorEstrato - perdidaAgua + gananciaAgua;
            } else {
                // Días subsiguientes
                if (estratosDisponibles > estratoAnterior) {
                    // Si alcanzamos un nuevo estrato
                    aguaUtilDiaria = aguaUtilAnterior + valorPorEstrato - perdidaAgua + gananciaAgua;
                } else {
                    // Mismo estrato que el día anterior
                    aguaUtilDiaria = aguaUtilAnterior - perdidaAgua + gananciaAgua;
                }
            }
        
        
            aguaUtilDiaria = Math.max(0, aguaUtilDiaria);

            // Calculamos el porcentaje de agua útil
            const porcentajeAguaUtil = (aguaUtilDiaria / (valorPorEstrato * estratosDisponibles)) * 100;
        
            // Calculamos el agua útil umbral
            const aguaUtilUmbral = (valorPorEstrato * estratosDisponibles) * (porcentajeUmbral / 100);
        
            return {
                aguaUtilDiaria,
                aguaUtilUmbral,
                estratosDisponibles,
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
            fechas: datosSimulacion.map(d => d.fecha),
            lluvias: cambios.map(c => c.precipitaciones || 0),
            riego: cambios.map(c => c.riego_cantidad || 0),
            aguaUtil: datosSimulacion.map(d => parseFloat(d.aguaUtilDiaria) || 0), // Asegurar que es número
            aguaUtilUmbral: datosSimulacion.map(d => d.aguaUtilUmbral),
            porcentajeAguaUtilUmbral: lote.porcentaje_agua_util_umbral,
            porcentajeAguaUtil: parseFloat(datosSimulacion[datosSimulacion.length - 1]?.porcentajeAguaUtil) || 0,
            estratosDisponibles: datosSimulacion.map(d => d.estratosDisponibles),
            estadoFenologico: await getEstadoFenologico(loteId, cambios[cambios.length - 1]?.dias || 0),
            estadosFenologicos: await getEstadosFenologicos(loteId),
            fechaSiembra: lote.fecha_siembra,
            auInicial: aguaUtilTotal,
            lluviasEfectivasAcumuladas: parseFloat(lluviasEfectivasAcumuladas.toFixed(2)),
            riegoAcumulado: parseFloat(riegoAcumulado.toFixed(2)),
            porcentajeAguaUtil: calcularPorcentajeAguaUtil(
                datosSimulacion[datosSimulacion.length - 1]?.aguaUtilDiaria || 0,
                lote.agua_util_total
            ),
            cultivo: lote.nombre_cultivo,
            variedad: lote.variedad,
            proyeccionAU10Dias: await calcularProyeccionAU(loteId),
            fechaActualizacion: new Date().toISOString().split('T')[0]
        };
        console.log('Datos de simulación procesados:', {
            aguaUtil: simulationData.aguaUtil,
            porcentajeAguaUtil: simulationData.porcentajeAguaUtil
        });

        res.json(simulationData);
    } catch (error) {
        console.error('Error al obtener datos de simulación:', error);
        res.status(500).json({ error: 'Error interno del servidor', details: error.message });
    }
};


async function getEstadoFenologico(loteId, diasDesdeSiembra) {
    try {
        const result = await pool.query(
            'SELECT fenologia FROM estado_fenologico WHERE lote_id = $1 AND dias <= $2 ORDER BY dias DESC LIMIT 1',
            [loteId, diasDesdeSiembra]
        );
        return result.rows[0]?.fenologia || 'Desconocido';
    } catch (error) {
        console.error('Error al obtener estado fenológico:', error);
        return 'Desconocido';
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
        // Obtener el pronóstico del día 8 y los datos necesarios
        const result = await pool.query(`
            WITH ultima_agua_util AS (
                SELECT agua_util_diaria
                FROM cambios_diarios
                WHERE lote_id = $1
                ORDER BY fecha_cambio DESC
                LIMIT 1
            )
            SELECT 
                p.*,
                ua.agua_util_diaria as agua_util_actual,
                cc.indice_kc
            FROM pronostico p
            CROSS JOIN ultima_agua_util ua
            INNER JOIN lotes l ON p.lote_id = l.id
            LEFT JOIN coeficiente_cultivo cc ON l.cultivo_id = cc.cultivo_id
            WHERE p.lote_id = $1 
            AND p.prono_dias = 8
            ORDER BY p.fecha_pronostico DESC 
            LIMIT 1`,
            [loteId]
        );

        if (result.rows.length === 0) {
            console.log('No se encontró pronóstico para el día 8');
            return null;
        }

        const pronostico = result.rows[0];
        
        // Asegurar valores numéricos
        const aguaUtilActual = parseFloat(pronostico.agua_util_actual || 0);
        const perdidaAgua = parseFloat(pronostico.etc || 0);
        const lluviaEfectiva = parseFloat(pronostico.lluvia_efectiva || 0);

        const aguaUtilProyectada = Math.max(0, 
            aguaUtilActual - perdidaAgua + lluviaEfectiva
        );

        console.log('Proyección AU calculada:', {
            aguaUtilActual,
            perdidaAgua,
            lluviaEfectiva,
            aguaUtilProyectada
        });

        return parseFloat(aguaUtilProyectada.toFixed(2));
    } catch (error) {
        console.error('Error al calcular proyección AU:', error);
        return null;
    }
}