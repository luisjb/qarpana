const express = require('express');
const router = express.Router();
const traccarController = require('../controllers/traccarController');

// Event Forwarding - Recibe todos los eventos de Traccar
router.post('/webhook', traccarController.handleEventForwarding);

// Position Forwarding - Recibe posiciones (opcional)
router.post('/positions', traccarController.handlePositionForwarding);

// Endpoints para el frontend
router.get('/alarms', traccarController.getAlarms);
router.get('/alarms/active', traccarController.getActiveAlarms);
router.delete('/alarms', traccarController.clearAlarms);
router.delete('/alarms/:id', traccarController.deleteAlarm);

// Test endpoints
router.post('/webhook/test', traccarController.testWebhook);
router.get('/status', traccarController.getTraccarStatus);

module.exports = router;