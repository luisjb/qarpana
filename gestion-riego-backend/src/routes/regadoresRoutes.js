const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../db');

// Obtener todos los regadores de un campo
router.get('/campo/:campoId', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { campoId } = req.params;
        
        const query = `
            SELECT 
                r.*,
                COUNT(gp.id) as total_sectores,
                COUNT(CASE WHEN gp.activo THEN 1 END) as sectores_activos
            FROM regadores r
            LEFT JOIN geozonas_pivote gp ON r.id = gp.regador_id
            WHERE r.campo_id = $1
            GROUP BY r.id
            ORDER BY r.fecha_creacion DESC
        `;
        
        const { rows } = await client.query(query, [campoId]);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener regadores:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Crear un nuevo regador
router.post('/', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const {
            campo_id,
            nombre_dispositivo,
            tipo_regador,
            radio_cobertura_default,
            caudal,
            tiempo_vuelta_completa,
            latitud_centro,
            longitud_centro
        } = req.body;

        // Validación: radio_cobertura_default es requerido
        if (!radio_cobertura_default || radio_cobertura_default <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'El radio de cobertura es requerido y debe ser mayor a 0' 
            });
        }

        // Verificar que no exista otro regador con el mismo nombre en el campo
        const existeRegador = await client.query(
            'SELECT id FROM regadores WHERE campo_id = $1 AND nombre_dispositivo = $2',
            [campo_id, nombre_dispositivo]
        );

        if (existeRegador.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Ya existe un regador con ese nombre en este campo' 
            });
        }

        const insertQuery = `
            INSERT INTO regadores (
                campo_id, nombre_dispositivo, tipo_regador, radio_cobertura,
                caudal, tiempo_vuelta_completa, latitud_centro, longitud_centro
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;

        const { rows } = await client.query(insertQuery, [
            campo_id,
            nombre_dispositivo,
            tipo_regador,
            parseFloat(radio_cobertura_default),
            caudal ? parseFloat(caudal) : null,
            tiempo_vuelta_completa ? parseInt(tiempo_vuelta_completa) : null,
            latitud_centro || null,
            longitud_centro || null
        ]);

        await client.query('COMMIT');
        res.status(201).json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear regador:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Actualizar un regador
router.put('/:regadorId', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const { regadorId } = req.params;
        const {
            nombre_dispositivo,
            tipo_regador,
            radio_cobertura_default,
            caudal,
            tiempo_vuelta_completa,
            latitud_centro,
            longitud_centro,
            activo
        } = req.body;

        const updateQuery = `
            UPDATE regadores SET 
                nombre_dispositivo = $1,
                tipo_regador = $2,
                radio_cobertura = $3,
                caudal = $4,
                tiempo_vuelta_completa = $5,
                latitud_centro = $6,
                longitud_centro = $7,
                activo = COALESCE($8, activo),
                fecha_actualizacion = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `;

        const { rows } = await client.query(updateQuery, [
            nombre_dispositivo,
            tipo_regador,
            radio_cobertura_default ? parseFloat(radio_cobertura_default) : null,
            caudal ? parseFloat(caudal) : null,
            tiempo_vuelta_completa ? parseInt(tiempo_vuelta_completa) : null,
            latitud_centro || null,
            longitud_centro || null,
            activo,
            regadorId
        ]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Regador no encontrado' });
        }

        res.json(rows[0]);
    } catch (err) {
        console.error('Error al actualizar regador:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Eliminar un regador
router.delete('/:regadorId', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { regadorId } = req.params;

        // Eliminar primero los sectores asociados
        await client.query('DELETE FROM estado_sectores_riego WHERE geozona_id IN (SELECT id FROM geozonas_pivote WHERE regador_id = $1)', [regadorId]);
        await client.query('DELETE FROM eventos_riego WHERE regador_id = $1', [regadorId]);
        await client.query('DELETE FROM geozonas_pivote WHERE regador_id = $1', [regadorId]);
        
        // Eliminar el regador
        const result = await client.query('DELETE FROM regadores WHERE id = $1 RETURNING *', [regadorId]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Regador no encontrado' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Regador eliminado con éxito' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar regador:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Obtener geozonas de un regador
router.get('/:regadorId/geozonas', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { regadorId } = req.params;
        
        const query = `
            SELECT 
                gp.*,
                l.nombre_lote,
                esr.estado,
                esr.progreso_porcentaje,
                esr.agua_aplicada_litros,
                esr.fecha_inicio_real,
                esr.fecha_fin_real
            FROM geozonas_pivote gp
            LEFT JOIN lotes l ON gp.lote_id = l.id
            LEFT JOIN estado_sectores_riego esr ON gp.id = esr.geozona_id
            WHERE gp.regador_id = $1
            ORDER BY gp.numero_sector
        `;
        
        const { rows } = await client.query(query, [regadorId]);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener geozonas:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Crear/actualizar geozonas de un lote para un regador
router.post('/:regadorId/geozonas', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { regadorId } = req.params;
        const { lote_id, sectores } = req.body;

        // Eliminar sectores existentes para este lote y regador
        await client.query(
            'DELETE FROM geozonas_pivote WHERE regador_id = $1 AND lote_id = $2',
            [regadorId, lote_id]
        );

        // Insertar nuevos sectores
        const insertPromises = sectores.map((sector, index) => {
            const insertQuery = `
                INSERT INTO geozonas_pivote (
                    regador_id, lote_id, nombre_sector, numero_sector,
                    angulo_inicio, angulo_fin, radio_interno, radio_externo,
                    activo, color_display, coeficiente_riego, prioridad
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
            `;
            
            return client.query(insertQuery, [
                regadorId,
                lote_id,
                sector.nombre_sector,
                sector.numero_sector || (index + 1),
                sector.angulo_inicio,
                sector.angulo_fin,
                sector.radio_interno || 0,
                sector.radio_externo,
                sector.activo !== false,
                sector.color_display || '#4CAF50',
                sector.coeficiente_riego || 1.0,
                sector.prioridad || 1
            ]);
        });

        const results = await Promise.all(insertPromises);
        
        // Crear estados iniciales para los nuevos sectores
        const estadoPromises = results.map(result => {
            return client.query(
                'INSERT INTO estado_sectores_riego (geozona_id, estado) VALUES ($1, $2)',
                [result.rows[0].id, 'pendiente']
            );
        });

        await Promise.all(estadoPromises);
        await client.query('COMMIT');
        
        res.status(201).json({ 
            message: 'Geozonas creadas con éxito',
            sectores: results.map(r => r.rows[0])
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear geozonas:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Obtener estado de riego de un campo
router.get('/campo/:campoId/estado-riego', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { campoId } = req.params;
        
        const query = `
            SELECT 
                r.id as regador_id,
                r.nombre_dispositivo,
                r.tipo_regador,
                r.radio_cobertura,
                r.activo as regador_activo,
                COUNT(gp.id) as total_sectores,
                COUNT(CASE WHEN esr.estado = 'completado' THEN 1 END) as sectores_completados,
                COUNT(CASE WHEN esr.estado = 'en_progreso' THEN 1 END) as sectores_en_progreso,
                COUNT(CASE WHEN esr.estado = 'pendiente' THEN 1 END) as sectores_pendientes,
                AVG(esr.progreso_porcentaje) as progreso_promedio,
                SUM(esr.agua_aplicada_litros) as agua_total_aplicada,
                MAX(er.fecha_evento) as ultima_actividad
            FROM regadores r
            LEFT JOIN geozonas_pivote gp ON r.id = gp.regador_id
            LEFT JOIN estado_sectores_riego esr ON gp.id = esr.geozona_id
            LEFT JOIN eventos_riego er ON r.id = er.regador_id
            WHERE r.campo_id = $1
            GROUP BY r.id, r.nombre_dispositivo, r.tipo_regador, r.radio_cobertura, r.activo
            ORDER BY r.nombre_dispositivo
        `;
        
        const { rows } = await client.query(query, [campoId]);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener estado de riego:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Obtener eventos de riego recientes
router.get('/:regadorId/eventos', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { regadorId } = req.params;
        const { limit = 50 } = req.query;
        
        const query = `
            SELECT 
                er.*,
                gp.nombre_sector,
                l.nombre_lote
            FROM eventos_riego er
            LEFT JOIN geozonas_pivote gp ON er.geozona_id = gp.id
            LEFT JOIN lotes l ON gp.lote_id = l.id
            WHERE er.regador_id = $1
            ORDER BY er.fecha_evento DESC
            LIMIT $2
        `;
        
        const { rows } = await client.query(query, [regadorId, limit]);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener eventos de riego:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Obtener datos de operación del GPS (histórico)
router.get('/:regadorId/datos-operacion', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { regadorId } = req.params;
        const { desde, hasta, incluir_presion, incluir_altitud, limit = 1000 } = req.query;
        
        // Construir query dinámicamente según parámetros
        let query = `
            SELECT 
                dog.id,
                dog.timestamp,
                dog.latitud,
                dog.longitud,
                dog.velocidad,
                dog.curso,
                dog.angulo_actual,
                dog.distancia_centro,
                dog.dentro_geozona,
                dog.regando,
                dog.encendido,
                dog.moviendose,
                dog.estado_texto
                ${incluir_presion === 'true' ? ', dog.presion, dog.io9_raw' : ''}
                ${incluir_altitud === 'true' ? ', dog.altitud' : ''},
                gp.nombre_sector,
                gp.numero_sector,
                l.nombre_lote
            FROM datos_operacion_gps dog
            LEFT JOIN geozonas_pivote gp ON dog.geozona_id = gp.id
            LEFT JOIN lotes l ON gp.lote_id = l.id
            WHERE dog.regador_id = $1
        `;
        
        const params = [regadorId];
        let paramIndex = 2;
        
        if (desde) {
            query += ` AND dog.timestamp >= $${paramIndex}::timestamp`;
            params.push(desde);
            paramIndex++;
        }
        
        if (hasta) {
            query += ` AND dog.timestamp <= $${paramIndex}::timestamp`;
            params.push(hasta);
            paramIndex++;
        }
        
        query += ` ORDER BY dog.timestamp DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));
        
        const { rows } = await client.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener datos de operación:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    } finally {
        client.release();
    }
});

// Obtener último estado conocido del regador
router.get('/:regadorId/ultimo-estado', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { regadorId } = req.params;
        
        const query = `
            SELECT 
                dog.*,
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
        
        const { rows } = await client.query(query, [regadorId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No hay datos de operación para este regador' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Error al obtener último estado:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Obtener ciclos de riego completados
router.get('/:regadorId/ciclos-riego', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { regadorId } = req.params;
        const { desde, hasta, limit = 50 } = req.query;
        
        let query = `
            SELECT 
                cr.*,
                gp.nombre_sector,
                l.nombre_lote
            FROM ciclos_riego cr
            LEFT JOIN geozonas_pivote gp ON cr.geozona_id = gp.id
            LEFT JOIN lotes l ON gp.lote_id = l.id
            WHERE cr.regador_id = $1
        `;
        
        const params = [regadorId];
        let paramIndex = 2;
        
        if (desde) {
            query += ` AND cr.fecha_inicio >= $${paramIndex}::timestamp`;
            params.push(desde);
            paramIndex++;
        }
        
        if (hasta) {
            query += ` AND cr.fecha_fin <= $${paramIndex}::timestamp`;
            params.push(hasta);
            paramIndex++;
        }
        
        query += ` ORDER BY cr.fecha_inicio DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));
        
        const { rows } = await client.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener ciclos de riego:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Obtener estadísticas del regador
router.get('/:regadorId/estadisticas', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { regadorId } = req.params;
        const { periodo = '7' } = req.query; // Días por defecto
        
        const query = `
            SELECT 
                COUNT(DISTINCT DATE(dog.timestamp)) as dias_operacion,
                COUNT(*) as total_registros,
                AVG(dog.presion) as presion_promedio,
                MIN(dog.presion) as presion_minima,
                MAX(dog.presion) as presion_maxima,
                AVG(dog.velocidad) as velocidad_promedio,
                SUM(CASE WHEN dog.regando THEN 1 ELSE 0 END) as registros_regando,
                SUM(CASE WHEN dog.moviendose THEN 1 ELSE 0 END) as registros_movimiento,
                COUNT(DISTINCT dog.geozona_id) as sectores_visitados
            FROM datos_operacion_gps dog
            WHERE dog.regador_id = $1
                AND dog.timestamp >= NOW() - INTERVAL '${parseInt(periodo)} days'
        `;
        
        const { rows } = await client.query(query, [regadorId]);
        
        // Obtener agua aplicada en el período
        const aguaQuery = `
            SELECT 
                COALESCE(SUM(agua_aplicada_litros), 0) as agua_total_aplicada,
                COUNT(*) as ciclos_completados,
                AVG(duracion_minutos) as duracion_promedio
            FROM ciclos_riego
            WHERE regador_id = $1
                AND fecha_inicio >= NOW() - INTERVAL '${parseInt(periodo)} days'
                AND completado = true
        `;
        
        const aguaResult = await client.query(aguaQuery, [regadorId]);
        
        res.json({
            operacion: rows[0],
            riego: aguaResult.rows[0]
        });
    } catch (err) {
        console.error('Error al obtener estadísticas:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

module.exports = router;