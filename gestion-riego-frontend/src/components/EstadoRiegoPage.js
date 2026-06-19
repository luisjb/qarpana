import React, { useState, useEffect } from 'react';
import { Container, Typography, FormControl, InputLabel, Select, MenuItem, Box, CircularProgress, Paper, Grid } from '@mui/material';
import axios from '../axiosConfig';
import EstadoRiegoComponent from './EstadoRiegoComponent';

function EstadoRiegoPage() {
    const [campos, setCampos] = useState([]);
    const [selectedCampo, setSelectedCampo] = useState('');
    const [campañas, setCampañas] = useState([]);
    const [selectedCampaña, setSelectedCampaña] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchCampañasCampo = async (campoId) => {
        try {
            const response = await axios.get(`/lotes/campo/${campoId}`);
            const lotes = response.data.lotes || (Array.isArray(response.data) ? response.data : []);
            const unicas = [...new Set(lotes.map(l => l.campaña).filter(Boolean))].sort();
            setCampañas(unicas);
        } catch (error) {
            console.error('Error al obtener campañas:', error);
            setCampañas([]);
        }
    };

    useEffect(() => {
        const fetchCampos = async () => {
            try {
                const userRole = localStorage.getItem('role');
                const endpoint = userRole === 'Admin' ? '/campos/all' : '/campos';
                const response = await axios.get(endpoint);
                setCampos(response.data);
                if (response.data.length > 0) {
                    setSelectedCampo(response.data[0].id);
                    fetchCampañasCampo(response.data[0].id);
                }
            } catch (error) {
                console.error('Error al obtener campos:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCampos();
    }, []);

    const handleCampoChange = (e) => {
        setSelectedCampo(e.target.value);
        setSelectedCampaña('');
        setCampañas([]);
        if (e.target.value) fetchCampañasCampo(e.target.value);
    };

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
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth variant="outlined" sx={{ backgroundColor: 'background.paper', borderRadius: 1 }}>
                            <InputLabel>Campo</InputLabel>
                            <Select
                                value={selectedCampo}
                                onChange={handleCampoChange}
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
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth variant="outlined" sx={{ backgroundColor: 'background.paper', borderRadius: 1 }}>
                            <InputLabel>Campaña</InputLabel>
                            <Select
                                value={selectedCampaña}
                                onChange={(e) => setSelectedCampaña(e.target.value)}
                                disabled={!selectedCampo}
                                label="Campaña"
                            >
                                <MenuItem value=""><em>Todas</em></MenuItem>
                                {campañas.map(c => (
                                    <MenuItem key={c} value={c}>{c}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                </Grid>
            </Paper>

            {selectedCampo && selectedCampoData ? (
                <EstadoRiegoComponent
                    campoId={selectedCampo}
                    nombreCampo={selectedCampoData.nombre_campo}
                    campaña={selectedCampaña || undefined}
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
