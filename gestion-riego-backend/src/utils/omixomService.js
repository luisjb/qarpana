// src/utils/omixomService.js
const axios = require('axios');
const pool = require('../db');

class OmixomService {
    constructor() {
        this.API_TOKEN = 'fa31ec35bbe0e6684f75e8cc2ebe38dd999f7356';
        this.BASE_URL = 'https://new.omixom.com/api/v2';
    }

    async obtenerUltimoDatoEstacion(estacionCodigo) {
        try {
            // Obtener información de los módulos de la estación
            const modulosInfo = await this.obtenerModulosEstacion(estacionCodigo);
            
            if (!modulosInfo.tieneEvapotranspiracion) {
                console.log(`Estación ${estacionCodigo} no tiene módulo de evapotranspiración`);
                return null;
            }

            // Configurar rango de fechas para ayer (día completo)
            const hoy = new Date();
            const ayer = new Date(hoy);
            ayer.setDate(hoy.getDate() - 1);
            
            // Formatear fechas en horario argentino (UTC-3)
            const fechaInicio = ayer.toISOString().split('T')[0] + 'T00:00:00-03:00';
            const fechaFin = ayer.toISOString().split('T')[0] + 'T23:59:59-03:00';

            const requestBody = {
                stations: {
                    [estacionCodigo]: {
                        date_from: fechaInicio,
                        date_to: fechaFin,
                        modules: modulosInfo.modulosEvapotranspiracion
                    }
                }
            };

            console.log(`Consultando datos completos del día para estación ${estacionCodigo}`);
            console.log(`Rango: ${fechaInicio} a ${fechaFin}`);
            console.log(`Módulos: ${modulosInfo.modulosEvapotranspiracion}`);

            const response = await axios.post(`${this.BASE_URL}/private_samples_range`, requestBody, {
                headers: {
                    'Authorization': `Token ${this.API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            return this.procesarDatosRangoCompleto(response.data, modulosInfo.modulosEvapotranspiracion, ayer);
        } catch (error) {
            console.error(`Error consultando estación ${estacionCodigo}:`, error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            return null;
        }
    }

    procesarDatosRangoCompleto(data, moduloIds, fechaObjetivo) {
        if (!data || !Array.isArray(data)) {
            console.log('No se recibieron datos de estaciones o formato incorrecto');
            return null;
        }

        console.log(`Procesando ${data.length} muestras para la fecha ${fechaObjetivo.toISOString().split('T')[0]}`);

        // Agrupar datos por estación y fecha
        const datosPorEstacion = {};
        
        data.forEach(muestra => {
            try {
                if (!muestra.date || !muestra.station) {
                    return;
                }

                const fechaMuestra = new Date(muestra.date);
                const fechaStr = fechaMuestra.toISOString().split('T')[0];
                const estacionId = muestra.station;
                
                // Inicializar estructura si no existe
                if (!datosPorEstacion[estacionId]) {
                    datosPorEstacion[estacionId] = {};
                }
                if (!datosPorEstacion[estacionId][fechaStr]) {
                    datosPorEstacion[estacionId][fechaStr] = {
                        valores: [],
                        temperatura: [],
                        humedad: [],
                        precipitaciones: []
                    };
                }

                // Extraer valores de evapotranspiración de todos los módulos
                moduloIds.forEach(moduloId => {
                    const valor = muestra[moduloId.toString()];
                    if (valor !== undefined && valor !== null && !isNaN(valor)) {
                        datosPorEstacion[estacionId][fechaStr].valores.push(parseFloat(valor));
                    }
                });

                // Extraer otros datos meteorológicos si están disponibles
                Object.keys(muestra).forEach(key => {
                    if (!isNaN(key) && !moduloIds.includes(parseInt(key))) {
                        const valor = parseFloat(muestra[key]);
                        if (!isNaN(valor)) {
                            // Estos podrían ser temperatura, humedad, etc.
                            // Por ahora los guardamos como datos adicionales
                        }
                    }
                });

            } catch (error) {
                console.error('Error procesando muestra individual:', error);
            }
        });

        // Procesar y sumar valores por día
        const resultados = [];
        const fechaObjetivoStr = fechaObjetivo.toISOString().split('T')[0];

        Object.keys(datosPorEstacion).forEach(estacionId => {
            const datosEstacion = datosPorEstacion[estacionId];
            
            if (datosEstacion[fechaObjetivoStr]) {
                const datosDia = datosEstacion[fechaObjetivoStr];
                
                // Sumar todos los valores de evapotranspiración del día
                const sumaETP = datosDia.valores.reduce((sum, val) => sum + val, 0);
                const cantidadMuestras = datosDia.valores.length;
                
                console.log(`Estación ${estacionId} - Fecha ${fechaObjetivoStr}:`);
                console.log(`  Valores individuales: ${datosDia.valores.join(', ')}`);
                console.log(`  Suma total: ${sumaETP} mm/día`);
                console.log(`  Cantidad de muestras: ${cantidadMuestras}`);

                if (sumaETP > 0) {
                    resultados.push({
                        fecha: fechaObjetivoStr,
                        evapotranspiracion: Math.round(sumaETP * 1000) / 1000, // Redondear a 3 decimales
                        temperatura: null, // Se puede agregar si está disponible
                        humedad: null,     // Se puede agregar si está disponible
                        precipitaciones: 0, // Se puede agregar si está disponible
                        muestras_procesadas: cantidadMuestras
                    });
                }
            }
        });

        console.log(`Resultados finales: ${resultados.length} registros procesados`);
        return resultados.length > 0 ? resultados : null;
    }

    async obtenerDatosComplementarios(estacionCodigo) {
        try {
            // Obtener todos los módulos para temperatura, humedad y precipitaciones
            const modulosInfo = await this.obtenerModulosEstacion(estacionCodigo);
            const client = await pool.connect();
            
            try {
                const { rows } = await client.query(`
                    SELECT datos_json 
                    FROM estaciones_meteorologicas 
                    WHERE codigo = $1
                `, [estacionCodigo]);

                if (rows.length === 0) return null;

                const datos = typeof rows[0].datos_json === 'string' 
                    ? JSON.parse(rows[0].datos_json) 
                    : rows[0].datos_json;

                const modules = datos.modules || [];
                
                // Buscar módulos de temperatura, humedad y precipitaciones
                const modulosMeteorologicos = modules.filter(modulo => 
                    modulo.type && (
                        modulo.type.toLowerCase().includes('temperatura') ||
                        modulo.type.toLowerCase().includes('humedad') ||
                        modulo.type.toLowerCase().includes('precipitacion') ||
                        modulo.type.toLowerCase().includes('lluvia')
                    )
                );

                if (modulosMeteorologicos.length === 0) return null;

                // Usar private_last_measure para obtener datos meteorológicos
                const requestBody = {
                    stations: {
                        [estacionCodigo]: {
                            modules: modulosMeteorologicos.map(m => m.id)
                        }
                    }
                };

                const response = await axios.post(`${this.BASE_URL}/private_last_measure`, requestBody, {
                    headers: {
                        'Authorization': `Token ${this.API_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });

                return this.procesarDatosMeteorologicos(response.data, modulosMeteorologicos);

            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Error obteniendo datos complementarios:', error.message);
            return null;
        }
    }

    procesarDatosMeteorologicos(data, modulosInfo) {
        if (!data || !Array.isArray(data)) return null;

        const resultados = [];
        
        data.forEach(muestra => {
            try {
                if (!muestra.date || !muestra.station) return;

                const fecha = new Date(muestra.date);
                let temperatura = null, humedad = null, precipitaciones = null;

                // Buscar valores en los módulos
                modulosInfo.forEach(modulo => {
                    const valor = muestra[modulo.id.toString()];
                    if (valor !== undefined && valor !== null) {
                        const valorNum = parseFloat(valor);
                        if (!isNaN(valorNum)) {
                            if (modulo.type.toLowerCase().includes('temperatura')) {
                                temperatura = valorNum;
                            } else if (modulo.type.toLowerCase().includes('humedad')) {
                                humedad = valorNum;
                            } else if (modulo.type.toLowerCase().includes('precipitacion') || 
                                      modulo.type.toLowerCase().includes('lluvia')) {
                                precipitaciones = valorNum;
                            }
                        }
                    }
                });

                resultados.push({
                    fecha: fecha.toISOString().split('T')[0],
                    temperatura,
                    humedad,
                    precipitaciones: precipitaciones || 0
                });

            } catch (error) {
                console.error('Error procesando datos meteorológicos:', error);
            }
        });

        return resultados.length > 0 ? resultados : null;
    }

    async obtenerModulosEstacion(estacionCodigo) {
        const client = await pool.connect();
        try {
            // Obtener módulos de la estación desde nuestra base de datos
            const { rows } = await client.query(`
                SELECT datos_json 
                FROM estaciones_meteorologicas 
                WHERE codigo = $1
            `, [estacionCodigo]);

            if (rows.length === 0) {
                console.log(`No se encontró configuración para estación ${estacionCodigo}`);
                return { tieneEvapotranspiracion: false, modulosEvapotranspiracion: [] };
            }

            const datos = typeof rows[0].datos_json === 'string' 
                ? JSON.parse(rows[0].datos_json) 
                : rows[0].datos_json;

            const modules = datos.modules || [];
            
            // Buscar módulos relacionados con evapotranspiración
            const modulosEvapotranspiracion = modules.filter(modulo => 
                modulo.type && (
                    modulo.type.toLowerCase().includes('evapotranspiración') ||
                    modulo.type.toLowerCase().includes('evapotranspiracion') ||
                    modulo.type.toLowerCase().includes('evapotranspiration') ||
                    modulo.type.toLowerCase().includes('etp') ||
                    modulo.type.toLowerCase().includes('eto')
                )
            );

            console.log(`Estación ${estacionCodigo} - Módulos de evapotranspiración encontrados:`, 
                modulosEvapotranspiracion.map(m => `${m.id}: ${m.type}`));

            // Si no hay módulos específicos de evapotranspiración, buscar temperatura y humedad
            let modulosAlternativos = [];
            if (modulosEvapotranspiracion.length === 0) {
                const modulosTemperatura = modules.filter(m => 
                    m.type && m.type.toLowerCase().includes('temperatura')
                );
                const modulosHumedad = modules.filter(m => 
                    m.type && m.type.toLowerCase().includes('humedad')
                );
                
                if (modulosTemperatura.length > 0 && modulosHumedad.length > 0) {
                    modulosAlternativos = [...modulosTemperatura, ...modulosHumedad];
                    console.log(`Estación ${estacionCodigo} - Usando módulos alternativos (temp + humedad):`, 
                        modulosAlternativos.map(m => `${m.id}: ${m.type}`));
                }
            }

            return {
                tieneEvapotranspiracion: modulosEvapotranspiracion.length > 0 || modulosAlternativos.length > 0,
                modulosEvapotranspiracion: modulosEvapotranspiracion.length > 0 
                    ? modulosEvapotranspiracion.map(m => m.id)
                    : modulosAlternativos.map(m => m.id),
                esCalculado: modulosEvapotranspiracion.length === 0 // Si usamos temp+humedad, necesitamos calcular
            };
        } finally {
            client.release();
        }
    }

    procesarUltimoDatoEstacion(data, esCalculado = false) {
        if (!data || !Array.isArray(data)) {
            console.log('No se recibieron datos de estaciones o formato incorrecto');
            return null;
        }

        const resultados = [];
        
        // La API private_last_measure devuelve un array directamente
        data.forEach(muestra => {
            try {
                if (!muestra.date || !muestra.station) {
                    console.log('Muestra sin fecha o estación:', muestra);
                    return;
                }

                const fecha = new Date(muestra.date);
                const estacionId = muestra.station;
                
                // Extraer evapotranspiración del ID del módulo
                let evapotranspiracion = null;
                
                // Buscar el valor en las claves numéricas (IDs de módulos)
                const moduleIds = Object.keys(muestra).filter(key => 
                    !isNaN(key) && key !== 'date' && key !== 'station'
                );
                
                if (moduleIds.length > 0) {
                    // Tomar el primer módulo encontrado (debería ser el de evapotranspiración)
                    const moduleId = moduleIds[0];
                    const valor = muestra[moduleId];
                    
                    if (valor !== undefined && valor !== null) {
                        evapotranspiracion = parseFloat(valor);
                        console.log(`Evapotranspiración obtenida del módulo ${moduleId}: ${evapotranspiracion}`);
                    }
                } else {
                    console.log('No se encontraron módulos en la muestra:', Object.keys(muestra));
                }

                if (evapotranspiracion !== null && !isNaN(evapotranspiracion)) {
                    const resultado = {
                        fecha: fecha.toISOString().split('T')[0],
                        evapotranspiracion: Math.max(0, evapotranspiracion), // Asegurar valor positivo
                        temperatura: null, // La API private_last_measure no incluye temperatura/humedad
                        humedad: null,
                        precipitaciones: 0
                    };
                    
                    console.log(`Datos procesados para estación ${estacionId}:`, resultado);
                    resultados.push(resultado);
                } else {
                    console.log(`No se pudo obtener evapotranspiración para estación ${estacionId}:`, {
                        muestra: muestra,
                        moduleIds: moduleIds,
                        evapotranspiracion: evapotranspiracion
                    });
                }
            } catch (error) {
                console.error('Error procesando muestra:', error);
            }
        });

        return resultados.length > 0 ? resultados : null;
    }

    calcularEvapotranspiracionSimplificada(temperatura, humedad) {
        // Fórmula simplificada para estimar ETo cuando no está disponible directamente
        // Basada en la fórmula de Hargreaves simplificada
        const tempCelsius = temperatura;
        const hr = Math.min(100, Math.max(0, humedad)); // Asegurar que esté entre 0-100
        
        // Factor de corrección por humedad
        const factorHumedad = 1 - (hr / 100) * 0.3;
        
        // Estimación base usando temperatura (fórmula simplificada)
        let etoBase = 0.0023 * (tempCelsius + 17.8) * Math.sqrt(Math.abs(tempCelsius - 10)) * 2.5;
        
        // Aplicar factor de humedad
        const eto = etoBase * factorHumedad;
        
        // Asegurar que esté en un rango razonable (0.1 - 8.0 mm/día)
        return Math.max(0.1, Math.min(8.0, eto));
    }

    // Método para obtener datos históricos (mantener funcionalidad existente si es necesaria)
    async obtenerDatosEstacion(estacionCodigo, fechaInicio, fechaFin) {
        try {
            // Obtener información de los módulos de la estación
            const modulosInfo = await this.obtenerModulosEstacion(estacionCodigo);
            
            if (!modulosInfo.tieneEvapotranspiracion) {
                console.log(`Estación ${estacionCodigo} no tiene módulo de evapotranspiración`);
                return null;
            }

            // Consultar datos de las últimas mediciones
            const response = await axios.post(`${this.BASE_URL}/private_samples_range`, {
                stations: {
                    [estacionCodigo]: {
                        date_from: fechaInicio,
                        date_to: fechaFin,
                        modules: modulosInfo.modulosEvapotranspiracion
                    }
                }
            }, {
                headers: {
                    'Authorization': `Token ${this.API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            return this.procesarDatosEstacion(response.data);
        } catch (error) {
            console.error(`Error consultando estación ${estacionCodigo}:`, error.message);
            return null;
        }
    }

    procesarDatosEstacion(data) {
        if (!data || !data.stations) {
            return null;
        }

        const resultados = [];
        
        Object.keys(data.stations).forEach(estacionId => {
            const estacionData = data.stations[estacionId];
            
            if (estacionData.samples && Array.isArray(estacionData.samples)) {
                estacionData.samples.forEach(muestra => {
                    try {
                        const fecha = new Date(muestra.datetime);
                        
                        // Extraer evapotranspiración directa si está disponible
                        let evapotranspiracion = null;
                        
                        if (muestra.evapotranspiracion !== undefined) {
                            evapotranspiracion = parseFloat(muestra.evapotranspiracion);
                        } else if (muestra.etp !== undefined) {
                            evapotranspiracion = parseFloat(muestra.etp);
                        } else if (muestra.eto !== undefined) {
                            evapotranspiracion = parseFloat(muestra.eto);
                        } else {
                            // Si no hay evapotranspiración directa, intentar calcular con Penman-Monteith
                            // usando temperatura y humedad si están disponibles
                            const temp = parseFloat(muestra.temperatura) || null;
                            const humedad = parseFloat(muestra.humedad) || null;
                            
                            if (temp && humedad) {
                                evapotranspiracion = this.calcularEvapotranspiracionSimplificada(temp, humedad);
                            }
                        }

                        if (evapotranspiracion !== null && !isNaN(evapotranspiracion)) {
                            resultados.push({
                                fecha: fecha.toISOString().split('T')[0],
                                evapotranspiracion: Math.max(0, evapotranspiracion), // Asegurar valor positivo
                                temperatura: parseFloat(muestra.temperatura) || null,
                                humedad: parseFloat(muestra.humedad) || null,
                                precipitaciones: parseFloat(muestra.precipitaciones) || parseFloat(muestra.lluvia) || 0
                            });
                        }
                    } catch (error) {
                        console.error('Error procesando muestra:', error);
                    }
                });
            }
        });

        return resultados;
    }
}

module.exports = new OmixomService();