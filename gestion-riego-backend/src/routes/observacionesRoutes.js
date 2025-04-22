const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../db');

// Obtener todas las observaciones de un lote
router.get('/lote/:loteId', verifyToken, async (req, res) => {
    try {
        const { loteId } = req.params;
        const { campaña } = req.query;
        
        let query = `
            SELECT o.id, o.lote_id, o.fecha, o.texto, o.fecha_creacion, 
                   u.nombre_usuario as usuario
            FROM observaciones o
            LEFT JOIN usuarios u ON o.usuario_id = u.id
            WHERE o.lote_id = $1
        `;
        
        const params = [loteId];
        
        // Si se proporciona campaña, filtrar por fechas dentro de esa campaña
        if (campaña) {
            query += `
                AND o.fecha >= (
                    SELECT fecha_siembra FROM lotes 
                    WHERE id = $1 AND campaña = $2
                )
            `;
            params.push(campaña);
        }
        
        query += ` ORDER BY o.fecha DESC, o.fecha_creacion DESC`;
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Error al obtener observaciones:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Crear nueva observación - solo admins pueden crear
router.post('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { lote_id, fecha, texto } = req.body;
        const usuario_id = req.user.userId; // Extraído del token JWT
        
        // Validar datos
        if (!lote_id || !fecha || !texto) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }
        
        const result = await pool.query(
            'INSERT INTO observaciones (lote_id, fecha, texto, usuario_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [lote_id, fecha, texto, usuario_id]
        );
        
        // Obtener el nombre del usuario para retornarlo con la observación
        const userResult = await pool.query('SELECT nombre_usuario FROM usuarios WHERE id = $1', [usuario_id]);
        const observacion = {
            ...result.rows[0],
            usuario: userResult.rows[0]?.nombre_usuario || 'Usuario'
        };
        
        res.status(201).json(observacion);
    } catch (error) {
        console.error('Error al crear observación:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Eliminar una observación - solo admins pueden eliminar
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM observaciones WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Observación no encontrada' });
        }
        
        res.json({ message: 'Observación eliminada con éxito' });
    } catch (error) {
        console.error('Error al eliminar observación:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar una observación - solo admins pueden actualizar
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, texto } = req.body;
        
        // Validar datos
        if (!fecha || !texto) {
            return res.status(400).json({ error: 'Todos los campos son obligatorios' });
        }
        
        const result = await pool.query(
            'UPDATE observaciones SET fecha = $1, texto = $2 WHERE id = $3 RETURNING *',
            [fecha, texto, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Observación no encontrada' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error al actualizar observación:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;