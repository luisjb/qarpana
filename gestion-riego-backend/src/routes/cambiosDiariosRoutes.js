const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');



// Función para convertir valores nulos o undefined a 0
const convertToNumberOrZero = (value) => {
    const number = parseFloat(value);
    return isNaN(number) ? 0 : number;
};

async function calcularKCPorPendiente(client, loteId, diasDesdeSiembra) {
    // Primero obtenemos el cultivo_id del lote
    const { rows: [lote] } = await client.query(
        'SELECT cultivo_id FROM lotes WHERE id = $1',
        [loteId]
    );

    // Obtenemos los coeficientes del cultivo, considerando días de corrección
    const { rows: coeficientes } = await client.query(`
        SELECT 
            indice_kc,
            COALESCE(dias_correccion, indice_dias) as dias_efectivos,
            indice_dias as dias_originales
        FROM coeficiente_cultivo 
        WHERE cultivo_id = $1
        ORDER BY dias_efectivos ASC`,
        [lote.cultivo_id]
    );

    // Si no hay coeficientes, retornamos un valor por defecto
    if (!coeficientes.length) return 1;

    // Si estamos antes del primer período, usamos el KC inicial
    if (diasDesdeSiembra <= coeficientes[0].dias_efectivos) {
        return coeficientes[0].indice_kc;
    }

    // Buscamos el intervalo correcto para calcular la pendiente
    for (let i = 0; i < coeficientes.length - 1; i++) {
        const periodoActual = coeficientes[i];
        const periodoSiguiente = coeficientes[i + 1];

        if (diasDesdeSiembra > periodoActual.dias_efectivos && 
            diasDesdeSiembra <= periodoSiguiente.dias_efectivos) {
            
            // Calculamos la pendiente (a) entre los dos períodos
            const a = (periodoSiguiente.indice_kc - periodoActual.indice_kc) / 
                     (periodoSiguiente.dias_efectivos - periodoActual.dias_efectivos);
            
            // Calculamos el intercepto (b)
            const b = periodoActual.indice_kc - (a * periodoActual.dias_efectivos);
            
            // Calculamos el KC para el día actual usando y = ax + b
            const kc = (a * diasDesdeSiembra) + b;

            // Para debug
            console.log('Cálculo KC:', {
                diasDesdeSiembra,
                periodoActual: periodoActual.dias_efectivos,
                periodoSiguiente: periodoSiguiente.dias_efectivos,
                kcActual: periodoActual.indice_kc,
                kcSiguiente: periodoSiguiente.indice_kc,
                pendiente: a,
                intercepto: b,
                kcCalculado: kc
            });

            return kc;
        }
    }

    // Si estamos después del último período, usamos el último KC
    return coeficientes[coeficientes.length - 1].indice_kc;
}


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
            riego_fecha_inicio = null,
            precipitaciones = 0,
            humedad = 0,
            temperatura = 0,
            evapotranspiracion = 0,
        } = req.body;

        // Obtener fecha de siembra y calcular días
         const { rows: [loteInfo] } = await client.query(
            'SELECT fecha_siembra, cultivo_id FROM lotes WHERE id = $1',
            [lote_id]
        );

        if (!loteInfo) {
            return res.status(404).json({ error: 'Lote no encontrado' });
        }
        
        const diasDesdeSiembra = Math.floor(
            (new Date(fecha_cambio) - new Date(loteInfo.fecha_siembra)) / (1000 * 60 * 60 * 24)
        );

        // Calcular KC y ETC
        const { rows: [kc_data] } = await client.query(`
            SELECT cc.indice_kc 
            FROM lotes l
            JOIN coeficiente_cultivo cc ON l.cultivo_id = cc.cultivo_id
            WHERE l.id = $1
            AND cc.indice_dias <= $2
            ORDER BY cc.indice_dias DESC
            LIMIT 1
        `, [lote_id, diasDesdeSiembra]);
        const kc = await calcularKCPorPendiente(client, lote_id, diasDesdeSiembra);

        const etc = evapotranspiracion * kc;
        const lluvia_efectiva = calcularLluviaEfectiva(precipitaciones);

        const { rows } = await client.query(
            `INSERT INTO cambios_diarios 
            (lote_id, fecha_cambio, riego_cantidad, riego_fecha_inicio, 
             precipitaciones, humedad, temperatura, evapotranspiracion,
             lluvia_efectiva, etc, kc, dias) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
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
                kc,
                diasDesdeSiembra
            ]
        );

        await client.query('COMMIT');
        res.status(201).json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear cambio diario:', err);
        res.status(500).json({ error: 'Error del servidor' });
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
            'SELECT cd.lote_id, cd.fecha_cambio, l.fecha_siembra FROM cambios_diarios cd JOIN lotes l ON cd.lote_id = l.id WHERE cd.id = $1',
            [id]
        );

         // Calculamos los días desde la siembra
         const diasDesdeSiembra = Math.floor(
            (new Date(cambioActual.fecha_cambio) - new Date(cambioActual.fecha_siembra)) / (1000 * 60 * 60 * 24)
        );
        
       // Ahora podemos calcular el KC usando el lote_id correcto
        const kc = await calcularKCPorPendiente(client, cambioActual.lote_id, diasDesdeSiembra);
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

router.post('/evapotranspiracion-masiva', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { datos, tipo, ids } = req.body;

        // Obtener todos los lotes afectados
        let lotes = [];
        if (tipo === 'campo') {
            const lotesQuery = await client.query(
                'SELECT id FROM lotes WHERE campo_id = ANY($1)',
                [ids]
            );
            lotes = lotesQuery.rows.map(row => row.id);
        } else {
            lotes = ids;
        }

        // Procesar cada fecha y valor de evapotranspiración
        for (const { fecha, evapotranspiracion, precipitaciones  } of datos) {
            for (const loteId of lotes) {
                // Verificar si existe un registro para esa fecha
                const { rows: [existingRecord] } = await client.query(
                    'SELECT id FROM cambios_diarios WHERE lote_id = $1 AND fecha_cambio = $2',
                    [loteId, fecha]
                );

                // Obtener datos necesarios del lote
                const { rows: [loteInfo] } = await client.query(
                    'SELECT fecha_siembra FROM lotes WHERE id = $1',
                    [loteId]
                );

                // Calcular días desde siembra
                const diasDesdeSiembra = Math.floor(
                    (new Date(fecha) - new Date(loteInfo.fecha_siembra)) / (1000 * 60 * 60 * 24)
                );

                // Calcular KC y ETC
                const kc = await calcularKCPorPendiente(client, loteId, diasDesdeSiembra);
                const etc = evapotranspiracion * kc;
                const lluvia_efectiva = precipitaciones ? calcularLluviaEfectiva(precipitaciones) : 0;

                if (existingRecord) {
                    // Actualizar registro existente
                    await client.query(
                        `UPDATE cambios_diarios 
                        SET evapotranspiracion = $1, etc = $2, kc = $3, 
                            precipitaciones = $4, lluvia_efectiva = $5
                        WHERE id = $6`,
                        [evapotranspiracion, etc, kc, precipitaciones || 0, lluvia_efectiva, existingRecord.id]
                    );
                } else {
                    // Crear nuevo registro
                    await client.query(
                        `INSERT INTO cambios_diarios 
                        (lote_id, fecha_cambio, evapotranspiracion, etc, kc, dias,
                            precipitaciones, lluvia_efectiva)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [loteId, fecha, evapotranspiracion, etc, kc, diasDesdeSiembra, 
                            precipitaciones || 0, lluvia_efectiva]
                    );
                }
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Actualización masiva completada con éxito' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error en actualización masiva:', err);
        res.status(500).json({ 
            error: 'Error del servidor',
            details: err.message 
        });
    } finally {
        client.release();
    }
});

module.exports = router;