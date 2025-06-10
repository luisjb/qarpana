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
                //console.log(`Estación ${estacionCodigo} no tiene módulo de evapotranspiración`);
                return null;
            }

            // CORREGIDO: Configurar rango desde ayer hasta hoy (últimas 24 horas)
            const hoy = new Date();
            const ayer = new Date(hoy);
            ayer.setDate(hoy.getDate() - 1);
            
            // Formatear fechas en horario argentino (UTC-3)
            // Desde ayer a las 00:00:00 hasta hoy a las 23:59:59
            const fechaInicio = ayer.toISOString().split('T')[0] + 'T00:00:01-03:00';
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

            /*console.log(`Consultando datos acumulativos para estación ${estacionCodigo}`);
            console.log(`Rango (últimas 24h): ${fechaInicio} a ${fechaFin}`);
            console.log(`Módulos: ${modulosInfo.modulosEvapotranspiracion}`);
*/
            const response = await axios.post(`${this.BASE_URL}/private_samples_range`, requestBody, {
                headers: {
                    'Authorization': `Token ${this.API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            // CORREGIDO: Procesar para la fecha de HOY (no ayer)
            return this.procesarDatosRangoCompleto(response.data, modulosInfo.modulosEvapotranspiracion, hoy);
        } catch (error) {
            console.error(`Error consultando estación ${estacionCodigo}:`, error.message);
            if (error.response) {
              /*  console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);*/
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
               // console.log(`No se encontró configuración para estación ${estacionCodigo}`);
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

           /* console.log(`Estación ${estacionCodigo} - Módulos de evapotranspiración encontrados:`, 
                modulosEvapotranspiracion.map(m => `${m.id}: ${m.type}`));*/

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
                  /*  console.log(`Estación ${estacionCodigo} - Usando módulos alternativos (temp + humedad):`, 
                        modulosAlternativos.map(m => `${m.id}: ${m.type}`));*/
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

    procesarDatosRangoCompleto(data, moduloIds, fechaObjetivo) {
        if (!data || !Array.isArray(data)) {
           // console.log('No se recibieron datos de estaciones o formato incorrecto');
            return null;
        }

      //  console.log(`Procesando ${data.length} muestras para acumular en fecha ${fechaObjetivo.toISOString().split('T')[0]}`);

        // Acumular TODOS los valores del rango (últimas 24 horas)
        let valoresAcumulados = [];
        let estacionProcesada = null;
        
        data.forEach(muestra => {
            try {
                if (!muestra.date || !muestra.station) {
                    return;
                }

                const estacionId = muestra.station;
                estacionProcesada = estacionId;

                // Extraer valores de evapotranspiración de todos los módulos
                moduloIds.forEach(moduloId => {
                    const valor = muestra[moduloId.toString()];
                    if (valor !== undefined && valor !== null && !isNaN(valor)) {
                        valoresAcumulados.push(parseFloat(valor));
                    }
                });

            } catch (error) {
                console.error('Error procesando muestra individual:', error);
            }
        });

        // Sumar todos los valores de las últimas 24 horas
        if (valoresAcumulados.length > 0) {
            const sumaTotal = valoresAcumulados.reduce((sum, val) => sum + val, 0);
            const fechaObjetivoStr = fechaObjetivo.toISOString().split('T')[0];
            
           /* console.log(`Estación ${estacionProcesada} - Acumulado para ${fechaObjetivoStr}:`);
            console.log(`  Total de muestras procesadas: ${valoresAcumulados.length}`);
            console.log(`  Valores individuales (primeros 10): ${valoresAcumulados.slice(0, 10).join(', ')}${valoresAcumulados.length > 10 ? '...' : ''}`);*/
            console.log(`  Suma total acumulada: ${sumaTotal} mm/día`);

            const resultado = [{
                fecha: fechaObjetivoStr,
                evapotranspiracion: Math.round(sumaTotal * 1000) / 1000, // Redondear a 3 decimales
                temperatura: null, // Se puede agregar si está disponible
                humedad: null,     // Se puede agregar si está disponible
                precipitaciones: 0, // Se puede agregar si está disponible
                muestras_procesadas: valoresAcumulados.length,
                rango_procesado: `${data.length} muestras de últimas 24h`
            }];

           // console.log(`✅ Resultado final: ${resultado[0].evapotranspiracion} mm para ${fechaObjetivoStr}`);
            return resultado;
        }

       // console.log('❌ No se encontraron valores válidos para procesar');
        return null;
    }

    // Método para obtener datos de un rango de días específico
    async obtenerDatosEstacionRango(estacionCodigo, diasAtras = 1) {
        try {
            const modulosInfo = await this.obtenerModulosEstacion(estacionCodigo);
            
            if (!modulosInfo.tieneEvapotranspiracion) {
            //    console.log(`Estación ${estacionCodigo} no tiene módulo de evapotranspiración`);
                return null;
            }

            const hoy = new Date();
            const fechaInicio = new Date(hoy);
            fechaInicio.setDate(hoy.getDate() - diasAtras);
            
            // Formatear fechas en horario argentino (UTC-3)
            const fechaInicioStr = fechaInicio.toISOString().split('T')[0] + 'T00:00:00-03:00';
            const fechaFinStr = hoy.toISOString().split('T')[0] + 'T23:59:59-03:00';

            const requestBody = {
                stations: {
                    [estacionCodigo]: {
                        date_from: fechaInicioStr,
                        date_to: fechaFinStr,
                        modules: modulosInfo.modulosEvapotranspiracion
                    }
                }
            };

           /* console.log(`Consultando ${diasAtras} días de datos para estación ${estacionCodigo}`);
            console.log(`Rango: ${fechaInicioStr} a ${fechaFinStr}`);*/

            const response = await axios.post(`${this.BASE_URL}/private_samples_range`, requestBody, {
                headers: {
                    'Authorization': `Token ${this.API_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            return this.procesarDatosRangoMultipleDias(response.data, modulosInfo.modulosEvapotranspiracion, diasAtras);
        } catch (error) {
            console.error(`Error consultando rango de datos para estación ${estacionCodigo}:`, error.message);
            return null;
        }
    }

    procesarDatosRangoMultipleDias(data, moduloIds, diasAtras) {
        if (!data || !Array.isArray(data)) {
        //    console.log('No se recibieron datos de estaciones o formato incorrecto');
            return null;
        }

      //  console.log(`Procesando ${data.length} muestras para ${diasAtras} días`);

        // Agrupar datos por fecha
        const datosPorFecha = {};
        
        data.forEach(muestra => {
            try {
                if (!muestra.date || !muestra.station) return;

                const fechaMuestra = new Date(muestra.date);
                const fechaStr = fechaMuestra.toISOString().split('T')[0];
                
                if (!datosPorFecha[fechaStr]) {
                    datosPorFecha[fechaStr] = [];
                }

                // Extraer valores de evapotranspiración
                moduloIds.forEach(moduloId => {
                    const valor = muestra[moduloId.toString()];
                    if (valor !== undefined && valor !== null && !isNaN(valor)) {
                        datosPorFecha[fechaStr].push(parseFloat(valor));
                    }
                });

            } catch (error) {
                console.error('Error procesando muestra:', error);
            }
        });

        // Sumar valores por día
        const resultados = [];
        Object.keys(datosPorFecha).sort().forEach(fecha => {
            const valores = datosPorFecha[fecha];
            const sumaETP = valores.reduce((sum, val) => sum + val, 0);
            
          //  console.log(`Fecha ${fecha}: ${valores.length} muestras, suma = ${sumaETP} mm/día`);
            
            if (sumaETP > 0) {
                resultados.push({
                    fecha: fecha,
                    evapotranspiracion: Math.round(sumaETP * 1000) / 1000,
                    temperatura: null,
                    humedad: null,
                    precipitaciones: 0,
                    muestras_procesadas: valores.length
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