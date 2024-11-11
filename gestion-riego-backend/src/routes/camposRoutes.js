const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../db');

// Obtener todos los campos (para admin)
router.get('/all', verifyToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT c.id, c.nombre_campo, c.ubicación, u.nombre_usuario
            FROM campos c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener campos:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

// Obtener campos de un usuario específico
router.get('/user/:userId', verifyToken, isAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM campos WHERE usuario_id = $1', [req.params.userId]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener campos del usuario autenticado
router.get('/', verifyToken, async (req, res) => {
    try {
        let query;
        let values;

        if (req.user.role === 'Admin') {
            query = 'SELECT * FROM campos';
            values = [];
        } else {
            query = 'SELECT * FROM campos WHERE usuario_id = $1';
            values = [req.userId];
        }

        const { rows } = await pool.query(query, values);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener campos:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

router.get('/all', verifyToken, isAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT c.*, u.nombre_usuario 
            FROM campos c 
            LEFT JOIN usuarios u ON c.usuario_id = u.id
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Crear un nuevo campo (admin puede asignar a cualquier usuario, usuario normal solo a sí mismo)
router.post('/', verifyToken, async (req, res) => {
    const { nombre_campo, ubicacion, usuario_id } = req.body;
    const assignedUserId = req.user.isAdmin ? usuario_id : req.userId;
    
    try {
        const { rows } = await pool.query(
            'INSERT INTO campos (usuario_id, nombre_campo, ubicación) VALUES ($1, $2, $3) RETURNING *',
            [usuario_id, nombre_campo, ubicacion]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar un campo
router.put('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { nombre_campo, ubicacion, usuario_id } = req.body;
    try {
        const { rows } = await pool.query(
            'UPDATE campos SET nombre_campo = $1, ubicación = $2, usuario_id = $3 WHERE id = $4 RETURNING *',
            [nombre_campo, ubicacion, usuario_id, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Campo no encontrado' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Eliminar un campo
router.delete('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query('DELETE FROM campos WHERE id = $1', [id]);
        if (rowCount === 0) {
            return res.status(404).json({ error: 'Campo no encontrado' });
        }
        res.json({ message: 'Campo eliminado con éxito' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;