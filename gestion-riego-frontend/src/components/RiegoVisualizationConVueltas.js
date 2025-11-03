import React, { useRef, useEffect, useState } from 'react';
import { 
    Box, Typography, Card, CardContent, Grid, Chip, 
    Tabs, Tab, Accordion, AccordionSummary, AccordionDetails,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    Divider, LinearProgress
} from '@mui/material';
import { 
    CheckCircle, Schedule, PlayArrow, Pause, 
    ExpandMore, Water, Speed, Timer, TrendingUp
} from '@mui/icons-material';

// Componente principal que muestra vueltas y visualización
function RiegoVisualizationConVueltas({ regadorId }) {
    const [resumenCompleto, setResumenCompleto] = useState(null);
    const [vueltaSeleccionada, setVueltaSeleccionada] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tabActual, setTabActual] = useState(0);

    useEffect(() => {
        cargarDatos();
        const interval = setInterval(cargarDatos, 30000); // Actualizar cada 30 segundos
        return () => clearInterval(interval);
    }, [regadorId]);

    const cargarDatos = async () => {
        try {
            const response = await fetch(`/api/regadores/${regadorId}/resumen-completo`);
            const data = await response.json();
            
            if (data.success) {
                setResumenCompleto(data.data);
                
                // Si hay vuelta actual, seleccionarla por defecto
                if (data.data.vuelta_actual) {
                    cargarDetalleVuelta(data.data.vuelta_actual.id);
                }
            }
            
            setLoading(false);
        } catch (error) {
            console.error('Error cargando datos:', error);
            setLoading(false);
        }
    };

    const cargarDetalleVuelta = async (vueltaId) => {
        try {
            const response = await fetch(`/api/regadores/${regadorId}/vueltas/${vueltaId}/detalles`);
            const data = await response.json();
            
            if (data.success) {
                setVueltaSeleccionada(data.data);
            }
        } catch (error) {
            console.error('Error cargando detalle de vuelta:', error);
        }
    };

    if (loading) {
        return <Box p={3}><Typography>Cargando datos de riego...</Typography></Box>;
    }

    if (!resumenCompleto) {
        return <Box p={3}><Typography>No hay datos disponibles</Typography></Box>;
    }

    const { regador, estadisticas_generales, vuelta_actual, vueltas } = resumenCompleto;

    return (
        <Box sx={{ width: '100%', p: 2 }}>
            {/* Header con estadísticas generales */}
            <Card sx={{ mb: 2 }}>
                <CardContent>
                    <Typography variant="h5" gutterBottom>
                        {regador.nombre} - Sistema de Riego
                    </Typography>
                    
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12} sm={6} md={3}>
                            <Box textAlign="center">
                                <Typography variant="h4" color="primary">
                                    {estadisticas_generales.total_vueltas}
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                    Vueltas Totales
                                </Typography>
                            </Box>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                            <Box textAlign="center">
                                <Typography variant="h4" color="success.main">
                                    {estadisticas_generales.lamina_promedio_mm} mm
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                    Lámina Promedio
                                </Typography>
                            </Box>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                            <Box textAlign="center">
                                <Typography variant="h4" color="info.main">
                                    {estadisticas_generales.agua_total_aplicada_m3.toFixed(1)} m³
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                    Agua Total Aplicada
                                </Typography>
                            </Box>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                            <Box textAlign="center">
                                <Typography variant="h4" color="warning.main">
                                    {estadisticas_generales.tiempo_total_horas} hs
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                    Tiempo Total de Riego
                                </Typography>
                            </Box>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Vuelta actual */}
            {vuelta_actual && (
                <Card sx={{ mb: 2, border: '2px solid', borderColor: 'primary.main' }}>
                    <CardContent>
                        <Box display="flex" alignItems="center" gap={1} mb={2}>
                            <PlayArrow color="primary" />
                            <Typography variant="h6">
                                Vuelta {vuelta_actual.numero_vuelta} - En Progreso
                            </Typography>
                        </Box>
                        
                        <LinearProgress 
                            variant="determinate" 
                            value={parseFloat(vuelta_actual.porcentaje_completado || 0)} 
                            sx={{ mb: 2, height: 8, borderRadius: 4 }}
                        />
                        
                        <Grid container spacing={2}>
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="textSecondary">
                                    Progreso
                                </Typography>
                                <Typography variant="h6">
                                    {parseFloat(vuelta_actual.porcentaje_completado || 0).toFixed(1)}%
                                </Typography>
                            </Grid>
                            
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="textSecondary">
                                    Ángulo Inicio
                                </Typography>
                                <Typography variant="h6">
                                    {parseFloat(vuelta_actual.angulo_inicio).toFixed(1)}°
                                </Typography>
                            </Grid>
                            
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="textSecondary">
                                    Tiempo Transcurrido
                                </Typography>
                                <Typography variant="h6">
                                    {calcularTiempoTranscurrido(vuelta_actual.fecha_inicio)}
                                </Typography>
                            </Grid>
                            
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="textSecondary">
                                    Fecha Inicio
                                </Typography>
                                <Typography variant="body2">
                                    {new Date(vuelta_actual.fecha_inicio).toLocaleString()}
                                </Typography>
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>
            )}

            {/* Tabs para visualización y vueltas */}
            <Card>
                <Tabs value={tabActual} onChange={(e, newValue) => setTabActual(newValue)}>
                    <Tab label="Visualización Circular" />
                    <Tab label="Historial de Vueltas" />
                    <Tab label="Gráficos y Análisis" />
                </Tabs>

                {/* Tab 0: Visualización Circular */}
                {tabActual === 0 && (
                    <Box p={3}>
                        <CircularRiegoVisualizationConVuelta 
                            regador={regador}
                            vueltaActual={vuelta_actual}
                            sectoresVueltaActual={vueltaSeleccionada?.sectores || []}
                        />
                    </Box>
                )}

                {/* Tab 1: Historial de Vueltas */}
                {tabActual === 1 && (
                    <Box p={3}>
                        <HistorialVueltas 
                            vueltas={vueltas}
                            onSeleccionarVuelta={cargarDetalleVuelta}
                        />
                    </Box>
                )}

                {/* Tab 2: Gráficos */}
                {tabActual === 2 && (
                    <Box p={3}>
                        <Typography variant="h6">Análisis y Gráficos</Typography>
                        <Typography color="textSecondary">
                            Próximamente: gráficos de evolución de lámina, presión, etc.
                        </Typography>
                    </Box>
                )}
            </Card>

            {/* Detalle de vuelta seleccionada */}
            {vueltaSeleccionada && (
                <Card sx={{ mt: 2 }}>
                    <CardContent>
                        <DetalleVuelta vuelta={vueltaSeleccionada} />
                    </CardContent>
                </Card>
            )}
        </Box>
    );
}

// Componente de visualización circular actualizado
function CircularRiegoVisualizationConVuelta({ regador, vueltaActual, sectoresVueltaActual, size = 400 }) {
    const [geozonas, setGeozonas] = useState([]);
    const [sectorActual, setSectorActual] = useState(null);
    
    useEffect(() => {
        cargarGeozonas();
    }, [regador.id]);

    const cargarGeozonas = async () => {
        try {
            const response = await fetch(`/api/geozonas-pivote/regador/${regador.id}`);
            const data = await response.json();
            if (data.success) {
                setGeozonas(data.data);
            }
        } catch (error) {
            console.error('Error cargando geozonas:', error);
        }
    };

    // Obtener la geozona activa actual
    useEffect(() => {
        const cargarPosicionActual = async () => {
            try {
                const response = await fetch(`/api/gps/${regador.id}/posicion-actual`);
                const data = await response.json();
                if (data.success && data.data.nombre_sector) {
                    setSectorActual(data.data.nombre_sector);
                }
            } catch (error) {
                console.error('Error cargando posición actual:', error);
            }
        };

        cargarPosicionActual();
        const interval = setInterval(cargarPosicionActual, 10000); // cada 10 seg
        return () => clearInterval(interval);
    }, [regador.id]);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = (size / 2) - 50;

    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    };

    const createSectorPath = (centerX, centerY, radius, startAngle, endAngle) => {
        const start = polarToCartesian(centerX, centerY, radius, endAngle);
        const end = polarToCartesian(centerX, centerY, radius, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

        return [
            "M", centerX, centerY,
            "L", start.x, start.y,
            "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
            "Z"
        ].join(" ");
    };

    const getSectorColor = (geozona) => {
        const sectorEnVuelta = sectoresVueltaActual.find(s => s.geozona_id === geozona.id);
        
        if (sectorActual === geozona.nombre_sector) {
            // Sector activo actual
            return '#4CAF50'; // Verde brillante
        } else if (sectorEnVuelta && sectorEnVuelta.completado) {
            // Sector completado en la vuelta
            return geozona.color_display || '#81C784'; // Verde más claro
        } else if (sectorEnVuelta && !sectorEnVuelta.completado) {
            // Sector en progreso
            return '#FFA726'; // Naranja
        } else {
            // Sector pendiente
            return '#E0E0E0'; // Gris claro
        }
    };

    const getTextPosition = (startAngle, endAngle) => {
        let midAngle = (startAngle + endAngle) / 2;
        
        if (endAngle < startAngle) {
            midAngle = ((startAngle + endAngle + 360) / 2) % 360;
        }
        
        const textRadius = radius * 0.7;
        const angleInRadians = (midAngle - 90) * Math.PI / 180.0;
        
        return {
            x: centerX + (textRadius * Math.cos(angleInRadians)),
            y: centerY + (textRadius * Math.sin(angleInRadians))
        };
    };

    return (
        <Box>
            {/* Indicador del sector actual */}
            {sectorActual && (
                <Box mb={2} p={2} bgcolor="primary.light" borderRadius={2}>
                    <Typography variant="h6" color="white" textAlign="center">
                        🎯 Regando actualmente: {sectorActual}
                    </Typography>
                </Box>
            )}

            <Box display="flex" justifyContent="center" mb={2}>
                <svg width={size} height={size} style={{ overflow: 'visible' }}>
                    {/* Círculo de fondo */}
                    <circle
                        cx={centerX}
                        cy={centerY}
                        r={radius}
                        fill="none"
                        stroke="#BDBDBD"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                    />

                    {/* Sectores/Geozonas */}
                    {geozonas.map((geozona, index) => {
                        const startAngle = parseFloat(geozona.angulo_inicio) || 0;
                        const endAngle = parseFloat(geozona.angulo_fin) || 0;
                        
                        if (startAngle === endAngle || startAngle < 0 || endAngle < 0 || startAngle >= 360 || endAngle > 360) {
                            return null;
                        }
                        
                        const sectorPath = createSectorPath(centerX, centerY, radius, startAngle, endAngle);
                        const textPos = getTextPosition(startAngle, endAngle);
                        const sectorEnVuelta = sectoresVueltaActual.find(s => s.geozona_id === geozona.id);

                        return (
                            <g key={geozona.id}>
                                <path
                                    d={sectorPath}
                                    fill={getSectorColor(geozona)}
                                    stroke="#ffffff"
                                    strokeWidth="3"
                                    style={{
                                        transition: 'all 0.3s ease'
                                    }}
                                />

                                {/* Número del sector */}
                                <text
                                    x={textPos.x}
                                    y={textPos.y}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontSize="14"
                                    fill="#333"
                                    fontWeight="bold"
                                >
                                    {geozona.numero_sector}
                                </text>

                                {/* Icono si está completado */}
                                {sectorEnVuelta && sectorEnVuelta.completado && (
                                    <text
                                        x={textPos.x}
                                        y={textPos.y + 15}
                                        textAnchor="middle"
                                        fontSize="16"
                                    >
                                        ✓
                                    </text>
                                )}
                            </g>
                        );
                    })}

                    {/* Centro con información de la vuelta */}
                    <circle
                        cx={centerX}
                        cy={centerY}
                        r="40"
                        fill="#ffffff"
                        stroke="#2196F3"
                        strokeWidth="3"
                    />
                    <text
                        x={centerX}
                        y={centerY - 10}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="18"
                        fill="#2196F3"
                        fontWeight="bold"
                    >
                        Vuelta
                    </text>
                    <text
                        x={centerX}
                        y={centerY + 10}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize="24"
                        fill="#2196F3"
                        fontWeight="bold"
                    >
                        {vueltaActual ? vueltaActual.numero_vuelta : '-'}
                    </text>
                </svg>
            </Box>

            {/* Leyenda */}
            <Grid container spacing={1} justifyContent="center">
                <Grid item>
                    <Chip 
                        icon={<PlayArrow />}
                        label="Actual"
                        size="small"
                        sx={{ bgcolor: '#4CAF50', color: 'white' }}
                    />
                </Grid>
                <Grid item>
                    <Chip 
                        icon={<CheckCircle />}
                        label="Completado"
                        size="small"
                        sx={{ bgcolor: '#81C784', color: 'white' }}
                    />
                </Grid>
                <Grid item>
                    <Chip 
                        icon={<Schedule />}
                        label="En Progreso"
                        size="small"
                        sx={{ bgcolor: '#FFA726', color: 'white' }}
                    />
                </Grid>
                <Grid item>
                    <Chip 
                        label="Pendiente"
                        size="small"
                        sx={{ bgcolor: '#E0E0E0' }}
                    />
                </Grid>
            </Grid>
        </Box>
    );
}

// Componente de historial de vueltas
function HistorialVueltas({ vueltas, onSeleccionarVuelta }) {
    const [expandida, setExpandida] = useState(null);

    return (
        <Box>
            <Typography variant="h6" gutterBottom>
                Historial de Vueltas
            </Typography>
            
            {vueltas.map((vuelta) => (
                <Accordion 
                    key={vuelta.vuelta_id}
                    expanded={expandida === vuelta.vuelta_id}
                    onChange={() => {
                        setExpandida(expandida === vuelta.vuelta_id ? null : vuelta.vuelta_id);
                        if (expandida !== vuelta.vuelta_id) {
                            onSeleccionarVuelta(vuelta.vuelta_id);
                        }
                    }}
                    sx={{ mb: 1 }}
                >
                    <AccordionSummary expandIcon={<ExpandMore />}>
                        <Box display="flex" alignItems="center" gap={2} width="100%">
                            <Chip 
                                label={`Vuelta ${vuelta.numero_vuelta}`}
                                color="primary"
                                size="small"
                            />
                            
                            {vuelta.completada ? (
                                <Chip 
                                    icon={<CheckCircle />}
                                    label="Completada"
                                    color="success"
                                    size="small"
                                />
                            ) : (
                                <Chip 
                                    icon={<PlayArrow />}
                                    label="En curso"
                                    color="warning"
                                    size="small"
                                />
                            )}
                            
                            <Typography variant="body2" color="textSecondary">
                                {new Date(vuelta.fecha_inicio).toLocaleDateString()}
                            </Typography>
                            
                            <Box flexGrow={1} />
                            
                            <Typography variant="body2" fontWeight="bold">
                                {parseFloat(vuelta.lamina_promedio_mm || 0).toFixed(1)} mm
                            </Typography>
                        </Box>
                    </AccordionSummary>
                    
                    <AccordionDetails>
                        <Grid container spacing={2}>
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="textSecondary">
                                    Duración
                                </Typography>
                                <Typography variant="body1">
                                    {vuelta.duracion_total_minutos} min
                                </Typography>
                            </Grid>
                            
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="textSecondary">
                                    Agua Aplicada
                                </Typography>
                                <Typography variant="body1">
                                    {parseFloat(vuelta.agua_total_litros || 0).toFixed(0)} L
                                </Typography>
                            </Grid>
                            
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="textSecondary">
                                    Área
                                </Typography>
                                <Typography variant="body1">
                                    {parseFloat(vuelta.area_total_ha || 0).toFixed(2)} ha
                                </Typography>
                            </Grid>
                            
                            <Grid item xs={6} md={3}>
                                <Typography variant="caption" color="textSecondary">
                                    Presión Promedio
                                </Typography>
                                <Typography variant="body1">
                                    {parseFloat(vuelta.presion_promedio_vuelta || 0).toFixed(1)} PSI
                                </Typography>
                            </Grid>
                            
                            <Grid item xs={12}>
                                <Typography variant="caption" color="textSecondary">
                                    Sectores: {vuelta.sectores_completados} / {vuelta.sectores_pasados}
                                </Typography>
                            </Grid>
                        </Grid>
                    </AccordionDetails>
                </Accordion>
            ))}
        </Box>
    );
}

// Componente de detalle de vuelta con tabla de sectores
function DetalleVuelta({ vuelta }) {
    const { vuelta: infoVuelta, sectores } = vuelta;

    return (
        <Box>
            <Typography variant="h6" gutterBottom>
                Detalle Vuelta {infoVuelta.numero_vuelta}
            </Typography>
            
            <Divider sx={{ my: 2 }} />
            
            <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                Sectores Regados
            </Typography>
            
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell><strong>Orden</strong></TableCell>
                            <TableCell><strong>Sector</strong></TableCell>
                            <TableCell align="right"><strong>Duración (min)</strong></TableCell>
                            <TableCell align="right"><strong>Lámina (mm)</strong></TableCell>
                            <TableCell align="right"><strong>Agua (L)</strong></TableCell>
                            <TableCell align="right"><strong>Área (ha)</strong></TableCell>
                            <TableCell align="right"><strong>Presión (PSI)</strong></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sectores.map((sector) => (
                            <TableRow key={sector.id}>
                                <TableCell>{sector.orden_en_vuelta}</TableCell>
                                <TableCell>
                                    {sector.numero_sector} - {sector.nombre_sector}
                                    {sector.nombre_lote && ` (${sector.nombre_lote})`}
                                </TableCell>
                                <TableCell align="right">
                                    {sector.duracion_minutos || '-'}
                                </TableCell>
                                <TableCell align="right">
                                    <strong>{parseFloat(sector.lamina_aplicada_mm || 0).toFixed(1)}</strong>
                                </TableCell>
                                <TableCell align="right">
                                    {parseFloat(sector.agua_aplicada_litros || 0).toFixed(0)}
                                </TableCell>
                                <TableCell align="right">
                                    {parseFloat(sector.area_sector_ha || 0).toFixed(2)}
                                </TableCell>
                                <TableCell align="right">
                                    {sector.presion_promedio 
                                        ? `${parseFloat(sector.presion_promedio).toFixed(1)} (${parseFloat(sector.presion_min).toFixed(1)}-${parseFloat(sector.presion_max).toFixed(1)})`
                                        : '-'
                                    }
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

// Utilidad para calcular tiempo transcurrido
function calcularTiempoTranscurrido(fechaInicio) {
    const ahora = new Date();
    const inicio = new Date(fechaInicio);
    const diffMs = ahora - inicio;
    const diffMinutos = Math.floor(diffMs / 60000);
    
    const horas = Math.floor(diffMinutos / 60);
    const minutos = diffMinutos % 60;
    
    return `${horas}h ${minutos}m`;
}

export default RiegoVisualizationConVueltas;