import React, { useState, useEffect } from 'react';
import { 
    Container, Grid, Typography, Paper, FormControl, InputLabel, Select, MenuItem, 
    CircularProgress, useTheme, useMediaQuery, Box, Button
} from '@mui/material';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, BarController, LineController } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import axios from '../axiosConfig';
import { format } from 'date-fns';
import Widget from './Widget';
import CorreccionDiasDialog from './CorreccionDiasDialog';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Circle } from 'lucide-react';





ChartJS.register(
    CategoryScale, LinearScale, BarElement, PointElement, LineElement,
    BarController, LineController, Title, Tooltip, Legend, annotationPlugin
);

function Simulations() {
    const [campos, setCampos] = useState([]);
    const [lotes, setLotes] = useState([]);
    const [campañas, setCampañas] = useState([]);
    const [cultivos, setCultivos] = useState([]);
    const [selectedCampo, setSelectedCampo] = useState('');
    const [selectedLote, setSelectedLote] = useState('');
    const [selectedCampaña, setSelectedCampaña] = useState('');
    const [selectedCultivo, setSelectedCultivo] = useState('');
    const [simulationData, setSimulationData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [openCorreccionDialog, setOpenCorreccionDialog] = useState(false);

    const theme = createTheme({
        palette: {
            primary: {
                main: '#000000', // Negro
            },
            secondary: {
                main: '#dc004e', // Rosa
            },
            water:{
                main: '#3498db',
            },
            text: {
                primary: '#333333', // Gris oscuro
                secondary: '#666666', // Gris medio
            },
        },
    });

    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const GaugeIndicator = ({ percentage, size = 40 }) => {
        // Get color based on percentage
        const getColor = (value) => {
          if (value <= simulationData.porcentajeAguaUtilUmbral/2) return '#ef4444'; // red
          if (value <= simulationData.porcentajeAguaUtilUmbral) return '#f97316'; // orange
          return '#22c55e'; // green
        };
    
        const color = getColor(percentage);
        
        return (
            <div className="relative inline-block">
                <Circle size={size} className="text-gray-200" />
                <div 
                className="absolute inset-0 flex items-center justify-center"
                style={{
                    background: `conic-gradient(${color} ${percentage}%, transparent ${percentage}%, transparent 100%)`,
                    borderRadius: '50%',
                }}
                >
                <div className="bg-white rounded-full" style={{ width: `${size-8}px`, height: `${size-8}px` }} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center text-sm font-medium">
                {Math.round(percentage)}%
                </div>
            </div>
        );
    };

    useEffect(() => {
        fetchCampos();
        checkAdminStatus();
    }, []);

    const checkAdminStatus = () => {
        const userRole = localStorage.getItem('role');
        console.log('Este es el User role:', userRole); // Para depuración
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    };

    const fetchCampos = async () => {
        try {
        const response = await axios.get('/campos');
        setCampos(response.data || []);
        } catch (error) {
        console.error('Error fetching campos:', error);
        setCampos([]);
        }
    };

    const fetchLotes = async (campoId) => {
        try {
        const response = await axios.get(`/lotes/campo/${campoId}`);
        setLotes(Array.isArray(response.data) ? response.data : response.data.lotes || []);
        } catch (error) {
        console.error('Error al obtener lotes:', error);
        setLotes([]);
        }
    };

    const fetchCampañas = async (loteId) => {
        try {
        const response = await axios.get(`/campanas/lote/${loteId}`);
        if (response.data && Array.isArray(response.data.todasLasCampañas)) {
            setCampañas(response.data.todasLasCampañas);
            if (response.data.todasLasCampañas.length === 1) {
            setSelectedCampaña(response.data.todasLasCampañas[0]);
            fetchSimulationData(loteId, response.data.todasLasCampañas[0]);
            } else {
            setSelectedCampaña(response.data.loteCampaña || '');
            }
        } else {
            setCampañas([]);
            setSelectedCampaña('');
        }
        } catch (error) {
        console.error('Error al obtener campañas:', error);
        setCampañas([]);
        setSelectedCampaña('');
        }
    };

    const fetchCultivos = async (loteId, campaña) => {
        try {
            const response = await axios.get(`/cultivos/lote/${loteId}`, {
                params: { campaña: campaña }
            });
            if (Array.isArray(response.data)) {
                setCultivos(response.data);
                if (response.data.length === 1) {
                    setSelectedCultivo(response.data[0].especie);
                    fetchSimulationData(loteId, campaña, response.data[0].especie);
                } else {
                    setSelectedCultivo('');
                }
            } else {
                console.error('La respuesta no es un array:', response.data);
                setCultivos([]);
            }
        } catch (error) {
            console.error('Error al obtener cultivos:', error);
            setCultivos([]);
        }
    };

    const handleCampoChange = (event) => {
        const campoId = event.target.value;
        setSelectedCampo(campoId);
        setSelectedLote('');
        setSelectedCampaña('');
        setSelectedCultivo('');
        setSimulationData(null);
        if (campoId) {
            fetchLotes(campoId);
        } else {
            setLotes([]);
        }
    };

    const handleLoteChange = (event) => {
        const loteId = event.target.value;
        setSelectedLote(loteId);
        setSelectedCampaña('');
        setSelectedCultivo('');
        setSimulationData(null);
        if (loteId) {
            fetchCampañas(loteId);
        } else {
            setCampañas([]);
        }
    };

    const handleCampañaChange = (event) => {
        const campaña = event.target.value;
        setSelectedCampaña(campaña);
        setSelectedCultivo('');
        setSimulationData(null);
        if (selectedLote && campaña) {
            fetchCultivos(selectedLote, campaña);
        } else {
            setCultivos([]);
        }
    };

    const handleCultivoChange = (event) => {
        const cultivo = event.target.value;
        setSelectedCultivo(cultivo);
        if (selectedLote && selectedCampaña && cultivo) {
            fetchSimulationData(selectedLote, selectedCampaña, cultivo);
        } else {
            setSimulationData(null);
        }
    };

    const fetchSimulationData = async (loteId, campaña, cultivo) => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`/simulations/${loteId}`, {
                params: { campaña: campaña, cultivo: cultivo }
            });
            
            if (!response.data || !Array.isArray(response.data.fechas) || response.data.fechas.length === 0) {
                throw new Error('Datos de simulación inválidos o vacíos');
            }
            
            setSimulationData(response.data);
        } catch (error) {
            console.error('Error fetching simulation data:', error);
            setError('Error al obtener datos de simulación. Por favor, intente nuevamente.');
            setSimulationData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleForzarActualizacion = async () => {
        try {
            setLoading(true);
            await axios.post('/forzar-actualizacion');
            alert('Actualización forzada completada con éxito');
            // Recargar los datos de simulación si es necesario
            if (selectedLote && selectedCampaña) {
                await fetchSimulationData(selectedLote, selectedCampaña);
            }
        } catch (error) {
            console.error('Error al forzar la actualización:', error);
            alert('Error al realizar la actualización forzada');
        } finally {
            setLoading(false);
        }
    };

    const handleCorreccionDias = () => {
        if (selectedLote && selectedCampaña) {
            setOpenCorreccionDialog(true);
        } else {
            alert('Por favor, seleccione un lote y una campaña antes de abrir la corrección de días.');
        }
    };

    const formatDate = (dateString) => format(new Date(dateString), 'dd/MM/yyyy');
    const formatShortDate = (dateString) => format(new Date(dateString), 'dd/MM');
    const formatNumber = (value) => {
        if (typeof value === 'number' && !isNaN(value)) {
            return Math.round(value);
        }
        return 'N/A';
    };    

    const getEstadosFenologicosAnnotations = () => {
        if (!simulationData || !simulationData.estadosFenologicos) return [];

        let annotations = [];
        let startDay = 0;
        const colors = ['rgba(255, 99, 132, 0.2)', 'rgba(54, 162, 235, 0.2)', 'rgba(255, 206, 86, 0.2)', 'rgba(75, 192, 192, 0.2)'];

        simulationData.estadosFenologicos.forEach((estado, index) => {
            annotations.push({
                type: 'box',
                xMin: startDay,
                xMax: estado.dias,
                yMin: 0,
                yMax: 'max',
                backgroundColor: colors[index % colors.length],
                borderColor: 'transparent',
                drawTime: 'beforeDatasetsDraw',
            });
            annotations.push({
                type: 'label',
                xMin: startDay,
                xMax: estado.dias,
                yMin: 0,
                yMax: 'max',
                content: estado.fenologia,
                font: {
                    size: 14
                },
                color: 'rgba(0, 0, 0, 0.7)',
            });
            startDay = estado.dias;
        });

        return annotations;
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        scales: {
            x: {
                stacked: true,
                ticks: {
                    callback: function(value, index) {
                        return formatShortDate(this.getLabelForValue(value));
                    }
                }
            },
            y: { 
                stacked: true,
                position: 'left',
                title: {
                    display: true,
                    text: 'mm (Lluvia y Riego)'
                },
                grid: {
                    drawOnChartArea: false
                }
            },
            y1: {
                position: 'right',
                title: {
                    display: true,
                    text: 'mm (Agua Útil)'
                },
                grid: {
                    drawOnChartArea: false
                }
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += formatNumber(context.parsed.y) + ' mm';
                            if (label.includes('Umbral')) {
                                const estratosDisponibles = simulationData.estratosDisponibles[context.dataIndex];
                                label += ` (${estratosDisponibles} estratos)`;
                            }
                        }
                        return label;
                    }
                }
            },
            legend: { 
                position: 'top',
                labels: {
                    usePointStyle: true,
                }
            },
            title: {
                display: true,
                text: 'Balance Hídrico',
            }
        },
    };

    const chartData = simulationData ? {
        labels: simulationData.fechas,
        datasets: [
            {
                type: 'bar',
                label: 'Lluvias',
                data: simulationData.lluvias,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                order: 1
            },
            {
                type: 'bar',
                label: 'Riego',
                data: simulationData.riego,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                order: 2
            },
            {
                type: 'line',
                label: 'Agua Útil',
                data: simulationData.aguaUtil, // es el agua útil diaria calculada
                borderColor: 'rgb(255, 99, 132)',
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                order: 0,
                yAxisID: 'y1'
            },
            {
                type: 'line',
                label: `Agua Útil Umbral`,
                data: simulationData.aguaUtilUmbral,
                borderColor: 'rgb(255, 159, 64)',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                tension: 0.1,
                order: 0,
                yAxisID: 'y1'
            },
        ],
    } : null;
    
    useEffect(() => {
        if (simulationData) {
            /*console.log('Datos recibidos en el frontend:', {
                aguaUtil: simulationData.aguaUtil,
                porcentajeAguaUtil: simulationData.porcentajeAguaUtil
            });*/
        }
    }, [simulationData]);

    const additionalWidgets = simulationData ? (
        <Grid item xs={12} md={4}>
            <Widget 
                title="Umbral de Agua Útil Configurado" 
                value={simulationData.porcentajeAguaUtilUmbral}
                unit="%" 
                icon="waterDrop"
            />
        </Grid>
    ) : null;

    if (chartData && simulationData.estadosFenologicos) {
        chartOptions.plugins.annotation = {
            annotations: getEstadosFenologicosAnnotations()
        };
    }

    return (
        <ThemeProvider theme={theme}>
            <Container maxWidth="lg">
            <Typography variant="h4" gutterBottom sx={{ my: 4, fontWeight: 'bold', color: theme.palette.primary.main }}>
                Balance Hídrico
            </Typography>
            
            <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
                <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                    <FormControl fullWidth>
                    <InputLabel>Campo</InputLabel>
                    <Select value={selectedCampo} onChange={handleCampoChange}>
                        <MenuItem value=""><em>Seleccione un campo</em></MenuItem>
                        {campos.map(campo => (
                            <MenuItem key={campo.id} value={campo.id}>{campo.nombre_campo}</MenuItem>
                        ))}
                    </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={'auto'} md={3}>
                    <FormControl fullWidth>
                    <InputLabel>Lote</InputLabel>
                    <Select value={selectedLote} onChange={handleLoteChange} disabled={!selectedCampo}>
                        <MenuItem value=""><em>Seleccione un lote</em></MenuItem>
                        {lotes.map(lote => (
                            <MenuItem key={lote.id} value={lote.id}>{lote.nombre_lote}</MenuItem>
                        ))}
                    </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={'auto'} md={2}>
                    <FormControl fullWidth>
                    <InputLabel>Campaña</InputLabel>
                    <Select value={selectedCampaña} onChange={handleCampañaChange} disabled={!selectedLote}>
                        {campañas.map((campaña) => (
                            <MenuItem key={campaña} value={campaña}>{campaña}</MenuItem>
                        ))}
                    </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} md={3}>
                    <FormControl fullWidth>
                        <InputLabel>Cultivo</InputLabel>
                        <Select value={selectedCultivo} onChange={handleCultivoChange} disabled={!selectedCampaña}>
                            <MenuItem value=""><em>Seleccione un cultivo</em></MenuItem>
                            {cultivos.map((cultivo) => (
                                <MenuItem key={cultivo.id} value={cultivo.especie}>{cultivo.especie}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Grid>
                </Grid>
                {isAdmin && (
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                            <Button 
                                variant="contained" 
                                color="primary" 
                                onClick={handleForzarActualizacion}
                                sx={{ mr: 2 }}
                                >
                                Forzar Actualización Diaria
                            </Button>
                            <Button 
                                variant="contained" 
                                color="secondary" 
                                onClick={handleCorreccionDias}
                                >
                                Corrección de Días
                            </Button>
                        </Box>
                    )}
            </Paper>

            {loading && (
                <Box display="flex" justifyContent="center" my={4}>
                <CircularProgress />
                </Box>
            )}

            {error && (
                <Typography color="error" sx={{ my: 2 }}>{error}</Typography>
            )}


            {simulationData && (
                <>
                <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={12} md={4}>
                    <Widget 
                        title="Cultivo" 
                        value={simulationData.cultivo} 
                        unit="" 
                        icon="grass"
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                    <Widget 
                        title="Variedad" 
                        value={simulationData.variedad} 
                        unit="" 
                        icon="grass"
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                    <Widget 
                        title="Fecha de Siembra" 
                        value={formatDate(simulationData.fechaSiembra)} 
                        unit="" 
                        icon="calendar"
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                    <Widget 
                        title="Estado Fenológico" 
                        value={simulationData.estadoFenologico} 
                        unit="" 
                        icon="grass"
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                    <Widget 
                        title="AU Total" 
                        value={formatNumber(simulationData.auInicial)} 
                        unit="mm" 
                        icon="waterDrop"
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                    <Widget 
                        title="Lluvias Efectiva Acumuladas" 
                        value={formatNumber(simulationData.lluviasEfectivasAcumuladas)} 
                        unit="mm" 
                        icon="cloud"
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                    <Widget 
                        title="Riego Acumulado" 
                        value={formatNumber(simulationData.riegoAcumulado)} 
                        unit="mm" 
                        icon="opacity"
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                    <Widget 
                        title="% Agua Útil" 
                        value={
                            <div className="flex items-center gap-2">
                                <GaugeIndicator percentage={simulationData.porcentajeAguaUtil} />
                                <span>`${formatNumber(simulationData.porcentajeAguaUtil)}% (${formatNumber(simulationData.aguaUtil[simulationData.aguaUtil.length - 1])}mm)`</span>
                            </div>
                        }
                        unit="" 
                        icon="waterDrop"
                        maxWidth='container'
                        />
                    </Grid>
                    
                    <Grid item xs={12} md={4}>
                    <Widget 
                        title="Proyección AU 10 días" 
                        value={
                            <div className="flex items-center gap-2">
                                <GaugeIndicator percentage={(simulationData.proyeccionAU10Dias / simulationData.auInicial) * 100} />
                                <span>{formatNumber(simulationData.proyeccionAU10Dias)}mm</span>
                            </div>
                        }
                        unit="mm" 
                        icon="waterDrop"
                        />
                    </Grid>
                    

                </Grid>

                <Typography variant="body2" align="right" sx={{ mb: 2, fontStyle: 'italic' }}>
                Profundidad estratos: {simulationData.estratosDisponibles * 20}cm - 
                % Agua Util Umbral: {simulationData.porcentajeAguaUtilUmbral}% - Última actualización: {formatDate(simulationData.fechaActualizacion)}
                </Typography>
                
                <Paper elevation={3} sx={{ p: 2, height: isMobile ? '300px' : '400px' }}>
                    {chartData && <Chart type="bar" data={chartData} options={chartOptions} />}
                </Paper>
                </>
            )}
            <CorreccionDiasDialog 
                    open={openCorreccionDialog} 
                    onClose={() => setOpenCorreccionDialog(false)}
                    selectedLote={selectedLote}
                    selectedCampaña={selectedCampaña}
                />
            </Container>
        </ThemeProvider>
    );
}

export default Simulations;
