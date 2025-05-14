const express = require('express');
const router = express.Router();
const axios = require('axios');
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

// Obtener todas las estaciones de la base de datos
router.get('/', verifyToken, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM estaciones_meteorologicas ORDER BY titulo');
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener estaciones:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Refrescar las estaciones desde la API de OMIXOM
router.post('/refresh', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        // Obtener el token de OMIXOM (este podría estar en una variable de entorno)
        const OMIXOM_TOKEN = 'fa31ec35bbe0e6684f75e8cc2ebe38dd999f7356';
        
        // Realizar la solicitud a la API de OMIXOM
        const response = await axios.get('https://new.omixom.com/api/v2/stations', {
            headers: {
                'Authorization': `Token ${OMIXOM_TOKEN}`
            }
        });
        
        await client.query('BEGIN');

        // Guardar o actualizar cada estación en la base de datos
        for (const estacion of response.data) {
            await client.query(
                `INSERT INTO estaciones_meteorologicas (codigo, titulo, datos_json, fecha_actualizacion) 
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                 ON CONFLICT (codigo) 
                 DO UPDATE SET 
                    titulo = $2, 
                    datos_json = $3, 
                    fecha_actualizacion = CURRENT_TIMESTAMP
                `,
                [String(estacion.code), estacion.title, JSON.stringify(estacion)]
            );
        }

        await client.query('COMMIT');
        
        // Devolver las estaciones actualizadas
        const { rows } = await client.query('SELECT * FROM estaciones_meteorologicas ORDER BY titulo');
        
        // Procesar los resultados para agregar latitude y longitude desde datos_json
        const processedRows = rows.map(row => {
            try {
                const datos = JSON.parse(row.datos_json);
                return {
                    ...row,
                    latitude: datos.latitude || null,
                    longitude: datos.longitude || null,
                    modules: datos.modules || []
                };
            } catch (error) {
                console.error('Error al procesar datos JSON de estación:', error);
                return row;
            }
        });
        
        res.json(processedRows);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar estaciones:', err);
        res.status(500).json({ error: 'Error al actualizar estaciones', details: err.message });
    } finally {
        client.release();
    }
});

// Obtener datos específicos de una estación
router.get('/:codigo', verifyToken, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM estaciones_meteorologicas WHERE codigo = $1',
            [req.params.codigo]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Estación no encontrada' });
        }
        
        // Procesar los resultados para agregar latitude y longitude desde datos_json
        const estacion = rows[0];
        try {
            const datos = JSON.parse(estacion.datos_json);
            estacion.latitude = datos.latitude || null;
            estacion.longitude = datos.longitude || null;
            estacion.modules = datos.modules || [];
        } catch (error) {
            console.error('Error al procesar datos JSON de estación:', error);
        }
        
        res.json(estacion);
    } catch (err) {
        console.error('Error al obtener estación:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;