import React, { useState, useEffect } from 'react';
import { 
    Paper, Typography, Box, TextField, Button, List, ListItem, 
    ListItemText, IconButton, Divider, Grid, Dialog, DialogTitle,
    DialogContent, DialogActions, Tooltip
} from '@mui/material';
import { Delete, Edit, Add, Save, Cancel } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import axios from '../axiosConfig';

function ObservacionesSection({ loteId, campaña }) {
    const [observaciones, setObservaciones] = useState([]);
    const [nuevaObservacion, setNuevaObservacion] = useState({
        fecha: format(new Date(), 'yyyy-MM-dd'),
        texto: ''
    });
    const [editando, setEditando] = useState(null);
    const [mostrarFormulario, setMostrarFormulario] = useState(false);
    const [dialogoConfirmacion, setDialogoConfirmacion] = useState({
        abierto: false,
        observacionId: null
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (loteId) {
            fetchObservaciones();
        }
    }, [loteId, campaña]);

    const fetchObservaciones = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`/observaciones/lote/${loteId}`, {
                params: { campaña }
            });
            setObservaciones(response.data);
            setError(null);
        } catch (error) {
            console.error('Error al obtener observaciones:', error);
            setError('Error al cargar las observaciones');
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
            setNuevaObservacion({
                ...nuevaObservacion,
                [name]: value
            });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            if (editando) {
                // Actualizar observación existente
                await axios.put(`/observaciones/${editando.id}`, {
                    fecha: editando.fecha,
                    texto: editando.texto
                });
                setEditando(null);
            } else {
                // Crear nueva observación
                await axios.post('/observaciones', {
                    lote_id: loteId,
                    fecha: nuevaObservacion.fecha,
                    texto: nuevaObservacion.texto
                });
                setNuevaObservacion({
                    fecha: format(new Date(), 'yyyy-MM-dd'),
                    texto: ''
                });
                setMostrarFormulario(false);
            }
            // Recargar observaciones
            fetchObservaciones();
        } catch (error) {
            console.error('Error al guardar observación:', error);
            setError('Error al guardar la observación');
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (observacion) => {
        setEditando({
            id: observacion.id,
            fecha: format(parseISO(observacion.fecha), 'yyyy-MM-dd'),
            texto: observacion.texto
        });
        setMostrarFormulario(true);
    };

    const handleDeleteClick = (id) => {
        setDialogoConfirmacion({
            abierto: true,
            observacionId: id
        });
    };

    const confirmarEliminacion = async () => {
        try {
            setLoading(true);
            await axios.delete(`/observaciones/${dialogoConfirmacion.observacionId}`);
            fetchObservaciones();
        } catch (error) {
            console.error('Error al eliminar observación:', error);
            setError('Error al eliminar la observación');
        } finally {
            setLoading(false);
            setDialogoConfirmacion({ abierto: false, observacionId: null });
        }
    };

    const cancelarEdicion = () => {
        setEditando(null);
        if (observaciones.length === 0) {
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
                <Typography variant="h6" color="primary">
                    Observaciones
                </Typography>
                {!mostrarFormulario && (
                    <Button 
                        variant="contained" 
                        color="primary" 
                        startIcon={<Add />}
                        onClick={() => setMostrarFormulario(true)}
                    >
                        Nueva Observación
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
                                value={editando ? editando.fecha : nuevaObservacion.fecha}
                                onChange={handleInputChange}
                                InputLabelProps={{ shrink: true }}
                                required
                            />
                        </Grid>
                        <Grid item xs={12} md={9}>
                            <TextField
                                fullWidth
                                label="Observación"
                                name="texto"
                                value={editando ? editando.texto : nuevaObservacion.texto}
                                onChange={handleInputChange}
                                multiline
                                rows={2}
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

            {observaciones.length > 0 ? (
                <List>
                    {observaciones.map((observacion) => (
                        <React.Fragment key={observacion.id}>
                            <ListItem 
                                alignItems="flex-start"
                                secondaryAction={
                                    <Box>
                                        <Tooltip title="Editar">
                                            <IconButton 
                                                edge="end" 
                                                onClick={() => handleEditClick(observacion)}
                                                sx={{ mr: 1 }}
                                            >
                                                <Edit />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Eliminar">
                                            <IconButton 
                                                edge="end" 
                                                onClick={() => handleDeleteClick(observacion.id)}
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
                                                {formatDate(observacion.fecha)}
                                            </Typography>
                                            <Typography 
                                                variant="body2" 
                                                color="text.secondary"
                                                component="span"
                                            >
                                                Por: {observacion.usuario || 'Usuario'}
                                            </Typography>
                                        </Box>
                                    }
                                    secondary={
                                        <Typography
                                            sx={{ display: 'inline' }}
                                            component="span"
                                            variant="body1"
                                            color="text.primary"
                                        >
                                            {observacion.texto}
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
                    No hay observaciones registradas
                </Typography>
            )}

            {/* Diálogo de confirmación para eliminar */}
            <Dialog
                open={dialogoConfirmacion.abierto}
                onClose={() => setDialogoConfirmacion({ abierto: false, observacionId: null })}
            >
                <DialogTitle>Confirmar eliminación</DialogTitle>
                <DialogContent>
                    <Typography>
                        ¿Está seguro de que desea eliminar esta observación? Esta acción no se puede deshacer.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button 
                        onClick={() => setDialogoConfirmacion({ abierto: false, observacionId: null })}
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

export default ObservacionesSection;