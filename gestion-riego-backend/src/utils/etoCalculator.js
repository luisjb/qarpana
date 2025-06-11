class EToCalculator {
    constructor(latitude, altitude) {
        this.latitude = (latitude * Math.PI) / 180; // Convertir a radianes
        this.altitude = altitude;
    }

    calculateDailyETo(weatherData) {
        try {
            // Validar datos de entrada
            const validatedData = this._validateInputs(weatherData);
            if (!validatedData) {
                console.error('Datos de entrada inválidos:', weatherData);
                return null;
            }

            // 1. Calcular variables de presión de vapor
            const es = this._getSaturationVaporPressure(validatedData.tempMean);
            const ea = (validatedData.humidity / 100) * es;
            const delta = this._getVaporPressureCurveSlope(validatedData.tempMean);

            // 2. Calcular constante psicrométrica
            const latentHeat = this._getLatentHeatVaporization(validatedData.tempMean);
            const atmPressure = this._getAtmosphericPressure();
            const gamma = 0.00163 * (atmPressure / latentHeat);

            // 3. Calcular radiación neta
            const dayOfYear = this._getDayOfYear(validatedData.date);
            const dr = 1 + 0.033 * Math.cos((2 * Math.PI * dayOfYear) / 365);
            const declinationSolar = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39);
            
            // Ángulo horario del sol
            const ws = Math.acos(-Math.tan(this.latitude) * Math.tan(declinationSolar));

            // Radiación extraterrestre (Ra)
            const Gsc = 0.0820; // MJ m-2 min-1
            const Ra = ((24 * 60) / Math.PI) * Gsc * dr * (
                ws * Math.sin(this.latitude) * Math.sin(declinationSolar) +
                Math.cos(this.latitude) * Math.cos(declinationSolar) * Math.sin(ws)
            );

            // Radiación solar (Rs) - estimada desde temperatura
            const Rs = 0.16 * Ra * Math.sqrt(validatedData.tempMax - validatedData.tempMin);
            
            // Radiación de cielo despejado (Rso)
            const Rso = (0.75 + 2e-5 * this.altitude) * Ra;
            
            // Radiación neta de onda corta (Rns)
            const albedo = 0.23;
            const Rns = (1 - albedo) * Rs;
            
            // Radiación neta de onda larga (Rnl)
            const Tmax_K = validatedData.tempMax + 273.16;
            const Tmin_K = validatedData.tempMin + 273.16;
            const Rnl = this.STEFAN_BOLTZMANN * 
                ((Math.pow(Tmax_K, 4) + Math.pow(Tmin_K, 4)) / 2) * 
                (0.34 - 0.14 * Math.sqrt(ea)) * 
                (1.35 * (Rs / Rso) - 0.35);

            // Radiación neta total
            const Rn = Rns - Rnl;

            // 4. Calcular ETo
            const numerator = (0.408 * delta * Rn) + 
                (gamma * (900 / (validatedData.tempMean + 273)) * validatedData.windSpeed * (es - ea));
            const denominator = delta + gamma * (1 + 0.34 * validatedData.windSpeed);

            /*console.log('Variables intermedias ETo:', {
                es, ea, delta, gamma, Rn, 
                numerator, denominator,
                Ra, Rs, Rso, Rns, Rnl
            });*/

            const ETo = numerator / denominator;

            // Validar resultado final
            if (isNaN(ETo)) {
                console.error('ETo calculado es NaN. Variables:', {
                    numerator, denominator, weatherData: validatedData
                });
                return null;
            }

            return Math.max(0, ETo);

        } catch (error) {
            console.error('Error en cálculo de ETo:', error);
            return null;
        }
    }

    _validateInputs(data) {
        const required = ['tempMean', 'tempMax', 'tempMin', 'humidity', 'pressure', 'windSpeed', 'date'];
        
        if (!required.every(key => key in data)) {
            console.error('Faltan campos requeridos en los datos');
            return null;
        }

        // Validar y convertir valores
        return {
            tempMean: parseFloat(data.tempMean),
            tempMax: parseFloat(data.tempMax),
            tempMin: parseFloat(data.tempMin),
            humidity: parseFloat(data.humidity),
            pressure: parseFloat(data.pressure),
            windSpeed: parseFloat(data.windSpeed),
            date: new Date(data.date)
        };
    }

    STEFAN_BOLTZMANN = 4.903e-9;  // MJ K-4 m-2 day-1

    _getSaturationVaporPressure(temp) {
        return 0.6108 * Math.exp((17.27 * temp) / (temp + 237.3));
    }

    _getVaporPressureCurveSlope(temp) {
        const es = this._getSaturationVaporPressure(temp);
        return (4098 * es) / Math.pow(temp + 237.3, 2);
    }

    _getLatentHeatVaporization(temp) {
        return 2.501 - (2.361e-3 * temp);
    }

    _getAtmosphericPressure() {
        return 101.3 * Math.pow((293 - 0.0065 * this.altitude) / 293, 5.26);
    }

    _getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }
}

module.exports = EToCalculator;