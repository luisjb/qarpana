const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../db');

// Obtener todas las recomendaciones de un campo
router.get('/campo/:campoId', verifyToken, async (req, res) => {
    try {
        const { campoId } = req.params;
        
        const query = `
            SELECT r.id, r.campo_id, r.fecha, r.texto, r.fecha_creacion, 
                   u.nombre_usuario as usuario
            FROM recomendaciones_campo r
            LEFT JOIN usuarios u ON r.usuario_id = u.id
            WHERE r.campo_id = $1
            ORDER BY r.fecha DESC, r.fecha_creacion DESC
        `;
        
        const result = await pool.query(query, [campoId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener recomendaciones:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Crear nueva recomendación - solo admins pueden crear
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { campo_id, fecha, texto } = req.body;
        const usuario_id = req.user.userId; // Extraído del token JWT
        
        // Validar datos
        if (!campo_id || !fecha || !texto) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }
        
        const result = await pool.query(
            'INSERT INTO recomendaciones_campo (campo_id, fecha, texto, usuario_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [campo_id, fecha, texto, usuario_id]
        );
        
        // Obtener el nombre del usuario para retornarlo con la recomendación
        const userResult = await pool.query('SELECT nombre_usuario FROM usuarios WHERE id = $1', [usuario_id]);
        const recomendacion = {
            ...result.rows[0],
            usuario: userResult.rows[0]?.nombre_usuario || 'Usuario'
        };
        
        res.status(201).json(recomendacion);
    } catch (error) {
        console.error('Error al crear recomendación:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Eliminar una recomendación - solo admins pueden eliminar
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM recomendaciones_campo WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recomendación no encontrada' });
        }
        
        res.json({ message: 'Recomendación eliminada con éxito' });
    } catch (error) {
        console.error('Error al eliminar recomendación:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar una recomendación - solo admins pueden actualizar
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, texto } = req.body;
        
        // Validar datos
        if (!fecha || !texto) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }
        
        const result = await pool.query(
            'UPDATE recomendaciones_campo SET fecha = $1, texto = $2 WHERE id = $3 RETURNING *',
            [fecha, texto, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recomendación no encontrada' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error al actualizar recomendación:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;