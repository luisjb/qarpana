const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

// Obtener agua útil inicial de un lote
router.get('/:loteId', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    
    try {
        const result = await pool.query(
            'SELECT valor, estratos FROM agua_util_inicial WHERE lote_id = $1 ORDER BY estratos',
            [loteId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener agua útil inicial:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

// Actualizar agua útil inicial de un lote
router.post('/:loteId', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    const { agua_util_inicial } = req.body;

    if (!Array.isArray(agua_util_inicial)) {
        return res.status(400).json({ error: 'agua_util_inicial debe ser un array' });
    }

    try {
        await pool.query('BEGIN');

        // Eliminar registros existentes para este lote
        await pool.query('DELETE FROM agua_util_inicial WHERE lote_id = $1', [loteId]);

        // Insertar nuevos valores
        for (const { estrato, valor } of agua_util_inicial) {
            await pool.query(
                'INSERT INTO agua_util_inicial (lote_id, estratos, valor) VALUES ($1, $2, $3)',
                [loteId, estrato, valor]
            );
        }

        await pool.query('COMMIT');

        res.status(200).json({ message: 'Agua útil inicial actualizada con éxito' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error al actualizar agua útil inicial:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

module.exports = router;