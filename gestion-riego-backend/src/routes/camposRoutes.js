const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../db');

// Obtener todos los campos (para admin)
router.get('/all', verifyToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT c.id, c.nombre_campo, c.ubicacion, u.nombre_usuario
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
    const client = await pool.connect();
    try {
        let query;
        let values = [];

        console.log('User data from token:', req.user); // Debug log

        if (req.user.role?.toLowerCase() === 'admin') {
            query = `
                SELECT c.*, u.nombre_usuario as usuario_asignado
                FROM campos c
                LEFT JOIN usuarios u ON u.id = c.usuario_id
                ORDER BY c.nombre_campo
            `;
        } else {
            query = `
                SELECT c.* 
                FROM campos c
                WHERE c.usuario_id = $1
                ORDER BY c.nombre_campo
            `;
            values = [req.user.userId]; // Usando userId en lugar de id
        }

        console.log('Query:', query, 'Values:', values); // Debug log
        const { rows } = await client.query(query, values);
        console.log('Rows returned:', rows.length); // Debug log

        res.json(rows);
    } catch (err) {
        console.error('Error al obtener campos:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
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
            'INSERT INTO campos (usuario_id, nombre_campo, ubicacion) VALUES ($1, $2, $3) RETURNING *',
            [usuario_id, nombre_campo, ubicacion]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar un campo
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre_campo, ubicacion, usuario_id } = req.body;
    try {
        const { rows } = await pool.query(
            'UPDATE campos SET nombre_campo = $1, ubicacion = $2, usuario_id = $3 WHERE id = $4 RETURNING *',
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
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;

        // Obtener los lotes asociados al campo
        const lotes = await client.query('SELECT id FROM lotes WHERE campo_id = $1', [id]);

        // Eliminar registros dependientes para cada lote
        for (const lote of lotes.rows) {
            await client.query('DELETE FROM pronostico WHERE lote_id = $1', [lote.id]);
            await client.query('DELETE FROM agua_util_inicial WHERE lote_id = $1', [lote.id]);
            await client.query('DELETE FROM cambios_diarios WHERE lote_id = $1', [lote.id]);
            await client.query('DELETE FROM estado_fenologico WHERE lote_id = $1', [lote.id]);
        }

        // Eliminar los lotes del campo
        await client.query('DELETE FROM lotes WHERE campo_id = $1', [id]);
        
        // Finalmente eliminar el campo
        const result = await client.query('DELETE FROM campos WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Campo no encontrado' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Campo eliminado con éxito' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar campo:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

module.exports = router;