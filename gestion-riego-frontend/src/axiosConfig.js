import axios from 'axios';

const instance = axios.create({
    baseURL: 'https://api.qarpana.com.ar/api',
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

instance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

instance.interceptors.response.use(
    (response) => response,
    (error) => {
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
                    console.error('Acceso prohibido');
                    break;
            }
        }
        return Promise.reject(error);
    }
);

export default instance;