const express = require('express');
const router = express.Router();
const coeficienteCultivoController = require('../controllers/coeficienteCultivoController');
const { verifyToken, isAdmin } = require('../middleware/auth');

router.get('/:cultivoId', verifyToken, coeficienteCultivoController.obtenerCoeficientes);
router.post('/update-dias-correccion', verifyToken, isAdmin, coeficienteCultivoController.actualizarDiasCorreccion);

module.exports = router;