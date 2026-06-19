const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

// Todas las campañas accesibles por el usuario, con los campo_ids que las tienen
router.get('/', verifyToken, async (req, res) => {
    try {
        let query, params;
        if (req.user.role === 'Admin') {
            query = `
                SELECT l.campaña, array_agg(DISTINCT l.campo_id) AS campo_ids
                FROM lotes l
                WHERE l.campaña IS NOT NULL
                GROUP BY l.campaña
                ORDER BY l.campaña
            `;
            params = [];
        } else {
            query = `
                SELECT l.campaña, array_agg(DISTINCT l.campo_id) AS campo_ids
                FROM lotes l
                JOIN campos c ON l.campo_id = c.id
                WHERE l.campaña IS NOT NULL
                  AND (c.usuario_id = $1 OR $1 = ANY(c.usuarios_ids))
                GROUP BY l.campaña
                ORDER BY l.campaña
            `;
            params = [req.user.userId];
        }
        const result = await pool.query(query, params);
        res.json(result.rows.map(r => ({
            campaña: r.campaña,
            campo_ids: r.campo_ids.map(Number)
        })));
    } catch (error) {
        console.error('Error al obtener campañas:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

router.get('/lote/:loteId', verifyToken, async (req, res) => {
    const { loteId } = req.params;
    //console.log('Solicitud de campañas para lote:', loteId);
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
        //console.log('Campaña encontrada:', campaña);

        // Obtener campañas específicas para este lote
        const loteCampañasResult = await pool.query(
            'SELECT DISTINCT campaña FROM lotes WHERE id = $1 AND campaña IS NOT NULL',
            [loteId]
        );
        const campañasDelLote = loteCampañasResult.rows.map(row => row.campaña);

        // Si quieres obtener todas las campañas únicas, puedes hacer una consulta adicional
        const allCampañasResult = await pool.query(
            'SELECT DISTINCT campaña FROM lotes WHERE campaña IS NOT NULL ORDER BY campaña'
        );
        const allCampañas = allCampañasResult.rows.map(row => row.campaña);

        res.json({
            loteCampaña: campaña,
            campañasDelLote: campañasDelLote,
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