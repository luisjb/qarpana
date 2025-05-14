const express = require('express');
const router = express.Router();
const axios = require('axios');
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

// Obtener todas las estaciones de la base de datos
router.get('/', verifyToken, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM estaciones_meteorologicas ORDER BY titulo');
        
        // Procesar los datos JSON de cada estación
        const processedEstaciones = rows.map(estacion => {
            try {
                // Extraer datos del JSON si existe
                let datosJson = {};
                if (estacion.datos_json) {
                    datosJson = typeof estacion.datos_json === 'string' 
                        ? JSON.parse(estacion.datos_json) 
                        : estacion.datos_json;
                }
                
                // Normalizar nombres de propiedades
                return {
                    ...estacion,
                    code: estacion.codigo || (datosJson?.code ? String(datosJson.code) : ''),
                    title: estacion.titulo || datosJson?.title || 'Estación sin nombre',
                    latitude: estacion.latitud || datosJson?.latitude || null,
                    longitude: estacion.longitud || datosJson?.longitude || null,
                    modules: datosJson?.modules || []
                };
            } catch (error) {
                console.error(`Error procesando datos de estación ${estacion.codigo}:`, error);
                return {
                    ...estacion,
                    code: estacion.codigo || '',
                    title: estacion.titulo || 'Estación sin nombre',
                    latitude: estacion.latitud || null,
                    longitude: estacion.longitud || null,
                    modules: []
                };
            }
        });
        
        console.log('Enviando estaciones procesadas:', processedEstaciones.length);
        res.json(processedEstaciones);
    } catch (err) {
        console.error('Error al obtener estaciones:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Refrescar las estaciones desde la API de OMIXOM
router.post('/refresh', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        // Obtener el token de OMIXOM
        const OMIXOM_TOKEN = 'fa31ec35bbe0e6684f75e8cc2ebe38dd999f7356';
        
        // Realizar la solicitud a la API de OMIXOM
        const response = await axios.get('https://new.omixom.com/api/v2/stations', {
            headers: {
                'Authorization': `Token ${OMIXOM_TOKEN}`
            }
        });
        
        console.log('Estaciones obtenidas de API:', response.data.length);
        
        await client.query('BEGIN');

        // Guardar o actualizar cada estación en la base de datos
        for (const estacion of response.data) {
            await client.query(
                `INSERT INTO estaciones_meteorologicas (
                    codigo, 
                    titulo, 
                    latitud, 
                    longitud, 
                    datos_json, 
                    fecha_actualizacion
                ) 
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (codigo) 
                DO UPDATE SET 
                    titulo = $2,
                    latitud = $3,
                    longitud = $4, 
                    datos_json = $5, 
                    fecha_actualizacion = CURRENT_TIMESTAMP
                `,
                [
                    String(estacion.code), 
                    estacion.title, 
                    estacion.latitude || null, 
                    estacion.longitude || null, 
                    JSON.stringify(estacion)
                ]
            );
        }

        await client.query('COMMIT');
        
        // Devolver las estaciones actualizadas
        const { rows } = await client.query('SELECT * FROM estaciones_meteorologicas ORDER BY titulo');
        
        // Procesar los resultados para normalizar propiedades
        const processedRows = rows.map(row => {
            try {
                const datos = typeof row.datos_json === 'string' 
                    ? JSON.parse(row.datos_json) 
                    : row.datos_json;
                
                return {
                    ...row,
                    code: row.codigo || '',
                    title: row.titulo || '',
                    latitude: row.latitud || datos?.latitude || null,
                    longitude: row.longitud || datos?.longitude || null,
                    modules: datos?.modules || []
                };
            } catch (error) {
                console.error('Error al procesar datos JSON de estación:', error);
                return {
                    ...row,
                    code: row.codigo || '',
                    title: row.titulo || '',
                    latitude: row.latitud || null,
                    longitude: row.longitud || null,
                    modules: []
                };
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