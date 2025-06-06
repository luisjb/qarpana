import axios from 'axios';

const instance = axios.create({
    baseURL: 'https://api.qarpana.com.ar/api',
    //baseURL: `http://localhost:5000/api`
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

instance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        
        console.log('=== AXIOS REQUEST DEBUG ===');
        console.log('URL completa:', config.baseURL + config.url);
        console.log('Token en localStorage:', token ? `${token.substring(0, 20)}...` : 'NULL');
        
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
            console.log('✅ Token agregado al header');
        } else {
            console.log('❌ No token found');
        }
        
        console.log('Headers:', config.headers);
        console.log('============================');
        
        return config;
    },
    (error) => {
        console.error('Error en request interceptor:', error);
        return Promise.reject(error);
    }
);

instance.interceptors.response.use(
    (response) => {
        console.log('=== AXIOS RESPONSE DEBUG ===');
        console.log('Status:', response.status);
        console.log('URL:', response.config.url);
        console.log('=============================');
        return response;
    },
    (error) => {
        console.error('=== AXIOS ERROR DEBUG ===');
        console.error('Status:', error.response?.status);
        console.error('Message:', error.message);
        console.error('URL:', error.config?.url);
        console.error('Response data:', error.response?.data);
        console.error('=========================');
        
        const isLandingPage = window.location.pathname === '/';

        if (error.response) {
            switch (error.response.status) {
                case 401:
                    if (!isLandingPage) {
                        localStorage.removeItem('token');
                        localStorage.removeItem('role');
                        window.location.href = '/login';
                    }
                    break;
                case 403:
                    // Acceso prohibido
                    console.error('Acceso prohibido');
                    break;
            }
        }
        return Promise.reject(error);
    }
);

export default instance;