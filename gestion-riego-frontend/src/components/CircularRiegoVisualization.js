import React, { useState, useEffect } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { CheckCircle, Schedule, PlayArrow, Pause, Stop } from '@mui/icons-material';

/**
 * Componente de visualización circular del riego con sectores
 * VERSIÓN CON SVG - Mantiene el diseño original
 */
function CircularRiegoVisualization({ sectores: sectoresProp, regador, size = 600 }) {
    const [sectores, setSectores] = useState([]);
    const [estadoActual, setEstadoActual] = useState(null);
    const [sectorActual, setSectorActual] = useState(null);
    const [vueltaActual, setVueltaActual] = useState(null);
    const [loading, setLoading] = useState(true);

    const regadorId = regador?.regador_id || regador?.id;

    // Actualizar sectores cuando cambian las props
    useEffect(() => {
        if (sectoresProp && Array.isArray(sectoresProp)) {
            console.log('✅ Sectores recibidos:', sectoresProp.length);
            setSectores(sectoresProp);
            setLoading(false);
        } else {
            setLoading(false);
        }
    }, [sectoresProp]);

    // Cargar datos adicionales
    useEffect(() => {
        if (!regadorId) return;

        cargarDatosAdicionales();
        const interval = setInterval(cargarDatosAdicionales, 10000);
        return () => clearInterval(interval);
    }, [regadorId]);

    const cargarDatosAdicionales = async () => {
        if (!regadorId) return;

        try {
            // Estado del regador
            const estadoResponse = await fetch(`/api/regadores/${regadorId}/ultimo-estado`);
            
            if (estadoResponse.ok) {
                const contentType = estadoResponse.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    const estadoData = await estadoResponse.json();
                    
                    if (estadoData && !estadoData.error) {
                        setEstadoActual(estadoData);
                    }
                }
            }

            // Posición actual
            try {
                const posResponse = await fetch(`/api/gps/regadores/${regadorId}/posicion-actual`);
                if (posResponse.ok) {
                    const posData = await posResponse.json();
                    if (posData.success && posData.data) {
                        setSectorActual(posData.data.nombre_sector);
                    }
                }
            } catch (error) {
                // Posición actual es opcional
            }

            // Vuelta actual
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
                // Vuelta actual es opcional
            }
        } catch (error) {
            console.error('❌ Error cargando datos adicionales:', error);
        }
    };

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

    const getSectorColor = (sector) => {
        // Sector activo actual (donde está el regador ahora)
        if (sectorActual && sectorActual === sector.nombre_sector) {
            return '#4CAF50'; // Verde brillante
        } 
        // Sector completado
        else if (sector.estado === 'completado') {
            return sector.color_display || '#81C784'; // Verde más claro
        } 
        // Sector en progreso
        else if (sector.estado === 'en_progreso') {
            return '#FFA726'; // Naranja
        } 
        // Sector pendiente
        else {
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

    if (loading && sectores.length === 0) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height={size}>
                <Typography>Cargando visualización...</Typography>
            </Box>
        );
    }

    if (sectores.length === 0) {
        return (
            <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height={size}>
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
        <Box sx={{ width: '100%' }}>
            {/* Indicador del sector actual */}
            {sectorActual && (
                <Box mb={2} p={2} bgcolor="primary.light" borderRadius={2}>
                    <Typography variant="h6" color="white" textAlign="center">
                        🎯 Regando actualmente: {sectorActual}
                    </Typography>
                </Box>
            )}

            {/* Estado del regador */}
            {estadoActual && (
                <Box mb={2} display="flex" justifyContent="center">
                    {getEstadoChip()}
                </Box>
            )}

            {/* SVG de visualización circular */}
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
                    {sectores.map((sector, index) => {
                        const startAngle = parseFloat(sector.angulo_inicio) || 0;
                        const endAngle = parseFloat(sector.angulo_fin) || 0;
                        
                        if (startAngle === endAngle || startAngle < 0 || endAngle < 0 || startAngle >= 360 || endAngle > 360) {
                            return null;
                        }
                        
                        const sectorPath = createSectorPath(centerX, centerY, radius, startAngle, endAngle);
                        const textPos = getTextPosition(startAngle, endAngle);

                        return (
                            <g key={sector.id || index}>
                                <path
                                    d={sectorPath}
                                    fill={getSectorColor(sector)}
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
                                    {sector.numero_sector}
                                </text>

                                {/* Icono si está completado */}
                                {sector.estado === 'completado' && (
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
            <Box display="flex" justifyContent="center" gap={3} flexWrap="wrap">
                <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 20, height: 20, bgcolor: '#4CAF50', borderRadius: 1 }} />
                    <Typography variant="body2">Activo / Completado</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 20, height: 20, bgcolor: '#FFA726', borderRadius: 1 }} />
                    <Typography variant="body2">En Progreso</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 20, height: 20, bgcolor: '#E0E0E0', borderRadius: 1 }} />
                    <Typography variant="body2">Pendiente</Typography>
                </Box>
            </Box>
        </Box>
    );
}

export default CircularRiegoVisualization;