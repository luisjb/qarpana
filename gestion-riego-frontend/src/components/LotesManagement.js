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
        agua_util_total: '',
        capacidad_almacenamiento_2m: '', // Nuevo campo para capacidad de almacenamiento a los 2m
        capacidad_extraccion: ''
    });
    const [openDialog, setOpenDialog] = useState(false);
    const [openAguaUtilDialog, setOpenAguaUtilDialog] = useState(false);
    const [editingLote, setEditingLote] = useState(null);
    const [openEstadoFenologicoDialog, setOpenEstadoFenologicoDialog] = useState(false);
    const [selectedLoteId, setSelectedLoteId] = useState(null);
    const [selectedLote, setSelectedLote] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    

    useEffect(() => {
        if (campoId) {
            fetchLotes();
            fetchCultivos(); // Cargar cultivos al inicio
            checkAdminStatus();
        }
    }, [campoId]);
    
    const checkAdminStatus = () => {
        const userRole = localStorage.getItem('role');
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    };

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
                    nombre_cultivo: cultivo.nombre_cultivo,
                    indice_capacidad_extraccion: cultivo.indice_capacidad_extraccion
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
        console.log('Lote a editar:', lote);
        // Establecer explícitamente el cultivo_id del lote
        const loteToEdit = {
            ...lote,
            cultivo_id: lote.cultivo_id
        };
        
        setEditingLote(loteToEdit);
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
            const capacidadExtraccion = parseFloat(loteData.capacidad_extraccion);
            if (isNaN(capacidadExtraccion)) {
                alert('La capacidad de extracción debe ser un número válido');
                return;
            }

            let fechaSiembra = loteData.fecha_siembra;
            if (fechaSiembra) {
                // Usar format para normalizar al formato YYYY-MM-DD sin zona horaria
                fechaSiembra = format(parseISO(fechaSiembra), 'yyyy-MM-dd');
                console.log('Fecha siembra normalizada:', fechaSiembra);
            }
    
            const dataToSend = {
                ...loteData,
                campo_id: parseInt(campoId),
                cultivo_id: parseInt(loteData.cultivo_id),
                fecha_siembra: fechaSiembra,
                activo: loteData.activo,
                porcentaje_agua_util_umbral: parseFloat(loteData.porcentaje_agua_util_umbral),
                agua_util_total: parseFloat(loteData.agua_util_total),
                capacidad_almacenamiento_2m: parseFloat(loteData.capacidad_almacenamiento_2m), // Nuevo campo
                capacidad_extraccion: capacidadExtraccion
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
                agua_util_total: '',
                capacidad_almacenamiento_2m: '', // Resetear el nuevo campo
                capacidad_extraccion: ''
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
            agua_util_total: '',
            capacidad_almacenamiento_2m: '', // Resetear el nuevo campo
            capacidad_extraccion: ''
        });
    };

    return (
        <Container maxWidth="md">
            <Typography variant="h4" gutterBottom>Lotes del Campo: {nombreCampo}</Typography>
            {isAdmin && (
                <Button variant="contained" color="primary" onClick={() => setOpenDialog(true)}>
                    Agregar Nuevo Lote
                </Button>
            )}
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
                        {isAdmin && (    
                            <>
                                <IconButton onClick={() => handleEdit(lote)} color="primary">
                                    <Edit />
                                </IconButton>
                                <IconButton onClick={() => handleDelete(lote.id)} color="error">
                                    <Delete />
                                </IconButton>
                            </>
                        )}
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
                                        let indiceCapacidadExtraccion;
                                        try {
                                            indiceCapacidadExtraccion = parseFloat(selectedCultivo.indice_capacidad_extraccion);
                                            if (isNaN(indiceCapacidadExtraccion)) {
                                                console.warn('El índice de capacidad de extracción no es un número válido:', selectedCultivo.indice_capacidad_extraccion);
                                                indiceCapacidadExtraccion = 5; // Valor predeterminado si no es válido
                                            }
                                        } catch (error) {
                                            console.error('Error al convertir índice de capacidad de extracción:', error);
                                            indiceCapacidadExtraccion = 5; // Valor predeterminado en caso de error
                                        }
                                        
                                        console.log('Índice de capacidad de extracción (después de validar):', indiceCapacidadExtraccion);
                                        if (editingLote) {
                                            setEditingLote(prev => {
                                                // Si no hay capacidad_extraccion o está cambiando el cultivo,
                                                // usamos el índice del cultivo
                                                const useCapacidadExtraccion = prev.cultivo_id === selectedId && prev.capacidad_extraccion
                                                    ? prev.capacidad_extraccion
                                                    : indiceCapacidadExtraccion;
                                                
                                                return {
                                                    ...prev,
                                                    cultivo_id: selectedId,
                                                    capacidad_extraccion: useCapacidadExtraccion
                                                };
                                            });
                                        } else {
                                            setNuevoLote(prev => ({
                                                ...prev,
                                                cultivo_id: selectedId,
                                                capacidad_extraccion: indiceCapacidadExtraccion
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
                            label="Capacidad de Almacenamiento (1m)"
                            type="number"
                            value={editingLote ? editingLote.agua_util_total : nuevoLote.agua_util_total}
                            onChange={handleInputChange}
                            InputProps={{ inputProps: { min: 0, step: 0.1 } }}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="capacidad_almacenamiento_2m"
                            label="Capacidad de Almacenamiento (2m)"
                            type="number"
                            value={editingLote ? editingLote.capacidad_almacenamiento_2m : nuevoLote.capacidad_almacenamiento_2m}
                            onChange={handleInputChange}
                            InputProps={{ inputProps: { min: 0, step: 0.1 } }}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="capacidad_extraccion"
                            label="Capacidad de Extracción (%)"
                            type="number"
                            value={editingLote ? (isNaN(parseFloat(editingLote.capacidad_extraccion)) ? 5 : editingLote.capacidad_extraccion) : 
                                (isNaN(parseFloat(nuevoLote.capacidad_extraccion)) ? 5 : nuevoLote.capacidad_extraccion)}                            onChange={handleInputChange}
                            InputProps={{ inputProps: { min: 0, max: 100, step: 0.1 } }}
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