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
        radio_cobertura_default: '',
        caudal: '',
        tiempo_vuelta_completa: '',
        activo: true
    });
    
    const [configuracionModo, setConfiguracionModo] = useState('caudal'); // 'caudal' o 'tiempo'
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (regadorEdit) {
            setRegador({
                ...regadorEdit,
                radio_cobertura_default: regadorEdit.radio_cobertura_default || regadorEdit.radio_cobertura || '',
                caudal: regadorEdit.caudal || '',
                tiempo_vuelta_completa: regadorEdit.tiempo_vuelta_completa || ''
            });
            setConfiguracionModo(regadorEdit.caudal ? 'caudal' : 'tiempo');
        } else {
            // Resetear para nuevo regador
            setRegador({
                nombre_dispositivo: '',
                tipo_regador: 'pivote',
                radio_cobertura_default: '',
                caudal: '',
                tiempo_vuelta_completa: '',
                activo: true
            });
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

    const validateForm = () => {
        const newErrors = {};
        
        if (!regador.nombre_dispositivo.trim()) {
            newErrors.nombre_dispositivo = 'El nombre del dispositivo es requerido';
        }
        
        if (!regador.radio_cobertura_default || parseFloat(regador.radio_cobertura_default) <= 0) {
            newErrors.radio_cobertura_default = 'El radio de cobertura es requerido y debe ser mayor a 0';
        }
        
        if (configuracionModo === 'caudal') {
            if (!regador.caudal || parseFloat(regador.caudal) <= 0) {
                newErrors.caudal = 'El caudal debe ser mayor a 0';
            }
        } else {
            if (!regador.tiempo_vuelta_completa || parseInt(regador.tiempo_vuelta_completa) <= 0) {
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
            radio_cobertura_default: parseFloat(regador.radio_cobertura_default),
            caudal: configuracionModo === 'caudal' && regador.caudal ? parseFloat(regador.caudal) : null,
            tiempo_vuelta_completa: configuracionModo === 'tiempo' && regador.tiempo_vuelta_completa ? parseInt(regador.tiempo_vuelta_completa) : null
        };

        onSave(regadorData);
    };

    const calcularCaudalEstimado = () => {
        if (configuracionModo === 'caudal' && regador.caudal) {
            return parseFloat(regador.caudal);
        } else if (configuracionModo === 'tiempo' && regador.tiempo_vuelta_completa && regador.radio_cobertura_default) {
            // Estimación básica: asumiendo aplicación de 20mm de agua por vuelta
            const area = Math.PI * Math.pow(parseFloat(regador.radio_cobertura_default), 2);
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
                <Grid container spacing={3} sx={{ mt: 1 }}>
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
                            name="radio_cobertura_default"
                            label="Radio de Cobertura por Defecto (metros)"
                            type="number"
                            value={regador.radio_cobertura_default}
                            onChange={handleInputChange}
                            error={!!errors.radio_cobertura_default}
                            helperText={errors.radio_cobertura_default || "Se puede ajustar individualmente por lote"}
                            required
                            inputProps={{ min: 1, step: 0.1 }}
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
                                inputProps={{ min: 1, step: 0.1 }}
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
                                inputProps={{ min: 1, step: 1 }}
                            />
                        </Grid>
                    )}

                    {/* Información calculada */}
                    <Grid item xs={12}>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Chip 
                                label={`Caudal estimado: ${calcularCaudalEstimado()} L/min`} 
                                color="success" 
                                variant="outlined"
                            />
                            {regador.radio_cobertura_default && (
                                <Chip 
                                    label={`Radio default: ${regador.radio_cobertura_default}m`} 
                                    color="info" 
                                    variant="outlined"
                                />
                            )}
                        </Box>
                    </Grid>

                    <Grid item xs={12}>
                        <Alert severity="info">
                            <Typography variant="body2">
                                <strong>Nota:</strong> La ubicación del pivote se configurará individualmente para cada lote al crear las geozonas.
                            </Typography>
                        </Alert>
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