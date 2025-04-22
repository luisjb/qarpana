const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

// Obtener todos los cultivos disponibles
// Ruta para obtener todos los cultivos (para el diálogo de corrección de días)
router.get('/', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombre_cultivo, indice_capacidad_extraccion
            FROM cultivos
            ORDER BY id`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener todos los cultivos:', error);
        res.status(500).json({ 
            error: 'Error del servidor', 
            details: error.message
        });
    }
});

// Crear un nuevo cultivo (solo admin)
router.post('/', verifyToken, async (req, res) => {
    const { nombre_cultivo, crecimiento_radicular, capacidad_extraccion } = req.body;
    try {
        const { rows } = await pool.query(
            'INSERT INTO cultivos (nombre_cultivo, crecimiento_radicular, capacidad_extraccion) VALUES ($1, $2, $3) RETURNING *',
            [nombre_cultivo, crecimiento_radicular, capacidad_extraccion]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

router.get('/lote/:loteId', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    const { campaña } = req.query;

    try {
        const result = await pool.query(
            'SELECT DISTINCT especie FROM lotes WHERE id = $1 AND campaña = $2',
            [loteId, campaña]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No se encontraron cultivos para este lote y campaña' });
        }

        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener cultivos:', error);
        res.status(500).json({ 
            error: 'Error del servidor', 
            details: error.message
        });
    }
});

module.exports = router;