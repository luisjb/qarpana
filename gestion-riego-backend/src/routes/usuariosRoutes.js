const express = require('express');
const router = express.Router();
const argon2 = require('argon2');
const pool = require('../db');
const { verifyToken, isAdmin } = require('../middleware/auth');

// Obtener todos los usuarios (solo admin)
router.get('/', verifyToken, isAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, nombre_usuario, tipo_usuario, email, telefono, nombre_completo, notas, fecha_creacion FROM usuarios ORDER BY nombre_usuario'
        );
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener usuarios:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Crear nuevo usuario (solo admin)
router.post('/', verifyToken, isAdmin, async (req, res) => {
    const { nombre_usuario, contraseña, tipo_usuario, email, telefono, nombre_completo, notas } = req.body;

    if (!nombre_usuario || !contraseña || !tipo_usuario) {
        return res.status(400).json({ error: 'Nombre de usuario, contraseña y tipo son requeridos' });
    }
    if (!['Admin', 'user', 'demo'].includes(tipo_usuario)) {
        return res.status(400).json({ error: 'Tipo de usuario inválido' });
    }

    try {
        const userExists = await pool.query('SELECT id FROM usuarios WHERE nombre_usuario = $1', [nombre_usuario]);
        if (userExists.rows.length > 0) {
            return res.status(409).json({ error: 'El nombre de usuario ya está registrado' });
        }

        const hashedPassword = await argon2.hash(contraseña);
        const { rows } = await pool.query(
            `INSERT INTO usuarios (nombre_usuario, contraseña, tipo_usuario, email, telefono, nombre_completo, notas)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, nombre_usuario, tipo_usuario, email, telefono, nombre_completo, notas, fecha_creacion`,
            [nombre_usuario, hashedPassword, tipo_usuario,
             email || null, telefono || null, nombre_completo || null, notas || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error al crear usuario:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar usuario (solo admin)
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre_usuario, contraseña, tipo_usuario, email, telefono, nombre_completo, notas } = req.body;

    if (tipo_usuario && !['Admin', 'user', 'demo'].includes(tipo_usuario)) {
        return res.status(400).json({ error: 'Tipo de usuario inválido' });
    }

    try {
        let query, values;
        if (contraseña) {
            const hashedPassword = await argon2.hash(contraseña);
            query = `UPDATE usuarios
                     SET nombre_usuario=$1, contraseña=$2, tipo_usuario=$3,
                         email=$4, telefono=$5, nombre_completo=$6, notas=$7
                     WHERE id=$8
                     RETURNING id, nombre_usuario, tipo_usuario, email, telefono, nombre_completo, notas, fecha_creacion`;
            values = [nombre_usuario, hashedPassword, tipo_usuario,
                      email || null, telefono || null, nombre_completo || null, notas || null, id];
        } else {
            query = `UPDATE usuarios
                     SET nombre_usuario=$1, tipo_usuario=$2,
                         email=$3, telefono=$4, nombre_completo=$5, notas=$6
                     WHERE id=$7
                     RETURNING id, nombre_usuario, tipo_usuario, email, telefono, nombre_completo, notas, fecha_creacion`;
            values = [nombre_usuario, tipo_usuario,
                      email || null, telefono || null, nombre_completo || null, notas || null, id];
        }

        const { rows } = await pool.query(query, values);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Error al actualizar usuario:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Eliminar usuario (solo admin)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
        if (rowCount === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json({ message: 'Usuario eliminado con éxito' });
    } catch (err) {
        console.error('Error al eliminar usuario:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;
