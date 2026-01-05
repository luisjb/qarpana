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
        const laminaMM = (aguaLitros * 0.001 / areaM2) / 10;

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
     * 🔒 VERSIÓN MEJORADA - Soporta sentido horario y antihorario
     * Verifica si completó la vuelta basándose en el avance angular
     * @param {number} anguloInicio - Ángulo donde comenzó la vuelta
     * @param {number} anguloActual - Ángulo actual del regador
     * @param {string} sentidoGiro - 'horario', 'antihorario', o 'auto'
     * @param {number} margenPorcentaje - Margen de seguridad (por defecto 10%)
     * @param {number} avanceMinimoRequerido - Porcentaje mínimo de avance (por defecto 50%)
     * @returns {object} - { completada, porcentajeCompletado, avanceGrados, sentidoDetectado, ... }
     */
    verificarVueltaCompletada(anguloInicio, anguloActual, sentidoGiro = 'auto', margenPorcentaje = 10, avanceMinimoRequerido = 50) {
        // Normalizar ángulos a 0-360
        anguloInicio = ((anguloInicio % 360) + 360) % 360;
        anguloActual = ((anguloActual % 360) + 360) % 360;

        // Calcular el margen en grados (10% = 36°)
        const margenGrados = 360 * (margenPorcentaje / 100);

        // Calcular avance según el sentido de giro
        let avance;
        let sentidoDetectado = sentidoGiro;

        if (sentidoGiro === 'antihorario' || sentidoGiro === 'auto') {
            // Sentido antihorario (counterclockwise): ángulo aumenta
            avance = anguloActual - anguloInicio;
            if (avance < 0) {
                avance += 360;
            }
        } else if (sentidoGiro === 'horario') {
            // Sentido horario (clockwise): ángulo disminuye
            avance = anguloInicio - anguloActual;
            if (avance < 0) {
                avance += 360;
            }
        }

        // Si es 'auto', detectar el sentido basándose en el avance
        if (sentidoGiro === 'auto') {
            const avanceHorario = anguloInicio - anguloActual;
            const avanceAntihorario = anguloActual - anguloInicio;

            const avanceHorarioNormalizado = avanceHorario < 0 ? avanceHorario + 360 : avanceHorario;
            const avanceAntihorarioNormalizado = avanceAntihorario < 0 ? avanceAntihorario + 360 : avanceAntihorario;

            // Usar el avance menor (el que tiene más sentido)
            // Si ambos son similares, preferir antihorario (más común)
            if (avanceHorarioNormalizado < avanceAntihorarioNormalizado && avanceHorarioNormalizado < 180) {
                avance = avanceHorarioNormalizado;
                sentidoDetectado = 'horario';
            } else {
                avance = avanceAntihorarioNormalizado;
                sentidoDetectado = 'antihorario';
            }
        }

        // Ángulo requerido para completar (360° - margen)
        // Por ejemplo: 360° - 36° = 324° (90% de la vuelta)
        const anguloRequerido = 360 - margenGrados;

        // Calcular porcentaje completado
        const porcentajeCompletado = (avance / anguloRequerido) * 100;

        // 🔒 VALIDACIÓN 1: Debe haber avanzado al menos el mínimo requerido
        const avanceMinimoGrados = 360 * (avanceMinimoRequerido / 100);
        const haAvanzadoSuficiente = avance >= avanceMinimoGrados;

        // ✅ COMPLETADA: Si avanzó >= anguloRequerido (ej: >= 324°)
        const completada = avance >= anguloRequerido;

        // Calcular ángulo objetivo (para referencia)
        let anguloObjetivo;
        if (sentidoDetectado === 'antihorario') {
            anguloObjetivo = anguloInicio - margenGrados;
            if (anguloObjetivo < 0) {
                anguloObjetivo += 360;
            }
        } else {
            anguloObjetivo = anguloInicio + margenGrados;
            if (anguloObjetivo >= 360) {
                anguloObjetivo -= 360;
            }
        }

        return {
            completada,
            porcentajeCompletado: Math.min(porcentajeCompletado, 100),
            anguloObjetivo,
            avanceGrados: avance,
            haAvanzadoSuficiente,
            esValidaParaCompletar: haAvanzadoSuficiente,
            sentidoDetectado // Devolver el sentido detectado/usado
        };
    }

    /**
     * Detecta el sentido de giro del pivote basándose en múltiples posiciones GPS
     * @param {Array} posiciones - Array de {angulo, timestamp} ordenados por timestamp
     * @returns {string} - 'horario' o 'antihorario'
     */
    detectarSentidoGiro(posiciones) {
        if (!posiciones || posiciones.length < 3) {
            return 'antihorario'; // Default
        }

        let sumaAvances = 0;
        let conteoAvances = 0;

        for (let i = 1; i < posiciones.length; i++) {
            const anguloAnterior = ((posiciones[i - 1].angulo % 360) + 360) % 360;
            const anguloActual = ((posiciones[i].angulo % 360) + 360) % 360;

            // Calcular cambio angular
            let cambio = anguloActual - anguloAnterior;

            // Normalizar el cambio al rango [-180, 180]
            if (cambio > 180) {
                cambio -= 360;
            } else if (cambio < -180) {
                cambio += 360;
            }

            // Solo considerar cambios significativos (> 1°)
            if (Math.abs(cambio) > 1) {
                sumaAvances += cambio;
                conteoAvances++;
            }
        }

        if (conteoAvances === 0) {
            return 'antihorario'; // Default
        }

        const promedioAvance = sumaAvances / conteoAvances;

        // Si el promedio es positivo, gira antihorario (ángulo aumenta)
        // Si es negativo, gira horario (ángulo disminuye)
        return promedioAvance > 0 ? 'antihorario' : 'horario';
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
        // Lámina (mm) = (volumen m³ / área m²) / 10
        const areaM2 = areaHectareas * 10000;
        const laminaMM = (aguaLitros * 0.001 / areaM2) / 10;

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