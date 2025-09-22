const pool = require('../db');
const gpsCalc = require('./gpsCalculationsService');

class GPSProcessingService {
    constructor() {
        // Almacenar última posición procesada por regador (en memoria)
        this.ultimasPosiciones = new Map();
        // Intervalo de guardado: 30 minutos
        this.INTERVALO_GUARDADO_MS = 30 * 60 * 1000; // 30 minutos
    }
    
    /**
     * Determina el estado del regador basándose en los datos
     */
    determinarEstadoRegador(position, presion, velocidad) {
        const ignition = position.attributes?.ignition || false;
        const regando = presion && presion > 20; // Presión > 20 PSI
        const movimiento = velocidad && velocidad > 0.5; // Velocidad > 0.5 km/h
        
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
    debeGuardarPosicion(regadorId, timestamp) {
        const ultimaPosicion = this.ultimasPosiciones.get(regadorId);
        
        if (!ultimaPosicion) {
            return true; // Primera posición, siempre guardar
        }
        
        const tiempoTranscurrido = timestamp - ultimaPosicion.timestamp;
        
        // Guardar si han pasado 30 minutos O si cambió el estado
        return tiempoTranscurrido >= this.INTERVALO_GUARDADO_MS;
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
                console.log(`Regador no encontrado para dispositivo: ${device.name}`);
                return { processed: false, reason: 'Regador no encontrado' };
            }
            
            // Extraer IO9 de los atributos
            const io9 = position.attributes?.io9 || position.attributes?.io_9;
            
            // Calcular presión
            const presion = io9 ? gpsCalc.calcularPresionDesdeIO9(io9) : null;
            
            // Determinar estado del regador
            const estado = this.determinarEstadoRegador(position, presion, position.speed);
            
            // Calcular ángulo y distancia desde el centro
            const angulo = gpsCalc.calcularAngulo(
                regador.latitud_centro,
                regador.longitud_centro,
                position.latitude,
                position.longitude
            );
            
            const distancia = gpsCalc.calcularDistancia(
                regador.latitud_centro,
                regador.longitud_centro,
                position.latitude,
                position.longitude
            );
            
            // Buscar en qué geozona está
            const geozona = await this.buscarGeozonaActual(
                regador.id,
                position.latitude,
                position.longitude,
                angulo,
                distancia
            );
            
            // Verificar si debe guardar (cada 30 min o cambio de estado)
            const debeGuardar = this.debeGuardarPosicion(regador.id, timestamp) || 
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
                
                // Detectar eventos de entrada/salida de geozona
                await this.detectarEventosGeozona(regador.id, geozona, datosOperacion);
                
                // Actualizar estado del sector si está regando
                if (geozona && estado.regando) {
                    await this.actualizarEstadoSector(geozona.id, datosOperacion);
                }
                
                console.log(`✓ Posición guardada - ${device.name} - ${estado.estado_texto} - ${geozona?.nombre_sector || 'Sin sector'} - Presión: ${presion?.toFixed(1) || 'N/A'} PSI`);
            } else {
                console.log(`⏭ Posición omitida (< 30min) - ${device.name}`);
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
            console.error('Error procesando posición GPS:', error);
            throw error;
        }
    }
    
    /**
     * Busca el regador por nombre de dispositivo
     */
    async buscarRegador(nombreDispositivo) {
        const query = `
            SELECT r.*, 
                   COALESCE(gc.latitud_centro, r.latitud_centro) as latitud_centro,
                   COALESCE(gc.longitud_centro, r.longitud_centro) as longitud_centro
            FROM regadores r
            LEFT JOIN LATERAL (
                SELECT gp.latitud_centro, gp.longitud_centro
                FROM geozonas_pivote gp
                WHERE gp.regador_id = r.id
                LIMIT 1
            ) gc ON true
            WHERE r.nombre_dispositivo = $1 AND r.activo = true
            LIMIT 1
        `;
        
        const result = await pool.query(query, [nombreDispositivo]);
        return result.rows[0];
    }
    
    /**
     * Busca la geozona actual basándose en posición
     */
    async buscarGeozonaActual(regadorId, lat, lng, angulo, distancia) {
        const query = `
            SELECT gp.*
            FROM geozonas_pivote gp
            WHERE gp.regador_id = $1
              AND gp.activo = true
              AND $2 >= gp.radio_interno
              AND $2 <= gp.radio_externo
        `;
        
        const result = await pool.query(query, [regadorId, distancia]);
        
        // Filtrar por ángulo en JavaScript (más preciso)
        for (const geozona of result.rows) {
            if (geozona.angulo_fin > geozona.angulo_inicio) {
                if (angulo >= geozona.angulo_inicio && angulo <= geozona.angulo_fin) {
                    return geozona;
                }
            } else {
                // Sector que cruza 0°
                if (angulo >= geozona.angulo_inicio || angulo <= geozona.angulo_fin) {
                    return geozona;
                }
            }
        }
        
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
                moviendose = EXCLUDED.moviendose
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
        if (geozonaActual && !posicionAnterior.dentro_geozona) {
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
        }
        
        // Detectar salida de geozona
        if (!geozonaActual && posicionAnterior.dentro_geozona) {
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
            
            // Completar ciclo de riego
            await this.completarCicloRiego(posicionAnterior.geozona_id, datosActuales.timestamp);
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
        const query = `
            INSERT INTO estado_sectores_riego (
                geozona_id, estado, progreso_porcentaje, fecha_inicio_real,
                ultima_actualizacion
            ) VALUES ($1, 'en_progreso', 0, $2, $3)
            ON CONFLICT (geozona_id) 
            DO UPDATE SET
                estado = 'en_progreso',
                ultima_actualizacion = $3
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            geozonaId,
            datosOperacion.timestamp,
            datosOperacion.timestamp
        ]);
        
        return result.rows[0];
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
            
            // Calcular duración en minutos
            const duracionMs = new Date(fechaFin) - new Date(fechaInicio);
            const duracionMinutos = Math.round(duracionMs / 60000);
            
            // Calcular agua aplicada
            const aguaAplicada = gpsCalc.calcularAguaAplicada(
                datos.caudal,
                duracionMinutos,
                datos.coeficiente_riego
            );
            
            // Obtener área del sector
            const querySector = `SELECT * FROM geozonas_pivote WHERE id = $1`;
            const resultSector = await pool.query(querySector, [geozonaId]);
            const sector = resultSector.rows[0];
            const areaSector = gpsCalc.calcularAreaSector(sector);
            
            // Calcular lámina aplicada
            const laminaMM = gpsCalc.calcularLaminaAplicada(aguaAplicada, areaSector);
            
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
            
            // Actualizar estado del sector
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
            
            console.log(`Ciclo de riego completado - Sector: ${sector.nombre_sector}, Agua: ${aguaAplicada.toFixed(0)}L, Lámina: ${laminaMM.toFixed(1)}mm`);
            
            return ciclo.rows[0];
            
        } catch (error) {
            console.error('Error completando ciclo de riego:', error);
            throw error;
        }
    }
}

module.exports = new GPSProcessingService();