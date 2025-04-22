import axios from 'axios';

const instance = axios.create({
    baseURL: 'https://api.qarpana.com.ar/api'
    //baseURL: `http://localhost:5000/api`
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
                    // Acceso prohibido
                    console.error('Acceso prohibido');
                    break;
            }
        }
        return Promise.reject(error);
    }
);

export default instance;
