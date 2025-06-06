// src/utils/debugAPIRequest.js
const axios = require('axios');

class DebugOMIXOMService {
    constructor() {
        this.API_TOKEN = 'fa31ec35bbe0e6684f75e8cc2ebe38dd999f7356';
        this.BASE_URL = 'https://new.omixom.com/api/v2';
    }

    async debugAPIRequest(estacionCodigo, moduloId) {
        console.log('=== DEBUG API REQUEST ===\n');
        
        // Preparar el request body
        const requestBody = {
            stations: {
                [estacionCodigo]: {
                    modules: [moduloId]
                }
            }
        };

        console.log('🔧 Configuración:');
        console.log(`   API Token: ${this.API_TOKEN.substring(0, 10)}...`);
        console.log(`   Base URL: ${this.BASE_URL}`);
        console.log(`   Endpoint: ${this.BASE_URL}/private_last_measure`);

        console.log('\n📝 Request Body:');
        console.log(JSON.stringify(requestBody, null, 2));

        console.log('\n📡 Headers:');
        const headers = {
            'Authorization': `Token ${this.API_TOKEN}`,
            'Content-Type': 'application/json'
        };
        console.log(JSON.stringify(headers, null, 2));

        try {
            console.log('\n🚀 Realizando petición...');
            
            const response = await axios.post(
                `${this.BASE_URL}/private_last_measure`, 
                requestBody, 
                { headers }
            );

            console.log('\n✅ Respuesta exitosa:');
            console.log(`   Status: ${response.status}`);
            console.log(`   Status Text: ${response.statusText}`);
            
            console.log('\n📦 Response Headers:');
            console.log(JSON.stringify(response.headers, null, 2));

            console.log('\n📄 Response Data:');
            console.log(JSON.stringify(response.data, null, 2));

            // Analizar la estructura de datos
            if (response.data && response.data.stations) {
                console.log('\n🔍 Análisis de datos:');
                Object.keys(response.data.stations).forEach(stationId => {
                    const stationData = response.data.stations[stationId];
                    console.log(`   Estación ${stationId}:`);
                    
                    if (stationData.samples && Array.isArray(stationData.samples)) {
                        console.log(`     Muestras: ${stationData.samples.length}`);
                        
                        if (stationData.samples.length > 0) {
                            const sample = stationData.samples[0];
                            console.log(`     Última muestra:`, sample);
                            
                            // Buscar campos de evapotranspiración
                            const etpFields = Object.keys(sample).filter(key => 
                                key.toLowerCase().includes('evapotranspiracion') ||
                                key.toLowerCase().includes('evapotranspiración') ||
                                key.toLowerCase().includes('etp') ||
                                key.toLowerCase().includes('eto')
                            );
                            
                            console.log(`     Campos ETP encontrados: ${etpFields.join(', ')}`);
                            etpFields.forEach(field => {
                                console.log(`       ${field}: ${sample[field]}`);
                            });
                        }
                    } else {
                        console.log(`     ❌ No hay muestras o formato incorrecto:`, stationData);
                    }
                });
            } else {
                console.log('\n❌ Estructura de respuesta inesperada');
            }

            return response.data;

        } catch (error) {
            console.log('\n❌ Error en la petición:');
            
            if (error.response) {
                console.log(`   Status: ${error.response.status}`);
                console.log(`   Status Text: ${error.response.statusText}`);
                console.log(`   Headers:`, error.response.headers);
                console.log(`   Data:`, error.response.data);
            } else if (error.request) {
                console.log(`   No response received`);
                console.log(`   Request:`, error.request);
            } else {
                console.log(`   Error setting up request:`, error.message);
            }
            
            console.log(`   Full error:`, error);
            throw error;
        }
    }

    async compararEndpoints(estacionCodigo, moduloId) {
        console.log('\n=== COMPARANDO ENDPOINTS ===\n');

        // Test 1: private_last_measure
        console.log('🔬 Test 1: private_last_measure');
        try {
            const result1 = await this.debugAPIRequest(estacionCodigo, moduloId);
            console.log('✅ private_last_measure exitoso');
        } catch (error) {
            console.log('❌ private_last_measure falló:', error.message);
        }

        // Test 2: private_samples_range (método anterior)
        console.log('\n🔬 Test 2: private_samples_range (método anterior)');
        const hoy = new Date();
        const ayer = new Date(hoy);
        ayer.setDate(hoy.getDate() - 1);
        
        const fechaInicio = ayer.toISOString().split('T')[0] + 'T00:00:00Z';
        const fechaFin = hoy.toISOString().split('T')[0] + 'T23:59:59Z';

        const requestBody2 = {
            stations: {
                [estacionCodigo]: {
                    date_from: fechaInicio,
                    date_to: fechaFin,
                    modules: [moduloId]
                }
            }
        };

        console.log('📝 Request Body para samples_range:');
        console.log(JSON.stringify(requestBody2, null, 2));

        try {
            const response2 = await axios.post(
                `${this.BASE_URL}/private_samples_range`, 
                requestBody2, 
                { 
                    headers: {
                        'Authorization': `Token ${this.API_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ private_samples_range exitoso');
            console.log('📄 Response Data:');
            console.log(JSON.stringify(response2.data, null, 2));

        } catch (error) {
            console.log('❌ private_samples_range falló:', error.message);
            if (error.response) {
                console.log(`   Status: ${error.response.status}`);
                console.log(`   Data:`, error.response.data);
            }
        }

        // Test 3: Sin módulos específicos
        console.log('\n🔬 Test 3: private_last_measure sin módulos específicos');
        const requestBody3 = {
            stations: {
                [estacionCodigo]: {
                    modules: []
                }
            }
        };

        try {
            const response3 = await axios.post(
                `${this.BASE_URL}/private_last_measure`, 
                requestBody3, 
                { 
                    headers: {
                        'Authorization': `Token ${this.API_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ private_last_measure sin módulos exitoso');
            console.log('📄 Response Data (primeras 2 muestras):');
            
            if (response3.data && response3.data.stations) {
                Object.keys(response3.data.stations).forEach(stationId => {
                    const stationData = response3.data.stations[stationId];
                    if (stationData.samples && stationData.samples.length > 0) {
                        console.log(`Muestras de estación ${stationId}:`, stationData.samples.slice(0, 2));
                    }
                });
            }

        } catch (error) {
            console.log('❌ private_last_measure sin módulos falló:', error.message);
        }
    }
}

// Script ejecutable
async function main() {
    const debugService = new DebugOMIXOMService();
    
    // Usar estación 30107 y módulo 15525 que aparecen en tu diagnóstico
    const estacionCodigo = '30107';
    const moduloId = 15525;
    
    try {
        await debugService.compararEndpoints(estacionCodigo, moduloId);
    } catch (error) {
        console.error('Error en debug:', error);
    }
}

if (require.main === module) {
    main().then(() => process.exit(0));
}

module.exports = DebugOMIXOMService;