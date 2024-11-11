const axios = require('axios');

const instance = axios.create({
    timeout: 15000, // Aumentamos el timeout a 15 segundos
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

// Agregar interceptor para logging
instance.interceptors.request.use(request => {
    console.log('Realizando petición:', {
        url: request.url,
        method: request.method,
        params: request.params
    });
    return request;
});

instance.interceptors.response.use(
    response => {
        console.log('Respuesta recibida:', {
            status: response.status,
            url: response.config.url
        });
        return response;
    },
    error => {
        console.error('Error en petición HTTP:', {
            mensaje: error.message,
            status: error.response?.status,
            data: error.response?.data,
            url: error.config?.url
        });
        return Promise.reject(error);
    }
);

module.exports = instance;