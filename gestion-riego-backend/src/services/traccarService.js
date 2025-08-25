// src/services/traccarService.js

class TraccarService {
    constructor() {
        // Almacenamiento en memoria (en producción usar base de datos)
        if (!global.traccarAlarms) {
            global.traccarAlarms = [];
        }
        
        // Configuración de filtros
        this.allowedEventTypes = [
            'geofenceEnter',    // Entrada en geocerca
            'geofenceExit',     // Salida de geocerca
            'deviceOnline',     // Dispositivo encendido
            'deviceOffline',    // Dispositivo apagado
            'deviceMoving',     // Dispositivo en movimiento
            'deviceStopped'     // Dispositivo detenido
        ];
        
        // Eventos críticos que requieren atención inmediata
        this.criticalEvents = [
            'geofenceEnter',
            'geofenceExit',
            'deviceOffline'
        ];
    }
    
    // Procesar eventos de Traccar
    async processEvent(eventData) {
        try {
            const event = eventData.event;
            const device = eventData.device;
            const position = eventData.position;
            
            // Filtrar solo eventos que nos interesan
            if (!this.allowedEventTypes.includes(event.type)) {
                console.log(`⏭️ Evento ignorado: ${event.type} (no está en la lista de eventos permitidos)`);
                return { processed: false, reason: 'Evento no permitido' };
            }
            
            // Crear alarma estructurada
            const alarm = this.createAlarm(event, device, position);
            
            // Determinar criticidad
            alarm.critical = this.criticalEvents.includes(event.type);
            
            // Guardar alarma
            this.storeAlarm(alarm);
            
            // Log según criticidad
            if (alarm.critical) {
                console.log('🚨 ALARMA CRÍTICA procesada:', {
                    type: alarm.type,
                    device: alarm.deviceName,
                    geofence: alarm.geofenceName,
                    timestamp: alarm.timestamp
                });
            } else {
                console.log('ℹ️ Evento procesado:', {
                    type: alarm.type,
                    device: alarm.deviceName,
                    timestamp: alarm.timestamp
                });
            }
            
            // Ejecutar acciones específicas según el tipo de evento
            await this.executeEventActions(alarm);
            
            return { 
                processed: true, 
                alarm: alarm,
                critical: alarm.critical 
            };
            
        } catch (error) {
            console.error('❌ Error procesando evento:', error);
            throw error;
        }
    }
    
    // Crear objeto de alarma estructurado
    createAlarm(event, device, position = {}) {
        return {
            id: event.id,
            type: event.type,
            deviceId: device.id,
            deviceName: device.name,
            deviceUniqueId: device.uniqueId,
            geofenceId: event.geofenceId || null,
            geofenceName: this.getGeofenceName(event.geofenceId),
            eventTime: event.eventTime,
            position: {
                latitude: position.latitude,
                longitude: position.longitude,
                speed: position.speed,
                altitude: position.altitude,
                course: position.course,
                address: position.address
            },
            attributes: event.attributes || {},
            deviceStatus: device.status,
            critical: false,
            timestamp: new Date().toISOString(),
            source: 'event_forwarding'
        };
    }
    
    // Obtener nombre de geocerca (placeholder - en producción conectar con DB)
    getGeofenceName(geofenceId) {
        if (!geofenceId || geofenceId === 0) return null;
        
        // Mapeo temporal - en producción esto debería venir de la base de datos
        const geofenceNames = {
            1: 'Zona Principal',
            2: 'Zona Secundaria',
            3: 'Zona de Emergencia'
        };
        
        return geofenceNames[geofenceId] || `Geocerca ${geofenceId}`;
    }
    
    // Ejecutar acciones específicas según el tipo de evento
    async executeEventActions(alarm) {
        try {
            switch (alarm.type) {
                case 'geofenceEnter':
                    await this.handleGeofenceEnter(alarm);
                    break;
                    
                case 'geofenceExit':
                    await this.handleGeofenceExit(alarm);
                    break;
                    
                case 'deviceOffline':
                    await this.handleDeviceOffline(alarm);
                    break;
                    
                case 'deviceOnline':
                    await this.handleDeviceOnline(alarm);
                    break;
                    
                case 'deviceMoving':
                    await this.handleDeviceMoving(alarm);
                    break;
                    
                case 'deviceStopped':
                    await this.handleDeviceStopped(alarm);
                    break;
                    
                default:
                    console.log(`ℹ️ Evento sin acción específica: ${alarm.type}`);
            }
        } catch (error) {
            console.error('❌ Error ejecutando acciones del evento:', error);
        }
    }
    
    // Acciones específicas para cada tipo de evento
    async handleGeofenceEnter(alarm) {
        console.log(`🎯 ENTRADA EN GEOCERCA: ${alarm.deviceName} entró en ${alarm.geofenceName}`);
        
        // Aquí puedes agregar:
        // - Enviar notificación push
        // - Enviar email/SMS
        // - Activar riego automático
        // - Registrar en base de datos
        // - Etc.
    }
    
    async handleGeofenceExit(alarm) {
        console.log(`🚪 SALIDA DE GEOCERCA: ${alarm.deviceName} salió de ${alarm.geofenceName}`);
        
        // Acciones para salida de geocerca
    }
    
    async handleDeviceOffline(alarm) {
        console.log(`📴 DISPOSITIVO DESCONECTADO: ${alarm.deviceName} se desconectó`);
        
        // Acciones para dispositivo offline
        // - Notificar pérdida de comunicación
        // - Activar protocolo de emergencia
    }
    
    async handleDeviceOnline(alarm) {
        console.log(`📱 DISPOSITIVO CONECTADO: ${alarm.deviceName} se conectó`);
        
        // Acciones para dispositivo online
    }
    
    async handleDeviceMoving(alarm) {
        console.log(`🚗 DISPOSITIVO EN MOVIMIENTO: ${alarm.deviceName} comenzó a moverse`);
        
        // Acciones para movimiento
    }
    
    async handleDeviceStopped(alarm) {
        console.log(`🛑 DISPOSITIVO DETENIDO: ${alarm.deviceName} se detuvo`);
        
        // Acciones para detención
    }
    
    // Procesar posiciones (opcional)
    async processPosition(positionData) {
        try {
            console.log('📍 Posición recibida:', {
                device: positionData.device?.name,
                latitude: positionData.position?.latitude,
                longitude: positionData.position?.longitude,
                speed: positionData.position?.speed,
                timestamp: positionData.position?.deviceTime
            });
            
            // Aquí puedes procesar las posiciones si las necesitas
            // - Calcular distancias
            // - Detectar patrones de movimiento
            // - Actualizar estado de dispositivos
            
            return { processed: true };
        } catch (error) {
            console.error('❌ Error procesando posición:', error);
            throw error;
        }
    }
    
    // Almacenar alarma
    storeAlarm(alarm) {
        global.traccarAlarms.unshift(alarm);
        
        // Mantener solo las últimas 100 alarmas
        if (global.traccarAlarms.length > 100) {
            global.traccarAlarms = global.traccarAlarms.slice(0, 100);
        }
        
        console.log(`📊 Total alarmas almacenadas: ${global.traccarAlarms.length}`);
    }
    
    // Obtener alarmas almacenadas
    getStoredAlarms() {
        return global.traccarAlarms || [];
    }
    
    // Obtener solo alarmas críticas/activas
    getActiveAlarms() {
        const alarms = this.getStoredAlarms();
        return alarms.filter(alarm => alarm.critical);
    }
    
    // Obtener última alarma
    getLastAlarm() {
        const alarms = this.getStoredAlarms();
        return alarms.length > 0 ? alarms[0] : null;
    }
    
    // Limpiar todas las alarmas
    clearAllAlarms() {
        global.traccarAlarms = [];
        console.log('🗑️ Todas las alarmas han sido eliminadas');
    }
    
    // Eliminar alarma específica
    deleteAlarm(alarmId) {
        const alarms = this.getStoredAlarms();
        const initialLength = alarms.length;
        
        global.traccarAlarms = alarms.filter(alarm => alarm.id != alarmId);
        
        return global.traccarAlarms.length < initialLength;
    }
    
    // Filtrar alarmas por criterios
    filterAlarms(criteria = {}) {
        const alarms = this.getStoredAlarms();
        
        return alarms.filter(alarm => {
            // Filtrar por tipo de evento
            if (criteria.eventType && alarm.type !== criteria.eventType) {
                return false;
            }
            
            // Filtrar por dispositivo
            if (criteria.deviceId && alarm.deviceId !== criteria.deviceId) {
                return false;
            }
            
            // Filtrar por geocerca
            if (criteria.geofenceId && alarm.geofenceId !== criteria.geofenceId) {
                return false;
            }
            
            // Filtrar por criticidad
            if (criteria.critical !== undefined && alarm.critical !== criteria.critical) {
                return false;
            }
            
            // Filtrar por fecha
            if (criteria.dateFrom && new Date(alarm.timestamp) < new Date(criteria.dateFrom)) {
                return false;
            }
            
            if (criteria.dateTo && new Date(alarm.timestamp) > new Date(criteria.dateTo)) {
                return false;
            }
            
            return true;
        });
    }
    
    // Obtener estadísticas de eventos
    getEventStats() {
        const alarms = this.getStoredAlarms();
        
        const stats = {
            total: alarms.length,
            critical: alarms.filter(a => a.critical).length,
            byType: {},
            byDevice: {},
            last24Hours: 0
        };
        
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        alarms.forEach(alarm => {
            // Estadísticas por tipo
            stats.byType[alarm.type] = (stats.byType[alarm.type] || 0) + 1;
            
            // Estadísticas por dispositivo
            stats.byDevice[alarm.deviceName] = (stats.byDevice[alarm.deviceName] || 0) + 1;
            
            // Últimas 24 horas
            if (new Date(alarm.timestamp) > yesterday) {
                stats.last24Hours++;
            }
        });
        
        return stats;
    }
}

module.exports = new TraccarService();