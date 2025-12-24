import React, { useRef, useEffect, useState } from 'react';
import { Box, Typography, Chip, LinearProgress, Grid, Card } from '@mui/material';
import { CheckCircle, Schedule, PlayArrow, Pause, Stop } from '@mui/icons-material';

/**
 * Componente de visualización circular del riego con sectores
 * CORREGIDO: 
 * - Muestra el estado real del regador (Para/Regando/etc.)
 * - Filtra correctamente los sectores por lote actual
 */
function CircularRiegoVisualization({ sectores: sectoresProp, regador, size = 600 }) {
    const regadorId = regador?.regador_id || regador?.id;

    const canvasRef = useRef(null);
    const [sectores, setSectores] = useState([]);
    const [estadoActual, setEstadoActual] = useState(null);
    const [anguloActual, setAnguloActual] = useState(null);
    const [vueltaActual, setVueltaActual] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        cargarDatos();
        const interval = setInterval(cargarDatos, 10000); // Actualizar cada 10 segundos
        return () => clearInterval(interval);
    }, [regadorId]);

    useEffect(() => {
        if (sectores.length > 0 && canvasRef.current) {
            dibujarVisualizacion();
        }
    }, [sectores, anguloActual]);

    const cargarDatos = async () => {
        try {
            // 1. Obtener el último estado del regador
            const estadoResponse = await fetch(`/api/regadores/${regadorId}/ultimo-estado`);
            const estadoData = await estadoResponse.json();
            
            if (estadoData && !estadoData.error) {
                setEstadoActual(estadoData);
                setAnguloActual(estadoData.angulo_actual);
            }

            // 2. Obtener las geozonas/sectores (ya filtradas por lote en el backend)
            const geozonas = await fetch(`/api/regadores/${regadorId}/geozonas`);
            const geozonasData = await geozonas.json();
            
            if (geozonasData.sectores) {
                setSectores(geozonasData.sectores);
            }

            // 3. Obtener la vuelta actual si existe
            const vueltaResponse = await fetch(`/api/regadores/${regadorId}/vuelta-actual`);
            const vueltaData = await vueltaResponse.json();
            
            if (vueltaData.success && vueltaData.data) {
                setVueltaActual(vueltaData.data.vuelta);
            } else {
                setVueltaActual(null);
            }

            setLoading(false);
        } catch (error) {
            console.error('Error cargando datos:', error);
            setLoading(false);
        }
    };

    const dibujarVisualizacion = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const maxRadius = Math.min(centerX, centerY) - 20;

        // Limpiar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Dibujar sectores
        sectores.forEach((sector) => {
            const radioInterno = (sector.radio_interno / getMaxRadioExterno()) * maxRadius;
            const radioExterno = (sector.radio_externo / getMaxRadioExterno()) * maxRadius;
            
            // Convertir ángulos a radianes (Canvas usa radianes, con 0° a la derecha)
            // Ajustar para que 0° esté arriba (Norte)
            const startAngle = ((sector.angulo_inicio - 90) * Math.PI) / 180;
            const endAngle = ((sector.angulo_fin - 90) * Math.PI) / 180;

            // Determinar color según estado
            let color = sector.color_display || '#cccccc';
            
            if (sector.estado === 'completado') {
                color = '#4CAF50'; // Verde
            } else if (sector.estado === 'en_progreso') {
                color = '#FFC107'; // Amarillo/Naranja
            } else if (sector.estado === 'pendiente') {
                color = '#E0E0E0'; // Gris claro
            }

            // Dibujar sector externo
            ctx.beginPath();
            ctx.arc(centerX, centerY, radioExterno, startAngle, endAngle);
            ctx.lineTo(
                centerX + radioInterno * Math.cos(endAngle),
                centerY + radioInterno * Math.sin(endAngle)
            );
            ctx.arc(centerX, centerY, radioInterno, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Dibujar número del sector en el centro del arco
            const midAngle = (startAngle + endAngle) / 2;
            const midRadius = (radioInterno + radioExterno) / 2;
            const textX = centerX + midRadius * Math.cos(midAngle);
            const textY = centerY + midRadius * Math.sin(midAngle);

            ctx.fillStyle = '#000000';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(sector.numero_sector, textX, textY);
        });

        // Dibujar círculo central
        ctx.beginPath();
        ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Texto en el centro
        ctx.fillStyle = '#2196F3';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Vuelta', centerX, centerY - 8);
        
        if (vueltaActual) {
            ctx.font = 'bold 16px Arial';
            ctx.fillText(vueltaActual.numero_vuelta, centerX, centerY + 8);
        } else {
            ctx.font = 'bold 16px Arial';
            ctx.fillText('0', centerX, centerY + 8);
        }

        // Dibujar indicador de posición actual (flecha/línea)
        if (anguloActual !== null) {
            const angle = ((anguloActual - 90) * Math.PI) / 180;
            const indicatorLength = maxRadius + 10;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + indicatorLength * Math.cos(angle),
                centerY + indicatorLength * Math.sin(angle)
            );
            ctx.strokeStyle = '#FF5722'; // Rojo/Naranja
            ctx.lineWidth = 4;
            ctx.stroke();

            // Dibujar punto al final
            ctx.beginPath();
            ctx.arc(
                centerX + indicatorLength * Math.cos(angle),
                centerY + indicatorLength * Math.sin(angle),
                8,
                0,
                2 * Math.PI
            );
            ctx.fillStyle = '#FF5722';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Dibujar leyenda en la esquina
        dibujarLeyenda(ctx);
    };

    const dibujarLeyenda = (ctx) => {
        const leyendaX = 10;
        const leyendaY = 10;
        const cuadroSize = 15;
        const spacing = 20;

        const estados = [
            { texto: 'Completado', color: '#4CAF50' },
            { texto: 'En Progreso', color: '#FFC107' },
            { texto: 'Pendiente', color: '#E0E0E0' }
        ];

        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        estados.forEach((estado, index) => {
            const y = leyendaY + index * spacing;

            // Cuadro de color
            ctx.fillStyle = estado.color;
            ctx.fillRect(leyendaX, y, cuadroSize, cuadroSize);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1;
            ctx.strokeRect(leyendaX, y, cuadroSize, cuadroSize);

            // Texto
            ctx.fillStyle = '#000000';
            ctx.fillText(estado.texto, leyendaX + cuadroSize + 5, y + cuadroSize / 2);
        });
    };

    const getMaxRadioExterno = () => {
        if (sectores.length === 0) return 1;
        return Math.max(...sectores.map(s => s.radio_externo));
    };

    /**
     * ✅ FUNCIÓN CORREGIDA: Determina el estado visual correcto
     */
    const getEstadoRegador = () => {
        if (!estadoActual) return { texto: 'Desconocido', color: 'default', icon: <Stop /> };

        const { estado_texto, regando, moviendose, encendido } = estadoActual;

        // Mapeo correcto según el estado de la base de datos
        if (estado_texto === 'regando_activo') {
            return { texto: 'Regando', color: 'success', icon: <PlayArrow /> };
        }
        
        if (estado_texto === 'regando_detenido') {
            return { texto: 'Regando (Detenido)', color: 'warning', icon: <Pause /> };
        }
        
        if (estado_texto === 'movimiento_sin_riego') {
            return { texto: 'En Movimiento', color: 'info', icon: <PlayArrow /> };
        }
        
        if (estado_texto === 'encendido_detenido') {
            return { texto: 'Para', color: 'default', icon: <Pause /> };
        }
        
        if (estado_texto === 'apagado' || !encendido) {
            return { texto: 'Apagado', color: 'error', icon: <Stop /> };
        }

        return { texto: 'Para', color: 'default', icon: <Pause /> };
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="400px">
                <Typography>Cargando visualización...</Typography>
            </Box>
        );
    }

    const estadoRegador = getEstadoRegador();

    return (
        <Box>
            {/* Header con información del estado */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Typography variant="h6">Estado Actual</Typography>
                    
                    {/* ✅ CHIP CORREGIDO: Muestra el estado real */}
                    <Chip
                        icon={estadoRegador.icon}
                        label={estadoRegador.texto}
                        color={estadoRegador.color}
                        size="medium"
                    />
                </Box>

                <Box display="flex" gap={2}>
                    {estadoActual?.nombre_sector && (
                        <Chip
                            label={`Sector ${estadoActual.numero_sector} - ${estadoActual.nombre_sector}`}
                            color="primary"
                            variant="outlined"
                        />
                    )}
                    
                    {estadoActual?.nombre_lote && (
                        <Chip
                            label={estadoActual.nombre_lote}
                            color="secondary"
                            variant="outlined"
                        />
                    )}
                </Box>
            </Box>

            {/* Información de la vuelta actual */}
            {vueltaActual && (
                <Card sx={{ mb: 2, p: 2, bgcolor: 'primary.light', color: 'white' }}>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                            <Typography variant="subtitle1" fontWeight="bold">
                                Vuelta {vueltaActual.numero_vuelta} en Progreso
                            </Typography>
                            <Typography variant="caption">
                                Ángulo inicial: {parseFloat(vueltaActual.angulo_inicio).toFixed(1)}°
                            </Typography>
                        </Box>
                        <Box textAlign="right">
                            <Typography variant="h5" fontWeight="bold">
                                {parseFloat(vueltaActual.porcentaje_completado || 0).toFixed(1)}%
                            </Typography>
                            <Typography variant="caption">Completado</Typography>
                        </Box>
                    </Box>
                    <LinearProgress
                        variant="determinate"
                        value={parseFloat(vueltaActual.porcentaje_completado || 0)}
                        sx={{ mt: 1, height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.3)' }}
                    />
                </Card>
            )}

            {/* Canvas de visualización */}
            <Box display="flex" justifyContent="center">
                <canvas
                    ref={canvasRef}
                    width={600}
                    height={600}
                    style={{ border: '1px solid #e0e0e0', borderRadius: '8px' }}
                />
            </Box>

            {/* Información adicional */}
            <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={12} sm={4}>
                    <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="caption" color="textSecondary">
                            Sectores Activos
                        </Typography>
                        <Typography variant="h5" color="primary">
                            {sectores.filter(s => s.activo).length}
                        </Typography>
                    </Card>
                </Grid>
                
                <Grid item xs={12} sm={4}>
                    <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="caption" color="textSecondary">
                            Ángulo Actual
                        </Typography>
                        <Typography variant="h5" color="secondary">
                            {anguloActual !== null ? `${anguloActual.toFixed(1)}°` : 'N/A'}
                        </Typography>
                    </Card>
                </Grid>
                
                <Grid item xs={12} sm={4}>
                    <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="caption" color="textSecondary">
                            {estadoActual?.presion ? 'Presión' : 'Velocidad'}
                        </Typography>
                        <Typography variant="h5" color="info.main">
                            {estadoActual?.presion 
                                ? `${estadoActual.presion.toFixed(1)} PSI` 
                                : estadoActual?.velocidad 
                                    ? `${estadoActual.velocidad.toFixed(1)} km/h`
                                    : 'N/A'
                            }
                        </Typography>
                    </Card>
                </Grid>
            </Grid>

            {/* Lista de sectores con su estado */}
            <Box mt={3}>
                <Typography variant="h6" gutterBottom>
                    Sectores del Lote Actual
                </Typography>
                <Grid container spacing={1}>
                    {sectores.map((sector) => (
                        <Grid item xs={12} sm={6} md={4} key={sector.id}>
                            <Card 
                                variant="outlined" 
                                sx={{ 
                                    p: 1.5,
                                    bgcolor: sector.estado === 'completado' ? 'success.light' : 
                                             sector.estado === 'en_progreso' ? 'warning.light' : 
                                             'background.paper',
                                    opacity: sector.activo ? 1 : 0.5
                                }}
                            >
                                <Box display="flex" justifyContent="space-between" alignItems="center">
                                    <Box>
                                        <Typography variant="subtitle2" fontWeight="bold">
                                            Sector {sector.numero_sector}
                                        </Typography>
                                        <Typography variant="caption" color="textSecondary">
                                            {sector.nombre_sector}
                                        </Typography>
                                        {sector.nombre_lote && (
                                            <Typography variant="caption" display="block" color="textSecondary">
                                                📍 {sector.nombre_lote}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Box textAlign="right">
                                        {sector.estado === 'completado' && (
                                            <CheckCircle color="success" fontSize="small" />
                                        )}
                                        {sector.estado === 'en_progreso' && (
                                            <PlayArrow color="warning" fontSize="small" />
                                        )}
                                        {sector.estado === 'pendiente' && (
                                            <Schedule color="disabled" fontSize="small" />
                                        )}
                                        <Typography variant="caption" display="block">
                                            {sector.progreso_porcentaje 
                                                ? `${parseFloat(sector.progreso_porcentaje).toFixed(0)}%`
                                                : sector.estado
                                            }
                                        </Typography>
                                    </Box>
                                </Box>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            </Box>
        </Box>
    );
}

export default CircularRiegoVisualization;