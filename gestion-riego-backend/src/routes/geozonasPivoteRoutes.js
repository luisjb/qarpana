// src/routes/geozonasPivoteRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../db');

// Obtener configuración de geozonas para un lote y regador específico
router.get('/lote/:loteId/regador/:regadorId', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { loteId, regadorId } = req.params;

        // Obtener información del regador
        const regadorQuery = await client.query(
            'SELECT * FROM regadores WHERE id = $1',
            [regadorId]
        );

        if (regadorQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Regador no encontrado' });
        }

        const regador = regadorQuery.rows[0];

        // Obtener geozonas del lote para este regador
        const geozonas = await client.query(
            `SELECT * FROM geozonas_pivote 
             WHERE lote_id = $1 AND regador_id = $2 
             ORDER BY numero_sector`,
            [loteId, regadorId]
        );

        if (geozonas.rows.length === 0) {
            return res.status(404).json({
                message: 'No hay configuración existente',
                exists: false
            });
        }

        // Retornar configuración completa
        res.json({
            id: geozonas.rows[0].id, // ID de la primera geozona para referencia
            latitud_centro: regador.latitud_centro,
            longitud_centro: regador.longitud_centro,
            radio_cobertura: regador.radio_cobertura,
            sectores: geozonas.rows
        });

    } catch (err) {
        console.error('Error al obtener geozonas:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Crear nueva configuración de geozonas
router.post('/', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            regador_id,
            lote_id,
            latitud_centro,
            longitud_centro,
            radio_cobertura,
            sectores
        } = req.body;

        // Validar datos requeridos
        if (!regador_id || !lote_id || !sectores || sectores.length === 0) {
            return res.status(400).json({
                error: 'Faltan datos requeridos',
                required: ['regador_id', 'lote_id', 'sectores']
            });
        }

        // Actualizar coordenadas y radio del regador
        await client.query(
            `UPDATE regadores 
             SET latitud_centro = $1, longitud_centro = $2, radio_cobertura = $3,
                 fecha_actualizacion = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [latitud_centro, longitud_centro, radio_cobertura, regador_id]
        );

        // Verificar si ya existen geozonas para este lote y regador
        const existingQuery = await client.query(
            `SELECT id, numero_sector FROM geozonas_pivote 
             WHERE regador_id = $1 AND lote_id = $2`,
            [regador_id, lote_id]
        );

        if (existingQuery.rows.length > 0) {
            // Si ya existen, usar la lógica de actualización
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: 'Ya existe configuración para este lote y regador',
                message: 'Use PUT para actualizar la configuración existente',
                existing_sectors: existingQuery.rows.length
            });
        }

        // Insertar nuevos sectores
        const insertedSectores = [];
        for (const sector of sectores) {
            const result = await client.query(
                `INSERT INTO geozonas_pivote (
                    regador_id, lote_id, nombre_sector, numero_sector,
                    angulo_inicio, angulo_fin, radio_interno, radio_externo,
                    activo, color_display, coeficiente_riego, prioridad
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
                [
                    regador_id,
                    lote_id,
                    sector.nombre_sector,
                    sector.numero_sector,
                    sector.angulo_inicio,
                    sector.angulo_fin,
                    sector.radio_interno || 0,
                    sector.radio_externo,
                    sector.activo !== false,
                    sector.color_display,
                    sector.coeficiente_riego || 1.0,
                    sector.prioridad || 1
                ]
            );
            insertedSectores.push(result.rows[0]);

            // Crear estado inicial
            await client.query(
                `INSERT INTO estado_sectores_riego (geozona_id, estado) 
                 VALUES ($1, $2)
                 ON CONFLICT (geozona_id) DO NOTHING`,
                [result.rows[0].id, 'pendiente']
            );
        }

        await client.query('COMMIT');

        console.log(`✅ Geozonas creadas - Regador: ${regador_id}, Lote: ${lote_id}, Sectores: ${insertedSectores.length}`);

        res.status(201).json({
            message: 'Geozonas creadas con éxito',
            sectores: insertedSectores
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear geozonas:', err);
        res.status(500).json({
            error: 'Error del servidor',
            details: err.message
        });
    } finally {
        client.release();
    }
});

// Actualizar configuración de geozonas existente
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            regador_id,
            lote_id,
            latitud_centro,
            longitud_centro,
            radio_cobertura,
            sectores
        } = req.body;

        // Validar datos requeridos
        if (!regador_id || !lote_id || !sectores || sectores.length === 0) {
            return res.status(400).json({
                error: 'Faltan datos requeridos',
                required: ['regador_id', 'lote_id', 'sectores']
            });
        }

        // Actualizar coordenadas y radio del regador
        await client.query(
            `UPDATE regadores 
             SET latitud_centro = $1, longitud_centro = $2, radio_cobertura = $3,
                 fecha_actualizacion = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [latitud_centro, longitud_centro, radio_cobertura, regador_id]
        );

        // Obtener geozonas existentes para este lote y regador
        const existingQuery = await client.query(
            `SELECT id, numero_sector FROM geozonas_pivote 
             WHERE regador_id = $1 AND lote_id = $2`,
            [regador_id, lote_id]
        );

        const existingGeozonas = new Map(
            existingQuery.rows.map(row => [row.numero_sector, row.id])
        );

        const updatedSectores = [];
        const sectoresEnviados = new Set();

        // UPSERT: Actualizar o insertar cada sector
        for (const sector of sectores) {
            sectoresEnviados.add(sector.numero_sector);

            const existingId = existingGeozonas.get(sector.numero_sector);

            if (existingId) {
                // ACTUALIZAR sector existente (conserva ID y datos históricos)
                const result = await client.query(
                    `UPDATE geozonas_pivote 
                     SET nombre_sector = $1,
                         angulo_inicio = $2,
                         angulo_fin = $3,
                         radio_interno = $4,
                         radio_externo = $5,
                         activo = $6,
                         color_display = $7,
                         coeficiente_riego = $8,
                         prioridad = $9,
                         fecha_actualizacion = CURRENT_TIMESTAMP
                     WHERE id = $10
                     RETURNING *`,
                    [
                        sector.nombre_sector,
                        sector.angulo_inicio,
                        sector.angulo_fin,
                        sector.radio_interno || 0,
                        sector.radio_externo,
                        sector.activo !== false,
                        sector.color_display,
                        sector.coeficiente_riego || 1.0,
                        sector.prioridad || 1,
                        existingId
                    ]
                );
                updatedSectores.push(result.rows[0]);
                console.log(`🔄 Sector actualizado: ${sector.nombre_sector} (ID: ${existingId})`);
            } else {
                // INSERTAR nuevo sector
                const result = await client.query(
                    `INSERT INTO geozonas_pivote (
                        regador_id, lote_id, nombre_sector, numero_sector,
                        angulo_inicio, angulo_fin, radio_interno, radio_externo,
                        activo, color_display, coeficiente_riego, prioridad
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING *`,
                    [
                        regador_id,
                        lote_id,
                        sector.nombre_sector,
                        sector.numero_sector,
                        sector.angulo_inicio,
                        sector.angulo_fin,
                        sector.radio_interno || 0,
                        sector.radio_externo,
                        sector.activo !== false,
                        sector.color_display,
                        sector.coeficiente_riego || 1.0,
                        sector.prioridad || 1
                    ]
                );
                updatedSectores.push(result.rows[0]);
                console.log(`➕ Sector creado: ${sector.nombre_sector} (ID: ${result.rows[0].id})`);

                // Crear estado inicial para el nuevo sector
                await client.query(
                    `INSERT INTO estado_sectores_riego (geozona_id, estado) 
                     VALUES ($1, $2)
                     ON CONFLICT (geozona_id) DO NOTHING`,
                    [result.rows[0].id, 'pendiente']
                );
            }
        }

        // ELIMINAR sectores que ya no están en la configuración
        // (solo si el usuario eliminó sectores explícitamente)
        const sectoresAEliminar = [];
        for (const [numeroSector, geozonaId] of existingGeozonas.entries()) {
            if (!sectoresEnviados.has(numeroSector)) {
                sectoresAEliminar.push(geozonaId);
            }
        }

        if (sectoresAEliminar.length > 0) {
            // IMPORTANTE: Marcar como inactivo en lugar de eliminar
            // Esto preserva el historial
            await client.query(
                `UPDATE geozonas_pivote 
                 SET activo = false, 
                     fecha_actualizacion = CURRENT_TIMESTAMP
                 WHERE id = ANY($1)`,
                [sectoresAEliminar]
            );
            console.log(`🚫 Sectores desactivados: ${sectoresAEliminar.length}`);
        }

        await client.query('COMMIT');

        console.log(`✅ Configuración actualizada - Regador: ${regador_id}, Lote: ${lote_id}`);
        console.log(`   📊 Actualizados: ${updatedSectores.filter(s => existingGeozonas.has(s.numero_sector)).length}`);
        console.log(`   ➕ Nuevos: ${updatedSectores.filter(s => !existingGeozonas.has(s.numero_sector)).length}`);
        console.log(`   🚫 Desactivados: ${sectoresAEliminar.length}`);

        res.json({
            message: 'Geozonas actualizadas con éxito',
            sectores: updatedSectores,
            stats: {
                actualizados: updatedSectores.filter(s => existingGeozonas.has(s.numero_sector)).length,
                nuevos: updatedSectores.filter(s => !existingGeozonas.has(s.numero_sector)).length,
                desactivados: sectoresAEliminar.length
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar geozonas:', err);
        res.status(500).json({
            error: 'Error del servidor',
            details: err.message
        });
    } finally {
        client.release();
    }
});

// Eliminar configuración de geozonas
router.delete('/lote/:loteId/regador/:regadorId', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { loteId, regadorId } = req.params;

        // Eliminar estados de sectores primero
        await client.query(
            `DELETE FROM estado_sectores_riego 
             WHERE geozona_id IN (
                 SELECT id FROM geozonas_pivote 
                 WHERE lote_id = $1 AND regador_id = $2
             )`,
            [loteId, regadorId]
        );

        // Eliminar geozonas
        const result = await client.query(
            'DELETE FROM geozonas_pivote WHERE lote_id = $1 AND regador_id = $2 RETURNING *',
            [loteId, regadorId]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No se encontraron geozonas para eliminar' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Geozonas eliminadas con éxito' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar geozonas:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Obtener todas las geozonas de un regador
// RUTA CORREGIDA: Obtener todas las geozonas de un regador
// SIN filtrar por lote (para mostrar todos los sectores en visualización)

router.get('/regador/:regadorId', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const { regadorId } = req.params;
        const { filtrar_lote } = req.query; // Parámetro opcional para filtrar

        // ⭐ NUEVO: Inicializar estados faltantes para todos los sectores del regador
        await client.query(`
            INSERT INTO estado_sectores_riego (geozona_id, estado, progreso_porcentaje)
            SELECT gp.id, 'pendiente', 0
            FROM geozonas_pivote gp
            WHERE gp.regador_id = $1 
              AND gp.activo = true
              AND NOT EXISTS (
                  SELECT 1 FROM estado_sectores_riego esr 
                  WHERE esr.geozona_id = gp.id
              )
            ON CONFLICT (geozona_id) DO NOTHING
        `, [regadorId]);

        // Obtener la posición actual del regador para saber en qué lote está
        const queryPosicionActual = `
            SELECT 
                dog.geozona_id,
                gp.lote_id,
                dog.regando
            FROM datos_operacion_gps dog
            LEFT JOIN geozonas_pivote gp ON dog.geozona_id = gp.id
            WHERE dog.regador_id = $1
              AND dog.dentro_geozona = true
            ORDER BY dog.timestamp DESC
            LIMIT 1
        `;

        const resultPosicion = await client.query(queryPosicionActual, [regadorId]);
        const loteActual = resultPosicion.rows[0]?.lote_id || null;
        const regandoAhora = resultPosicion.rows[0]?.regando || false;

        // Construir query base
        let query = `
            SELECT 
                gp.*,
                l.nombre_lote,
                COALESCE(esr.estado, 'pendiente') as estado,
                COALESCE(esr.progreso_porcentaje, 0) as progreso_porcentaje,
                esr.agua_aplicada_litros
            FROM geozonas_pivote gp
            LEFT JOIN lotes l ON gp.lote_id = l.id
            LEFT JOIN estado_sectores_riego esr ON gp.id = esr.geozona_id
            WHERE gp.regador_id = $1
              AND gp.activo = true
        `;

        const params = [regadorId];

        // ⭐ CAMBIO CRÍTICO: Solo filtrar si se solicita explícitamente
        // Por defecto, mostrar TODOS los sectores del regador
        if (filtrar_lote === 'true' && loteActual && regandoAhora) {
            // Solo filtrar si está regando activamente en un lote específico
            query += ` AND gp.lote_id = $2`;
            params.push(loteActual);
            console.log(`📍 Regador ${regadorId} está regando en lote ${loteActual}, filtrando sectores`);
        } else {
            console.log(`📍 Regador ${regadorId}: mostrando TODOS los sectores configurados`);
        }

        query += ` ORDER BY l.nombre_lote, gp.numero_sector`;

        const { rows } = await client.query(query, params);

        console.log(`✅ Devolviendo ${rows.length} sectores para regador ${regadorId}`);

        res.json({
            success: true,
            lote_actual: loteActual,
            regando_ahora: regandoAhora,
            total_sectores: rows.length,
            data: rows
        });

    } catch (err) {
        console.error('Error al obtener geozonas del regador:', err);
        res.status(500).json({
            success: false,
            error: 'Error del servidor'
        });
    } finally {
        client.release();
    }
});

module.exports = router;