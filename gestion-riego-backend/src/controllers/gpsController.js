// src/controllers/gpsController.js
const pool = require('../db');
const gpsProcessingService = require('../services/gpsProcessingService');
const gpsCalc = require('../services/gpsCalculationsService');

class GPSController {

    /**
     * Procesa posiciones de Traccar (Position Forwarding)
     */
    async procesarPosicion(req, res) {
        try {
            console.log('📍 Posición GPS recibida:', {
                dispositivo: req.body.device?.name,
                lat: req.body.position?.latitude,
                lng: req.body.position?.longitude,
                io9: req.body.position?.attributes?.io9
            });

            const resultado = await gpsProcessingService.procesarPosicion(req.body);

            res.status(200).json({
                success: true,
                message: 'Posición procesada correctamente',
                data: resultado
            });

        } catch (error) {
            console.error('Error procesando posición:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obtiene datos operacionales históricos de un regador
     */
    async obtenerDatosOperacion(req, res) {
        try {
            const { regadorId } = req.params;
            const { desde, hasta, incluir_presion, incluir_altitud } = req.query;

            let query = `
                SELECT 
                    dog.id,
                    dog.timestamp,
                    dog.latitud,
                    dog.longitud,
                    dog.angulo_actual,
                    dog.distancia_centro,
                    dog.velocidad,
                    dog.dentro_geozona,
                    dog.regando,
                    dog.encendido,
                    dog.moviendose,
                    dog.estado_texto,
                    ${incluir_presion === 'true' ? 'dog.presion,' : ''}
                    ${incluir_altitud === 'true' ? 'dog.altitud,' : ''}
                    gp.nombre_sector,
                    gp.numero_sector,
                    gp.color_display
                FROM datos_operacion_gps dog
                LEFT JOIN geozonas_pivote gp ON dog.geozona_id = gp.id
                WHERE dog.regador_id = $1
            `;

            const params = [regadorId];

            if (desde) {
                params.push(desde);
                query += ` AND dog.timestamp >= $${params.length}`;
            }

            if (hasta) {
                params.push(hasta);
                query += ` AND dog.timestamp <= $${params.length}`;
            }

            query += ' ORDER BY dog.timestamp DESC LIMIT 500';

            const result = await pool.query(query, params);

            res.json(result.rows);

        } catch (error) {
            console.error('Error obteniendo datos operación:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obtiene el resumen de riego actual de un regador
     */
    async obtenerResumenRiego(req, res) {
        try {
            const { regadorId } = req.params;

            const query = `
                SELECT 
                    r.id as regador_id,
                    r.nombre_dispositivo,
                    r.tipo_regador,
                    r.radio_cobertura,
                    r.activo,
                    
                    -- Sectores
                    COUNT(DISTINCT gp.id) as total_sectores,
                    COUNT(DISTINCT CASE WHEN esr.estado = 'completado' THEN gp.id END) as sectores_completados,
                    COUNT(DISTINCT CASE WHEN esr.estado = 'en_progreso' THEN gp.id END) as sectores_en_progreso,
                    COUNT(DISTINCT CASE WHEN esr.estado = 'pendiente' OR esr.estado IS NULL THEN gp.id END) as sectores_pendientes,
                    
                    -- Progreso
                    COALESCE(AVG(COALESCE(esr.progreso_porcentaje, 0)), 0) as progreso_promedio,
                    
                    -- Agua y tiempo
                    COALESCE(SUM(esr.agua_aplicada_litros), 0) as agua_total_aplicada,
                    COALESCE(SUM(esr.tiempo_real_minutos), 0) as tiempo_total_riego,
                    
                    -- Última actividad
                    MAX(dog.timestamp) as ultima_actividad
                    
                FROM regadores r
                LEFT JOIN geozonas_pivote gp ON r.id = gp.regador_id
                LEFT JOIN estado_sectores_riego esr ON gp.id = esr.geozona_id
                LEFT JOIN datos_operacion_gps dog ON r.id = dog.regador_id
                WHERE r.id = $1
                GROUP BY r.id, r.nombre_dispositivo, r.tipo_regador, r.radio_cobertura, r.activo
            `;

            const result = await pool.query(query, [regadorId]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Regador no encontrado'
                });
            }

            res.json({
                success: true,
                data: result.rows[0]
            });

        } catch (error) {
            console.error('Error obteniendo resumen de riego:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obtiene historial de ciclos de riego completados
     */
    async obtenerHistorialRiego(req, res) {
        try {
            const { regadorId } = req.params;
            const { limite = 50, desde, hasta } = req.query;

            let query = `
                SELECT 
                    cr.id,
                    cr.fecha_inicio,
                    cr.fecha_fin,
                    cr.duracion_minutos,
                    cr.agua_aplicada_litros,
                    cr.lamina_aplicada_mm,
                    cr.area_regada_m2,
                    cr.presion_promedio,
                    cr.completado,
                    gp.nombre_sector,
                    gp.numero_sector,
                    l.nombre_lote
                FROM ciclos_riego cr
                LEFT JOIN geozonas_pivote gp ON cr.geozona_id = gp.id
                LEFT JOIN lotes l ON gp.lote_id = l.id
                WHERE cr.regador_id = $1
            `;

            const params = [regadorId];

            if (desde) {
                params.push(desde);
                query += ` AND cr.fecha_inicio >= $${params.length}`;
            }

            if (hasta) {
                params.push(hasta);
                query += ` AND cr.fecha_fin <= $${params.length}`;
            }

            query += ` ORDER BY cr.fecha_inicio DESC LIMIT ${parseInt(limite)}`;

            const result = await pool.query(query, params);

            res.json({
                success: true,
                count: result.rows.length,
                data: result.rows
            });

        } catch (error) {
            console.error('Error obteniendo historial de riego:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obtiene eventos de riego recientes
     */
    async obtenerEventosRiego(req, res) {
        try {
            const { regadorId } = req.params;
            const { limit = 20 } = req.query;

            const query = `
                SELECT 
                    er.id,
                    er.tipo_evento,
                    er.fecha_evento,
                    er.angulo_actual,
                    er.dispositivo_online,
                    er.velocidad,
                    gp.nombre_sector,
                    gp.numero_sector,
                    l.nombre_lote
                FROM eventos_riego er
                LEFT JOIN geozonas_pivote gp ON er.geozona_id = gp.id
                LEFT JOIN lotes l ON gp.lote_id = l.id
                WHERE er.regador_id = $1
                ORDER BY er.fecha_evento DESC
                LIMIT $2
            `;

            const result = await pool.query(query, [regadorId, limit]);

            res.json(result.rows);

        } catch (error) {
            console.error('Error obteniendo eventos de riego:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obtiene la posición actual más reciente de un regador
     */
    async obtenerPosicionActual(req, res) {
        try {
            const { regadorId } = req.params;

            const query = `
                SELECT 
                    dog.timestamp,
                    dog.latitud,
                    dog.longitud,
                    dog.angulo_actual,
                    dog.distancia_centro,
                    dog.presion,
                    dog.altitud,
                    dog.velocidad,
                    dog.regando,
                    dog.encendido,
                    dog.moviendose,
                    dog.estado_texto,
                    dog.dentro_geozona,
                    gp.nombre_sector,
                    gp.numero_sector,
                    l.nombre_lote
                FROM datos_operacion_gps dog
                LEFT JOIN geozonas_pivote gp ON dog.geozona_id = gp.id
                LEFT JOIN lotes l ON gp.lote_id = l.id
                WHERE dog.regador_id = $1
                ORDER BY dog.timestamp DESC
                LIMIT 1
            `;

            const result = await pool.query(query, [regadorId]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No hay datos de posición para este regador'
                });
            }

            res.json({
                success: true,
                data: result.rows[0]
            });

        } catch (error) {
            console.error('Error obteniendo posición actual:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Obtiene estadísticas de presión y altitud
     */
    async obtenerEstadisticasOperacion(req, res) {
        try {
            const { regadorId } = req.params;
            const { desde, hasta } = req.query;

            let query = `
                SELECT 
                    COUNT(*) as total_registros,
                    AVG(presion) as presion_promedio,
                    MIN(presion) as presion_minima,
                    MAX(presion) as presion_maxima,
                    AVG(altitud) as altitud_promedio,
                    MIN(altitud) as altitud_minima,
                    MAX(altitud) as altitud_maxima,
                    AVG(velocidad) as velocidad_promedio
                FROM datos_operacion_gps
                WHERE regador_id = $1
                  AND presion IS NOT NULL
            `;

            const params = [regadorId];

            if (desde) {
                params.push(desde);
                query += ` AND timestamp >= $${params.length}`;
            }

            if (hasta) {
                params.push(hasta);
                query += ` AND timestamp <= $${params.length}`;
            }

            const result = await pool.query(query, params);

            res.json({
                success: true,
                data: result.rows[0]
            });

        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * ⭐ FUNCIÓN CORREGIDA - Convierte tipos numéricos correctamente
     * Obtiene el estado actual en tiempo real de todos los regadores de un campo
     */
    async obtenerEstadoCampo(req, res) {
        try {
            const { campoId } = req.params;

            const query = `
                SELECT 
                    r.id as regador_id,
                    r.nombre_dispositivo,
                    r.tipo_regador,
                    r.radio_cobertura,
                    r.caudal,
                    r.tiempo_vuelta_completa,
                    r.latitud_centro,
                    r.longitud_centro,
                    r.activo as regador_activo,
                    
                    -- Estadísticas de sectores
                    COUNT(DISTINCT gp.id) as total_sectores,
                    COUNT(DISTINCT CASE WHEN esr.estado = 'completado' THEN gp.id END) as sectores_completados,
                    COUNT(DISTINCT CASE WHEN esr.estado = 'en_progreso' THEN gp.id END) as sectores_en_progreso,
                    COUNT(DISTINCT CASE 
                        WHEN esr.estado IS NULL OR esr.estado = 'pendiente' 
                        THEN gp.id 
                    END) as sectores_pendientes,
                    
                    -- Progreso promedio
                    COALESCE(AVG(COALESCE(esr.progreso_porcentaje, 0)), 0) as progreso_promedio,
                    
                    -- Agua total aplicada
                    COALESCE(SUM(esr.agua_aplicada_litros), 0) as agua_total_aplicada,
                    
                    -- Última actividad
                    MAX(dog.timestamp) as ultima_actividad,
                    
                    -- Estado actual del dispositivo
                    (SELECT estado_texto 
                     FROM datos_operacion_gps 
                     WHERE regador_id = r.id 
                     ORDER BY timestamp DESC 
                     LIMIT 1) as estado_actual,
                    
                    (SELECT regando 
                     FROM datos_operacion_gps 
                     WHERE regador_id = r.id 
                     ORDER BY timestamp DESC 
                     LIMIT 1) as regando_ahora,
                     
                    (SELECT presion 
                     FROM datos_operacion_gps 
                     WHERE regador_id = r.id 
                     ORDER BY timestamp DESC 
                     LIMIT 1) as presion_actual,
                     
                    -- Lote y sector actual
                    (SELECT l.nombre_lote 
                     FROM datos_operacion_gps dog2
                     LEFT JOIN geozonas_pivote gp2 ON dog2.geozona_id = gp2.id
                     LEFT JOIN lotes l ON gp2.lote_id = l.id
                     WHERE dog2.regador_id = r.id 
                     AND dog2.dentro_geozona = true
                     ORDER BY dog2.timestamp DESC 
                     LIMIT 1) as lote_actual,
                     
                    (SELECT gp2.numero_sector 
                     FROM datos_operacion_gps dog2
                     LEFT JOIN geozonas_pivote gp2 ON dog2.geozona_id = gp2.id
                     WHERE dog2.regador_id = r.id 
                     AND dog2.dentro_geozona = true
                     ORDER BY dog2.timestamp DESC 
                     LIMIT 1) as sector_actual
                    
                FROM regadores r
                LEFT JOIN geozonas_pivote gp ON r.id = gp.regador_id AND gp.activo = true
                LEFT JOIN estado_sectores_riego esr ON gp.id = esr.geozona_id
                LEFT JOIN datos_operacion_gps dog ON r.id = dog.regador_id
                WHERE r.campo_id = $1
                GROUP BY 
                    r.id,
                    r.nombre_dispositivo,
                    r.tipo_regador,
                    r.radio_cobertura,
                    r.caudal,
                    r.tiempo_vuelta_completa,
                    r.latitud_centro,
                    r.longitud_centro,
                    r.activo
                ORDER BY r.activo DESC, r.id
            `;

            const result = await pool.query(query, [campoId]);

            console.log(`📊 Estado campo ${campoId}:`, result.rows.length, 'regadores encontrados');

            // ⭐ CONVERTIR TIPOS NUMÉRICOS de PostgreSQL a JavaScript
            const regadoresConvertidos = result.rows.map(regador => ({
                regador_id: parseInt(regador.regador_id),
                nombre_dispositivo: regador.nombre_dispositivo,
                tipo_regador: regador.tipo_regador,
                radio_cobertura: parseFloat(regador.radio_cobertura),
                caudal: regador.caudal ? parseFloat(regador.caudal) : null,
                tiempo_vuelta_completa: regador.tiempo_vuelta_completa ? parseInt(regador.tiempo_vuelta_completa) : null,
                latitud_centro: regador.latitud_centro ? parseFloat(regador.latitud_centro) : null,
                longitud_centro: regador.longitud_centro ? parseFloat(regador.longitud_centro) : null,
                regador_activo: regador.regador_activo,

                total_sectores: parseInt(regador.total_sectores),
                sectores_completados: parseInt(regador.sectores_completados),
                sectores_en_progreso: parseInt(regador.sectores_en_progreso),
                sectores_pendientes: parseInt(regador.sectores_pendientes),

                progreso_promedio: parseFloat(regador.progreso_promedio),
                agua_total_aplicada: parseFloat(regador.agua_total_aplicada),

                ultima_actividad: regador.ultima_actividad,
                estado_actual: regador.estado_actual,
                regando_ahora: regador.regando_ahora,
                presion_actual: regador.presion_actual ? parseFloat(regador.presion_actual) : null,
                lote_actual: regador.lote_actual,
                sector_actual: regador.sector_actual ? parseInt(regador.sector_actual) : null
            }));

            // 🐛 DEBUG
            if (regadoresConvertidos.length > 0) {
                console.log('📊 Primer regador después de conversión:', JSON.stringify(regadoresConvertidos[0], null, 2));
            }

            // IMPORTANTE: Devolver array directo
            res.json(regadoresConvertidos);

        } catch (error) {
            console.error('Error obteniendo estado del campo:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = new GPSController();