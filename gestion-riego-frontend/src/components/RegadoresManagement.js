import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, List, ListItem, ListItemText, ListItemSecondaryAction,
    IconButton, Chip, Grid, Card, CardContent, CardHeader, Divider,
    Alert, Tooltip, Fab
} from '@mui/material';
import {
    Add, Edit, Delete, Settings, Visibility, Agriculture,
    GpsFixed, PlayArrow, Pause, CheckCircle, Warning
} from '@mui/icons-material';
import RegadorConfigDialog from './RegadorConfigDialog';
import GeozonaConfigDialog from './GeozonaConfigDialog';
import axios from '../axiosConfig';

function RegadoresManagement({ open, onClose, campo }) {
    const [regadores, setRegadores] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openRegadorDialog, setOpenRegadorDialog] = useState(false);
    const [openGeozonaDialog, setOpenGeozonaDialog] = useState(false);
    const [selectedRegador, setSelectedRegador] = useState(null);
    const [selectedLote, setSelectedLote] = useState(null);
    const [regadorEdit, setRegadorEdit] = useState(null);
    const [lotes, setLotes] = useState([]);

    useEffect(() => {
        if (open && campo) {
            fetchRegadores();
            fetchLotes();
        }
    }, [open, campo]);

    const fetchRegadores = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`/regadores/campo/${campo.id}`);
            setRegadores(response.data);
        } catch (error) {
            console.error('Error al obtener regadores:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLotes = async () => {
        try {
            const response = await axios.get(`/lotes/campo/${campo.id}`);
            setLotes(response.data.lotes || []);
        } catch (error) {
            console.error('Error al obtener lotes:', error);
        }
    };

    const handleAddRegador = () => {
        setRegadorEdit(null);
        setOpenRegadorDialog(true);
    };

    const handleEditRegador = (regador) => {
        setRegadorEdit(regador);
        setOpenRegadorDialog(true);
    };

    const handleDeleteRegador = async (regadorId) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este regador? Se eliminarán todas las geozonas asociadas.')) {
            try {
                await axios.delete(`/regadores/${regadorId}`);
                fetchRegadores();
            } catch (error) {
                console.error('Error al eliminar regador:', error);
                alert('Error al eliminar regador: ' + (error.response?.data?.error || error.message));
            }
        }
    };

    const handleConfigureGeozonas = (regador, lote) => {
        setSelectedRegador(regador);
        setSelectedLote(lote);
        setOpenGeozonaDialog(true);
    };

    const handleSaveRegador = async (regadorData) => {
        try {
            if (regadorEdit) {
                await axios.put(`/regadores/${regadorEdit.id}`, regadorData);
            } else {
                await axios.post('/regadores', regadorData);
            }
            
            setOpenRegadorDialog(false);
            setRegadorEdit(null);
            fetchRegadores();
        } catch (error) {
            console.error('Error al guardar regador:', error);
            alert('Error al guardar regador: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleSaveGeozonas = async (geozonaData) => {
        try {
            await axios.post(`/regadores/${selectedRegador.id}/geozonas`, geozonaData);
            setOpenGeozonaDialog(false);
            setSelectedRegador(null);
            setSelectedLote(null);
            fetchRegadores();
        } catch (error) {
            console.error('Error al guardar geozonas:', error);
            alert('Error al guardar geozonas: ' + (error.response?.data?.error || error.message));
        }
    };

    const getRegadorStatusIcon = (regador) => {
        if (!regador.activo) return <Pause sx={{ color: '#757575' }} />;
        if (regador.sectores_activos === regador.total_sectores && regador.total_sectores > 0) {
            return <CheckCircle sx={{ color: '#4CAF50' }} />;
        }
        if (regador.total_sectores === 0) return <Warning sx={{ color: '#FF9800' }} />;
        return <PlayArrow sx={{ color: '#2196F3' }} />;
    };

    const getRegadorStatusText = (regador) => {
        if (!regador.activo) return 'Inactivo';
        if (regador.sectores_activos === regador.total_sectores && regador.total_sectores > 0) {
            return 'Configurado';
        }
        if (regador.total_sectores === 0) return 'Sin geozonas';
        return 'Parcialmente configurado';
    };

    if (!campo) return null;

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
                <DialogTitle>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Typography variant="h6">
                            Gestión de Regadores - {campo.nombre_campo}
                        </Typography>
                        <Chip 
                            label={`${regadores.length} Regador${regadores.length !== 1 ? 'es' : ''}`}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                </DialogTitle>

                <DialogContent>
                    {regadores.length === 0 ? (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            No hay regadores configurados en este campo. Agrega un regador GPS para comenzar.
                        </Alert>
                    ) : (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            Campo con {regadores.length} regador{regadores.length !== 1 ? 'es' : ''} configurado{regadores.length !== 1 ? 's' : ''}
                        </Alert>
                    )}

                    <Grid container spacing={2}>
                        {regadores.map((regador) => (
                            <Grid item xs={12} md={6} key={regador.id}>
                                <Card variant="outlined">
                                    <CardHeader
                                        avatar={getRegadorStatusIcon(regador)}
                                        title={regador.nombre_dispositivo}
                                        subheader={
                                            <Box>
                                                <Typography variant="caption" display="block">
                                                    {regador.tipo_regador} - Radio: {regador.radio_cobertura}m
                                                </Typography>
                                                <Chip 
                                                    label={getRegadorStatusText(regador)}
                                                    size="small"
                                                    color={regador.activo ? 'success' : 'default'}
                                                />
                                            </Box>
                                        }
                                        action={
                                            <Box>
                                                <Tooltip title="Editar regador">
                                                    <IconButton onClick={() => handleEditRegador(regador)}>
                                                        <Edit />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Eliminar regador">
                                                    <IconButton 
                                                        onClick={() => handleDeleteRegador(regador.id)}
                                                        color="error"
                                                    >
                                                        <Delete />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        }
                                    />
                                    <CardContent>
                                        <Typography variant="body2" color="textSecondary" gutterBottom>
                                            Sectores configurados: {regador.sectores_activos}/{regador.total_sectores}
                                        </Typography>

                                        {regador.caudal && (
                                            <Typography variant="body2" color="textSecondary">
                                                Caudal: {regador.caudal} L/min
                                            </Typography>
                                        )}

                                        {regador.tiempo_vuelta_completa && (
                                            <Typography variant="body2" color="textSecondary">
                                                Tiempo vuelta: {regador.tiempo_vuelta_completa} min
                                            </Typography>
                                        )}

                                        <Divider sx={{ my: 2 }} />

                                        <Typography variant="subtitle2" gutterBottom>
                                            Configurar geozonas por lote:
                                        </Typography>

                                        {lotes.length === 0 ? (
                                            <Alert severity="warning" size="small">
                                                No hay lotes en este campo. Crea lotes primero.
                                            </Alert>
                                        ) : (
                                            <Box sx={{ maxHeight: 150, overflow: 'auto' }}>
                                                {lotes.map((lote) => (
                                                    <Box key={lote.id} display="flex" alignItems="center" justifyContent="space-between" py={0.5}>
                                                        <Typography variant="body2">
                                                            {lote.nombre_lote}
                                                        </Typography>
                                                        <Button
                                                            size="small"
                                                            startIcon={<Settings />}
                                                            onClick={() => handleConfigureGeozonas(regador, lote)}
                                                            variant="outlined"
                                                        >
                                                            Geozonas
                                                        </Button>
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>

                    {/* Botón flotante para agregar regador */}
                    <Fab
                        color="primary"
                        aria-label="add"
                        onClick={handleAddRegador}
                        sx={{
                            position: 'fixed',
                            bottom: 80,
                            right: 24,
                        }}
                    >
                        <Add />
                    </Fab>
                </DialogContent>

                <DialogActions>
                    <Button onClick={onClose}>
                        Cerrar
                    </Button>
                    <Button 
                        onClick={handleAddRegador}
                        variant="contained"
                        startIcon={<Add />}
                    >
                        Agregar Regador
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Diálogo de configuración de regador */}
            <RegadorConfigDialog
                open={openRegadorDialog}
                onClose={() => {
                    setOpenRegadorDialog(false);
                    setRegadorEdit(null);
                }}
                onSave={handleSaveRegador}
                campoId={campo?.id}
                regadorEdit={regadorEdit}
            />

            {/* Diálogo de configuración de geozonas */}
            <GeozonaConfigDialog
                open={openGeozonaDialog}
                onClose={() => {
                    setOpenGeozonaDialog(false);
                    setSelectedRegador(null);
                    setSelectedLote(null);
                }}
                onSave={handleSaveGeozonas}
                lote={selectedLote}
                regador={selectedRegador}
            />
        </>
    );
}

export default RegadoresManagement;