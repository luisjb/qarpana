const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
const { calcularLluviaEfectiva, calcularTotales } = require('../utils/calculosHidricos');

// Función auxiliar para convertir valores nulos o undefined a 0
const convertToNumberOrZero = (value) => {
    const number = parseFloat(value);
    return isNaN(number) ? 0 : number;
};

// Obtener todos los cambios diarios para un lote
router.get('/:loteId', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { rows } = await client.query(
            'SELECT * FROM cambios_diarios WHERE lote_id = $1 ORDER BY fecha_cambio DESC',
            [req.params.loteId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener cambios diarios:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error del servidor' });
        }
    } finally {
        client.release();
    }
});

// Crear nuevo cambio diario
router.post('/', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const {
            lote_id,
            fecha_cambio,
            riego_cantidad,
            riego_fecha_inicio,
            precipitaciones,
            humedad,
            temperatura,
            evapotranspiracion,
            etc
        } = req.body;

        // Obtener los días desde la siembra
        const loteResult = await client.query(
            'SELECT fecha_siembra FROM lotes WHERE id = $1',
            [lote_id]
        );
        
        const fechaSiembra = loteResult.rows[0]?.fecha_siembra;
        const dias = Math.floor((new Date(fecha_cambio) - new Date(fechaSiembra)) / (1000 * 60 * 60 * 24));

        // Calcular lluvia efectiva
        const lluvia_efectiva = calcularLluviaEfectiva(precipitaciones);

        const { rows } = await client.query(
            `INSERT INTO cambios_diarios 
            (lote_id, fecha_cambio, riego_cantidad, riego_fecha_inicio, 
             precipitaciones, humedad, temperatura, evapotranspiracion, 
             etc, lluvia_efectiva, dias) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
            RETURNING *`,
            [
                lote_id,
                fecha_cambio,
                convertToNumberOrZero(riego_cantidad),
                riego_fecha_inicio,
                convertToNumberOrZero(precipitaciones),
                convertToNumberOrZero(humedad),
                convertToNumberOrZero(temperatura),
                convertToNumberOrZero(evapotranspiracion),
                convertToNumberOrZero(etc),
                lluvia_efectiva,
                dias
            ]
        );

        await client.query('COMMIT');
        res.status(201).json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear cambio diario:', err);
        res.status(500).json({ 
            error: 'Error del servidor',
            details: err.message
        });
    } finally {
        client.release();
    }
});

// Actualizar cambio diario
router.put('/:id', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        const {
            riego_cantidad,
            riego_fecha_inicio,
            precipitaciones,
            humedad,
            temperatura,
            evapotranspiracion,
            etc
        } = req.body;

        const lluvia_efectiva = calcularLluviaEfectiva(precipitaciones);

        const { rows } = await client.query(
            `UPDATE cambios_diarios SET 
            riego_cantidad = $1,
            riego_fecha_inicio = $2,
            precipitaciones = $3,
            humedad = $4,
            temperatura = $5,
            evapotranspiracion = $6,
            etc = $7,
            lluvia_efectiva = $8
            WHERE id = $9 
            RETURNING *`,
            [
                riego_cantidad,
                riego_fecha_inicio,
                precipitaciones,
                humedad,
                temperatura,
                evapotranspiracion,
                etc,
                lluvia_efectiva,
                id
            ]
        );

        await client.query('COMMIT');
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Cambio diario no encontrado' });
        }
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar cambio diario:', err);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error del servidor',
                details: err.message
            });
        }
    } finally {
        client.release();
    }
});

// Eliminar cambio diario
router.delete('/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await pool.query('DELETE FROM cambios_diarios WHERE id = $1', [id]);
        if (rowCount === 0) {
            return res.status(404).json({ error: 'Cambio diario no encontrado' });
        }
        res.json({ message: 'Cambio diario eliminado con éxito' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Carga masiva de evapotranspiración
router.post('/evapotranspiracion-masiva', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { datos, ids } = req.body;

        // Validar datos de entrada
        if (!datos || !Array.isArray(datos) || datos.length === 0) {
            throw new Error('Datos inválidos');
        }
        
        for (const id of ids) {
            for (const dato of datos) {
                const evapotranspiracion = convertToNumberOrZero(dato.evapotranspiracion);
                const fecha = dato.fecha;
                
                // Siempre insertar para todos los lotes del campo
                await client.query(
                    'INSERT INTO cambios_diarios (lote_id, fecha_cambio, evapotranspiracion) ' +
                    'SELECT id, $2, $3 FROM lotes WHERE campo_id = $1 ' +
                    'ON CONFLICT (lote_id, fecha_cambio) DO UPDATE SET evapotranspiracion = EXCLUDED.evapotranspiracion',
                    [id, fecha, evapotranspiracion]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Evapotranspiración actualizada con éxito' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error en carga masiva de evapotranspiración:', err);
        res.status(500).json({ 
            error: 'Error del servidor', 
            details: err.message 
        });
    } finally {
        client.release();
    }
});

module.exports = router;