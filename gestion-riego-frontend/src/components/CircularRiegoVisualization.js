import React, { useRef, useEffect, useState } from 'react';
import { Box, Typography, Tooltip, Card, CardContent, Grid, Chip } from '@mui/material';
import { CheckCircle, Schedule, PlayArrow, Pause } from '@mui/icons-material';

// Componente de visualización circular SVG
function CircularRiegoVisualization({ sectores, regador, size = 300 }) {
    const [hoveredSector, setHoveredSector] = useState(null);
    const [sectorActual, setSectorActual] = useState(null); // ⭐ NUEVO
    const [vueltaActual, setVueltaActual] = useState(null); // ⭐ NUEVO
    
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = (size / 2) - 40; // Dejar margen

    // Función para convertir ángulo a coordenadas
    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    };

    // Función para crear el path del sector
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

    // Función para obtener color según estado
    const getSectorColor = (sector) => {
        const baseColor = sector.color_display || '#e0e0e0';
        const estado = sector.estado || 'pendiente';
        const progreso = sector.progreso_porcentaje || 0;

        if (sectorActual === sector.nombre_sector) {
            return '#4CAF50'; // Verde brillante
        }
        switch (estado) {
            case 'completado':
                return baseColor; // Color completo
            case 'en_progreso':
                // Gradiente o color intermedio
                return `${baseColor}88`; // Agregar transparencia
            case 'pausado':
                return '#ffcc02';
            default: // pendiente
                return '#f5f5f5';
        }
    };

    // Función para obtener texto del estado
    const getEstadoTexto = (sector) => {
        switch (sector.estado) {
            case 'completado': return 'Completado';
            case 'en_progreso': return 'En Progreso';
            case 'pausado': return 'Pausado';
            default: return 'Pendiente';
        }
    };

    useEffect(() => {
        const cargarEstadoActual = async () => {
            try {
                // Posición actual
                const responsePosicion = await axios.get(`/gps/${regador.id}/posicion-actual`);
                if (responsePosicion.data.success) {
                    setSectorActual(responsePosicion.data.data.nombre_sector);
                }
                
                // Vuelta actual
                const responseVuelta = await axios.get(`/regadores/${regador.id}/vuelta-actual`);
                if (responseVuelta.data.success && responseVuelta.data.data) {
                    setVueltaActual(responseVuelta.data.data.vuelta);
                }
            } catch (error) {
                console.error('Error cargando estado actual:', error);
            }
        };

        cargarEstadoActual();
        const interval = setInterval(cargarEstadoActual, 10000); // cada 10 seg
        return () => clearInterval(interval);
    }, [regador.id]);

    // Función para calcular posición del texto
    const getTextPosition = (startAngle, endAngle) => {
        let midAngle = (startAngle + endAngle) / 2;
        
        // Manejar el caso donde el sector cruza 0° (ej: 350° a 10°)
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
        <Card>
            <CardContent>
                <Typography variant="h6" gutterBottom align="center">
                    {regador.nombre_dispositivo}
                </Typography>
                
                <Box display="flex" justifyContent="center" mb={2}>
                    {sectorActual && (
                        <Box mb={2} p={2} bgcolor="primary.light" borderRadius={2}>
                            <Typography variant="h6" color="white" textAlign="center">
                                🎯 Regando: {sectorActual}
                            </Typography>
                        </Box>
                    )}
                    <svg width={size} height={size} style={{ overflow: 'visible' }}>
                        {/* Círculo de fondo */}
                        <circle
                            cx={centerX}
                            cy={centerY}
                            r={radius}
                            fill="none"
                            stroke="#e0e0e0"
                            strokeWidth="2"
                        />

                        {/* Sectores */}
                        {sectores.map((sector, index) => {
                            const startAngle = parseFloat(sector.angulo_inicio) || 0;
                            const endAngle = parseFloat(sector.angulo_fin) || 0;
                            
                            // Validar ángulos
                            if (startAngle === endAngle || startAngle < 0 || endAngle < 0 || startAngle >= 360 || endAngle > 360) {
                                return null;
                            }
                            
                            const sectorPath = createSectorPath(centerX, centerY, radius, startAngle, endAngle);
                            const textPos = getTextPosition(startAngle, endAngle);
                            const isHovered = hoveredSector === index;

                            return (
                                <g key={sector.id || index}>
                                    {/* Sector principal */}
                                    <path
                                        d={sectorPath}
                                        fill={getSectorColor(sector)}
                                        stroke="#ffffff"
                                        strokeWidth="2"
                                        style={{
                                            cursor: 'pointer',
                                            transition: 'all 0.3s ease',
                                            transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                                            transformOrigin: `${centerX}px ${centerY}px`,
                                            filter: isHovered ? 'brightness(1.1)' : 'none'
                                        }}
                                        onMouseEnter={() => setHoveredSector(index)}
                                        onMouseLeave={() => setHoveredSector(null)}
                                    />

                                    {/* Barra de progreso para sectores en progreso */}
                                    {sector.estado === 'en_progreso' && sector.progreso_porcentaje > 0 && (
                                        <path
                                            d={createSectorPath(
                                                centerX, 
                                                centerY, 
                                                radius, 
                                                startAngle, 
                                                startAngle + ((endAngle - startAngle) * (sector.progreso_porcentaje / 100))
                                            )}
                                            fill={sector.color_display}
                                            stroke="#ffffff"
                                            strokeWidth="2"
                                        />
                                    )}

                                    {/* Número del sector */}
                                    <text
                                        x={textPos.x}
                                        y={textPos.y}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontSize="12"
                                        fill="#333"
                                        fontWeight="bold"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {sector.numero_sector}
                                    </text>

                                    {/* Icono de estado en el borde */}
                                    {sector.estado === 'completado' && (
                                        <circle
                                            cx={textPos.x + 15}
                                            cy={textPos.y - 15}
                                            r="8"
                                            fill="#4CAF50"
                                        />
                                    )}
                                </g>
                            );
                        })}

                        {/* Centro del círculo con información general */}
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
                            fontSize="24"
                            fill="#2196F3"
                            fontWeight="bold"
                        >
                            {vueltaActual ? vueltaActual.numero_vuelta : '-'}
                        </text>
                    </svg>
                </Box>

                {/* Leyenda de sectores */}
                <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                    <Grid container spacing={1}>
                        {sectores.map((sector, index) => (
                            <Grid item xs={12} sm={6} key={sector.id || index}>
                                <Box
                                    display="flex"
                                    alignItems="center"
                                    gap={1}
                                    p={1}
                                    sx={{
                                        backgroundColor: hoveredSector === index ? 'rgba(0,0,0,0.05)' : 'transparent',
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseEnter={() => setHoveredSector(index)}
                                    onMouseLeave={() => setHoveredSector(null)}
                                >
                                    <Box
                                        sx={{
                                            width: 16,
                                            height: 16,
                                            backgroundColor: getSectorColor(sector),
                                            borderRadius: '50%',
                                            border: '1px solid #ddd'
                                        }}
                                    />
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Typography variant="caption" noWrap>
                                            {sector.nombre_sector}
                                        </Typography>
                                        <Box display="flex" alignItems="center" gap={0.5}>
                                            {sector.estado === 'completado' && <CheckCircle sx={{ fontSize: 12, color: '#4CAF50' }} />}
                                            {sector.estado === 'en_progreso' && <PlayArrow sx={{ fontSize: 12, color: '#2196F3' }} />}
                                            {sector.estado === 'pausado' && <Pause sx={{ fontSize: 12, color: '#FF9800' }} />}
                                            {sector.estado === 'pendiente' && <Schedule sx={{ fontSize: 12, color: '#757575' }} />}
                                            <Typography variant="caption" color="textSecondary">
                                                {getEstadoTexto(sector)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    {sector.progreso_porcentaje > 0 && (
                                        <Typography variant="caption" fontWeight="bold">
                                            {Math.round(sector.progreso_porcentaje)}%
                                        </Typography>
                                    )}
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                </Box>

                {/* Estadísticas generales */}
                <Box display="flex" justifyContent="center" gap={1} mt={2}>
                    <Chip 
                        icon={<CheckCircle />}
                        label={`${sectores.filter(s => s.estado === 'completado').length} Completados`}
                        size="small"
                        color="success"
                        variant="outlined"
                    />
                    <Chip 
                        icon={<PlayArrow />}
                        label={`${sectores.filter(s => s.estado === 'en_progreso').length} En Progreso`}
                        size="small"
                        color="primary"
                        variant="outlined"
                    />
                    <Chip 
                        icon={<Schedule />}
                        label={`${sectores.filter(s => s.estado === 'pendiente').length} Pendientes`}
                        size="small"
                        color="default"
                        variant="outlined"
                    />
                </Box>
            </CardContent>
        </Card>
    );
}

export default CircularRiegoVisualization;