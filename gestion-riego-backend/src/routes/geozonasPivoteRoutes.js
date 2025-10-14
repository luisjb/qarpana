// src/routes/geozonasPivoteRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../db');

// Obtener configuración de geozonas para un lote y regador específico
router.get('/lote/:loteId/regador/:regadorId', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { loteId, regadorId } = req.params;
        
        // Obtener información del regador
        const regadorQuery = await client.query(
            'SELECT * FROM regadores WHERE id = $1',
            [regadorId]
        );
        
        if (regadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Regador no encontrado' });
        }
        
        const regador = regadorQuery.rows[0];
        
        // Obtener geozonas del lote para este regador
        const geozonas = await client.query(
            `SELECT * FROM geozonas_pivote 
             WHERE lote_id = $1 AND regador_id = $2 
             ORDER BY numero_sector`,
            [loteId, regadorId]
        );
        
        if (geozonas.rows.length === 0) {
            return res.status(404).json({ 
                message: 'No hay configuración existente',
                exists: false 
            });
        }
        
        // Retornar configuración completa
        res.json({
            id: geozonas.rows[0].id, // ID de la primera geozona para referencia
            latitud_centro: regador.latitud_centro,
            longitud_centro: regador.longitud_centro,
            radio_cobertura: regador.radio_cobertura,
            sectores: geozonas.rows
        });
        
    } catch (err) {
        console.error('Error al obtener geozonas:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Crear nueva configuración de geozonas
router.post('/', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const {
            regador_id,
            lote_id,
            latitud_centro,
            longitud_centro,
            radio_cobertura,
            sectores
        } = req.body;
        
        // Actualizar coordenadas y radio del regador
        await client.query(
            `UPDATE regadores 
             SET latitud_centro = $1, longitud_centro = $2, radio_cobertura = $3
             WHERE id = $4`,
            [latitud_centro, longitud_centro, radio_cobertura, regador_id]
        );
        
        // Eliminar geozonas existentes para este lote y regador
        await client.query(
            'DELETE FROM geozonas_pivote WHERE regador_id = $1 AND lote_id = $2',
            [regador_id, lote_id]
        );
        
        // Insertar nuevos sectores
        const insertPromises = sectores.map((sector) => {
            return client.query(
                `INSERT INTO geozonas_pivote (
                    regador_id, lote_id, nombre_sector, numero_sector,
                    angulo_inicio, angulo_fin, radio_interno, radio_externo,
                    activo, color_display, coeficiente_riego, prioridad
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
                [
                    regador_id,
                    lote_id,
                    sector.nombre_sector,
                    sector.numero_sector,
                    sector.angulo_inicio,
                    sector.angulo_fin,
                    sector.radio_interno || 0,
                    sector.radio_externo,
                    sector.activo !== false,
                    sector.color_display,
                    sector.coeficiente_riego || 1.0,
                    sector.prioridad || 1
                ]
            );
        });
        
        const results = await Promise.all(insertPromises);
        
        // Crear estados iniciales para los nuevos sectores
        const estadoPromises = results.map(result => {
            return client.query(
                `INSERT INTO estado_sectores_riego (geozona_id, estado) 
                 VALUES ($1, $2)
                 ON CONFLICT (geozona_id) DO NOTHING`,
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
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    } finally {
        client.release();
    }
});

// Actualizar configuración de geozonas existente
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const {
            regador_id,
            lote_id,
            latitud_centro,
            longitud_centro,
            radio_cobertura,
            sectores
        } = req.body;
        
        // Actualizar coordenadas y radio del regador
        await client.query(
            `UPDATE regadores 
             SET latitud_centro = $1, longitud_centro = $2, radio_cobertura = $3,
                 fecha_actualizacion = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [latitud_centro, longitud_centro, radio_cobertura, regador_id]
        );
        
        // Eliminar geozonas existentes
        await client.query(
            'DELETE FROM geozonas_pivote WHERE regador_id = $1 AND lote_id = $2',
            [regador_id, lote_id]
        );
        
        // Insertar sectores actualizados
        const insertPromises = sectores.map((sector) => {
            return client.query(
                `INSERT INTO geozonas_pivote (
                    regador_id, lote_id, nombre_sector, numero_sector,
                    angulo_inicio, angulo_fin, radio_interno, radio_externo,
                    activo, color_display, coeficiente_riego, prioridad
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
                [
                    regador_id,
                    lote_id,
                    sector.nombre_sector,
                    sector.numero_sector,
                    sector.angulo_inicio,
                    sector.angulo_fin,
                    sector.radio_interno || 0,
                    sector.radio_externo,
                    sector.activo !== false,
                    sector.color_display,
                    sector.coeficiente_riego || 1.0,
                    sector.prioridad || 1
                ]
            );
        });
        
        const results = await Promise.all(insertPromises);
        
        // Actualizar o crear estados de sectores
        const estadoPromises = results.map(result => {
            return client.query(
                `INSERT INTO estado_sectores_riego (geozona_id, estado) 
                 VALUES ($1, $2)
                 ON CONFLICT (geozona_id) 
                 DO UPDATE SET ultima_actualizacion = CURRENT_TIMESTAMP`,
                [result.rows[0].id, 'pendiente']
            );
        });
        
        await Promise.all(estadoPromises);
        await client.query('COMMIT');
        
        res.json({ 
            message: 'Geozonas actualizadas con éxito',
            sectores: results.map(r => r.rows[0])
        });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar geozonas:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    } finally {
        client.release();
    }
});

// Eliminar configuración de geozonas
router.delete('/lote/:loteId/regador/:regadorId', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { loteId, regadorId } = req.params;
        
        // Eliminar estados de sectores primero
        await client.query(
            `DELETE FROM estado_sectores_riego 
             WHERE geozona_id IN (
                 SELECT id FROM geozonas_pivote 
                 WHERE lote_id = $1 AND regador_id = $2
             )`,
            [loteId, regadorId]
        );
        
        // Eliminar geozonas
        const result = await client.query(
            'DELETE FROM geozonas_pivote WHERE lote_id = $1 AND regador_id = $2 RETURNING *',
            [loteId, regadorId]
        );
        
        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No se encontraron geozonas para eliminar' });
        }
        
        await client.query('COMMIT');
        res.json({ message: 'Geozonas eliminadas con éxito' });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar geozonas:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Obtener todas las geozonas de un regador
router.get('/regador/:regadorId', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { regadorId } = req.params;
        
        const query = `
            SELECT 
                gp.*,
                l.nombre_lote,
                esr.estado,
                esr.progreso_porcentaje,
                esr.agua_aplicada_litros
            FROM geozonas_pivote gp
            LEFT JOIN lotes l ON gp.lote_id = l.id
            LEFT JOIN estado_sectores_riego esr ON gp.id = esr.geozona_id
            WHERE gp.regador_id = $1
            ORDER BY l.nombre_lote, gp.numero_sector
        `;
        
        const { rows } = await client.query(query, [regadorId]);
        res.json(rows);
        
    } catch (err) {
        console.error('Error al obtener geozonas del regador:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

module.exports = router;