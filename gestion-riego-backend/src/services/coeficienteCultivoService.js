const pool = require('../db');

async function obtenerCoeficientesPorCultivo(cultivoId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, indice_kc, indice_dias FROM coeficiente_cultivo WHERE cultivo_id = $1 ORDER BY indice_dias',
            [cultivoId]
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function obtenerCoeficientesPorLote(loteId) {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT
                cc.id,
                cc.indice_kc,
                cc.indice_dias,
                COALESCE(ccl.dias_correccion, cc.indice_dias) as dias_efectivos,
                ccl.dias_correccion as dias_correccion_lote,
                ccl.kc_correccion as kc_correccion_lote
            FROM coeficiente_cultivo cc
            JOIN lotes l ON l.cultivo_id = cc.cultivo_id
            LEFT JOIN coeficiente_cultivo_lote ccl ON ccl.lote_id = l.id AND ccl.coeficiente_cultivo_id = cc.id
            WHERE l.id = $1
            ORDER BY cc.indice_dias
        `, [loteId]);
        return result.rows;
    } finally {
        client.release();
    }
}

async function actualizarDiasCorreccionPorLote(loteId, coeficienteId, diasCorreccion) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (diasCorreccion === null || diasCorreccion === undefined || diasCorreccion === '') {
            await client.query(
                'DELETE FROM coeficiente_cultivo_lote WHERE lote_id = $1 AND coeficiente_cultivo_id = $2',
                [loteId, coeficienteId]
            );
        } else {
            await client.query(`
                INSERT INTO coeficiente_cultivo_lote (lote_id, coeficiente_cultivo_id, dias_correccion, fecha_modificacion)
                VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                ON CONFLICT (lote_id, coeficiente_cultivo_id)
                DO UPDATE SET
                    dias_correccion = $3,
                    fecha_modificacion = CURRENT_TIMESTAMP
            `, [loteId, coeficienteId, diasCorreccion]);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function actualizarMultiplesDiasCorreccionPorLote(loteId, coeficientes) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const coef of coeficientes) {
            const noTieneDias = coef.dias_correccion === null || coef.dias_correccion === undefined || coef.dias_correccion === '';
            const noTieneKc = coef.kc_correccion === null || coef.kc_correccion === undefined || coef.kc_correccion === '';

            if (noTieneDias && noTieneKc) {
                await client.query(
                    'DELETE FROM coeficiente_cultivo_lote WHERE lote_id = $1 AND coeficiente_cultivo_id = $2',
                    [loteId, coef.id]
                );
            } else {
                await client.query(`
                    INSERT INTO coeficiente_cultivo_lote (lote_id, coeficiente_cultivo_id, dias_correccion, kc_correccion, fecha_modificacion)
                    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                    ON CONFLICT (lote_id, coeficiente_cultivo_id)
                    DO UPDATE SET
                        dias_correccion = $3,
                        kc_correccion = $4,
                        fecha_modificacion = CURRENT_TIMESTAMP
                `, [loteId, coef.id,
                    noTieneDias ? null : coef.dias_correccion,
                    noTieneKc ? null : coef.kc_correccion
                ]);
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function restablecerDiasCorreccionPorLote(loteId, coeficienteId = null) {
    const client = await pool.connect();
    try {
        if (coeficienteId) {
            await client.query(
                'DELETE FROM coeficiente_cultivo_lote WHERE lote_id = $1 AND coeficiente_cultivo_id = $2',
                [loteId, coeficienteId]
            );
        } else {
            await client.query(
                'DELETE FROM coeficiente_cultivo_lote WHERE lote_id = $1',
                [loteId]
            );
        }
    } finally {
        client.release();
    }
}

async function obtenerCoeficientesEfectivosPorLote(loteId) {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT
                cc.id,
                cc.indice_kc,
                cc.indice_dias,
                COALESCE(ccl.dias_correccion, cc.indice_dias) as dias_efectivos,
                ccl.dias_correccion,
                ccl.kc_correccion,
                CASE
                    WHEN ccl.dias_correccion IS NOT NULL OR ccl.kc_correccion IS NOT NULL THEN true
                    ELSE false
                END as tiene_correccion
            FROM coeficiente_cultivo cc
            JOIN lotes l ON l.cultivo_id = cc.cultivo_id
            LEFT JOIN coeficiente_cultivo_lote ccl ON ccl.lote_id = l.id AND ccl.coeficiente_cultivo_id = cc.id
            WHERE l.id = $1
            ORDER BY COALESCE(ccl.dias_correccion, cc.indice_dias)
        `, [loteId]);
        return result.rows;
    } finally {
        client.release();
    }
}

module.exports = {
    obtenerCoeficientesPorCultivo,
    obtenerCoeficientesPorLote,
    actualizarDiasCorreccionPorLote,
    actualizarMultiplesDiasCorreccionPorLote,
    restablecerDiasCorreccionPorLote,
    obtenerCoeficientesEfectivosPorLote,
    // Mantener funciones antiguas por compatibilidad (deprecated)
    actualizarDiasCorreccion: actualizarDiasCorreccionPorLote,
    actualizarMultiplesDiasCorreccion: actualizarMultiplesDiasCorreccionPorLote,
    restablecerDiasCorreccion: restablecerDiasCorreccionPorLote
};
