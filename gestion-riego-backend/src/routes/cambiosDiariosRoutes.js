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
            riego_cantidad = 0,
            riego_fecha_inicio,
            precipitaciones = 0,
            humedad = 0,
            temperatura = 0,
            evapotranspiracion = 0,
            dias,
        } = req.body;

        // Obtener el Kc actual del cultivo
        const { rows: [kc_data] } = await client.query(`
            SELECT cc.indice_kc 
            FROM lotes l
            JOIN coeficiente_cultivo cc ON l.cultivo_id = cc.cultivo_id
            WHERE l.id = $1
            AND cc.indice_dias <= $2
            ORDER BY cc.indice_dias DESC
            LIMIT 1
        `, [lote_id, dias]);
        
        console.log("KC obtenido: ", kc_data);
        const kc = kc_data?.indice_kc || 0;
        const etc = parseFloat(evapotranspiracion || 0) * parseFloat(kc);
        console.log("ETC de la formula: ", etc," es igual a evapotranspiracion: ", evapotranspiracion," por el kc anterior -------------------------------" );
        const lluvia_efectiva = calcularLluviaEfectiva(precipitaciones || 0);

        const { rows } = await client.query(
            `INSERT INTO cambios_diarios 
            (lote_id, fecha_cambio, riego_cantidad, riego_fecha_inicio, 
             precipitaciones, humedad, temperatura, evapotranspiracion, 
             lluvia_efectiva, etc, kc) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
            RETURNING *`,
            [
                lote_id,
                fecha_cambio,
                riego_cantidad,
                riego_fecha_inicio,
                precipitaciones,
                humedad,
                temperatura,
                evapotranspiracion,
                lluvia_efectiva,
                etc,
                kc
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
        } = req.body;

        // Obtener el lote_id del cambio diario actual
        const { rows: [cambioActual] } = await client.query(
            'SELECT lote_id FROM cambios_diarios WHERE id = $1',
            [id]
        );

        // Obtener el Kc actual
        const { rows: [kc_data] } = await client.query(`
            SELECT cc.indice_kc 
            FROM lotes l
            JOIN coeficiente_cultivo cc ON l.cultivo_id = cc.cultivo_id
            WHERE l.id = $1
            AND cc.indice_dias <= (
                SELECT COALESCE(MAX(dias), 0)
                FROM cambios_diarios
                WHERE lote_id = $1
            )
            ORDER BY cc.indice_dias DESC
            LIMIT 1
        `, [cambioActual.lote_id]);

        const kc = kc_data?.indice_kc || 1;
        const etc = evapotranspiracion * kc;
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
            kc = $9
            WHERE id = $10 
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
                kc,
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