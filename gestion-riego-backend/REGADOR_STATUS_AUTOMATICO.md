# Sistema Automático de Estado de Regadores

## 📋 Resumen de Cambios

Se ha implementado un sistema automático que gestiona el estado `activo/inactivo` de los regadores basándose en:

1. **Activación automática**: Cuando un regador envía datos GPS (independientemente de si está encendido o apagado)
2. **Desactivación automática**: Solo cuando no ha enviado datos en más de 1 hora
3. **Visualización completa**: TODOS los regadores se muestran en el Estado de Riego, estén activos o inactivos

### ⚠️ Importante:
- Un regador **NO se desactiva** cuando se apaga o detiene temporalmente
- Solo se marca como inactivo después de **1 hora sin enviar datos**
- Esto significa que verás TODOS tus regadores, incluso si están detenidos

---

## 🔧 Archivos Modificados

### 1. `gpsProcessingService.js`

#### Nuevo Método: `actualizarEstadoActivo()`
```javascript
async actualizarEstadoActivo(regadorId) {
    // Siempre activar cuando recibe datos GPS
    const result = await pool.query(
        'UPDATE regadores SET activo = true WHERE id = $1 AND activo = false RETURNING nombre_dispositivo',
        [regadorId]
    );
    
    if (result.rows.length > 0) {
        console.log(`✅ Regador activado: ${result.rows[0].nombre_dispositivo}`);
    }
}
```
**Nota**: Este método SOLO activa regadores. La desactivación es manejada por el servicio en segundo plano.

#### Nuevo Método: `buscarRegadorSinFiltro()`
```javascript
async buscarRegadorSinFiltro(nombreDispositivo) {
    // Busca regadores sin filtrar por estado activo
    // Necesario para poder actualizar el estado de regadores inactivos
    const query = `
        SELECT * FROM regadores 
        WHERE nombre_dispositivo = $1
    `;
    const result = await pool.query(query, [nombreDispositivo]);
    return result.rows[0] || null;
}
```

#### Modificación en `procesarPosicion()`
- Ahora usa `buscarRegadorSinFiltro()` en lugar de `buscarRegador()`
- Llama a `actualizarEstadoActivo()` cada vez que recibe datos GPS
- **NO desactiva** el regador cuando está apagado - solo activa cuando recibe datos

---

### 2. `regadorStatusService.js` (NUEVO ARCHIVO)

Servicio en segundo plano que monitorea el estado de los regadores.

#### Características:
- **Intervalo de verificación**: Cada 10 minutos
- **Timeout de inactividad**: 1 hora sin datos
- **Acciones automáticas**:
  - Desactiva regadores sin datos en la última hora
  - Desactiva regadores que nunca han enviado datos

#### Métodos principales:

```javascript
iniciar() {
    // Inicia el servicio de monitoreo
    // Ejecuta verificación inmediatamente y luego cada 10 minutos
}

verificarRegadoresInactivos() {
    // Busca y desactiva regadores inactivos
    // Registra en consola los regadores desactivados
}

obtenerEstadisticas() {
    // Retorna conteo de regadores activos/inactivos
}
```

---

### 3. `server.js`

#### Cambios:
- Importa `regadorStatusService`
- Inicia el servicio cuando el servidor arranca
- El servicio corre en segundo plano durante toda la vida del servidor

```javascript
app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor corriendo en https://qarpana.com.ar:${port}`);
    console.log('🎯 Traccar Event Forwarding configurado en /api/traccar/webhook');
    
    // ⭐ Iniciar servicio de monitoreo de estado de regadores
    regadorStatusService.iniciar();
});
```

---

## 🔄 Flujo de Funcionamiento

### Cuando llegan datos GPS de Traccar:

1. **Traccar** envía datos GPS → `/api/gps/posicion`
2. **gpsProcessingService** recibe los datos
3. Busca el regador (sin filtrar por estado activo)
4. **Activa el regador** automáticamente (si estaba inactivo)
5. Continúa con el procesamiento normal de GPS

### Monitoreo en segundo plano:

1. **Cada 10 minutos**, el servicio ejecuta:
   ```sql
   -- Busca regadores activos sin datos recientes
   SELECT regadores WHERE activo = true 
   AND ultima_actividad < (ahora - 1 hora)
   ```
2. Desactiva los regadores encontrados
3. Registra en consola los cambios

### Visualización en el Frontend:

- **TODOS los regadores** del campo se muestran en el Estado de Riego
- El campo `regador_activo` indica si está online (true) o offline (false)
- Los regadores se ordenan con los activos primero

---

## 📊 Impacto en la Base de Datos

### Tabla `regadores`:
- Campo `activo` ahora se actualiza automáticamente
- Campo `fecha_actualizacion` se actualiza cada vez que cambia el estado

### Consultas afectadas:
- `obtenerEstadoCampo()` en `gpsController.js` - **Ahora muestra TODOS los regadores** (sin filtrar por activo)
- Los regadores se ordenan con activos primero: `ORDER BY r.activo DESC, r.id`
- Todas las consultas que usan `regador_activo` ahora reflejan el estado real

---

## 🎯 Beneficios

1. ✅ **Visibilidad completa**: Siempre ves TODOS tus regadores, incluso si están detenidos
2. ✅ **Estado en tiempo real**: El campo `regador_activo` refleja si el dispositivo está comunicándose
3. ✅ **Sin pérdida de información**: Un regador detenido temporalmente NO desaparece de la vista
4. ✅ **Detección de problemas**: Identifica dispositivos que realmente están offline (>1 hora sin datos)
5. ✅ **Sincronización automática**: No requiere intervención manual
6. ✅ **Logs informativos**: Registra todos los cambios de estado en consola

---

## 🔍 Verificación

Para verificar que funciona correctamente:

1. **Ver logs del servidor** al iniciar:
   ```
   🔄 Iniciando servicio de monitoreo de estado de regadores...
   ✅ Servicio de monitoreo iniciado (verificación cada 10 minutos)
   ```

2. **Cuando un regador se activa**:
   ```
   💧 Posición guardada - [Nombre] - regando_activo - [Sector] - Presión: XX PSI
   ```

3. **Cuando un regador se desactiva por timeout**:
   ```
   ⏸️ Regadores desactivados por inactividad (>1 hora):
      - [Nombre] (ID: X)
   ```

---

## ⚙️ Configuración

### Cambiar el timeout de inactividad:

En `regadorStatusService.js`, línea 7:
```javascript
this.TIMEOUT_INACTIVIDAD = 60 * 60 * 1000; // 1 hora en milisegundos
```

### Cambiar la frecuencia de verificación:

En `regadorStatusService.js`, línea 20:
```javascript
this.intervalo = setInterval(() => {
    this.verificarRegadoresInactivos();
}, 10 * 60 * 1000); // 10 minutos
```

---

## 🐛 Troubleshooting

### Problema: Los regadores no se activan automáticamente
- **Verificar**: Que Traccar esté enviando datos GPS correctamente
- **Solución**: Revisar los logs de `procesarPosicion()` para confirmar recepción de datos

### Problema: Un regador aparece como inactivo pero está funcionando
- **Causa**: Puede haber un problema de comunicación con Traccar
- **Solución**: Verificar que los datos GPS estén llegando al backend

### Problema: Los regadores se desactivan muy rápido
- **Causa**: El timeout de 1 hora es muy corto para tu caso de uso
- **Solución**: Aumentar `TIMEOUT_INACTIVIDAD` en `regadorStatusService.js`

### Problema: Quiero que un regador inactivo no se muestre
- **Causa**: El sistema ahora muestra TODOS los regadores por diseño
- **Solución**: Puedes filtrar en el frontend basándote en `regador_activo`, o eliminar el regador de la base de datos si ya no lo usas

### Problema: El servicio no inicia
- **Verificar**: Que no haya errores en los logs del servidor al iniciar
- **Solución**: Revisar que `regadorStatusService.js` esté correctamente importado en `server.js`

---

## 📝 Notas Importantes

1. El campo `activo` en la tabla `regadores` ahora es **dinámico** y se actualiza automáticamente
2. Si necesitas forzar un regador como activo/inactivo manualmente, puedes hacerlo desde la base de datos, pero será sobrescrito en el próximo ciclo
3. El servicio de monitoreo corre **en memoria** - si reinicias el servidor, se reinicia el servicio
4. Los logs de cambios de estado se muestran en la consola del servidor para debugging

---

## 🚀 Próximos Pasos Recomendados

1. **Monitorear los logs** durante los primeros días para verificar el comportamiento
2. **Ajustar el timeout** si es necesario según tus necesidades
3. **Considerar agregar** un endpoint API para obtener estadísticas de regadores activos/inactivos
4. **Implementar notificaciones** cuando un regador cambie de estado (opcional)
