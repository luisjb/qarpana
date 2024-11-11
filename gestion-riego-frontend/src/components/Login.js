import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Box, 
    TextField, 
    Button, 
    Typography, 
    Container, 
    InputAdornment, 
    IconButton 
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import logo from '../assets/logo.jpeg'; 


function Login() {
    const [nombre_usuario, setNombreUsuario] = useState('');
    const [contraseña, setContraseña] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch('http://localhost:5000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre_usuario, contraseña }),
            });
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.tipo_usuario); // Guarda el rol exactamente como viene del backend
                console.log('Login successful. Role:', data.tipo_usuario); // Log para depuración
                console.log('Login successful. Role:', data.token); // Log para depuración
                navigate('/');
            } else {
                setError('Credenciales inválidas');
            }
        } catch (err) {
            console.error('Error de conexión:', err);
            setError('Error de conexión. Por favor, intente nuevamente.');
        }
    };

    const handleClickShowPassword = () => {
        setShowPassword(!showPassword);
    };

    return (
        <Container component="main" maxWidth="xs">
            <Box
                sx={{
                    marginTop: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: 3,
                    borderRadius: 2,
                    boxShadow: 3,
                    bgcolor: 'background.paper',
                }}
            >
                <img src={logo} alt="Logo" style={{ height: 80, marginBottom: 2 }} />
                <Typography component="h1" variant="h5" color="primary" sx={{ mb: 2 }}>
                    Qarpana
                </Typography>
                <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="nombre_usuario"
                        label="Usuario"
                        name="nombre_usuario"
                        autoComplete="username"
                        autoFocus
                        value={nombre_usuario}
                        onChange={(e) => setNombreUsuario(e.target.value)}
                    />
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="contraseña"
                        label="Contraseña"
                        type={showPassword ? 'text' : 'password'}
                        id="contraseña"
                        autoComplete="current-password"
                        value={contraseña}
                        onChange={(e) => setContraseña(e.target.value)}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label="toggle password visibility"
                                        onClick={() => setShowPassword(!showPassword)}
                                        edge="end"
                                    >
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            )
                        }}
                    />
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        sx={{ mt: 3, mb: 2 }}
                    >
                        Iniciar Sesión
                    </Button>
                    {error && (
                        <Typography color="error" align="center">
                            {error}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Container>
    );
}

export default Login;