const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

router.get('/', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, especie, etapa, dias, grados_dias, orden FROM fenologia_default ORDER BY especie, orden'
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

router.put('/:especie', verifyToken, async (req, res) => {
    const { especie } = req.params;
    const { etapas } = req.body;

    if (!etapas || !Array.isArray(etapas) || etapas.length === 0) {
        return res.status(400).json({ error: 'Datos de etapas inválidos' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM fenologia_default WHERE especie = $1', [especie]);
        for (const e of etapas) {
            await client.query(
                'INSERT INTO fenologia_default (especie, etapa, dias, grados_dias, orden) VALUES ($1, $2, $3, $4, $5)',
                [especie, e.etapa, parseInt(e.dias, 10), parseFloat(e.grados_dias), e.orden]
            );
        }
        await client.query('COMMIT');
        res.json({ message: 'Fenología actualizada con éxito' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    } finally {
        client.release();
    }
});

router.post('/:especie', verifyToken, async (req, res) => {
    const { especie } = req.params;
    const { etapa, dias, grados_dias } = req.body;

    try {
        const maxOrden = await pool.query(
            'SELECT COALESCE(MAX(orden), 0) + 1 AS next_orden FROM fenologia_default WHERE especie = $1',
            [especie]
        );
        const orden = maxOrden.rows[0].next_orden;
        const result = await pool.query(
            'INSERT INTO fenologia_default (especie, etapa, dias, grados_dias, orden) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [especie, etapa, parseInt(dias, 10), parseFloat(grados_dias), orden]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

module.exports = router;
