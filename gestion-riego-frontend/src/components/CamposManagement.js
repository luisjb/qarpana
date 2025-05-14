import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../axiosConfig';
import {
    Container, Typography, TextField, Button, List, ListItem, ListItemText,
    Select, MenuItem, FormControl, InputLabel, Grid, Dialog, DialogActions,
    DialogContent, DialogContentText, DialogTitle, IconButton, Box
} from '@mui/material';
import { Edit, Delete, Add, Refresh, Map } from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Corregir el problema de los íconos de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

function CamposManagement() {
    const [campos, setCampos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [nuevoCampo, setNuevoCampo] = useState({ nombre_campo: '', ubicacion: '', usuario_id: '', estacion_id: '' });
    const [editingCampo, setEditingCampo] = useState(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
    const [campoToDelete, setCampoToDelete] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [estaciones, setEstaciones] = useState([]);
    const [isLoadingEstaciones, setIsLoadingEstaciones] = useState(false);
    const [openMapDialog, setOpenMapDialog] = useState(false);
    const [selectedEstacion, setSelectedEstacion] = useState(null);
    
    const navigate = useNavigate();

    const checkAdminStatus = () => {
        const userRole = localStorage.getItem('role');
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    };

    useEffect(() => {
        fetchCampos();
        fetchUsuarios();
        fetchEstaciones();
        checkAdminStatus();
    }, []);

    const fetchCampos = async () => {
        try {
            const userRole = localStorage.getItem('role');
            const endpoint = userRole === 'Admin' ? '/campos/all' : '/campos';
            const response = await axios.get(endpoint);
            setCampos(response.data);
        } catch (error) {
            console.error('Error al obtener campos:', error);
        }
    };

    const fetchUsuarios = async () => {
        try {
            const response = await axios.get('/usuarios');
            setUsuarios(response.data);
        } catch (error) {
            console.error('Error al obtener usuarios:', error);
        }
    };

    const fetchEstaciones = async () => {
        try {
            setIsLoadingEstaciones(true);
            const response = await axios.get('/estaciones');
            setEstaciones(response.data);
            setIsLoadingEstaciones(false);
        } catch (error) {
            console.error('Error al obtener estaciones:', error);
            setIsLoadingEstaciones(false);
        }
    };

    const refreshEstaciones = async () => {
        try {
            setIsLoadingEstaciones(true);
            const response = await axios.post('/estaciones/refresh');
            setEstaciones(response.data);
            setIsLoadingEstaciones(false);
        } catch (error) {
            console.error('Error al actualizar estaciones:', error);
            setIsLoadingEstaciones(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (editingCampo) {
            setEditingCampo(prev => ({
                ...prev,
                [name]: value
            }));
        } else {
            setNuevoCampo(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingCampo) {
                await axios.put(`/campos/${editingCampo.id}`, editingCampo);
            } else {
                await axios.post('/campos', nuevoCampo);
            }
            fetchCampos();
            setNuevoCampo({ nombre_campo: '', ubicacion: '', usuario_id: '', estacion_id: '' });
            setEditingCampo(null);
            setOpenDialog(false);
        } catch (error) {
            console.error('Error al guardar campo:', error);
        }
    };

    const handleDelete = async () => {
        try {
            await axios.delete(`/campos/${campoToDelete.id}`);
            fetchCampos();
            setOpenDeleteDialog(false);
        } catch (error) {
            console.error('Error al eliminar campo:', error);
        }
    };

    const handleAddLotes = (campoId) => {
        navigate(`/lotes/${campoId}`);
    };

    const handleOpenMapDialog = (campo = null) => {
        if (campo) {
            setEditingCampo(campo);
        }
        setOpenMapDialog(true);
    };

    const handleSelectEstacion = (estacion) => {
        setSelectedEstacion(estacion);
        
        if (editingCampo) {
            setEditingCampo(prev => ({
                ...prev,
                estacion_id: estacion.code.toString()
            }));
        } else {
            setNuevoCampo(prev => ({
                ...prev,
                estacion_id: estacion.code.toString()
            }));
        }
        
        setOpenMapDialog(false);
    };

    // Función para extraer coordenadas de la ubicación
    const extractCoordinates = (ubicacionStr) => {
        try {
            // Asumiendo que la ubicación puede estar en formato "lat,lng" o un objeto JSON stringificado
            if (ubicacionStr.includes(',')) {
                const [lat, lng] = ubicacionStr.split(',').map(coord => parseFloat(coord.trim()));
                return [lat, lng];
            } else if (ubicacionStr.includes('{')) {
                const ubicObj = JSON.parse(ubicacionStr);
                return [ubicObj.lat, ubicObj.lng];
            }
        } catch (error) {
            console.error('Error al extraer coordenadas:', error);
        }
        // Coordenadas predeterminadas para Córdoba, Argentina
        return [-31.4201, -64.1888];
    };

    // Componente para centrar el mapa en una posición
    function SetViewOnClick({ coords }) {
        const map = useMap();
        useEffect(() => {
            if (coords) {
                map.setView(coords, 13);
            }
        }, [coords, map]);
        return null;
    }

    return (
        <Container maxWidth="md">
            <Typography variant="h4" gutterBottom>Gestión de Campos</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                {isAdmin && (
                    <Button variant="contained" color="primary" onClick={() => setOpenDialog(true)}>
                        Agregar Nuevo Campo
                    </Button>
                )}
                <Button 
                    variant="outlined" 
                    color="secondary" 
                    onClick={refreshEstaciones} 
                    disabled={isLoadingEstaciones}
                    startIcon={<Refresh />}
                >
                    {isLoadingEstaciones ? 'Actualizando...' : 'Actualizar Estaciones'}
                </Button>
            </Box>
            
            <List>
                {campos.map((campo) => {
                    const estacionAsociada = estaciones.find(est => est.code.toString() === campo.estacion_id);
                    
                    return (
                        <ListItem key={campo.id}>
                            <ListItemText
                                primary={campo.nombre_campo}
                                secondary={
                                    <>
                                        <span>Ubicación: {campo.ubicacion || 'No especificada'}</span>
                                        <br />
                                        <span>Usuario: {campo.nombre_usuario || 'No asignado'}</span>
                                        <br />
                                        <span>Estación: {estacionAsociada ? estacionAsociada.title : 'No asignada'}</span>
                                    </>
                                }
                            />
                            <IconButton onClick={() => handleAddLotes(campo.id)}>
                                <Add />
                            </IconButton>
                            <IconButton onClick={() => handleOpenMapDialog(campo)} color="secondary">
                                <Map />
                            </IconButton>
                            {isAdmin && (
                                <>
                                    <IconButton onClick={() => {
                                        setEditingCampo({
                                            ...campo,
                                            usuario_id: campo.usuario_id || '',
                                            ubicacion: campo.ubicacion || '',
                                            estacion_id: campo.estacion_id || ''
                                        });
                                        setOpenDialog(true);
                                    }} color="primary">
                                        <Edit />
                                    </IconButton>
                                    <IconButton onClick={() => {
                                        setCampoToDelete(campo);
                                        setOpenDeleteDialog(true);
                                    }} color="error">
                                        <Delete />
                                    </IconButton>
                                </>
                            )}
                        </ListItem>
                    );
                })}
            </List>

            {/* Diálogo para agregar/editar campo */}
            <Dialog open={openDialog} onClose={() => {
                setOpenDialog(false);
                setEditingCampo(null);
            }}>
                <DialogTitle>{editingCampo ? 'Editar Campo' : 'Agregar Nuevo Campo'}</DialogTitle>
                <DialogContent>
                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            margin="normal"
                            name="nombre_campo"
                            label="Nombre del Campo"
                            value={editingCampo ? editingCampo.nombre_campo : nuevoCampo.nombre_campo}
                            onChange={handleInputChange}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="ubicacion"
                            label="Ubicación"
                            value={editingCampo ? editingCampo.ubicacion : nuevoCampo.ubicacion}
                            onChange={handleInputChange}
                            required
                        />
                        <FormControl fullWidth margin="normal">
                            <InputLabel>Usuario</InputLabel>
                            <Select
                                name="usuario_id"
                                value={editingCampo ? editingCampo.usuario_id || '' : nuevoCampo.usuario_id}
                                onChange={handleInputChange}
                                required
                            >
                                {usuarios.map((usuario) => (
                                    <MenuItem key={usuario.id} value={usuario.id}>
                                        {usuario.nombre_usuario}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth margin="normal">
                            <InputLabel>Estación Meteorológica</InputLabel>
                            <Select
                                name="estacion_id"
                                value={editingCampo ? editingCampo.estacion_id || '' : nuevoCampo.estacion_id}
                                onChange={handleInputChange}
                            >
                                <MenuItem value="">
                                    <em>Ninguna</em>
                                </MenuItem>
                                {estaciones.map((estacion) => (
                                    <MenuItem key={estacion.code} value={estacion.code.toString()}>
                                        {estacion.title}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
                            <Button type="submit" variant="contained" color="primary">
                                {editingCampo ? 'Actualizar' : 'Agregar'} Campo
                            </Button>
                            <Button 
                                variant="outlined" 
                                color="secondary"
                                onClick={() => handleOpenMapDialog(editingCampo || null)}
                            >
                                Seleccionar Estación en Mapa
                            </Button>
                        </Box>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Diálogo para confirmar eliminación */}
            <Dialog
                open={openDeleteDialog}
                onClose={() => setOpenDeleteDialog(false)}
            >
                <DialogTitle>Confirmar Eliminación</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        ¿Estás seguro de que quieres eliminar este campo?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDeleteDialog(false)}>Cancelar</Button>
                    <Button onClick={handleDelete} color="error">Eliminar</Button>
                </DialogActions>
            </Dialog>

            {/* Diálogo para el mapa */}
            <Dialog
                open={openMapDialog}
                onClose={() => setOpenMapDialog(false)}
                fullWidth
                maxWidth="md"
            >
                <DialogTitle>Seleccionar Estación Meteorológica</DialogTitle>
                <DialogContent>
                    <Box sx={{ height: 500, width: '100%' }}>
                        {estaciones.length > 0 ? (
                            <MapContainer 
                                center={[-31.4201, -64.1888]} // Coordenadas de Córdoba, Argentina
                                zoom={8} 
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                />
                                
                                {/* Marcador para el campo actual */}
                                {editingCampo && editingCampo.ubicacion && (
                                    <Marker position={extractCoordinates(editingCampo.ubicacion)}>
                                        <Popup>
                                            {editingCampo.nombre_campo} <br />
                                            (Campo)
                                        </Popup>
                                    </Marker>
                                )}
                                
                                {/* Marcadores para cada estación */}
                                {estaciones.map(estacion => {
                                    // Aquí asumimos que tenemos las coordenadas de las estaciones
                                    // Si no están disponibles, podrías usar geocodificación o agregar esa información
                                    const isSelected = selectedEstacion && selectedEstacion.code === estacion.code;
                                    const markerIcon = isSelected 
                                        ? new L.Icon({
                                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                                            iconSize: [25, 41],
                                            iconAnchor: [12, 41],
                                            popupAnchor: [1, -34],
                                            shadowSize: [41, 41]
                                        })
                                        : new L.Icon.Default();
                                    
                                    return (
                                        <Marker 
                                            key={estacion.code} 
                                            position={[-31.4201 + Math.random() * 0.2, -64.1888 + Math.random() * 0.2]} // Simulación de posiciones
                                            icon={markerIcon}
                                            eventHandlers={{
                                                click: () => handleSelectEstacion(estacion)
                                            }}
                                        >
                                            <Popup>
                                                <div>
                                                    <strong>{estacion.title}</strong><br />
                                                    Código: {estacion.code}<br />
                                                    <Button 
                                                        variant="contained" 
                                                        size="small"
                                                        onClick={() => handleSelectEstacion(estacion)}
                                                    >
                                                        Seleccionar
                                                    </Button>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    );
                                })}

                                {/* Centrar el mapa en el campo si está editando */}
                                {editingCampo && editingCampo.ubicacion && (
                                    <SetViewOnClick coords={extractCoordinates(editingCampo.ubicacion)} />
                                )}
                            </MapContainer>
                        ) : (
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                <Typography variant="body1">
                                    {isLoadingEstaciones 
                                        ? 'Cargando estaciones...' 
                                        : 'No hay estaciones disponibles. Haga clic en "Actualizar Estaciones".'}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenMapDialog(false)}>Cerrar</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default CamposManagement;