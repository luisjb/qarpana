// src/utils/debugInsercionCambiosDiarios.js
const pool = require('../db');
const omixomService = require('./omixomService');

const sanitizeNumeric = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numValue = parseFloat(value);
    return isNaN(numValue) ? null : numValue;
};

async function debugInsercionCompleta() {
    const client = await pool.connect();
    try {
        console.log('=== DEBUG INSERCIÓN CAMBIOS DIARIOS ===\n');

        // 1. Obtener un campo con estación
        const { rows: campos } = await client.query(`
            SELECT c.id, c.nombre_campo, c.estacion_id
            FROM campos c
            WHERE c.estacion_id IS NOT NULL AND c.estacion_id != ''
            LIMIT 1
        `);

        if (campos.length === 0) {
            console.log('❌ No hay campos con estaciones');
            return;
        }

        const campo = campos[0];
        console.log(`🔍 Campo: ${campo.nombre_campo} - Estación: ${campo.estacion_id}`);

        // 2. Obtener un lote activo de ese campo
        const { rows: lotes } = await client.query(`
            SELECT id, nombre_lote, cultivo_id, fecha_siembra
            FROM lotes 
            WHERE campo_id = $1 AND activo = true
            LIMIT 1
        `, [campo.id]);

        if (lotes.length === 0) {
            console.log('❌ No hay lotes activos');
            return;
        }

        const lote = lotes[0];
        console.log(`🌱 Lote: ${lote.nombre_lote} (ID: ${lote.id})`);

        // 3. Consultar datos de estación
        console.log('\n📡 Consultando datos de estación...');
        const datosEstacion = await omixomService.obtenerUltimoDatoEstacion(campo.estacion_id);
        
        if (!datosEstacion || datosEstacion.length === 0) {
            console.log('❌ No se obtuvieron datos de estación');
            return;
        }

        console.log('✅ Datos de estación obtenidos:');
        console.log(JSON.stringify(datosEstacion[0], null, 2));

        // 4. Simular creación de tabla temporal
        console.log('\n📝 Creando tabla temporal...');
        await client.query(`
            DROP TABLE IF EXISTS temp_datos_estacion_debug;
            CREATE TEMP TABLE temp_datos_estacion_debug (
                campo_id BIGINT,
                fecha DATE,
                evapotranspiracion NUMERIC,
                temperatura NUMERIC,
                humedad NUMERIC,
                precipitaciones NUMERIC,
                PRIMARY KEY (campo_id, fecha)
            )
        `);

        // 5. Insertar datos en tabla temporal
        console.log('💾 Insertando en tabla temporal...');
        const dato = datosEstacion[0];
        await client.query(`
            INSERT INTO temp_datos_estacion_debug 
            (campo_id, fecha, evapotranspiracion, temperatura, humedad, precipitaciones)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            campo.id,
            dato.fecha,
            sanitizeNumeric(dato.evapotranspiracion),
            sanitizeNumeric(dato.temperatura),
            sanitizeNumeric(dato.humedad),
            sanitizeNumeric(dato.precipitaciones)
        ]);

        // 6. Verificar datos en tabla temporal
        const { rows: datosTemp } = await client.query(`
            SELECT * FROM temp_datos_estacion_debug WHERE campo_id = $1
        `, [campo.id]);
        console.log('📋 Datos en tabla temporal:', datosTemp[0]);

        // 7. Simular aplicarDatosEstacionALote
        console.log('\n🎯 Simulando aplicarDatosEstacionALote...');
        const hoy = new Date();
        const fechaHoy = hoy.toISOString().split('T')[0];

        let cambioDiario = {
            lote_id: lote.id,
            fecha_cambio: hoy,
            evapotranspiracion: null,
            temperatura: null,
            humedad: null,
            precipitaciones: null
        };

        console.log('🔍 Buscando datos para lote...');
        const { rows: datosParaLote } = await client.query(`
            SELECT tde.evapotranspiracion, tde.temperatura, tde.humedad, tde.precipitaciones
            FROM temp_datos_estacion_debug tde
            JOIN lotes l ON l.campo_id = tde.campo_id
            WHERE l.id = $1 AND tde.fecha = $2
        `, [lote.id, fechaHoy]);

        console.log(`📊 Datos encontrados para lote ${lote.id}:`, datosParaLote);

        if (datosParaLote.length > 0) {
            const datos = datosParaLote[0];
            
            console.log('\n📈 Aplicando datos al cambio diario:');
            if (datos.evapotranspiracion !== null && !isNaN(datos.evapotranspiracion)) {
                cambioDiario.evapotranspiracion = parseFloat(datos.evapotranspiracion);
                console.log(`✅ Evapotranspiración: ${cambioDiario.evapotranspiracion}`);
            } else {
                console.log(`❌ Evapotranspiración inválida: ${datos.evapotranspiracion}`);
            }
            
            if (datos.temperatura !== null && !isNaN(datos.temperatura)) {
                cambioDiario.temperatura = parseFloat(datos.temperatura);
                console.log(`✅ Temperatura: ${cambioDiario.temperatura}`);
            }
            
            if (datos.humedad !== null && !isNaN(datos.humedad)) {
                cambioDiario.humedad = parseFloat(datos.humedad);
                console.log(`✅ Humedad: ${cambioDiario.humedad}`);
            }
            
            if (datos.precipitaciones !== null && !isNaN(datos.precipitaciones)) {
                cambioDiario.precipitaciones = parseFloat(datos.precipitaciones);
                console.log(`✅ Precipitaciones: ${cambioDiario.precipitaciones}`);
            }
        } else {
            console.log(`❌ No se encontraron datos para el lote ${lote.id}`);
            
            // Debug adicional: verificar por qué no se encuentra
            console.log('\n🔍 Debug adicional:');
            console.log(`   Lote ID: ${lote.id}`);
            console.log(`   Campo ID del lote: ${lote.campo_id}`);
            console.log(`   Campo ID en tabla temporal: ${campo.id}`);
            console.log(`   Fecha buscada: ${fechaHoy}`);
            console.log(`   Fecha en tabla temporal: ${dato.fecha}`);
            
            // Verificar la relación lote-campo
            const { rows: relacionLoteCampo } = await client.query(`
                SELECT l.id as lote_id, l.campo_id, l.nombre_lote, c.nombre_campo
                FROM lotes l
                JOIN campos c ON l.campo_id = c.id
                WHERE l.id = $1
            `, [lote.id]);
            console.log('   Relación lote-campo:', relacionLoteCampo[0]);
        }

        // 8. Intentar insertar en cambios_diarios
        console.log('\n💾 Intentando insertar en cambios_diarios...');
        
        // Calcular días desde siembra
        const fechaSiembra = new Date(lote.fecha_siembra);
        const diasDesdeSiembra = Math.floor((hoy - fechaSiembra) / (1000 * 60 * 60 * 24));
        
        const valoresParaInsertar = [
            cambioDiario.lote_id,
            cambioDiario.fecha_cambio,
            diasDesdeSiembra,
            sanitizeNumeric(cambioDiario.evapotranspiracion),
            sanitizeNumeric(cambioDiario.temperatura),
            sanitizeNumeric(cambioDiario.humedad),
            sanitizeNumeric(cambioDiario.precipitaciones)
        ];

        console.log('📊 Valores a insertar:', valoresParaInsertar);

        const query = `
            INSERT INTO cambios_diarios (
                lote_id,
                fecha_cambio,
                dias,
                evapotranspiracion,
                temperatura,
                humedad,
                precipitaciones
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (lote_id, fecha_cambio)
            DO UPDATE SET
                evapotranspiracion = COALESCE(EXCLUDED.evapotranspiracion, cambios_diarios.evapotranspiracion),
                temperatura = COALESCE(EXCLUDED.temperatura, cambios_diarios.temperatura),
                humedad = COALESCE(EXCLUDED.humedad, cambios_diarios.humedad),
                precipitaciones = COALESCE(EXCLUDED.precipitaciones, cambios_diarios.precipitaciones)
            RETURNING id, lote_id, fecha_cambio, evapotranspiracion, temperatura, humedad, precipitaciones
        `;

        console.log('📝 Query a ejecutar:');
        console.log(query);

        const resultado = await client.query(query, valoresParaInsertar);
        
        console.log('\n✅ Resultado de la inserción:');
        console.log(resultado.rows[0]);

        // 9. Verificar el resultado final
        console.log('\n🔍 Verificación final en cambios_diarios...');
        const { rows: verificacion } = await client.query(`
            SELECT id, lote_id, fecha_cambio, evapotranspiracion, temperatura, humedad, precipitaciones, dias
            FROM cambios_diarios
            WHERE lote_id = $1 AND fecha_cambio = $2
        `, [lote.id, fechaHoy]);

        if (verificacion.length > 0) {
            console.log('✅ Registro encontrado en cambios_diarios:');
            console.log(verificacion[0]);
        } else {
            console.log('❌ No se encontró el registro en cambios_diarios');
        }

    } catch (error) {
        console.error('❌ Error en debug:', error);
    } finally {
        client.release();
    }
}

async function verificarEstructuraCambiosDiarios() {
    const client = await pool.connect();
    try {
        console.log('\n=== VERIFICACIÓN ESTRUCTURA CAMBIOS_DIARIOS ===\n');

        // Verificar estructura de la tabla
        const { rows: columnas } = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'cambios_diarios'
            ORDER BY ordinal_position
        `);

        console.log('Estructura de cambios_diarios:');
        columnas.forEach(col => {
            console.log(`   ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}) default: ${col.column_default}`);
        });

        // Verificar constraints
        const { rows: constraints } = await client.query(`
            SELECT constraint_name, constraint_type
            FROM information_schema.table_constraints
            WHERE table_name = 'cambios_diarios'
        `);

        console.log('\nConstraints:');
        constraints.forEach(c => {
            console.log(`   ${c.constraint_name}: ${c.constraint_type}`);
        });

        // Verificar últimos registros
        const { rows: ultimos } = await client.query(`
            SELECT id, lote_id, fecha_cambio, evapotranspiracion, temperatura, precipitaciones
            FROM cambios_diarios
            ORDER BY fecha_cambio DESC, id DESC
            LIMIT 5
        `);

        console.log('\nÚltimos 5 registros:');
        ultimos.forEach(reg => {
            console.log(`   ID: ${reg.id}, Lote: ${reg.lote_id}, Fecha: ${reg.fecha_cambio}, ETP: ${reg.evapotranspiracion}`);
        });

    } catch (error) {
        console.error('Error verificando estructura:', error);
    } finally {
        client.release();
    }
}

async function main() {
    await debugInsercionCompleta();
    await verificarEstructuraCambiosDiarios();
}

if (require.main === module) {
    main().then(() => process.exit(0));
}

module.exports = { debugInsercionCompleta, verificarEstructuraCambiosDiarios };