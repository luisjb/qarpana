const pool = require('../db');
const gpsCalc = require('./gpsCalculationsService');

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
        
        // Presión > 20 PSI indica que está regand o
        const regando = presion && presion > 20;
        
        // Velocidad > 0.1 km/h indica movimiento (ajustado, antes era 0.5)
        const movimiento = velocidad && velocidad > 0.1;
        
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
                        await this.actualizarEstadoSector(geozona.id, datosOperacion);
                    }
                }
                
                const estadoEmoji = estado.regando ? '💧' : estado.moviendose ? '🚜' : '⏸️';
                console.log(`${estadoEmoji} Posición guardada - ${device.name} - ${estado.estado_texto}${geozona ? ` - ${geozona.nombre_sector}` : ' - Sin geozona'}${presion ? ` - Presión: ${presion.toFixed(1)} PSI` : ''}`);
            } else {
                const tiempoDesdeUltimo = timestamp - this.ultimasPosiciones.get(regador.id)?.timestamp;
                const minutosDesdeUltimo = Math.floor(tiempoDesdeUltimo / 60000);
                console.log(`⏭️ Posición omitida (${minutosDesdeUltimo} min desde última) - ${device.name}`);
            }
            
            return {
                processed: true,
                saved: debeGuardar,
                regador: regador.nombre_dispositivo,
                geozona: geozona?.nombre_sector || 'Fuera de geozonas',
                estado: estado,
                presion: presion,
                angulo: angulo,
                distancia: distancia
            };
            
        } catch (error) {
            console.error('❌ Error procesando posición GPS:', error);
            throw error;
        }
    }
    
    /**
     * Busca el regador por nombre de dispositivo
     */
    async buscarRegador(nombreDispositivo) {
        const query = `
            SELECT 
                r.id,
                r.nombre_dispositivo,
                r.tipo_regador,
                r.radio_cobertura,
                r.caudal,
                r.tiempo_vuelta_completa,
                r.latitud_centro,
                r.longitud_centro,
                r.activo
            FROM regadores r
            WHERE r.nombre_dispositivo = $1 
              AND r.activo = true
            LIMIT 1
        `;
        
        const result = await pool.query(query, [nombreDispositivo]);
        return result.rows[0];
    }
    
    /**
     * Busca la geozona actual basándose en posición
     */
    async buscarGeozonaActual(regadorId, lat, lng, angulo, distancia) {
        // Margen de tolerancia de 10 metros para detección (no afecta cálculos de área)
        const MARGEN_TOLERANCIA = 10;
        
        const query = `
            SELECT gp.*
            FROM geozonas_pivote gp
            WHERE gp.regador_id = $1
            AND gp.activo = true
            AND $2 >= gp.radio_interno
            AND $2 <= (gp.radio_externo + $3)
            ORDER BY gp.numero_sector
        `;
        
        const result = await pool.query(query, [regadorId, distancia, MARGEN_TOLERANCIA]);
        
        console.log(`🔍 Evaluando ${result.rows.length} sectores para ángulo ${angulo.toFixed(1)}°`);
        
        // Filtrar por ángulo en JavaScript (más preciso)
        for (const geozona of result.rows) {
            let dentroDelSector = false;
            
            // Normalizar ángulo a 0-360
            const anguloNormalizado = ((angulo % 360) + 360) % 360;
            
            // Normalizar ángulos del sector
            const anguloInicio = geozona.angulo_inicio % 360;
            const anguloFin = geozona.angulo_fin % 360;
            
            // Determinar si el sector cruza 0° (ejemplo: 300° a 60°, o 300° a 360°)
            const cruzaCero = anguloFin < anguloInicio || 
                            (anguloFin === 360 && anguloInicio > 0) ||
                            (anguloFin === 0 && anguloInicio > 0);
            
            if (cruzaCero) {
                // Sector que cruza 0° 
                // Ejemplos válidos: 300°-60° (fin < inicio), 300°-360°, 300°-0°
                if (anguloFin === 360 || anguloFin === 0) {
                    // Caso especial: sector hasta 360° o 0°
                    dentroDelSector = (anguloNormalizado >= anguloInicio);
                } else {
                    // Caso normal: cruza 0° (ej: 300° a 60°)
                    dentroDelSector = (anguloNormalizado >= anguloInicio || anguloNormalizado < anguloFin);
                }
                console.log(`  ${geozona.nombre_sector} (${anguloInicio}°-${anguloFin}° cruza 0°): ${dentroDelSector ? '✓' : '✗'}`);
            } else {
                // Sector normal (no cruza 0°)
                dentroDelSector = (anguloNormalizado >= anguloInicio && anguloNormalizado < anguloFin);
                console.log(`  ${geozona.nombre_sector} (${anguloInicio}°-${anguloFin}°): ${dentroDelSector ? '✓' : '✗'}`);
            }
            
            if (dentroDelSector) {
                console.log(`🎯 GPS en ${angulo.toFixed(1)}° → ${geozona.nombre_sector} (${anguloInicio}°-${anguloFin}°)`);
                return geozona;
            }
        }
        
        console.log(`⚠️ GPS en ${angulo.toFixed(1)}° → Fuera de todos los sectores`);
        return null;
    }
        
    /**
     * Guarda datos operacionales
     */
    async guardarDatosOperacion(datos) {
        const query = `
            INSERT INTO datos_operacion_gps (
                regador_id, geozona_id, timestamp, latitud, longitud,
                altitud, velocidad, curso, presion, io9_raw,
                angulo_actual, distancia_centro, dentro_geozona, regando,
                encendido, moviendose, estado_texto, traccar_position_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            ON CONFLICT (regador_id, timestamp) 
            DO UPDATE SET
                geozona_id = EXCLUDED.geozona_id,
                presion = EXCLUDED.presion,
                estado_texto = EXCLUDED.estado_texto,
                regando = EXCLUDED.regando,
                encendido = EXCLUDED.encendido,
                moviendose = EXCLUDED.moviendose,
                dentro_geozona = EXCLUDED.dentro_geozona
            RETURNING *
        `;
        
        const values = [
            datos.regador_id, datos.geozona_id, datos.timestamp,
            datos.latitud, datos.longitud, datos.altitud,
            datos.velocidad, datos.curso, datos.presion, datos.io9_raw,
            datos.angulo_actual, datos.distancia_centro,
            datos.dentro_geozona, datos.regando, datos.encendido,
            datos.moviendose, datos.estado_texto, datos.traccar_position_id
        ];
        
        const result = await pool.query(query, values);
        return result.rows[0];
    }
    
    /**
     * Detecta eventos de entrada/salida de geozona
     */
    async detectarEventosGeozona(regadorId, geozonaActual, datosActuales) {
        try {
            // Obtener última posición
            const queryUltima = `
                SELECT geozona_id, dentro_geozona, regando
                FROM datos_operacion_gps
                WHERE regador_id = $1 
                  AND timestamp < $2
                ORDER BY timestamp DESC
                LIMIT 1
            `;
            
            const resultUltima = await pool.query(queryUltima, [
                regadorId,
                datosActuales.timestamp
            ]);
            
            if (resultUltima.rows.length === 0) return;
            
            const posicionAnterior = resultUltima.rows[0];
            
            // Detectar entrada en geozona
            if (geozonaActual && (!posicionAnterior.dentro_geozona || posicionAnterior.geozona_id !== geozonaActual.id)) {
                await this.registrarEventoRiego({
                    regador_id: regadorId,
                    geozona_id: geozonaActual.id,
                    tipo_evento: 'entrada',
                    fecha_evento: datosActuales.timestamp,
                    latitud: datosActuales.latitud,
                    longitud: datosActuales.longitud,
                    angulo_actual: datosActuales.angulo_actual,
                    velocidad: datosActuales.velocidad
                });
                
                console.log(`🎯 Entrada en sector - ${geozonaActual.nombre_sector}`);
            }
            
            // Detectar salida de geozona
            if (!geozonaActual && posicionAnterior.dentro_geozona && posicionAnterior.geozona_id) {
                await this.registrarEventoRiego({
                    regador_id: regadorId,
                    geozona_id: posicionAnterior.geozona_id,
                    tipo_evento: 'salida',
                    fecha_evento: datosActuales.timestamp,
                    latitud: datosActuales.latitud,
                    longitud: datosActuales.longitud,
                    angulo_actual: datosActuales.angulo_actual,
                    velocidad: datosActuales.velocidad
                });
                
                console.log(`🚪 Salida de sector`);
                
                // Completar ciclo de riego si estaba regando
                if (posicionAnterior.regando) {
                    await this.completarCicloRiego(posicionAnterior.geozona_id, datosActuales.timestamp);
                }
            }
        } catch (error) {
            console.error('Error detectando eventos de geozona:', error);
        }
    }
    
    /**
     * Registra un evento de riego
     */
    async registrarEventoRiego(evento) {
        const query = `
            INSERT INTO eventos_riego (
                regador_id, geozona_id, tipo_evento, fecha_evento,
                latitud, longitud, angulo_actual, velocidad
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        
        const values = [
            evento.regador_id, evento.geozona_id, evento.tipo_evento,
            evento.fecha_evento, evento.latitud, evento.longitud,
            evento.angulo_actual, evento.velocidad
        ];
        
        const result = await pool.query(query, values);
        return result.rows[0];
    }
    
    /**
     * Actualiza el estado del sector durante el riego
     */
    async actualizarEstadoSector(geozonaId, datosOperacion) {
        try {
            // Obtener información del regador y el sector
            const queryInfo = `
                SELECT 
                    gp.*,
                    r.caudal,
                    r.tiempo_vuelta_completa,
                    esr.fecha_inicio_real,
                    esr.estado
                FROM geozonas_pivote gp
                JOIN regadores r ON gp.regador_id = r.id
                LEFT JOIN estado_sectores_riego esr ON gp.id = esr.geozona_id
                WHERE gp.id = $1
            `;
            
            const resultInfo = await pool.query(queryInfo, [geozonaId]);
            
            if (resultInfo.rows.length === 0) return;
            
            const sector = resultInfo.rows[0];
            const fechaInicio = sector.fecha_inicio_real || datosOperacion.timestamp;
            
            // Calcular duración hasta ahora
            const duracionMs = new Date(datosOperacion.timestamp) - new Date(fechaInicio);
            const duracionMinutos = Math.max(1, Math.round(duracionMs / 60000));
            
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
                // No limitar aquí - dejar que suba naturalmente
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