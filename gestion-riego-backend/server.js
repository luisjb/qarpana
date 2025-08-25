const express = require('express');
const cors = require('cors');
const authRoutes = require('./src/routes/authRoutes');
const camposRoutes = require('./src/routes/camposRoutes');
const lotesRoutes = require('./src/routes/lotesRoutes');
const cambiosDiariosRoutes = require('./src/routes/cambiosDiariosRoutes');
const cultivosRoutes = require('./src/routes/cultivosRoutes');
const coeficienteCultivoRoutes = require('./src/routes/coeficienteCultivoRoutes');
const aguaUtilInicialRoutes = require('./src/routes/aguaUtilInicialRoutes');
const usuariosRoutes = require('./src/routes/usuariosRoutes');
const simulationRoutes = require('./src/routes/simulationRoutes');
const estadosFenologicosRoutes = require('./src/routes/estadosFenologicosRoutes');
const campañasRoutes = require('./src/routes/campañaRoutes');
const observacionesRoutes = require('./src/routes/observacionesRoutes');
const recomendacionesRoutes = require('./src/routes/recomendacionesRoutes');
const estacionesRoutes = require('./src/routes/estacionesRoutes');




const cron = require('node-cron');
const actualizacionDiaria = require('./src/utils/actualizacionDiaria');
const weatherService = require('./src/utils/weatherService');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'https://qarpana.com.ar',

    //origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'authorization'], 
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

app.use((req, res, next) => {
    //console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
    next();
});

app.use(express.json());

// Función para ejecutar todas las actualizaciones diarias
async function ejecutarActualizacionesDiarias() {
    console.log('Iniciando actualizaciones diarias...');
    try {
        // Primero actualizar pronósticos meteorológicos
        console.log('Actualizando pronósticos meteorológicos...');
        await weatherService.actualizarDatosMeteorologicos();
        
        // Luego ejecutar la actualización diaria regular
        console.log('Ejecutando actualización diaria de cálculos...');
        await actualizacionDiaria();
        
        console.log('Todas las actualizaciones diarias completadas con éxito');
    } catch (error) {
        console.error('Error en las actualizaciones diarias:', error);
        throw error;
    }
}

// Programar la tarea diaria a las 12 de la noche
cron.schedule('0 0 * * *', () => {
    console.log('Iniciando actualizaciones programadas');
    ejecutarActualizacionesDiarias().catch(error => {
        console.error('Error en las actualizaciones programadas:', error);
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/campos', camposRoutes);
app.use('/api/lotes', lotesRoutes);
app.use('/api/cambios-diarios', cambiosDiariosRoutes);
app.use('/api/cultivos', cultivosRoutes);
app.use('/api/coeficiente-cultivo', coeficienteCultivoRoutes);
app.use('/api/agua-util-inicial', aguaUtilInicialRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/simulations', simulationRoutes);
app.use('/api/estados-fenologicos', estadosFenologicosRoutes);
app.use('/api/campanas', campañasRoutes);
app.use('/api/observaciones', observacionesRoutes);
app.use('/api/recomendaciones', recomendacionesRoutes);
app.use('/api/estaciones', estacionesRoutes);

app.use('/api/traccar-webhook', (req, res, next) => {
    console.log('🚨 Webhook Traccar recibido:', {
        timestamp: new Date().toISOString(),
        method: req.method,
        headers: req.headers,
        body: req.body,
        query: req.query
    });
    next();
});

app.post('/api/traccar-webhook', (req, res) => {
    try {
        console.log('🎯 EVENT FORWARDING recibido:', {
            timestamp: new Date().toISOString(),
            method: req.method,
            headers: req.headers,
            body: req.body
        });
        
        const eventData = req.body;
        
        // Verificar si es un evento de geocerca
        if (eventData.event && (
            eventData.event.type === 'geofenceEnter' || 
            eventData.event.type === 'geofenceExit' ||
            eventData.event.type.toLowerCase().includes('geofence')
        )) {
            console.log('🚨 ¡ALARMA DE GEOCERCA DETECTADA via EVENT FORWARDING!');
            
            const alarm = {
                id: eventData.event.id,
                type: eventData.event.type,
                deviceId: eventData.device?.id,
                deviceName: eventData.device?.name || 'Dispositivo desconocido',
                geofenceId: eventData.event.geofenceId,
                eventTime: eventData.event.eventTime || new Date().toISOString(),
                position: eventData.position || {},
                attributes: eventData.event.attributes || {},
                timestamp: new Date().toISOString(),
                source: 'event_forwarding'
            };
            
            // Guardar en memoria para testing
            if (!global.traccarAlarms) {
                global.traccarAlarms = [];
            }
            global.traccarAlarms.unshift(alarm);
            
            // Mantener solo las últimas 50 alarmas
            if (global.traccarAlarms.length > 50) {
                global.traccarAlarms = global.traccarAlarms.slice(0, 50);
            }
            
            console.log('🚨 Alarma procesada via Event Forwarding:', alarm);
        } else {
            console.log('ℹ️ Evento recibido via Event Forwarding:', eventData.event?.type);
        }
        
        // Responder exitosamente
        res.status(200).json({ 
            success: true, 
            message: 'Event Forwarding procesado correctamente',
            timestamp: new Date().toISOString(),
            eventType: eventData.event?.type
        });
        
    } catch (error) {
        console.error('❌ Error procesando Event Forwarding:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error interno del servidor',
            message: error.message 
        });
    }
});


// Endpoint para obtener las alarmas almacenadas (para testing desde el frontend)
app.get('/api/traccar-alarms', (req, res) => {
    try {
        const alarms = global.traccarAlarms || [];
        console.log(`📋 Enviando ${alarms.length} alarmas al cliente`);
        
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
});

// Endpoint para probar el webhook manualmente
app.post('/api/traccar-webhook/test', (req, res) => {
    console.log('🧪 Test del webhook iniciado');
    
    // Simular una alarma de geocerca
    const testAlarm = {
        type: 'geofenceEnter',
        deviceId: 'TEST-001',
        device: { name: 'Dispositivo de Prueba' },
        geofenceId: 'GEO-001',
        geofence: { name: 'Zona de Prueba' },
        eventTime: new Date().toISOString(),
        position: {
            latitude: -31.4201,
            longitude: -64.1888,
            speed: 25
        },
        attributes: {
            test: true,
            message: 'Esta es una alarma de prueba'
        }
    };
    app.all('/api/traccar-webhook', (req, res) => {
        console.log('🎯 WEBHOOK DIRECTO RECIBIDO:');
        console.log('📍 Method:', req.method);
        console.log('📍 Headers:', JSON.stringify(req.headers, null, 2));
        console.log('📍 Body:', JSON.stringify(req.body, null, 2));
        console.log('📍 Query:', JSON.stringify(req.query, null, 2));
        
        res.status(200).json({
            success: true,
            message: 'Webhook directo funcionando',
            timestamp: new Date().toISOString(),
            method: req.method
        });
    });
    
    // Simular la request como si viniera de Traccar
    req.body = testAlarm;
    
    // Procesar como una alarma real
    console.log('🔄 Procesando alarma de prueba...');
    
    // Llamar al mismo procesamiento que usaríamos para alarmas reales
    if (!global.traccarAlarms) {
        global.traccarAlarms = [];
    }
    
    const processedAlarm = {
        id: Date.now(),
        type: testAlarm.type,
        deviceId: testAlarm.deviceId,
        deviceName: testAlarm.device.name,
        geofenceId: testAlarm.geofenceId,
        geofenceName: testAlarm.geofence.name,
        eventTime: testAlarm.eventTime,
        position: testAlarm.position,
        attributes: { ...testAlarm.attributes, isTest: true },
        timestamp: new Date().toISOString()
    };
    
    global.traccarAlarms.unshift(processedAlarm);
    
    console.log('✅ Alarma de prueba procesada correctamente');
    
    res.status(200).json({
        success: true,
        message: 'Alarma de prueba creada exitosamente',
        alarm: processedAlarm,
        totalAlarms: global.traccarAlarms.length
    });
});

// Endpoint para limpiar las alarmas (útil para testing)
app.delete('/api/traccar-alarms', (req, res) => {
    console.log('🗑️ Limpiando alarmas almacenadas');
    global.traccarAlarms = [];
    
    res.status(200).json({
        success: true,
        message: 'Todas las alarmas han sido eliminadas'
    });
});

app.post('/api/notifications/test/webhook', (req, res) => {
    console.log('🧪 Test de webhook desde Traccar recibido');
    console.log('📋 Headers:', req.headers);
    console.log('📋 Body:', req.body);
    
    res.status(200).json({
        success: true,
        message: 'Test webhook exitoso',
        timestamp: new Date().toISOString()
    });
});

// También agregar el endpoint GET si Traccar lo necesita
app.get('/api/notifications/test/webhook', (req, res) => {
    console.log('🧪 GET Test de webhook desde Traccar');
    
    res.status(200).json({
        success: true,
        message: 'Test webhook GET exitoso',
        timestamp: new Date().toISOString()
    });
});

// Endpoint para las notificaciones reales de Traccar
app.post('/api/notifications/webhook', (req, res) => {
    console.log('🚨 Notificación real de webhook recibida');
    console.log('📋 Datos:', JSON.stringify(req.body, null, 2));
    
    // Procesar igual que tu webhook actual
    try {
        const notification = req.body;
        
        if (notification.type && (
            notification.type === 'geofenceEnter' || 
            notification.type === 'geofenceExit' ||
            notification.type.toLowerCase().includes('geofence')
        )) {
            console.log('🎯 ¡ALARMA DE GEOCERCA DETECTADA!');
            
            const alarm = {
                id: Date.now(),
                type: notification.type,
                deviceId: notification.deviceId,
                deviceName: notification.device?.name || 'Dispositivo desconocido',
                geofenceId: notification.geofenceId,
                geofenceName: notification.geofence?.name || 'Geocerca desconocida',
                eventTime: notification.eventTime || new Date().toISOString(),
                position: notification.position || {},
                attributes: notification.attributes || {},
                timestamp: new Date().toISOString()
            };
            
            if (!global.traccarAlarms) {
                global.traccarAlarms = [];
            }
            global.traccarAlarms.unshift(alarm);
            
            if (global.traccarAlarms.length > 50) {
                global.traccarAlarms = global.traccarAlarms.slice(0, 50);
            }
            
            console.log('🚨 Alarma procesada:', alarm);
        }
        
        res.status(200).json({ 
            success: true, 
            message: 'Webhook procesado correctamente',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Error procesando webhook:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});



app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo salió mal!');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor corriendo en https://qarpana.com.ar:${port}`);
    //console.log(`Servidor corriendo en http://localhost:${port}`);
});

app.post('/api/forzar-actualizacion', async (req, res) => {
    try {
        await ejecutarActualizacionesDiarias();
        res.status(200).json({ 
            message: 'Actualizaciones forzadas completadas con éxito'
        });
    } catch (error) {
        console.error('Error en las actualizaciones forzadas:', error);
        res.status(500).json({ 
            error: 'Error al realizar las actualizaciones forzadas',
            details: error.message
        });
    }
});