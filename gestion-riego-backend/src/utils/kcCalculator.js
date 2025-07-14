/**
 * Función unificada para calcular KC considerando días de corrección
 * @param {Object} client - Cliente de base de datos (pool.connect())
 * @param {number} loteId - ID del lote
 * @param {number} diasDesdeSiembra - Días desde la siembra
 * @returns {Promise<number>} Valor de KC calculado
 */
async function calcularKCUnificado(client, loteId, diasDesdeSiembra) {
    try {
        // 1. Obtener el cultivo_id del lote
        const { rows: [lote] } = await client.query(
            'SELECT cultivo_id FROM lotes WHERE id = $1',
            [loteId]
        );

        if (!lote) {
            console.warn(`Lote ${loteId} no encontrado`);
            return 0.8; // Valor por defecto más realista que 0.4
        }

        // 2. Obtener los coeficientes del cultivo, considerando días de corrección
        const { rows: coeficientes } = await client.query(`
            SELECT 
                cc.indice_kc,
                COALESCE(ccl.dias_correccion, cc.indice_dias) as dias_efectivos,
                cc.indice_dias as dias_originales,
                cc.id as coeficiente_id
            FROM coeficiente_cultivo c
            LEFT JOIN coeficiente_cultivo_lote ccl ON ccl.lote_id = $2 AND ccl.coeficiente_cultivo_id = cc.id
            WHERE cc.cultivo_id = $1
            ORDER BY dias_efectivos ASC`,
            [lote.cultivo_id, loteId]
        );

        // 3. Si no hay coeficientes definidos, retornar valor por defecto
        if (!coeficientes.length) {
            console.warn(`No hay coeficientes KC definidos para el cultivo del lote ${loteId}`);
            return 0.8; // Valor por defecto más realista
        }

        // 4. Si estamos antes del primer período, usar el KC inicial
        if (diasDesdeSiembra <= coeficientes[0].dias_efectivos) {
            const kcInicial = parseFloat(coeficientes[0].indice_kc);
            return isNaN(kcInicial) ? 0.8 : kcInicial;
        }

        // 5. Si estamos después del último período, usar el último KC
        if (diasDesdeSiembra > coeficientes[coeficientes.length - 1].dias_efectivos) {
            const kcFinal = parseFloat(coeficientes[coeficientes.length - 1].indice_kc);
            return isNaN(kcFinal) ? 0.8 : kcFinal;
        }

        // 6. Buscar el intervalo correcto para interpolar
        for (let i = 0; i < coeficientes.length - 1; i++) {
            const periodoActual = coeficientes[i];
            const periodoSiguiente = coeficientes[i + 1];

            if (diasDesdeSiembra > periodoActual.dias_efectivos && 
                diasDesdeSiembra <= periodoSiguiente.dias_efectivos) {
                
                // Calcular KC por interpolación lineal
                const diasDiff = periodoSiguiente.dias_efectivos - periodoActual.dias_efectivos;
                const kcDiff = periodoSiguiente.indice_kc - periodoActual.indice_kc;
                
                if (diasDiff === 0) {
                    // Si los días son iguales, usar el KC del período actual
                    return parseFloat(periodoActual.indice_kc) || 0.8;
                }
                
                const factor = (diasDesdeSiembra - periodoActual.dias_efectivos) / diasDiff;
                const kcInterpolado = parseFloat(periodoActual.indice_kc) + (kcDiff * factor);
                
                // Validar que el resultado sea un número válido
                if (isNaN(kcInterpolado)) {
                    console.warn(`KC interpolado inválido para lote ${loteId}, día ${diasDesdeSiembra}`);
                    return 0.8;
                }
                
                return kcInterpolado;
            }
        }

        // 7. Fallback - usar el último KC disponible
        const kcFallback = parseFloat(coeficientes[coeficientes.length - 1].indice_kc);
        return isNaN(kcFallback) ? 0.8 : kcFallback;

    } catch (error) {
        console.error(`Error calculando KC para lote ${loteId}, día ${diasDesdeSiembra}:`, error);
        return 0.8; // Valor por defecto en caso de error
    }
}

/**
 * Función para validar que un lote tenga configuración KC completa
 * @param {Object} client - Cliente de base de datos  
 * @param {number} loteId - ID del lote
 * @returns {Promise<Object>} Objeto con validación y detalles
 */
async function validarConfiguracionKC(client, loteId) {
    try {
        const { rows: [lote] } = await client.query(
            'SELECT cultivo_id, nombre_lote FROM lotes WHERE id = $1',
            [loteId]
        );

        if (!lote) {
            return { valido: false, error: 'Lote no encontrado' };
        }

        const { rows: coeficientes } = await client.query(`
            SELECT 
                cc.indice_kc,
                COALESCE(ccl.dias_correccion, cc.indice_dias) as dias_efectivos,
                cc.indice_dias as dias_originales
            FROM coeficiente_cultivo cc
            LEFT JOIN coeficiente_cultivo_lote ccl ON ccl.lote_id = $2 AND ccl.coeficiente_cultivo_id = cc.id
            WHERE cc.cultivo_id = $1
            ORDER BY dias_efectivos ASC`,
            [lote.cultivo_id, loteId]
        );

        if (!coeficientes.length) {
            return { 
                valido: false, 
                error: 'No hay coeficientes KC definidos para este cultivo',
                lote: lote.nombre_lote
            };
        }

        // Verificar que no haya valores nulos o inválidos
        const coeficientesInvalidos = coeficientes.filter(c => 
            isNaN(parseFloat(c.indice_kc)) || c.dias_efectivos <= 0
        );

        if (coeficientesInvalidos.length > 0) {
            return {
                valido: false,
                error: 'Hay coeficientes KC inválidos',
                coeficientesInvalidos,
                lote: lote.nombre_lote
            };
        }

        return {
            valido: true,
            coeficientes: coeficientes.length,
            rangoCompleto: {
                diaInicio: coeficientes[0].dias_efectivos,
                diaFin: coeficientes[coeficientes.length - 1].dias_efectivos
            },
            lote: lote.nombre_lote
        };

    } catch (error) {
        return {
            valido: false,
            error: `Error validando configuración: ${error.message}`
        };
    }
}

module.exports = {
    calcularKCUnificado,
    validarConfiguracionKC
};