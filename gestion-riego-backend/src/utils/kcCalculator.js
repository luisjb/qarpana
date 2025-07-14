// utils/kcCalculator.js - VERSIÓN CORREGIDA

/**
 * Función unificada para calcular KC considerando días de corrección
 * @param {Object} client - Cliente de base de datos (pool.connect())
 * @param {number} loteId - ID del lote
 * @param {number} diasDesdeSiembra - Días desde la siembra
 * @returns {Promise<number|null>} Valor de KC calculado o null si no se encuentra
 */
async function calcularKCUnificado(client, loteId, diasDesdeSiembra) {
    try {
        // 1. Obtener el cultivo_id del lote
        const { rows: [lote] } = await client.query(
            'SELECT cultivo_id, nombre_lote FROM lotes WHERE id = $1',
            [loteId]
        );

        if (!lote) {
            console.warn(`Lote ${loteId} no encontrado`);
            return null; // Retornar null en lugar de valor por defecto
        }

        // 2. Obtener los coeficientes del cultivo, considerando días de corrección
        const { rows: coeficientes } = await client.query(`
            SELECT 
                coef.indice_kc,
                COALESCE(ccl.dias_correccion, coef.indice_dias) as dias_efectivos,
                coef.indice_dias as dias_originales,
                coef.id as coeficiente_id
            FROM coeficiente_cultivo coef
            LEFT JOIN coeficiente_cultivo_lote ccl ON ccl.lote_id = $2 AND ccl.coeficiente_cultivo_id = coef.id
            WHERE coef.cultivo_id = $1
            ORDER BY dias_efectivos ASC`,
            [lote.cultivo_id, loteId]
        );

        // 3. Si no hay coeficientes definidos, retornar null
        if (!coeficientes.length) {
            console.error(`ERROR: No hay coeficientes KC definidos para el cultivo del lote ${loteId} (${lote.nombre_lote})`);
            console.error(`Por favor, configure los coeficientes KC para este cultivo antes de continuar.`);
            return null; // Retornar null para que se maneje explícitamente
        }

        // Log para debug de configuración
        /*console.log(`Coeficientes KC para lote ${loteId}:`, 
            coeficientes.map(c => `Día ${c.dias_efectivos}: KC ${c.indice_kc}`).join(', ')
        );*/

        // 4. Si estamos antes del primer período, usar el KC inicial
        if (diasDesdeSiembra <= coeficientes[0].dias_efectivos) {
            const kcInicial = parseFloat(coeficientes[0].indice_kc);
            if (isNaN(kcInicial)) {
                console.error(`KC inicial inválido para lote ${loteId}: ${coeficientes[0].indice_kc}`);
                return null;
            }
            //console.log(`KC para lote ${loteId}, día ${diasDesdeSiembra}: ${kcInicial} (período inicial)`);
            return kcInicial;
        }

        // 5. Si estamos después del último período, usar el último KC
        if (diasDesdeSiembra > coeficientes[coeficientes.length - 1].dias_efectivos) {
            const kcFinal = parseFloat(coeficientes[coeficientes.length - 1].indice_kc);
            if (isNaN(kcFinal)) {
                console.error(`KC final inválido para lote ${loteId}: ${coeficientes[coeficientes.length - 1].indice_kc}`);
                return null;
            }
            //console.log(`KC para lote ${loteId}, día ${diasDesdeSiembra}: ${kcFinal} (período final)`);
            return kcFinal;
        }

        // 6. Buscar el intervalo correcto para interpolar
        for (let i = 0; i < coeficientes.length - 1; i++) {
            const periodoActual = coeficientes[i];
            const periodoSiguiente = coeficientes[i + 1];

            if (diasDesdeSiembra > periodoActual.dias_efectivos && 
                diasDesdeSiembra <= periodoSiguiente.dias_efectivos) {
                
                // Validar que los KCs sean números válidos
                const kcActual = parseFloat(periodoActual.indice_kc);
                const kcSiguiente = parseFloat(periodoSiguiente.indice_kc);
                
                if (isNaN(kcActual) || isNaN(kcSiguiente)) {
                    console.error(`KCs inválidos para interpolación en lote ${loteId}: actual=${periodoActual.indice_kc}, siguiente=${periodoSiguiente.indice_kc}`);
                    return null;
                }
                
                // Calcular KC por interpolación lineal
                const diasDiff = periodoSiguiente.dias_efectivos - periodoActual.dias_efectivos;
                const kcDiff = kcSiguiente - kcActual;
                
                if (diasDiff === 0) {
                    // Si los días son iguales, usar el KC del período actual
                    //console.log(`KC para lote ${loteId}, día ${diasDesdeSiembra}: ${kcActual} (días iguales)`);
                    return kcActual;
                }
                
                const factor = (diasDesdeSiembra - periodoActual.dias_efectivos) / diasDiff;
                const kcInterpolado = kcActual + (kcDiff * factor);
                
                // Validar que el resultado sea un número válido
                if (isNaN(kcInterpolado)) {
                    console.error(`KC interpolado inválido para lote ${loteId}, día ${diasDesdeSiembra}: resultado=${kcInterpolado}`);
                    return null;
                }
                
                /*console.log(`KC interpolado para lote ${loteId}, día ${diasDesdeSiembra}: ${kcInterpolado.toFixed(3)}`, {
                    periodoActual: periodoActual.dias_efectivos,
                    periodoSiguiente: periodoSiguiente.dias_efectivos,
                    kcActual: kcActual,
                    kcSiguiente: kcSiguiente,
                    factor: factor.toFixed(3)
                });*/
                
                return kcInterpolado;
            }
        }

        // 7. Si llegamos aquí, algo salió mal en la lógica
        console.error(`No se pudo determinar KC para lote ${loteId}, día ${diasDesdeSiembra}. Configuración de coeficientes incompleta.`);
        return null;

    } catch (error) {
        console.error(`Error calculando KC para lote ${loteId}, día ${diasDesdeSiembra}:`, error);
        return null; // Retornar null en caso de error
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
                coef.indice_kc,
                COALESCE(ccl.dias_correccion, coef.indice_dias) as dias_efectivos,
                coef.indice_dias as dias_originales
            FROM coeficiente_cultivo coef
            LEFT JOIN coeficiente_cultivo_lote ccl ON ccl.lote_id = $2 AND ccl.coeficiente_cultivo_id = coef.id
            WHERE coef.cultivo_id = $1
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
            lote: lote.nombre_lote,
            detalles: coeficientes
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