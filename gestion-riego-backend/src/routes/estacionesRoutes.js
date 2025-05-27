const express = require('express');
const router = express.Router();
const axios = require('axios');
const { verifyToken } = require('../middleware/auth');
const pool = require('../db');

// Obtener todas las estaciones de la base de datos
router.get('/', verifyToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT 
                e.*,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'id', m.modulo_id,
                            'title', m.modulo_titulo,
                            'type', m.modulo_tipo
                        )
                    ) FILTER (WHERE m.modulo_id IS NOT NULL),
                    '[]'::json
                ) as modules
            FROM estaciones_meteorologicas e
            LEFT JOIN estaciones_modulos m ON e.codigo = m.estacion_codigo
            GROUP BY e.id, e.codigo, e.titulo, e.latitud, e.longitud, e.datos_json, e.fecha_actualizacion
            ORDER BY e.titulo
        `);
        
        const processedEstaciones = rows.map(estacion => {
            return {
                ...estacion,
                code: estacion.codigo,
                title: estacion.titulo,
                latitude: estacion.latitud,
                longitude: estacion.longitud,
                modules: estacion.modules || []
            };
        });
        
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
        const OMIXOM_TOKEN = 'fa31ec35bbe0e6684f75e8cc2ebe38dd999f7356';
        
        const response = await axios.get('https://new.omixom.com/api/v2/stations', {
            headers: {
                'Authorization': `Token ${OMIXOM_TOKEN}`
            }
        });
        
        console.log('Estaciones obtenidas de API:', response.data.length);
        
        await client.query('BEGIN');

        // Guardar o actualizar cada estación en la base de datos
        for (const estacion of response.data) {
            // Actualizar la estación
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

            // Eliminar módulos existentes para esta estación
            await client.query(
                'DELETE FROM estaciones_modulos WHERE estacion_codigo = $1',
                [String(estacion.code)]
            );

            // Insertar los módulos de la estación
            if (estacion.modules && Array.isArray(estacion.modules)) {
                for (const modulo of estacion.modules) {
                    await client.query(
                        `INSERT INTO estaciones_modulos (
                            estacion_codigo, 
                            modulo_id, 
                            modulo_titulo, 
                            modulo_tipo,
                            fecha_actualizacion
                        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
                        [
                            String(estacion.code),
                            modulo.id,
                            modulo.title,
                            modulo.type
                        ]
                    );
                }
            }
        }

        await client.query('COMMIT');
        
        // Devolver las estaciones actualizadas con sus módulos
        const { rows } = await client.query(`
            SELECT 
                e.*,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'id', m.modulo_id,
                            'title', m.modulo_titulo,
                            'type', m.modulo_tipo
                        )
                    ) FILTER (WHERE m.modulo_id IS NOT NULL),
                    '[]'::json
                ) as modules
            FROM estaciones_meteorologicas e
            LEFT JOIN estaciones_modulos m ON e.codigo = m.estacion_codigo
            GROUP BY e.id, e.codigo, e.titulo, e.latitud, e.longitud, e.datos_json, e.fecha_actualizacion
            ORDER BY e.titulo
        `);
        
        const processedRows = rows.map(row => {
            return {
                ...row,
                code: row.codigo,
                title: row.titulo,
                latitude: row.latitud,
                longitude: row.longitud,
                modules: row.modules || []
            };
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

//Obtener estaciones que tienen un tipo de módulo específico
router.get('/por-tipo-modulo/:tipo', verifyToken, async (req, res) => {
    try {
        const tipoModulo = req.params.tipo;
        
        const { rows } = await pool.query(`
            SELECT DISTINCT
                e.*,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'id', m.modulo_id,
                            'title', m.modulo_titulo,
                            'type', m.modulo_tipo
                        )
                    ) FILTER (WHERE m.modulo_id IS NOT NULL),
                    '[]'::json
                ) as modules
            FROM estaciones_meteorologicas e
            INNER JOIN estaciones_modulos m ON e.codigo = m.estacion_codigo
            WHERE m.modulo_tipo ILIKE $1
            GROUP BY e.id, e.codigo, e.titulo, e.latitud, e.longitud, e.datos_json, e.fecha_actualizacion
            ORDER BY e.titulo
        `, [`%${tipoModulo}%`]);
        
        const processedEstaciones = rows.map(estacion => {
            return {
                ...estacion,
                code: estacion.codigo,
                title: estacion.titulo,
                latitude: estacion.latitud,
                longitude: estacion.longitud,
                modules: estacion.modules || []
            };
        });
        
        res.json(processedEstaciones);
    } catch (err) {
        console.error('Error al obtener estaciones por tipo de módulo:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener los tipos de módulos disponibles
router.get('/tipos-modulos', verifyToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT DISTINCT modulo_tipo, COUNT(*) as cantidad_estaciones
            FROM estaciones_modulos 
            GROUP BY modulo_tipo 
            ORDER BY modulo_tipo
        `);
        
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener tipos de módulos:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

module.exports = router;