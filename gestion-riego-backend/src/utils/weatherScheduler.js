const cron = require('node-cron');
const weatherService = require('./weatherService');

// Programar la actualización para ejecutarse todos los días a las 00:01
cron.schedule('1 0 * * *', async () => {
    console.log('Iniciando actualización diaria de datos meteorológicos...');
    try {
        await weatherService.actualizarDatosMeteorologicos();
        console.log('Actualización de datos meteorológicos completada con éxito');
    } catch (error) {
        console.error('Error en la actualización programada:', error);
    }
});

// También exportamos una función para forzar la actualización manualmente
module.exports = {
    forzarActualizacion: async () => {
        console.log('Forzando actualización de datos meteorológicos...');
        try {
            await weatherService.actualizarDatosMeteorologicos();
            console.log('Actualización forzada completada con éxito');
        } catch (error) {
            console.error('Error en la actualización forzada:', error);
            throw error;
        }
    }
};