// src/utils/debugEvapotranspiracion.js
const pool = require('../db');
const omixomService = require('./omixomService');

async function debugEvapotranspiracion() {
    const client = await pool.connect();
    try {
        console.log('=== DIAGNÓSTICO DE EVAPOTRANSPIRACIÓN ===\n');

        // 1. Verificar campos con estaciones
        console.log('1. CAMPOS CON ESTACIONES CONFIGURADAS:');
        const { rows: campos } = await client.query(`
            SELECT c.id, c.nombre_campo, c.estacion_id
            FROM campos c
            WHERE c.estacion_id IS NOT NULL AND c.estacion_id != ''
        `);

        if (campos.length === 0) {
            console.log('❌ No hay campos con estaciones configuradas');
            return;
        }

        for (const campo of campos) {
            console.log(`   Campo: ${campo.nombre_campo} - Estación: ${campo.estacion_id}`);
        }

        // 2. Verificar estaciones en BD
        console.log('\n2. ESTACIONES EN BASE DE DATOS:');
        for (const campo of campos) {
            const { rows: estacionBD } = await client.query(`
                SELECT codigo, titulo, datos_json
                FROM estaciones_meteorologicas
                WHERE codigo = $1
            `, [campo.estacion_id]);

            if (estacionBD.length === 0) {
                console.log(`❌ Estación ${campo.estacion_id} NO ENCONTRADA en BD`);
                continue;
            }

            const estacion = estacionBD[0];
            console.log(`✓ Estación ${estacion.codigo}: ${estacion.titulo}`);

            // Verificar módulos
            const datos = typeof estacion.datos_json === 'string' 
                ? JSON.parse(estacion.datos_json) 
                : estacion.datos_json;

            const modules = datos.modules || [];
            const modulosETP = modules.filter(modulo => 
                modulo.type && (
                    modulo.type.toLowerCase().includes('evapotranspiración') ||
                    modulo.type.toLowerCase().includes('evapotranspiracion') ||
                    modulo.type.toLowerCase().includes('evapotranspiration') ||
                    modulo.type.toLowerCase().includes('etp') ||
                    modulo.type.toLowerCase().includes('eto')
                )
            );

            console.log(`   Módulos totales: ${modules.length}`);
            console.log(`   Módulos ETP: ${modulosETP.length}`);
            if (modulosETP.length > 0) {
                modulosETP.forEach(m => {
                    console.log(`     - ID: ${m.id}, Tipo: ${m.type}, Título: ${m.title}`);
                });
            }
        }

        // 3. Probar consulta directa a API
        console.log('\n3. PRUEBA CONSULTA DIRECTA A API:');
        const estacionPrueba = campos[0].estacion_id;
        console.log(`Probando estación: ${estacionPrueba}`);

        const datosAPI = await omixomService.obtenerUltimoDatoEstacion(estacionPrueba);
        console.log('Respuesta de omixomService:');
        console.log(JSON.stringify(datosAPI, null, 2));

        // 4. Simular el proceso de actualización diaria
        console.log('\n4. SIMULANDO PROCESO DE ACTUALIZACIÓN:');
        
        // Crear tabla temporal como lo hace actualizacionDiaria
        await client.query(`
            CREATE TEMP TABLE IF NOT EXISTS temp_datos_estacion_debug (
                campo_id BIGINT,
                fecha DATE,
                evapotranspiracion NUMERIC,
                temperatura NUMERIC,
                humedad NUMERIC,
                precipitaciones NUMERIC
            )
        `);

        // Guardar datos en tabla temporal
        if (datosAPI && datosAPI.length > 0) {
            const campoId = campos[0].id;
            for (const dato of datosAPI) {
                console.log(`Insertando en temp: Campo ${campoId}, Fecha ${dato.fecha}, ETP ${dato.evapotranspiracion}`);
                
                await client.query(`
                    INSERT INTO temp_datos_estacion_debug 
                    (campo_id, fecha, evapotranspiracion, temperatura, humedad, precipitaciones)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    campoId,
                    dato.fecha,
                    dato.evapotranspiracion,
                    dato.temperatura,
                    dato.humedad,
                    dato.precipitaciones
                ]);
            }

            // Verificar datos en tabla temporal
            const { rows: tempData } = await client.query(`
                SELECT * FROM temp_datos_estacion_debug
            `);
            console.log('Datos en tabla temporal:');
            console.log(tempData);

            // 5. Verificar lotes que usarían esta estación
            console.log('\n5. LOTES QUE USARÍAN ESTA ESTACIÓN:');
            const { rows: lotes } = await client.query(`
                SELECT l.id, l.nombre_lote, l.activo, c.nombre_campo
                FROM lotes l
                JOIN campos c ON l.campo_id = c.id
                WHERE c.estacion_id = $1 AND l.activo = true
            `, [estacionPrueba]);

            console.log(`Lotes encontrados: ${lotes.length}`);
            lotes.forEach(lote => {
                console.log(`   Lote ${lote.id}: ${lote.nombre_lote} (${lote.nombre_campo})`);
            });

            // 6. Simular aplicación de datos a un lote
            if (lotes.length > 0) {
                console.log('\n6. SIMULANDO APLICACIÓN A LOTE:');
                const loteTest = lotes[0];
                const hoy = new Date().toISOString().split('T')[0];

                const { rows: datosParaLote } = await client.query(`
                    SELECT tde.evapotranspiracion, tde.temperatura, tde.humedad, tde.precipitaciones
                    FROM temp_datos_estacion_debug tde
                    JOIN lotes l ON l.campo_id = tde.campo_id
                    WHERE l.id = $1 AND tde.fecha = $2
                `, [loteTest.id, hoy]);

                console.log(`Datos encontrados para lote ${loteTest.id}:`, datosParaLote);

                // 7. Verificar cambios_diarios existentes
                console.log('\n7. CAMBIOS DIARIOS EXISTENTES:');
                const { rows: cambiosExistentes } = await client.query(`
                    SELECT fecha_cambio, evapotranspiracion, temperatura, humedad, precipitaciones
                    FROM cambios_diarios
                    WHERE lote_id = $1
                    ORDER BY fecha_cambio DESC
                    LIMIT 5
                `, [loteTest.id]);

                console.log('Últimos 5 cambios diarios:');
                cambiosExistentes.forEach(cambio => {
                    console.log(`   ${cambio.fecha_cambio}: ETP=${cambio.evapotranspiracion}, T=${cambio.temperatura}°C, H=${cambio.humedad}%, P=${cambio.precipitaciones}mm`);
                });
            }
        }

        // 8. Verificar la función sanitizeNumeric
        console.log('\n8. PRUEBA FUNCIÓN SANITIZE:');
        const sanitizeNumeric = (value) => {
            if (value === null || value === undefined || value === '') {
                return null;
            }
            const numValue = parseFloat(value);
            return isNaN(numValue) ? null : numValue;
        };

        const testValues = [5.2, '5.2', 0, '0', null, undefined, '', 'abc', NaN];
        testValues.forEach(val => {
            console.log(`   sanitizeNumeric(${JSON.stringify(val)}) = ${sanitizeNumeric(val)}`);
        });

    } catch (error) {
        console.error('Error en debug:', error);
    } finally {
        client.release();
    }
}

// Función para probar solo la consulta a la API
async function probarSoloAPI(codigoEstacion) {
    console.log(`=== PRUEBA SOLO API - ESTACIÓN ${codigoEstacion} ===\n`);
    
    try {
        const datos = await omixomService.obtenerUltimoDatoEstacion(codigoEstacion);
        console.log('✓ Respuesta exitosa:');
        console.log(JSON.stringify(datos, null, 2));
    } catch (error) {
        console.error('✗ Error en consulta API:', error);
    }
}

// Función para verificar la estructura de datos en la BD
async function verificarEstructuraBD() {
    const client = await pool.connect();
    try {
        console.log('=== VERIFICACIÓN ESTRUCTURA BD ===\n');

        // Verificar columnas de cambios_diarios
        const { rows: columnas } = await client.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'cambios_diarios'
            AND column_name IN ('evapotranspiracion', 'temperatura', 'humedad', 'precipitaciones')
            ORDER BY column_name
        `);

        console.log('Columnas en cambios_diarios:');
        columnas.forEach(col => {
            console.log(`   ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
        });

    } catch (error) {
        console.error('Error verificando estructura:', error);
    } finally {
        client.release();
    }
}

// Script ejecutable
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        await debugEvapotranspiracion();
    } else if (args[0] === 'api' && args[1]) {
        await probarSoloAPI(args[1]);
    } else if (args[0] === 'estructura') {
        await verificarEstructuraBD();
    } else {
        console.log('Uso:');
        console.log('  node debugEvapotranspiracion.js                 # Debug completo');
        console.log('  node debugEvapotranspiracion.js api <codigo>    # Solo probar API');
        console.log('  node debugEvapotranspiracion.js estructura      # Verificar BD');
    }
    
    process.exit(0);
}

if (require.main === module) {
    main();
}

module.exports = { debugEvapotranspiracion, probarSoloAPI, verificarEstructuraBD };