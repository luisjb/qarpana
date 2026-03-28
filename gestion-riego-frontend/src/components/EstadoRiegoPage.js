import React, { useState, useEffect } from 'react';
import { Container, Typography, FormControl, InputLabel, Select, MenuItem, Box, CircularProgress, Paper } from '@mui/material';
import axios from '../axiosConfig';
import EstadoRiegoComponent from './EstadoRiegoComponent';

function EstadoRiegoPage() {
    const [campos, setCampos] = useState([]);
    const [selectedCampo, setSelectedCampo] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCampos = async () => {
            try {
                const userRole = localStorage.getItem('role');
                const endpoint = userRole === 'Admin' ? '/campos/all' : '/campos';
                const response = await axios.get(endpoint);
                setCampos(response.data);
                if (response.data.length > 0) {
                    setSelectedCampo(response.data[0].id);
                }
            } catch (error) {
                console.error('Error al obtener campos:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCampos();
    }, []);

    const selectedCampoData = campos.find(c => c.id === selectedCampo);

    if (loading) {
        return (
            <Container sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress />
            </Container>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
                <Typography variant="h5" gutterBottom color="primary">
                    Visualizar Estado de Riego
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Seleccione un campo para ver el estado en tiempo real de todos sus equipos de riego configurados.
                </Typography>
                <FormControl maxWidth="sm" fullWidth variant="outlined" sx={{ backgroundColor: 'background.paper', borderRadius: 1 }}>
                    <InputLabel>Campo</InputLabel>
                    <Select
                        value={selectedCampo}
                        onChange={(e) => setSelectedCampo(e.target.value)}
                        label="Campo"
                    >
                        {campos.length === 0 && (
                            <MenuItem value="" disabled>No hay campos disponibles</MenuItem>
                        )}
                        {campos.map((campo) => (
                            <MenuItem key={campo.id} value={campo.id}>
                                {campo.nombre_campo}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Paper>

            {selectedCampo && selectedCampoData ? (
                <EstadoRiegoComponent 
                    campoId={selectedCampo} 
                    nombreCampo={selectedCampoData.nombre_campo} 
                />
            ) : (
                <Box textAlign="center" py={4}>
                    <Typography color="textSecondary">No se seleccionó ningún campo</Typography>
                </Box>
            )}
        </Container>
    );
}

export default EstadoRiegoPage;
