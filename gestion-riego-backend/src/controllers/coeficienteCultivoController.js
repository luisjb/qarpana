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
        console.warn('DEPRECATED: Esta función modifica globalmente. Usar correcciones por lote.');
        const { cultivoId, coeficientes } = req.body;
        await coeficienteCultivoService.actualizarMultiplesDiasCorreccion(cultivoId, coeficientes);
        res.json({ message: 'Días de corrección actualizados con éxito' });
    } catch (error) {
        console.error('Error al actualizar días de corrección:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function obtenerCoeficientesPorLote(req, res) {
    try {
        const { loteId } = req.params;
        if (!loteId) {
            return res.status(400).json({ error: 'Se requiere un ID de lote válido' });
        }
        const coeficientes = await coeficienteCultivoService.obtenerCoeficientesPorLote(loteId);
        res.json(coeficientes);
    } catch (error) {
        console.error('Error al obtener coeficientes por lote:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function obtenerCoeficientesEfectivos(req, res) {
    try {
        const { loteId } = req.params;
        if (!loteId) {
            return res.status(400).json({ error: 'Se requiere un ID de lote válido' });
        }
        const coeficientes = await coeficienteCultivoService.obtenerCoeficientesEfectivosPorLote(loteId);
        res.json(coeficientes);
    } catch (error) {
        console.error('Error al obtener coeficientes efectivos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function actualizarDiasCorreccionPorLote(req, res) {
    try {
        const { loteId } = req.params;
        const { coeficientes } = req.body;
        
        if (!loteId) {
            return res.status(400).json({ error: 'Se requiere un ID de lote válido' });
        }
        
        if (!coeficientes || !Array.isArray(coeficientes)) {
            return res.status(400).json({ error: 'Se requiere un array de coeficientes válido' });
        }
        
        await coeficienteCultivoService.actualizarMultiplesDiasCorreccionPorLote(loteId, coeficientes);
        res.json({ message: 'Correcciones de días actualizadas exitosamente para el lote' });
    } catch (error) {
        console.error('Error al actualizar correcciones por lote:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function actualizarCorreccionIndividual(req, res) {
    try {
        const { loteId, coeficienteId } = req.params;
        const { diasCorreccion } = req.body;
        
        if (!loteId || !coeficienteId) {
            return res.status(400).json({ error: 'Se requieren IDs de lote y coeficiente válidos' });
        }
        
        await coeficienteCultivoService.actualizarDiasCorreccionPorLote(loteId, coeficienteId, diasCorreccion);
        res.json({ message: 'Corrección actualizada exitosamente' });
    } catch (error) {
        console.error('Error al actualizar corrección individual:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function restablecerCorreccionIndividual(req, res) {
    try {
        const { loteId, coeficienteId } = req.params;
        
        if (!loteId || !coeficienteId) {
            return res.status(400).json({ error: 'Se requieren IDs de lote y coeficiente válidos' });
        }
        
        await coeficienteCultivoService.restablecerDiasCorreccionPorLote(loteId, coeficienteId);
        res.json({ message: 'Corrección restablecida exitosamente' });
    } catch (error) {
        console.error('Error al restablecer corrección individual:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function restablecerTodasLasCorrecciones(req, res) {
    try {
        const { loteId } = req.params;
        
        if (!loteId) {
            return res.status(400).json({ error: 'Se requiere un ID de lote válido' });
        }
        
        await coeficienteCultivoService.restablecerDiasCorreccionPorLote(loteId);
        res.json({ message: 'Todas las correcciones han sido restablecidas para el lote' });
    } catch (error) {
        console.error('Error al restablecer todas las correcciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = {
    // Funciones existentes (mantener por compatibilidad)
    obtenerCoeficientes,
    actualizarDiasCorreccion,
    
    // Nuevas funciones para manejo por lote
    obtenerCoeficientesPorLote,
    obtenerCoeficientesEfectivos,
    actualizarDiasCorreccionPorLote,
    actualizarCorreccionIndividual,
    restablecerCorreccionIndividual,
    restablecerTodasLasCorrecciones
};