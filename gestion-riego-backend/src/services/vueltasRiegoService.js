const pool = require('../db');
const gpsCalc = require('./gpsCalculationsService');

class VueltasRiegoService {
    constructor() {
        // Almacenar vuelta activa por regador
        this.vueltasActivas = new Map();
        // Margen de seguridad para considerar vuelta completa (10%)
        this.MARGEN_SEGURIDAD = 10;
    }

    /**
     * Inicializa o recupera la vuelta activa de un regador
     */
    async inicializarVuelta(regadorId, anguloActual, timestamp) {
        try {
            // Verificar si hay una vuelta activa en memoria
            if (this.vueltasActivas.has(regadorId)) {
                return this.vueltasActivas.get(regadorId);
            }

            // Buscar vuelta activa en la base de datos
            const queryVuelta = `
                SELECT * FROM vueltas_riego
                WHERE regador_id = $1 AND completada = false
                ORDER BY fecha_inicio DESC
                LIMIT 1
            `;
            
            const resultVuelta = await pool.query(queryVuelta, [regadorId]);

            if (resultVuelta.rows.length > 0) {
                // Recuperar vuelta existente
                const vuelta = resultVuelta.rows[0];
                this.vueltasActivas.set(regadorId, vuelta);
                console.log(`🔄 Vuelta ${vuelta.numero_vuelta} recuperada para regador ${regadorId}`);
                return vuelta;
            }

            // Crear nueva vuelta
            const queryNumeroVuelta = `
                SELECT COALESCE(MAX(numero_vuelta), 0) + 1 as siguiente_numero
                FROM vueltas_riego
                WHERE regador_id = $1
            `;
            
            const resultNumero = await pool.query(queryNumeroVuelta, [regadorId]);
            const numeroVuelta = resultNumero.rows[0].siguiente_numero;

            const queryInsert = `
                INSERT INTO vueltas_riego (
                    regador_id, numero_vuelta, fecha_inicio, angulo_inicio, completada
                ) VALUES ($1, $2, $3, $4, false)
                RETURNING *
            `;

            const resultInsert = await pool.query(queryInsert, [
                regadorId,
                numeroVuelta,
                timestamp,
                anguloActual
            ]);

            const nuevaVuelta = resultInsert.rows[0];
            this.vueltasActivas.set(regadorId, nuevaVuelta);

            console.log(`🆕 Nueva vuelta ${numeroVuelta} iniciada para regador ${regadorId} en ángulo ${anguloActual.toFixed(1)}°`);

            return nuevaVuelta;

        } catch (error) {
            console.error('Error inicializando vuelta:', error);
            throw error;
        }
    }

    /**
     * Verifica si completó la vuelta y la cierra si es necesario
     */
    async verificarCompletarVuelta(regadorId, anguloActual, timestamp) {
        try {
            const vueltaActiva = this.vueltasActivas.get(regadorId);
            
            if (!vueltaActiva) {
                return { completada: false };
            }

            // Verificar si completó la vuelta con margen de seguridad
            const verificacion = gpsCalc.verificarVueltaCompletada(
                vueltaActiva.angulo_inicio,
                anguloActual,
                this.MARGEN_SEGURIDAD
            );

            if (verificacion.completada) {
                // Completar la vuelta
                await this.completarVuelta(regadorId, anguloActual, timestamp, verificacion);
                return { completada: true, vuelta: vueltaActiva };
            }

            // Actualizar porcentaje de avance
            if (verificacion.porcentajeCompletado > 0) {
                await this.actualizarProgresoVuelta(
                    vueltaActiva.id,
                    verificacion.porcentajeCompletado
                );
            }

            return { completada: false, progreso: verificacion.porcentajeCompletado };

        } catch (error) {
            console.error('Error verificando completar vuelta:', error);
            throw error;
        }
    }

    /**
     * Completa una vuelta de riego
     */
    async completarVuelta(regadorId, anguloFin, timestamp, verificacion) {
        try {
            const vueltaActiva = this.vueltasActivas.get(regadorId);
            
            if (!vueltaActiva) return;

            // Calcular duración
            const duracionMs = new Date(timestamp) - new Date(vueltaActiva.fecha_inicio);
            const duracionMinutos = Math.round(duracionMs / 60000);

            // Obtener todos los sectores pasados en esta vuelta
            const querySectores = `
                SELECT 
                    spv.*,
                    gp.nombre_sector,
                    gp.numero_sector
                FROM sectores_por_vuelta spv
                JOIN geozonas_pivote gp ON spv.geozona_id = gp.id
                WHERE spv.vuelta_id = $1
            `;

            const resultSectores = await pool.query(querySectores, [vueltaActiva.id]);
            const sectores = resultSectores.rows;

            // Calcular totales
            let aguaTotalLitros = 0;
            let areaTotalHa = 0;
            let presionPromedio = 0;
            let countPresion = 0;

            for (const sector of sectores) {
                aguaTotalLitros += parseFloat(sector.agua_aplicada_litros || 0);
                areaTotalHa += parseFloat(sector.area_sector_ha || 0);
                if (sector.presion_promedio) {
                    presionPromedio += parseFloat(sector.presion_promedio);
                    countPresion++;
                }
            }

            presionPromedio = countPresion > 0 ? presionPromedio / countPresion : null;

            // Calcular lámina promedio
            const laminaPromedioMM = areaTotalHa > 0 
                ? gpsCalc.calcularLaminaPorHectarea(aguaTotalLitros, areaTotalHa)
                : 0;

            // Actualizar vuelta
            const queryUpdate = `
                UPDATE vueltas_riego
                SET fecha_fin = $1,
                    angulo_fin = $2,
                    duracion_minutos = $3,
                    completada = true,
                    completada_con_margen = $4,
                    porcentaje_completado = $5,
                    lamina_promedio_mm = $6,
                    agua_total_litros = $7,
                    area_total_ha = $8,
                    presion_promedio = $9
                WHERE id = $10
                RETURNING *
            `;

            const result = await pool.query(queryUpdate, [
                timestamp,
                anguloFin,
                duracionMinutos,
                true,
                verificacion.porcentajeCompletado,
                laminaPromedioMM,
                aguaTotalLitros,
                areaTotalHa,
                presionPromedio,
                vueltaActiva.id
            ]);

            const vueltaCompletada = result.rows[0];

            // Limpiar del cache
            this.vueltasActivas.delete(regadorId);

            console.log(`✅ Vuelta ${vueltaCompletada.numero_vuelta} completada - Duración: ${duracionMinutos}min - Lámina: ${laminaPromedioMM.toFixed(1)}mm - Agua: ${Math.round(aguaTotalLitros)}L - Área: ${areaTotalHa.toFixed(2)}ha`);

            return vueltaCompletada;

        } catch (error) {
            console.error('Error completando vuelta:', error);
            throw error;
        }
    }

    /**
     * Actualiza el progreso de una vuelta
     */
    async actualizarProgresoVuelta(vueltaId, porcentaje) {
        try {
            const query = `
                UPDATE vueltas_riego
                SET porcentaje_completado = $1
                WHERE id = $2
            `;

            await pool.query(query, [porcentaje, vueltaId]);

        } catch (error) {
            console.error('Error actualizando progreso vuelta:', error);
        }
    }

    /**
     * Registra la entrada a un sector en la vuelta actual
     */
    async registrarEntradaSector(regadorId, geozonaId, timestamp) {
        try {
            const vueltaActiva = this.vueltasActivas.get(regadorId);
            
            if (!vueltaActiva) {
                console.warn(`⚠️ No hay vuelta activa para registrar entrada a sector`);
                return null;
            }

            // Verificar si ya existe un registro para este sector en esta vuelta sin salida
            const queryExistente = `
                SELECT * FROM sectores_por_vuelta
                WHERE vuelta_id = $1 AND geozona_id = $2 AND fecha_salida IS NULL
                ORDER BY fecha_entrada DESC
                LIMIT 1
            `;

            const resultExistente = await pool.query(queryExistente, [vueltaActiva.id, geozonaId]);

            if (resultExistente.rows.length > 0) {
                // Ya hay un registro activo
                return resultExistente.rows[0];
            }

            // Obtener el orden en la vuelta
            const queryOrden = `
                SELECT COALESCE(MAX(orden_en_vuelta), 0) + 1 as siguiente_orden
                FROM sectores_por_vuelta
                WHERE vuelta_id = $1
            `;

            const resultOrden = await pool.query(queryOrden, [vueltaActiva.id]);
            const orden = resultOrden.rows[0].siguiente_orden;

            // Obtener datos del sector
            const querySector = `SELECT * FROM geozonas_pivote WHERE id = $1`;
            const resultSector = await pool.query(querySector, [geozonaId]);
            const sector = resultSector.rows[0];
            const areaHa = gpsCalc.calcularAreaSectorHectareas(sector);

            // Insertar nuevo registro
            const queryInsert = `
                INSERT INTO sectores_por_vuelta (
                    vuelta_id, geozona_id, fecha_entrada, 
                    area_sector_ha, orden_en_vuelta, completado
                ) VALUES ($1, $2, $3, $4, $5, false)
                RETURNING *
            `;

            const result = await pool.query(queryInsert, [
                vueltaActiva.id,
                geozonaId,
                timestamp,
                areaHa,
                orden
            ]);

            const registro = result.rows[0];

            console.log(`📍 Entrada a sector ${sector.nombre_sector} - Vuelta ${vueltaActiva.numero_vuelta} - Orden ${orden}`);

            return registro;

        } catch (error) {
            console.error('Error registrando entrada a sector:', error);
            throw error;
        }
    }

    /**
     * Registra la salida de un sector y calcula totales
     */
    async registrarSalidaSector(regadorId, geozonaId, timestamp) {
        try {
            const vueltaActiva = this.vueltasActivas.get(regadorId);
            
            if (!vueltaActiva) return null;

            // Buscar registro activo del sector
            const queryRegistro = `
                SELECT * FROM sectores_por_vuelta
                WHERE vuelta_id = $1 AND geozona_id = $2 AND fecha_salida IS NULL
                ORDER BY fecha_entrada DESC
                LIMIT 1
            `;

            const resultRegistro = await pool.query(queryRegistro, [vueltaActiva.id, geozonaId]);

            if (resultRegistro.rows.length === 0) {
                console.warn(`⚠️ No hay registro activo para salida del sector`);
                return null;
            }

            const registro = resultRegistro.rows[0];

            // Calcular duración
            const duracionMs = new Date(timestamp) - new Date(registro.fecha_entrada);
            const duracionMinutos = Math.round(duracionMs / 60000);

            // Obtener datos del regador y sector
            const queryDatos = `
                SELECT 
                    r.caudal,
                    gp.coeficiente_riego,
                    gp.nombre_sector
                FROM geozonas_pivote gp
                JOIN regadores r ON gp.regador_id = r.id
                WHERE gp.id = $1
            `;

            const resultDatos = await pool.query(queryDatos, [geozonaId]);
            const datos = resultDatos.rows[0];

            // Calcular agua aplicada
            const aguaLitros = datos.caudal 
                ? gpsCalc.calcularAguaAplicada(datos.caudal, duracionMinutos, datos.coeficiente_riego)
                : 0;

            // Calcular lámina
            const laminaMM = registro.area_sector_ha > 0
                ? gpsCalc.calcularLaminaPorHectarea(aguaLitros, registro.area_sector_ha)
                : 0;

            // Obtener promedios de presión y velocidad
            const queryPromedios = `
                SELECT 
                    AVG(presion) as presion_promedio,
                    MIN(presion) as presion_min,
                    MAX(presion) as presion_max,
                    AVG(velocidad) as velocidad_promedio
                FROM datos_operacion_gps
                WHERE geozona_id = $1
                  AND timestamp BETWEEN $2 AND $3
                  AND presion IS NOT NULL
            `;

            const resultPromedios = await pool.query(queryPromedios, [
                geozonaId,
                registro.fecha_entrada,
                timestamp
            ]);

            const promedios = resultPromedios.rows[0];

            // Actualizar registro
            const queryUpdate = `
                UPDATE sectores_por_vuelta
                SET fecha_salida = $1,
                    duracion_minutos = $2,
                    agua_aplicada_litros = $3,
                    lamina_aplicada_mm = $4,
                    presion_promedio = $5,
                    presion_min = $6,
                    presion_max = $7,
                    velocidad_promedio = $8,
                    completado = true
                WHERE id = $9
                RETURNING *
            `;

            const result = await pool.query(queryUpdate, [
                timestamp,
                duracionMinutos,
                aguaLitros,
                laminaMM,
                promedios.presion_promedio,
                promedios.presion_min,
                promedios.presion_max,
                promedios.velocidad_promedio,
                registro.id
            ]);

            const registroActualizado = result.rows[0];

            console.log(`📍 Salida de sector ${datos.nombre_sector} - Duración: ${duracionMinutos}min - Lámina: ${laminaMM.toFixed(1)}mm - Agua: ${Math.round(aguaLitros)}L`);

            return registroActualizado;

        } catch (error) {
            console.error('Error registrando salida de sector:', error);
            throw error;
        }
    }

    /**
     * Obtiene el resumen de todas las vueltas de un regador
     */
    async obtenerResumenVueltas(regadorId, limite = 10) {
        try {
            const query = `
                SELECT * FROM v_resumen_vueltas
                WHERE regador_id = $1
                ORDER BY numero_vuelta DESC
                LIMIT $2
            `;

            const result = await pool.query(query, [regadorId, limite]);

            return result.rows;

        } catch (error) {
            console.error('Error obteniendo resumen de vueltas:', error);
            throw error;
        }
    }

    /**
     * Obtiene el detalle de sectores de una vuelta específica
     */
    async obtenerDetalleSectoresVuelta(vueltaId) {
        try {
            const query = `
                SELECT * FROM v_detalle_sectores_vuelta
                WHERE vuelta_id = $1
                ORDER BY orden_en_vuelta
            `;

            const result = await pool.query(query, [vueltaId]);

            return result.rows;

        } catch (error) {
            console.error('Error obteniendo detalle de sectores:', error);
            throw error;
        }
    }

    /**
     * Obtiene estadísticas generales de riego de un regador
     */
    async obtenerEstadisticasGenerales(regadorId) {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_vueltas,
                    COUNT(CASE WHEN completada THEN 1 END) as vueltas_completadas,
                    SUM(agua_total_litros) as agua_total_aplicada,
                    AVG(lamina_promedio_mm) as lamina_promedio_general,
                    SUM(duracion_minutos) as tiempo_total_minutos,
                    AVG(duracion_minutos) as tiempo_promedio_vuelta,
                    MAX(fecha_fin) as ultima_vuelta
                FROM vueltas_riego
                WHERE regador_id = $1
            `;

            const result = await pool.query(query, [regadorId]);

            return result.rows[0];

        } catch (error) {
            console.error('Error obteniendo estadísticas generales:', error);
            throw error;
        }
    }
}

module.exports = new VueltasRiegoService();