const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const simulationController = require('../controllers/simulationController');

// Ruta para obtener los datos de simulación de un lote específico
router.get('/:loteId', verifyToken, simulationController.getSimulationData);

module.exports = router;