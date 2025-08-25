// src/controllers/traccarController.js
const traccarService = require('../services/traccarService');

class TraccarController {
    
    // Manejar Event Forwarding de Traccar
    async handleEventForwarding(req, res) {
        try {
            console.log('🎯 EVENT FORWARDING recibido:', {
                timestamp: new Date().toISOString(),
                eventType: req.body.event?.type,
                deviceName: req.body.device?.name,
                deviceId: req.body.device?.id
            });
            
            const result = await traccarService.processEvent(req.body);
            
            res.status(200).json({ 
                success: true, 
                message: 'Event procesado correctamente',
                timestamp: new Date().toISOString(),
                eventType: req.body.event?.type,
                processed: result.processed
            });
            
        } catch (error) {
            console.error('❌ Error procesando Event Forwarding:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error interno del servidor',
                message: error.message 
            });
        }
    }
    
    // Manejar Position Forwarding (opcional)
    async handlePositionForwarding(req, res) {
        try {
            console.log('📍 POSITION FORWARDING recibido:', {
                timestamp: new Date().toISOString(),
                device: req.body.device?.name,
                position: {
                    lat: req.body.position?.latitude,
                    lng: req.body.position?.longitude,
                    speed: req.body.position?.speed
                }
            });
            
            // Procesar posición si es necesario
            await traccarService.processPosition(req.body);
            
            res.status(200).json({ 
                success: true, 
                message: 'Posición procesada correctamente'
            });
            
        } catch (error) {
            console.error('❌ Error procesando Position Forwarding:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
    
    // Obtener todas las alarmas
    async getAlarms(req, res) {
        try {
            const alarms = traccarService.getStoredAlarms();
            
            res.status(200).json({
                success: true,
                count: alarms.length,
                alarms: alarms,
                lastUpdate: alarms.length > 0 ? alarms[0].timestamp : null
            });
        } catch (error) {
            console.error('❌ Error obteniendo alarmas:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Error obteniendo alarmas' 
            });
        }
    }
    
    // Obtener solo alarmas activas/críticas
    async getActiveAlarms(req, res) {
        try {
            const activeAlarms = traccarService.getActiveAlarms();
            
            res.status(200).json({
                success: true,
                count: activeAlarms.length,
                alarms: activeAlarms
            });
        } catch (error) {
            console.error('❌ Error obteniendo alarmas activas:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
    
    // Limpiar todas las alarmas
    async clearAlarms(req, res) {
        try {
            traccarService.clearAllAlarms();
            
            res.status(200).json({
                success: true,
                message: 'Todas las alarmas han sido eliminadas'
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
    
    // Eliminar una alarma específica
    async deleteAlarm(req, res) {
        try {
            const alarmId = req.params.id;
            const result = traccarService.deleteAlarm(alarmId);
            
            if (result) {
                res.status(200).json({
                    success: true,
                    message: 'Alarma eliminada correctamente'
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'Alarma no encontrada'
                });
            }
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
    
    // Test del webhook
    async testWebhook(req, res) {
        try {
            const testAlarm = {
                event: {
                    id: Date.now(),
                    type: 'geofenceEnter',
                    deviceId: 999,
                    geofenceId: 1,
                    eventTime: new Date().toISOString()
                },
                device: {
                    id: 999,
                    name: 'Dispositivo de Prueba',
                    uniqueId: 'TEST-001'
                },
                position: {
                    latitude: -31.4201,
                    longitude: -64.1888,
                    speed: 25
                }
            };
            
            const result = await traccarService.processEvent(testAlarm);
            
            res.status(200).json({
                success: true,
                message: 'Test exitoso',
                result: result,
                totalAlarms: traccarService.getStoredAlarms().length
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
    
    // Estado del sistema Traccar
    async getTraccarStatus(req, res) {
        try {
            const status = {
                totalAlarms: traccarService.getStoredAlarms().length,
                activeAlarms: traccarService.getActiveAlarms().length,
                lastAlarm: traccarService.getLastAlarm(),
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            };
            
            res.status(200).json({
                success: true,
                status: status
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    }
}

module.exports = new TraccarController();