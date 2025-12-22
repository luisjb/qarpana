const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middleware/auth');
const pool = require('../db');

// Obtener todos los campos (para admin)
router.get('/all', verifyToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const query = `
            SELECT 
                c.id,
                c.usuario_id,
                c.nombre_campo,
                c.ubicacion,
                c.estacion_id,
                c.usuarios_ids,
                u.nombre_usuario,
                e.titulo AS estacion_titulo
            FROM 
                campos c
            LEFT JOIN 
                usuarios u ON c.usuario_id = u.id
            LEFT JOIN 
                estaciones_meteorologicas e ON TRIM(CAST(c.estacion_id AS TEXT)) = TRIM(CAST(e.codigo AS TEXT))
            ORDER BY 
                c.nombre_campo
        `;
        
        const { rows } = await client.query(query);
        
        const processed = rows.map(row => ({
            id: row.id,
            usuario_id: row.usuario_id,
            nombre_campo: row.nombre_campo,
            ubicacion: row.ubicacion,
            estacion_id: row.estacion_id || '',
            usuarios_ids: row.usuarios_ids || (row.usuario_id ? [row.usuario_id] : []),
            nombre_usuario: row.nombre_usuario,
            estacion_titulo: row.estacion_titulo
        }));
        
        res.json(processed);
    } catch (err) {
        console.error('Error al obtener campos:', err);
        res.status(500).json({ error: 'Error del servidor' });
    } finally {
        client.release();
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

        if (req.user.role?.toLowerCase() === 'admin') {
            // Consulta para administradores - ver todos los campos
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
            // Consulta para usuarios normales - ver solo sus campos
            // Un usuario puede ver un campo si:
            // 1. Es el usuario_id del campo (compatibilidad con versión anterior)
            // 2. Su ID está en el array usuarios_ids
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
                    c.usuario_id = $1 OR $1 = ANY(c.usuarios_ids)
                ORDER BY 
                    c.nombre_campo
            `;
            values = [req.user.userId];
        }

        const { rows } = await client.query(query, values);
        
        // Procesar los resultados asegurando que todos los campos estén presentes
        const processed = rows.map(row => ({
            id: row.id,
            usuario_id: row.usuario_id,
            nombre_campo: row.nombre_campo,
            ubicacion: row.ubicacion,
            estacion_id: row.estacion_id || '',
            usuarios_ids: row.usuarios_ids || (row.usuario_id ? [row.usuario_id] : []),
            nombre_usuario: row.nombre_usuario,
            estacion_titulo: row.estacion_titulo
        }));
        
        res.json(processed);
    } catch (err) {
        console.error('Error al obtener campos:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    } finally {
        client.release();
    }
});

// Crear un nuevo campo
router.post('/', verifyToken, async (req, res) => {
    const { nombre_campo, ubicacion, usuarios_ids, estacion_id } = req.body;
    
    try {
        // Determinar usuario_id principal (primer usuario del array o null)
        const usuario_id = Array.isArray(usuarios_ids) && usuarios_ids.length > 0 
            ? usuarios_ids[0] 
            : null;
        
        // Asegurar que usuarios_ids sea un array válido
        const usuarios_ids_array = Array.isArray(usuarios_ids) && usuarios_ids.length > 0
            ? usuarios_ids
            : (usuario_id ? [usuario_id] : []);
        
        // Limpiar y validar estacion_id
        const estacion_id_limpio = estacion_id ? String(estacion_id).trim() : null;
        
        // Insertar el campo con ambas columnas
        const { rows } = await pool.query(
            `INSERT INTO campos (usuario_id, nombre_campo, ubicacion, estacion_id, usuarios_ids) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [usuario_id, nombre_campo, ubicacion, estacion_id_limpio, usuarios_ids_array]
        );
        
        // Verificar si la estación existe (opcional, solo para logging)
        if (estacion_id_limpio) {
            const estacionCheck = await pool.query(
                'SELECT codigo, titulo FROM estaciones_meteorologicas WHERE TRIM(codigo) = $1',
                [estacion_id_limpio]
            );
            if (estacionCheck.rows.length === 0) {
                console.warn(`Advertencia: Estación ${estacion_id_limpio} no encontrada en la base de datos`);
            }
        }
        
        // Obtener nombres de usuarios para la respuesta
        let usuarios_nombres = '';
        if (usuarios_ids_array.length > 0) {
            const userResult = await pool.query(
                'SELECT nombre_usuario FROM usuarios WHERE id = ANY($1) ORDER BY nombre_usuario',
                [usuarios_ids_array]
            );
            usuarios_nombres = userResult.rows.map(u => u.nombre_usuario).join(', ');
        }
        
        const campoWithUsers = {
            ...rows[0],
            usuarios_ids: usuarios_ids_array,
            usuarios_nombres
        };
        
        res.status(201).json(campoWithUsers);
    } catch (err) {
        console.error('Error al crear campo:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    }
});

// Actualizar un campo
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre_campo, ubicacion, usuarios_ids, estacion_id } = req.body;
    
    try {
        // Determinar usuario_id principal (primer usuario del array o null)
        const usuario_id = Array.isArray(usuarios_ids) && usuarios_ids.length > 0 
            ? usuarios_ids[0] 
            : null;
        
        // Asegurar que usuarios_ids sea un array válido
        const usuarios_ids_array = Array.isArray(usuarios_ids) && usuarios_ids.length > 0
            ? usuarios_ids
            : (usuario_id ? [usuario_id] : []);
        
        // Limpiar y validar estacion_id
        const estacion_id_limpio = estacion_id ? String(estacion_id).trim() : null;
        
        console.log('Actualizando campo:', {
            id,
            nombre_campo,
            ubicacion,
            usuario_id,
            usuarios_ids_array,
            estacion_id_limpio
        });
        
        // Verificar si la estación existe antes de actualizar
        if (estacion_id_limpio) {
            const estacionCheck = await pool.query(
                'SELECT codigo, titulo FROM estaciones_meteorologicas WHERE TRIM(codigo) = $1',
                [estacion_id_limpio]
            );
            if (estacionCheck.rows.length === 0) {
                console.warn(`Advertencia: Estación ${estacion_id_limpio} no encontrada`);
            }
        }
        
        // Actualizar el campo incluyendo usuarios_ids
        const { rows } = await pool.query(
            `UPDATE campos 
             SET nombre_campo = $1, 
                 ubicacion = $2, 
                 usuario_id = $3, 
                 estacion_id = $4,
                 usuarios_ids = $5
             WHERE id = $6 
             RETURNING *`,
            [nombre_campo, ubicacion, usuario_id, estacion_id_limpio, usuarios_ids_array, id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Campo no encontrado' });
        }
        
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
        
        // Obtener nombres de usuarios para la respuesta
        let usuarios_nombres = '';
        if (usuarios_ids_array.length > 0) {
            const userResult = await pool.query(
                'SELECT nombre_usuario FROM usuarios WHERE id = ANY($1) ORDER BY nombre_usuario',
                [usuarios_ids_array]
            );
            usuarios_nombres = userResult.rows.map(u => u.nombre_usuario).join(', ');
        }
        
        const campoWithUsers = {
            ...rows[0],
            usuarios_ids: usuarios_ids_array,
            usuarios_nombres,
            estacion_titulo: verificacion.rows[0]?.estacion_titulo || null
        };
        
        res.json(campoWithUsers);
    } catch (err) {
        console.error('Error al actualizar campo:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
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
        const result = await client.query(`
            UPDATE campos 
            SET usuarios_ids = ARRAY[usuario_id]
            WHERE usuario_id IS NOT NULL 
              AND (usuarios_ids IS NULL OR array_length(usuarios_ids, 1) IS NULL)
            RETURNING id, nombre_campo, usuario_id, usuarios_ids
        `);
        
        await client.query('COMMIT');
        
        console.log('Migración completada. Campos actualizados:', result.rows.length);
        
        res.json({ 
            message: 'Migración completada con éxito',
            campos_actualizados: result.rows.length,
            campos: result.rows
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error en la migración:', err);
        res.status(500).json({ error: 'Error del servidor', details: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;