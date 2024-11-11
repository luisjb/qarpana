const express = require('express');
const router = express.Router();
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// Función para generar el token JWT
const generateToken = (user) => {
    return jwt.sign(
        { 
            userId: user.id, 
            role: user.tipo_usuario 
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' } // Token expira en 1 hora
    );
};

router.post('/login', async (req, res) => {
    console.log('Received login request:', req.body); // Log para depuración

    const { nombre_usuario, contraseña } = req.body;

    if (!nombre_usuario || !contraseña) {
        return res.status(400).json({ error: 'Nombre de usuario y contraseña son requeridos' });
    }

    try {
        const result = await pool.query('SELECT * FROM usuarios WHERE nombre_usuario = $1', [nombre_usuario]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (await argon2.verify(user.contraseña, contraseña)) {
                const token = generateToken(user);
                res.json({ 
                    token, 
                    tipo_usuario: user.tipo_usuario,
                    nombre_usuario: user.nombre_usuario,
                    id: user.id
                });
                console.log('Login successful for user:', nombre_usuario); // Log para depuración
            } else {
                console.log('Invalid password for user:', nombre_usuario); // Log para depuración
                res.status(401).json({ error: 'Credenciales inválidas' });
            }
        } else {
            console.log('User not found:', nombre_usuario); // Log para depuración
            res.status(401).json({ error: 'Credenciales inválidas' });
        }
    } catch (err) {
        console.error('Error en el login:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Ruta para verificar el token (útil para mantener la sesión del usuario)
router.get('/verify-token', (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: "No se proporcionó token" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.json({ 
            userId: decoded.userId, 
            role: decoded.role 
        });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: "Token expirado" });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: "Token inválido" });
        }
        console.error('Error en la verificación del token:', err);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
});

module.exports = router;