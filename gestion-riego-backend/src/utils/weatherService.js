const axios = require('./axiosConfig');
const pool = require('../db');
const EToCalculator = require('./etoCalculator');

class WeatherService {
    constructor() {
        this.API_KEY = '2964efd26e21bdccfea5c80281ede919';
        this.BASE_URL = 'https://api.openweathermap.org/data/2.5/forecast';
    }

    async actualizarDatosMeteorologicos() {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
    
             // Obtener los campos activos
            const camposResult = await client.query(`
                SELECT DISTINCT c.id, c.nombre_campo, c.ubicacion,
                    COUNT(l.id) as cantidad_lotes
                FROM campos c
                INNER JOIN lotes l ON l.campo_id = c.id
                WHERE c.ubicacion IS NOT NULL 
                AND l.activo = true
                GROUP BY c.id, c.nombre_campo, c.ubicacion
            `);
            console.log('Campos y lotes a procesar:', camposResult.rows);

    
            for (const campo of camposResult.rows) {
                try {
                     // Obtener pronóstico para el campo
                    const [lat, lon] = campo.ubicacion.split(',').map(coord => coord.trim());
                    const pronostico = await this.obtenerPronosticoCampo(lat, lon);
                    console.log(`Pronóstico obtenido para campo ${campo.nombre_campo}`);

    
                     // Obtener lotes activos del campo
                    const lotesResult = await client.query(`
                        SELECT l.id, l.nombre_lote, l.cultivo_id, cc.indice_kc
                        FROM lotes l
                        LEFT JOIN coeficiente_cultivo cc ON l.cultivo_id = cc.cultivo_id
                        WHERE l.campo_id = $1 AND l.activo = true
                    `, [campo.id]);
        
                    console.log(`Procesando ${lotesResult.rows.length} lotes para campo ${campo.nombre_campo}`);
    
                    // Procesar cada lote del campo
                    for (const lote of lotesResult.rows) {
                        try {
                            console.log(`Actualizando pronóstico para lote ${lote.nombre_lote}`);
                            await this.actualizarPronosticoLote(client, lote, pronostico);
                            console.log(`Pronóstico actualizado exitosamente para lote ${lote.nombre_lote}`);
                        } catch (loteError) {
                            console.error(`Error procesando lote ${lote.nombre_lote}:`, loteError);
                        }
                    }

                } catch (error) {
                    console.error(`Error procesando campo ${campo.nombre_campo}:`, error);
                }
            }
    
            await client.query('COMMIT');
            console.log('Actualización de pronósticos completada exitosamente');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error en actualización general:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async obtenerPronosticoCampo(lat, lon) {
        try {

           
            // Construir URL completa para debugging
            const urlCompleta = `${this.BASE_URL}?lat=${lat}&lon=${lon}&appid=${this.API_KEY}&units=metric`;
            console.log('URL de consulta:', urlCompleta);

            const response = await axios.get(urlCompleta);

            // Log de la respuesta
            console.log('Respuesta de la API:', {
                status: response.status,
                tieneData: !!response.data,
                cantidadItems: response.data?.list?.length || 0
            });

            const medicionesPorDia = new Map();

            if (!response.data || !response.data.list) {
                throw new Error('Respuesta de API inválida');
            }

            
            response.data.list.forEach(item => {
                const fecha = new Date(item.dt * 1000);
                const fechaKey = fecha.toISOString().split('T')[0];
                if (!medicionesPorDia.has(fechaKey)) {
                    medicionesPorDia.set(fechaKey, []);
                }
                medicionesPorDia.get(fechaKey).push(item);
            });
    
            const pronosticoBase = Array.from(medicionesPorDia.entries())
                .slice(0, 5)
                .map(([fechaKey, mediciones]) => ({
                    fecha: new Date(fechaKey),
                    ...this.calcularEstadisticasDiarias(mediciones)
                }));
    
            // Extender a 8 días usando promedio de últimos 3 días
            const ultimosDias = pronosticoBase.slice(-3);
            const pronosticoExtendido = [...pronosticoBase];
    
            for (let i = 0; i < 3; i++) {
                const diaBase = ultimosDias[i];
                const nuevaFecha = new Date(pronosticoExtendido[pronosticoExtendido.length - 1].fecha);
                nuevaFecha.setDate(nuevaFecha.getDate() + 1);
                pronosticoExtendido.push({
                    ...diaBase,
                    fecha: nuevaFecha
                });
            }
    
            return pronosticoExtendido;
        } catch (error) {
            console.error('Error en obtenerPronosticoCampo:', error);
            throw error;
        }
    }

    calcularEstadisticasDiarias(mediciones) {
        // Inicializar acumuladores
        let sumTemp = 0;
        let sumHumedad = 0;
        let sumPresion = 0;
        let sumViento = 0;
        let precipitacionTotal = 0;
        let tempMax = -Infinity;
        let tempMin = Infinity;

        // Procesar cada medición
        mediciones.forEach(med => {
            // Temperaturas
            sumTemp += med.main.temp;
            tempMax = Math.max(tempMax, med.main.temp_max);
            tempMin = Math.min(tempMin, med.main.temp_min);
            
            // Otros parámetros
            sumHumedad += med.main.humidity;
            sumPresion += med.main.pressure;
            sumViento += med.wind.speed;
            
            // Precipitaciones (acumulativo)
            if (med.rain) {
                precipitacionTotal += med.rain['3h'] || 0;
            }
        });

        const cantidadMediciones = mediciones.length;

        return {
            temperatura_media: sumTemp / cantidadMediciones,
            temperatura_max: tempMax,
            temperatura_min: tempMin,
            humedad: Math.round(sumHumedad / cantidadMediciones),
            presion: Math.round(sumPresion / cantidadMediciones),
            velocidad_viento: sumViento / cantidadMediciones,
            precipitaciones: precipitacionTotal
        };
    }

    async actualizarPronosticoLote(client, lote, pronostico) {
        try {
            const campoResult = await client.query(
                'SELECT "ubicacion" FROM campos WHERE id = (SELECT campo_id FROM lotes WHERE id = $1)',
                [lote.id]
            );
            const [lat, lon] = campoResult.rows[0].ubicacion.split(',').map(coord => parseFloat(coord.trim()));
            
            // Crear calculador ETo
            const calculator = new EToCalculator(lat, 100);
    
            // Eliminar pronósticos antiguos
            await client.query(
                'DELETE FROM pronostico WHERE lote_id = $1 AND fecha_pronostico > CURRENT_DATE',
                [lote.id]
            );
    
            for (let i = 0; i < pronostico.length; i++) {
                const dia = pronostico[i];
    
                // Asegurar que todos los valores son numéricos
                const weatherData = {
                    date: new Date(dia.fecha),
                    tempMean: parseFloat(dia.temperatura_media || 0),
                    tempMax: parseFloat(dia.temperatura_max || 0),
                    tempMin: parseFloat(dia.temperatura_min || 0),
                    humidity: parseFloat(dia.humedad || 0),
                    pressure: parseFloat(dia.presion || 0),
                    windSpeed: parseFloat(dia.velocidad_viento || 0)
                };
    
                console.log('Datos para EToCalculator:', weatherData);
    
                // Calcular ETo
                const eto = calculator.calculateDailyETo(weatherData);
                console.log('ETo calculado:', eto);
    
                // Obtener kc del cultivo
                const cultivoResult = await client.query(
                    'SELECT cc.indice_kc FROM coeficiente_cultivo cc WHERE cc.cultivo_id = $1 AND cc.indice_dias <= $2 ORDER BY cc.indice_dias DESC LIMIT 1',
                    [lote.cultivo_id, i]
                );
                const kc = parseFloat(cultivoResult.rows[0]?.indice_kc || 1);
                
                // Calcular ETC
                const etc = eto * kc;
                console.log('Datos de cálculo ETC:', {
                    eto,
                    kc,
                    etc,
                    fecha: dia.fecha
                });
    
                const lluviaEfectiva = this.calcularLluviaEfectiva(parseFloat(dia.precipitaciones || 0));
    
                await client.query(`
                    INSERT INTO pronostico 
                    (lote_id, fecha_pronostico, prono_dias, temperatura_media, temperatura_max, 
                     temperatura_min, humedad, presion, velocidad_viento, precipitaciones, 
                     evapotranspiracion, etc, lluvia_efectiva, fecha_actualizacion)
                    VALUES 
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
                    ON CONFLICT (lote_id, fecha_pronostico, prono_dias) 
                    DO UPDATE SET 
                        temperatura_media = EXCLUDED.temperatura_media,
                        temperatura_max = EXCLUDED.temperatura_max,
                        temperatura_min = EXCLUDED.temperatura_min,
                        humedad = EXCLUDED.humedad,
                        presion = EXCLUDED.presion,
                        velocidad_viento = EXCLUDED.velocidad_viento,
                        precipitaciones = EXCLUDED.precipitaciones,
                        evapotranspiracion = EXCLUDED.evapotranspiracion,
                        etc = EXCLUDED.etc,
                        lluvia_efectiva = EXCLUDED.lluvia_efectiva,
                        fecha_actualizacion = CURRENT_TIMESTAMP`,
                    [
                        lote.id,
                        dia.fecha,
                        i + 1,
                        weatherData.tempMean,
                        weatherData.tempMax,
                        weatherData.tempMin,
                        weatherData.humidity,
                        weatherData.pressure,
                        weatherData.windSpeed,
                        dia.precipitaciones,
                        eto,
                        etc,
                        lluviaEfectiva
                    ]
                );
            }
        } catch (error) {
            console.error(`Error actualizando pronóstico para lote ${lote.id}:`, error);
            throw error;
        }
    }

    calcularLluviaEfectiva(precipitaciones) {
        if (!precipitaciones || precipitaciones < 0) return 0;
        if (precipitaciones < 15) {
            return precipitaciones;
        }
        return 2.43 * Math.pow(precipitaciones, 0.667);
    }

}

module.exports = new WeatherService();