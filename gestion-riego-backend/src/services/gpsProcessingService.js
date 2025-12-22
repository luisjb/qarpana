const pool = require('../db');
const gpsCalc = require('./gpsCalculationsService');
const vueltasService = require('./vueltasRiegoService');

class GPSProcessingService {
    constructor() {
        // Almacenar última posición procesada por regador (en memoria)
        this.ultimasPosiciones = new Map();
        // INTERVALOS AJUSTADOS
        this.INTERVALO_GUARDADO_DETENIDO = 30 * 60 * 1000; // 30 minutos si está detenido
        this.INTERVALO_GUARDADO_REGANDO = 10 * 60 * 1000;  // 10 minutos si está regando/movimiento
    }

    /**
     * Determina el estado del regador basándose en los datos
     */
    determinarEstadoRegador(position, presion, velocidad) {
        const ignition = position.attributes?.ignition || false;

        // Presión > 20 PSI indica que está regando
        const regando = presion && presion > 10;

        // Velocidad > 0.1 km/h indica movimiento (ajustado, antes era 0.5)
        const movimiento = velocidad && velocidad > 0.01;

        return {
            encendido: ignition,
            regando: regando,
            moviendose: movimiento,
            estado_texto: this.getEstadoTexto(ignition, regando, movimiento)
        };
    }

    getEstadoTexto(encendido, regando, moviendose) {
        if (!encendido) return 'apagado';
        if (regando && moviendose) return 'regando_activo';
        if (regando && !moviendose) return 'regando_detenido';
        if (moviendose && !regando) return 'movimiento_sin_riego';
        return 'encendido_detenido';
    }

    /**
     * Verifica si debe guardar esta posición
     */
    debeGuardarPosicion(regadorId, timestamp, estado) {
        const ultimaPosicion = this.ultimasPosiciones.get(regadorId);

        if (!ultimaPosicion) {
            return true; // Primera posición, siempre guardar
        }

        const tiempoTranscurrido = timestamp - ultimaPosicion.timestamp;

        // Si está regando o en movimiento, guardar cada 10 minutos
        if (estado.regando || estado.moviendose) {
            return tiempoTranscurrido >= this.INTERVALO_GUARDADO_REGANDO;
        }

        // Si está detenido, guardar cada 30 minutos
        return tiempoTranscurrido >= this.INTERVALO_GUARDADO_DETENIDO;
    }

    /**
     * Verifica si cambió el estado del regador
     */
    cambioEstado(regadorId, nuevoEstado) {
        const ultimaPosicion = this.ultimasPosiciones.get(regadorId);

        if (!ultimaPosicion) return true;

        return ultimaPosicion.estado.encendido !== nuevoEstado.encendido ||
            ultimaPosicion.estado.regando !== nuevoEstado.regando ||
            ultimaPosicion.estado.moviendose !== nuevoEstado.moviendose;
    }

    /**
     * Procesa una posición recibida de Traccar
     */
    async procesarPosicion(positionData) {
        try {
            const device = positionData.device;
            const position = positionData.position;
            const timestamp = new Date(position.deviceTime);

            // Buscar el regador correspondiente
            const regador = await this.buscarRegador(device.name);

            if (!regador) {
                console.log(`⚠️ Regador no encontrado para dispositivo: ${device.name}`);
                return { processed: false, reason: 'Regador no encontrado' };
            }

            // Verificar que el regador tenga coordenadas configuradas
            if (!regador.latitud_centro || !regador.longitud_centro) {
                console.log(`⚠️ Regador ${device.name} sin coordenadas configuradas - se guardará sin geozona`);
            }

            // Extraer IO9 de los atributos
            const io9 = position.attributes?.io9 || position.attributes?.io_9;

            // Calcular presión
            const presion = io9 ? gpsCalc.calcularPresionDesdeIO9(io9) : null;

            // Determinar estado del regador
            const estado = this.determinarEstadoRegador(position, presion, position.speed);

            // Calcular ángulo y distancia desde el centro (solo si hay coordenadas)
            let angulo = null;
            let distancia = null;
            let geozona = null;

            if (regador.latitud_centro && regador.longitud_centro) {
                angulo = gpsCalc.calcularAngulo(
                    regador.latitud_centro,
                    regador.longitud_centro,
                    position.latitude,
                    position.longitude
                );

                distancia = gpsCalc.calcularDistancia(
                    regador.latitud_centro,
                    regador.longitud_centro,
                    position.latitude,
                    position.longitude
                );

                // Buscar en qué geozona está
                geozona = await this.buscarGeozonaActual(
                    regador.id,
                    position.latitude,
                    position.longitude,
                    angulo,
                    distancia
                );
            }

            // ========== INICIO: GESTIÓN DE VUELTAS ==========
            let vueltaActual = null;
            if (regador.latitud_centro && regador.longitud_centro && estado.regando) {
                // Inicializar o recuperar vuelta activa
                vueltaActual = await vueltasService.inicializarVuelta(
                    regador.id,
                    angulo,
                    timestamp
                );

                // Verificar si completó la vuelta
                const verificacion = await vueltasService.verificarCompletarVuelta(
                    regador.id,
                    angulo,
                    timestamp
                );

                if (verificacion.completada) {
                    console.log(`🎉 Vuelta completada! Iniciando nueva vuelta...`);
                    // Reiniciar nueva vuelta automáticamente
                    vueltaActual = await vueltasService.inicializarVuelta(
                        regador.id,
                        angulo,
                        timestamp
                    );
                }
            }
            // ========== FIN: GESTIÓN DE VUELTAS ==========

            // Verificar si debe guardar (cada 10-30 min dependiendo del estado o cambio de estado)
            const debeGuardar = this.debeGuardarPosicion(regador.id, timestamp, estado) ||
                this.cambioEstado(regador.id, estado);

            let datosOperacion = null;

            if (debeGuardar) {
                // Guardar datos operacionales
                datosOperacion = await this.guardarDatosOperacion({
                    regador_id: regador.id,
                    geozona_id: geozona?.id || null,
                    timestamp: timestamp,
                    latitud: position.latitude,
                    longitud: position.longitude,
                    altitud: position.altitude,
                    velocidad: position.speed,
                    curso: position.course,
                    presion: presion,
                    io9_raw: io9,
                    angulo_actual: angulo,
                    distancia_centro: distancia,
                    dentro_geozona: !!geozona,
                    regando: estado.regando,
                    encendido: estado.encendido,
                    moviendose: estado.moviendose,
                    estado_texto: estado.estado_texto,
                    vuelta_actual: vueltaActual?.numero_vuelta || null, // ⭐ NUEVO
                    traccar_position_id: position.id
                });

                // Actualizar caché
                this.ultimasPosiciones.set(regador.id, {
                    timestamp: timestamp,
                    estado: estado,
                    geozona_id: geozona?.id
                });

                // Detectar eventos de entrada/salida de geozona (solo si hay geozonas configuradas)
                if (regador.latitud_centro && regador.longitud_centro) {
                    await this.detectarEventosGeozona(regador.id, geozona, datosOperacion);

                    // Actualizar estado del sector si está regando
                    if (geozona && estado.regando) {
                        await this.actualizarEstadoSectorMejorado(geozona.id, datosOperacion, regador);
                    }
                }

                const estadoEmoji = estado.regando ? '💧' : estado.moviendose ? '🚜' : '⏸️';
                const vueltaInfo = vueltaActual ? ` - Vuelta ${vueltaActual.numero_vuelta}` : '';
                console.log(`${estadoEmoji} Posición guardada - ${device.name} - ${estado.estado_texto}${geozona ? ` - ${geozona.nombre_sector}` : ' - Sin geozona'}${presion ? ` - Presión: ${presion.toFixed(1)} PSI` : ''}${vueltaInfo}`);
            } else {
                const tiempoDesdeUltimo = timestamp - this.ultimasPosiciones.get(regador.id)?.timestamp;
                const minutosDesdeUltimo = Math.floor(tiempoDesdeUltimo / 60000);
                console.log(`⏭️ Posición omitida (${minutosDesdeUltimo} min desde última) - ${device.name}`);
            }

            return {
                processed: true,
                saved: debeGuardar,
                regador: regador.nombre_dispositivo,
                estado: estado.estado_texto,
                geozona: geozona?.nombre_sector || null,
                presion: presion,
                vuelta_actual: vueltaActual?.numero_vuelta || null // ⭐ NUEVO
            };

        } catch (error) {
            console.error('Error procesando posición:', error);
            throw error;
        }
    }

    /**
     * Busca un regador por el nombre del dispositivo
     */
    async buscarRegador(nombreDispositivo) {
        try {
            const query = `
                SELECT * FROM regadores 
                WHERE nombre_dispositivo = $1 AND activo = true
            `;

            const result = await pool.query(query, [nombreDispositivo]);
            return result.rows[0] || null;

        } catch (error) {
            console.error('Error buscando regador:', error);
            throw error;
        }
    }

    /**
     * Busca en qué geozona está actualmente el regador
     */
    async buscarGeozonaActual(regadorId, lat, lng, angulo, distancia) {
        try {
            const query = `
                SELECT gp.*, l.nombre_lote
                FROM geozonas_pivote gp
                LEFT JOIN lotes l ON gp.lote_id = l.id
                WHERE gp.regador_id = $1 AND gp.activo = true
            `;

            const result = await pool.query(query, [regadorId]);
            const geozonas = result.rows;

            // Buscar en qué geozona está
            for (const geozona of geozonas) {
                // Verificar distancia
                if (distancia < geozona.radio_interno || distancia > geozona.radio_externo) {
                    continue;
                }

                // Verificar ángulo
                let enSector = false;

                if (geozona.angulo_fin > geozona.angulo_inicio) {
                    // Sector normal
                    enSector = angulo >= geozona.angulo_inicio && angulo <= geozona.angulo_fin;
                } else {
                    // Sector que cruza 0°
                    enSector = angulo >= geozona.angulo_inicio || angulo <= geozona.angulo_fin;
                }

                if (enSector) {
                    return geozona;
                }
            }

            return null;

        } catch (error) {
            console.error('Error buscando geozona:', error);
            throw error;
        }
    }

    /**
     * Guarda los datos operacionales del GPS
     */
    async guardarDatosOperacion(datos) {
        try {
            const query = `
                INSERT INTO datos_operacion_gps (
                    regador_id, geozona_id, timestamp, latitud, longitud,
                    altitud, velocidad, curso, presion, io9_raw,
                    angulo_actual, distancia_centro, dentro_geozona,
                    regando, encendido, moviendose, estado_texto,
                    vuelta_actual, traccar_position_id, procesado
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, false
                )
                ON CONFLICT (regador_id, timestamp) DO UPDATE
                SET geozona_id = EXCLUDED.geozona_id,
                    presion = EXCLUDED.presion,
                    regando = EXCLUDED.regando,
                    estado_texto = EXCLUDED.estado_texto,
                    vuelta_actual = EXCLUDED.vuelta_actual
                RETURNING *
            `;

            const values = [
                datos.regador_id,
                datos.geozona_id,
                datos.timestamp,
                datos.latitud,
                datos.longitud,
                datos.altitud,
                datos.velocidad,
                datos.curso,
                datos.presion,
                datos.io9_raw,
                datos.angulo_actual,
                datos.distancia_centro,
                datos.dentro_geozona,
                datos.regando,
                datos.encendido,
                datos.moviendose,
                datos.estado_texto,
                datos.vuelta_actual, // ⭐ NUEVO
                datos.traccar_position_id
            ];

            const result = await pool.query(query, values);
            return result.rows[0];

        } catch (error) {
            console.error('Error guardando datos operación:', error);
            throw error;
        }
    }

    /**
     * Detecta eventos de entrada/salida de geozonas
     */
    async detectarEventosGeozona(regadorId, geozonaActual, datosOperacion) {
        try {
            const ultimaPosicion = this.ultimasPosiciones.get(regadorId);

            const geozonaAnterior = ultimaPosicion?.geozona_id;

            // Detectar cambio de geozona
            if (geozonaActual?.id !== geozonaAnterior) {
                // Salida de geozona anterior
                if (geozonaAnterior && datosOperacion.regando) {
                    await this.registrarEventoRiego(regadorId, geozonaAnterior, 'salida', datosOperacion);

                    // ⭐ NUEVO: Registrar salida en vuelta
                    await vueltasService.registrarSalidaSector(
                        regadorId,
                        geozonaAnterior,
                        datosOperacion.timestamp
                    );

                    // ✅ AGREGAR ESTA LÍNEA: Completar el sector al salir
                    await this.completarSector(geozonaAnterior, datosOperacion.timestamp);

                    // Si la salida es porque está completando riego, cerrar el ciclo
                    await this.completarCicloRiego(geozonaAnterior, datosOperacion.timestamp);
                }
                // Entrada a nueva geozona
                if (geozonaActual && datosOperacion.regando) {
                    await this.registrarEventoRiego(regadorId, geozonaActual.id, 'entrada', datosOperacion);

                    // ⭐ NUEVO: Registrar entrada en vuelta
                    await vueltasService.registrarEntradaSector(
                        regadorId,
                        geozonaActual.id,
                        datosOperacion.timestamp
                    );
                }
            }

        } catch (error) {
            console.error('Error detectando eventos de geozona:', error);
        }
    }

    /**
     * Registra un evento de riego
     */
    async registrarEventoRiego(regadorId, geozonaId, tipoEvento, datosOperacion) {
        try {
            const query = `
                INSERT INTO eventos_riego (
                    regador_id, geozona_id, tipo_evento, fecha_evento,
                    latitud, longitud, angulo_actual,
                    dispositivo_online, velocidad, procesado
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
                RETURNING *
            `;

            const result = await pool.query(query, [
                regadorId,
                geozonaId,
                tipoEvento,
                datosOperacion.timestamp,
                datosOperacion.latitud,
                datosOperacion.longitud,
                datosOperacion.angulo_actual,
                datosOperacion.encendido,
                datosOperacion.velocidad
            ]);

            console.log(`📍 Evento: ${tipoEvento} geozona ${geozonaId}`);

            return result.rows[0];

        } catch (error) {
            console.error('Error registrando evento de riego:', error);
            throw error;
        }
    }

    async actualizarEstadoSectorMejorado(geozonaId, datosOperacion, regador) {
    try {
        // 1. Obtener información del sector
        const querySector = `
            SELECT 
                gp.*,
                esr.estado,
                esr.fecha_inicio_real,
                esr.progreso_porcentaje,
                r.caudal,
                r.tiempo_vuelta_completa
            FROM geozonas_pivote gp
            LEFT JOIN estado_sectores_riego esr ON gp.id = esr.geozona_id
            LEFT JOIN regadores r ON gp.regador_id = r.id
            WHERE gp.id = $1
        `;
        
        const resultSector = await pool.query(querySector, [geozonaId]);
        
        if (resultSector.rows.length === 0) {
            console.warn(`⚠️ Sector ${geozonaId} no encontrado`);
            return;
        }
        
        const sector = resultSector.rows[0];
        const estadoActual = sector.estado || 'pendiente';
        const fechaInicio = sector.fecha_inicio_real || datosOperacion.timestamp;
        
        // 2. Si es la primera vez que entra al sector, marcarlo como "en_progreso"
        if (estadoActual === 'pendiente') {
            await pool.query(
                `UPDATE estado_sectores_riego 
                 SET estado = 'en_progreso',
                     fecha_inicio_real = $1,
                     progreso_porcentaje = 0
                 WHERE geozona_id = $2`,
                [datosOperacion.timestamp, geozonaId]
            );
            
            console.log(`✅ Sector ${sector.numero_sector} iniciado`);
            return;
        }
        
        // 3. Calcular el progreso del sector
        if (estadoActual === 'en_progreso') {
            // Calcular tiempo transcurrido en el sector
            const tiempoTranscurrido = new Date(datosOperacion.timestamp) - new Date(fechaInicio);
            const minutosTranscurridos = tiempoTranscurrido / 60000;
            
            // Calcular ángulo del sector
            let anguloSector;
            if (sector.angulo_fin < sector.angulo_inicio) {
                anguloSector = (360 - sector.angulo_inicio) + sector.angulo_fin;
            } else {
                anguloSector = sector.angulo_fin - sector.angulo_inicio;
            }
            
            // Calcular tiempo estimado para el sector
            // Basado en el tiempo de vuelta completa del regador
            let tiempoEstimadoMinutos = 60; // Default: 1 hora por sector
            
            if (sector.tiempo_vuelta_completa) {
                // Proporción del sector respecto a la vuelta completa
                const proporcionSector = anguloSector / 360;
                tiempoEstimadoMinutos = sector.tiempo_vuelta_completa * proporcionSector;
            }
            
            // Calcular progreso basado en tiempo
            let progresoTiempo = (minutosTranscurridos / tiempoEstimadoMinutos) * 100;
            progresoTiempo = Math.min(progresoTiempo, 99); // No completar automáticamente por tiempo
            
            // Calcular progreso basado en ángulo recorrido
            const anguloActual = datosOperacion.angulo_actual;
            let progresoAngulo = 0;
            
            if (anguloActual !== null && anguloActual !== undefined) {
                // Calcular cuánto avanzó dentro del sector
                let avanceEnSector = 0;
                
                if (sector.angulo_fin > sector.angulo_inicio) {
                    // Sector normal
                    if (anguloActual >= sector.angulo_inicio && anguloActual <= sector.angulo_fin) {
                        avanceEnSector = anguloActual - sector.angulo_inicio;
                    }
                } else {
                    // Sector que cruza 0°
                    if (anguloActual >= sector.angulo_inicio) {
                        avanceEnSector = anguloActual - sector.angulo_inicio;
                    } else if (anguloActual <= sector.angulo_fin) {
                        avanceEnSector = (360 - sector.angulo_inicio) + anguloActual;
                    }
                }
                
                progresoAngulo = (avanceEnSector / anguloSector) * 100;
            }
            
            // Usar el mayor de los dos progresos (más conservador)
            const progresoFinal = Math.max(progresoTiempo, progresoAngulo);
            const progresoFinalRedondeado = Math.min(Math.round(progresoFinal), 99);
            
            // Actualizar progreso
            await pool.query(
                `UPDATE estado_sectores_riego 
                 SET progreso_porcentaje = $1
                 WHERE geozona_id = $2`,
                [progresoFinalRedondeado, geozonaId]
            );
            
            console.log(
                `📊 Sector ${sector.numero_sector}: ${progresoFinalRedondeado}% ` +
                `(tiempo: ${progresoTiempo.toFixed(0)}%, ángulo: ${progresoAngulo.toFixed(0)}%)`
            );
        }
        
    } catch (error) {
        console.error('Error actualizando estado de sector mejorado:', error);
        throw error;
    }
}


    /**
     * Actualiza el estado de un sector durante el riego
     */
    async actualizarEstadoSector(geozonaId, datosOperacion) {
        try {
            // Obtener datos del sector
            const querySector = `
                SELECT 
                    gp.*,
                    r.caudal,
                    r.tiempo_vuelta_completa
                FROM geozonas_pivote gp
                JOIN regadores r ON gp.regador_id = r.id
                WHERE gp.id = $1
            `;

            const resultSector = await pool.query(querySector, [geozonaId]);

            if (resultSector.rows.length === 0) return;

            const sector = resultSector.rows[0];

            // Buscar cuándo entró al sector
            const queryEntrada = `
                SELECT MIN(timestamp) as fecha_entrada
                FROM datos_operacion_gps
                WHERE geozona_id = $1
                  AND regando = true
                  AND timestamp >= CURRENT_DATE - INTERVAL '2 days'
            `;

            const resultEntrada = await pool.query(queryEntrada, [geozonaId]);
            const fechaInicio = resultEntrada.rows[0]?.fecha_entrada || datosOperacion.timestamp;

            // Calcular duración en minutos
            const duracionMs = new Date(datosOperacion.timestamp) - new Date(fechaInicio);
            const duracionMinutos = Math.round(duracionMs / 60000);

            if (duracionMinutos <= 0) return;

            // Calcular agua aplicada hasta ahora
            const aguaAplicada = sector.caudal
                ? gpsCalc.calcularAguaAplicada(sector.caudal, duracionMinutos, sector.coeficiente_riego)
                : 0;

            // Calcular área del sector
            const areaSector = gpsCalc.calcularAreaSector(sector);

            // Calcular progreso basado en lámina aplicada
            let progreso = 0;
            let laminaAplicada = 0;

            if (areaSector > 0 && aguaAplicada > 0) {
                laminaAplicada = gpsCalc.calcularLaminaAplicada(aguaAplicada, areaSector);
                // Objetivo: 20mm de lámina = 100%
                progreso = (laminaAplicada / 20) * 100;
            }

            // Actualizar estado del sector
            const queryUpdate = `
                INSERT INTO estado_sectores_riego (
                    geozona_id, estado, progreso_porcentaje, 
                    fecha_inicio_real, agua_aplicada_litros,
                    ultima_actualizacion
                ) VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (geozona_id) 
                DO UPDATE SET
                    estado = 'en_progreso',
                    progreso_porcentaje = EXCLUDED.progreso_porcentaje,
                    agua_aplicada_litros = EXCLUDED.agua_aplicada_litros,
                    ultima_actualizacion = EXCLUDED.ultima_actualizacion,
                    fecha_inicio_real = COALESCE(estado_sectores_riego.fecha_inicio_real, EXCLUDED.fecha_inicio_real)
                RETURNING *
            `;

            const result = await pool.query(queryUpdate, [
                geozonaId,
                'en_progreso',
                Math.round(progreso * 100) / 100,
                fechaInicio,
                Math.round(aguaAplicada),
                datosOperacion.timestamp
            ]);

            if (progreso > 0) {
                console.log(`📊 Sector actualizado - ${sector.nombre_sector}: ${progreso.toFixed(1)}% - ${Math.round(aguaAplicada)}L - Lámina: ${laminaAplicada.toFixed(1)}mm`);
            }

            return result.rows[0];

        } catch (error) {
            console.error('Error actualizando estado del sector:', error);
            throw error;
        }
    }

    /**
 * Completa un sector cuando el regador sale de él
 */
    async completarSector(geozonaId, timestamp) {
        try {
            const querySector = `
                SELECT 
                    esr.*,
                    gp.nombre_sector,
                    gp.numero_sector
                FROM estado_sectores_riego esr
                JOIN geozonas_pivote gp ON esr.geozona_id = gp.id
                WHERE esr.geozona_id = $1
            `;
            
            const result = await pool.query(querySector, [geozonaId]);
            
            if (result.rows.length === 0 || result.rows[0].estado === 'completado') {
                return;
            }
            
            const sector = result.rows[0];
            
            await pool.query(
                `UPDATE estado_sectores_riego 
                SET estado = 'completado',
                    fecha_fin_real = $1,
                    progreso_porcentaje = 100
                WHERE geozona_id = $2`,
                [timestamp, geozonaId]
            );
            
            console.log(`✅ Sector ${sector.numero_sector} completado`);
            
        } catch (error) {
            console.error('Error completando sector:', error);
            throw error;
        }
    }

    /**
     * Completa un ciclo de riego cuando sale de la geozona
     */
    async completarCicloRiego(geozonaId, fechaFin) {
        try {
            // Obtener datos del sector y eventos
            const queryDatos = `
                SELECT 
                    esr.fecha_inicio_real,
                    gp.regador_id,
                    gp.coeficiente_riego,
                    gp.nombre_sector,
                    r.caudal,
                    r.tiempo_vuelta_completa
                FROM estado_sectores_riego esr
                JOIN geozonas_pivote gp ON esr.geozona_id = gp.id
                JOIN regadores r ON gp.regador_id = r.id
                WHERE esr.geozona_id = $1
            `;

            const resultDatos = await pool.query(queryDatos, [geozonaId]);

            if (resultDatos.rows.length === 0) return;

            const datos = resultDatos.rows[0];
            const fechaInicio = datos.fecha_inicio_real;

            if (!fechaInicio) {
                console.warn(`⚠️ No hay fecha de inicio para geozona ${geozonaId}`);
                return;
            }

            // Calcular duración en minutos
            const duracionMs = new Date(fechaFin) - new Date(fechaInicio);
            const duracionMinutos = Math.round(duracionMs / 60000);

            if (duracionMinutos <= 0) {
                console.warn(`⚠️ Duración inválida: ${duracionMinutos} minutos`);
                return;
            }

            // Calcular agua aplicada
            const aguaAplicada = datos.caudal
                ? gpsCalc.calcularAguaAplicada(datos.caudal, duracionMinutos, datos.coeficiente_riego)
                : 0;

            // Obtener área del sector
            const querySector = `SELECT * FROM geozonas_pivote WHERE id = $1`;
            const resultSector = await pool.query(querySector, [geozonaId]);
            const sector = resultSector.rows[0];
            const areaSector = gpsCalc.calcularAreaSector(sector);

            // Calcular lámina aplicada
            const laminaMM = aguaAplicada > 0 ? gpsCalc.calcularLaminaAplicada(aguaAplicada, areaSector) : 0;

            // Obtener promedios de presión y altitud
            const queryPromedios = `
                SELECT 
                    AVG(presion) as presion_promedio,
                    MIN(presion) as presion_min,
                    MAX(presion) as presion_max,
                    AVG(altitud) as altitud_promedio,
                    AVG(velocidad) as velocidad_promedio
                FROM datos_operacion_gps
                WHERE geozona_id = $1
                  AND timestamp BETWEEN $2 AND $3
                  AND presion IS NOT NULL
            `;

            const resultPromedios = await pool.query(queryPromedios, [
                geozonaId,
                fechaInicio,
                fechaFin
            ]);

            const promedios = resultPromedios.rows[0];

            // Guardar ciclo completado
            const queryInsert = `
                INSERT INTO ciclos_riego (
                    regador_id, geozona_id, fecha_inicio, fecha_fin,
                    duracion_minutos, agua_aplicada_litros, lamina_aplicada_mm,
                    area_regada_m2, presion_promedio, presion_min, presion_max,
                    altitud_promedio, velocidad_promedio, completado
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
                RETURNING *
            `;

            const ciclo = await pool.query(queryInsert, [
                datos.regador_id,
                geozonaId,
                fechaInicio,
                fechaFin,
                duracionMinutos,
                aguaAplicada,
                laminaMM,
                areaSector,
                promedios.presion_promedio,
                promedios.presion_min,
                promedios.presion_max,
                promedios.altitud_promedio,
                promedios.velocidad_promedio
            ]);

            // Actualizar estado del sector a completado
            const queryUpdate = `
                UPDATE estado_sectores_riego
                SET estado = 'completado',
                    progreso_porcentaje = 100,
                    fecha_fin_real = $2,
                    tiempo_real_minutos = $3,
                    agua_aplicada_litros = $4
                WHERE geozona_id = $1
            `;

            await pool.query(queryUpdate, [
                geozonaId,
                fechaFin,
                duracionMinutos,
                aguaAplicada
            ]);

            console.log(`✅ Ciclo completado - ${datos.nombre_sector}: ${Math.round(aguaAplicada)}L en ${duracionMinutos}min - Lámina: ${laminaMM.toFixed(1)}mm`);

            return ciclo.rows[0];

        } catch (error) {
            console.error('Error completando ciclo de riego:', error);
        }
    }
}

module.exports = new GPSProcessingService();