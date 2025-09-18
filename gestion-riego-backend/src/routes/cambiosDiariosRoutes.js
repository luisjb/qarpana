const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
const { calcularKCUnificado } = require('../utils/kcCalculator');




// Función para convertir valores nulos o undefined a 0
const convertToNumberOrZero = (value) => {
    const number = parseFloat(value);
    return isNaN(number) ? 0 : number;
};

const calcularETC = (evapotranspiracion, kc) => {
    const eto = parseFloat(evapotranspiracion) || 0;
    const kcValue = parseFloat(kc) || 0;
    const etc = eto * kcValue;
    
    // Validar que el resultado sea un número válido
    if (isNaN(etc)) {
        console.warn(`ETC resultó en NaN: ETo(${eto}) * KC(${kcValue})`);
        return 0;
    }
    
    return etc;
};



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
            correccion_agua = 0,
        } = req.body;

        // Validación básica
        if (!lote_id) {
            return res.status(400).json({ error: 'ID de lote requerido' });
        }
        
        if (!fecha_cambio) {
            return res.status(400).json({ error: 'Fecha de cambio requerida' });
        }

        // Validación de valores numéricos
        const safeRiego = parseFloat(riego_cantidad) || 0;
        const safePrecipitaciones = parseFloat(precipitaciones) || 0;
        const safeHumedad = parseFloat(humedad) || 0;
        const safeTemperatura = parseFloat(temperatura) || 0;
        const safeEvapotranspiracion = parseFloat(evapotranspiracion) || 0;
        const safeCorreccion = parseFloat(correccion_agua) || 0;

        // Obtener fecha de siembra y datos del lote
        const { rows } = await client.query(
            'SELECT fecha_siembra, cultivo_id FROM lotes WHERE id = $1 AND activo = true',
            [lote_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Lote no encontrado o no está activo' });
        }

        const loteInfo = rows[0];

        // Verificar explícitamente que hay fecha de siembra
        if (!loteInfo.fecha_siembra) {
            console.error(`El lote ${lote_id} no tiene fecha de siembra definida`);
            return res.status(400).json({ 
                error: 'Fecha de siembra no definida',
                details: 'Defina una fecha de siembra válida para este lote antes de crear cambios diarios'
            });
        }

        // Log para verificar la fecha de siembra
       // console.log(`Lote ${lote_id} - Fecha de siembra: ${loteInfo.fecha_siembra}`);

        // Verificar máximo de días
        const { rows: [maxDays] } = await client.query(`
            SELECT MAX(GREATEST(cc.indice_dias, COALESCE(ccl.dias_correccion, cc.indice_dias))) as max_dias
            FROM coeficiente_cultivo cc
            LEFT JOIN coeficiente_cultivo_lote ccl ON ccl.lote_id = $2 AND ccl.coeficiente_cultivo_id = cc.id
            WHERE cc.cultivo_id = $1
        `, [loteInfo.cultivo_id, lote_id]);

        const maxDiasSimulacion = parseInt(maxDays?.max_dias) || 150;
        
        // Calcular días desde siembra de forma segura
        let diasDesdeSiembra;
        try {
            const { rows: [{ dias_calculados }] } = await client.query(
                `SELECT ($2::date - $1::date) + 1 as dias_calculados`,
                [loteInfo.fecha_siembra, fecha_cambio]
            );
            
            diasDesdeSiembra = parseInt(dias_calculados);
            
            // Validación de seguridad
            if (isNaN(diasDesdeSiembra) || diasDesdeSiembra < 1) {
                console.error(`Días calculados inválidos: ${dias_calculados}. Fechas: siembra=${loteInfo.fecha_siembra}, cambio=${fecha_cambio}`);
                return res.status(400).json({ 
                    error: 'Error en el cálculo de días desde siembra',
                    details: `Fecha de siembra: ${loteInfo.fecha_siembra}, Fecha de cambio: ${fecha_cambio}`
                });
            }
            
            console.log(`Días desde siembra calculados correctamente: ${diasDesdeSiembra} (siembra: ${loteInfo.fecha_siembra}, cambio: ${fecha_cambio})`);
            
        } catch (error) {
            console.error('Error al calcular días desde siembra con PostgreSQL:', error);
            return res.status(400).json({ 
                error: 'Error en el cálculo de días desde siembra',
                details: error.message
            });
        }

        // Rechazar si se excede el máximo de días
        if (diasDesdeSiembra > maxDiasSimulacion) {
            return res.status(400).json({ 
                error: 'No se pueden crear cambios diarios después del máximo de días configurado',
                maxDias: maxDiasSimulacion,
                diasActuales: diasDesdeSiembra
            });
        }

        // Calcular KC y ETC de forma segura
        let kc, etc, lluvia_efectiva;
        try {
            // Usar función unificada para calcular KC
            kc = await calcularKCUnificado(client, lote_id, diasDesdeSiembra);
            if (kc === null) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    error: 'No se puede calcular KC para este lote',
                    details: `No hay coeficientes KC definidos para el día ${diasDesdeSiembra} del lote ${lote_id}. ` +
                            'Por favor, configure los coeficientes KC del cultivo antes de crear cambios diarios.',
                    loteId: lote_id,
                    diasDesdeSiembra: diasDesdeSiembra
                });
            }
            
            // Calcular ETC usando la función helper consistente
            etc = calcularETC(safeEvapotranspiracion, kc);
            lluvia_efectiva = calcularLluviaEfectiva(safePrecipitaciones);
            
            // Validación adicional de lluvia efectiva
            if (isNaN(lluvia_efectiva)) {
                console.warn(`Lluvia efectiva resultó en NaN: de ${safePrecipitaciones}`);
                lluvia_efectiva = 0;
            }
            
        } catch (error) {
            console.error('Error al calcular KC, ETC o lluvia efectiva:', error);
            kc = null;  // Valor por defecto
            etc = 0;
            lluvia_efectiva = 0;
        }

        // Insertar en la base de datos con valores validados
        const insertResult = await client.query(
            `INSERT INTO cambios_diarios 
            (lote_id, fecha_cambio, riego_cantidad, riego_fecha_inicio, 
             precipitaciones, humedad, temperatura, evapotranspiracion,
             lluvia_efectiva, etc, kc, dias, correccion_agua) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
            RETURNING *`,
            [
                lote_id,
                fecha_cambio,
                safeRiego,
                riego_fecha_inicio,
                safePrecipitaciones,
                safeHumedad,
                safeTemperatura,
                safeEvapotranspiracion,
                lluvia_efectiva,
                etc,
                kc,
                diasDesdeSiembra,
                safeCorreccion
            ]
        );

        if (insertResult.rows.length === 0) {
            throw new Error('No se pudo insertar el cambio diario');
        }

        // Verificar que se calculó el día correctamente en el registro insertado
        if (insertResult.rows[0].dias != diasDesdeSiembra) {
            console.warn(`Inconsistencia: día calculado (${diasDesdeSiembra}) difiere del día insertado (${insertResult.rows[0].dias})`);
        }

        await client.query('COMMIT');
        //console.log('Cambio diario insertado correctamente:', insertResult.rows[0]);
        res.status(201).json(insertResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear cambio diario:', err);
        res.status(500).json({ 
            error: 'Error del servidor', 
            details: err.message,
            originalError: err.toString()
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
            correccion_agua
        } = req.body;

        // Validación de valores numéricos
        const safeRiego = parseFloat(riego_cantidad) || 0;
        const safePrecipitaciones = parseFloat(precipitaciones) || 0;
        const safeHumedad = parseFloat(humedad) || 0;
        const safeTemperatura = parseFloat(temperatura) || 0;
        const safeEvapotranspiracion = parseFloat(evapotranspiracion) || 0;
        const safeCorreccion = parseFloat(correccion_agua) || 0;

        // Obtener el lote_id del cambio diario actual
        const { rows: [cambioActual] } = await client.query(
            'SELECT cd.lote_id, cd.fecha_cambio, l.fecha_siembra FROM cambios_diarios cd JOIN lotes l ON cd.lote_id = l.id WHERE cd.id = $1',
            [id]
        );

        // Calcular días desde siembra de forma segura
        let diasDesdeSiembra;
        try {
            const { rows: [{ dias_calculados }] } = await client.query(
                `SELECT ($2::date - $1::date) + 1 as dias_calculados`,
                [cambioActual.fecha_siembra, cambioActual.fecha_cambio]
            );
            
            diasDesdeSiembra = parseInt(dias_calculados);
            
            if (isNaN(diasDesdeSiembra) || diasDesdeSiembra < 1) {
                console.error(`Días calculados inválidos en actualización: ${dias_calculados}`);
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    error: 'Error en el cálculo de días desde siembra',
                    details: `Fecha de siembra: ${cambioActual.fecha_siembra}, Fecha de cambio: ${cambioActual.fecha_cambio}`
                });
            }
            
        } catch (error) {
            console.error('Error al calcular días desde siembra en actualización:', error);
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'Error en el cálculo de días desde siembra',
                details: error.message
            });
        }
        
        // Calcular KC y ETC de forma segura
        let kc, etc, lluvia_efectiva;
        try {
            // Usar función unificada para calcular KC
            kc = await calcularKCUnificado(client, cambioActual.lote_id, diasDesdeSiembra);
            if (kc === null) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    error: 'No se puede calcular KC para este lote',
                    details: `No hay coeficientes KC definidos para el día ${diasDesdeSiembra} del lote ${cambioActual.lote_id}. ` +
                            'Por favor, configure los coeficientes KC del cultivo antes de actualizar cambios diarios.',
                    loteId: cambioActual.lote_id,
                    diasDesdeSiembra: diasDesdeSiembra
                });
            }
            
            // Calcular ETC usando la función helper consistente
            etc = calcularETC(safeEvapotranspiracion, kc);
            lluvia_efectiva = calcularLluviaEfectiva(safePrecipitaciones);
            
            // Validación adicional de lluvia efectiva
            if (isNaN(lluvia_efectiva)) {
                console.warn(`Lluvia efectiva resultó en NaN: de ${safePrecipitaciones}`);
                lluvia_efectiva = 0;
            }
            
        } catch (error) {
            console.error('Error al calcular KC, ETC o lluvia efectiva:', error);
            kc = 0.8;  // Valor por defecto actualizado
            etc = 0;
            lluvia_efectiva = 0;
        }

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
            kc = $9,
            correccion_agua = $10
            WHERE id = $11
            RETURNING *`,
            [
                safeRiego,
                riego_fecha_inicio,
                safePrecipitaciones,
                safeHumedad,
                safeTemperatura,
                safeEvapotranspiracion,
                etc,
                lluvia_efectiva,
                kc,
                safeCorreccion,
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
                const kc = await calcularKCUnificado(client, loteId, diasDesdeSiembra);
                if (kc === null) {
                    console.error(`No se puede calcular KC para lote ${loteId}, día ${diasDesdeSiembra}. Saltando este registro.`);
                    continue; // Saltar este lote y continuar con el siguiente
                }
                const etc = calcularETC(evapotranspiracion, kc);
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
                            precipitaciones, lluvia_efectiva, correccion_agua)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                        [loteId, fecha, evapotranspiracion, etc, kc, diasDesdeSiembra, 
                            precipitaciones || 0, lluvia_efectiva, 0]
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