import React, { useRef, useEffect, useState } from 'react';
import { Box, Typography, Tooltip, Card, CardContent, Grid, Chip, Alert } from '@mui/material';
import { CheckCircle, Schedule, PlayArrow, Pause, MyLocation, WaterDrop } from '@mui/icons-material';
import axios from '../axiosConfig';

// Componente de visualización circular SVG
function CircularRiegoVisualization({ sectores, regador, size = 500 }) {
    const [hoveredSector, setHoveredSector] = useState(null);
    const [sectorActual, setSectorActual] = useState(null);
    const [vueltaActual, setVueltaActual] = useState(null);
    const [estadoActual, setEstadoActual] = useState(null);
    const [loading, setLoading] = useState(true);
    
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = (size / 2) - 60; // Más margen para los indicadores

    useEffect(() => {
        const cargarEstadoActual = async () => {
            try {
                // Posición actual
                const responsePosicion = await axios.get(`/gps/regadores/${regador.regador_id}/posicion-actual`);
                if (responsePosicion.data.success) {
                    setSectorActual(responsePosicion.data.data.nombre_sector);
                    setEstadoActual(responsePosicion.data.data);
                }
                
                // Vuelta actual
                const responseVuelta = await axios.get(`/regadores/${regador.regador_id}/vuelta-actual`);
                if (responseVuelta.data.success && responseVuelta.data.data) {
                    setVueltaActual(responseVuelta.data.data.vuelta);
                }
            } catch (error) {
                console.error('Error cargando estado actual:', error);
            } finally {
                setLoading(false);
            }
        };

        if (regador && regador.regador_id) {
            cargarEstadoActual();
            const interval = setInterval(cargarEstadoActual, 10000); // cada 10 seg
            return () => clearInterval(interval);
        }
    }, [regador?.regador_id]);

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
        // ⭐ Si es el sector actual y está regando, verde brillante
        if (sectorActual === sector.nombre_sector && estadoActual?.regando) {
            return '#4CAF50'; // Verde brillante para sector activo
        }
        
        // Si es el sector actual pero no está regando, amarillo
        if (sectorActual === sector.nombre_sector && !estadoActual?.regando) {
            return '#FFC107'; // Amarillo para sector actual sin riego
        }
        
        const baseColor = sector.color_display || '#e0e0e0';
        const estado = sector.estado || 'pendiente';

        switch (estado) {
            case 'completado':
                return baseColor;
            case 'en_progreso':
                return `${baseColor}BB`; // Más opaco que antes
            case 'pausado':
                return '#FF9800';
            default:
                return '#f5f5f5';
        }
    };

    // Función para obtener texto del estado
    const getEstadoTexto = (sector) => {
        if (sectorActual === sector.nombre_sector && estadoActual?.regando) {
            return '🚿 REGANDO AHORA';
        }
        if (sectorActual === sector.nombre_sector) {
            return '📍 POSICIÓN ACTUAL';
        }
        
        switch (sector.estado) {
            case 'completado': return '✅ Completado';
            case 'en_progreso': return '⏳ En Progreso';
            case 'pausado': return '⏸️ Pausado';
            default: return '⏱️ Pendiente';
        }
    };

    // Función para calcular posición del texto
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

    // Encontrar el sector actual en el array
    const sectorActualObj = sectores.find(s => s.nombre_sector === sectorActual);

    return (
        <Card>
            <CardContent>
                {/* Header con información del regador y sector actual */}
                <Box mb={3}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                        <Typography variant="h6" fontWeight="bold">
                            {regador.nombre_dispositivo}
                        </Typography>
                        <Chip 
                            label={regador.regador_activo ? 'Activo' : 'Inactivo'}
                            color={regador.regador_activo ? 'success' : 'default'}
                            size="small"
                        />
                    </Box>

                    {/* ⭐ INDICADOR PROMINENTE DEL SECTOR ACTUAL */}
                    {sectorActual && estadoActual ? (
                        <Alert 
                            severity={estadoActual.regando ? "success" : "info"}
                            icon={estadoActual.regando ? <WaterDrop /> : <MyLocation />}
                            sx={{ mb: 2 }}
                        >
                            <Box>
                                <Typography variant="subtitle1" fontWeight="bold">
                                    {estadoActual.regando ? '💧 REGANDO EN:' : '📍 UBICADO EN:'}
                                </Typography>
                                <Typography variant="h5" component="div" sx={{ my: 1 }}>
                                    {sectorActual} {sectorActualObj?.nombre_lote && `- ${sectorActualObj.nombre_lote}`}
                                </Typography>
                                <Grid container spacing={1}>
                                    <Grid item xs={4}>
                                        <Typography variant="caption" color="textSecondary">
                                            Presión
                                        </Typography>
                                        <Typography variant="body2" fontWeight="bold">
                                            {estadoActual.presion ? `${estadoActual.presion.toFixed(1)} PSI` : 'N/A'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={4}>
                                        <Typography variant="caption" color="textSecondary">
                                            Velocidad
                                        </Typography>
                                        <Typography variant="body2" fontWeight="bold">
                                            {estadoActual.velocidad ? `${estadoActual.velocidad.toFixed(1)} km/h` : 'N/A'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={4}>
                                        <Typography variant="caption" color="textSecondary">
                                            Ángulo
                                        </Typography>
                                        <Typography variant="body2" fontWeight="bold">
                                            {estadoActual.angulo_actual ? `${estadoActual.angulo_actual.toFixed(0)}°` : 'N/A'}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Alert>
                    ) : (
                        !loading && (
                            <Alert severity="warning" icon={<Schedule />}>
                                <Typography variant="body2">
                                    Sin datos GPS recientes. El dispositivo puede estar apagado o sin señal.
                                </Typography>
                            </Alert>
                        )
                    )}

                    {/* Indicador de vuelta actual */}
                    {vueltaActual && (
                        <Box display="flex" alignItems="center" gap={1} p={1.5} bgcolor="primary.light" borderRadius={1}>
                            <PlayArrow sx={{ color: 'white' }} />
                            <Box flexGrow={1}>
                                <Typography variant="body2" color="white" fontWeight="bold">
                                    Vuelta {vueltaActual.numero_vuelta} en progreso
                                </Typography>
                                <Typography variant="caption" color="white">
                                    {vueltaActual.porcentaje_completado ? 
                                        `${parseFloat(vueltaActual.porcentaje_completado).toFixed(1)}% completado` : 
                                        'Iniciando...'}
                                </Typography>
                            </Box>
                        </Box>
                    )}
                </Box>

                {/* Visualización circular */}
                <Box display="flex" justifyContent="center" mb={2}>
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
                            
                            if (startAngle === endAngle || startAngle < 0 || endAngle < 0 || startAngle >= 360 || endAngle > 360) {
                                return null;
                            }
                            
                            const sectorPath = createSectorPath(centerX, centerY, radius, startAngle, endAngle);
                            const textPos = getTextPosition(startAngle, endAngle);
                            const isHovered = hoveredSector === index;
                            const isActive = sectorActual === sector.nombre_sector;

                            return (
                                <g key={sector.id || index}>
                                    {/* Sector principal */}
                                    <path
                                        d={sectorPath}
                                        fill={getSectorColor(sector)}
                                        stroke={isActive ? "#FF5722" : "#ffffff"}
                                        strokeWidth={isActive ? "4" : "2"}
                                        style={{
                                            cursor: 'pointer',
                                            transition: 'all 0.3s ease',
                                            transform: isHovered || isActive ? 'scale(1.05)' : 'scale(1)',
                                            transformOrigin: `${centerX}px ${centerY}px`,
                                            filter: isActive ? 'brightness(1.2) drop-shadow(0 0 10px rgba(255,87,34,0.5))' : 
                                                    isHovered ? 'brightness(1.1)' : 'none'
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
                                        fontSize={isActive ? "16" : "12"}
                                        fill={isActive ? "#FF5722" : "#333"}
                                        fontWeight={isActive ? "bold" : "normal"}
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {sector.numero_sector}
                                    </text>

                                    {/* Icono especial para sector activo */}
                                    {isActive && estadoActual?.regando && (
                                        <g>
                                            <circle
                                                cx={textPos.x}
                                                cy={textPos.y - 20}
                                                r="12"
                                                fill="#4CAF50"
                                                stroke="white"
                                                strokeWidth="2"
                                            />
                                            <text
                                                x={textPos.x}
                                                y={textPos.y - 17}
                                                textAnchor="middle"
                                                fontSize="14"
                                                fill="white"
                                            >
                                                💧
                                            </text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}

                        {/* Centro del círculo con número de vuelta */}
                        <circle
                            cx={centerX}
                            cy={centerY}
                            r="50"
                            fill="#ffffff"
                            stroke="#2196F3"
                            strokeWidth="3"
                        />
                        <text
                            x={centerX}
                            y={centerY - 15}
                            textAnchor="middle"
                            fontSize="14"
                            fill="#666"
                            fontWeight="bold"
                        >
                            Vuelta
                        </text>
                        <text
                            x={centerX}
                            y={centerY + 10}
                            textAnchor="middle"
                            fontSize="28"
                            fill="#2196F3"
                            fontWeight="bold"
                        >
                            {vueltaActual ? vueltaActual.numero_vuelta : '-'}
                        </text>
                        <text
                            x={centerX}
                            y={centerY + 30}
                            textAnchor="middle"
                            fontSize="10"
                            fill="#999"
                        >
                            {vueltaActual && vueltaActual.porcentaje_completado ? 
                                `${parseFloat(vueltaActual.porcentaje_completado).toFixed(0)}%` : 
                                ''}
                        </text>
                    </svg>
                </Box>

                {/* Leyenda de sectores */}
                <Box sx={{ maxHeight: 250, overflow: 'auto' }}>
                    <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                        Sectores ({sectores.length})
                    </Typography>
                    <Grid container spacing={1}>
                        {sectores.map((sector, index) => {
                            const isActive = sectorActual === sector.nombre_sector;
                            return (
                                <Grid item xs={12} sm={6} key={sector.id || index}>
                                    <Box
                                        display="flex"
                                        alignItems="center"
                                        gap={1}
                                        p={1}
                                        sx={{
                                            backgroundColor: isActive ? 'rgba(255, 87, 34, 0.1)' : 
                                                           hoveredSector === index ? 'rgba(0,0,0,0.05)' : 
                                                           'transparent',
                                            borderRadius: 1,
                                            border: isActive ? '2px solid #FF5722' : 'none',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={() => setHoveredSector(index)}
                                        onMouseLeave={() => setHoveredSector(null)}
                                    >
                                        <Box
                                            sx={{
                                                width: 20,
                                                height: 20,
                                                backgroundColor: getSectorColor(sector),
                                                borderRadius: '50%',
                                                border: '2px solid #ddd',
                                                flexShrink: 0
                                            }}
                                        />
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <Box display="flex" alignItems="center" gap={0.5}>
                                                <Typography variant="body2" noWrap fontWeight={isActive ? 'bold' : 'normal'}>
                                                    {sector.nombre_sector}
                                                </Typography>
                                                {isActive && estadoActual?.regando && (
                                                    <WaterDrop sx={{ fontSize: 14, color: '#4CAF50' }} />
                                                )}
                                            </Box>
                                            <Typography variant="caption" color="textSecondary" noWrap>
                                                {getEstadoTexto(sector)}
                                            </Typography>
                                        </Box>
                                        {sector.progreso_porcentaje > 0 && (
                                            <Typography variant="caption" fontWeight="bold">
                                                {Math.round(sector.progreso_porcentaje)}%
                                            </Typography>
                                        )}
                                    </Box>
                                </Grid>
                            );
                        })}
                    </Grid>
                </Box>

                {/* Estadísticas generales */}
                <Box display="flex" justifyContent="center" gap={1} mt={2} flexWrap="wrap">
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
                        label={`${sectores.filter(s => !s.estado || s.estado === 'pendiente').length} Pendientes`}
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