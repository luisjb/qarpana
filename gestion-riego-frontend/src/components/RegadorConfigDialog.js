import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, FormControl, InputLabel, Select, MenuItem,
    Grid, Typography, Box, Chip, Alert, Divider
} from '@mui/material';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Configurar iconos de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Componente para manejar clics en el mapa
function MapClickHandler({ onMapClick }) {
    const map = useMap();
    
    useEffect(() => {
        const handleClick = (e) => {
            onMapClick(e.latlng);
        };
        
        map.on('click', handleClick);
        return () => map.off('click', handleClick);
    }, [map, onMapClick]);
    
    return null;
}

function RegadorConfigDialog({ open, onClose, onSave, campoId, regadorEdit = null }) {
    const [regador, setRegador] = useState({
        nombre_dispositivo: '',
        tipo_regador: 'pivote',
        radio_cobertura: '',
        caudal: '',
        tiempo_vuelta_completa: '',
        latitud_centro: '',
        longitud_centro: '',
        activo: true
    });
    
    const [mapCenter, setMapCenter] = useState([-31.4201, -64.1888]);
    const [configuracionModo, setConfiguracionModo] = useState('caudal'); // 'caudal' o 'tiempo'
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (regadorEdit) {
            setRegador({
                ...regadorEdit,
                radio_cobertura: regadorEdit.radio_cobertura || '',
                caudal: regadorEdit.caudal || '',
                tiempo_vuelta_completa: regadorEdit.tiempo_vuelta_completa || ''
            });
            if (regadorEdit.latitud_centro && regadorEdit.longitud_centro) {
                setMapCenter([regadorEdit.latitud_centro, regadorEdit.longitud_centro]);
            }
            setConfiguracionModo(regadorEdit.caudal ? 'caudal' : 'tiempo');
        } else {
            // Resetear para nuevo regador
            setRegador({
                nombre_dispositivo: '',
                tipo_regador: 'pivote',
                radio_cobertura: '',
                caudal: '',
                tiempo_vuelta_completa: '',
                latitud_centro: '',
                longitud_centro: '',
                activo: true
            });
            setMapCenter([-31.4201, -64.1888]);
            setConfiguracionModo('caudal');
        }
        setErrors({});
    }, [regadorEdit, open]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setRegador(prev => ({
            ...prev,
            [name]: value
        }));
        
        // Limpiar error específico
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: null
            }));
        }
    };

    const handleMapClick = (latlng) => {
        setRegador(prev => ({
            ...prev,
            latitud_centro: latlng.lat,
            longitud_centro: latlng.lng
        }));
        setMapCenter([latlng.lat, latlng.lng]);
    };

    const validateForm = () => {
        const newErrors = {};
        
        if (!regador.nombre_dispositivo.trim()) {
            newErrors.nombre_dispositivo = 'El nombre del dispositivo es requerido';
        }
        
        if (!regador.radio_cobertura || regador.radio_cobertura <= 0) {
            newErrors.radio_cobertura = 'El radio de cobertura debe ser mayor a 0';
        }
        
        if (!regador.latitud_centro || !regador.longitud_centro) {
            newErrors.ubicacion = 'Debe seleccionar la ubicación del pivote en el mapa';
        }
        
        if (configuracionModo === 'caudal') {
            if (!regador.caudal || regador.caudal <= 0) {
                newErrors.caudal = 'El caudal debe ser mayor a 0';
            }
        } else {
            if (!regador.tiempo_vuelta_completa || regador.tiempo_vuelta_completa <= 0) {
                newErrors.tiempo_vuelta_completa = 'El tiempo de vuelta debe ser mayor a 0';
            }
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = () => {
        if (!validateForm()) {
            return;
        }

        const regadorData = {
            ...regador,
            campo_id: campoId,
            radio_cobertura: parseFloat(regador.radio_cobertura),
            latitud_centro: parseFloat(regador.latitud_centro),
            longitud_centro: parseFloat(regador.longitud_centro),
            caudal: configuracionModo === 'caudal' ? parseFloat(regador.caudal) : null,
            tiempo_vuelta_completa: configuracionModo === 'tiempo' ? parseInt(regador.tiempo_vuelta_completa) : null
        };

        onSave(regadorData);
    };

    const calcularAreaCobertura = () => {
        if (!regador.radio_cobertura) return 0;
        const radio = parseFloat(regador.radio_cobertura);
        return (Math.PI * radio * radio / 10000).toFixed(2); // Convertir a hectáreas
    };

    const calcularCaudalEstimado = () => {
        if (configuracionModo === 'caudal' && regador.caudal) {
            return parseFloat(regador.caudal);
        } else if (configuracionModo === 'tiempo' && regador.tiempo_vuelta_completa && regador.radio_cobertura) {
            // Estimación básica: asumiendo aplicación de 20mm de agua por vuelta
            const area = Math.PI * Math.pow(parseFloat(regador.radio_cobertura), 2);
            const volumenLitros = area * 0.02; // 20mm = 0.02m
            const tiempoMinutos = parseInt(regador.tiempo_vuelta_completa);
            return (volumenLitros / tiempoMinutos).toFixed(0);
        }
        return 0;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>
                {regadorEdit ? 'Editar Regador' : 'Configurar Nuevo Regador'}
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={3}>
                    {/* Información básica */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                            Información del Dispositivo
                        </Typography>
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            name="nombre_dispositivo"
                            label="Nombre del Dispositivo GPS"
                            value={regador.nombre_dispositivo}
                            onChange={handleInputChange}
                            error={!!errors.nombre_dispositivo}
                            helperText={errors.nombre_dispositivo || "Debe coincidir exactamente con el nombre en Traccar (ej: 'GPS FRANCO')"}
                            required
                        />
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                            <InputLabel>Tipo de Regador</InputLabel>
                            <Select
                                name="tipo_regador"
                                value={regador.tipo_regador}
                                onChange={handleInputChange}
                                label="Tipo de Regador"
                            >
                                <MenuItem value="pivote">Pivote Central</MenuItem>
                                <MenuItem value="lineal">Riego Lineal</MenuItem>
                                <MenuItem value="aspersion">Aspersión</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            name="radio_cobertura"
                            label="Radio de Cobertura (metros)"
                            type="number"
                            value={regador.radio_cobertura}
                            onChange={handleInputChange}
                            error={!!errors.radio_cobertura}
                            helperText={errors.radio_cobertura}
                            required
                        />
                    </Grid>

                    {/* Configuración de caudal o tiempo */}
                    <Grid item xs={12}>
                        <Divider />
                        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                            Configuración de Riego
                        </Typography>
                    </Grid>

                    <Grid item xs={12}>
                        <FormControl fullWidth>
                            <InputLabel>Método de Configuración</InputLabel>
                            <Select
                                value={configuracionModo}
                                onChange={(e) => setConfiguracionModo(e.target.value)}
                                label="Método de Configuración"
                            >
                                <MenuItem value="caudal">Especificar Caudal Directo</MenuItem>
                                <MenuItem value="tiempo">Especificar Tiempo de Vuelta</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    {configuracionModo === 'caudal' ? (
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                name="caudal"
                                label="Caudal (litros/minuto)"
                                type="number"
                                value={regador.caudal}
                                onChange={handleInputChange}
                                error={!!errors.caudal}
                                helperText={errors.caudal}
                                required
                            />
                        </Grid>
                    ) : (
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                name="tiempo_vuelta_completa"
                                label="Tiempo Vuelta Completa (minutos)"
                                type="number"
                                value={regador.tiempo_vuelta_completa}
                                onChange={handleInputChange}
                                error={!!errors.tiempo_vuelta_completa}
                                helperText={errors.tiempo_vuelta_completa || "Tiempo que tarda en completar una vuelta completa"}
                                required
                            />
                        </Grid>
                    )}

                    {/* Información calculada */}
                    <Grid item xs={12}>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Chip 
                                label={`Área: ${calcularAreaCobertura()} ha`} 
                                color="info" 
                                variant="outlined"
                            />
                            <Chip 
                                label={`Caudal estimado: ${calcularCaudalEstimado()} L/min`} 
                                color="success" 
                                variant="outlined"
                            />
                        </Box>
                    </Grid>

                    {/* Mapa para ubicación */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                            Ubicación del Pivote Central
                        </Typography>
                        {errors.ubicacion && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {errors.ubicacion}
                            </Alert>
                        )}
                        <Box sx={{ height: 400, border: '1px solid #ccc', borderRadius: 1 }}>
                            <MapContainer 
                                center={mapCenter} 
                                zoom={15} 
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                />
                                
                                <MapClickHandler onMapClick={handleMapClick} />
                                
                                {/* Marcador del centro del pivote */}
                                {regador.latitud_centro && regador.longitud_centro && (
                                    <>
                                        <Marker position={[regador.latitud_centro, regador.longitud_centro]} />
                                        {regador.radio_cobertura && (
                                            <Circle
                                                center={[regador.latitud_centro, regador.longitud_centro]}
                                                radius={parseFloat(regador.radio_cobertura)}
                                                pathOptions={{
                                                    color: '#2196F3',
                                                    fillColor: '#2196F3',
                                                    fillOpacity: 0.2,
                                                    weight: 2
                                                }}
                                            />
                                        )}
                                    </>
                                )}
                            </MapContainer>
                        </Box>
                        <Typography variant="caption" color="textSecondary" sx={{ mt: 1, display: 'block' }}>
                            Haga clic en el mapa para establecer la ubicación del centro del pivote
                        </Typography>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>
                    Cancelar
                </Button>
                <Button onClick={handleSave} variant="contained" color="primary">
                    {regadorEdit ? 'Actualizar' : 'Guardar'} Regador
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default RegadorConfigDialog;