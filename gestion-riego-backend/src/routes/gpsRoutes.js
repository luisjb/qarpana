// src/routes/gpsRoutes.js
const express = require('express');
const router = express.Router();
const gpsController = require('../controllers/gpsController');

// Webhook para recibir posiciones de Traccar
router.post('/traccar/positions', gpsController.procesarPosicion);

// Datos operacionales
router.get('/regadores/:regadorId/datos-operacion', gpsController.obtenerDatosOperacion);
router.get('/regadores/:regadorId/posicion-actual', gpsController.obtenerPosicionActual);
router.get('/regadores/:regadorId/estadisticas', gpsController.obtenerEstadisticasOperacion);

// Resumen y estado de riego
router.get('/regadores/:regadorId/resumen-riego', gpsController.obtenerResumenRiego);
router.get('/regadores/:regadorId/historial-riego', gpsController.obtenerHistorialRiego);
router.get('/regadores/:regadorId/eventos', gpsController.obtenerEventosRiego);
router.get('/campos/:campoId/estado-riego', gpsController.obtenerEstadoCampo);


module.exports = router;