import React, { useRef, useEffect, useState } from 'react';
import { Box, Typography, Chip, LinearProgress, Grid, Card } from '@mui/material';
import { CheckCircle, Schedule, PlayArrow, Pause, Stop } from '@mui/icons-material';

/**
 * Componente de visualización circular del riego con sectores
 * VERSIÓN ULTRA-ROBUSTA:
 * - Acepta sectores como prop (no hace fetch)
 * - Acepta regador como objeto
 * - Manejo de errores mejorado
 * - No crashea si faltan datos
 */
function CircularRiegoVisualization({ sectores: sectoresProp, regador, size = 600 }) {
    const canvasRef = useRef(null);
    const [sectores, setSectores] = useState([]);
    const [estadoActual, setEstadoActual] = useState(null);
    const [anguloActual, setAnguloActual] = useState(null);
    const [vueltaActual, setVueltaActual] = useState(null);
    const [loading, setLoading] = useState(true);

    // Obtener regadorId del objeto regador
    const regadorId = regador?.regador_id || regador?.id;

    console.log('🎨 CircularRiegoVisualization montado:', {
        regadorId,
        sectores: sectoresProp?.length,
        regador: regador?.nombre_dispositivo
    });

    // Actualizar sectores cuando cambian las props
    useEffect(() => {
        if (sectoresProp && Array.isArray(sectoresProp)) {
            console.log('✅ Sectores recibidos:', sectoresProp.length);
            setSectores(sectoresProp);
            setLoading(false);
        } else {
            console.warn('⚠️ No hay sectores en props');
            setLoading(false);
        }
    }, [sectoresProp]);

    // Cargar datos adicionales SOLO si hay regadorId
    useEffect(() => {
        if (!regadorId) {
            console.warn('⚠️ No hay regadorId, saltando carga de datos adicionales');
            return;
        }

        cargarDatosAdicionales();
        const interval = setInterval(cargarDatosAdicionales, 10000);
        return () => clearInterval(interval);
    }, [regadorId]);

    // Dibujar cuando hay datos
    useEffect(() => {
        if (sectores.length > 0 && canvasRef.current) {
            console.log('🖌️ Dibujando canvas con', sectores.length, 'sectores');
            try {
                dibujarVisualizacion();
            } catch (error) {
                console.error('❌ Error dibujando canvas:', error);
            }
        }
    }, [sectores, anguloActual]);

    const cargarDatosAdicionales = async () => {
        if (!regadorId) return;

        try {
            // 1. Obtener el último estado del regador
            console.log('📡 Cargando estado de regador:', regadorId);
            
            const estadoResponse = await fetch(`/api/regadores/${regadorId}/ultimo-estado`);
            
            console.log('📡 Response status:', estadoResponse.status);
            console.log('📡 Content-Type:', estadoResponse.headers.get('content-type'));
            
            if (estadoResponse.ok) {
                const contentType = estadoResponse.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    const estadoData = await estadoResponse.json();
                    
                    if (estadoData && !estadoData.error) {
                        console.log('✅ Estado cargado:', estadoData);
                        setEstadoActual(estadoData);
                        setAnguloActual(estadoData.angulo_actual);
                    } else {
                        console.warn('⚠️ Estado con error:', estadoData);
                    }
                } else {
                    console.warn('⚠️ Response no es JSON, es:', contentType);
                    const text = await estadoResponse.text();
                    console.warn('⚠️ Response text:', text.substring(0, 200));
                }
            } else {
                console.warn('⚠️ Estado response no OK:', estadoResponse.status);
            }

            // 2. Obtener la vuelta actual si existe
            try {
                const vueltaResponse = await fetch(`/api/regadores/${regadorId}/vuelta-actual`);
                
                if (vueltaResponse.ok) {
                    const contentType = vueltaResponse.headers.get('content-type');
                    
                    if (contentType && contentType.includes('application/json')) {
                        const vueltaData = await vueltaResponse.json();
                        
                        if (vueltaData.success && vueltaData.data) {
                            setVueltaActual(vueltaData.data.vuelta);
                        } else {
                            setVueltaActual(null);
                        }
                    }
                }
            } catch (error) {
                console.log('ℹ️ No hay vuelta actual disponible (OK)');
            }
        } catch (error) {
            console.error('❌ Error cargando datos adicionales:', error);
            // No hacer nada, el componente seguirá mostrando los sectores
        }
    };

    const getMaxRadioExterno = () => {
        if (sectores.length === 0) return 100;
        const max = Math.max(...sectores.map(s => s.radio_externo || 100));
        return max > 0 ? max : 100;
    };

    const dibujarVisualizacion = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
            console.warn('⚠️ Canvas ref no disponible');
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn('⚠️ No se pudo obtener contexto 2D');
            return;
        }

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const maxRadius = Math.min(centerX, centerY) - 20;

        // Limpiar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Dibujar círculo de fondo
        ctx.beginPath();
        ctx.arc(centerX, centerY, maxRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#f5f5f5';
        ctx.fill();
        ctx.strokeStyle = '#ddd';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Dibujar sectores
        sectores.forEach((sector, index) => {
            try {
                const radioInterno = ((sector.radio_interno || 0) / getMaxRadioExterno()) * maxRadius;
                const radioExterno = ((sector.radio_externo || 100) / getMaxRadioExterno()) * maxRadius;
                
                // Convertir ángulos a radianes
                const startAngle = (((sector.angulo_inicio || 0) - 90) * Math.PI) / 180;
                const endAngle = (((sector.angulo_fin || 0) - 90) * Math.PI) / 180;

                // Determinar color según estado
                let color = sector.color_display || '#cccccc';
                
                if (sector.estado === 'completado') {
                    color = '#4CAF50';
                } else if (sector.estado === 'en_progreso') {
                    color = '#FFC107';
                } else if (sector.estado === 'pendiente') {
                    color = '#E0E0E0';
                }

                // Dibujar sector
                ctx.beginPath();
                ctx.arc(centerX, centerY, radioExterno, startAngle, endAngle);
                ctx.arc(centerX, centerY, radioInterno, endAngle, startAngle, true);
                ctx.closePath();
                ctx.fillStyle = color;
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Dibujar número de sector
                const midAngle = (startAngle + endAngle) / 2;
                const textRadius = (radioInterno + radioExterno) / 2;
                const textX = centerX + textRadius * Math.cos(midAngle);
                const textY = centerY + textRadius * Math.sin(midAngle);

                ctx.fillStyle = '#000000';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(sector.numero_sector || (index + 1), textX, textY);
            } catch (error) {
                console.error('❌ Error dibujando sector', index, ':', error);
            }
        });

        // Dibujar indicador de posición actual si existe
        if (anguloActual !== null && anguloActual !== undefined) {
            try {
                const anguloRad = ((anguloActual - 90) * Math.PI) / 180;
                const indicadorX = centerX + maxRadius * Math.cos(anguloRad);
                const indicadorY = centerY + maxRadius * Math.sin(anguloRad);

                // Línea desde el centro
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(indicadorX, indicadorY);
                ctx.strokeStyle = '#FF0000';
                ctx.lineWidth = 3;
                ctx.stroke();

                // Círculo en el extremo
                ctx.beginPath();
                ctx.arc(indicadorX, indicadorY, 8, 0, 2 * Math.PI);
                ctx.fillStyle = '#FF0000';
                ctx.fill();
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.stroke();
            } catch (error) {
                console.error('❌ Error dibujando indicador:', error);
            }
        }

        // Dibujar centro (pivote)
        ctx.beginPath();
        ctx.arc(centerX, centerY, 10, 0, 2 * Math.PI);
        ctx.fillStyle = '#333333';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        console.log('✅ Canvas dibujado correctamente');
    };

    if (loading && sectores.length === 0) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height={size} sx={{ bgcolor: '#f5f5f5', borderRadius: 2 }}>
                <Typography>Cargando visualización...</Typography>
            </Box>
        );
    }

    if (sectores.length === 0) {
        return (
            <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height={size} sx={{ bgcolor: '#f5f5f5', borderRadius: 2, p: 3 }}>
                <Typography color="textSecondary" variant="h6" gutterBottom>
                    No hay sectores configurados
                </Typography>
                <Typography color="textSecondary" variant="body2">
                    Configure sectores para este regador para ver la visualización
                </Typography>
            </Box>
        );
    }

    const getEstadoChip = () => {
        if (!estadoActual) return null;

        let color = 'default';
        let icon = <Schedule />;
        let label = 'Desconocido';

        switch (estadoActual.estado_texto) {
            case 'Regando':
                color = 'success';
                icon = <PlayArrow />;
                label = 'Regando';
                break;
            case 'Detenido':
                color = 'error';
                icon = <Stop />;
                label = 'Detenido';
                break;
            case 'Pausado':
                color = 'warning';
                icon = <Pause />;
                label = 'Pausado';
                break;
            default:
                break;
        }

        return <Chip icon={icon} label={label} color={color} size="small" />;
    };

    return (
        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Información del estado */}
            <Box sx={{ mb: 2, width: '100%' }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={6}>
                        <Box display="flex" gap={1} alignItems="center" flexWrap="wrap">
                            {getEstadoChip()}
                            {anguloActual !== null && anguloActual !== undefined && (
                                <Chip 
                                    label={`Ángulo: ${anguloActual.toFixed(1)}°`} 
                                    variant="outlined" 
                                    size="small" 
                                />
                            )}
                            <Chip 
                                label={`${sectores.length} sectores`} 
                                variant="outlined" 
                                size="small" 
                            />
                        </Box>
                    </Grid>
                    {vueltaActual && (
                        <Grid item xs={12} md={6}>
                            <Card variant="outlined" sx={{ p: 1 }}>
                                <Typography variant="caption" color="textSecondary">
                                    Vuelta {vueltaActual.numero_vuelta}
                                </Typography>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={parseFloat(vueltaActual.porcentaje_completado || 0)} 
                                    sx={{ mt: 0.5, mb: 0.5 }}
                                />
                                <Typography variant="caption">
                                    {parseFloat(vueltaActual.porcentaje_completado || 0).toFixed(1)}% completado
                                </Typography>
                            </Card>
                        </Grid>
                    )}
                </Grid>
            </Box>

            {/* Canvas de visualización */}
            <canvas
                ref={canvasRef}
                width={size}
                height={size}
                style={{
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    maxWidth: '100%',
                    height: 'auto',
                    display: 'block'
                }}
            />

            {/* Leyenda */}
            <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Box display="flex" alignItems="center" gap={0.5}>
                    <Box sx={{ width: 16, height: 16, bgcolor: '#4CAF50', borderRadius: 1, border: '1px solid #ddd' }} />
                    <Typography variant="caption">Completado</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={0.5}>
                    <Box sx={{ width: 16, height: 16, bgcolor: '#FFC107', borderRadius: 1, border: '1px solid #ddd' }} />
                    <Typography variant="caption">En Progreso</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={0.5}>
                    <Box sx={{ width: 16, height: 16, bgcolor: '#E0E0E0', borderRadius: 1, border: '1px solid #ddd' }} />
                    <Typography variant="caption">Pendiente</Typography>
                </Box>
                {anguloActual !== null && (
                    <Box display="flex" alignItems="center" gap={0.5}>
                        <Box sx={{ width: 16, height: 16, bgcolor: '#FF0000', borderRadius: 1, border: '1px solid #ddd' }} />
                        <Typography variant="caption">Posición Actual</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

export default CircularRiegoVisualization;