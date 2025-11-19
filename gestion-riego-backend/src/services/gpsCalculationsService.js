class GPSCalculationsService {
    
    /**
     * Calcula la presión desde el valor IO9
     * Fórmula: (-0.0165 + √(0.0165² - 4*0.000267*(0.5 - IO9/1000))) / (2*0.000267)
     */
    calcularPresionDesdeIO9(io9Value) {
        if (!io9Value || io9Value < 0) return null;
        
        const a = 0.000267;
        const b = 0.0165;
        const c = 0.5 - (io9Value / 1000);
        
        const discriminante = Math.pow(b, 2) - (4 * a * c);
        
        if (discriminante < 0) {
            console.warn(`Discriminante negativo para IO9=${io9Value}`);
            return null;
        }
        
        const presion = (-b + Math.sqrt(discriminante)) / (2 * a);
        
        return presion;
    }
    
    /**
     * Calcula el ángulo desde el centro del pivote
     */
    calcularAngulo(centerLat, centerLng, pointLat, pointLng) {
        const dLon = this.toRadians(pointLng - centerLng);
        const lat1 = this.toRadians(centerLat);
        const lat2 = this.toRadians(pointLat);
        
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        
        let angulo = this.toDegrees(Math.atan2(y, x));
        
        // Normalizar a 0-360
        angulo = (angulo + 360) % 360;
        
        return angulo;
    }
    
    /**
     * Calcula la distancia entre dos puntos en metros (fórmula de Haversine)
     */
    calcularDistancia(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Radio de la Tierra en metros
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);
        
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distancia = R * c;
        
        return distancia;
    }
    
    /**
     * Verifica si un punto está dentro de un sector (geozona)
     */
    puntoEnSector(lat, lng, centro, sector) {
        const angulo = this.calcularAngulo(centro.lat, centro.lng, lat, lng);
        const distancia = this.calcularDistancia(centro.lat, centro.lng, lat, lng);
        
        // Verificar distancia
        if (distancia < sector.radio_interno || distancia > sector.radio_externo) {
            return false;
        }
        
        // Verificar ángulo
        let enSector = false;
        
        if (sector.angulo_fin > sector.angulo_inicio) {
            // Sector normal
            enSector = angulo >= sector.angulo_inicio && angulo <= sector.angulo_fin;
        } else {
            // Sector que cruza 0°
            enSector = angulo >= sector.angulo_inicio || angulo <= sector.angulo_fin;
        }
        
        return enSector;
    }
    
    /**
     * Calcula el agua aplicada en un período
     */
    calcularAguaAplicada(caudal, tiempoMinutos, coeficienteRiego = 1.0) {
        if (!caudal || !tiempoMinutos) return 0;
        
        const aguaLitros = caudal * tiempoMinutos * coeficienteRiego;
        return aguaLitros;
    }
    
    /**
     * Calcula la lámina de agua aplicada en mm
     */
    calcularLaminaAplicada(aguaLitros, areaM2) {
        if (!aguaLitros || !areaM2 || areaM2 <= 0) return 0;
        
        // 1 litro = 0.001 m³
        // Lámina (mm) = (volumen m³ / área m²) * 1000
        const laminaMM = (aguaLitros * 0.001 / areaM2) * 1000;
        
        return laminaMM;
    }
    
    /**
     * Calcula el área de un sector
     */
    calcularAreaSector(sector) {
        let anguloRadianes;
        
        if (sector.angulo_fin < sector.angulo_inicio) {
            anguloRadianes = ((360 - sector.angulo_inicio) + sector.angulo_fin) * Math.PI / 180;
        } else {
            anguloRadianes = (sector.angulo_fin - sector.angulo_inicio) * Math.PI / 180;
        }
        
        const areaExterna = (anguloRadianes / (2 * Math.PI)) * Math.PI * Math.pow(sector.radio_externo, 2);
        const areaInterna = (anguloRadianes / (2 * Math.PI)) * Math.PI * Math.pow(sector.radio_interno, 2);
        
        return areaExterna - areaInterna;
    }
    
    /**
     * 🔒 VERSIÓN MEJORADA con validaciones más estrictas
     * Verifica si completó la vuelta considerando un margen de seguridad Y avance mínimo
     * @param {number} anguloInicio - Ángulo donde comenzó la vuelta
     * @param {number} anguloActual - Ángulo actual del regador
     * @param {number} margenPorcentaje - Margen de seguridad (por defecto 10%)
     * @param {number} avanceMinimoRequerido - Porcentaje mínimo de avance para considerar válida (por defecto 50%)
     * @returns {object} - { completada, porcentajeCompletado, anguloObjetivo, avanceGrados, esValidaParaCompletar }
     */
    verificarVueltaCompletada(anguloInicio, anguloActual, margenPorcentaje = 10, avanceMinimoRequerido = 50) {
        // Normalizar ángulos a 0-360
        anguloInicio = ((anguloInicio % 360) + 360) % 360;
        anguloActual = ((anguloActual % 360) + 360) % 360;
        
        // Calcular el margen en grados
        const margenGrados = 360 * (margenPorcentaje / 100);
        
        // Calcular el ángulo objetivo (restar el margen al inicio)
        let anguloObjetivo = anguloInicio - margenGrados;
        if (anguloObjetivo < 0) {
            anguloObjetivo += 360;
        }
        
        // Calcular cuánto ha avanzado desde el inicio
        let avance = anguloActual - anguloInicio;
        
        // Ajustar si cruzó el 0°
        if (avance < 0) {
            avance += 360;
        }
        
        // Calcular porcentaje completado
        const anguloRequerido = 360 - margenGrados;
        const porcentajeCompletado = (avance / anguloRequerido) * 100;
        
        // 🔒 VALIDACIÓN CRÍTICA: Debe haber avanzado al menos el porcentaje mínimo
        const avanceMinimoGrados = 360 * (avanceMinimoRequerido / 100);
        const haAvanzadoSuficiente = avance >= avanceMinimoGrados;
        
        // Verificar si completó la vuelta (llegó al objetivo o lo pasó)
        let estaEnZonaObjetivo = false;
        
        if (anguloInicio > anguloObjetivo) {
            // El objetivo está "antes" en el círculo (ej: inicio 90°, objetivo 54°)
            estaEnZonaObjetivo = anguloActual <= anguloObjetivo || anguloActual >= anguloInicio;
        } else {
            // El objetivo está "después" (ej: inicio 10°, objetivo 334°)
            estaEnZonaObjetivo = anguloActual >= anguloObjetivo || anguloActual <= anguloInicio;
        }
        
        // ✅ Solo completar si AMBAS condiciones se cumplen
        const completada = estaEnZonaObjetivo && haAvanzadoSuficiente;
        
        return {
            completada,
            porcentajeCompletado: Math.min(porcentajeCompletado, 100),
            anguloObjetivo,
            avanceGrados: avance,
            estaEnZonaObjetivo,
            haAvanzadoSuficiente,
            esValidaParaCompletar: haAvanzadoSuficiente // Flag para saber si ya puede considerarse
        };
    }
    
    /**
     * Calcula la lámina en mm por hectárea
     * @param {number} aguaLitros - Agua aplicada en litros
     * @param {number} areaHectareas - Área en hectáreas
     * @returns {number} - Lámina en mm
     */
    calcularLaminaPorHectarea(aguaLitros, areaHectareas) {
        if (!aguaLitros || !areaHectareas || areaHectareas <= 0) return 0;
        
        // 1 litro = 0.001 m³
        // 1 hectárea = 10,000 m²
        // Lámina (mm) = (volumen m³ / área m²) * 1000
        const areaM2 = areaHectareas * 10000;
        const laminaMM = (aguaLitros * 0.001 / areaM2) * 1000;
        
        return laminaMM;
    }
    
    /**
     * Convierte área de m² a hectáreas
     */
    m2AHectareas(areaM2) {
        return areaM2 / 10000;
    }
    
    /**
     * Calcula el área de un sector en hectáreas
     */
    calcularAreaSectorHectareas(sector) {
        const areaM2 = this.calcularAreaSector(sector);
        return this.m2AHectareas(areaM2);
    }
    
    /**
     * Calcula la diferencia angular más corta entre dos ángulos
     * Útil para saber si está cerca del punto de inicio
     */
    diferenciaAngular(angulo1, angulo2) {
        angulo1 = ((angulo1 % 360) + 360) % 360;
        angulo2 = ((angulo2 % 360) + 360) % 360;
        
        let diff = Math.abs(angulo1 - angulo2);
        
        if (diff > 180) {
            diff = 360 - diff;
        }
        
        return diff;
    }
    
    // Utilidades
    toRadians(degrees) {
        return degrees * Math.PI / 180;
    }
    
    toDegrees(radians) {
        return radians * 180 / Math.PI;
    }
}

module.exports = new GPSCalculationsService();