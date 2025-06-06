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

            // Usar el endpoint private_last_measure en lugar de private_samples_range
            const requestBody = {
                stations: {
                    [estacionCodigo]: {
                        modules: modulosInfo.modulosEvapotranspiracion
                    }
                }
            };

            console.log(`Consultando última medida para estación ${estacionCodigo} con módulos:`, modulosInfo.modulosEvapotranspiracion);

            const response = await axios.post(`${this.BASE_URL}/private_last_measure`, requestBody, {
                headers: {
                    'Authorization': `Token ${this.API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            return this.procesarUltimoDatoEstacion(response.data, modulosInfo.esCalculado);
        } catch (error) {
            console.error(`Error consultando estación ${estacionCodigo}:`, error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
            return null;
        }
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