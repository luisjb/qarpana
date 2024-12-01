const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

// Crear un nuevo lote
router.post('/', verifyToken, async (req, res) => {
    const { campo_id, nombre_lote, cultivo_id, especie, variedad, fecha_siembra, activo, campaña, porcentaje_agua_util_umbral, agua_util_total } = req.body;
    
    try {
        const result = await pool.query(
            'INSERT INTO lotes (campo_id, nombre_lote, cultivo_id, especie, variedad, fecha_siembra, activo, campaña, porcentaje_agua_util_umbral, agua_util_total) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
            [campo_id, nombre_lote, cultivo_id, especie, variedad, fecha_siembra, activo, campaña, porcentaje_agua_util_umbral, agua_util_total]
        );

        res.status(201).json({ message: 'Lote creado con éxito', loteId: result.rows[0].id });
    } catch (err) {
        console.error('Error al crear lote:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

// Obtener todos los lotes
router.get('/', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre_lote FROM lotes');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener lotes:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener lotes de un campo específico
router.get('/campo/:campoId', verifyToken, async (req, res) => {
    try {
        const { campoId } = req.params;

        const result = await pool.query(`
            WITH campo_info AS (
                SELECT nombre_campo FROM campos WHERE id = $1
            )
            SELECT 
                c.nombre_campo,
                l.id,
                l.nombre_lote,
                l.cultivo_id,
                l.especie,
                l.variedad,
                l.fecha_siembra,
                l.activo,
                l.campaña,
                l.porcentaje_agua_util_umbral,
                l.agua_util_total,
                cu.nombre_cultivo
            FROM campo_info c
            CROSS JOIN LATERAL (
                SELECT * FROM lotes WHERE campo_id = $1
            ) l
            LEFT JOIN cultivos cu ON l.cultivo_id = cu.id
        `, [campoId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Campo no encontrado o sin lotes' });
        }

        const nombreCampo = result.rows[0].nombre_campo;
        const lotes = result.rows.map(row => {
            const { nombre_campo, ...loteData } = row;
            return loteData;
        });

        res.json({ nombre_campo: nombreCampo, lotes });
    } catch (err) {
        console.error('Error al obtener lotes del campo:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar un lote
router.put('/:loteId', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    const { nombre_lote, cultivo_id, especie, variedad, fecha_siembra, activo, campaña, porcentaje_agua_util_umbral, agua_util_total } = req.body;

    try {
        const result = await pool.query(
            'UPDATE lotes SET nombre_lote = $1, cultivo_id = $2, especie = $3, variedad = $4, fecha_siembra = $5, activo = $6, campaña = $7, porcentaje_agua_util_umbral = $8, agua_util_total = $9 WHERE id = $10 RETURNING *',
            [nombre_lote, cultivo_id, especie, variedad, fecha_siembra, activo, campaña, porcentaje_agua_util_umbral, agua_util_total, loteId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Lote no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Eliminar un lote
router.delete('/:loteId', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { loteId } = req.params;

        // Eliminar registros dependientes en orden
        await client.query('DELETE FROM pronostico WHERE lote_id = $1', [loteId]);
        await client.query('DELETE FROM agua_util_inicial WHERE lote_id = $1', [loteId]);
        await client.query('DELETE FROM cambios_diarios WHERE lote_id = $1', [loteId]);
        await client.query('DELETE FROM estado_fenologico WHERE lote_id = $1', [loteId]);
        
        // Finalmente eliminar el lote
        const result = await client.query('DELETE FROM lotes WHERE id = $1 RETURNING *', [loteId]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Lote no encontrado' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Lote eliminado con éxito' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar lote:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});


// Nueva ruta para obtener el cultivo de un lote específico para una campaña
router.get('/:loteId/cultivo', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    const { campaña } = req.query;

    try {
        const result = await pool.query(
            `SELECT l.cultivo_id, l.especie, c.nombre_cultivo 
             FROM lotes l 
             LEFT JOIN cultivos c ON l.cultivo_id = c.id 
             WHERE l.id = $1 AND l.campaña = $2`,
            [loteId, campaña]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No se encontró cultivo para el lote y campaña especificados' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error al obtener cultivo del lote:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

module.exports = router;