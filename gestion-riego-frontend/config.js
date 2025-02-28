// config.js en el frontend
const config = {
    apiUrl: process.env.NODE_ENV === 'development' 
        ? 'http://localhost:5000/api'
        : 'https://api.qarpana.com.ar/api'
};