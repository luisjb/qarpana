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
            const modulosInfo = await this.obtenerModulosEstacion(estacionCodigo);

            const todosModulos = [
                ...modulosInfo.modulosEvapotranspiracion,
                ...modulosInfo.modulosTemperatura,
                ...modulosInfo.modulosRadiacion,
            ];
            const modulosUnicos = [...new Set(todosModulos)];

            if (modulosUnicos.length === 0) {
                return null;
            }

            const hoy = new Date();
            const ayer = new Date(hoy);
            ayer.setDate(hoy.getDate() - 1);

            const fechaInicio = ayer.toISOString().split('T')[0] + 'T00:00:01-03:00';
            const fechaFin = ayer.toISOString().split('T')[0] + 'T23:59:59-03:00';

            const requestBody = {
                stations: {
                    [estacionCodigo]: {
                        date_from: fechaInicio,
                        date_to: fechaFin,
                        modules: modulosUnicos,
                    }
                }
            };

            const response = await axios.post(`${this.BASE_URL}/private_samples_range`, requestBody, {
                headers: {
                    'Authorization': `Token ${this.API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            return this.procesarDatosRangoCompleto(response.data, modulosInfo, hoy);
        } catch (error) {
            console.error(`Error consultando estación ${estacionCodigo}:`, error.message);
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
               // console.log(`No se encontró configuración para estación ${estacionCodigo}`);
                return { tieneEvapotranspiracion: false, modulosEvapotranspiracion: [] };
            }

            const datos = typeof rows[0].datos_json === 'string' 
                ? JSON.parse(rows[0].datos_json) 
                : rows[0].datos_json;

            const modules = datos.modules || [];
            
            const modulosEvapotranspiracion = modules.filter(m =>
                m.type && (
                    m.type.toLowerCase().includes('evapotranspiración') ||
                    m.type.toLowerCase().includes('evapotranspiracion') ||
                    m.type.toLowerCase().includes('evapotranspiration') ||
                    m.type.toLowerCase().includes('etp') ||
                    m.type.toLowerCase().includes('eto')
                )
            );

            const modulosTemperatura = modules.filter(m =>
                m.type && (
                    m.type.toLowerCase().includes('temperatura') ||
                    m.type.toLowerCase().includes('temperature') ||
                    (m.type.toLowerCase().includes('temp') && !m.type.toLowerCase().includes('etp'))
                )
            );

            const modulosRadiacion = modules.filter(m =>
                m.type && (
                    m.type.toLowerCase().includes('radiación') ||
                    m.type.toLowerCase().includes('radiacion') ||
                    m.type.toLowerCase().includes('radiation') ||
                    m.type.toLowerCase().includes('solar') ||
                    m.type.toLowerCase().includes('rad')
                )
            );

            // Fallback ETo: si no hay módulo ETo directo, usar temp+humedad
            let modulosEtoFinal = modulosEvapotranspiracion.map(m => m.id);
            let esCalculado = false;
            if (modulosEtoFinal.length === 0) {
                const modulosHumedad = modules.filter(m =>
                    m.type && m.type.toLowerCase().includes('humedad')
                );
                if (modulosTemperatura.length > 0 && modulosHumedad.length > 0) {
                    modulosEtoFinal = [...modulosTemperatura, ...modulosHumedad].map(m => m.id);
                    esCalculado = true;
                }
            }

            return {
                tieneEvapotranspiracion: modulosEtoFinal.length > 0,
                modulosEvapotranspiracion: modulosEtoFinal,
                modulosTemperatura: modulosTemperatura.map(m => m.id),
                modulosRadiacion: modulosRadiacion.map(m => m.id),
                esCalculado,
            };
        } finally {
            client.release();
        }
    }

    procesarDatosRangoCompleto(data, modulosInfo, fechaObjetivo) {
        if (!data || !Array.isArray(data)) {
            return null;
        }

        const etoIds = new Set((modulosInfo.modulosEvapotranspiracion || []).map(String));
        const tempIds = new Set((modulosInfo.modulosTemperatura || []).map(String));
        const radIds = new Set((modulosInfo.modulosRadiacion || []).map(String));

        // ETo: acumular suma; Temp: acumular para max/min; Rad: acumular suma
        const etoVals = [];
        const tempVals = [];
        const radVals = [];

        data.forEach(muestra => {
            if (!muestra.date || !muestra.station) return;
            Object.keys(muestra).forEach(key => {
                if (key === 'date' || key === 'station') return;
                const v = parseFloat(muestra[key]);
                if (isNaN(v)) return;
                if (etoIds.has(key)) etoVals.push(v);
                if (tempIds.has(key)) tempVals.push(v);
                if (radIds.has(key)) radVals.push(v);
            });
        });

        const etoTotal = etoVals.length > 0 ? etoVals.reduce((s, v) => s + v, 0) : null;
        const tempMax = tempVals.length > 0 ? Math.max(...tempVals) : null;
        const tempMin = tempVals.length > 0 ? Math.min(...tempVals) : null;
        const tempMedia = tempVals.length > 0 ? tempVals.reduce((s, v) => s + v, 0) / tempVals.length : null;
        const radTotal = radVals.length > 0 ? radVals.reduce((s, v) => s + v, 0) : null;

        if (etoTotal === null && tempMax === null && radTotal === null) {
            return null;
        }

        return [{
            fecha: fechaObjetivo.toISOString().split('T')[0],
            evapotranspiracion: etoTotal !== null ? Math.round(etoTotal * 1000) / 1000 : null,
            temperatura: tempMedia !== null ? Math.round(tempMedia * 10) / 10 : null,
            temp_max: tempMax !== null ? Math.round(tempMax * 10) / 10 : null,
            temp_min: tempMin !== null ? Math.round(tempMin * 10) / 10 : null,
            humedad: null,
            precipitaciones: 0,
            radiacion: radTotal !== null ? Math.round(radTotal * 100) / 100 : null,
        }];
    }

    async obtenerDatosEstacionRango(estacionCodigo, diasAtras = 1) {
        try {
            const modulosInfo = await this.obtenerModulosEstacion(estacionCodigo);

            const todosModulos = [
                ...modulosInfo.modulosEvapotranspiracion,
                ...modulosInfo.modulosTemperatura,
                ...modulosInfo.modulosRadiacion,
            ];
            const modulosUnicos = [...new Set(todosModulos)];

            if (modulosUnicos.length === 0) return null;

            const hoy = new Date();
            const fechaInicio = new Date(hoy);
            fechaInicio.setDate(hoy.getDate() - diasAtras);

            const fechaInicioStr = fechaInicio.toISOString().split('T')[0] + 'T00:00:00-03:00';
            const fechaFinStr = hoy.toISOString().split('T')[0] + 'T23:59:59-03:00';

            const requestBody = {
                stations: {
                    [estacionCodigo]: {
                        date_from: fechaInicioStr,
                        date_to: fechaFinStr,
                        modules: modulosUnicos,
                    }
                }
            };

            const response = await axios.post(`${this.BASE_URL}/private_samples_range`, requestBody, {
                headers: {
                    'Authorization': `Token ${this.API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            return this.procesarDatosRangoMultipleDias(response.data, modulosInfo, diasAtras);
        } catch (error) {
            console.error(`Error consultando rango de datos para estación ${estacionCodigo}:`, error.message);
            return null;
        }
    }

    procesarDatosRangoMultipleDias(data, modulosInfo, diasAtras) {
        if (!data || !Array.isArray(data)) return null;

        const etoIds = new Set((modulosInfo.modulosEvapotranspiracion || []).map(String));
        const tempIds = new Set((modulosInfo.modulosTemperatura || []).map(String));
        const radIds = new Set((modulosInfo.modulosRadiacion || []).map(String));

        const porFecha = {};

        data.forEach(muestra => {
            if (!muestra.date || !muestra.station) return;
            const fecha = new Date(muestra.date).toISOString().split('T')[0];
            if (!porFecha[fecha]) porFecha[fecha] = { eto: [], temp: [], rad: [] };
            Object.keys(muestra).forEach(key => {
                if (key === 'date' || key === 'station') return;
                const v = parseFloat(muestra[key]);
                if (isNaN(v)) return;
                if (etoIds.has(key)) porFecha[fecha].eto.push(v);
                if (tempIds.has(key)) porFecha[fecha].temp.push(v);
                if (radIds.has(key)) porFecha[fecha].rad.push(v);
            });
        });

        const resultados = [];
        Object.keys(porFecha).sort().forEach(fecha => {
            const d = porFecha[fecha];
            const etoTotal = d.eto.length > 0 ? d.eto.reduce((s, v) => s + v, 0) : null;
            const tempMax = d.temp.length > 0 ? Math.max(...d.temp) : null;
            const tempMin = d.temp.length > 0 ? Math.min(...d.temp) : null;
            const tempMedia = d.temp.length > 0 ? d.temp.reduce((s, v) => s + v, 0) / d.temp.length : null;
            const radTotal = d.rad.length > 0 ? d.rad.reduce((s, v) => s + v, 0) : null;

            if (etoTotal !== null || tempMax !== null || radTotal !== null) {
                resultados.push({
                    fecha,
                    evapotranspiracion: etoTotal !== null ? Math.round(etoTotal * 1000) / 1000 : null,
                    temperatura: tempMedia !== null ? Math.round(tempMedia * 10) / 10 : null,
                    temp_max: tempMax !== null ? Math.round(tempMax * 10) / 10 : null,
                    temp_min: tempMin !== null ? Math.round(tempMin * 10) / 10 : null,
                    humedad: null,
                    precipitaciones: 0,
                    radiacion: radTotal !== null ? Math.round(radTotal * 100) / 100 : null,
                });
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
           //     console.log(`Estación ${estacionCodigo} no tiene módulo de evapotranspiración`);
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
        if (!data || !Array.isArray(data)) {
            return null;
        }

        const resultados = [];
        
        data.forEach(muestra => {
            try {
                if (!muestra.date || !muestra.station) {
                    return;
                }

                const fecha = new Date(muestra.date);
                
                // Extraer evapotranspiración directa si está disponible
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
                    }
                }

                if (evapotranspiracion !== null && !isNaN(evapotranspiracion)) {
                    resultados.push({
                        fecha: fecha.toISOString().split('T')[0],
                        evapotranspiracion: Math.max(0, evapotranspiracion), // Asegurar valor positivo
                        temperatura: null,
                        humedad: null,
                        precipitaciones: 0
                    });
                }
            } catch (error) {
                console.error('Error procesando muestra:', error);
            }
        });

        return resultados;
    }
}

module.exports = new OmixomService();