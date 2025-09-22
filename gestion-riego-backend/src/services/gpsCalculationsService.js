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
    
    // Utilidades
    toRadians(degrees) {
        return degrees * Math.PI / 180;
    }
    
    toDegrees(radians) {
        return radians * 180 / Math.PI;
    }
}

module.exports = new GPSCalculationsService();