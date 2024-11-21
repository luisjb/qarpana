import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { useParams } from 'react-router-dom';
import axios from '../axiosConfig';
import {
    Container, Typography, TextField, Button, List, ListItem, ListItemText,
    Dialog, DialogContent, DialogTitle, Select, MenuItem, FormControl,
    InputLabel, Checkbox, FormControlLabel, IconButton, Grid
} from '@mui/material';
import { Edit, Delete, WaterDrop } from '@mui/icons-material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import EstadoFenologicoDialog from './EstadoFenologicoDialog';
import AguaUtilDialog from './AguaUtilDialog';

function LotesManagement() {
    const { campoId } = useParams();
    const [nombreCampo, setNombreCampo] = useState('');
    const [lotes, setLotes] = useState([]);
    const [cultivos, setCultivos] = useState([]);
    const [nuevoLote, setNuevoLote] = useState({
        nombre_lote: '',
        cultivo_id: '',  // Esto ahora contendrá la especie
        especie: '',     // Se actualizará automáticamente al seleccionar el cultivo
        variedad: '',
        fecha_siembra: '',
        agua_util_inicial: Array(5).fill(''),
        activo: true,
        campaña: '',
        porcentaje_agua_util_umbral: '',
        agua_util_total: ''
    });
    const [openDialog, setOpenDialog] = useState(false);
    const [openAguaUtilDialog, setOpenAguaUtilDialog] = useState(false);
    const [editingLote, setEditingLote] = useState(null);
    const [openEstadoFenologicoDialog, setOpenEstadoFenologicoDialog] = useState(false);
    const [selectedLoteId, setSelectedLoteId] = useState(null);
    const [selectedLote, setSelectedLote] = useState(null);

    useEffect(() => {
        if (campoId) {
            fetchLotes();
            fetchCultivos(); // Cargar cultivos al inicio
        }
    }, [campoId]);
    
    useEffect(() => {
        if (openDialog) {
            fetchCultivos(); // Recargar cultivos cuando se abre el diálogo
        }
    }, [openDialog]);

    const fetchLotes = async () => {
        try {
            const response = await axios.get(`/lotes/campo/${campoId}`);
            setNombreCampo(response.data.nombre_campo);
            setLotes(response.data.lotes);
        } catch (error) {
            console.error('Error al obtener lotes:', error);
        }
    };

    const fetchCultivos = async () => {
        try {
            const response = await axios.get('/cultivos');
            //console.log('Cultivos obtenidos:', response.data);
            if (Array.isArray(response.data)) {
                setCultivos(response.data.map(cultivo => ({
                    id: cultivo.id,
                    nombre_cultivo: cultivo.nombre_cultivo
                })));
            } else {
                console.error('La respuesta no es un array:', response.data);
                setCultivos([]);
            }
        } catch (error) {
            console.error('Error al obtener cultivos:', error);
            setCultivos([]);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        //console.log('Cambio de input:', { name, value });
    
        // Solo manejamos campos que no sean cultivo_id aquí
        if (name !== 'cultivo_id') {
            if (editingLote) {
                setEditingLote(prev => ({
                    ...prev,
                    [name]: value
                }));
            } else {
                setNuevoLote(prev => ({
                    ...prev,
                    [name]: value
                }));
            }
        }
    };

    const handleEdit = (lote) => {
        //console.log('Lote a editar:', lote);
        // Si el lote ya tiene un cultivo_id numérico, lo usamos directamente
        const cultivo_id = typeof lote.cultivo_id === 'number' ? 
            lote.cultivo_id : 
            (cultivos.find(c => c.especie === lote.especie)?.id || '');
    
        setEditingLote({
            ...lote,
            cultivo_id: cultivo_id
        });
        setOpenDialog(true);
    };


    const handleAguaUtilChange = (index, value) => {
        const newAguaUtil = editingLote ? [...editingLote.agua_util_inicial] : [...nuevoLote.agua_util_inicial];
        newAguaUtil[index] = value;
        if (editingLote) {
            setEditingLote({ ...editingLote, agua_util_inicial: newAguaUtil });
        } else {
            setNuevoLote({ ...nuevoLote, agua_util_inicial: newAguaUtil });
        }
    };
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const loteData = editingLote || nuevoLote;
            //('Datos del lote antes de procesar:', loteData);
    
            // Verificar que tengamos el cultivo_id
            if (!loteData.cultivo_id) {
                alert('Por favor seleccione un cultivo');
                return;
            }
    
            const dataToSend = {
                ...loteData,
                campo_id: parseInt(campoId),
                cultivo_id: parseInt(loteData.cultivo_id),
                fecha_siembra: format(parseISO(loteData.fecha_siembra), 'yyyy-MM-dd'),
                activo: loteData.activo,
                porcentaje_agua_util_umbral: parseFloat(loteData.porcentaje_agua_util_umbral),
                agua_util_total: parseFloat(loteData.agua_util_total)
            };
    
            //console.log('Datos a enviar al backend:', dataToSend);
    
            if (editingLote) {
                await axios.put(`/lotes/${editingLote.id}`, dataToSend);
            } else {
                await axios.post('/lotes', dataToSend);
            }
            
            fetchLotes();
            setOpenDialog(false);
            setEditingLote(null);
            setNuevoLote({
                nombre_lote: '',
                cultivo_id: '',
                especie: '',
                variedad: '',
                fecha_siembra: '',
                activo: true,
                campaña: '',
                porcentaje_agua_util_umbral: '',
                agua_util_total: ''
            });
        } catch (error) {
            console.error('Error al guardar lote:', error);
            alert('Error al guardar el lote: ' + (error.response?.data?.error || error.message));
        }
    };

    
    const handleDelete = async (loteId) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este lote?')) {
            try {
                await axios.delete(`/lotes/${loteId}`);
                fetchLotes();
            } catch (error) {
                console.error('Error al eliminar lote:', error);
            }
        }
    };
    
    const handleActivoChange = async (lote) => {
        try {
            await axios.put(`/lotes/${lote.id}`, { ...lote, activo: !lote.activo });
            fetchLotes();
        } catch (error) {
            console.error('Error al actualizar estado activo del lote:', error);
        }
    };
    
    const handleEstadoFenologicoClick = (lote) => {
        //console.log("Abriendo diálogo de estado fenológico para lote:", lote);
        setSelectedLote(lote);
        setOpenEstadoFenologicoDialog(true);
    };


    const handleAguaUtilClick = (loteId) => {
        setSelectedLoteId(loteId);
        setOpenAguaUtilDialog(true);
    };

    // Modificamos el manejo del cierre del diálogo
    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingLote(null);
        setNuevoLote({
            nombre_lote: '',
            cultivo_id: '',
            especie: '',
            variedad: '',
            fecha_siembra: '',
            activo: true,
            campaña: '',
            porcentaje_agua_util_umbral: '',
            agua_util_total: ''
        });
    };

    return (
        <Container maxWidth="md">
            <Typography variant="h4" gutterBottom>Lotes del Campo: {nombreCampo}</Typography>
            <Button variant="contained" color="primary" onClick={() => setOpenDialog(true)}>
                Agregar Nuevo Lote
            </Button>
            <List>
                {lotes.map((lote) => (
                    <ListItem key={lote.id}>
                        <ListItemText
                            primary={lote.nombre_lote}
                            secondary={`Cultivo: ${lote.nombre_cultivo} | Especie: ${lote.especie} | Variedad: ${lote.variedad} | Fecha de siembra: ${lote.fecha_siembra} | Campaña: ${lote.campaña}`}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={lote.activo}
                                    onChange={() => handleActivoChange(lote)}
                                    color="primary"
                                />
                            }
                            label="Activo"
                        />
                        <IconButton onClick={() => handleEstadoFenologicoClick(lote)} color="secondary">
                            <AssessmentIcon />
                        </IconButton>
                        <IconButton 
                            onClick={() => handleAguaUtilClick(lote.id)} 
                            style={{ color: '#87CEEB' }} //Celeste claro
                        >
                            <WaterDrop />
                        </IconButton>
                        <IconButton onClick={() => handleEdit(lote)} color="primary">
                            <Edit />
                        </IconButton>
                        <IconButton onClick={() => handleDelete(lote.id)} color="error">
                            <Delete />
                        </IconButton>
                    </ListItem>
                ))}
            </List>

            <Dialog open={openDialog} onClose={() => {
                setOpenDialog(false);
                setEditingLote(null);
            }}>
                <DialogTitle>{editingLote ? 'Editar Lote' : 'Agregar Nuevo Lote'}</DialogTitle>
                <DialogContent>
                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            margin="normal"
                            name="nombre_lote"
                            label="Nombre del Lote"
                            value={editingLote ? editingLote.nombre_lote : nuevoLote.nombre_lote}
                            onChange={handleInputChange}
                            required
                        />
                        <FormControl fullWidth margin="normal">
                            <InputLabel id="cultivo-select-label">Cultivo</InputLabel>
                            <Select
                                labelId="cultivo-select-label"
                                name="cultivo_id"
                                value={editingLote ? editingLote.cultivo_id || '' : nuevoLote.cultivo_id || ''}
                                onChange={(e) => {
                                    const selectedId = e.target.value;
                                    const selectedCultivo = cultivos.find(c => c.id === selectedId);
                                    
                                    if (selectedCultivo) {
                                        //('Cultivo seleccionado:', selectedCultivo);
                                        
                                        if (editingLote) {
                                            setEditingLote(prev => ({
                                                ...prev,
                                                cultivo_id: selectedId
                                            }));
                                        } else {
                                            setNuevoLote(prev => ({
                                                ...prev,
                                                cultivo_id: selectedId
                                            }));
                                        }
                                    }
                                }}
                                required
                                label="Cultivo"
                            >
                                <MenuItem value="">
                                    <em>Seleccione un cultivo</em>
                                </MenuItem>
                                {cultivos && cultivos.length > 0 ? (
                                    cultivos.map((cultivo) => (
                                        <MenuItem key={cultivo.id} value={cultivo.id}>
                                            {cultivo.nombre_cultivo}
                                        </MenuItem>
                                    ))
                                ) : (
                                    <MenuItem value="" disabled>
                                        No hay cultivos disponibles
                                    </MenuItem>
                                )}
                            </Select>
                        </FormControl>
                        <TextField
                            fullWidth
                            margin="normal"
                            name="especie"
                            label="Especie"
                            value={editingLote ? editingLote.especie : nuevoLote.especie}
                            onChange={handleInputChange}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="variedad"
                            label="Variedad"
                            value={editingLote ? editingLote.variedad : nuevoLote.variedad}
                            onChange={handleInputChange}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="fecha_siembra"
                            label="Fecha de Siembra"
                            type="date"
                            value={editingLote ? format(parseISO(editingLote.fecha_siembra), 'yyyy-MM-dd') : nuevoLote.fecha_siembra}
                            onChange={handleInputChange}
                            InputLabelProps={{
                                shrink: true,
                            }}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="campaña"
                            label="Campaña"
                            value={editingLote ? editingLote.campaña : nuevoLote.campaña}
                            onChange={handleInputChange}
                            InputLabelProps={{
                                shrink: true,
                            }}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="porcentaje_agua_util_umbral"
                            label="% Agua Útil Umbral"
                            type="number"
                            value={editingLote ? editingLote.porcentaje_agua_util_umbral : nuevoLote.porcentaje_agua_util_umbral}
                            onChange={handleInputChange}
                            InputProps={{ inputProps: { min: 0, max: 100, step: 0.1 } }}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="agua_util_total"
                            label="Agua Útil Total"
                            type="number"
                            value={editingLote ? editingLote.agua_util_total : nuevoLote.agua_util_total}
                            onChange={handleInputChange}
                            InputProps={{ inputProps: { min: 0, step: 0.1 } }}
                            required
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={editingLote ? editingLote.activo : nuevoLote.activo}
                                    onChange={(e) => {
                                        if (editingLote) {
                                            setEditingLote({ ...editingLote, activo: e.target.checked });
                                        } else {
                                            setNuevoLote({ ...nuevoLote, activo: e.target.checked });
                                        }
                                    }}
                                    name="activo"
                                />
                            }
                            label="Lote Activo"
                        />
                        <Button type="submit" variant="contained" color="primary">
                            {editingLote ? 'Actualizar' : 'Agregar'} Lote
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>
            <AguaUtilDialog
                open={openAguaUtilDialog}
                onClose={() => setOpenAguaUtilDialog(false)}
                loteId={selectedLoteId}
                onSave={() => {
                    setOpenAguaUtilDialog(false);
                    fetchLotes();
                }}
            />
            {selectedLote && (
                <EstadoFenologicoDialog
                    open={openEstadoFenologicoDialog}
                    onClose={() => {
                        //console.log("Cerrando diálogo de estado fenológico");
                        setOpenEstadoFenologicoDialog(false);
                        setSelectedLote(null);
                    }}
                    loteId={selectedLote.id}
                    cultivoNombre={selectedLote.nombre_cultivo}
                    onSave={() => {
                        //console.log("Guardando estado fenológico");
                        setOpenEstadoFenologicoDialog(false);
                        setSelectedLote(null);
                        fetchLotes();
                    }}
                />
            )}
        </Container>
    );
}

export default LotesManagement;