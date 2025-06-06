const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: "Se requiere un token para la autenticación" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
            userId: decoded.userId,
            role: decoded.role
        };
        next();
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
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(403).json({ error: "Acceso denegado. Se requieren permisos de administrador." });
    }
};

module.exports = { verifyToken, isAdmin };