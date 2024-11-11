import React from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Header from './components/Header';
import Login from './components/Login';
import CamposManagement from './components/CamposManagement';
import LotesManagement from './components/LotesManagement';
import CultivoDetail from './components/CultivoDetail';
import UserManagement from './components/UserManagement';
import CambiosDiarios from './components/CambiosDiarios';
import Simulaciones from './components/Simulations';

//import './style.css';
import axios from './axiosConfig';

const theme = createTheme({
  palette: {
    primary: {
      main: '#00434b',
    },
    secondary: {
      main: '#70AF07',
    },
  },
  components: {
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00434b',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00434b',
          },
        },
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': {
            color: '#00434b',
          },
        },
      },
    },
  },
});

axios.interceptors.response.use(
  response => response,
  error => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

function PrivateRoute({ element, allowedRoles }) {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('role');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(userRole.toLowerCase())) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Header />
      {element}
    </>
  );
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('SW registrado:', registration);
      })
      .catch(error => {
        console.log('SW error:', error);
      });
  });
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={<PrivateRoute element={<Simulaciones />} />}
          />
          <Route
            path="/campos"
            element={<PrivateRoute element={<CamposManagement />} />}
          />
          <Route
            path="/lotes/:campoId"
            element={<PrivateRoute element={<LotesManagement />} />}
          />
          <Route
            path="/cultivo/:cultivoId"
            element={<PrivateRoute element={<CultivoDetail />} />}
          />
          <Route 
            path="/cambios-diarios" 
            element={<PrivateRoute element={<CambiosDiarios />} />} 
          />
          <Route 
            path="/admin/users" 
            element={<PrivateRoute element={<UserManagement />} allowedRoles={['admin']} />} 
          />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;