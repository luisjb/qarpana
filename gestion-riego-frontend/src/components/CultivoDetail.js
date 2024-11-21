import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { TextField, Button, Container, Typography, Box, Grid } from '@mui/material';

function CultivoDetail() {
    const { id } = useParams();
    const [cultivo, setCultivo] = useState(null);
    const [riego, setRiego] = useState({ cantidad: '', tiempo: '' });
    const [precipitacion, setPrecipitacion] = useState('');
    const [observacion, setObservacion] = useState('');

    useEffect(() => {
        fetchCultivoDetails();
    }, [id]);

    const fetchCultivoDetails = async () => {
        try {
            const response = await fetch(`http://qarpana.com.ar:5000/api/cultivos/${id}`);
            if (!response.ok) {
                throw new Error('Error al cargar los detalles del cultivo');
            }
            const data = await response.json();
            setCultivo(data);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const handleRiegoChange = (e) => {
        const { name, value } = e.target;
        setRiego({ ...riego, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`http://qarpana.com.ar:5000/api/cultivos/${id}/cambios`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    riego_cantidad: riego.cantidad,
                    riego_tiempo: riego.tiempo,
                    precipitacion,
                    observacion
                }),
            });
            if (!response.ok) {
                throw new Error('Error al guardar la información');
            }
            // Resetear los campos después de enviar
            setRiego({ cantidad: '', tiempo: '' });
            setPrecipitacion('');
            setObservacion('');
            // Opcionalmente, podrías recargar los detalles del cultivo aquí
            fetchCultivoDetails();
        } catch (error) {
            console.error('Error:', error);
        }
    };

    if (!cultivo) return <Typography>Cargando...</Typography>;

    return (
        <Container maxWidth="md">
            <Typography variant="h4" component="h1" gutterBottom>
                Detalles del Cultivo: {cultivo.cultivo}
            </Typography>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <Typography>Especie: {cultivo.especie}</Typography>
                    <Typography>Variedad: {cultivo.variedad}</Typography>
                    <Typography>Fecha: {cultivo.fecha}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Typography>Campo: {cultivo.campo}</Typography>
                    <Typography>Lote: {cultivo.lote}</Typography>
                    <Typography>Ubicación: {cultivo.ubicacion}</Typography>
                </Grid>
            </Grid>

            <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>
                Agregar Información de Riego y Precipitaciones
            </Typography>
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
                <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="cantidad"
                    label="Riego - Cantidad (mm)"
                    type="number"
                    value={riego.cantidad}
                    onChange={handleRiegoChange}
                />
                <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="tiempo"
                    label="Riego - Tiempo (horas)"
                    type="number"
                    value={riego.tiempo}
                    onChange={handleRiegoChange}
                />
                <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="precipitacion"
                    label="Precipitación (mm)"
                    type="number"
                    value={precipitacion}
                    onChange={(e) => setPrecipitacion(e.target.value)}
                />
                <TextField
                    margin="normal"
                    fullWidth
                    name="observacion"
                    label="Observaciones"
                    multiline
                    rows={4}
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                />
                <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    sx={{ mt: 3, mb: 2 }}
                >
                    Guardar Información
                </Button>
            </Box>

            <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>
                Datos Meteorológicos Automáticos
            </Typography>
            <Typography>
                Esta sección se actualizará automáticamente con datos de las estaciones meteorológicas.
            </Typography>
        </Container>
    );
}

export default CultivoDetail;