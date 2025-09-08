import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Typography, Box, List, ListItem, ListItemText,
    IconButton, Grid, Slider, FormControl, InputLabel, Select,
    MenuItem, Alert, Chip, Divider, Switch, FormControlLabel
} from '@mui/material';
import { 
    Add, Delete, Edit, Palette, Save, Refresh,
    PieChart, Settings, Visibility, VisibilityOff 
} from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Componente personalizado para mostrar sectores en el mapa
function SectorOverlay({ center, radius, sectores, selectedSector, onSectorClick }) {
    const map = useMap();
    const sectorsRef = useRef([]);

    useEffect(() => {
        // Limpiar sectores previos
        sectorsRef.current.forEach(layer => map.removeLayer(layer));
        sectorsRef.current = [];

        if (!center || !radius || !sectores.length) return;

        sectores.forEach((sector, index) => {
            if (!sector.activo && !sector.mostrar_preview) return;

            const { angulo_inicio, angulo_fin, color_display, nombre_sector } = sector;
            
            // Crear geometría del sector (porción de pizza)
            const centerLatLng = L.latLng(center[0], center[1]);
            const radiusMeters = radius;
            
            // Convertir ángulos a radianes
            const startAngle = (angulo_inicio * Math.PI) / 180;
            const endAngle = (angulo_fin * Math.PI) / 180;
            
            // Crear puntos para el polígono del sector
            const points = [centerLatLng]; // Empezar desde el centro
            
            // Calcular puntos del arco
            const numPoints = 30; // Resolución del arco
            const angleStep = (endAngle - startAngle) / numPoints;
            
            for (let i = 0; i <= numPoints; i++) {
                const angle = startAngle + (i * angleStep);
                const lat = center[0] + (radiusMeters / 111000) * Math.cos(angle);
                const lng = center[1] + (radiusMeters / (111000 * Math.cos(center[0] * Math.PI / 180))) * Math.sin(angle);
                points.push(L.latLng(lat, lng));
            }
            
            points.push(centerLatLng); // Volver al centro

            // Crear el polígono
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

    // Colores predefinidos para los sectores
    const coloresDisponibles = [
        '#FF5722', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', 
        '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
        '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800',
        '#795548', '#607D8B', '#424242'
    ];

    useEffect(() => {
        if (open && regador) {
            // Cargar sectores existentes o crear plantilla por defecto
            cargarSectores();
        }
    }, [open, regador]);

    const cargarSectores = async () => {
        try {
            // Aquí cargarías los sectores existentes desde la API
            // const response = await axios.get(`/geozonas/lote/${lote.id}/regador/${regador.id}`);
            // setSectores(response.data);
            
            // Por ahora, crear sectores por defecto si no existen
            crearSectoresPorDefecto();
        } catch (error) {
            console.error('Error cargando sectores:', error);
            crearSectoresPorDefecto();
        }
    };

    const crearSectoresPorDefecto = () => {
        const angulosPorSector = 360 / numeroSectores;
        const nuevosSectores = [];

        for (let i = 0; i < numeroSectores; i++) {
            nuevosSectores.push({
                numero_sector: i + 1,
                nombre_sector: `Sector ${i + 1}`,
                angulo_inicio: i * angulosPorSector,
                angulo_fin: (i + 1) * angulosPorSector,
                radio_interno: 0,
                radio_externo: regador.radio_cobertura,
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
            const angulosPorSector = 360 / newValue;
            const nuevosSectores = [];

            for (let i = 0; i < newValue; i++) {
                nuevosSectores.push({
                    numero_sector: i + 1,
                    nombre_sector: `Sector ${i + 1}`,
                    angulo_inicio: i * angulosPorSector,
                    angulo_fin: (i + 1) * angulosPorSector,
                    radio_interno: 0,
                    radio_externo: regador.radio_cobertura,
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
        setSectores(nuevosSectores);
        if (selectedSector === index) {
            setSelectedSector(null);
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
            radio_externo: regador.radio_cobertura,
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

    const validarSectores = () => {
        const errores = [];
        
        // Validar que no haya solapamientos
        for (let i = 0; i < sectores.length; i++) {
            for (let j = i + 1; j < sectores.length; j++) {
                const sector1 = sectores[i];
                const sector2 = sectores[j];
                
                if ((sector1.angulo_inicio < sector2.angulo_fin && sector1.angulo_fin > sector2.angulo_inicio)) {
                    errores.push(`Los sectores ${sector1.nombre_sector} y ${sector2.nombre_sector} se solapan`);
                }
            }
        }

        // Validar que los ángulos estén en rango válido
        sectores.forEach((sector, index) => {
            if (sector.angulo_inicio < 0 || sector.angulo_inicio >= 360) {
                errores.push(`Sector ${sector.nombre_sector}: Ángulo de inicio inválido`);
            }
            if (sector.angulo_fin <= sector.angulo_inicio || sector.angulo_fin > 360) {
                errores.push(`Sector ${sector.nombre_sector}: Ángulo de fin inválido`);
            }
        });

        return errores;
    };

    const handleSaveGeozonas = () => {
        const errores = validarSectores();
        
        if (errores.length > 0) {
            setErrors({ validacion: errores });
            return;
        }

        const datosGuardar = {
            lote_id: lote.id,
            regador_id: regador.id,
            sectores: sectores.map(sector => ({
                ...sector,
                mostrar_preview: undefined // No guardar campo de preview
            }))
        };

        onSave(datosGuardar);
    };

    const calcularAreaSector = (sector) => {
        const anguloRadianes = ((sector.angulo_fin - sector.angulo_inicio) * Math.PI) / 180;
        const areaM2 = (anguloRadianes / (2 * Math.PI)) * Math.PI * Math.pow(sector.radio_externo, 2);
        return (areaM2 / 10000).toFixed(3); // Convertir a hectáreas
    };

    if (!regador) return null;

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
                        </Box>
                    </Grid>

                    {/* Mapa */}
                    <Grid item xs={12} md={8}>
                        <Typography variant="h6" gutterBottom>
                            <PieChart sx={{ mr: 1 }} />
                            Vista de Sectores
                        </Typography>
                        <Box sx={{ height: 600, border: '1px solid #ccc', borderRadius: 1 }}>
                            {regador && regador.latitud_centro && regador.longitud_centro ? (
                                <MapContainer 
                                    center={[parseFloat(regador.latitud_centro), parseFloat(regador.longitud_centro)]} 
                                    zoom={16} 
                                    style={{ height: '100%', width: '100%' }}
                                >
                                    <TileLayer
                                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    />
                                    
                                    {/* Marcador del centro del pivote */}
                                    <Marker position={[parseFloat(regador.latitud_centro), parseFloat(regador.longitud_centro)]} />
                                    
                                    {/* Overlay de sectores */}
                                    <SectorOverlay
                                        center={[parseFloat(regador.latitud_centro), parseFloat(regador.longitud_centro)]}
                                        radius={parseFloat(regador.radio_cobertura)}
                                        sectores={sectores}
                                        selectedSector={selectedSector}
                                        onSectorClick={handleSectorClick}
                                    />
                                </MapContainer>
                            ) : (
                                <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                                    <Typography color="error">
                                        Error: Ubicación del regador no válida
                                    </Typography>
                                </Box>
                            )}
                        </Box>
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
                >
                    Guardar Geozonas
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

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setSectorData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSave = () => {
        onSave(sectorData);
    };

    return (
        <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Editar Sector</DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            name="nombre_sector"
                            label="Nombre del Sector"
                            value={sectorData.nombre_sector}
                            onChange={handleInputChange}
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
                            inputProps={{ min: 0, max: 360, step: 0.1 }}
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
                            inputProps={{ min: 0, max: 360, step: 0.1 }}
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
                            inputProps={{ min: 0, max: 2, step: 0.1 }}
                            helperText="Multiplicador de agua aplicada"
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
                            helperText="1 = Mayor prioridad"
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
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancelar</Button>
                <Button onClick={handleSave} variant="contained">Guardar</Button>
            </DialogActions>
        </Dialog>
    );
}

export default GeozonaConfigDialog;