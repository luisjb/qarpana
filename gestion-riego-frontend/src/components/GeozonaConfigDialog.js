import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Typography, Box, List, ListItem, ListItemText,
    IconButton, Grid, Slider, FormControl, InputLabel, Select,
    MenuItem, Alert, Chip, Divider, Switch, FormControlLabel,
    Paper, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { 
    Add, Delete, Edit, Palette, Save, Refresh,
    PieChart, Settings, Visibility, VisibilityOff,
    MyLocation, ExpandMore, LocationOn
} from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from '../axiosConfig';


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

// Componente personalizado para mostrar sectores en el mapa
function SectorOverlay({ center, radius, sectores, selectedSector, onSectorClick }) {
    const map = useMap();
    const sectorsRef = useRef([]);

    useEffect(() => {
        // Limpiar sectores previos
        sectorsRef.current.forEach(layer => map.removeLayer(layer));
        sectorsRef.current = [];

        if (!center || !radius || !sectores.length) return;

        // Validar que center sea un array válido con coordenadas numéricas
        if (!Array.isArray(center) || center.length !== 2) {
            console.error('Centro inválido:', center);
            return;
        }

        const centerLat = parseFloat(center[0]);
        const centerLng = parseFloat(center[1]);
        const radiusMeters = parseFloat(radius);

        if (isNaN(centerLat) || isNaN(centerLng) || isNaN(radiusMeters)) {
            console.error('Coordenadas o radio inválidos:', { centerLat, centerLng, radiusMeters });
            return;
        }

        sectores.forEach((sector, index) => {
            if (!sector.activo && !sector.mostrar_preview) return;

            const { angulo_inicio, angulo_fin, color_display, nombre_sector } = sector;
            
            // Crear geometría del sector (porción de pizza)
            const centerLatLng = L.latLng(centerLat, centerLng);
            
            // Convertir ángulos a radianes
            const startAngle = (angulo_inicio * Math.PI) / 180;
            const endAngle = (angulo_fin * Math.PI) / 180;
            
            // Crear puntos para el polígono del sector
            const points = [centerLatLng]; // Empezar desde el centro
            
            // Calcular puntos del arco
            const numPoints = 30; // Resolución del arco
            let angleStep;
            
            // Manejar sectores que cruzan el 0° (ej: 350° a 10°)
            if (angulo_fin < angulo_inicio) {
                // Sector que cruza 0°
                angleStep = ((360 - angulo_inicio) + angulo_fin) / numPoints;
            } else {
                angleStep = (endAngle - startAngle) / numPoints;
            }
            
            for (let i = 0; i <= numPoints; i++) {
                let angle;
                if (angulo_fin < angulo_inicio) {
                    // Para sectores que cruzan 0°
                    angle = startAngle + (i * angleStep * Math.PI / 180);
                } else {
                    angle = startAngle + (i * angleStep);
                }
                
                const lat = centerLat + (radiusMeters / 111000) * Math.cos(angle);
                const lng = centerLng + (radiusMeters / (111000 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angle);
                
                // Validar que las coordenadas sean números válidos
                if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng)) {
                    // Limitar a 6 decimales para evitar precision issues
                    const latFixed = parseFloat(lat.toFixed(6));
                    const lngFixed = parseFloat(lng.toFixed(6));
                    points.push(L.latLng(latFixed, lngFixed));
                }
            }
            
            points.push(centerLatLng); // Volver al centro

            // Crear el polígono solo si tenemos puntos válidos
            if (points.length > 2) {
                const polygon = L.polygon(points, {
                    color: color_display,
                    fillColor: color_display,
                    fillOpacity: selectedSector === index ? 0.6 : 0.3,
                    weight: selectedSector === index ? 3 : 2,
                    opacity: sector.activo ? 1 : 0.5
                }).addTo(map);

                // Agregar tooltip
                polygon.bindTooltip(
                    `${nombre_sector}<br/>Ángulos: ${angulo_inicio}° - ${angulo_fin}°<br/>Estado: ${sector.activo ? 'Activo' : 'Inactivo'}`,
                    { permanent: false, direction: 'center' }
                );

                // Manejar clic
                polygon.on('click', () => {
                    onSectorClick(index);
                });

                sectorsRef.current.push(polygon);
            }
        });

        return () => {
            sectorsRef.current.forEach(layer => map.removeLayer(layer));
            sectorsRef.current = [];
        };
    }, [center, radius, sectores, selectedSector, map, onSectorClick]);

    return null;
}

function GeozonaConfigDialog({ open, onClose, onSave, lote, regador }) {
    const [sectores, setSectores] = useState([]);
    const [selectedSector, setSelectedSector] = useState(null);
    const [editingSector, setEditingSector] = useState(null);
    const [numeroSectores, setNumeroSectores] = useState(8);
    const [previewMode, setPreviewMode] = useState(true);
    const [errors, setErrors] = useState({});
    
    // Estados para configuración del centro del pivote
    const [centroPivote, setCentroPivote] = useState({
        latitud_centro: '',
        longitud_centro: '',
        radio_cobertura: ''
    });
    const [mapCenter, setMapCenter] = useState([-31.4201, -64.1888]); // Coordenadas por defecto de Córdoba
    const [configuracionExistente, setConfiguracionExistente] = useState(null);

    // Colores predefinidos para los sectores
    const coloresDisponibles = [
        '#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', 
        '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
        '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800',
        '#795548', '#607D8B', '#424242'
    ];

    useEffect(() => {
        if (open && regador && lote) {
            cargarConfiguracionExistente();
        }
    }, [open, regador, lote]);

    const cargarConfiguracionExistente = async () => {
        try {
            // Intentar cargar configuración existente del lote para este regador
            const response = await axios.get(`/geozonas-pivote/lote/${lote.id}/regador/${regador.id}`);
            
            const data = response.data;
            setConfiguracionExistente(data);
            
            // Si existe configuración, cargar los datos
            if (data.sectores && data.sectores.length > 0) {
                setSectores(data.sectores);
                setCentroPivote({
                    latitud_centro: data.latitud_centro || '',
                    longitud_centro: data.longitud_centro || '',
                    radio_cobertura: data.radio_cobertura || regador.radio_cobertura_default || ''
                });
                
                // Actualizar centro del mapa si hay coordenadas válidas
                if (data.latitud_centro && data.longitud_centro) {
                    setMapCenter([parseFloat(data.latitud_centro), parseFloat(data.longitud_centro)]);
                }
            } else {
                // Nueva configuración - usar valores por defecto del regador
                inicializarNuevaConfiguracion();
            }
        } catch (error) {
            // Si es un error 404, significa que no hay configuración existente
            if (error.response && error.response.status === 404) {
                console.log('No existe configuración previa, creando nueva');
                inicializarNuevaConfiguracion();
            } else {
                console.error('Error cargando configuración:', error);
                inicializarNuevaConfiguracion();
            }
        }
    };

    const inicializarNuevaConfiguracion = () => {
        // Usar coordenadas del regador si están disponibles, sino usar valores vacíos
        const coordenadasRegador = regador.latitud_centro && regador.longitud_centro ? {
            latitud_centro: regador.latitud_centro,
            longitud_centro: regador.longitud_centro
        } : {
            latitud_centro: '',
            longitud_centro: ''
        };

        setCentroPivote({
            ...coordenadasRegador,
            radio_cobertura: regador.radio_cobertura_default || ''
        });

        // Si hay coordenadas del regador, usarlas para el mapa
        if (regador.latitud_centro && regador.longitud_centro) {
            setMapCenter([parseFloat(regador.latitud_centro), parseFloat(regador.longitud_centro)]);
        }

        // Crear sectores por defecto
        crearSectoresPorDefecto();
    };

    const handleMapClick = (latlng) => {
        setCentroPivote(prev => ({
            ...prev,
            latitud_centro: latlng.lat.toFixed(6),
            longitud_centro: latlng.lng.toFixed(6)
        }));
        setMapCenter([latlng.lat, latlng.lng]);
    };

    const handleCentroChange = (e) => {
        const { name, value } = e.target;
        setCentroPivote(prev => ({
            ...prev,
            [name]: value
        }));

        // Si se cambian las coordenadas manualmente, actualizar el mapa
        if (name === 'latitud_centro' || name === 'longitud_centro') {
            const lat = name === 'latitud_centro' ? parseFloat(value) : parseFloat(centroPivote.latitud_centro);
            const lng = name === 'longitud_centro' ? parseFloat(value) : parseFloat(centroPivote.longitud_centro);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                setMapCenter([lat, lng]);
            }
        }
    };

    const crearSectoresPorDefecto = () => {
        const radioCobertura = centroPivote.radio_cobertura || regador.radio_cobertura_default || 400;
        const angulosPorSector = 360 / numeroSectores;
        const nuevosSectores = [];

        for (let i = 0; i < numeroSectores; i++) {
            const anguloInicio = i * angulosPorSector;
            let anguloFin = (i + 1) * angulosPorSector;
            
            // Para el último sector, asegurarse de que termine exactamente en 360
            if (i === numeroSectores - 1) {
                anguloFin = 360;
            }

            nuevosSectores.push({
                numero_sector: i + 1,
                nombre_sector: `Sector ${i + 1}`,
                angulo_inicio: Math.round(anguloInicio * 100) / 100,
                angulo_fin: Math.round(anguloFin * 100) / 100,
                radio_interno: 0,
                radio_externo: parseFloat(radioCobertura),
                color_display: coloresDisponibles[i % coloresDisponibles.length],
                activo: true,
                coeficiente_riego: 1.0,
                prioridad: 1,
                mostrar_preview: true
            });
        }

        setSectores(nuevosSectores);
    };

    const handleNumeroSectoresChange = (event, newValue) => {
        setNumeroSectores(newValue);
        if (previewMode) {
            const radioCobertura = centroPivote.radio_cobertura || regador.radio_cobertura_default || 400;
            const angulosPorSector = 360 / newValue;
            const nuevosSectores = [];

            for (let i = 0; i < newValue; i++) {
                const anguloInicio = i * angulosPorSector;
                let anguloFin = (i + 1) * angulosPorSector;
                
                if (i === newValue - 1) {
                    anguloFin = 360;
                }

                nuevosSectores.push({
                    numero_sector: i + 1,
                    nombre_sector: `Sector ${i + 1}`,
                    angulo_inicio: Math.round(anguloInicio * 100) / 100,
                    angulo_fin: Math.round(anguloFin * 100) / 100,
                    radio_interno: 0,
                    radio_externo: parseFloat(radioCobertura),
                    color_display: coloresDisponibles[i % coloresDisponibles.length],
                    activo: true,
                    coeficiente_riego: 1.0,
                    prioridad: 1,
                    mostrar_preview: true
                });
            }

            setSectores(nuevosSectores);
        }
    };

    const handleSectorClick = (index) => {
        setSelectedSector(index);
    };

    const handleEditSector = (sector, index) => {
        setEditingSector({ ...sector, index });
    };

    const handleSaveSector = (sectorEditado) => {
        const nuevosSectores = [...sectores];
        nuevosSectores[sectorEditado.index] = {
            ...sectorEditado,
            angulo_inicio: parseFloat(sectorEditado.angulo_inicio),
            angulo_fin: parseFloat(sectorEditado.angulo_fin),
            coeficiente_riego: parseFloat(sectorEditado.coeficiente_riego),
            prioridad: parseInt(sectorEditado.prioridad)
        };
        setSectores(nuevosSectores);
        setEditingSector(null);
    };

    const handleDeleteSector = (index) => {
        if (sectores.length <= 1) {
            alert('Debe haber al menos un sector');
            return;
        }
        const nuevosSectores = sectores.filter((_, i) => i !== index);
        // Reordenar números de sector
        const sectoresReordenados = nuevosSectores.map((sector, newIndex) => ({
            ...sector,
            numero_sector: newIndex + 1,
            nombre_sector: `Sector ${newIndex + 1}`
        }));
        setSectores(sectoresReordenados);
        
        if (selectedSector === index) {
            setSelectedSector(null);
        } else if (selectedSector > index) {
            setSelectedSector(selectedSector - 1);
        }
    };

    const handleAddSector = () => {
        const ultimoSector = sectores[sectores.length - 1];
        const nuevoAngulo = ultimoSector ? ultimoSector.angulo_fin : 0;
        
        const nuevoSector = {
            numero_sector: sectores.length + 1,
            nombre_sector: `Sector ${sectores.length + 1}`,
            angulo_inicio: nuevoAngulo,
            angulo_fin: Math.min(nuevoAngulo + 45, 360),
            radio_interno: 0,
            radio_externo: parseFloat(centroPivote.radio_cobertura || regador.radio_cobertura_default || 400),
            color_display: coloresDisponibles[sectores.length % coloresDisponibles.length],
            activo: true,
            coeficiente_riego: 1.0,
            prioridad: 1,
            mostrar_preview: true
        };

        setSectores([...sectores, nuevoSector]);
    };

    const toggleSectorActivo = (index) => {
        const nuevosSectores = [...sectores];
        nuevosSectores[index].activo = !nuevosSectores[index].activo;
        setSectores(nuevosSectores);
    };

    const validarConfiguracion = () => {
        const errores = [];
        
        // Validar coordenadas del centro
        const lat = parseFloat(centroPivote.latitud_centro);
        const lng = parseFloat(centroPivote.longitud_centro);
        const radio = parseFloat(centroPivote.radio_cobertura);
        
        if (isNaN(lat) || lat < -90 || lat > 90) {
            errores.push('La latitud del centro debe ser un número válido entre -90 y 90');
        }
        
        if (isNaN(lng) || lng < -180 || lng > 180) {
            errores.push('La longitud del centro debe ser un número válido entre -180 y 180');
        }
        
        if (isNaN(radio) || radio <= 0) {
            errores.push('El radio de cobertura debe ser un número mayor a 0');
        }
        
        // Validar sectores
        if (sectores.length === 0) {
            errores.push('Debe haber al menos un sector');
        }
        
        // Validar que no haya solapamientos entre sectores
        for (let i = 0; i < sectores.length; i++) {
            for (let j = i + 1; j < sectores.length; j++) {
                const sector1 = sectores[i];
                const sector2 = sectores[j];
                
                // Verificar solapamiento considerando sectores que cruzan 0°
                const overlap = checkSectorOverlap(sector1, sector2);
                if (overlap) {
                    errores.push(`Los sectores ${sector1.nombre_sector} y ${sector2.nombre_sector} se solapan`);
                }
            }
        }

        // Validar que los ángulos estén en rango válido
        sectores.forEach((sector, index) => {
            if (sector.angulo_inicio < 0 || sector.angulo_inicio >= 360) {
                errores.push(`Sector ${sector.nombre_sector}: Ángulo de inicio inválido (debe estar entre 0 y 359.99)`);
            }
            if (sector.angulo_fin <= 0 || sector.angulo_fin > 360) {
                errores.push(`Sector ${sector.nombre_sector}: Ángulo de fin inválido (debe estar entre 0.01 y 360)`);
            }
            if (sector.angulo_inicio === sector.angulo_fin) {
                errores.push(`Sector ${sector.nombre_sector}: Los ángulos de inicio y fin no pueden ser iguales`);
            }
        });

        return errores;
    };

    const checkSectorOverlap = (sector1, sector2) => {
        const s1Start = sector1.angulo_inicio;
        const s1End = sector1.angulo_fin;
        const s2Start = sector2.angulo_inicio;
        const s2End = sector2.angulo_fin;
        
        // Normalizar ángulos si cruzan 0°
        const normalize = (start, end) => {
            if (end < start) {
                return [start, end + 360];
            }
            return [start, end];
        };
        
        const [s1NormStart, s1NormEnd] = normalize(s1Start, s1End);
        const [s2NormStart, s2NormEnd] = normalize(s2Start, s2End);
        
        // Verificar solapamiento
        return (s1NormStart < s2NormEnd && s1NormEnd > s2NormStart);
    };

    const handleSaveGeozonas = async () => {
    const errores = validarConfiguracion();
    
    if (errores.length > 0) {
        setErrors({ validacion: errores });
        return;
    }

    const datosGuardar = {
            regador_id: regador.id,
            lote_id: lote.id,
            latitud_centro: parseFloat(centroPivote.latitud_centro),
            longitud_centro: parseFloat(centroPivote.longitud_centro),
            radio_cobertura: parseFloat(centroPivote.radio_cobertura),
            sectores: sectores.map(sector => ({
                nombre_sector: sector.nombre_sector,
                numero_sector: sector.numero_sector,
                angulo_inicio: sector.angulo_inicio,
                angulo_fin: sector.angulo_fin,
                radio_interno: sector.radio_interno,
                radio_externo: sector.radio_externo,
                color_display: sector.color_display,
                activo: sector.activo,
                coeficiente_riego: sector.coeficiente_riego,
                prioridad: sector.prioridad
            }))
        };

        try {
            if (configuracionExistente && configuracionExistente.id) {
                // Actualizar configuración existente
                await axios.put(`/geozonas-pivote/${configuracionExistente.id}`, datosGuardar);
            } else {
                // Crear nueva configuración
                await axios.post('/geozonas-pivote', datosGuardar);
            }
            
            onSave(datosGuardar);
            onClose();
        } catch (error) {
            console.error('Error guardando configuración:', error);
            setErrors({ 
                general: error.response?.data?.error || 'Error al guardar la configuración' 
            });
        }
    };

    const calcularAreaSector = (sector) => {
        let anguloRadianes;
        
        // Manejar sectores que cruzan 0°
        if (sector.angulo_fin < sector.angulo_inicio) {
            anguloRadianes = ((360 - sector.angulo_inicio) + sector.angulo_fin) * Math.PI / 180;
        } else {
            anguloRadianes = (sector.angulo_fin - sector.angulo_inicio) * Math.PI / 180;
        }
        
        const areaM2 = (anguloRadianes / (2 * Math.PI)) * Math.PI * Math.pow(sector.radio_externo, 2);
        return (areaM2 / 10000).toFixed(3); // Convertir a hectáreas
    };

    if (!regador) return null;

    const coordenadasValidas = centroPivote.latitud_centro && centroPivote.longitud_centro;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
            <DialogTitle>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Typography variant="h6">
                        Configurar Geozonas - {lote.nombre_lote}
                    </Typography>
                    <Box display="flex" alignItems="center" gap={2}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={previewMode}
                                    onChange={(e) => setPreviewMode(e.target.checked)}
                                />
                            }
                            label="Modo Vista Previa"
                        />
                        <Chip 
                            label={`Regador: ${regador.nombre_dispositivo}`}
                            color="primary"
                            size="small"
                        />
                    </Box>
                </Box>
            </DialogTitle>

            <DialogContent>
                <Grid container spacing={3}>
                    {/* Panel de control */}
                    <Grid item xs={12} md={4}>
                        <Box>
                            {/* Configuración del centro del pivote */}
                            <Accordion defaultExpanded>
                                <AccordionSummary expandIcon={<ExpandMore />}>
                                    <Typography variant="h6">
                                        <LocationOn sx={{ mr: 1 }} />
                                        Centro del Pivote
                                    </Typography>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12}>
                                            <TextField
                                                fullWidth
                                                name="latitud_centro"
                                                label="Latitud del Centro"
                                                type="number"
                                                value={centroPivote.latitud_centro}
                                                onChange={handleCentroChange}
                                                placeholder="-31.4201"
                                                inputProps={{ step: 0.000001 }}
                                                helperText="Haga clic en el mapa para seleccionar"
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <TextField
                                                fullWidth
                                                name="longitud_centro"
                                                label="Longitud del Centro"
                                                type="number"
                                                value={centroPivote.longitud_centro}
                                                onChange={handleCentroChange}
                                                placeholder="-64.1888"
                                                inputProps={{ step: 0.000001 }}
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <TextField
                                                fullWidth
                                                name="radio_cobertura"
                                                label="Radio de Cobertura (metros)"
                                                type="number"
                                                value={centroPivote.radio_cobertura}
                                                onChange={handleCentroChange}
                                                inputProps={{ min: 1 }}
                                                helperText="Radio específico para este lote"
                                            />
                                        </Grid>
                                    </Grid>
                                </AccordionDetails>
                            </Accordion>

                            <Divider sx={{ my: 2 }} />

                            {/* Configuración de sectores */}
                            <Typography variant="h6" gutterBottom>
                                <Settings sx={{ mr: 1 }} />
                                Configuración de Sectores
                            </Typography>

                            {previewMode && (
                                <Box sx={{ mb: 3 }}>
                                    <Typography gutterBottom>
                                        Número de Sectores: {numeroSectores}
                                    </Typography>
                                    <Slider
                                        value={numeroSectores}
                                        onChange={handleNumeroSectoresChange}
                                        min={3}
                                        max={16}
                                        step={1}
                                        marks
                                        valueLabelDisplay="auto"
                                    />
                                    <Button
                                        variant="outlined"
                                        startIcon={<Refresh />}
                                        onClick={crearSectoresPorDefecto}
                                        fullWidth
                                        sx={{ mt: 1 }}
                                        disabled={!centroPivote.radio_cobertura}
                                    >
                                        Regenerar Sectores
                                    </Button>
                                </Box>
                            )}

                            <Divider sx={{ my: 2 }} />

                            {/* Lista de sectores */}
                            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="subtitle1">
                                    Sectores ({sectores.length})
                                </Typography>
                                <Button
                                    startIcon={<Add />}
                                    onClick={handleAddSector}
                                    size="small"
                                    variant="outlined"
                                    disabled={!centroPivote.radio_cobertura}
                                >
                                    Agregar
                                </Button>
                            </Box>

                            <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                                {sectores.map((sector, index) => (
                                    <ListItem
                                        key={index}
                                        selected={selectedSector === index}
                                        sx={{
                                            border: selectedSector === index ? '2px solid #2196F3' : '1px solid #e0e0e0',
                                            borderRadius: 1,
                                            mb: 1,
                                            backgroundColor: selectedSector === index ? 'rgba(33, 150, 243, 0.1)' : 'inherit'
                                        }}
                                    >
                                        <Box sx={{ width: '100%' }}>
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <Box
                                                    sx={{
                                                        width: 20,
                                                        height: 20,
                                                        backgroundColor: sector.color_display,
                                                        borderRadius: '50%',
                                                        opacity: sector.activo ? 1 : 0.5
                                                    }}
                                                />
                                                <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                                                    {sector.nombre_sector}
                                                </Typography>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => toggleSectorActivo(index)}
                                                    color={sector.activo ? "primary" : "default"}
                                                >
                                                    {sector.activo ? <Visibility /> : <VisibilityOff />}
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleEditSector(sector, index)}
                                                >
                                                    <Edit />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleDeleteSector(index)}
                                                    color="error"
                                                >
                                                    <Delete />
                                                </IconButton>
                                            </Box>
                                            <Typography variant="caption" color="textSecondary">
                                                {sector.angulo_inicio.toFixed(1)}° - {sector.angulo_fin.toFixed(1)}° 
                                                | {calcularAreaSector(sector)} ha
                                                | Coef: {sector.coeficiente_riego}
                                                | Prio: {sector.prioridad}
                                            </Typography>
                                        </Box>
                                    </ListItem>
                                ))}
                            </List>

                            {/* Errores de validación */}
                            {errors.validacion && (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2">Errores de validación:</Typography>
                                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                                        {errors.validacion.map((error, index) => (
                                            <li key={index}>{error}</li>
                                        ))}
                                    </ul>
                                </Alert>
                            )}

                            {/* Error general */}
                            {errors.general && (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    {errors.general}
                                </Alert>
                            )}

                            {/* Información de la configuración */}
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="caption" color="textSecondary">
                                    <strong>Estado:</strong> {configuracionExistente ? 'Editando configuración existente' : 'Nueva configuración'}
                                </Typography>
                                {coordenadasValidas && (
                                    <Box sx={{ mt: 1 }}>
                                        <Typography variant="caption" color="textSecondary">
                                            <strong>Centro:</strong> {parseFloat(centroPivote.latitud_centro).toFixed(6)}, {parseFloat(centroPivote.longitud_centro).toFixed(6)}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Grid>

                    {/* Mapa */}
                    <Grid item xs={12} md={8}>
                        <Typography variant="h6" gutterBottom>
                            <PieChart sx={{ mr: 1 }} />
                            Vista de Sectores
                        </Typography>
                        
                        <Box sx={{ height: 600, border: '1px solid #ccc', borderRadius: 1 }}>
                            <MapContainer 
                                center={mapCenter} 
                                zoom={coordenadasValidas ? 16 : 12} 
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                />
                                
                                {/* Manejador de clics en el mapa */}
                                <MapClickHandler onMapClick={handleMapClick} />
                                
                                {/* Marcador del centro del pivote */}
                                {coordenadasValidas && (
                                    <Marker position={[parseFloat(centroPivote.latitud_centro), parseFloat(centroPivote.longitud_centro)]} />
                                )}
                                
                                {/* Overlay de sectores */}
                                {coordenadasValidas && centroPivote.radio_cobertura && (
                                    <SectorOverlay
                                        center={[parseFloat(centroPivote.latitud_centro), parseFloat(centroPivote.longitud_centro)]}
                                        radius={parseFloat(centroPivote.radio_cobertura)}
                                        sectores={sectores}
                                        selectedSector={selectedSector}
                                        onSectorClick={handleSectorClick}
                                    />
                                )}
                            </MapContainer>
                        </Box>

                        {/* Instrucciones */}
                        <Box sx={{ mt: 2 }}>
                            <Alert severity="info">
                                <Typography variant="body2">
                                    <strong>Instrucciones:</strong>
                                    <br />• Haga clic en el mapa para posicionar el centro del pivote
                                    <br />• Configure el radio de cobertura específico para este lote
                                    <br />• Ajuste los sectores según sus necesidades de riego
                                    <br />• Los sectores pueden tener diferentes coeficientes de riego y prioridades
                                </Typography>
                            </Alert>
                        </Box>

                        {/* Resumen de la configuración */}
                        <Paper sx={{ p: 2, mt: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Resumen de Configuración
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="caption" color="textSecondary">
                                        Total Sectores
                                    </Typography>
                                    <Typography variant="h6">
                                        {sectores.length}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="caption" color="textSecondary">
                                        Sectores Activos
                                    </Typography>
                                    <Typography variant="h6" color="success.main">
                                        {sectores.filter(s => s.activo).length}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="caption" color="textSecondary">
                                        Área Total (aprox.)
                                    </Typography>
                                    <Typography variant="h6">
                                        {centroPivote.radio_cobertura ? 
                                            (Math.PI * Math.pow(parseFloat(centroPivote.radio_cobertura), 2) / 10000).toFixed(1) 
                                            : '0'} ha
                                    </Typography>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="caption" color="textSecondary">
                                        Radio Configurado
                                    </Typography>
                                    <Typography variant="h6">
                                        {centroPivote.radio_cobertura || '0'} m
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>
                </Grid>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>
                    Cancelar
                </Button>
                <Button 
                    onClick={handleSaveGeozonas} 
                    variant="contained" 
                    color="primary"
                    startIcon={<Save />}
                    disabled={!coordenadasValidas || !centroPivote.radio_cobertura || sectores.length === 0}
                >
                    {configuracionExistente ? 'Actualizar' : 'Guardar'} Geozonas
                </Button>
            </DialogActions>

            {/* Diálogo de edición de sector */}
            {editingSector && (
                <SectorEditDialog
                    sector={editingSector}
                    onSave={handleSaveSector}
                    onClose={() => setEditingSector(null)}
                    coloresDisponibles={coloresDisponibles}
                />
            )}
        </Dialog>
    );
}

// Componente para editar sector individual
function SectorEditDialog({ sector, onSave, onClose, coloresDisponibles }) {
    const [sectorData, setSectorData] = useState(sector);
    const [errors, setErrors] = useState({});

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setSectorData(prev => ({
            ...prev,
            [name]: value
        }));
        
        // Limpiar errores específicos
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: null
            }));
        }
    };

    const validateSector = () => {
        const newErrors = {};
        
        if (!sectorData.nombre_sector.trim()) {
            newErrors.nombre_sector = 'El nombre del sector es requerido';
        }
        
        const anguloInicio = parseFloat(sectorData.angulo_inicio);
        const anguloFin = parseFloat(sectorData.angulo_fin);
        
        if (isNaN(anguloInicio) || anguloInicio < 0 || anguloInicio >= 360) {
            newErrors.angulo_inicio = 'Debe estar entre 0 y 359.99';
        }
        
        if (isNaN(anguloFin) || anguloFin <= 0 || anguloFin > 360) {
            newErrors.angulo_fin = 'Debe estar entre 0.01 y 360';
        }
        
        if (!isNaN(anguloInicio) && !isNaN(anguloFin) && anguloInicio === anguloFin) {
            newErrors.angulo_fin = 'No puede ser igual al ángulo de inicio';
        }
        
        const coeficiente = parseFloat(sectorData.coeficiente_riego);
        if (isNaN(coeficiente) || coeficiente <= 0 || coeficiente > 3) {
            newErrors.coeficiente_riego = 'Debe estar entre 0.1 y 3.0';
        }
        
        const prioridad = parseInt(sectorData.prioridad);
        if (isNaN(prioridad) || prioridad < 1 || prioridad > 10) {
            newErrors.prioridad = 'Debe estar entre 1 y 10';
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = () => {
        if (validateSector()) {
            onSave(sectorData);
        }
    };

    return (
        <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Editar Sector - {sector.nombre_sector}</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            name="nombre_sector"
                            label="Nombre del Sector"
                            value={sectorData.nombre_sector}
                            onChange={handleInputChange}
                            error={!!errors.nombre_sector}
                            helperText={errors.nombre_sector}
                        />
                    </Grid>
                    
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            name="angulo_inicio"
                            label="Ángulo Inicio (°)"
                            type="number"
                            value={sectorData.angulo_inicio}
                            onChange={handleInputChange}
                            inputProps={{ min: 0, max: 359.99, step: 0.1 }}
                            error={!!errors.angulo_inicio}
                            helperText={errors.angulo_inicio}
                        />
                    </Grid>
                    
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            name="angulo_fin"
                            label="Ángulo Fin (°)"
                            type="number"
                            value={sectorData.angulo_fin}
                            onChange={handleInputChange}
                            inputProps={{ min: 0.01, max: 360, step: 0.1 }}
                            error={!!errors.angulo_fin}
                            helperText={errors.angulo_fin}
                        />
                    </Grid>

                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            name="coeficiente_riego"
                            label="Coeficiente de Riego"
                            type="number"
                            value={sectorData.coeficiente_riego}
                            onChange={handleInputChange}
                            inputProps={{ min: 0.1, max: 3, step: 0.1 }}
                            error={!!errors.coeficiente_riego}
                            helperText={errors.coeficiente_riego || "Multiplicador de agua aplicada (0.1 - 3.0)"}
                        />
                    </Grid>

                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            name="prioridad"
                            label="Prioridad"
                            type="number"
                            value={sectorData.prioridad}
                            onChange={handleInputChange}
                            inputProps={{ min: 1, max: 10 }}
                            error={!!errors.prioridad}
                            helperText={errors.prioridad || "1 = Mayor prioridad, 10 = Menor prioridad"}
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <FormControl fullWidth>
                            <InputLabel>Color</InputLabel>
                            <Select
                                name="color_display"
                                value={sectorData.color_display}
                                onChange={handleInputChange}
                                label="Color"
                                renderValue={(value) => (
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <Box
                                            sx={{
                                                width: 20,
                                                height: 20,
                                                backgroundColor: value,
                                                borderRadius: '50%'
                                            }}
                                        />
                                        {value}
                                    </Box>
                                )}
                            >
                                {coloresDisponibles.map((color) => (
                                    <MenuItem key={color} value={color}>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Box
                                                sx={{
                                                    width: 20,
                                                    height: 20,
                                                    backgroundColor: color,
                                                    borderRadius: '50%'
                                                }}
                                            />
                                            {color}
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    {/* Vista previa del área */}
                    <Grid item xs={12}>
                        <Alert severity="info" sx={{ mt: 1 }}>
                            <Typography variant="caption">
                                <strong>Área estimada:</strong> {
                                    (() => {
                                        const anguloInicio = parseFloat(sectorData.angulo_inicio) || 0;
                                        const anguloFin = parseFloat(sectorData.angulo_fin) || 0;
                                        const radioExterno = parseFloat(sectorData.radio_externo) || 0;
                                        
                                        let anguloRadianes;
                                        if (anguloFin < anguloInicio) {
                                            anguloRadianes = ((360 - anguloInicio) + anguloFin) * Math.PI / 180;
                                        } else {
                                            anguloRadianes = (anguloFin - anguloInicio) * Math.PI / 180;
                                        }
                                        
                                        const areaM2 = (anguloRadianes / (2 * Math.PI)) * Math.PI * Math.pow(radioExterno, 2);
                                        return (areaM2 / 10000).toFixed(3);
                                    })()
                                } hectáreas
                                <br />
                                <strong>Cobertura angular:</strong> {
                                    (() => {
                                        const anguloInicio = parseFloat(sectorData.angulo_inicio) || 0;
                                        const anguloFin = parseFloat(sectorData.angulo_fin) || 0;
                                        
                                        if (anguloFin < anguloInicio) {
                                            return ((360 - anguloInicio) + anguloFin).toFixed(1);
                                        } else {
                                            return (anguloFin - anguloInicio).toFixed(1);
                                        }
                                    })()
                                }° ({
                                    (() => {
                                        const anguloInicio = parseFloat(sectorData.angulo_inicio) || 0;
                                        const anguloFin = parseFloat(sectorData.angulo_fin) || 0;
                                        
                                        let cobertura;
                                        if (anguloFin < anguloInicio) {
                                            cobertura = ((360 - anguloInicio) + anguloFin);
                                        } else {
                                            cobertura = (anguloFin - anguloInicio);
                                        }
                                        
                                        return ((cobertura / 360) * 100).toFixed(1);
                                    })()
                                }% del círculo)
                            </Typography>
                        </Alert>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancelar</Button>
                <Button onClick={handleSave} variant="contained">Guardar Cambios</Button>
            </DialogActions>
        </Dialog>
    );
}

export default GeozonaConfigDialog;