const coeficienteCultivoService = require('../services/coeficienteCultivoService');

async function obtenerCoeficientes(req, res) {
    try {
        const { cultivoId } = req.params;
        if (!cultivoId) {
            return res.status(400).json({ error: 'Se requiere un ID de cultivo válido' });
        }
        const coeficientes = await coeficienteCultivoService.obtenerCoeficientesPorCultivo(cultivoId);
        res.json(coeficientes);
    } catch (error) {
        console.error('Error al obtener coeficientes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function actualizarDiasCorreccion(req, res) {
    try {
        const { cultivoId, coeficientes } = req.body;
        await coeficienteCultivoService.actualizarMultiplesDiasCorreccion(cultivoId, coeficientes);
        res.json({ message: 'Días de corrección actualizados con éxito' });
    } catch (error) {
        console.error('Error al actualizar días de corrección:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = {
    obtenerCoeficientes,
    actualizarDiasCorreccion
};