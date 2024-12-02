const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

// Función para convertir valores nulos o undefined a 0
const convertToNumberOrZero = (value) => {
    const number = parseFloat(value);
    return isNaN(number) ? 0 : number;
};

// Función para calcular KC
async function calcularKC(client, loteId, diasDesdeSiembra) {
    const loteResult = await client.query(
        'SELECT cultivo_id FROM lotes WHERE id = $1',
        [loteId]
    );
    
    if (!loteResult.rows.length) return 0;
    const cultivo_id = loteResult.rows[0].cultivo_id;

    const coeficientesResult = await client.query(
        'SELECT indice_kc, indice_dias, COALESCE(dias_correccion, indice_dias) as dias_efectivos ' +
        'FROM coeficiente_cultivo WHERE cultivo_id = $1 ORDER BY dias_efectivos',
        [cultivo_id]
    );
    
    if (!coeficientesResult.rows.length) return 0;

    const coeficientes = coeficientesResult.rows;
    let puntoAnterior = coeficientes[0];
    let puntoSiguiente = coeficientes[coeficientes.length - 1];

    for (let i = 0; i < coeficientes.length - 1; i++) {
        if (diasDesdeSiembra >= coeficientes[i].dias_efectivos && 
            diasDesdeSiembra < coeficientes[i+1].dias_efectivos) {
            puntoAnterior = coeficientes[i];
            puntoSiguiente = coeficientes[i+1];
            break;
        }
    }

    const m = (puntoSiguiente.indice_kc - puntoAnterior.indice_kc) / 
              (puntoSiguiente.dias_efectivos - puntoAnterior.dias_efectivos);
    const b = puntoAnterior.indice_kc - m * puntoAnterior.dias_efectivos;

    return m * diasDesdeSiembra + b;
}

// Función para calcular crecimiento radicular
async function calcularCrecimientoRadicular(client, loteId, diasDesdeSiembra) {
    if (diasDesdeSiembra <= 6) return 0;

    const cultivoResult = await client.query(
        'SELECT indice_crecimiento_radicular FROM cultivos WHERE id = (SELECT cultivo_id FROM lotes WHERE id = $1)',
        [loteId]
    );
    
    const ultimoCrecimientoResult = await client.query(
        'SELECT crecimiento_radicular FROM cambios_diarios WHERE lote_id = $1 ORDER BY fecha_cambio DESC LIMIT 1',
        [loteId]
    );

    const indice = convertToNumberOrZero(cultivoResult.rows[0]?.indice_crecimiento_radicular);
    const ultimoCrecimiento = convertToNumberOrZero(ultimoCrecimientoResult.rows[0]?.crecimiento_radicular);

    return ultimoCrecimiento > 0 ? ultimoCrecimiento + indice : indice;
}

// Calcular lluvia efectiva
function calcularLluviaEfectiva(precipitaciones) {
    const pp = convertToNumberOrZero(precipitaciones);
    if (pp === 0) return 0;
    if (pp < 15) return pp;
    return parseFloat((2.43 * Math.pow(pp, 0.667)).toFixed(2));
}

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
        res.status(500).json({ error: 'Error del servidor' });
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

        // Obtener información del lote
        const loteInfo = await client.query(
            'SELECT fecha_siembra, cultivo_id FROM lotes WHERE id = $1',
            [lote_id]
        );

        if (loteInfo.rows.length === 0) {
            throw new Error('Lote no encontrado');
        }

        const { fecha_siembra, cultivo_id } = loteInfo.rows[0];

        // Calcular días desde siembra
        const dias = Math.floor((new Date(fecha_cambio) - new Date(fecha_siembra)) / (1000 * 60 * 60 * 24));

        // Calcular valores
        const kc = await calcularKC(client, lote_id, dias);
        const crecimiento_radicular = await calcularCrecimientoRadicular(client, lote_id, dias);
        const lluvia_efectiva = calcularLluviaEfectiva(precipitaciones);

        // Calcular estrato alcanzado
        const estrato_alcanzado = Math.floor(crecimiento_radicular / 20) + 1;

        const { rows } = await client.query(
            `INSERT INTO cambios_diarios 
            (lote_id, fecha_cambio, riego_cantidad, riego_fecha_inicio, 
             precipitaciones, humedad, temperatura, evapotranspiracion, 
             etc, lluvia_efectiva, dias, cultivo_id, fecha_siembra,
             crecimiento_radicular, kc, estrato_alcanzado) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
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
                dias,
                cultivo_id,
                fecha_siembra,
                crecimiento_radicular,
                kc,
                estrato_alcanzado
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

        // Primero obtener información del lote asociado a este cambio diario
        const cambioInfo = await client.query(
            'SELECT cd.lote_id, l.fecha_siembra, l.cultivo_id FROM cambios_diarios cd ' +
            'JOIN lotes l ON cd.lote_id = l.id WHERE cd.id = $1',
            [id]
        );

        if (cambioInfo.rows.length === 0) {
            throw new Error('Cambio diario no encontrado');
        }

        const { lote_id, fecha_siembra, cultivo_id } = cambioInfo.rows[0];

        // Calcular días desde siembra
        const dias = Math.floor((new Date(req.body.fecha_cambio) - new Date(fecha_siembra)) / (1000 * 60 * 60 * 24));

        // Calcular KC basado en los días
        const kc = await calcularKC(client, lote_id, dias);

        // Calcular crecimiento radicular
        const crecimiento_radicular = await calcularCrecimientoRadicular(client, lote_id, dias);

        // Calcular estrato alcanzado
        const estrato_alcanzado = Math.floor(crecimiento_radicular / 20) + 1;

        // Calcular lluvia efectiva
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
            lluvia_efectiva = $8,
            dias = $9,
            cultivo_id = $10,
            kc = $11,
            crecimiento_radicular = $12,
            estrato_alcanzado = $13
            WHERE id = $14 
            RETURNING *`,
            [
                convertToNumberOrZero(riego_cantidad),
                riego_fecha_inicio,
                convertToNumberOrZero(precipitaciones),
                convertToNumberOrZero(humedad),
                convertToNumberOrZero(temperatura),
                convertToNumberOrZero(evapotranspiracion),
                convertToNumberOrZero(etc),
                lluvia_efectiva,
                dias,
                cultivo_id,
                kc,
                crecimiento_radicular,
                estrato_alcanzado,
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
        res.status(500).json({ 
            error: 'Error del servidor',
            details: err.message
        });
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

module.exports = router;