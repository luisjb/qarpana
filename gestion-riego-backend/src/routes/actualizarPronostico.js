const express = require('express');
const router = express.Router();
const weatherScheduler = require('../utils/weatherScheduler');

router.post('/forzar-actualizacion', async (req, res) => {
    try {
        await weatherScheduler.forzarActualizacion();
        res.json({ message: 'Actualización meteorológica completada con éxito' });
    } catch (error) {
        console.error('Error en actualización forzada:', error);
        res.status(500).json({ 
            error: 'Error en la actualización',
            details: error.message 
        });
    }
});

module.exports = router;