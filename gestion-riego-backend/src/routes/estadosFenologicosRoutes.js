const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

router.get('/lote/:loteId', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    if (!loteId || isNaN(loteId)) {
        return res.status(400).json({ error: 'ID de lote inválido' });
    }
    try {
        const result = await pool.query(`
            SELECT id, fenologia, dias, grados_dias
            FROM estado_fenologico
            WHERE lote_id = $1
            ORDER BY dias
        `, [loteId]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener estados fenológicos del lote:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

router.post('/lote/:loteId', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    const { estados } = req.body;

    console.log('Received loteId:', loteId);
    console.log('Received estados:', estados);

    if (!loteId || isNaN(loteId)) {
        return res.status(400).json({ error: 'ID de lote inválido' });
    }

    if (!estados || !Array.isArray(estados) || estados.length === 0) {
        return res.status(400).json({ error: 'Datos de estados fenológicos inválidos' });
    }

    try {
        await pool.query('BEGIN');

        // Eliminar estados fenológicos existentes para este lote
        await pool.query('DELETE FROM estado_fenologico WHERE lote_id = $1', [loteId]);

        for (let estado of estados) {
            if (!estado.nombre || !estado.dias || isNaN(estado.dias)) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ error: 'Datos de estado fenológico inválidos' });
            }
            const gd = estado.grados_dias !== undefined && estado.grados_dias !== '' ? parseFloat(estado.grados_dias) : null;
            await pool.query(
                'INSERT INTO estado_fenologico (lote_id, fenologia, dias, grados_dias) VALUES ($1, $2, $3, $4)',
                [loteId, estado.nombre, parseInt(estado.dias, 10), gd]
            );
        }

        await pool.query('COMMIT');
        res.json({ message: 'Estados fenológicos creados con éxito' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error al crear estados fenológicos:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

router.put('/lote/:loteId', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    const { estados } = req.body;

    if (!loteId || isNaN(loteId)) {
        return res.status(400).json({ error: 'ID de lote inválido' });
    }

    if (!estados || !Array.isArray(estados) || estados.length === 0) {
        return res.status(400).json({ error: 'Datos de estados fenológicos inválidos' });
    }

    try {
        await pool.query('BEGIN');

        // Eliminar estados fenológicos existentes
        await pool.query('DELETE FROM estado_fenologico WHERE lote_id = $1', [loteId]);

        for (let estado of estados) {
            if (!estado.nombre || !estado.dias || isNaN(estado.dias)) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ error: 'Datos de estado fenológico inválidos' });
            }
            const gd = estado.grados_dias !== undefined && estado.grados_dias !== '' ? parseFloat(estado.grados_dias) : null;
            await pool.query(
                'INSERT INTO estado_fenologico (lote_id, fenologia, dias, grados_dias) VALUES ($1, $2, $3, $4)',
                [loteId, estado.nombre, parseInt(estado.dias, 10), gd]
            );
        }

        await pool.query('COMMIT');
        res.json({ message: 'Estados fenológicos actualizados con éxito' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error al actualizar estados fenológicos:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

module.exports = router;