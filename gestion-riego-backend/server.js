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
const estacionesRoutes = require('./routes/estacionesRoutes');




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
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
    console.log('CORS_ORIGIN:', process.env.CORS_ORIGIN);
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