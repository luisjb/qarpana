import React, { useState, useEffect } from 'react';
import { 
    Container, Grid, Typography, Paper, FormControl, InputLabel, 
    Select, MenuItem, CircularProgress, useTheme, Box, Card, CardContent,
    CardActionArea, Divider, Button
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from '../axiosConfig';
import { WaterDrop, PictureAsPdf } from '@mui/icons-material';
import RecomendacionesSection from './RecomendacionesSection';

// Reutilizamos el componente GaugeIndicator
// El parámetro 'umbral' debe venir del backend (porcentajeAguaUtilUmbral)
// Este valor es dinámico y se configura por lote
const GaugeIndicator = ({ percentage, size = 60, umbral = 50 }) => {
    const safePercentage = percentage === null || percentage === undefined || isNaN(percentage) ? 0 : Math.round(Number(percentage));
    
    const getColor = (value) => {
        value = Number(value) || 0;
        if (value <= umbral / 2) return '#ef4444';
        if (value <= umbral) return '#f97316';
        return '#22c55e';
    };
    
    const color = getColor(safePercentage);
    
    return (
        <div style={{
            position: 'relative',
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            background: '#e5e7eb',
            margin: '0 auto'
        }}>
            <div style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: `conic-gradient(${color} ${safePercentage}%, transparent ${safePercentage}%, transparent 100%)`,
                transform: 'rotate(-90deg)',
            }}>
                <div style={{
                    position: 'absolute',
                    top: '10%',
                    left: '10%',
                    right: '10%',
                    bottom: '10%',
                    background: 'white',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: 'rotate(90deg)',
                    fontSize: `${size/3}px`,
                }}>
                    {safePercentage}%
                </div>
            </div>
        </div>
    );
};

function ResumenCirculos() {
    const [campos, setCampos] = useState([]);
    const [selectedCampo, setSelectedCampo] = useState('');
    const [lotes, setLotes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [recomendaciones, setRecomendaciones] = useState([]);
    const [generatingPDF, setGeneratingPDF] = useState(false);
    const theme = useTheme();
    const navigate = useNavigate();

    useEffect(() => {
        fetchCampos();
        checkAdminStatus();
    }, []);

    useEffect(() => {
        if (selectedCampo && isAdmin) {
            fetchRecomendaciones(selectedCampo);
        }
    }, [selectedCampo, isAdmin]);

    const checkAdminStatus = () => {
        const userRole = localStorage.getItem('role');
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    };

    const fetchCampos = async () => {
        try {
            setLoading(true);
            const userRole = localStorage.getItem('role');
            const endpoint = userRole === 'Admin' ? '/campos/all' : '/campos';
            const response = await axios.get(endpoint);
            setCampos(response.data);
            
            if (response.data.length > 0) {
                setSelectedCampo(response.data[0].id);
                fetchLotesPorCampo(response.data[0].id);
            }
            
            setLoading(false);
        } catch (error) {
            console.error('Error al obtener campos:', error);
            setCampos([]);
            setLoading(false);
            setError('Error al cargar los campos. Por favor, intenta nuevamente.');
        }
    };

    const fetchLotesPorCampo = async (campoId) => {
        try {
            setLoading(true);
            const response = await axios.get(`/lotes/campo/${campoId}`);
            
            const lotesActivos = response.data.lotes && response.data.lotes.length > 0
                ? response.data.lotes.filter(lote => lote.activo)
                : [];
            
            if (lotesActivos.length > 0) {
                // IMPORTANTE: El endpoint /simulations/summary/${lote.id} debe devolver
                // el campo 'porcentajeAguaUtilUmbral' para que los colores de los indicadores
                // se ajusten correctamente según la configuración de cada lote
                const lotesPromises = lotesActivos.map(async (lote) => {
                    try {
                        const dataResponse = await axios.get(`/simulations/summary/${lote.id}`);
                        console.log(`Datos del lote ${lote.id}:`, dataResponse.data);
                        return {
                            ...lote,
                            waterData: dataResponse.data
                        };
                    } catch (error) {
                        console.error(`Error al obtener datos para el lote ${lote.id}:`, error);
                        return {
                            ...lote,
                            waterData: {
                                porcentajeAu1m: 0,
                                porcentajeAu2m: 0,
                                aguaUtil1m: 0,
                                aguaUtil2m: 0,
                                auInicial1m: 0,
                                auInicial2m: 0,
                                porcentajeAguaUtilUmbral: 50,
                                error: true
                            }
                        };
                    }
                });
                
                const lotesConDatos = await Promise.all(lotesPromises);
                setLotes(lotesConDatos);
            } else {
                setLotes([]);
            }
            
            setLoading(false);
        } catch (error) {
            console.error('Error al obtener lotes:', error);
            setLotes([]);
            setLoading(false);
            setError('Error al cargar los lotes. Por favor, intenta nuevamente.');
        }
    };

    const fetchRecomendaciones = async (campoId) => {
        try {
            // Obtener solo la última recomendación del campo
            const response = await axios.get(`/recomendaciones/campo/${campoId}`);
            
            if (response.data && response.data.length > 0) {
                // Tomar solo la última recomendación (la más reciente)
                const ultimaRecomendacion = response.data[response.data.length - 1];
                setRecomendaciones([ultimaRecomendacion]);
            } else {
                setRecomendaciones([]);
            }
        } catch (error) {
            console.error('Error al obtener recomendaciones:', error);
            setRecomendaciones([]);
        }
    };

    const handleCampoChange = (event) => {
        const campoId = event.target.value;
        setSelectedCampo(campoId);
        fetchLotesPorCampo(campoId);
    };

    const handleLoteClick = (loteId, campana) => {
        if (loteId && campana) {
            navigate(`/simulations?lote=${loteId}&campana=${campana}`);
        } else {
            console.error('No se puede navegar: ID de lote o campaña faltante');
        }
    };

    const handleGenerarInforme = async () => {
        if (!selectedCampo || lotes.length === 0) {
            alert('Seleccione un campo con lotes para generar el informe');
            return;
        }

        setGeneratingPDF(true);
        
        try {
            // Importación dinámica para evitar problemas de carga inicial
            const { default: PDFReportGenerator } = await import('./PDFReportGenerator');
            
            // Obtener datos del campo seleccionado
            const campoSeleccionado = campos.find(c => c.id === selectedCampo);
            
            if (!campoSeleccionado) {
                throw new Error('Campo no encontrado');
            }

            // Obtener datos detallados de simulación para cada lote
            const lotesDetallados = await Promise.all(
                lotes.map(async (lote) => {
                    try {
                        // Intentar obtener datos de simulación completos
                        const simResponse = await axios.get(`/simulations/${lote.id}`, {
                            params: { 
                                campaña: lote.campaña, 
                                cultivo: lote.especie 
                            }
                        });
                        
                        return {
                            ...lote,
                            simulationData: simResponse.data
                        };
                    } catch (error) {
                        console.error(`Error al obtener simulación del lote ${lote.id}:`, error);
                        // Retornar lote con datos básicos si falla la simulación
                        return {
                            ...lote,
                            simulationData: null
                        };
                    }
                })
            );

            // Usar las recomendaciones obtenidas del backend (solo la última)
            let recomendacionesParaPDF = recomendaciones;
            if (!recomendacionesParaPDF || recomendacionesParaPDF.length === 0) {
                // Si no hay recomendaciones, usar un array vacío
                recomendacionesParaPDF = [];
            }

            // Generar el PDF
            const pdfGenerator = new PDFReportGenerator();
            await pdfGenerator.generateReport(
                campoSeleccionado,
                lotesDetallados,
                recomendacionesParaPDF
            );
            
        } catch (error) {
            console.error('Error al generar el informe PDF:', error);
            if (error.message.includes('Failed to resolve module')) {
                alert('Las dependencias de PDF no están disponibles. Contacte al administrador.');
            } else {
                alert(`Error al generar el informe: ${error.message}. Por favor, intente nuevamente.`);
            }
        } finally {
            setGeneratingPDF(false);
        }
    };

    const formatNumber = (value) => {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        return Math.round(Number(value));
    };

    return (
        <Container maxWidth="lg">
            <Typography variant="h4" gutterBottom sx={{ my: 4, fontWeight: 'bold', color: theme.palette.primary.main }}>
                Resumen de Círculos
            </Typography>
            
            <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={8}>
                        <FormControl fullWidth>
                            <InputLabel id="campo-label">Campo</InputLabel>
                            <Select
                                labelId="campo-label"
                                label="Campo"
                                value={selectedCampo}
                                onChange={handleCampoChange}
                            >
                                {campos.map(campo => (
                                    <MenuItem key={campo.id} value={campo.id}>{campo.nombre_campo}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Button
                            variant="contained"
                            color="primary"
                            startIcon={<PictureAsPdf />}
                            onClick={handleGenerarInforme}
                            disabled={!selectedCampo || lotes.length === 0 || generatingPDF}
                            fullWidth
                            sx={{ height: '56px' }}
                        >
                            {generatingPDF ? (
                                <Box display="flex" alignItems="center" gap={1}>
                                    <CircularProgress size={20} color="inherit" />
                                    Generando...
                                </Box>
                            ) : (
                                'Generar Informe PDF'
                            )}
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {loading && (
                <Box display="flex" justifyContent="center" my={4}>
                    <CircularProgress />
                </Box>
            )}

            {error && (
                <Typography color="error" sx={{ my: 2 }}>{error}</Typography>
            )}

            

            <Grid container spacing={3}>
                {lotes.map((lote) => (
                    <Grid item xs={12} sm={6} md={4} key={lote.id}>
                        <Card 
                            elevation={3} 
                            sx={{ 
                                height: '100%',
                                transition: 'transform 0.2s',
                                '&:hover': {
                                    transform: 'scale(1.02)',
                                }
                            }}
                        >
                            <CardActionArea 
                                onClick={() => handleLoteClick(lote.id, lote.campaña)}
                                sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                            >
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        {lote.nombre_lote}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        {lote.especie} - {lote.variedad}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Campaña: {lote.campaña}
                                    </Typography>
                                    
                                    <Divider sx={{ my: 2 }} />
                                    
                                    <Box display="flex" flexDirection="column" alignItems="center" sx={{ mt: 2 }}>
                                        <Grid container spacing={2}>
                                            <Grid item xs={6}>
                                                <Box display="flex" flexDirection="column" alignItems="center">
                                                    <Box display="flex" alignItems="center" mb={1}>
                                                        <WaterDrop style={{ color: '#3FA9F5', marginRight: '4px' }} />
                                                        <Typography variant="body2">1 Metro</Typography>
                                                    </Box>
                                                    <GaugeIndicator 
                                                        percentage={formatNumber(lote.waterData?.porcentajeAu1m || 0)} 
                                                        size={80}
                                                        umbral={lote.waterData?.porcentajeAguaUtilUmbral || 50}
                                                    />
                                                    <Typography variant="body2" sx={{ mt: 1 }}>
                                                        {formatNumber(lote.waterData?.aguaUtil1m || 0)} mm
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                            <Grid item xs={6}>
                                                <Box display="flex" flexDirection="column" alignItems="center">
                                                    <Box display="flex" alignItems="center" mb={1}>
                                                        <WaterDrop style={{ color: '#3FA9F5', marginRight: '4px' }} />
                                                        <Typography variant="body2">2 Metros</Typography>
                                                    </Box>
                                                    <GaugeIndicator 
                                                        percentage={formatNumber(lote.waterData?.porcentajeAu2m || 0)} 
                                                        size={80}
                                                        umbral={lote.waterData?.porcentajeAguaUtilUmbral || 50}
                                                    />
                                                    <Typography variant="body2" sx={{ mt: 1 }}>
                                                        {formatNumber(lote.waterData?.aguaUtil2m || 0)} mm
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                        </Grid>
                                    </Box>
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    </Grid>
                ))}
            </Grid>
            
            {isAdmin && selectedCampo && (
                <Paper elevation={3} sx={{ p: 3, mb: 4, mt: 4 }}>
                    <RecomendacionesSection campoId={selectedCampo} />
                </Paper>
            )}
        </Container>
    );
}

export default ResumenCirculos;