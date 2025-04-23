import React, { useState, useEffect } from 'react';
import axios from '../axiosConfig';
import {
    Container, Typography, TextField, Button, Select, MenuItem,
    FormControl, InputLabel, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, Dialog,
    DialogActions, DialogContent, DialogTitle, IconButton,
    Grid, Checkbox, ListItemText, OutlinedInput
} from '@mui/material';
import { Edit, Delete, CloudUpload } from '@mui/icons-material';

function CambiosDiarios() {
    const [campos, setCampos] = useState([]);
    const [lotes, setLotes] = useState([]);
    const [cambiosDiarios, setCambiosDiarios] = useState([]);
    const [selectedCampo, setSelectedCampo] = useState('');
    const [selectedLote, setSelectedLote] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [editing, setEditing] = useState(false);
    const [openEvapDialog, setOpenEvapDialog] = useState(false);
    const [evapMasiva, setEvapMasiva] = useState([{ fecha: '', evapotranspiracion: '', precipitaciones: '' }]);
    const [tipoEvapMasiva, setTipoEvapMasiva] = useState('campo');
    const [selectedItems, setSelectedItems] = useState([]);
    const [availableItems, setAvailableItems] = useState([]);
    const initialCambioState = {
        fecha_cambio: new Date().toISOString().split('T')[0],
        riego_cantidad: '',
        riego_fecha_inicio: '',
        precipitaciones: '',
        humedad: '',
        temperatura: '',
        evapotranspiracion: '',
        etc: '',
        correccion_agua: ''
    };
    const [formData, setFormData] = useState({
        fecha_cambio: new Date().toISOString().split('T')[0], // Fecha actual por defecto
        riego_fecha_inicio: '',
    });
    

    
    const [currentCambio, setCurrentCambio] = useState(initialCambioState);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        fetchCampos();
        checkAdminStatus();
    }, []);

    useEffect(() => {
        if (openEvapDialog) {
            fetchAvailableItems();
        }
    }, [openEvapDialog, tipoEvapMasiva]);

    const checkAdminStatus = () => {
        const userRole = localStorage.getItem('role');
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    };

    const fetchCampos = async () => {
        try {
            const userRole = localStorage.getItem('role');
            const endpoint = userRole === 'Admin' ? '/campos/all' : '/campos';
            const response = await axios.get(endpoint);
            console.log('Campos fetched:', response.data);
            setCampos(response.data);
        } catch (error) {
            console.error('Error al obtener campos:', error);
        }
    };

    const fetchLotes = async (campoId) => {
        try {
            const response = await axios.get(`/lotes/campo/${campoId}`);
            console.log('Lotes fetched:', response.data);
            
            // Verificar si la respuesta tiene la estructura esperada
            if (response.data && Array.isArray(response.data.lotes)) {
                setLotes(response.data.lotes);
            } else if (Array.isArray(response.data)) {
                setLotes(response.data);
            } else {
                console.error('Formato de respuesta inesperado para lotes:', response.data);
                setLotes([]);
            }
        } catch (error) {
            console.error('Error al obtener lotes:', error);
            setLotes([]);
        }
    };
    

    const fetchCambiosDiarios = async (loteId) => {
        try {
            const response = await axios.get(`/cambios-diarios/${loteId}`);
            console.log('Cambios diarios fetched:', response.data);
            setCambiosDiarios(response.data);
        } catch (error) {
            console.error('Error al obtener cambios diarios:', error);
        }
    };

    const handleCampoChange = (event) => {
        const campoId = event.target.value;
        console.log('Campo seleccionado:', campoId);
        setSelectedCampo(campoId);
        setSelectedLote('');
        setCambiosDiarios([]);
        fetchLotes(campoId);
    };

    const handleLoteChange = (event) => {
        const loteId = event.target.value;
        console.log('Lote seleccionado:', loteId);
        setSelectedLote(loteId);
        fetchCambiosDiarios(loteId);
    };

    const handleInputChange = (event) => {
        const { name, value } = event.target;
        if (name === 'fecha_cambio') {
            setCurrentCambio(prev => ({
                ...prev,
                [name]: value || new Date().toISOString().split('T')[0]
            }));
        } else if (name === 'riego_fecha_inicio') {
            setCurrentCambio(prev => ({
                ...prev,
                [name]: value // Mantener vacío si no hay valor
            }));
        } else {
            const numericValue = value === '' ? 0 : parseFloat(value);
            setCurrentCambio(prev => ({
                ...prev,
                [name]: isNaN(numericValue) ? 0 : numericValue
            }));
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            const dataToSend = {
                ...currentCambio,
                fecha_cambio: currentCambio.fecha_cambio || new Date().toISOString().split('T')[0],
                riego_fecha_inicio: currentCambio.riego_fecha_inicio || null,
                // Convertir a números solo al enviar, permitiendo valores vacíos
                riego_cantidad: currentCambio.riego_cantidad === '' ? 0 : Number(currentCambio.riego_cantidad),
                precipitaciones: currentCambio.precipitaciones === '' ? 0 : Number(currentCambio.precipitaciones),
                humedad: currentCambio.humedad === '' ? 0 : Number(currentCambio.humedad),
                temperatura: currentCambio.temperatura === '' ? 0 : Number(currentCambio.temperatura),
                evapotranspiracion: currentCambio.evapotranspiracion === '' ? 0 : Number(currentCambio.evapotranspiracion),
                correccion_agua: currentCambio.correccion_agua === '' ? 0 : Number(currentCambio.correccion_agua)
            };
    
            if (editing) {
                await axios.put(`/cambios-diarios/${currentCambio.id}`, dataToSend);
            } else {
                await axios.post('/cambios-diarios', { ...dataToSend, lote_id: selectedLote });
            }
            
            fetchCambiosDiarios(selectedLote);
            setOpenDialog(false);
            setEditing(false);
            setCurrentCambio(initialCambioState);
        } catch (error) {
            console.error('Error al guardar cambio diario:', error);
        }
    };

    const handleEdit = (cambio) => {
        setCurrentCambio(cambio);
        setEditing(true);
        setOpenDialog(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este cambio diario?')) {
            try {
                await axios.delete(`/cambios-diarios/${id}`);
                fetchCambiosDiarios(selectedLote);
            } catch (error) {
                console.error('Error al eliminar cambio diario:', error);
            }
        }
    };

    const handleEvapInputChange = (index, event) => {
        const { name, value } = event.target;
        const newEvapMasiva = [...evapMasiva];
        // Convertir valores numéricos vacíos a 0
        if (name === 'evapotranspiracion') {
            const numericValue = value === '' ? 0 : parseFloat(value);
            newEvapMasiva[index] = { 
                ...newEvapMasiva[index], 
                [name]: isNaN(numericValue) ? 0 : numericValue 
            };
        } else {
            newEvapMasiva[index] = { ...newEvapMasiva[index], [name]: value };
        }
        setEvapMasiva(newEvapMasiva);
    };

    const handleAddEvapRow = () => {
        setEvapMasiva([...evapMasiva, { fecha: '', evapotranspiracion: '' }]);
    };

    const handleRemoveEvapRow = (index) => {
        const newEvapMasiva = evapMasiva.filter((_, i) => i !== index);
        setEvapMasiva(newEvapMasiva);
    };

    const handleEvapMasivaSubmit = async () => {
        try {
            const response = await axios.post('/cambios-diarios/evapotranspiracion-masiva', {
                datos: evapMasiva,
                tipo: tipoEvapMasiva,
                ids: selectedItems
            });
            console.log('Respuesta del servidor:', response.data);
            setOpenEvapDialog(false);
            // Refrescar los datos de cambios diarios para todos los lotes afectados
            if (tipoEvapMasiva === 'campo') {
                for (const campoId of selectedItems) {
                    const lotesResponse = await axios.get(`/lotes/campo/${campoId}`);
                    for (const lote of lotesResponse.data.lotes) {
                        await fetchCambiosDiarios(lote.id);
                    }
                }
            } else {
                for (const loteId of selectedItems) {
                    await fetchCambiosDiarios(loteId);
                }
            }
        } catch (error) {
            console.error('Error al cargar evapotranspiración masiva:', error);
            if (error.response) {
                console.error('Detalles del error:', error.response.data);
            }
        }
    };

    const handleItemSelection = (event) => {
        const {
            target: { value },
        } = event;
        setSelectedItems(
            typeof value === 'string' ? value.split(',') : value,
        );
    };

    const fetchAvailableItems = async () => {
        try {
            const userRole = localStorage.getItem('role');
            const endpoint = userRole === 'Admin' ? '/campos/all' : '/campos';
            const response = await axios.get(endpoint);
            setAvailableItems(response.data.map(campo => ({
                id: campo.id,
                nombre: campo.nombre_campo
            })));
        } catch (error) {
            console.error('Error al obtener los campos:', error);
            setAvailableItems([]);
        }
    };
    

    const formatDate = (dateString) => {
        if (!dateString) return '';
        try {
            // Handle both date-only strings and full ISO strings
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return ''; // Invalid date
            return date.toISOString().split('T')[0];
        } catch (e) {
            console.error('Error formatting date:', e);
            return '';
        }
    };
    


    return (
        <Container maxWidth="lg">
            <Typography variant="h4" gutterBottom>
                Cambios Diarios
            </Typography>
            <FormControl fullWidth margin="normal">
                <InputLabel>Campo</InputLabel>
                <Select 
                value={selectedCampo} 
                onChange={handleCampoChange}
                label="Campo">
                    {campos.map((campo) => (
                        <MenuItem key={campo.id} value={campo.id}>{campo.nombre_campo}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            <FormControl fullWidth margin="normal">
            <InputLabel>Lote</InputLabel>
            <Select 
                value={selectedLote} 
                onChange={handleLoteChange} 
                disabled={!selectedCampo}
                label="Lote"
            >
                {Array.isArray(lotes) && lotes.map((lote) => (
                    <MenuItem key={lote.id} value={lote.id}>
                        {lote.nombre_lote}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
            <Button
                variant="contained"
                color="primary"
                onClick={() => setOpenDialog(true)}
                disabled={!selectedLote}
                style={{ marginTop: '20px' }}
            >
                Agregar Cambio Diario
            </Button>
            <Button
                variant="contained"
                color="primary"
                onClick={() => setOpenEvapDialog(true)}
                disabled={!selectedCampo && !selectedLote}
                style={{ marginTop: '20px', marginLeft: '10px' }}
            >
                Carga Masiva Evapotranspiración
            </Button>
            
            <TableContainer component={Paper} style={{ marginTop: '20px' }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Fecha de Registro</TableCell>
                            <TableCell>Riego (mm)</TableCell>
                            <TableCell>Fecha Inicio Riego</TableCell>
                            <TableCell>Precipitaciones (mm)</TableCell>
                            <TableCell>Humedad (%)</TableCell>
                            <TableCell>Temperatura (°C)</TableCell>
                            <TableCell>Evapotranspiración (mm)</TableCell>
                            <TableCell>Corrección Agua (mm)</TableCell>
                            <TableCell>ETC</TableCell>
                            <TableCell>Lluvia Efectiva (mm)</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {cambiosDiarios.map((cambio) => (
                            <TableRow key={cambio.id}>
                                <TableCell>
                                    {cambio.fecha_cambio ? formatDate(cambio.fecha_cambio) : '-'}
                                </TableCell>
                                <TableCell>{cambio.riego_cantidad !== null ? parseFloat(cambio.riego_cantidad).toFixed(2) : '-'}</TableCell>
                                <TableCell>{cambio.riego_fecha_inicio ? new Date(cambio.riego_fecha_inicio).toLocaleDateString() : '-'}</TableCell>
                                <TableCell>{cambio.precipitaciones !== null ? parseFloat(cambio.precipitaciones).toFixed(2) : '-'}</TableCell>
                                <TableCell>{cambio.humedad !== null ? parseFloat(cambio.humedad).toFixed(2) : '-'}</TableCell>
                                <TableCell>{cambio.temperatura !== null ? parseFloat(cambio.temperatura).toFixed(2) : '-'}</TableCell>
                                <TableCell>{cambio.evapotranspiracion !== null ? parseFloat(cambio.evapotranspiracion).toFixed(2) : '-'}</TableCell>
                                <TableCell>{cambio.correccion_agua !== null ? parseFloat(cambio.correccion_agua).toFixed(2) : '-'}</TableCell>
                                <TableCell>{cambio.etc !== null ? parseFloat(cambio.etc).toFixed(2) : '-'}</TableCell>
                                <TableCell>{cambio.lluvia_efectiva !== null ? parseFloat(cambio.lluvia_efectiva).toFixed(2) : '-'}</TableCell>
                                <TableCell>
                                    <IconButton onClick={() => handleEdit(cambio)} color="primary">
                                        <Edit />
                                    </IconButton>
                                    <IconButton onClick={() => handleDelete(cambio.id)} color="error">
                                        <Delete />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Dialog 
                open={openEvapDialog} 
                onClose={() => setOpenEvapDialog(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>Carga Masiva de Evapotranspiración</DialogTitle>
                <DialogContent>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth margin="normal">
                            <InputLabel>Campos</InputLabel>
                            <Select
                                multiple
                                value={selectedItems}
                                onChange={handleItemSelection}
                                label="Campo"
                                renderValue={(selected) => selected.map(id => 
                                    availableItems.find(item => item.id.toString() === id.toString())?.nombre
                                ).join(', ')}
                            >
                                {availableItems.map((item) => (
                                    <MenuItem key={item.id} value={item.id}>
                                        <Checkbox checked={selectedItems.indexOf(item.id.toString()) > -1} />
                                        <ListItemText primary={item.nombre} />
                                    </MenuItem>
                                ))}
                            </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                    {evapMasiva.map((item, index) => (
                        <Grid container spacing={2} key={index} alignItems="center" style={{ marginTop: '10px' }}>
                            <Grid item xs={5}>
                                <TextField
                                    fullWidth
                                    name="fecha"
                                    label="Fecha"
                                    type="date"
                                    value={item.fecha}
                                    onChange={(e) => handleEvapInputChange(index, e)}
                                    InputLabelProps={{ shrink: true }}
                                    required
                                />
                            </Grid>
                            <Grid item xs={5}>
                                <TextField
                                    fullWidth
                                    name="evapotranspiracion"
                                    label="Evapotranspiración"
                                    type="number"
                                    value={item.evapotranspiracion}
                                    onChange={(e) => handleEvapInputChange(index, e)}
                                />
                            </Grid>
                            <Grid item xs={3}>
                                <TextField
                                    fullWidth
                                    name="precipitaciones"
                                    label="Precipitaciones"
                                    type="number"
                                    value={item.precipitaciones || ''}
                                    onChange={(e) => handleEvapInputChange(index, e)}
                                />
                            </Grid>
                            <Grid item xs={2}>
                                <IconButton onClick={() => handleRemoveEvapRow(index)} color="error">
                                    <Delete />
                                </IconButton>
                            </Grid>
                        </Grid>
                    ))}
                    <Button 
                        onClick={handleAddEvapRow}
                        startIcon={<CloudUpload />}
                        style={{ marginTop: '20px' }}
                    >
                        Añadir Fila
                    </Button>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenEvapDialog(false)}>Cancelar</Button>
                    <Button 
                        onClick={handleEvapMasivaSubmit} 
                        color="primary" 
                        variant="contained"
                        disabled={selectedItems.length === 0 || evapMasiva.length === 0}
                    >
                        Cargar
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog open={openDialog} onClose={() => {
                setOpenDialog(false);
                setEditing(false);
                setCurrentCambio(initialCambioState);
            }}>
                <DialogTitle>{editing ? 'Editar Cambio Diario' : 'Agregar Cambio Diario'}</DialogTitle>
                <DialogContent>
                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            margin="normal"
                            name="fecha_cambio"
                            label="Fecha de Registro"
                            type="date"
                            value={currentCambio.fecha_cambio}
                            onChange={handleInputChange}
                            InputLabelProps={{ shrink: true }}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="riego_cantidad"
                            label="Cantidad de riego (mm)"
                            type="number"
                            value={currentCambio.riego_cantidad}
                            onChange={handleInputChange}
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="riego_fecha_inicio"
                            label="Fecha de inicio de riego"
                            type="date"
                            value={currentCambio.riego_fecha_inicio || ''}
                            onChange={handleInputChange}
                            InputLabelProps={{ shrink: true }}
                            required={false}
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="precipitaciones"
                            label="Precipitaciones (mm)"
                            type="number"
                            value={currentCambio.precipitaciones}
                            onChange={handleInputChange}
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="correccion_agua"
                            label="Corrección de Agua (mm)"
                            type="number"
                            value={currentCambio.correccion_agua}
                            onChange={handleInputChange}
                            helperText="Valor positivo para incrementar, negativo para reducir"
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="humedad"
                            label="Humedad (%)"
                            type="number"
                            value={currentCambio.humedad}
                            onChange={handleInputChange}
                            disabled={!isAdmin}
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="temperatura"
                            label="Temperatura (°C)"
                            type="number"
                            value={currentCambio.temperatura}
                            onChange={handleInputChange}
                            disabled={!isAdmin}
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="evapotranspiracion"
                            label="Evapotranspiración (mm)"
                            type="number"
                            value={currentCambio.evapotranspiracion}
                            onChange={handleInputChange}
                            disabled={!isAdmin}
                        />
                    </form>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => {
                        setOpenDialog(false);
                        setEditing(false);
                    }}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} color="primary">
                        {editing ? 'Actualizar' : 'Agregar'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default CambiosDiarios;