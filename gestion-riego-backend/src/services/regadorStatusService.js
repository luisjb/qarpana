// src/services/regadorStatusService.js
const pool = require('../db');

class RegadorStatusService {
    constructor() {
        // Intervalo de inactividad en milisegundos (1 hora)
        this.TIMEOUT_INACTIVIDAD = 60 * 60 * 1000; // 1 hora
        this.intervalo = null;
    }

    /**
     * Inicia el servicio de monitoreo de estado de regadores
     */
    iniciar() {
        console.log('🔄 Iniciando servicio de monitoreo de estado de regadores...');

        // Ejecutar inmediatamente
        this.verificarRegadoresInactivos();

        // Ejecutar cada 10 minutos
        this.intervalo = setInterval(() => {
            this.verificarRegadoresInactivos();
        }, 10 * 60 * 1000); // 10 minutos

        console.log('✅ Servicio de monitoreo iniciado (verificación cada 10 minutos)');
    }

    /**
     * Detiene el servicio de monitoreo
     */
    detener() {
        if (this.intervalo) {
            clearInterval(this.intervalo);
            this.intervalo = null;
            console.log('⏹️ Servicio de monitoreo detenido');
        }
    }

    /**
     * Verifica y desactiva regadores que no han enviado datos en más de 1 hora
     */
    async verificarRegadoresInactivos() {
        try {
            // Calcular el timestamp límite (1 hora atrás)
            const timestampLimite = new Date(Date.now() - this.TIMEOUT_INACTIVIDAD);

            // Buscar regadores activos cuya última actividad fue hace más de 1 hora
            const query = `
                UPDATE regadores r
                SET activo = false, 
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE r.activo = true
                  AND r.id IN (
                      SELECT dog.regador_id
                      FROM datos_operacion_gps dog
                      WHERE dog.regador_id = r.id
                      GROUP BY dog.regador_id
                      HAVING MAX(dog.timestamp) < $1
                  )
                RETURNING id, nombre_dispositivo
            `;

            const result = await pool.query(query, [timestampLimite]);

            if (result.rows.length > 0) {
                console.log(`⏸️ Regadores desactivados por inactividad (>1 hora):`);
                result.rows.forEach(regador => {
                    console.log(`   - ${regador.nombre_dispositivo} (ID: ${regador.id})`);
                });
            }

            // También desactivar regadores que nunca han enviado datos y están marcados como activos
            const queryNuncaActivos = `
                UPDATE regadores r
                SET activo = false,
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE r.activo = true
                  AND NOT EXISTS (
                      SELECT 1 FROM datos_operacion_gps dog
                      WHERE dog.regador_id = r.id
                  )
                  AND r.fecha_creacion < $1
                RETURNING id, nombre_dispositivo
            `;

            const resultNunca = await pool.query(queryNuncaActivos, [timestampLimite]);

            if (resultNunca.rows.length > 0) {
                console.log(`⏸️ Regadores desactivados (nunca enviaron datos):`);
                resultNunca.rows.forEach(regador => {
                    console.log(`   - ${regador.nombre_dispositivo} (ID: ${regador.id})`);
                });
            }

        } catch (error) {
            console.error('❌ Error verificando regadores inactivos:', error);
        }
    }

    /**
     * Obtiene estadísticas de regadores activos/inactivos
     */
    async obtenerEstadisticas() {
        try {
            const query = `
                SELECT 
                    COUNT(*) FILTER (WHERE activo = true) as activos,
                    COUNT(*) FILTER (WHERE activo = false) as inactivos,
                    COUNT(*) as total
                FROM regadores
            `;

            const result = await pool.query(query);
            return result.rows[0];

        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            throw error;
        }
    }
}

module.exports = new RegadorStatusService();
