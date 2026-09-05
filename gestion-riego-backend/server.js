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
const reportesRoutes = require('./src/routes/reportesRoutes');
const estacionesRoutes = require('./src/routes/estacionesRoutes');
const gpsRoutes = require('./src/routes/gpsRoutes');
const geozonasPivoteRoutes = require('./src/routes/geozonasPivoteRoutes');
const gpsController = require('./src/controllers/gpsController');




// NUEVA IMPORTACIÓN DE TRACCAR
const traccarRoutes = require('./src/routes/traccarRoutes');
const regadoresRoutes = require('./src/routes/regadoresRoutes');


const cron = require('node-cron');
const actualizacionDiaria = require('./src/utils/actualizacionDiaria');
const weatherService = require('./src/utils/weatherService');
const regadorStatusService = require('./src/services/regadorStatusService');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
    origin: process.env.CORS_ORIGIN || 'https://qarpana.com.ar',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204
}));

app.use((req, res, next) => {
    next();
});

app.use(express.json());

// Función para ejecutar todas las actualizaciones diarias
async function ejecutarActualizacionesDiarias() {
    console.log('Iniciando actualizaciones diarias...');
    try {
        console.log('Actualizando pronósticos meteorológicos...');
        await weatherService.actualizarDatosMeteorologicos();

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

// RUTAS EXISTENTES
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
app.use('/api/reportes', reportesRoutes);
app.use('/api/estaciones', estacionesRoutes);
app.use('/api/geozonas-pivote', geozonasPivoteRoutes);


// NUEVA RUTA DE TRACCAR
app.use('/api/traccar', traccarRoutes);
app.use('/api/regadores', regadoresRoutes);
app.use('/api/gps', gpsRoutes);

// Endpoint de actualización forzada
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

// Middleware de manejo de errores
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Algo salió mal!');
});

app.post('/api/gps/posicion', async (req, res) => {
    console.log('📍 Position Forwarding recibido');
    console.log('📦 Dispositivo:', req.body.device?.name);

    try {
        await gpsController.procesarPosicion(req, res);
    } catch (error) {
        console.error('❌ Error procesando posición:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor corriendo en https://qarpana.com.ar:${port}`);
    console.log('🎯 Traccar Event Forwarding configurado en /api/traccar/webhook');

    // ⭐ Iniciar servicio de monitoreo de estado de regadores
    regadorStatusService.iniciar();
});