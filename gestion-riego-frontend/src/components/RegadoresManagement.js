import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, List, ListItem, ListItemText, ListItemSecondaryAction,
    IconButton, Chip, Grid, Card, CardContent, CardHeader, Divider,
    Alert, Tooltip, Fab
} from '@mui/material';
import {
    Add, Edit, Delete, Settings, Visibility, Agriculture,
    GpsFixed, PlayArrow, Pause, CheckCircle, Warning, DeleteSweep
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
            console.log('📊 Regadores obtenidos:', response.data); // DEBUG
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
            const activeLotes = (response.data.lotes || []).filter(lote => lote.activo);
            setLotes(activeLotes);
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

    const handleDeleteAllGeozonas = async (regador) => {
        console.log('🗑️ Intentando eliminar geozonas del regador:', regador); // DEBUG
        
        const confirmacion = window.confirm(
            `⚠️ ELIMINAR TODAS LAS GEOZONAS DEL REGADOR\n\n` +
            `Regador: ${regador.nombre_dispositivo}\n` +
            `Sectores configurados: ${regador.total_sectores || 0}\n\n` +
            `Esta acción eliminará:\n` +
            `• TODAS las geozonas de TODOS los lotes\n` +
            `• Todos los sectores configurados\n` +
            `• Todo el historial de estados de riego\n\n` +
            `Motivos comunes para esta acción:\n` +
            `• El centro del pivote está mal configurado\n` +
            `• Se configuraron geozonas incorrectas\n` +
            `• Necesitas reconfigurar todo desde cero\n\n` +
            `⚠️ ESTA ACCIÓN NO SE PUEDE DESHACER ⚠️\n\n` +
            `¿Estás seguro de continuar?`
        );

        if (!confirmacion) {
            return;
        }

        // Segunda confirmación para seguridad adicional
        const confirmacionFinal = window.confirm(
            `🔴 CONFIRMACIÓN FINAL 🔴\n\n` +
            `Vas a eliminar todas las geozonas de "${regador.nombre_dispositivo}".\n\n` +
            `¿Confirmas que deseas eliminar TODAS las geozonas?`
        );

        if (!confirmacionFinal) {
            return;
        }

        try {
            // Llamar al endpoint para eliminar todas las geozonas del regador
            const response = await axios.delete(`/geozonas-pivote/regador/${regador.id}/all`);
            
            console.log(`✅ Todas las geozonas eliminadas - Regador: ${regador.nombre_dispositivo}`);
            console.log(`📊 Sectores eliminados:`, response.data);
            
            // Mostrar mensaje de éxito
            alert(
                `✅ Geozonas eliminadas exitosamente\n\n` +
                `Regador: ${regador.nombre_dispositivo}\n` +
                `Sectores eliminados: ${response.data.sectores_eliminados || 0}\n\n` +
                `Ahora puedes reconfigurar las geozonas correctamente.`
            );
            
            // Actualizar la lista de regadores para reflejar el cambio
            fetchRegadores();
            
        } catch (error) {
            console.error('Error al eliminar geozonas:', error);
            alert(
                '❌ Error al eliminar geozonas\n\n' +
                'Detalles: ' + (error.response?.data?.error || error.message) + '\n\n' +
                'Por favor, intenta nuevamente o contacta al administrador.'
            );
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

    // Función para verificar si el regador tiene geozonas
    const tieneGeozonas = (regador) => {
        const tiene = (regador.total_sectores && regador.total_sectores > 0) || 
                     (regador.latitud_centro && regador.longitud_centro);
        console.log(`🔍 Regador ${regador.nombre_dispositivo} tiene geozonas:`, tiene, {
            total_sectores: regador.total_sectores,
            latitud_centro: regador.latitud_centro,
            longitud_centro: regador.longitud_centro
        }); // DEBUG
        return tiene;
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
                                            Sectores configurados: {regador.sectores_activos || 0}/{regador.total_sectores || 0}
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

                                        {/* DEBUG INFO */}
                                        <Box sx={{ mt: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                                            <Typography variant="caption" display="block">
                                                DEBUG - total_sectores: {regador.total_sectores || 'null/undefined'}
                                            </Typography>
                                            <Typography variant="caption" display="block">
                                                DEBUG - tiene coordenadas: {regador.latitud_centro ? 'Sí' : 'No'}
                                            </Typography>
                                        </Box>

                                        {/* Botón para eliminar TODAS las geozonas del regador */}
                                        {tieneGeozonas(regador) && (
                                            <Box sx={{ mt: 2, mb: 2 }}>
                                                <Alert severity="warning" sx={{ mb: 1 }}>
                                                    <Typography variant="caption">
                                                        Si las geozonas están mal configuradas (centro incorrecto, lote equivocado, etc.):
                                                    </Typography>
                                                </Alert>
                                                <Button
                                                    fullWidth
                                                    variant="outlined"
                                                    color="error"
                                                    startIcon={<DeleteSweep />}
                                                    onClick={() => handleDeleteAllGeozonas(regador)}
                                                    size="small"
                                                >
                                                    Eliminar TODAS las geozonas ({regador.total_sectores || 0} sectores)
                                                </Button>
                                            </Box>
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