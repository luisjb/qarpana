import React, { useState, useEffect } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { CheckCircle, Schedule, PlayArrow, Pause, Stop, MyLocation } from '@mui/icons-material';
import axios from '../axiosConfig';

/**
 * Componente de visualización circular del riego con sectores
 * VERSIÓN CON SVG - Con indicador de posición del regador
 */
function CircularRiegoVisualization({ sectores: sectoresProp, regador, estadoActualProp, size = 600 }) {
    const [sectores, setSectores] = useState([]);
    const [estadoActual, setEstadoActual] = useState(estadoActualProp || null);
    const [sectorActual, setSectorActual] = useState(null);
    const [anguloActual, setAnguloActual] = useState(null);
    const [vueltaActual, setVueltaActual] = useState(null);
    const [loading, setLoading] = useState(true);

    const regadorId = regador?.regador_id || regador?.id;

    console.log('🔍 CircularRiegoVisualization props:', {
        regadorId,
        sectores: sectoresProp?.length,
        estadoActualProp,
        regador
    });

    // Actualizar cuando cambia estadoActualProp
    useEffect(() => {
        if (estadoActualProp) {
            console.log('📍 Estado actual recibido desde props:', estadoActualProp);
            setEstadoActual(estadoActualProp);
            
            if (estadoActualProp.angulo_actual !== null && estadoActualProp.angulo_actual !== undefined) {
                const angulo = parseFloat(estadoActualProp.angulo_actual);
                setAnguloActual(angulo);
                console.log('✅ Ángulo desde props:', angulo);
            }
            
            if (estadoActualProp.nombre_sector) {
                setSectorActual(estadoActualProp.nombre_sector);
            }
        }
    }, [estadoActualProp]);

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
        if (!regadorId) {
            console.warn('⚠️ No hay regadorId disponible');
            return;
        }

        cargarDatosAdicionales();
        const interval = setInterval(cargarDatosAdicionales, 10000);
        return () => clearInterval(interval);
    }, [regadorId]);

    const cargarDatosAdicionales = async () => {
        if (!regadorId) return;

        console.log('🔄 Cargando datos adicionales para regador:', regadorId);

        try {
            // Intentar obtener posición actual desde /gps/regadores/:id/posicion-actual
            try {
                console.log('📡 Llamando a /gps/regadores/${regadorId}/posicion-actual');
                const posResponse = await axios.get(`/gps/regadores/${regadorId}/posicion-actual`);
                
                console.log('📡 Respuesta posicion-actual:', posResponse.data);
                
                if (posResponse.data.success && posResponse.data.data) {
                    const data = posResponse.data.data;
                    
                    setSectorActual(data.nombre_sector);
                    
                    // Intentar obtener ángulo de diferentes campos posibles
                    let angulo = null;
                    
                    if (data.angulo_actual !== null && data.angulo_actual !== undefined) {
                        angulo = parseFloat(data.angulo_actual);
                    } else if (data.angulo !== null && data.angulo !== undefined) {
                        angulo = parseFloat(data.angulo);
                    } else if (data.curso !== null && data.curso !== undefined) {
                        angulo = parseFloat(data.curso);
                    }
                    
                    if (angulo !== null && !isNaN(angulo)) {
                        setAnguloActual(angulo);
                        console.log('✅ Ángulo obtenido de posicion-actual:', angulo);
                    } else {
                        console.warn('⚠️ No hay ángulo en posicion-actual:', data);
                    }
                    
                    // Actualizar estado si no viene de props
                    if (!estadoActualProp) {
                        setEstadoActual(data);
                    }
                }
            } catch (error) {
                console.log('ℹ️ No hay posición actual disponible:', error.message);
            }

            // Intentar obtener desde ultimo-estado si no tenemos ángulo
            if (anguloActual === null) {
                try {
                    console.log('📡 Intentando ultimo-estado');
                    const estadoResponse = await axios.get(`/regadores/${regadorId}/ultimo-estado`);
                    
                    console.log('📡 Respuesta ultimo-estado:', estadoResponse.data);
                    
                    if (estadoResponse.data && !estadoResponse.data.error) {
                        if (estadoResponse.data.angulo_actual !== null && estadoResponse.data.angulo_actual !== undefined) {
                            const angulo = parseFloat(estadoResponse.data.angulo_actual);
                            if (!isNaN(angulo)) {
                                setAnguloActual(angulo);
                                console.log('✅ Ángulo obtenido de ultimo-estado:', angulo);
                            }
                        }
                        
                        if (!estadoActualProp) {
                            setEstadoActual(estadoResponse.data);
                        }
                    }
                } catch (error) {
                    console.log('ℹ️ No hay ultimo-estado:', error.message);
                }
            }

            // Vuelta actual
            try {
                const vueltaResponse = await axios.get(`/regadores/${regadorId}/vuelta-actual`);
                
                if (vueltaResponse.data.success && vueltaResponse.data.data) {
                    setVueltaActual(vueltaResponse.data.data.vuelta);
                } else {
                    setVueltaActual(null);
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

        const estado = estadoActual.estado_texto || estadoActual.estado;

        switch (estado) {
            case 'Regando':
            case 'regando':
                color = 'success';
                icon = <PlayArrow />;
                label = 'Regando';
                break;
            case 'Detenido':
            case 'detenido':
                color = 'error';
                icon = <Stop />;
                label = 'Detenido';
                break;
            case 'Pausado':
            case 'pausado':
                color = 'warning';
                icon = <Pause />;
                label = 'Pausado';
                break;
            default:
                break;
        }

        return <Chip icon={icon} label={label} color={color} size="small" />;
    };

    // Calcular posición del indicador del regador
    const getIndicadorPosicion = () => {
        if (anguloActual === null || anguloActual === undefined) {
            console.log('⚠️ No hay ángulo actual para mostrar indicador. Ángulo:', anguloActual);
            return null;
        }

        console.log('✅ Dibujando indicador en ángulo:', anguloActual);
        const pos = polarToCartesian(centerX, centerY, radius, anguloActual);
        return pos;
    };

    const indicadorPos = getIndicadorPosicion();

    return (
        <Box sx={{ width: '100%' }}>
            {/* DEBUG INFO */}
            {process.env.NODE_ENV === 'development' && (
                <Box mb={1} p={1} bgcolor="yellow" borderRadius={1}>
                    <Typography variant="caption">
                        <strong>DEBUG:</strong> regadorId={regadorId}, 
                        anguloActual={anguloActual !== null ? parseFloat(anguloActual).toFixed(1) : 'null'}, 
                        sectorActual={sectorActual || 'null'}
                    </Typography>
                </Box>
            )}

            {/* Indicador del sector actual */}
            {sectorActual && (
                <Box mb={2} p={2} bgcolor="primary.light" borderRadius={2}>
                    <Typography variant="h6" color="white" textAlign="center">
                        Regando actualmente: {sectorActual}
                    </Typography>
                </Box>
            )}

            {/* Estado del regador y ángulo */}
            <Box mb={2} display="flex" justifyContent="center" gap={2} flexWrap="wrap">
                {estadoActual && getEstadoChip()}
                {anguloActual !== null && anguloActual !== undefined && (
                    <Chip 
                        icon={<MyLocation />} 
                        label={`Ángulo: ${parseFloat(anguloActual).toFixed(1)}°`} 
                        variant="outlined" 
                        size="small" 
                        color="primary"
                    />
                )}
            </Box>

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

                    {/* Indicador de posición del regador */}
                    {indicadorPos && (
                        <g>
                            {/* Línea desde el centro hasta la posición */}
                            <line
                                x1={centerX}
                                y1={centerY}
                                x2={indicadorPos.x}
                                y2={indicadorPos.y}
                                stroke="#FF5722"
                                strokeWidth="4"
                                strokeLinecap="round"
                            />

                            {/* Círculo pulsante en la posición del regador */}
                            <circle
                                cx={indicadorPos.x}
                                cy={indicadorPos.y}
                                r="12"
                                fill="#FF5722"
                                stroke="#ffffff"
                                strokeWidth="3"
                            >
                                {/* Animación de pulso */}
                                <animate
                                    attributeName="r"
                                    values="12;16;12"
                                    dur="2s"
                                    repeatCount="indefinite"
                                />
                                <animate
                                    attributeName="opacity"
                                    values="1;0.6;1"
                                    dur="2s"
                                    repeatCount="indefinite"
                                />
                            </circle>

                            {/* Círculo exterior para efecto de onda */}
                            <circle
                                cx={indicadorPos.x}
                                cy={indicadorPos.y}
                                r="12"
                                fill="none"
                                stroke="#FF5722"
                                strokeWidth="2"
                                opacity="0"
                            >
                                <animate
                                    attributeName="r"
                                    values="12;24;36"
                                    dur="2s"
                                    repeatCount="indefinite"
                                />
                                <animate
                                    attributeName="opacity"
                                    values="0.8;0.4;0"
                                    dur="2s"
                                    repeatCount="indefinite"
                                />
                            </circle>

                            {/* Icono del regador */}
                            <text
                                x={indicadorPos.x}
                                y={indicadorPos.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize="12"
                                fill="#ffffff"
                                fontWeight="bold"
                            >
                                📍
                            </text>
                        </g>
                    )}

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
                    <Typography variant="body2">Activo</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 20, height: 20, bgcolor: '#FFA726', borderRadius: 1 }} />
                    <Typography variant="body2">En Progreso</Typography>
                </Box>
                <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 20, height: 20, bgcolor: '#E0E0E0', borderRadius: 1 }} />
                    <Typography variant="body2">Pendiente</Typography>
                </Box>
                {indicadorPos && (
                    <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ 
                            width: 20, 
                            height: 20, 
                            bgcolor: '#FF5722', 
                            borderRadius: '50%',
                            border: '2px solid white',
                            boxShadow: '0 0 10px rgba(255, 87, 34, 0.5)'
                        }} />
                        <Typography variant="body2">Posición Actual</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

export default CircularRiegoVisualization;