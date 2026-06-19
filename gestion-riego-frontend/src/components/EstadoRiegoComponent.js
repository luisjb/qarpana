import React, { useState, useEffect, useRef } from 'react';
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
    ShowChart, Speed, Terrain, Autorenew
} from '@mui/icons-material';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { format, formatDistance } from 'date-fns';
import { es } from 'date-fns/locale';
import axios from '../axiosConfig';
import CircularRiegoVisualization from './CircularRiegoVisualization';
import { Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';

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

            {/* Gráfico de líneas dual */}
            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                    📈 Presión y Altitud en el Tiempo
                </Typography>
                <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={datosFormateados}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            dataKey="tiempo"
                            tick={{ fontSize: 11 }}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            yAxisId="presion"
                            label={{ value: 'Presión (PSI)', angle: -90, position: 'insideLeft' }}
                            stroke="#1976d2"
                        />
                        <YAxis
                            yAxisId="altitud"
                            orientation="right"
                            label={{ value: 'Altitud (m)', angle: 90, position: 'insideRight' }}
                            stroke="#d32f2f"
                        />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend />
                        <ReferenceLine
                            yAxisId="presion"
                            y={presionPromedio}
                            stroke="#1976d2"
                            strokeDasharray="5 5"
                            label={{ value: 'Promedio', position: 'insideTopRight' }}
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
            return 'Fecha invÃ¡lida';
        }
    };

    // â­ NUEVO: Calcular lámina aplicada en mm
    const calcularLaminaAplicada = () => {
        if (!regador.agua_total_aplicada || !regador.radio_cobertura) return 0;

        // Área del círculo en m²
        const areaM2 = Math.PI * Math.pow(regador.radio_cobertura, 2);

        // Lámina (mm) = (agua en litros * 0.001 / área m²) / 10
        const laminaMM = (regador.agua_total_aplicada * 0.001 / areaM2);

        return laminaMM.toFixed(2);
    };

    return (
        <Card sx={{ height: '100%' }}>
            <CardHeader
                title={
                    <Box display="flex" flexDirection="column" gap={0.5}>
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
                        {/* â­ NUEVO: Mostrar lote/círculo actual si está regando */}
                        {regador.lote_actual && (
                            <Typography variant="caption" color="primary" sx={{ ml: 4 }}>
                                📍 {regador.lote_actual}
                                {regador.sector_actual && ` - Sector ${regador.sector_actual}`}
                            </Typography>
                        )}
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

                    {/* EstadÃ­sticas de sectores */}
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

                    {/* â­ MODIFICADO: InformaciÃ³n adicional con lámina en lugar de litros */}
                    <Grid item xs={12}>
                        <Typography variant="body2" color="textSecondary">
                            <strong>Radio:</strong> {regador.radio_cobertura}m
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                            <strong>Lámina Aplicada:</strong> {calcularLaminaAplicada()} mm
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
function EstadoRiegoComponent({ campoId, nombreCampo, campaña }) {
    const [regadores, setRegadores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRegador, setSelectedRegador] = useState(null);
    const [detalleDialog, setDetalleDialog] = useState(false);
    const [sectoresDetalle, setSectoresDetalle] = useState([]);
    const [eventosRecientes, setEventosRecientes] = useState([]);
    const [datosOperacion, setDatosOperacion] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [tabValue, setTabValue] = useState(0);

    // ⭐ NUEVOS ESTADOS PARA VUELTAS
    const [vueltas, setVueltas] = useState([]);
    const [vueltaActual, setVueltaActual] = useState(null);
    const [estadisticasGenerales, setEstadisticasGenerales] = useState(null);
    const [loadingVueltas, setLoadingVueltas] = useState(false);

    // ⭐ NUEVO - Estados para mostrar en el título del Dialog
    const [sectorActual, setSectorActual] = useState(null);
    const [estadoActual, setEstadoActual] = useState(null);

    // ⭐ NUEVO - Estados para reinicio de regador
    const [isAdmin, setIsAdmin] = useState(false);
    const [confirmReinicioDialog, setConfirmReinicioDialog] = useState(false);
    const [reiniciandoRegador, setReiniciandoRegador] = useState(false);
    const prevCampañaRef = useRef(undefined);

    useEffect(() => {
        if (campoId) {
            fetchEstadoRiego();
        }
        // Verificar si es admin
        const userRole = localStorage.getItem('role');
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    }, [campoId]);

    // Re-fetch solo cuando la campaña cambia explícitamente (no en el mount inicial)
    useEffect(() => {
        if (prevCampañaRef.current === undefined) {
            prevCampañaRef.current = campaña;
            return;
        }
        if (prevCampañaRef.current !== campaña) {
            prevCampañaRef.current = campaña;
            if (campoId) fetchEstadoRiego();
        }
    }, [campaña]);

    // Actualización automática cada 30 segundos
    useEffect(() => {
        const interval = setInterval(() => {
            if (selectedRegador && detalleDialog) {
                // Actualizar datos cuando está viendo detalles
                fetchDatosOperacion(selectedRegador.regador_id);

                // Si está en el tab de vueltas, actualizar vueltas
                if (tabValue === 3) {
                    cargarVueltasYEstadisticas(selectedRegador.regador_id);
                }
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [selectedRegador, detalleDialog, tabValue]);

    const fetchEstadoRiego = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`/gps/campos/${campoId}/estado-riego`, {
                params: campaña ? { campaña } : {}
            });

            // Asegurar que siempre sea un array
            const data = Array.isArray(response.data) ? response.data : [];
            setRegadores(data);

            if (data.length > 1) {
                console.log(`📡 Campo ${nombreCampo} tiene ${data.length} regadores configurados`);
            }
        } catch (error) {
            console.error('Error al obtener estado de riego:', error);
            setRegadores([]); // Establecer array vacío en caso de error
        } finally {
            setLoading(false);
        }
    };

    const fetchDatosOperacion = async (regadorId) => {
        try {
            const response = await axios.get(`/gps/regadores/${regadorId}/datos-operacion`, {
                params: {
                    desde: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
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

    // ⭐ NUEVA FUNCIÓN - Cargar vueltas y estadísticas
    const cargarVueltasYEstadisticas = async (regadorId) => {
        try {
            setLoadingVueltas(true);

            const response = await axios.get(`/regadores/${regadorId}/resumen-completo`);

            console.log('📊 Respuesta vueltas:', response.data);

            if (response.data.success) {
                const vueltas = Array.isArray(response.data.data.vueltas) ? response.data.data.vueltas : [];
                setVueltas(vueltas);
                setVueltaActual(response.data.data.vuelta_actual || null);
                setEstadisticasGenerales(response.data.data.estadisticas_generales || null);
            } else {
                setVueltas([]);
                setVueltaActual(null);
                setEstadisticasGenerales(null);
            }
        } catch (error) {
            console.error('Error cargando vueltas:', error);
            console.error('Detalles del error:', error.response?.data || error.message);
            setVueltas([]);
            setVueltaActual(null);
            setEstadisticasGenerales(null);
        } finally {
            setLoadingVueltas(false);
        }
    };

    const handleViewDetails = async (regador) => {
        try {
            setSelectedRegador(regador);

            // Cargar sectores detallados
            const sectoresResponse = await axios.get(`/geozonas-pivote/regador/${regador.regador_id}`);
            console.log('📊 Respuesta sectores:', sectoresResponse.data);

            let sectores = [];
            if (sectoresResponse.data && sectoresResponse.data.success && Array.isArray(sectoresResponse.data.data)) {
                sectores = sectoresResponse.data.data;  // Formato nuevo
                console.log('📊 Sectores cargados:', sectores.length);
            } else if (Array.isArray(sectoresResponse.data)) {
                sectores = sectoresResponse.data;  // Formato antiguo
            }

            setSectoresDetalle(sectores);

            // Cargar eventos recientes
            const eventosResponse = await axios.get(`/gps/regadores/${regador.regador_id}/eventos?limit=20`);
            const eventos = Array.isArray(eventosResponse.data) ? eventosResponse.data : [];
            setEventosRecientes(eventos);

            // ⭐ NUEVO - Cargar posición actual para el título
            try {
                const posicionResponse = await axios.get(`/gps/regadores/${regador.regador_id}/posicion-actual`);
                if (posicionResponse.data.success) {
                    setSectorActual(posicionResponse.data.data.nombre_sector);
                    setEstadoActual(posicionResponse.data.data);
                }
            } catch (error) {
                console.log('No hay posición actual disponible');
                setSectorActual(null);
                setEstadoActual(null);
            }

            // Cargar datos de operación
            await fetchDatosOperacion(regador.regador_id);

            // ⭐ NUEVO - Cargar vueltas y estadísticas
            await cargarVueltasYEstadisticas(regador.regador_id);

            setDetalleDialog(true);
        } catch (error) {
            console.error('Error al obtener detalles del regador:', error);
            console.error('Detalles del error:', error.response?.data || error.message);
            // Establecer valores por defecto en caso de error
            setSectoresDetalle([]);
            setEventosRecientes([]);
        }
    };

    const handleRefresh = async (regadorId = null) => {
        setRefreshing(true);
        try {
            await fetchEstadoRiego();

            // Si hay un regador seleccionado, actualizar sus detalles también
            if (selectedRegador && detalleDialog) {
                await fetchDatosOperacion(selectedRegador.regador_id);
                if (tabValue === 3) {
                    await cargarVueltasYEstadisticas(selectedRegador.regador_id);
                }
            }
        } catch (error) {
            console.error('Error al actualizar:', error);
        } finally {
            setRefreshing(false);
        }
    };

    // ⭐ NUEVA FUNCIÓN - Reiniciar regador
    const handleReiniciarRegador = async () => {
        try {
            setReiniciandoRegador(true);
            const response = await axios.post(`/regadores/${selectedRegador.regador_id}/reiniciar`);

            if (response.data.success) {
                // Actualizar datos después del reinicio
                await handleRefresh(selectedRegador.regador_id);
                setConfirmReinicioDialog(false);
                console.log('✅ Regador reiniciado correctamente');
            }
        } catch (error) {
            console.error('Error al reiniciar regador:', error);
            alert('Error al reiniciar el regador: ' + (error.response?.data?.error || error.message));
        } finally {
            setReiniciandoRegador(false);
        }
    };

    const handleCloseDialog = () => {
        setDetalleDialog(false);
        setSelectedRegador(null);
        setSectoresDetalle([]);
        setEventosRecientes([]);
        setDatosOperacion([]);
        setTabValue(0);
        // Limpiar datos de vueltas
        setVueltas([]);
        setVueltaActual(null);
        setEstadisticasGenerales(null);
        // ⭐ NUEVO - Limpiar sector y estado actual
        setSectorActual(null);
        setEstadoActual(null);
        // Limpiar diálogo de reinicio
        setConfirmReinicioDialog(false);
    };

    if (loading) {
        return (
            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
                    <CircularProgress size={60} />
                </Box>
            </Container>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <WaterDrop sx={{ fontSize: 40, color: '#1976d2' }} />
                    <Typography variant="h4" component="h1">
                        Estado de Riego - {nombreCampo}
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Refresh />}
                    onClick={() => handleRefresh()}
                    disabled={refreshing}
                >
                    {refreshing ? 'Actualizando...' : 'Actualizar'}
                </Button>
            </Box>

            {/* Grid de regadores */}
            {regadores.length === 0 ? (
                <Card>
                    <CardContent>
                        <Box textAlign="center" py={4}>
                            <Warning sx={{ fontSize: 48, color: 'warning.main', mb: 2 }} />
                            <Typography variant="h6" gutterBottom>
                                No hay regadores configurados en este campo
                            </Typography>
                            <Typography color="textSecondary">
                                Configure un regador GPS desde la gestión de campos
                            </Typography>
                        </Box>
                    </CardContent>
                </Card>
            ) : (
                <Grid container spacing={3}>
                    {regadores.map((regador) => (
                        <Grid item xs={12} md={6} lg={4} key={regador.regador_id}>
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
                onClose={handleCloseDialog}
                maxWidth="xl"
                fullWidth
                PaperProps={{
                    sx: { height: '90vh' }
                }}
            >
                <DialogTitle>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box display="flex" alignItems="center" gap={2} flexGrow={1}>
                            <MyLocation color="primary" />
                            <Box>
                                <Typography variant="h6">
                                    {selectedRegador?.nombre_dispositivo}
                                </Typography>
                                {/* ⭐ NUEVO - Mostrar sector actual si existe */}
                                {sectorActual && estadoActual && (
                                    <Box>
                                        <Typography variant="body2" color="textSecondary">
                                            {estadoActual.regando ? '💧 Regando en: ' : '📍 Ubicado en: '}
                                            <strong>{sectorActual}</strong>
                                            {estadoActual.nombre_lote && ` - ${estadoActual.nombre_lote}`}
                                        </Typography>
                                        {/* ⭐ NUEVO - Mostrar ángulo y sentido de giro detectado */}
                                        <Typography variant="caption" color="textSecondary" sx={{ mt: 0.5, display: 'block' }}>
                                            📐 Ángulo: {estadoActual.angulo_actual != null ? parseFloat(estadoActual.angulo_actual).toFixed(1) : '—'}°
                                            {estadoActual.sentido_giro && estadoActual.sentido_giro !== 'auto' && (
                                                <span style={{ marginLeft: '8px' }}>
                                                    {estadoActual.sentido_giro === 'horario' ? '🔄 Horario' : '↩️ Antihorario'}
                                                </span>
                                            )}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                        <Box display="flex" gap={1}>
                            <Chip
                                label={`${sectoresDetalle.length} Sectores`}
                                color="primary"
                                size="small"
                            />
                            <Chip
                                label={selectedRegador?.regador_activo ? 'Activo' : 'Inactivo'}
                                color={selectedRegador?.regador_activo ? 'success' : 'default'}
                                size="small"
                            />
                            {/* ⭐ NUEVO - Chip de estado actual */}
                            {estadoActual && (
                                <Chip
                                    icon={estadoActual.regando ? <WaterDrop /> : <Pause />}
                                    label={estadoActual.regando ? 'Regando' : 'Detenido'}
                                    color={estadoActual.regando ? 'success' : 'warning'}
                                    size="small"
                                />
                            )}
                        </Box>
                    </Box>
                </DialogTitle>

                <DialogContent>
                    <Tabs
                        value={tabValue}
                        onChange={(e, newValue) => setTabValue(newValue)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
                    >
                        <Tab label="Visualización" icon={<PieChart />} />
                        <Tab label="Sectores" icon={<ViewList />} />
                        <Tab label="Gráficas" icon={<ShowChart />} />
                        <Tab label="Vueltas" icon={<Autorenew />} /> {/* ⭐ NUEVO TAB */}
                    </Tabs>

                    {/* Tab 0: Visualización Circular */}
                    {tabValue === 0 && (
                        <Box>
                            {sectoresDetalle.length > 0 ? (
                                <CircularRiegoVisualization
                                    sectores={sectoresDetalle}
                                    regador={selectedRegador}
                                    estadoActualProp={estadoActual}
                                    size={500}
                                />
                            ) : (
                                <Box textAlign="center" py={4}>
                                    <Typography color="textSecondary">
                                        No hay sectores configurados para este regador
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    )}

                    {/* Tab 1: Lista de Sectores */}
                    {tabValue === 1 && (
                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Sector</TableCell>
                                        <TableCell>Lote</TableCell>
                                        <TableCell>Estado</TableCell>
                                        <TableCell align="right">Progreso</TableCell>
                                        <TableCell align="right">Agua Aplicada</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sectoresDetalle.map((sector) => (
                                        <TableRow key={sector.id}>
                                            <TableCell>
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <Box
                                                        sx={{
                                                            width: 12,
                                                            height: 12,
                                                            borderRadius: '50%',
                                                            bgcolor: sector.color_display || '#e0e0e0'
                                                        }}
                                                    />
                                                    {sector.nombre_sector}
                                                </Box>
                                            </TableCell>
                                            <TableCell>{sector.nombre_lote || '-'}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={sector.estado || 'Pendiente'}
                                                    size="small"
                                                    color={
                                                        sector.estado === 'completado' ? 'success' :
                                                            sector.estado === 'en_progreso' ? 'primary' :
                                                                'default'
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                {sector.progreso_porcentaje ?
                                                    `${Math.round(sector.progreso_porcentaje)}%` :
                                                    '-'
                                                }
                                            </TableCell>
                                            <TableCell align="right">
                                                {sector.agua_aplicada_litros ?
                                                    `${Math.round(sector.agua_aplicada_litros)} L` :
                                                    '-'
                                                }
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* Tab 2: Gráficas */}
                    {tabValue === 2 && (
                        <PresionAltitudChart
                            datosOperacion={datosOperacion}
                            regador={selectedRegador}
                        />
                    )}

                    {/* ⭐ NUEVO TAB 3: Vueltas de Riego */}
                    {tabValue === 3 && (
                        <Box>
                            {loadingVueltas ? (
                                <Box display="flex" justifyContent="center" p={4}>
                                    <CircularProgress />
                                </Box>
                            ) : (
                                <>
                                    {/* Header con estadísticas generales */}
                                    {estadisticasGenerales && (
                                        <Card sx={{ mb: 2 }}>
                                            <CardContent>
                                                <Typography variant="h6" gutterBottom>
                                                    📊 Estadísticas Generales de Riego
                                                </Typography>
                                                <Grid container spacing={2} sx={{ mt: 1 }}>
                                                    <Grid item xs={6} md={3}>
                                                        <Box textAlign="center" p={2} bgcolor="primary.light" borderRadius={2}>
                                                            <Typography variant="h4" color="primary.contrastText">
                                                                {estadisticasGenerales.total_vueltas}
                                                            </Typography>
                                                            <Typography variant="caption" color="primary.contrastText">
                                                                Vueltas Totales
                                                            </Typography>
                                                        </Box>
                                                    </Grid>
                                                    <Grid item xs={6} md={3}>
                                                        <Box textAlign="center" p={2} bgcolor="success.light" borderRadius={2}>
                                                            <Typography variant="h4" color="success.contrastText">
                                                                {estadisticasGenerales.lamina_promedio_mm} mm
                                                            </Typography>
                                                            <Typography variant="caption" color="success.contrastText">
                                                                Lámina Promedio
                                                            </Typography>
                                                        </Box>
                                                    </Grid>
                                                    <Grid item xs={6} md={3}>
                                                        <Box textAlign="center" p={2} bgcolor="info.light" borderRadius={2}>
                                                            <Typography variant="h4" color="info.contrastText">
                                                                {parseFloat(estadisticasGenerales.agua_total_aplicada_m3).toFixed(1)} m³
                                                            </Typography>
                                                            <Typography variant="caption" color="info.contrastText">
                                                                Agua Total Aplicada
                                                            </Typography>
                                                        </Box>
                                                    </Grid>
                                                    <Grid item xs={6} md={3}>
                                                        <Box textAlign="center" p={2} bgcolor="warning.light" borderRadius={2}>
                                                            <Typography variant="h4" color="warning.contrastText">
                                                                {estadisticasGenerales.tiempo_total_horas} hs
                                                            </Typography>
                                                            <Typography variant="caption" color="warning.contrastText">
                                                                Tiempo Total de Riego
                                                            </Typography>
                                                        </Box>
                                                    </Grid>
                                                </Grid>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Vuelta actual en progreso */}
                                    {vueltaActual && (
                                        <Card sx={{ mb: 2, border: '2px solid', borderColor: 'primary.main' }}>
                                            <CardContent>
                                                <Box display="flex" alignItems="center" gap={1} mb={2}>
                                                    <PlayArrow color="primary" />
                                                    <Typography variant="h6">
                                                        🔄 Vuelta {vueltaActual.numero_vuelta} - En Progreso
                                                    </Typography>
                                                </Box>

                                                <LinearProgress
                                                    variant="determinate"
                                                    value={parseFloat(vueltaActual.porcentaje_completado || 0)}
                                                    sx={{ mb: 2, height: 10, borderRadius: 5 }}
                                                />

                                                <Grid container spacing={2}>
                                                    <Grid item xs={6} md={3}>
                                                        <Typography variant="caption" color="textSecondary">
                                                            Progreso
                                                        </Typography>
                                                        <Typography variant="h6">
                                                            {parseFloat(vueltaActual.porcentaje_completado || 0).toFixed(1)}%
                                                        </Typography>
                                                    </Grid>
                                                    <Grid item xs={6} md={3}>
                                                        <Typography variant="caption" color="textSecondary">
                                                            Ángulo Inicio
                                                        </Typography>
                                                        <Typography variant="h6">
                                                            {parseFloat(vueltaActual.angulo_inicio).toFixed(1)}°
                                                        </Typography>
                                                    </Grid>
                                                    <Grid item xs={6} md={3}>
                                                        <Typography variant="caption" color="textSecondary">
                                                            Inicio
                                                        </Typography>
                                                        <Typography variant="body2">
                                                            {format(new Date(vueltaActual.fecha_inicio), 'HH:mm:ss', { locale: es })}
                                                        </Typography>
                                                    </Grid>
                                                    <Grid item xs={6} md={3}>
                                                        <Typography variant="caption" color="textSecondary">
                                                            Tiempo Transcurrido
                                                        </Typography>
                                                        <Typography variant="body2">
                                                            {formatDistance(new Date(vueltaActual.fecha_inicio), new Date(), { locale: es })}
                                                        </Typography>
                                                    </Grid>
                                                </Grid>
                                            </CardContent>
                                        </Card>
                                    )}

                                    {/* Historial de vueltas */}
                                    <Card>
                                        <CardHeader
                                            title="📜 Historial de Vueltas"
                                            subheader={`${vueltas.length} vueltas registradas`}
                                        />
                                        <CardContent>
                                            {vueltas.length === 0 ? (
                                                <Box textAlign="center" py={4}>
                                                    <Autorenew sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                                                    <Typography color="textSecondary">
                                                        No hay vueltas registradas aún
                                                    </Typography>
                                                    <Typography variant="caption" color="textSecondary">
                                                        Las vueltas aparecerán cuando el regador comience a regar
                                                    </Typography>
                                                </Box>
                                            ) : (
                                                vueltas.map((vuelta) => (
                                                    <Accordion key={vuelta.vuelta_id} sx={{ mb: 1 }}>
                                                        <AccordionSummary
                                                            expandIcon={<ExpandMore />}
                                                            sx={{
                                                                '&:hover': { bgcolor: 'action.hover' },
                                                                transition: 'all 0.2s'
                                                            }}
                                                        >
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
                                                                    {format(new Date(vuelta.fecha_inicio), 'dd/MM/yyyy HH:mm', { locale: es })}
                                                                </Typography>

                                                                <Box flexGrow={1} />

                                                                <Box textAlign="right">
                                                                    <Typography variant="body2" fontWeight="bold">
                                                                        {parseFloat(vuelta.lamina_promedio_mm || 0).toFixed(1)} mm
                                                                    </Typography>
                                                                    <Typography variant="caption" color="textSecondary">
                                                                        lámina aplicada
                                                                    </Typography>
                                                                </Box>
                                                            </Box>
                                                        </AccordionSummary>

                                                        <AccordionDetails sx={{ bgcolor: 'background.default' }}>
                                                            <Grid container spacing={2}>
                                                                <Grid item xs={6} md={3}>
                                                                    <Typography variant="caption" color="textSecondary">
                                                                        ⏱️ Duración
                                                                    </Typography>
                                                                    <Typography variant="h6">
                                                                        {vuelta.duracion_total_minutos} min
                                                                    </Typography>
                                                                </Grid>

                                                                <Grid item xs={6} md={3}>
                                                                    <Typography variant="caption" color="textSecondary">
                                                                        💧 Agua Aplicada
                                                                    </Typography>
                                                                    <Typography variant="h6">
                                                                        {parseFloat(vuelta.agua_total_litros || 0).toFixed(0)} L
                                                                    </Typography>
                                                                </Grid>

                                                                <Grid item xs={6} md={3}>
                                                                    <Typography variant="caption" color="textSecondary">
                                                                        📏 Área Regada
                                                                    </Typography>
                                                                    <Typography variant="h6">
                                                                        {parseFloat(vuelta.area_total_ha || 0).toFixed(2)} ha
                                                                    </Typography>
                                                                </Grid>

                                                                <Grid item xs={6} md={3}>
                                                                    <Typography variant="caption" color="textSecondary">
                                                                        🔧 Presión Promedio
                                                                    </Typography>
                                                                    <Typography variant="h6">
                                                                        {parseFloat(vuelta.presion_promedio_vuelta || 0).toFixed(1)} PSI
                                                                    </Typography>
                                                                </Grid>

                                                                <Grid item xs={12}>
                                                                    <Box display="flex" alignItems="center" gap={1} mt={1}>
                                                                        <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
                                                                        <Typography variant="body2" color="textSecondary">
                                                                            Sectores completados: {vuelta.sectores_completados} / {vuelta.sectores_pasados}
                                                                        </Typography>
                                                                    </Box>
                                                                </Grid>
                                                            </Grid>
                                                        </AccordionDetails>
                                                    </Accordion>
                                                ))
                                            )}
                                        </CardContent>
                                    </Card>
                                </>
                            )}
                        </Box>
                    )}
                </DialogContent>

                <DialogActions>
                    {/* ⭐ NUEVO - Botón para reiniciar (solo admins) */}
                    {isAdmin && (
                        <Button
                            onClick={() => setConfirmReinicioDialog(true)}
                            color="error"
                            disabled={reiniciandoRegador}
                            startIcon={<Refresh />}
                        >
                            Reiniciar Regador
                        </Button>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    <Button onClick={handleCloseDialog}>
                        Cerrar
                    </Button>
                    <Button
                        onClick={() => handleRefresh(selectedRegador?.regador_id)}
                        startIcon={<Refresh />}
                        disabled={refreshing}
                    >
                        Actualizar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ⭐ NUEVO - Diálogo de confirmación para reinicio */}
            <Dialog
                open={confirmReinicioDialog}
                onClose={() => setConfirmReinicioDialog(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    ⚠️ Reiniciar Regador
                </DialogTitle>
                <DialogContent>
                    <Typography sx={{ mt: 2 }}>
                        Está a punto de reiniciar el regador <strong>{selectedRegador?.nombre_dispositivo}</strong>.
                    </Typography>
                    <Typography sx={{ mt: 2, mb: 2 }} color="warning.main">
                        Esta acción eliminará:
                    </Typography>
                    <ul style={{ margin: '0 0 16px 0' }}>
                        <li>Toda el agua aplicada</li>
                        <li>Todas las vueltas registradas</li>
                        <li>Todos los sectores completados</li>
                        <li>El progreso actual</li>
                    </ul>
                    <Typography color="textSecondary">
                        El regador quedará listo para comenzar de nuevo desde el inicio.
                    </Typography>
                    <Typography sx={{ mt: 2 }} color="error" variant="body2">
                        <strong>⚠️ Esta acción no se puede deshacer</strong>
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmReinicioDialog(false)}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleReiniciarRegador}
                        color="error"
                        variant="contained"
                        disabled={reiniciandoRegador}
                    >
                        {reiniciandoRegador ? 'Reiniciando...' : 'Confirmar Reinicio'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default EstadoRiegoComponent;