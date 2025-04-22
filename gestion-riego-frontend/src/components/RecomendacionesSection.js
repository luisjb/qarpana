import React, { useState, useEffect } from 'react';
import { 
    Paper, Typography, Box, TextField, Button, List, ListItem, 
    ListItemText, IconButton, Divider, Grid, Dialog, DialogTitle,
    DialogContent, DialogActions, Tooltip
} from '@mui/material';
import { Delete, Edit, Add, Save, Cancel, Announcement } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import axios from '../axiosConfig';

function RecomendacionesSection({ campoId }) {
    const [recomendaciones, setRecomendaciones] = useState([]);
    const [nuevaRecomendacion, setNuevaRecomendacion] = useState({
        fecha: format(new Date(), 'yyyy-MM-dd'),
        texto: ''
    });
    const [editando, setEditando] = useState(null);
    const [mostrarFormulario, setMostrarFormulario] = useState(false);
    const [dialogoConfirmacion, setDialogoConfirmacion] = useState({
        abierto: false,
        recomendacionId: null
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (campoId) {
            fetchRecomendaciones();
        }
    }, [campoId]);

    const fetchRecomendaciones = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`/recomendaciones/campo/${campoId}`);
            setRecomendaciones(response.data);
            setError(null);
        } catch (error) {
            console.error('Error al obtener recomendaciones:', error);
            setError('Error al cargar las recomendaciones');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (editando) {
            setEditando({
                ...editando,
                [name]: value
            });
        } else {
            setNuevaRecomendacion({
                ...nuevaRecomendacion,
                [name]: value
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            if (editando) {
                // Actualizar recomendación existente
                await axios.put(`/recomendaciones/${editando.id}`, {
                    fecha: editando.fecha,
                    texto: editando.texto
                });
                setEditando(null);
            } else {
                // Crear nueva recomendación
                await axios.post('/recomendaciones', {
                    campo_id: campoId,
                    fecha: nuevaRecomendacion.fecha,
                    texto: nuevaRecomendacion.texto
                });
                setNuevaRecomendacion({
                    fecha: format(new Date(), 'yyyy-MM-dd'),
                    texto: ''
                });
                setMostrarFormulario(false);
            }
            // Recargar recomendaciones
            fetchRecomendaciones();
        } catch (error) {
            console.error('Error al guardar recomendación:', error);
            setError('Error al guardar la recomendación');
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (recomendacion) => {
        setEditando({
            id: recomendacion.id,
            fecha: format(parseISO(recomendacion.fecha), 'yyyy-MM-dd'),
            texto: recomendacion.texto
        });
        setMostrarFormulario(true);
    };

    const handleDeleteClick = (id) => {
        setDialogoConfirmacion({
            abierto: true,
            recomendacionId: id
        });
    };

    const confirmarEliminacion = async () => {
        try {
            setLoading(true);
            await axios.delete(`/recomendaciones/${dialogoConfirmacion.recomendacionId}`);
            fetchRecomendaciones();
        } catch (error) {
            console.error('Error al eliminar recomendación:', error);
            setError('Error al eliminar la recomendación');
        } finally {
            setLoading(false);
            setDialogoConfirmacion({ abierto: false, recomendacionId: null });
        }
    };

    const cancelarEdicion = () => {
        setEditando(null);
        if (recomendaciones.length === 0) {
            setMostrarFormulario(false);
        }
    };

    const formatDate = (dateString) => {
        try {
            return format(parseISO(dateString), 'dd/MM/yyyy');
        } catch (error) {
            console.error('Error al formatear fecha:', error);
            return dateString;
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 3, mt: 4 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Box display="flex" alignItems="center">
                    <Announcement sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="h6" color="primary">
                        Recomendaciones del Campo
                    </Typography>
                </Box>
                {!mostrarFormulario && (
                    <Button 
                        variant="contained" 
                        color="primary" 
                        startIcon={<Add />}
                        onClick={() => setMostrarFormulario(true)}
                    >
                        Nueva Recomendación
                    </Button>
                )}
            </Box>

            {mostrarFormulario && (
                <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={3}>
                            <TextField
                                fullWidth
                                label="Fecha"
                                type="date"
                                name="fecha"
                                value={editando ? editando.fecha : nuevaRecomendacion.fecha}
                                onChange={handleInputChange}
                                InputLabelProps={{ shrink: true }}
                                required
                            />
                        </Grid>
                        <Grid item xs={12} md={9}>
                            <TextField
                                fullWidth
                                label="Recomendación"
                                name="texto"
                                value={editando ? editando.texto : nuevaRecomendacion.texto}
                                onChange={handleInputChange}
                                multiline
                                rows={3}
                                required
                            />
                        </Grid>
                    </Grid>
                    <Box display="flex" justifyContent="flex-end" mt={2}>
                        <Button 
                            variant="outlined" 
                            color="secondary" 
                            onClick={cancelarEdicion}
                            startIcon={<Cancel />}
                            sx={{ mr: 1 }}
                        >
                            Cancelar
                        </Button>
                        <Button 
                            type="submit" 
                            variant="contained" 
                            color="primary"
                            startIcon={<Save />}
                            disabled={loading}
                        >
                            {editando ? 'Actualizar' : 'Guardar'}
                        </Button>
                    </Box>
                </Box>
            )}

            {error && (
                <Typography color="error" sx={{ my: 2 }}>{error}</Typography>
            )}

            {recomendaciones.length > 0 ? (
                <List>
                    {recomendaciones.map((recomendacion) => (
                        <React.Fragment key={recomendacion.id}>
                            <ListItem 
                                alignItems="flex-start"
                                secondaryAction={
                                    <Box>
                                        <Tooltip title="Editar">
                                            <IconButton 
                                                edge="end" 
                                                onClick={() => handleEditClick(recomendacion)}
                                                sx={{ mr: 1 }}
                                            >
                                                <Edit />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Eliminar">
                                            <IconButton 
                                                edge="end" 
                                                onClick={() => handleDeleteClick(recomendacion.id)}
                                                color="error"
                                            >
                                                <Delete />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                }
                            >
                                <ListItemText
                                    primary={
                                        <Box display="flex" alignItems="center">
                                            <Typography 
                                                variant="subtitle1" 
                                                component="span"
                                                sx={{ fontWeight: 'bold', mr: 2 }}
                                            >
                                                {formatDate(recomendacion.fecha)}
                                            </Typography>
                                            <Typography 
                                                variant="body2" 
                                                color="text.secondary"
                                                component="span"
                                            >
                                                Por: {recomendacion.usuario || 'Usuario'}
                                            </Typography>
                                        </Box>
                                    }
                                    secondary={
                                        <Typography
                                            sx={{ display: 'inline', mt: 1 }}
                                            component="span"
                                            variant="body1"
                                            color="text.primary"
                                        >
                                            {recomendacion.texto}
                                        </Typography>
                                    }
                                />
                            </ListItem>
                            <Divider variant="inset" component="li" />
                        </React.Fragment>
                    ))}
                </List>
            ) : (
                <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                    No hay recomendaciones registradas para este campo
                </Typography>
            )}

            {/* Diálogo de confirmación para eliminar */}
            <Dialog
                open={dialogoConfirmacion.abierto}
                onClose={() => setDialogoConfirmacion({ abierto: false, recomendacionId: null })}
            >
                <DialogTitle>Confirmar eliminación</DialogTitle>
                <DialogContent>
                    <Typography>
                        ¿Está seguro de que desea eliminar esta recomendación? Esta acción no se puede deshacer.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button 
                        onClick={() => setDialogoConfirmacion({ abierto: false, recomendacionId: null })}
                        color="primary"
                    >
                        Cancelar
                    </Button>
                    <Button 
                        onClick={confirmarEliminacion} 
                        color="error" 
                        variant="contained"
                        autoFocus
                    >
                        Eliminar
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

export default RecomendacionesSection;