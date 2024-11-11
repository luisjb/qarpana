const pool = require('../db');

async function obtenerCoeficientesPorCultivo(cultivoId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, indice_kc, indice_dias, dias_correccion FROM coeficiente_cultivo WHERE cultivo_id = $1 ORDER BY indice_dias',
            [cultivoId]
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function actualizarDiasCorreccion(cultivoId, indiceDias, diasCorreccion) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE coeficiente_cultivo SET dias_correccion = $1 WHERE cultivo_id = $2 AND indice_dias = $3',
            [diasCorreccion, cultivoId, indiceDias]
        );
    } finally {
        client.release();
    }
}

async function actualizarMultiplesDiasCorreccion(cultivoId, coeficientes) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const coef of coeficientes) {
            await client.query(
                'UPDATE coeficiente_cultivo SET dias_correccion = $1 WHERE cultivo_id = $2 AND id = $3',
                [coef.dias_correccion, cultivoId, coef.id]
            );
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function restablecerDiasCorreccion(cultivoId, indiceDias) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE coeficiente_cultivo SET dias_correccion = NULL WHERE cultivo_id = $1 AND indice_dias = $2',
            [cultivoId, indiceDias]
        );
    } finally {
        client.release();
    }
}

module.exports = {
    obtenerCoeficientesPorCultivo,
    actualizarDiasCorreccion,
    actualizarMultiplesDiasCorreccion,
    restablecerDiasCorreccion
};