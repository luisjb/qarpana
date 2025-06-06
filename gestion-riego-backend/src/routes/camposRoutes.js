const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../db');

// Obtener todos los campos (para admin)
router.get('/all', verifyToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT c.id, c.nombre_campo, c.ubicacion, u.nombre_usuario
            FROM campos c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
        `);
        res.json(rows);
    } catch (err) {
        console.error('Error al obtener campos:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

// Obtener campos de un usuario específico
router.get('/user/:userId', verifyToken, isAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM campos WHERE usuario_id = $1', [req.params.userId]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener campos del usuario autenticado
router.get('/', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        let query;
        let values = [];

        console.log('=== INICIO GET CAMPOS ===');
        console.log('User data from token:', req.user);

        if (req.user.role?.toLowerCase() === 'admin') {
            // Consulta para administradores - EXPLÍCITAMENTE seleccionar todas las columnas
            query = `
                SELECT 
                    c.id,
                    c.usuario_id,
                    c.nombre_campo,
                    c.ubicacion,
                    c.estacion_id,
                    c.usuarios_ids,
                    u.nombre_usuario,
                    e.titulo AS estacion_titulo,
                    e.codigo AS estacion_codigo
                FROM 
                    campos c
                LEFT JOIN 
                    usuarios u ON c.usuario_id = u.id
                LEFT JOIN 
                    estaciones_meteorologicas e ON TRIM(CAST(c.estacion_id AS TEXT)) = TRIM(CAST(e.codigo AS TEXT))
                ORDER BY 
                    c.nombre_campo
            `;
        } else {
            // Consulta para usuarios normales - EXPLÍCITAMENTE seleccionar todas las columnas
            query = `
                SELECT 
                    c.id,
                    c.usuario_id,
                    c.nombre_campo,
                    c.ubicacion,
                    c.estacion_id,
                    c.usuarios_ids,
                    u.nombre_usuario,
                    e.titulo AS estacion_titulo,
                    e.codigo AS estacion_codigo
                FROM 
                    campos c
                LEFT JOIN 
                    usuarios u ON c.usuario_id = u.id
                LEFT JOIN 
                    estaciones_meteorologicas e ON TRIM(CAST(c.estacion_id AS TEXT)) = TRIM(CAST(e.codigo AS TEXT))
                WHERE 
                    c.usuario_id = $1
                ORDER BY 
                    c.nombre_campo
            `;
            values = [req.user.userId];
        }

        console.log('Query SQL:', query);
        console.log('Values:', values);
        
        const { rows } = await client.query(query, values);
        
        console.log('=== DATOS BRUTOS DE LA DB ===');
        console.log('Cantidad de campos encontrados:', rows.length);
        
        // Log específico para cada campo
        rows.forEach(row => {
            console.log(`\nCampo ID ${row.id} - ${row.nombre_campo}:`);
            console.log('  - usuario_id:', row.usuario_id);
            console.log('  - estacion_id:', row.estacion_id);
            console.log('  - usuarios_ids:', row.usuarios_ids);
            console.log('  - estacion_titulo:', row.estacion_titulo);
        });
        console.log('==============================');
        
        // Procesar los resultados asegurando que todos los campos estén presentes
        const processed = rows.map(row => {
            const campo = {
                id: row.id,
                usuario_id: row.usuario_id,
                nombre_campo: row.nombre_campo,
                ubicacion: row.ubicacion,
                estacion_id: row.estacion_id || '',
                usuarios_ids: row.usuarios_ids || (row.usuario_id ? [row.usuario_id] : []),
                nombre_usuario: row.nombre_usuario,
                estacion_titulo: row.estacion_titulo
            };
            
            console.log(`\nCampo procesado ID ${campo.id}:`);
            console.log('  - usuario_id:', campo.usuario_id);
            console.log('  - estacion_id:', campo.estacion_id);
            console.log('  - usuarios_ids:', campo.usuarios_ids);
            
            return campo;
        });
        
        console.log('=== DATOS FINALES A ENVIAR ===');
        console.log('Campos procesados:', processed.length);
        console.log('================================');
        
        res.json(processed);
    } catch (err) {
        console.error('Error al obtener campos:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    } finally {
        client.release();
    }
});

router.get('/all', verifyToken, isAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT c.*, u.nombre_usuario 
            FROM campos c 
            LEFT JOIN usuarios u ON c.usuario_id = u.id
        `);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Crear un nuevo campo (admin puede asignar a cualquier usuario, usuario normal solo a sí mismo)
router.post('/', verifyToken, async (req, res) => {
    const { nombre_campo, ubicacion, usuarios_ids, estacion_id } = req.body;
    
    console.log('Creando campo con datos:', { nombre_campo, ubicacion, usuarios_ids, estacion_id });
    
    try {
        // Si usuarios_ids es un array, tomamos el primer elemento para usuario_id
        const usuario_id = Array.isArray(usuarios_ids) && usuarios_ids.length > 0 
            ? usuarios_ids[0] 
            : null;
        
        // Limpiar y validar estacion_id
        const estacion_id_limpio = estacion_id ? String(estacion_id).trim() : null;
        
        console.log('Estación ID limpio a guardar:', estacion_id_limpio);
        
        // Insertar el campo
        const { rows } = await pool.query(
            'INSERT INTO campos (usuario_id, nombre_campo, ubicacion, estacion_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [usuario_id, nombre_campo, ubicacion, estacion_id_limpio]
        );
        
        // Log del resultado
        console.log('Campo creado:', rows[0]);
        
        // Verificar si la estación existe
        if (estacion_id_limpio) {
            const estacionCheck = await pool.query(
                'SELECT codigo, titulo FROM estaciones_meteorologicas WHERE TRIM(codigo) = $1',
                [estacion_id_limpio]
            );
            console.log('Verificación de estación:', estacionCheck.rows);
        }
        
        // Añadir datos de usuario para la respuesta
        const userResult = await pool.query(
            'SELECT id, nombre_usuario FROM usuarios WHERE id = $1',
            [usuario_id]
        );
        
        const campoWithUsers = {
            ...rows[0],
            usuarios_ids: usuario_id ? [usuario_id] : [],
            usuarios_nombres: userResult.rows.length > 0 ? userResult.rows[0].nombre_usuario : ''
        };
        
        res.status(201).json(campoWithUsers);
    } catch (err) {
        console.error('Error al crear campo:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Actualizar un campo
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre_campo, ubicacion, usuarios_ids, estacion_id } = req.body;
    
    console.log('Actualizando campo con datos:', { id, nombre_campo, ubicacion, usuarios_ids, estacion_id });
    
    try {
        // Si usuarios_ids es un array, tomamos el primer elemento para usuario_id
        const usuario_id = Array.isArray(usuarios_ids) && usuarios_ids.length > 0 
            ? usuarios_ids[0] 
            : null;
        
        // Limpiar y validar estacion_id
        const estacion_id_limpio = estacion_id ? String(estacion_id).trim() : null;
        
        console.log('Estación ID limpio a actualizar:', estacion_id_limpio);
        
        // Verificar si la estación existe antes de actualizar
        if (estacion_id_limpio) {
            const estacionCheck = await pool.query(
                'SELECT codigo, titulo FROM estaciones_meteorologicas WHERE TRIM(codigo) = $1',
                [estacion_id_limpio]
            );
            console.log('Verificación de estación antes de actualizar:', estacionCheck.rows);
        }
        
        // Actualizar el campo
        const { rows } = await pool.query(
            'UPDATE campos SET nombre_campo = $1, ubicacion = $2, usuario_id = $3, estacion_id = $4 WHERE id = $5 RETURNING *',
            [nombre_campo, ubicacion, usuario_id, estacion_id_limpio, id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Campo no encontrado' });
        }
        
        // Log del resultado
        console.log('Campo actualizado:', rows[0]);
        
        // Verificar la asociación después de actualizar
        const verificacion = await pool.query(`
            SELECT 
                c.*,
                e.titulo as estacion_titulo,
                e.codigo as estacion_codigo
            FROM campos c
            LEFT JOIN estaciones_meteorologicas e ON TRIM(CAST(c.estacion_id AS TEXT)) = TRIM(CAST(e.codigo AS TEXT))
            WHERE c.id = $1
        `, [id]);
        
        console.log('Verificación después de actualizar:', verificacion.rows[0]);
        
        // Añadir datos de usuario para la respuesta
        const userResult = await pool.query(
            'SELECT id, nombre_usuario FROM usuarios WHERE id = $1',
            [usuario_id]
        );
        
        const campoWithUsers = {
            ...rows[0],
            usuarios_ids: usuario_id ? [usuario_id] : [],
            usuarios_nombres: userResult.rows.length > 0 ? userResult.rows[0].nombre_usuario : '',
            estacion_titulo: verificacion.rows[0]?.estacion_titulo || null
        };
        
        res.json(campoWithUsers);
    } catch (err) {
        console.error('Error al actualizar campo:', err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Eliminar un campo
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;

        // Obtener los lotes asociados al campo
        const lotes = await client.query('SELECT id FROM lotes WHERE campo_id = $1', [id]);

        // Eliminar registros dependientes para cada lote
        for (const lote of lotes.rows) {
            await client.query('DELETE FROM pronostico WHERE lote_id = $1', [lote.id]);
            await client.query('DELETE FROM agua_util_inicial WHERE lote_id = $1', [lote.id]);
            await client.query('DELETE FROM cambios_diarios WHERE lote_id = $1', [lote.id]);
            await client.query('DELETE FROM estado_fenologico WHERE lote_id = $1', [lote.id]);
        }

        // Eliminar los lotes del campo
        await client.query('DELETE FROM lotes WHERE campo_id = $1', [id]);
        
        // Finalmente eliminar el campo
        const result = await client.query('DELETE FROM campos WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Campo no encontrado' });
        }

        await client.query('COMMIT');
        res.json({ message: 'Campo eliminado con éxito' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar campo:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

// Migrar datos existentes de usuario_id a usuarios_ids
router.post('/migrate-users', verifyToken, isAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Actualizar todos los campos que tienen usuario_id pero no usuarios_ids
        await client.query(`
            UPDATE campos 
            SET usuarios_ids = ARRAY[usuario_id]
            WHERE usuario_id IS NOT NULL AND (usuarios_ids IS NULL OR array_length(usuarios_ids, 1) IS NULL)
        `);
        
        await client.query('COMMIT');
        res.json({ message: 'Migración completada con éxito' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error en la migración:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
    }
});

module.exports = router;