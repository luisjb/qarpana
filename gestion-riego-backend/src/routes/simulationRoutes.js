const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const simulationController = require('../controllers/simulationController');

// Ruta para obtener los datos de simulación de un lote específico
router.get('/:loteId', verifyToken, simulationController.getSimulationData);

// Ruta para obtener un resumen de los datos de simulación por lote
router.get('/summary/:loteId', verifyToken, simulationController.getSummaryData);

module.exports = router;