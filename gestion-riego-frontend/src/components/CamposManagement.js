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
    // Estados del componente
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

    // Funciones de utilidad
    const checkAdminStatus = () => {
        const userRole = localStorage.getItem('role');
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    };

    const extractCoordinates = (ubicacionStr) => {
        try {
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
        return [-31.4201, -64.1888]; // Coordenadas predeterminadas para Córdoba, Argentina
    };

    // Funciones auxiliares para trabajar con módulos de estaciones
    const tieneModuloTemperatura = (estacion) => {
        if (!estacion || !estacion.modules) return false;
        return estacion.modules.some(modulo => 
            modulo.type && modulo.type.toLowerCase().includes('temperatura')
        );
    };

    const tieneModuloHumedad = (estacion) => {
        if (!estacion || !estacion.modules) return false;
        return estacion.modules.some(modulo => 
            modulo.type && modulo.type.toLowerCase().includes('humedad')
        );
    };

    const tieneModuloLluvia = (estacion) => {
        if (!estacion || !estacion.modules) return false;
        return estacion.modules.some(modulo => 
            modulo.type && (
                modulo.type.toLowerCase().includes('lluvia') ||
                modulo.type.toLowerCase().includes('precipitación') ||
                modulo.type.toLowerCase().includes('registro de lluvia')
            )
        );
    };

    const tieneModuloEvapotranspiracion = (estacion) => {
        if (!estacion || !estacion.modules) return false;
        return estacion.modules.some(modulo =>
            modulo.type && modulo.type.toLowerCase().includes('evapotranspiración')
        );
    };

    const obtenerModulosPorTipo = (estacion, tipo) => {
        if (!estacion || !estacion.modules) return [];
        return estacion.modules.filter(modulo => 
            modulo.type && modulo.type.toLowerCase().includes(tipo.toLowerCase())
        );
    };

    const getResumenSensores = (estacion) => {
        if (!estacion || !estacion.modules || estacion.modules.length === 0) {
            return 'Sin sensores disponibles';
        }
        
        const sensores = [];
        if (tieneModuloTemperatura(estacion)) sensores.push('Temperatura');
        if (tieneModuloHumedad(estacion)) sensores.push('Humedad');
        if (tieneModuloLluvia(estacion)) sensores.push('Lluvia');
        
        const otrosTipos = ['Viento', 'Presión', 'Radiación Solar'];
        otrosTipos.forEach(tipo => {
            if (estacion.modules.some(m => m.type && m.type.toLowerCase().includes(tipo.toLowerCase()))) {
                sensores.push(tipo);
            }
        });
        
        return sensores.length > 0 ? sensores.join(', ') : 'Otros sensores disponibles';
    };

    const findEstacionAsociada = (campo) => {
        if (!campo || !campo.estacion_id || !estaciones || estaciones.length === 0) {
            console.log('Sin datos para buscar estación:', { 
                campo: !!campo, 
                estacion_id: campo?.estacion_id, 
                estaciones_length: estaciones?.length 
            });
            return null;
        }
        
        const estacionId = String(campo.estacion_id).trim();
        console.log('Buscando estación con ID:', estacionId);
        
        const estacionEncontrada = estaciones.find(est => {
            if (!est) return false;
            
            const estCode = String(est.code || '').trim();
            const estCodigo = String(est.codigo || '').trim();
            
            const coincide = estCode === estacionId || estCodigo === estacionId;
            
            if (coincide) {
                console.log('Estación encontrada:', { 
                    titulo: est.title || est.titulo,
                    code: estCode,
                    codigo: estCodigo,
                    buscado: estacionId 
                });
            }
            
            return coincide;
        });
        
        if (!estacionEncontrada) {
            console.log('No se encontró estación para ID:', estacionId);
            console.log('Estaciones disponibles:', estaciones.map(e => ({
                title: e.title || e.titulo,
                code: e.code,
                codigo: e.codigo
            })));
        }
        
        return estacionEncontrada;
    };

    const getUsersNamesForCampo = (campo) => {
        if (campo.nombre_usuario) {
            return campo.nombre_usuario;
        }
        
        if (Array.isArray(campo.usuarios_ids) && campo.usuarios_ids.length > 0) {
            const userNames = campo.usuarios_ids
                .map(id => {
                    const user = usuarios.find(u => u.id === id);
                    return user ? user.nombre_usuario : null;
                })
                .filter(Boolean)
                .join(', ');
            
            if (userNames) {
                return userNames;
            }
        }
        
        if (campo.usuario_id) {
            const user = usuarios.find(u => u.id === campo.usuario_id);
            if (user) {
                return user.nombre_usuario;
            }
        }
        
        return 'No asignado';
    };

    // Funciones de API
    const fetchCampos = async () => {
        try {
            setIsLoadingCampos(true);
            const userRole = localStorage.getItem('role');
            const endpoint = userRole === 'Admin' ? '/campos/all' : '/campos';
            const response = await axios.get(endpoint);
            
            const camposProcesados = response.data.map(campo => {
                return {
                    ...campo,
                    usuarios_ids: campo.usuarios_ids || (campo.usuario_id ? [campo.usuario_id] : [])
                };
            });

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
            console.log('Usuarios cargados:', response.data); 
            setUsuarios(response.data);
        } catch (error) {
            console.error('Error al obtener usuarios:', error);
        }
    };

    const fetchEstaciones = async () => {
        try {
            setIsLoadingEstaciones(true);
            const response = await axios.get('/estaciones');
            
            const estacionesNormalizadas = response.data.map(estacion => {
                return {
                    ...estacion,
                    code: estacion.code || estacion.codigo || '',
                    title: estacion.title || estacion.titulo || 'Estación sin nombre'
                };
            });
            
            console.log('Estaciones cargadas:', estacionesNormalizadas); // AGREGAR ESTA LÍNEA
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

    // Manejadores de eventos
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
    const handleCloseDialog = () => {
        console.log('Cerrando diálogo - Estado actual editingCampo:', editingCampo);
        setOpenDialog(false);
        
        // Resetear después de un pequeño delay
        setTimeout(() => {
            setEditingCampo(null);
            setNuevoCampo({ nombre_campo: '', ubicacion: '', usuarios_ids: [], estacion_id: '' });
            console.log('Estados reseteados');
        }, 100);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const dataToSend = editingCampo ? { ...editingCampo } : { ...nuevoCampo };
            
            // Asegurar que estacion_id sea una cadena limpia
            if (dataToSend.estacion_id) {
                dataToSend.estacion_id = String(dataToSend.estacion_id).trim();
            }
            
            console.log('Datos a enviar:', dataToSend);
            
            let response;
            if (editingCampo) {
                console.log('Actualizando campo ID:', editingCampo.id);
                response = await axios.put(`/campos/${editingCampo.id}`, dataToSend);
            } else {
                console.log('Creando nuevo campo');
                response = await axios.post('/campos', dataToSend);
            }
            
            console.log('Respuesta del servidor:', response.data);
            
            // Actualizar la lista de campos
            if (editingCampo) {
                setCampos(prevCampos => 
                    prevCampos.map(c => 
                        c.id === response.data.id ? response.data : c
                    )
                );
            } else {
                setCampos(prevCampos => [...prevCampos, response.data]);
            }
            
            // Refrescar los campos para obtener los datos actualizados
            await fetchCampos();
            
            // CERRAR EL DIÁLOGO DIRECTAMENTE SIN RESETEAR ESTADO
            setOpenDialog(false);
            
            // Resetear estados después de que el diálogo se cierre
            setTimeout(() => {
                setNuevoCampo({ nombre_campo: '', ubicacion: '', usuarios_ids: [], estacion_id: '' });
                setEditingCampo(null);
            }, 300);
            
        } catch (error) {
            console.error('Error al guardar campo:', error);
            if (error.response) {
                console.error('Detalles del error:', error.response.data);
            }
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
           setOpenMapDialog(true);
    };

    const handleSelectEstacion = (estacion) => {
        console.log('Seleccionando estación:', estacion);
        
        // Obtener el código de la estación de manera más robusta
        const estacionCode = estacion.code || estacion.codigo || '';
        const estacionCodeString = String(estacionCode).trim();
        
        console.log('Código de estación procesado:', estacionCodeString);
        
        setSelectedEstacion(estacion);
        
        if (editingCampo) {
            console.log('Actualizando campo en edición con estación:', estacionCodeString);
            setEditingCampo(prev => ({
                ...prev,
                estacion_id: estacionCodeString
            }));
        } else {
            console.log('Actualizando nuevo campo con estación:', estacionCodeString);
            setNuevoCampo(prev => ({
                ...prev,
                estacion_id: estacionCodeString
            }));
        }
        
        setOpenMapDialog(false);
    };

    // Componente para centrar el mapa
    function SetViewOnClick({ coords, zoomLevel = 7 }) {
    const map = useMap();
    useEffect(() => {
        // Verificar que el mapa esté completamente inicializado
        if (map && coords && coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
            try {
                // Pequeño delay para asegurar que el mapa esté listo
                setTimeout(() => {
                    if (map.getContainer()) {
                        map.setView(coords, zoomLevel);
                    } else {
                                map.setView([-31.4201, -64.1888], 7);
                            }
                }, 100);
            } catch (error) {
                console.error('Error al centrar mapa:', error);
            }
        }
    }, [coords, map, zoomLevel]);
    return null;
}
    // Efectos
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
    useEffect(() => {
        console.log('Estado editingCampo actualizado:', editingCampo);
    }, [editingCampo]);

    useEffect(() => {
        console.log('Estado usuarios actualizado:', usuarios);
    }, [usuarios]);

    useEffect(() => {
        console.log('Estado estaciones actualizado:', estaciones);
    }, [estaciones]);
    return (
    <Container maxWidth="md">
        <Typography variant="h4" gutterBottom>Gestión de Campos</Typography>
        
        {/* Botones de acción */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            {isAdmin && (
                <Button variant="contained" color="primary" onClick={() => {
                    console.log('Abriendo diálogo para nuevo campo');
                    setEditingCampo(null);
                    setNuevoCampo({ nombre_campo: '', ubicacion: '', usuarios_ids: [], estacion_id: '' });
                    setOpenDialog(true);
                }}>
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

        {/* Lista de campos */}
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
                                        <span>Usuarios: {campo.nombre_usuario}</span>
                                        <br />
                                        <span>Estación: {campo.estacion_titulo || findEstacionAsociada(campo)?.title || 'No asignada'}</span>
                                    </>
                                }
                            />
                            <IconButton onClick={() => handleAddLotes(campo.id)}>
                                <Add />
                            </IconButton>
                            {isAdmin && (
                                <>
                                    <IconButton onClick={() => {
                                        console.log('Abriendo diálogo de edición para campo:', campo);
                                        console.log('Usuarios disponibles:', usuarios);
                                        console.log('Estaciones disponibles:', estaciones);

                                        const usuariosIds = campo.usuarios_ids || 
                                                        (campo.usuario_id ? [campo.usuario_id] : []);

                                        const campoParaEditar = {
                                            ...campo,
                                            ubicacion: campo.ubicacion || '',
                                            estacion_id: campo.estacion_id ? String(campo.estacion_id).trim() : '',
                                            usuarios_ids: usuariosIds
                                        };

                                        console.log('Campo preparado para edición:', campoParaEditar);
                                        setEditingCampo(campoParaEditar);
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
        <Dialog  open={openDialog} 
            onClose={handleCloseDialog}
            maxWidth="sm"
            fullWidth
        >
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
                            onChange={(e) => {
                                console.log('Usuarios cambió:', e.target.value);
                                handleUsuariosChange(e);
                            }}
                            onOpen={() => console.log('Select usuarios abierto, valor actual:', editingCampo ? editingCampo.usuarios_ids : nuevoCampo.usuarios_ids)}
                            renderValue={(selected) => {
                                console.log('=== RENDER VALUE ===');
                                console.log('Selected:', selected);
                                return (
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                        {selected.map((value) => {
                                            const user = usuarios.find(u => String(u.id) === String(value));
                                            return (
                                                <Chip 
                                                    key={value} 
                                                    label={user ? user.nombre_usuario : `Usuario ${value}`} 
                                                />
                                            );
                                        })}
                                    </Box>
                                );
                            }}
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
                            value={editingCampo ? (editingCampo.estacion_id || '') : (nuevoCampo.estacion_id || '')}
                            onChange={(e) => {
                                console.log('Estación cambió:', e.target.value);
                                handleInputChange(e);
                            }}
                            onOpen={() => console.log('Select estaciones abierto, valor actual:', editingCampo ? editingCampo.estacion_id : nuevoCampo.estacion_id)}
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
                            onClick={() => handleOpenMapDialog()}
                        >
                            Seleccionar Estación en Mapa
                        </Button>
                    </Box>
                </form>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCloseDialog}>Cancelar</Button>
            </DialogActions>
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
            maxWidth="lg"
        >
            <DialogTitle>Seleccionar Estación Meteorológica</DialogTitle>
            <DialogContent>
                <Box sx={{ height: 600, width: '100%' }}>
                    {estaciones.length > 0 ? (
                        <MapContainer 
                            center={[-31.4201, -64.1888]} 
                            zoom={7} 
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
                                
                                const estacionCode = String(estacion.code || estacion.codigo || '');
                                const isSelected = selectedEstacion && 
                                    String(selectedEstacion.code || selectedEstacion.codigo || '') === estacionCode;
                                
                                // Crear diferentes íconos según los sensores disponibles
                                let markerColor = 'blue'; // Por defecto
                                
                                if (tieneModuloTemperatura(estacion) && tieneModuloHumedad(estacion) && tieneModuloLluvia(estacion) && tieneModuloEvapotranspiracion(estacion)) {
                                    markerColor = 'green'; // Estación completa
                                } else if (tieneModuloTemperatura(estacion) && tieneModuloHumedad(estacion)) {
                                    markerColor = 'orange'; // Temperatura y humedad
                                } else if (tieneModuloTemperatura(estacion)) {
                                    markerColor = 'red'; // Solo temperatura
                                }
                                
                                const markerIcon = isSelected 
                                    ? new L.Icon({
                                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
                                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                                        iconSize: [25, 41],
                                        iconAnchor: [12, 41],
                                        popupAnchor: [1, -34],
                                        shadowSize: [41, 41]
                                    })
                                    : new L.Icon({
                                        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${markerColor}.png`,
                                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                                        iconSize: [25, 41],
                                        iconAnchor: [12, 41],
                                        popupAnchor: [1, -34],
                                        shadowSize: [41, 41]
                                    });
                                
                                // Crear contenido detallado del popup con lista de módulos
                                const modulosDisponibles = estacion.modules || [];
                                const modulosTemperatura = obtenerModulosPorTipo(estacion, 'temperatura');
                                const modulosHumedad = obtenerModulosPorTipo(estacion, 'humedad');
                                const modulosLluvia = obtenerModulosPorTipo(estacion, 'lluvia');
                                const modulosViento = obtenerModulosPorTipo(estacion, 'viento');
                                const modulosPresion = obtenerModulosPorTipo(estacion, 'presión');
                                const modulosEvapotranspiracion = obtenerModulosPorTipo(estacion, 'evapotranspiración');
                                
                                return (
                                    <Marker 
                                        key={estacionCode} 
                                        position={estacionCoords}
                                        icon={markerIcon}
                                        eventHandlers={{
                                            click: (e) => {
                                                // Prevenir que se cierre el popup
                                                e.originalEvent.stopPropagation();
                                            }
                                        }}
                                    >
                                        <Popup 
                                            closeButton={true}
                                            autoClose={false}
                                            closeOnClick={false}
                                            maxWidth={320}
                                        >
                                            <div style={{ minWidth: '280px', maxHeight: '350px', overflow: 'auto' }}>
                                                <div style={{ marginBottom: '10px', borderBottom: '1px solid #ccc', paddingBottom: '8px' }}>
                                                    <strong style={{ fontSize: '14px', color: '#2c3e50' }}>
                                                        {estacion.title || estacion.titulo || 'Estación sin nombre'}
                                                    </strong>
                                                    <br />
                                                    <span style={{ fontSize: '12px', color: '#7f8c8d' }}>
                                                        Código: {estacionCode}
                                                    </span>
                                                </div>
                                                
                                                <div style={{ marginBottom: '10px' }}>
                                                    <strong style={{ fontSize: '12px', color: '#34495e' }}>Sensores Disponibles:</strong>
                                                    <div style={{ marginTop: '5px' }}>
                                                        {modulosTemperatura.length > 0 && (
                                                            <div style={{ marginBottom: '3px' }}>
                                                                <span style={{ 
                                                                    backgroundColor: '#e74c3c', 
                                                                    color: 'white', 
                                                                    padding: '2px 6px', 
                                                                    borderRadius: '3px', 
                                                                    fontSize: '10px',
                                                                    marginRight: '5px'
                                                                }}>
                                                                    🌡️ TEMP
                                                                </span>
                                                                <span style={{ fontSize: '11px' }}>
                                                                    ({modulosTemperatura.length} módulo{modulosTemperatura.length > 1 ? 's' : ''})
                                                                </span>
                                                            </div>
                                                        )}
                                                        
                                                        {modulosHumedad.length > 0 && (
                                                            <div style={{ marginBottom: '3px' }}>
                                                                <span style={{ 
                                                                    backgroundColor: '#3498db', 
                                                                    color: 'white', 
                                                                    padding: '2px 6px', 
                                                                    borderRadius: '3px', 
                                                                    fontSize: '10px',
                                                                    marginRight: '5px'
                                                                }}>
                                                                    💧 HUM
                                                                </span>
                                                                <span style={{ fontSize: '11px' }}>
                                                                    ({modulosHumedad.length} módulo{modulosHumedad.length > 1 ? 's' : ''})
                                                                </span>
                                                            </div>
                                                        )}
                                                        
                                                        {modulosLluvia.length > 0 && (
                                                            <div style={{ marginBottom: '3px' }}>
                                                                <span style={{ 
                                                                    backgroundColor: '#2ecc71', 
                                                                    color: 'white', 
                                                                    padding: '2px 6px', 
                                                                    borderRadius: '3px', 
                                                                    fontSize: '10px',
                                                                    marginRight: '5px'
                                                                }}>
                                                                    🌧️ LLUV
                                                                </span>
                                                                <span style={{ fontSize: '11px' }}>
                                                                    ({modulosLluvia.length} módulo{modulosLluvia.length > 1 ? 's' : ''})
                                                                </span>
                                                            </div>
                                                        )}
                                                        
                                                        {modulosViento.length > 0 && (
                                                            <div style={{ marginBottom: '3px' }}>
                                                                <span style={{ 
                                                                    backgroundColor: '#9b59b6', 
                                                                    color: 'white', 
                                                                    padding: '2px 6px', 
                                                                    borderRadius: '3px', 
                                                                    fontSize: '10px',
                                                                    marginRight: '5px'
                                                                }}>
                                                                    💨 VIENTO
                                                                </span>
                                                                <span style={{ fontSize: '11px' }}>
                                                                    ({modulosViento.length} módulo{modulosViento.length > 1 ? 's' : ''})
                                                                </span>
                                                            </div>
                                                        )}
                                                        {modulosEvapotranspiracion.length > 0 && (
                                                            <div style={{ marginBottom: '3px' }}>  
                                                                <span style={{
                                                                    backgroundColor: '#8e44ad',
                                                                    color: 'white',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '3px',
                                                                    fontSize: '10px',
                                                                    marginRight: '5px'
                                                                }}>
                                                                    🌱 EVAP
                                                                </span>
                                                                <span style={{ fontSize: '11px' }}>
                                                                    ({modulosEvapotranspiracion.length} módulo{modulosEvapotranspiracion.length > 1 ? 's' : ''})
                                                                </span>
                                                            </div>
                                                        )} 
                                                        
                                                        {modulosPresion.length > 0 && (
                                                            <div style={{ marginBottom: '3px' }}>
                                                                <span style={{ 
                                                                    backgroundColor: '#f39c12', 
                                                                    color: 'white', 
                                                                    padding: '2px 6px', 
                                                                    borderRadius: '3px', 
                                                                    fontSize: '10px',
                                                                    marginRight: '5px'
                                                                }}>
                                                                    📊 PRES
                                                                </span>
                                                                <span style={{ fontSize: '11px' }}>
                                                                    ({modulosPresion.length} módulo{modulosPresion.length > 1 ? 's' : ''})
                                                                </span>
                                                            </div>
                                                        )}
                                                        
                                                        {modulosDisponibles.length === 0 && (
                                                            <span style={{ fontSize: '11px', color: '#95a5a6', fontStyle: 'italic' }}>
                                                                Sin información de sensores
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                <div style={{ marginTop: '10px', textAlign: 'center' }}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleSelectEstacion(estacion);
                                                        }}
                                                        style={{
                                                            backgroundColor: '#2c3e50',
                                                            color: 'white',
                                                            border: 'none',
                                                            padding: '8px 16px',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '12px',
                                                            fontWeight: 'bold',
                                                            width: '100%'
                                                        }}
                                                        onMouseOver={(e) => e.target.style.backgroundColor = '#34495e'}
                                                        onMouseOut={(e) => e.target.style.backgroundColor = '#2c3e50'}
                                                    >
                                                        ✓ Seleccionar Esta Estación
                                                    </button>
                                                </div>
                                                
                                                <div style={{ marginTop: '8px', fontSize: '10px', color: '#7f8c8d', textAlign: 'center' }}>
                                                    Total: {modulosDisponibles.length} módulos disponibles
                                                </div>
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
);  }

export default CamposManagement;