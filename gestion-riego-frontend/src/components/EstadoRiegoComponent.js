import React, { useState, useEffect } from 'react';
import {
    Container, Typography, Grid, Card, CardContent, CardHeader,
    Box, LinearProgress, Chip, IconButton, Button, List, ListItem,
    ListItemText, ListItemIcon, Dialog, DialogTitle, DialogContent,
    DialogActions, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Tooltip, CircularProgress, Tab, Tabs
} from '@mui/material';
import {
    WaterDrop, PlayArrow, Pause, Stop, Refresh, Timeline,
    CheckCircle, RadioButtonChecked, Schedule, Warning,
    Settings, Visibility, MyLocation, PieChart, ViewList,
    ShowChart, Speed, Terrain
} from '@mui/icons-material';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { format, formatDistance } from 'date-fns';
import { es } from 'date-fns/locale';
import axios from '../axiosConfig';
import CircularRiegoVisualization from './CircularRiegoVisualization';

// Componente para el gráfico de presión y altitud
function PresionAltitudChart({ datosOperacion, regador }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="300px">
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="300px">
                <Typography color="error">{error}</Typography>
            </Box>
        );
    }

    if (!datosOperacion || datosOperacion.length === 0) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="300px" flexDirection="column">
                <ShowChart sx={{ fontSize: 48, color: 'gray', mb: 1 }} />
                <Typography color="textSecondary">No hay datos de operación disponibles</Typography>
                <Typography variant="caption" color="textSecondary">
                    Los datos aparecerán cuando el regador esté en operación
                </Typography>
            </Box>
        );
    }

    // Formatear datos para el gráfico
    const datosFormateados = datosOperacion.map(punto => ({
        tiempo: format(new Date(punto.timestamp), 'HH:mm:ss'),
        tiempoCompleto: punto.timestamp,
        presion: punto.presion || 0,
        altitud: punto.altitud || 0,
        velocidad: punto.velocidad || 0,
        angulo: punto.angulo_actual || 0,
        sector: punto.nombre_sector || 'Desconocido'
    }));

    // Calcular estadísticas
    const presionPromedio = datosFormateados.reduce((sum, d) => sum + d.presion, 0) / datosFormateados.length;
    const altitudPromedio = datosFormateados.reduce((sum, d) => sum + d.altitud, 0) / datosFormateados.length;
    const presionMax = Math.max(...datosFormateados.map(d => d.presion));
    const presionMin = Math.min(...datosFormateados.map(d => d.presion));
    const altitudMax = Math.max(...datosFormateados.map(d => d.altitud));
    const altitudMin = Math.min(...datosFormateados.map(d => d.altitud));

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <Paper sx={{ p: 2, maxWidth: 250 }}>
                    <Typography variant="subtitle2" gutterBottom>
                        {label}
                    </Typography>
                    <Typography variant="body2">
                        <strong>Presión:</strong> {data.presion.toFixed(1)} PSI
                    </Typography>
                    <Typography variant="body2">
                        <strong>Altitud:</strong> {data.altitud.toFixed(1)} m
                    </Typography>
                    <Typography variant="body2">
                        <strong>Velocidad:</strong> {data.velocidad.toFixed(1)} km/h
                    </Typography>
                    <Typography variant="body2">
                        <strong>Ángulo:</strong> {data.angulo.toFixed(1)}°
                    </Typography>
                    <Typography variant="body2">
                        <strong>Sector:</strong> {data.sector}
                    </Typography>
                </Paper>
            );
        }
        return null;
    };

    return (
        <Box>
            {/* Estadísticas rápidas */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} md={3}>
                    <Card variant="outlined" sx={{ textAlign: 'center', p: 1 }}>
                        <Typography variant="caption" color="textSecondary">
                            Presión Promedio
                        </Typography>
                        <Typography variant="h6" color="primary">
                            {presionPromedio.toFixed(1)} PSI
                        </Typography>
                    </Card>
                </Grid>
                <Grid item xs={6} md={3}>
                    <Card variant="outlined" sx={{ textAlign: 'center', p: 1 }}>
                        <Typography variant="caption" color="textSecondary">
                            Altitud Promedio
                        </Typography>
                        <Typography variant="h6" color="secondary">
                            {altitudPromedio.toFixed(1)} m
                        </Typography>
                    </Card>
                </Grid>
                <Grid item xs={6} md={3}>
                    <Card variant="outlined" sx={{ textAlign: 'center', p: 1 }}>
                        <Typography variant="caption" color="textSecondary">
                            Rango Presión
                        </Typography>
                        <Typography variant="body2">
                            {presionMin.toFixed(1)} - {presionMax.toFixed(1)} PSI
                        </Typography>
                    </Card>
                </Grid>
                <Grid item xs={6} md={3}>
                    <Card variant="outlined" sx={{ textAlign: 'center', p: 1 }}>
                        <Typography variant="caption" color="textSecondary">
                            Rango Altitud
                        </Typography>
                        <Typography variant="body2">
                            {altitudMin.toFixed(1)} - {altitudMax.toFixed(1)} m
                        </Typography>
                    </Card>
                </Grid>
            </Grid>

            {/* Gráfico */}
            <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom display="flex" alignItems="center" gap={1}>
                    <ShowChart />
                    Presión y Altitud durante la Operación
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={datosFormateados} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                            dataKey="tiempo" 
                            interval="preserveStartEnd"
                            tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                            yAxisId="presion"
                            orientation="left"
                            label={{ value: 'Presión (PSI)', angle: -90, position: 'insideLeft' }}
                            tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                            yAxisId="altitud"
                            orientation="right"
                            label={{ value: 'Altitud (m)', angle: 90, position: 'insideRight' }}
                            tick={{ fontSize: 12 }}
                        />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend />
                        
                        {/* Línea de presión promedio */}
                        <ReferenceLine 
                            yAxisId="presion"
                            y={presionPromedio} 
                            stroke="#1976d2" 
                            strokeDasharray="5 5" 
                            label="Prom. Presión"
                        />
                        
                        {/* Línea de altitud promedio */}
                        <ReferenceLine 
                            yAxisId="altitud"
                            y={altitudPromedio} 
                            stroke="#d32f2f" 
                            strokeDasharray="5 5" 
                            label="Prom. Altitud"
                        />
                        
                        <Line 
                            yAxisId="presion"
                            type="monotone" 
                            dataKey="presion" 
                            stroke="#1976d2" 
                            strokeWidth={2}
                            dot={false}
                            name="Presión (PSI)"
                        />
                        <Line 
                            yAxisId="altitud"
                            type="monotone" 
                            dataKey="altitud" 
                            stroke="#d32f2f" 
                            strokeWidth={2}
                            dot={false}
                            name="Altitud (m)"
                        />
                    </LineChart>
                </ResponsiveContainer>
            </Paper>
        </Box>
    );
}

// Componente para tarjeta de regador individual
function RegadorCard({ regador, onViewDetails, onRefresh }) {
    const getStatusColor = (progreso) => {
        if (progreso === 100) return 'success';
        if (progreso >= 75) return 'info';
        if (progreso >= 50) return 'warning';
        return 'error';
    };

    const getStatusIcon = (sectoresEnProgreso, sectoresCompletados, totalSectores) => {
        if (sectoresEnProgreso > 0) return <PlayArrow sx={{ color: '#4CAF50' }} />;
        if (sectoresCompletados === totalSectores) return <CheckCircle sx={{ color: '#2196F3' }} />;
        return <Schedule sx={{ color: '#FF9800' }} />;
    };

    const formatUltimaActividad = (fecha) => {
        if (!fecha) return 'Sin actividad';
        try {
            return formatDistance(new Date(fecha), new Date(), { 
                addSuffix: true,
                locale: es 
            });
        } catch (error) {
            return 'Fecha inválida';
        }
    };

    return (
        <Card sx={{ height: '100%' }}>
            <CardHeader
                title={
                    <Box display="flex" alignItems="center" gap={1}>
                        {getStatusIcon(
                            regador.sectores_en_progreso, 
                            regador.sectores_completados, 
                            regador.total_sectores
                        )}
                        <Typography variant="h6" component="div">
                            {regador.nombre_dispositivo}
                        </Typography>
                    </Box>
                }
                action={
                    <Box>
                        <Tooltip title="Ver detalles">
                            <IconButton onClick={() => onViewDetails(regador)}>
                                <Visibility />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Actualizar">
                            <IconButton onClick={() => onRefresh(regador.regador_id)}>
                                <Refresh />
                            </IconButton>
                        </Tooltip>
                    </Box>
                }
                subheader={
                    <Chip 
                        label={regador.regador_activo ? 'Activo' : 'Inactivo'}
                        color={regador.regador_activo ? 'success' : 'default'}
                        size="small"
                    />
                }
            />
            <CardContent>
                <Grid container spacing={2}>
                    {/* Progreso general */}
                    <Grid item xs={12}>
                        <Box display="flex" alignItems="center" gap={2}>
                            <Typography variant="body2" color="textSecondary" sx={{ minWidth: '60px' }}>
                                Progreso:
                            </Typography>
                            <Box sx={{ flexGrow: 1 }}>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={regador.progreso_promedio || 0}
                                    color={getStatusColor(regador.progreso_promedio || 0)}
                                    sx={{ height: 8, borderRadius: 4 }}
                                />
                            </Box>
                            <Typography variant="body2" fontWeight="bold">
                                {Math.round(regador.progreso_promedio || 0)}%
                            </Typography>
                        </Box>
                    </Grid>

                    {/* Estadísticas de sectores */}
                    <Grid item xs={12}>
                        <Box display="flex" gap={1} flexWrap="wrap">
                            <Chip 
                                icon={<CheckCircle />}
                                label={`${regador.sectores_completados} Completados`}
                                size="small"
                                color="success"
                                variant="outlined"
                            />
                            <Chip 
                                icon={<PlayArrow />}
                                label={`${regador.sectores_en_progreso} En Progreso`}
                                size="small"
                                color="primary"
                                variant="outlined"
                            />
                            <Chip 
                                icon={<Schedule />}
                                label={`${regador.sectores_pendientes} Pendientes`}
                                size="small"
                                color="default"
                                variant="outlined"
                            />
                        </Box>
                    </Grid>

                    {/* Información adicional */}
                    <Grid item xs={12}>
                        <Typography variant="body2" color="textSecondary">
                            <strong>Radio:</strong> {regador.radio_cobertura}m
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                            <strong>Agua Aplicada:</strong> {regador.agua_total_aplicada || 0} L
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                            <strong>Última Actividad:</strong> {formatUltimaActividad(regador.ultima_actividad)}
                        </Typography>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );
}

// Componente principal
function EstadoRiegoComponent({ campoId, nombreCampo }) {
    const [regadores, setRegadores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRegador, setSelectedRegador] = useState(null);
    const [detalleDialog, setDetalleDialog] = useState(false);
    const [sectoresDetalle, setSectoresDetalle] = useState([]);
    const [eventosRecientes, setEventosRecientes] = useState([]);
    const [datosOperacion, setDatosOperacion] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [tabValue, setTabValue] = useState(0);

    useEffect(() => {
        if (campoId) {
            fetchEstadoRiego();
        }
    }, [campoId]);

    const fetchEstadoRiego = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`/regadores/campo/${campoId}/estado-riego`);
            setRegadores(response.data);
            
            // Log para debugging en caso de múltiples regadores
            if (response.data.length > 1) {
                console.log(`📡 Campo ${nombreCampo} tiene ${response.data.length} regadores configurados`);
            }
        } catch (error) {
            console.error('Error al obtener estado de riego:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDatosOperacion = async (regadorId) => {
        try {
            // Obtener datos de operación de las últimas 24 horas o del ciclo actual
            const response = await axios.get(`/regadores/${regadorId}/datos-operacion`, {
                params: {
                    desde: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Últimas 24 horas
                    incluir_presion: true,
                    incluir_altitud: true
                }
            });
            setDatosOperacion(response.data);
        } catch (error) {
            console.error('Error al obtener datos de operación:', error);
            setDatosOperacion([]);
        }
    };

    const handleViewDetails = async (regador) => {
        try {
            setSelectedRegador(regador);
            
            // Cargar sectores detallados
            const sectoresResponse = await axios.get(`/regadores/${regador.regador_id}/geozonas`);
            setSectoresDetalle(sectoresResponse.data);
            
            // Cargar eventos recientes
            const eventosResponse = await axios.get(`/regadores/${regador.regador_id}/eventos?limit=20`);
            setEventosRecientes(eventosResponse.data);
            
            // Cargar datos de operación
            await fetchDatosOperacion(regador.regador_id);
            
            setDetalleDialog(true);
        } catch (error) {
            console.error('Error al obtener detalles del regador:', error);
        }
    };

    const handleRefresh = async (regadorId = null) => {
        setRefreshing(true);
        try {
            if (regadorId) {
                // Refrescar solo un regador específico
                await fetchEstadoRiego();
            } else {
                // Refrescar todo
                await fetchEstadoRiego();
            }
        } catch (error) {
            console.error('Error al actualizar:', error);
        } finally {
            setRefreshing(false);
        }
    };

    const getEstadoColor = (estado) => {
        switch (estado) {
            case 'completado': return 'success';
            case 'en_progreso': return 'primary';
            case 'pausado': return 'warning';
            default: return 'default';
        }
    };

    const formatFecha = (fecha) => {
        if (!fecha) return 'No definido';
        try {
            return format(new Date(fecha), 'dd/MM/yyyy HH:mm', { locale: es });
        } catch (error) {
            return 'Fecha inválida';
        }
    };

    if (loading) {
        return (
            <Container maxWidth="xl">
                <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                    <CircularProgress />
                </Box>
            </Container>
        );
    }

    return (
        <Container maxWidth="xl">
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" gutterBottom>
                    Estado de Riego - {nombreCampo}
                </Typography>
                <Button
                    variant="outlined"
                    startIcon={refreshing ? <CircularProgress size={20} /> : <Refresh />}
                    onClick={() => handleRefresh()}
                    disabled={refreshing}
                >
                    {refreshing ? 'Actualizando...' : 'Actualizar'}
                </Button>
            </Box>

            {regadores.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <WaterDrop sx={{ fontSize: 64, color: 'gray', mb: 2 }} />
                    <Typography variant="h6" color="textSecondary">
                        No hay regadores configurados en este campo
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                        Configure regadores en la gestión de campos para ver el estado de riego
                    </Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {regadores.map((regador) => (
                        <Grid item xs={12} sm={6} lg={4} key={regador.regador_id}>
                            <RegadorCard
                                regador={regador}
                                onViewDetails={handleViewDetails}
                                onRefresh={handleRefresh}
                            />
                        </Grid>
                    ))}
                </Grid>
            )}

            {/* Dialog de detalles */}
            <Dialog 
                open={detalleDialog} 
                onClose={() => setDetalleDialog(false)}
                maxWidth="xl"
                fullWidth
            >
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={2}>
                        <WaterDrop />
                        Detalles de Riego - {selectedRegador?.nombre_dispositivo}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
                            <Tab 
                                icon={<PieChart />} 
                                label="Vista Circular" 
                                iconPosition="start"
                            />
                            <Tab 
                                icon={<ShowChart />} 
                                label="Datos de Operación" 
                                iconPosition="start"
                            />
                            <Tab 
                                icon={<ViewList />} 
                                label="Vista Detallada" 
                                iconPosition="start"
                            />
                        </Tabs>
                    </Box>

                    {tabValue === 0 && (
                        /* Vista Circular */
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={8}>
                                <CircularRiegoVisualization 
                                    sectores={sectoresDetalle}
                                    regador={selectedRegador}
                                    size={400}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <Typography variant="h6" gutterBottom>
                                    Eventos Recientes
                                </Typography>
                                <Paper variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
                                    <List dense>
                                        {eventosRecientes.map((evento, index) => (
                                            <ListItem key={index}>
                                                <ListItemIcon>
                                                    {evento.tipo_evento === 'entrada' && <PlayArrow color="success" />}
                                                    {evento.tipo_evento === 'salida' && <Stop color="error" />}
                                                    {evento.tipo_evento === 'movimiento' && <MyLocation color="info" />}
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={`${evento.tipo_evento} ${evento.nombre_sector ? `- ${evento.nombre_sector}` : ''}`}
                                                    secondary={formatFecha(evento.fecha_evento)}
                                                />
                                            </ListItem>
                                        ))}
                                        {eventosRecientes.length === 0 && (
                                            <ListItem>
                                                <ListItemText 
                                                    primary="No hay eventos recientes"
                                                    secondary="Los eventos aparecerán aquí cuando el dispositivo esté activo"
                                                />
                                            </ListItem>
                                        )}
                                    </List>
                                </Paper>
                            </Grid>
                        </Grid>
                    )}

                    {tabValue === 1 && (
                        /* Vista de Datos de Operación */
                        <Grid container spacing={3}>
                            <Grid item xs={12}>
                                <PresionAltitudChart 
                                    datosOperacion={datosOperacion}
                                    regador={selectedRegador}
                                />
                            </Grid>
                        </Grid>
                    )}

                    {tabValue === 2 && (
                        /* Vista Detallada */
                        <Grid container spacing={3}>
                            {/* Sectores */}
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom>
                                    Estado de Sectores
                                </Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Sector</TableCell>
                                                <TableCell>Estado</TableCell>
                                                <TableCell>Progreso</TableCell>
                                                <TableCell>Agua (L)</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {sectoresDetalle.map((sector) => (
                                                <TableRow key={sector.id}>
                                                    <TableCell>
                                                        <Box display="flex" alignItems="center" gap={1}>
                                                            <Box
                                                                sx={{
                                                                    width: 16,
                                                                    height: 16,
                                                                    backgroundColor: sector.color_display,
                                                                    borderRadius: '50%'
                                                                }}
                                                            />
                                                            {sector.nombre_sector}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip 
                                                            label={sector.estado || 'pendiente'}
                                                            size="small"
                                                            color={getEstadoColor(sector.estado)}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        {sector.progreso_porcentaje || 0}%
                                                    </TableCell>
                                                    <TableCell>
                                                        {sector.agua_aplicada_litros || 0}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Grid>

                            {/* Eventos recientes */}
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom>
                                    Eventos Recientes
                                </Typography>
                                <Paper variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
                                    <List dense>
                                        {eventosRecientes.map((evento, index) => (
                                            <ListItem key={index}>
                                                <ListItemIcon>
                                                    {evento.tipo_evento === 'entrada' && <PlayArrow color="success" />}
                                                    {evento.tipo_evento === 'salida' && <Stop color="error" />}
                                                    {evento.tipo_evento === 'movimiento' && <MyLocation color="info" />}
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={`${evento.tipo_evento} ${evento.nombre_sector ? `- ${evento.nombre_sector}` : ''}`}
                                                    secondary={formatFecha(evento.fecha_evento)}
                                                />
                                            </ListItem>
                                        ))}
                                        {eventosRecientes.length === 0 && (
                                            <ListItem>
                                                <ListItemText 
                                                    primary="No hay eventos recientes"
                                                    secondary="Los eventos aparecerán aquí cuando el dispositivo esté activo"
                                                />
                                            </ListItem>
                                        )}
                                    </List>
                                </Paper>
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetalleDialog(false)}>
                        Cerrar
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default EstadoRiegoComponent;