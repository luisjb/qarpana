const sanitizeNumeric = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numValue = parseFloat(value);
    return isNaN(numValue) ? null : numValue;
};

const calcularLluviaEfectiva = (precipitaciones) => {
    const precipitacionesNum = sanitizeNumeric(precipitaciones);
    
    if (precipitacionesNum === null || precipitacionesNum === 0) {
        return 0;
    }

    if (precipitacionesNum < 15) {
        return precipitacionesNum;
    } else {
        return parseFloat((2.43 * Math.pow(precipitacionesNum, 0.667)).toFixed(2));
    }
};

// Función para calcular totales
const calcularTotales = (cambiosDiarios) => {
    return cambiosDiarios.reduce((acc, cambio) => {
        return {
            totalRiego: acc.totalRiego + (sanitizeNumeric(cambio.riego_cantidad) || 0),
            totalLluviaEfectiva: acc.totalLluviaEfectiva + (sanitizeNumeric(cambio.lluvia_efectiva) || 0)
        };
    }, { totalRiego: 0, totalLluviaEfectiva: 0 });
};

module.exports = {
    sanitizeNumeric,
    calcularLluviaEfectiva,
    calcularTotales
};