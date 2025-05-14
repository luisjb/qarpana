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

        if (req.user.role?.toLowerCase() === 'admin') {
            // Administrador puede ver todos los campos
            query = `
                SELECT c.*, 
                       (SELECT STRING_AGG(u.nombre_usuario, ', ')
                        FROM usuarios u
                        WHERE u.id = ANY(c.usuarios_ids)) as usuarios_nombres
                FROM campos c
                ORDER BY c.nombre_campo
            `;
        } else {
            // Usuario normal ve solo sus campos
            query = `
                SELECT c.*, 
                       (SELECT STRING_AGG(u.nombre_usuario, ', ')
                        FROM usuarios u
                        WHERE u.id = ANY(c.usuarios_ids)) as usuarios_nombres
                FROM campos c
                WHERE $1 = ANY(c.usuarios_ids) OR c.usuario_id = $1
                ORDER BY c.nombre_campo
            `;
            values = [req.user.userId];
        }

        const { rows } = await client.query(query, values);
        
        // Convertir los datos para mantener compatibilidad con el frontend
        const processedRows = rows.map(row => ({
            ...row,
            // Si el campo tiene usuario_id antiguo pero no usuarios_ids, lo convertimos
            usuarios_ids: row.usuarios_ids || (row.usuario_id ? [row.usuario_id] : [])
        }));

        res.json(processedRows);
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
    const { nombre_campo, ubicacion, usuarios_ids, estacion_id } = req.body;
    
    // Asegurarnos de que usuarios_ids sea un array
    const userIdsArray = Array.isArray(usuarios_ids) ? usuarios_ids : [usuarios_ids].filter(Boolean);
    
    try {
        // Insertar el campo con array de usuarios
        const { rows } = await pool.query(
            'INSERT INTO campos (nombre_campo, ubicacion, estacion_id, usuarios_ids, usuario_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [
                nombre_campo, 
                ubicacion, 
                estacion_id, 
                userIdsArray, 
                userIdsArray.length > 0 ? userIdsArray[0] : null // Mantener compatibilidad con usuario_id
            ]
        );
        
        // Obtener nombres de usuarios para la respuesta
        const userResult = await pool.query(
            'SELECT id, nombre_usuario FROM usuarios WHERE id = ANY($1)',
            [userIdsArray]
        );
        
        const campoWithUsers = {
            ...rows[0],
            usuarios_nombres: userResult.rows.map(u => u.nombre_usuario).join(', ')
        };
        
        res.status(201).json(campoWithUsers);
    } catch (err) {
        console.error('Error al crear campo:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar un campo
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre_campo, ubicacion, usuarios_ids, estacion_id } = req.body;
    
    // Asegurarnos de que usuarios_ids sea un array
    const userIdsArray = Array.isArray(usuarios_ids) ? usuarios_ids : [usuarios_ids].filter(Boolean);
    
    try {
        // Actualizar el campo
        const { rows } = await pool.query(
            'UPDATE campos SET nombre_campo = $1, ubicacion = $2, estacion_id = $3, usuarios_ids = $4, usuario_id = $5 WHERE id = $6 RETURNING *',
            [
                nombre_campo, 
                ubicacion, 
                estacion_id, 
                userIdsArray,
                userIdsArray.length > 0 ? userIdsArray[0] : null, // Mantener compatibilidad con usuario_id
                id
            ]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Campo no encontrado' });
        }
        
        // Obtener nombres de usuarios para la respuesta
        const userResult = await pool.query(
            'SELECT id, nombre_usuario FROM usuarios WHERE id = ANY($1)',
            [userIdsArray]
        );
        
        const campoWithUsers = {
            ...rows[0],
            usuarios_nombres: userResult.rows.map(u => u.nombre_usuario).join(', ')
        };
        
        res.json(campoWithUsers);
    } catch (err) {
        console.error('Error al actualizar campo:', err);
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

// Migrar datos existentes de usuario_id a usuarios_ids
router.post('/migrate-users', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Actualizar todos los campos que tienen usuario_id pero no usuarios_ids
        await client.query(`
            UPDATE campos 
            SET usuarios_ids = ARRAY[usuario_id]
            WHERE usuario_id IS NOT NULL AND (usuarios_ids IS NULL OR array_length(usuarios_ids, 1) IS NULL)
        `);
        
        await client.query('COMMIT');
        res.json({ message: 'Migración completada con éxito' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error en la migración:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

module.exports = router;