const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

router.get('/lote/:loteId', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    console.log('Solicitud de campañas para lote:', loteId);
    try {
        // Obtener la campaña del lote específico
        const result = await pool.query(
            'SELECT campaña FROM lotes WHERE id = $1',
            [loteId]
        );

        if (result.rows.length === 0) {
            console.log('Lote no encontrado:', loteId);
            return res.status(404).json({ error: 'Lote no encontrado' });
        }

        const campaña = result.rows[0].campaña;
        console.log('Campaña encontrada:', campaña);

        // Si quieres obtener todas las campañas únicas, puedes hacer una consulta adicional
        const allCampañasResult = await pool.query(
            'SELECT DISTINCT campaña FROM lotes WHERE campaña IS NOT NULL ORDER BY campaña'
        );
        const allCampañas = allCampañasResult.rows.map(row => row.campaña);

        res.json({
            loteCampaña: campaña,
            todasLasCampañas: allCampañas
        });
    } catch (error) {
        console.error('Error al obtener campañas:', error);
        res.status(500).json({ 
            error: 'Error del servidor', 
            details: error.message,
            hint: error.hint,
            position: error.position
        });
    }
});

module.exports = router;