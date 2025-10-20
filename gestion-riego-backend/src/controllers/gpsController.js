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
            
            // IMPORTANTE: Devolver directamente el array, no wrapped en .data
            // Porque axios ya parsea response.data, entonces:
            // Backend: res.json([...])  →  Frontend: response.data = [...]
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
            
            // Obtener información del regador y geozonas
            const queryRegador = `
                SELECT r.*, COUNT(gp.id) as total_sectores
                FROM regadores r
                LEFT JOIN geozonas_pivote gp ON r.id = gp.regador_id AND gp.activo = true
                WHERE r.id = $1
                GROUP BY r.id
            `;
            
            const regadorResult = await pool.query(queryRegador, [regadorId]);
            
            if (regadorResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Regador no encontrado'
                });
            }
            
            const regador = regadorResult.rows[0];
            
            // Obtener estado actual de cada sector
            const querySectores = `
                SELECT 
                    gp.id,
                    gp.nombre_sector,
                    gp.numero_sector,
                    gp.angulo_inicio,
                    gp.angulo_fin,
                    gp.radio_interno,
                    gp.radio_externo,
                    gp.color_display,
                    gp.activo,
                    gp.coeficiente_riego,
                    esr.estado,
                    esr.progreso_porcentaje,
                    esr.agua_aplicada_litros,
                    esr.fecha_inicio_real,
                    esr.ultima_actualizacion,
                    l.nombre_lote
                FROM geozonas_pivote gp
                LEFT JOIN estado_sectores_riego esr ON gp.id = esr.geozona_id
                LEFT JOIN lotes l ON gp.lote_id = l.id
                WHERE gp.regador_id = $1
                ORDER BY gp.numero_sector
            `;
            
            const sectoresResult = await pool.query(querySectores, [regadorId]);
            
            // Calcular área de cada sector y totales
            let totalAreaRegada = 0;
            let totalAguaAplicada = 0;
            let sectoresActivos = 0;
            let sectoresCompletados = 0;
            
            const sectoresConDatos = sectoresResult.rows.map(sector => {
                const area = gpsCalc.calcularAreaSector(sector);
                const areaHectareas = area / 10000;
                
                if (sector.estado === 'completado' && sector.agua_aplicada_litros) {
                    totalAreaRegada += areaHectareas;
                    totalAguaAplicada += parseFloat(sector.agua_aplicada_litros || 0);
                    sectoresCompletados++;
                }
                
                if (sector.estado === 'en_progreso') {
                    sectoresActivos++;
                }
                
                const laminaMM = sector.agua_aplicada_litros 
                    ? gpsCalc.calcularLaminaAplicada(sector.agua_aplicada_litros, area)
                    : 0;
                
                return {
                    ...sector,
                    area_m2: area,
                    area_hectareas: areaHectareas,
                    lamina_aplicada_mm: laminaMM
                };
            });
            
            // Obtener ciclos completados hoy
            const queryCiclosHoy = `
                SELECT 
                    COUNT(*) as ciclos_completados,
                    SUM(agua_aplicada_litros) as agua_total_hoy,
                    AVG(presion_promedio) as presion_promedio_hoy
                FROM ciclos_riego
                WHERE regador_id = $1
                  AND DATE(fecha_fin) = CURRENT_DATE
            `;
            
            const ciclosHoyResult = await pool.query(queryCiclosHoy, [regadorId]);
            const ciclosHoy = ciclosHoyResult.rows[0];
            
            // Calcular mm/ha promedio
            const mmPorHectarea = totalAreaRegada > 0 
                ? (totalAguaAplicada * 0.001 / totalAreaRegada) * 1000 / totalAreaRegada
                : 0;
            
            res.json({
                success: true,
                data: {
                    regador: {
                        id: regador.id,
                        nombre: regador.nombre_dispositivo,
                        tipo: regador.tipo_regador,
                        radio_cobertura: regador.radio_cobertura,
                        caudal: regador.caudal,
                        activo: regador.activo
                    },
                    resumen: {
                        total_sectores: regador.total_sectores,
                        sectores_completados: sectoresCompletados,
                        sectores_activos: sectoresActivos,
                        area_total_regada_ha: parseFloat(totalAreaRegada.toFixed(2)),
                        agua_total_aplicada_litros: parseFloat(totalAguaAplicada.toFixed(0)),
                        agua_total_aplicada_m3: parseFloat((totalAguaAplicada / 1000).toFixed(2)),
                        lamina_promedio_mm: parseFloat(mmPorHectarea.toFixed(1)),
                        ciclos_completados_hoy: parseInt(ciclosHoy.ciclos_completados || 0),
                        agua_aplicada_hoy_litros: parseFloat(ciclosHoy.agua_total_hoy || 0),
                        presion_promedio_hoy: parseFloat(ciclosHoy.presion_promedio_hoy || 0)
                    },
                    sectores: sectoresConDatos
                }
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
     * Obtiene el historial de ciclos de riego
     */
    async obtenerHistorialRiego(req, res) {
        try {
            const { regadorId } = req.params;
            const { desde, hasta, geozonaId } = req.query;
            
            let query = `
                SELECT 
                    cr.*,
                    gp.nombre_sector,
                    gp.numero_sector,
                    l.nombre_lote
                FROM ciclos_riego cr
                JOIN geozonas_pivote gp ON cr.geozona_id = gp.id
                LEFT JOIN lotes l ON gp.lote_id = l.id
                WHERE cr.regador_id = $1
            `;
            
            const params = [regadorId];
            
            if (geozonaId) {
                params.push(geozonaId);
                query += ` AND cr.geozona_id = $${params.length}`;
            }
            
            if (desde) {
                params.push(desde);
                query += ` AND cr.fecha_inicio >= $${params.length}`;
            }
            
            if (hasta) {
                params.push(hasta);
                query += ` AND cr.fecha_fin <= $${params.length}`;
            }
            
            query += ' ORDER BY cr.fecha_inicio DESC LIMIT 100';
            
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
            const { limit = 50 } = req.query;
            
            const query = `
                SELECT 
                    er.*,
                    gp.nombre_sector,
                    gp.numero_sector
                FROM eventos_riego er
                LEFT JOIN geozonas_pivote gp ON er.geozona_id = gp.id
                WHERE er.regador_id = $1
                ORDER BY er.fecha_evento DESC
                LIMIT $2
            `;
            
            const result = await pool.query(query, [regadorId, limit]);
            
            res.json({
                success: true,
                count: result.rows.length,
                data: result.rows
            });
            
        } catch (error) {
            console.error('Error obteniendo eventos de riego:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    /**
     * Obtiene la posición actual del regador
     */
    async obtenerPosicionActual(req, res) {
        try {
            const { regadorId } = req.params;
            
            const query = `
                SELECT 
                    dog.*,
                    gp.nombre_sector,
                    gp.numero_sector,
                    gp.color_display
                FROM datos_operacion_gps dog
                LEFT JOIN geozonas_pivote gp ON dog.geozona_id = gp.id
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
     * Obtiene el estado actual en tiempo real de todos los regadores de un campo
     */
    async obtenerEstadoCampo(req, res) {
        try {
            const { campoId } = req.params;
            
            const query = `
                SELECT * FROM v_estado_actual_regadores
                WHERE regador_id IN (
                    SELECT id FROM regadores WHERE campo_id = $1
                )
            `;
            
            const result = await pool.query(query, [campoId]);
            
            res.json({
                success: true,
                count: result.rows.length,
                data: result.rows
            });
            
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