import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../axiosConfig';
import {
    Container, Typography, TextField, Button, List, ListItem, ListItemText,
    Select, MenuItem, FormControl, InputLabel, Grid, Dialog, DialogActions,
    DialogContent, DialogContentText, DialogTitle, IconButton, Box, Chip, CircularProgress 
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
    const [nuevoCampo, setNuevoCampo] = useState({ 
        nombre_campo: '', 
        ubicacion: '', 
        usuarios_ids: [], 
        estacion_id: '' 
    });
    const [editingCampo, setEditingCampo] = useState(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
    const [campoToDelete, setCampoToDelete] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [estaciones, setEstaciones] = useState([]);
    const [isLoadingEstaciones, setIsLoadingEstaciones] = useState(false);
    const [isLoadingCampos, setIsLoadingCampos] = useState(false);
    const [openMapDialog, setOpenMapDialog] = useState(false);
    const [selectedEstacion, setSelectedEstacion] = useState(null);
    
    const navigate = useNavigate();

    const checkAdminStatus = () => {
        const userRole = localStorage.getItem('role');
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    };

    useEffect(() => {
        const loadInitialData = async () => {
            await Promise.all([
                fetchUsuarios(),
                fetchEstaciones()
            ]);
            fetchCampos();
        };
        
        loadInitialData();
        checkAdminStatus();
    }, []);

    const fetchCampos = async () => {
        console.log('Iniciando fetchCampos()');

        try {
            setIsLoadingCampos(true);
            const userRole = localStorage.getItem('role');
            const endpoint = userRole === 'Admin' ? '/campos/all' : '/campos';
            const response = await axios.get(endpoint);
            const camposProcesados = response.data.map(campo => {
                return {
                    ...campo,
                    // Asegurar que usuarios_ids sea un array
                    usuarios_ids: campo.usuarios_ids || (campo.usuario_id ? [campo.usuario_id] : [])
                };
            });
            console.log('Datos de campos obtenidos:', response.data);

            setCampos(camposProcesados);
            setIsLoadingCampos(false);
        } catch (error) {
            console.error('Error al obtener campos:', error);
            setIsLoadingCampos(false);
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
            
            // Normalizar propiedades de estaciones
            const estacionesNormalizadas = response.data.map(estacion => {
                return {
                    ...estacion,
                    code: estacion.code || estacion.codigo || '',
                    title: estacion.title || estacion.titulo || 'Estación sin nombre'
                };
            });
            
            setEstaciones(estacionesNormalizadas);
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
             // Normalizar propiedades
            const estacionesNormalizadas = response.data.map(estacion => {
                return {
                    ...estacion,
                    code: estacion.code || estacion.codigo || '',
                    title: estacion.title || estacion.titulo || 'Estación sin nombre'
                };
            });
            
            setEstaciones(estacionesNormalizadas);
            fetchCampos();
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

    const handleUsuariosChange = (e) => {
        const value = e.target.value;
        if (editingCampo) {
            setEditingCampo(prev => ({
                ...prev,
                usuarios_ids: value
            }));
        } else {
            setNuevoCampo(prev => ({
                ...prev,
                usuarios_ids: value
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            let response;
            if (editingCampo) {
                console.log('Actualizando campo:', editingCampo);

            response = await axios.put(`/campos/${editingCampo.id}`, editingCampo);
            console.log('Respuesta de actualización:', response.data);            
            } else {
                console.log('Creando nuevo campo:', nuevoCampo);
                response = await axios.post('/campos', nuevoCampo);
                console.log('Respuesta de creación:', response.data);
            }
            if (editingCampo) {
                // Actualizar el campo en la lista local
                setCampos(prevCampos => 
                    prevCampos.map(c => 
                        c.id === response.data.id ? response.data : c
                    )
                );
            } else {
                // Añadir el nuevo campo a la lista local
                setCampos(prevCampos => [...prevCampos, response.data]);
            }
            
            // Luego refrescar toda la lista
            await fetchCampos();
            
            setNuevoCampo({ nombre_campo: '', ubicacion: '', usuarios_ids: [], estacion_id: '' });
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
                estacion_id: String(estacion.code)
            }));
        } else {
            setNuevoCampo(prev => ({
                ...prev,
                estacion_id: String(estacion.code)
            }));
        }
        
        setOpenMapDialog(false);
    };

    // Función para extraer coordenadas de la ubicación
    const extractCoordinates = (ubicacionStr) => {
        try {
            // Asumiendo que la ubicación puede estar en formato "lat,lng" o un objeto JSON stringificado
            if (ubicacionStr && ubicacionStr.includes(',')) {
                const [lat, lng] = ubicacionStr.split(',').map(coord => parseFloat(coord.trim()));
                return [lat, lng];
            } else if (ubicacionStr && ubicacionStr.includes('{')) {
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
    function SetViewOnClick({ coords, zoomLevel = 7 }) {
        const map = useMap();
        useEffect(() => {
            if (coords) {
                map.setView(coords, zoomLevel);
            } else {
                // Si no hay coordenadas, centrar en Córdoba con un zoom que muestre la provincia
                map.setView([-31.4201, -64.1888], 7);
            }
        }, [coords, map, zoomLevel]);
        return null;
    }

    // Función auxiliar para encontrar una estación asociada segura
    const findEstacionAsociada = (campo) => {
        console.log('Buscando estación para campo:', campo);

        if (!campo || !campo.estacion_id || !estaciones || estaciones.length === 0) {
            console.log('No hay datos suficientes para buscar estación');
            return null;
        }
        
        // Convertir estacion_id a string para comparar
        const estacionId = String(campo.estacion_id);
        console.log('Buscando estación con ID:', estacionId);
        const estacion = estaciones.find(est => est && 
            (String(est.code || '') === estacionId || String(est.codigo || '') === estacionId));
        
        console.log('Estación encontrada:', estacion);
        return estacion;
    };

    // Obtener los nombres de los usuarios asignados a un campo
    const getUsersNamesForCampo = (campo) => {
        console.log('Obteniendo nombres de usuarios para campo:', campo);

        if (!campo || (!campo.usuarios_ids && !campo.usuario_id) || !usuarios || usuarios.length === 0) {
            console.log('No hay usuarios asignados o campo no válido');
            return 'No asignado';
        }
        
        // Si tenemos array de usuarios_ids, lo usamos; si no, usamos usuario_id
        const userIds =Array.isArray(campo.usuarios_ids) ? campo.usuarios_ids : 
                            (campo.usuario_id ? [campo.usuario_id] : []);
        
        // Si no hay usuarios asignados
        if (!userIds.length) {
            console.log('No hay IDs de usuarios');
            return 'No asignado';
        }
        
        // Obtener nombres de los usuarios
        // Obtener nombres de los usuarios
        const userNames = userIds
            .map(id => {
                const user = usuarios.find(u => u.id === id);
                console.log('Buscando usuario con ID:', id, 'Encontrado:', user);
                return user ? user.nombre_usuario : 'Usuario desconocido';
            })
            .filter(name => name !== 'Usuario desconocido')
            .join(', ');
        
        console.log('Nombres de usuarios encontrados:', userNames);
        return userNames || 'No asignado';
    };

    return (
        <Container maxWidth="md">
            <Typography variant="h4" gutterBottom>Gestión de Campos</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                {isAdmin && (
                    <Button variant="contained" color="primary" onClick={() => setOpenDialog(true)}>
                        Agregar Nuevo Campo
                    </Button>
                )}  
                {isAdmin && (
                    <Button 
                    variant="outlined" 
                    color="secondary" 
                    onClick={refreshEstaciones} 
                    disabled={isLoadingEstaciones}
                    startIcon={isLoadingEstaciones ? <CircularProgress size={24} /> : <Refresh />}
                    >
                        {isLoadingEstaciones ? 'Actualizando...' : 'Actualizar Estaciones'}
                    </Button>
                )}
            </Box>
            {isLoadingCampos ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <List>
                    {campos.map((campo) => {
                        const estacionAsociada = findEstacionAsociada(campo);
                        
                        return (
                            <ListItem key={campo.id}>
                                <ListItemText
                                    primary={campo.nombre_campo}
                                    secondary={
                                        <>
                                            <span>Ubicación: {campo.ubicacion || 'No especificada'}</span>
                                            <br />
                                            <span>Usuarios: {getUsersNamesForCampo(campo)}</span>
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
                                            // Preparamos el campo para edición
                                            const usuariosIds = campo.usuarios_ids || 
                                                            (campo.usuario_id ? [campo.usuario_id] : []);
                                            
                                            setEditingCampo({
                                                ...campo,
                                                ubicacion: campo.ubicacion || '',
                                                estacion_id: campo.estacion_id || '',
                                                usuarios_ids: usuariosIds
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
            )}
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
                            <InputLabel>Usuarios</InputLabel>
                            <Select
                                multiple
                                name="usuarios_ids"
                                value={editingCampo ? (editingCampo.usuarios_ids || []) : (nuevoCampo.usuarios_ids || [])}
                                onChange={handleUsuariosChange}
                                renderValue={(selected) => (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {selected.map((value) => {
                                            const user = usuarios.find(u => u.id === value);
                                            return (
                                                <Chip 
                                                    key={value} 
                                                    label={user ? user.nombre_usuario : 'Usuario desconocido'} 
                                                />
                                            );
                                        })}
                                    </Box>
                                )}
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
                                {estaciones.map((estacion) => {
                                    const estacionCode = estacion.code ? String(estacion.code) : 
                                                        estacion.codigo ? String(estacion.codigo) : '';
                                    
                                    return (
                                        <MenuItem key={estacionCode} value={estacionCode}>
                                            {estacion.title || estacion.titulo || 'Estación sin nombre'}
                                        </MenuItem>
                                    );
                                })}
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
                                zoom={4} 
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
                                    // Usar coordenadas reales de la API
                                    const latitude = estacion.latitude || 
                                                   estacion.latitud || 
                                                   (estacion.datos_json && typeof estacion.datos_json === 'string' 
                                                    ? JSON.parse(estacion.datos_json).latitude 
                                                    : null) || 
                                                   "-31.4201";
                                    
                                    const longitude = estacion.longitude || 
                                                    estacion.longitud || 
                                                    (estacion.datos_json && typeof estacion.datos_json === 'string' 
                                                     ? JSON.parse(estacion.datos_json).longitude 
                                                     : null) || 
                                                    "-64.1888";
                                    
                                    const estacionCoords = [
                                        parseFloat(latitude),
                                        parseFloat(longitude)
                                    ];
                                    
                                    const isSelected = selectedEstacion && String(selectedEstacion.code) === String(estacion.code);
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
                                            position={estacionCoords} // Usar coordenadas reales
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