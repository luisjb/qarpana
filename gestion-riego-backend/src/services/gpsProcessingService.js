const pool = require('../db');
const gpsCalc = require('./gpsCalculationsService');
const vueltasService = require('./vueltasRiegoService');

class GPSProcessingService {
    constructor() {
        // Almacenar Ãºltima posiciÃ³n procesada por regador (en memoria)
        this.ultimasPosiciones = new Map();
        // INTERVALOS AJUSTADOS
        this.INTERVALO_GUARDADO_DETENIDO = 30 * 60 * 1000; // 30 minutos si estÃ¡ detenido
        this.INTERVALO_GUARDADO_REGANDO = 10 * 60 * 1000;  // 10 minutos si estÃ¡ regando/movimiento
    }

    /**
     * Determina el estado del regador basÃ¡ndose en los datos
     */
    determinarEstadoRegador(position, presion, velocidad) {
        const ignition = position.attributes?.ignition || false;

        // PresiÃ³n > 20 PSI indica que estÃ¡ regando
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
     * Verifica si debe guardar esta posiciÃ³n
     */
    debeGuardarPosicion(regadorId, timestamp, estado) {
        const ultimaPosicion = this.ultimasPosiciones.get(regadorId);

        if (!ultimaPosicion) {
            return true; // Primera posiciÃ³n, siempre guardar
        }

        const tiempoTranscurrido = timestamp - ultimaPosicion.timestamp;

        // Si estÃ¡ regando o en movimiento, guardar cada 10 minutos
        if (estado.regando || estado.moviendose) {
            return tiempoTranscurrido >= this.INTERVALO_GUARDADO_REGANDO;
        }

        // Si estÃ¡ detenido, guardar cada 30 minutos
        return tiempoTranscurrido >= this.INTERVALO_GUARDADO_DETENIDO;
    }

    /**
     * Verifica si cambiÃ³ el estado del regador
     */
    cambioEstado(regadorId, nuevoEstado) {
        const ultimaPosicion = this.ultimasPosiciones.get(regadorId);

        if (!ultimaPosicion) return true;

        return ultimaPosicion.estado.encendido !== nuevoEstado.encendido ||
            ultimaPosicion.estado.regando !== nuevoEstado.regando ||
            ultimaPosicion.estado.moviendose !== nuevoEstado.moviendose;
    }

    /**
     * Actualiza el estado activo del regador cuando recibe datos
     * Solo ACTIVA cuando recibe datos, NO desactiva por ignition=false
     * La desactivaciÃ³n solo ocurre por timeout (1 hora sin datos)
     */
    async actualizarEstadoActivo(regadorId) {
        try {
            // Siempre activar cuando recibe datos GPS
            const result = await pool.query(
                'UPDATE regadores SET activo = true, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $1 AND activo = false RETURNING nombre_dispositivo',
                [regadorId]
            );

            if (result.rows.length > 0) {
                console.log(`âœ… Regador activado: ${result.rows[0].nombre_dispositivo}`);
            }
        } catch (error) {
            console.error('Error actualizando estado activo del regador:', error);
        }
    }

    /**
     * Procesa una posiciÃ³n recibida de Traccar
     */
    async procesarPosicion(positionData) {
        try {
            const device = positionData.device;
            const position = positionData.position;
            const timestamp = new Date(position.deviceTime);

            // Buscar el regador correspondiente (sin filtrar por activo)
            const regador = await this.buscarRegadorSinFiltro(device.name);

            if (!regador) {
                console.log(`âš ï¸ Regador no encontrado para dispositivo: ${device.name}`);
                return { processed: false, reason: 'Regador no encontrado' };
            }

            // â­ RECUPERAR ESTADO PREVIO SI NO EXISTE EN MEMORIA (AL REINICIAR SERVIDOR)
            if (!this.ultimasPosiciones.has(regador.id)) {
                try {
                    const queryUltima = `
                        SELECT * FROM datos_operacion_gps 
                        WHERE regador_id = $1 
                        ORDER BY timestamp DESC 
                        LIMIT 1
                    `;
                    const resultUltima = await pool.query(queryUltima, [regador.id]);
                    if (resultUltima.rows.length > 0) {
                        const last = resultUltima.rows[0];
                        this.ultimasPosiciones.set(regador.id, {
                            timestamp: new Date(last.timestamp),
                            estado: {
                                encendido: last.encendido,
                                regando: last.regando,
                                moviendose: last.moviendose,
                                estado_texto: last.estado_texto
                            },
                            geozona_id: last.geozona_id
                        });
                        console.log(`ðŸ“¥ Estado previo recuperado DB para ${regador.nombre_dispositivo}`);
                    }
                } catch (err) {
                    console.error('Error recuperando estado previo:', err);
                }
            }

            // â­ ACTIVAR AUTOMÃTICAMENTE cuando recibe datos
            // (La desactivaciÃ³n solo ocurre por timeout de 1 hora sin datos)
            await this.actualizarEstadoActivo(regador.id);

            // Verificar que el regador tenga coordenadas configuradas
            if (!regador.latitud_centro || !regador.longitud_centro) {
                console.log(`âš ï¸ Regador ${device.name} sin coordenadas configuradas - se guardarÃ¡ sin geozona`);
            }

            // Extraer IO9 de los atributos
            const io9 = position.attributes?.io9 || position.attributes?.io_9;

            // Calcular presiÃ³n
            const presion = io9 ? gpsCalc.calcularPresionDesdeIO9(io9) : null;

            // Determinar estado del regador
            const estado = this.determinarEstadoRegador(position, presion, position.speed);

            // Calcular Ã¡ngulo y distancia desde el centro (solo si hay coordenadas)
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

                // Buscar en quÃ© geozona estÃ¡
                geozona = await this.buscarGeozonaActual(
                    regador.id,
                    position.latitude,
                    position.longitude,
                    angulo,
                    distancia
                );
            }

            // ========== INICIO: GESTIÃ“N DE VUELTAS ==========
            let vueltaActual = null;
            if (regador.latitud_centro && regador.longitud_centro && estado.regando) {
                // Inicializar o recuperar vuelta activa
                vueltaActual = await vueltasService.inicializarVuelta(
                    regador.id,
                    angulo,
                    timestamp
                );

                // Verificar si completÃ³ la vuelta
                const verificacion = await vueltasService.verificarCompletarVuelta(
                    regador.id,
                    angulo,
                    timestamp
                );

                if (verificacion.completada) {
                    console.log(`ðŸŽ‰ Vuelta completada! Iniciando nueva vuelta...`);
                    // Reiniciar nueva vuelta automÃ¡ticamente
                    vueltaActual = await vueltasService.inicializarVuelta(
                        regador.id,
                        angulo,
                        timestamp
                    );
                }
            }
            // ========== FIN: GESTIÃ“N DE VUELTAS ==========

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
                    vuelta_actual: vueltaActual?.numero_vuelta || null, // â­ NUEVO
                    traccar_position_id: position.id
                });

                // Detectar eventos de entrada/salida de geozona (solo si hay geozonas configuradas)
                if (regador.latitud_centro && regador.longitud_centro) {
                    await this.detectarEventosGeozona(regador.id, geozona, datosOperacion);

                    // Actualizar estado del sector si estÃ¡ regando
                    if (geozona && estado.regando) {
                        await this.actualizarEstadoSectorMejorado(geozona.id, datosOperacion, regador);
                    }
                }

                // Actualizar cachÃ© DESPUÃ‰S de detectar eventos (para tener el estado previo correcto)
                this.ultimasPosiciones.set(regador.id, {
                    timestamp: timestamp,
                    estado: estado,
                    geozona_id: geozona?.id
                });

                const estadoEmoji = estado.regando ? 'ðŸ’§' : estado.moviendose ? 'ðŸšœ' : 'â¸ï¸';
                const vueltaInfo = vueltaActual ? ` - Vuelta ${vueltaActual.numero_vuelta}` : '';
                console.log(`${estadoEmoji} PosiciÃ³n guardada - ${device.name} - ${estado.estado_texto}${geozona ? ` - ${geozona.nombre_sector}` : ' - Sin geozona'}${presion ? ` - PresiÃ³n: ${presion.toFixed(1)} PSI` : ''}${vueltaInfo}`);
            } else {
                const tiempoDesdeUltimo = timestamp - this.ultimasPosiciones.get(regador.id)?.timestamp;
                const minutosDesdeUltimo = Math.floor(tiempoDesdeUltimo / 60000);
                console.log(`â­ï¸ PosiciÃ³n omitida (${minutosDesdeUltimo} min desde Ãºltima) - ${device.name}`);
            }

            return {
                processed: true,
                saved: debeGuardar,
                regador: regador.nombre_dispositivo,
                estado: estado.estado_texto,
                geozona: geozona?.nombre_sector || null,
                presion: presion,
                vuelta_actual: vueltaActual?.numero_vuelta || null // â­ NUEVO
            };

        } catch (error) {
            console.error('Error procesando posiciÃ³n:', error);
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
     * Busca un regador por el nombre del dispositivo (sin filtrar por activo)
     * Se usa para actualizar el estado activo/inactivo automÃ¡ticamente
     */
    async buscarRegadorSinFiltro(nombreDispositivo) {
        try {
            const query = `
                SELECT * FROM regadores 
                WHERE nombre_dispositivo = $1
            `;

            const result = await pool.query(query, [nombreDispositivo]);
            return result.rows[0] || null;

        } catch (error) {
            console.error('Error buscando regador sin filtro:', error);
            throw error;
        }
    }

    /**
     * Busca en quÃ© geozona estÃ¡ actualmente el regador
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

            // Buscar en quÃ© geozona estÃ¡
            // Buscar en quÃ© geozona estÃ¡
            const TOLERANCIA_DISTANCIA = 50; // metros (margen de error GPS y dimensiones fÃ­sicas)

            for (const geozona of geozonas) {
                // Verificar distancia con tolerancia
                // radio_interno suele ser 0, radio_externo es el radio del pivote
                if (distancia < (geozona.radio_interno - TOLERANCIA_DISTANCIA) || distancia > (geozona.radio_externo + TOLERANCIA_DISTANCIA)) {
                    // console.log(`âŒ Sector ${geozona.numero_sector} descartado por distancia: ${distancia.toFixed(1)}m (Rango: ${geozona.radio_interno}-${geozona.radio_externo})`);
                    continue;
                }

                // Verificar ángulo
                let enSector = false;

                // Normalizar ángulos: 360° = 0°
                const anguloInicioNorm = geozona.angulo_inicio % 360;
                const anguloFinNorm = geozona.angulo_fin % 360;
                const anguloNorm = angulo % 360;

                if (anguloFinNorm > anguloInicioNorm) {
                    // Sector normal (no cruza 0°)
                    enSector = anguloNorm >= anguloInicioNorm && anguloNorm <= anguloFinNorm;
                } else if (anguloFinNorm < anguloInicioNorm) {
                    // Sector que cruza 0° (por ejemplo: 350° a 10°)
                    enSector = anguloNorm >= anguloInicioNorm || anguloNorm <= anguloFinNorm;
                } else {
                    // anguloFinNorm === anguloInicioNorm (caso especial: punto único o vuelta completa)
                    // Para vuelta completa (0-360 o 360-0), verificar si el sector cubre todo
                    if (geozona.angulo_inicio === 0 && geozona.angulo_fin === 360) {
                        enSector = true; // Cubre todo el círculo
                    } else {
                        enSector = anguloNorm === anguloInicioNorm;
                    }
                }

                if (enSector) {
                    // console.log(`âœ… Â¡Encontrado! Sector ${geozona.numero_sector}`);
                    return geozona;
                } else {
                    // console.log(`âŒ Sector ${geozona.numero_sector} descartado por Ã¡ngulo: ${angulo.toFixed(1)}Â° (Rango: ${geozona.angulo_inicio}-${geozona.angulo_fin})`);
                }
            }

            // Si llegamos aquÃ­ y no encontramos geozona, pero hay geozonas configuradas y la distancia es vÃ¡lida para alguna de ellas
            // podrÃ­a ser un problema de huecos en los Ã¡ngulos. Intenta buscar el sector mÃ¡s cercano si el desfase es pequeÃ±o (< 5 grados).
            // Esto ayuda con problemas de punto flotante o huecos pequeÃ±os.
            // (Opcional - ImplementaciÃ³n futura si persiste el problema)

            console.log(`âš ï¸ No se encontrÃ³ geozona para Regador ${regadorId} - Dist: ${distancia?.toFixed(1)}m, Ang: ${angulo?.toFixed(1)}Â°`);

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
                datos.vuelta_actual, // â­ NUEVO
                datos.traccar_position_id
            ];

            const result = await pool.query(query, values);
            return result.rows[0];

        } catch (error) {
            console.error('Error guardando datos operaciÃ³n:', error);
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
            const estabaRegando = ultimaPosicion?.estado?.regando || false;
            const estaRegando = datosOperacion.regando;

            const cambioGeozona = geozonaActual?.id !== geozonaAnterior;
            // Detectar cambio de estado de riego
            const inicioRiego = estaRegando && !estabaRegando;
            const finRiego = !estaRegando && estabaRegando;

            // CASO 1: SALIDA DE SECTOR O FIN DE RIEGO
            // Si estÃ¡bamos en una geozona regando y (nos movimos de zona O dejamos de regar)
            if (geozonaAnterior && estabaRegando && (cambioGeozona || finRiego)) {
                // Registrar evento de salida
                await this.registrarEventoRiego(regadorId, geozonaAnterior, 'salida', datosOperacion);

                // Registrar salida en la vuelta (cierra el segmento actual)
                await vueltasService.registrarSalidaSector(
                    regadorId,
                    geozonaAnterior,
                    datosOperacion.timestamp
                );

                // Completar el sector SOLO si hubo cambio de geozona (fÃ­sicamente saliÃ³)
                // Si solo cortÃ³ el agua, no necesariamente completÃ³ el sector (puede ser pause)
                if (cambioGeozona) {
                    await this.completarSector(geozonaAnterior, datosOperacion.timestamp);
                    await this.completarCicloRiego(geozonaAnterior, datosOperacion.timestamp);
                }
            }

            // CASO 2: ENTRADA A SECTOR O INICIO DE RIEGO
            // Si estamos en una geozona regando y (es una zona nueva O acabamos de encender el agua)
            // !geozonaAnterior cubre el caso inicial o perdida de tracking
            if (geozonaActual && estaRegando && (cambioGeozona || inicioRiego || !geozonaAnterior)) {
                await this.registrarEventoRiego(regadorId, geozonaActual.id, 'entrada', datosOperacion);

                // Registrar entrada en vuelta
                await vueltasService.registrarEntradaSector(
                    regadorId,
                    geozonaActual.id,
                    datosOperacion.timestamp
                );
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

            console.log(`ðŸ“ Evento: ${tipoEvento} geozona ${geozonaId}`);

            return result.rows[0];

        } catch (error) {
            console.error('Error registrando evento de riego:', error);
            throw error;
        }
    }

    async actualizarEstadoSectorMejorado(geozonaId, datosOperacion, regador) {
        try {
            // 1. Obtener informaciÃ³n del sector
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
                console.warn(`âš ï¸ Sector ${geozonaId} no encontrado`);
                return;
            }

            const sector = resultSector.rows[0];
            const estadoActual = sector.estado || 'pendiente';
            let fechaInicio = sector.fecha_inicio_real || datosOperacion.timestamp;

            // 2. Si es la primera vez que entra al sector, marcarlo como "en_progreso"
            if (estadoActual === 'pendiente') {
                await pool.query(
                    `INSERT INTO estado_sectores_riego (geozona_id, estado, fecha_inicio_real, progreso_porcentaje)
                 VALUES ($1, 'en_progreso', $2, 0)
                 ON CONFLICT (geozona_id) 
                 DO UPDATE SET 
                     estado = 'en_progreso',
                     fecha_inicio_real = $2,
                     progreso_porcentaje = 0`,
                    [geozonaId, datosOperacion.timestamp]
                );

                console.log(`âœ… Sector ${sector.numero_sector} iniciado`);
                // â­ NO retornar aquÃ­, continuar para calcular el progreso inicial
                fechaInicio = datosOperacion.timestamp;
            }

            // 3. Calcular el progreso del sector (siempre, incluso si acaba de iniciarse)
            // Calcular tiempo transcurrido en el sector
            const tiempoTranscurrido = new Date(datosOperacion.timestamp) - new Date(fechaInicio);
            const minutosTranscurridos = tiempoTranscurrido / 60000;

            // Calcular Ã¡ngulo del sector
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
                // ProporciÃ³n del sector respecto a la vuelta completa
                const proporcionSector = anguloSector / 360;
                tiempoEstimadoMinutos = sector.tiempo_vuelta_completa * proporcionSector;
            }

            // Calcular progreso basado en tiempo
            let progresoTiempo = (minutosTranscurridos / tiempoEstimadoMinutos) * 100;
            progresoTiempo = Math.min(progresoTiempo, 99); // No completar automÃ¡ticamente por tiempo

            // Calcular progreso basado en Ã¡ngulo recorrido
            const anguloActual = datosOperacion.angulo_actual;
            let progresoAngulo = 0;

            if (anguloActual !== null && anguloActual !== undefined) {
                // Calcular cuÃ¡nto avanzÃ³ dentro del sector
                let avanceEnSector = 0;

                if (sector.angulo_fin > sector.angulo_inicio) {
                    // Sector normal
                    if (anguloActual >= sector.angulo_inicio && anguloActual <= sector.angulo_fin) {
                        avanceEnSector = anguloActual - sector.angulo_inicio;
                    }
                } else {
                    // Sector que cruza 0Â°
                    if (anguloActual >= sector.angulo_inicio) {
                        avanceEnSector = anguloActual - sector.angulo_inicio;
                    } else if (anguloActual <= sector.angulo_fin) {
                        avanceEnSector = (360 - sector.angulo_inicio) + anguloActual;
                    }
                }

                progresoAngulo = (avanceEnSector / anguloSector) * 100;
            }

            // Usar prioritaria mente el progreso por Ã¡ngulo si estÃ¡ disponible
            // Math.max con tiempo causaba que se quedara en 99% si estaba detenido mucho tiempo
            let progresoFinal = 0;
            if (progresoAngulo > 0 || (progresoAngulo === 0 && anguloActual !== null)) {
                progresoFinal = progresoAngulo;
            } else {
                progresoFinal = progresoTiempo; // Fallback si no hay Ã¡ngulo
            }

            // Solo si se estÃ¡ moviendo activamente (speed > 0.01), podemos considerar el tiempo como "avance"
            // (por si el GPS se queda pegado pero avanza fÃ­sicamente, aunque es raro)
            if (datosOperacion.velocidad > 0.01) {
                progresoFinal = Math.max(progresoFinal, progresoTiempo);
            }

            const progresoFinalRedondeado = Math.min(Math.round(progresoFinal), 99);

            // Calcular agua aplicada
            const aguaAplicada = sector.caudal
                ? gpsCalc.calcularAguaAplicada(sector.caudal, minutosTranscurridos, sector.coeficiente_riego || 1.0)
                : 0;

            // Actualizar progreso y agua aplicada
            await pool.query(
                `UPDATE estado_sectores_riego 
                 SET progreso_porcentaje = $1,
                     ultima_actualizacion = $2,
                     agua_aplicada_litros = $3
                 WHERE geozona_id = $4`,
                [
                    progresoFinalRedondeado,
                    datosOperacion.timestamp,
                    Math.round(aguaAplicada),
                    geozonaId
                ]
            );

            console.log(
                `ðŸ“Š Sector ${sector.numero_sector}: ${progresoFinalRedondeado}% ` +
                `(tiempo: ${progresoTiempo.toFixed(0)}%, Ã¡ngulo: ${progresoAngulo.toFixed(0)}%) - Agua: ${Math.round(aguaAplicada)}L`
            );

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

            // Buscar cuÃ¡ndo entrÃ³ al sector
            const queryEntrada = `
                SELECT MIN(timestamp) as fecha_entrada
                FROM datos_operacion_gps
                WHERE geozona_id = $1
                  AND regando = true
                  AND timestamp >= CURRENT_DATE - INTERVAL '2 days'
            `;

            const resultEntrada = await pool.query(queryEntrada, [geozonaId]);
            const fechaInicio = resultEntrada.rows[0]?.fecha_entrada || datosOperacion.timestamp;

            // Calcular duraciÃ³n en minutos
            const duracionMs = new Date(datosOperacion.timestamp) - new Date(fechaInicio);
            const duracionMinutos = Math.round(duracionMs / 60000);

            if (duracionMinutos <= 0) return;

            // Calcular agua aplicada hasta ahora
            const aguaAplicada = sector.caudal
                ? gpsCalc.calcularAguaAplicada(sector.caudal, duracionMinutos, sector.coeficiente_riego)
                : 0;

            // Calcular Ã¡rea del sector
            const areaSector = gpsCalc.calcularAreaSector(sector);

            // Calcular progreso basado en lÃ¡mina aplicada
            let progreso = 0;
            let laminaAplicada = 0;

            if (areaSector > 0 && aguaAplicada > 0) {
                laminaAplicada = gpsCalc.calcularLaminaAplicada(aguaAplicada, areaSector);
                // Objetivo: 20mm de lÃ¡mina = 100%
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
                console.log(`ðŸ“Š Sector actualizado - ${sector.nombre_sector}: ${progreso.toFixed(1)}% - ${Math.round(aguaAplicada)}L - LÃ¡mina: ${laminaAplicada.toFixed(1)}mm`);
            }

            return result.rows[0];

        } catch (error) {
            console.error('Error actualizando estado del sector:', error);
            throw error;
        }
    }

    /**
 * Completa un sector cuando el regador sale de Ã©l
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

            console.log(`âœ… Sector ${sector.numero_sector} completado`);

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
                console.warn(`âš ï¸ No hay fecha de inicio para geozona ${geozonaId}`);
                return;
            }

            // Calcular duraciÃ³n en minutos
            const duracionMs = new Date(fechaFin) - new Date(fechaInicio);
            const duracionMinutos = Math.round(duracionMs / 60000);

            if (duracionMinutos <= 0) {
                console.warn(`âš ï¸ DuraciÃ³n invÃ¡lida: ${duracionMinutos} minutos`);
                return;
            }

            // Calcular agua aplicada
            const aguaAplicada = datos.caudal
                ? gpsCalc.calcularAguaAplicada(datos.caudal, duracionMinutos, datos.coeficiente_riego)
                : 0;

            // Obtener Ã¡rea del sector
            const querySector = `SELECT * FROM geozonas_pivote WHERE id = $1`;
            const resultSector = await pool.query(querySector, [geozonaId]);
            const sector = resultSector.rows[0];
            const areaSector = gpsCalc.calcularAreaSector(sector);

            // Calcular lÃ¡mina aplicada
            const laminaMM = aguaAplicada > 0 ? gpsCalc.calcularLaminaAplicada(aguaAplicada, areaSector) : 0;

            // Obtener promedios de presiÃ³n y altitud
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

            console.log(`âœ… Ciclo completado - ${datos.nombre_sector}: ${Math.round(aguaAplicada)}L en ${duracionMinutos}min - LÃ¡mina: ${laminaMM.toFixed(1)}mm`);

            return ciclo.rows[0];

        } catch (error) {
            console.error('Error completando ciclo de riego:', error);
        }
    }
}

module.exports = new GPSProcessingService();