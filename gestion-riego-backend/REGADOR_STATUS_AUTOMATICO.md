# Sistema Automático de Estado de Regadores

## 📋 Resumen de Cambios

Se ha implementado un sistema automático que gestiona el estado `activo/inactivo` de los regadores basándose en:

1. **Activación automática**: Cuando un regador envía datos GPS y estaba marcado como inactivo
2. **Desactivación automática**: Cuando:
   - El regador envía señal de apagado (`ignition = false`)
   - No ha enviado datos en más de 1 hora

---

## 🔧 Archivos Modificados

### 1. `gpsProcessingService.js`

#### Nuevo Método: `actualizarEstadoActivo()`
```javascript
async actualizarEstadoActivo(regadorId, encendido) {
    // Si está encendido, activar el regador
    if (encendido) {
        await pool.query(
            'UPDATE regadores SET activo = true WHERE id = $1 AND activo = false',
            [regadorId]
        );
    } else {
        // Si está apagado, desactivar el regador
        await pool.query(
            'UPDATE regadores SET activo = false WHERE id = $1 AND activo = true',
            [regadorId]
        );
    }
}
```

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
- Actualiza el estado basándose en el valor de `ignition` de Traccar

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
4. Lee el valor de `ignition` del dispositivo
5. **Actualiza el estado**:
   - Si `ignition = true` → Marca como `activo = true`
   - Si `ignition = false` → Marca como `activo = false`
6. Continúa con el procesamiento normal de GPS

### Monitoreo en segundo plano:

1. **Cada 10 minutos**, el servicio ejecuta:
   ```sql
   -- Busca regadores activos sin datos recientes
   SELECT regadores WHERE activo = true 
   AND ultima_actividad < (ahora - 1 hora)
   ```
2. Desactiva los regadores encontrados
3. Registra en consola los cambios

---

## 📊 Impacto en la Base de Datos

### Tabla `regadores`:
- Campo `activo` ahora se actualiza automáticamente
- Campo `fecha_actualizacion` se actualiza cada vez que cambia el estado

### Consultas afectadas:
- `obtenerEstadoCampo()` en `gpsController.js` - Filtra por `activo = true`
- Todas las consultas que usan `regador_activo` ahora reflejan el estado real

---

## 🎯 Beneficios

1. ✅ **Estado en tiempo real**: El campo `regador_activo` refleja el estado actual del dispositivo
2. ✅ **Sincronización automática**: No requiere intervención manual
3. ✅ **Detección de inactividad**: Identifica dispositivos offline automáticamente
4. ✅ **Ahorro de recursos**: Las consultas solo procesan regadores activos
5. ✅ **Logs informativos**: Registra todos los cambios de estado en consola

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
- **Verificar**: Que Traccar esté enviando el atributo `ignition`
- **Solución**: Revisar los logs de `procesarPosicion()` para ver el valor de `ignition`

### Problema: Los regadores se desactivan muy rápido
- **Causa**: El timeout de 1 hora es muy corto para tu caso de uso
- **Solución**: Aumentar `TIMEOUT_INACTIVIDAD` en `regadorStatusService.js`

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
