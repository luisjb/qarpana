const express = require('express');
const router = express.Router();
const coeficienteCultivoController = require('../controllers/coeficienteCultivoController');
const { verifyToken, isAdmin } = require('../middleware/auth');

router.get('/:cultivoId', verifyToken, coeficienteCultivoController.obtenerCoeficientes);
router.post('/update-dias-correccion', verifyToken, isAdmin, coeficienteCultivoController.actualizarDiasCorreccion);

// Nuevas rutas para manejo por lote
router.get('/lote/:loteId', verifyToken, coeficienteCultivoController.obtenerCoeficientesPorLote);
router.get('/lote/:loteId/efectivos', verifyToken, coeficienteCultivoController.obtenerCoeficientesEfectivos);

// Actualizar múltiples correcciones para un lote específico
router.post('/lote/:loteId/update-dias-correccion', verifyToken, isAdmin, coeficienteCultivoController.actualizarDiasCorreccionPorLote);

// Actualizar una corrección específica
router.put('/lote/:loteId/coeficiente/:coeficienteId', verifyToken, isAdmin, coeficienteCultivoController.actualizarCorreccionIndividual);

// Restablecer una corrección específica
router.delete('/lote/:loteId/coeficiente/:coeficienteId', verifyToken, isAdmin, coeficienteCultivoController.restablecerCorreccionIndividual);

// Restablecer todas las correcciones de un lote
router.delete('/lote/:loteId/restore-all', verifyToken, isAdmin, coeficienteCultivoController.restablecerTodasLasCorrecciones);


module.exports = router;