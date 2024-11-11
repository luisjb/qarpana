import React, { useState, useEffect } from 'react';
import { 
    Container, Grid, Typography, Paper, FormControl, InputLabel, Select, MenuItem, 
    CircularProgress, useTheme, useMediaQuery, Box
} from '@mui/material';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, BarController, LineController } from 'chart.js';
import { Chart } from 'react-chartjs-2';
import axios from '../axiosConfig';
import { format } from 'date-fns';
import Widget from './Widget';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, PointElement, LineElement,
    BarController, LineController, Title, Tooltip, Legend
);

function Simulations() {
    const [campos, setCampos] = useState([]);
    const [lotes, setLotes] = useState([]);
    const [campañas, setCampañas] = useState([]);
    const [selectedCampo, setSelectedCampo] = useState('');
    const [selectedLote, setSelectedLote] = useState('');
    const [selectedCampaña, setSelectedCampaña] = useState('');
    const [simulationData, setSimulationData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    useEffect(() => {
        fetchCampos();
    }, []);

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

    const handleCampoChange = (event) => {
        const campoId = event.target.value;
        setSelectedCampo(campoId);
        setSelectedLote('');
        setSelectedCampaña('');
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
        if (selectedLote && campaña) {
        fetchSimulationData(selectedLote, campaña);
        } else {
        setSimulationData(null);
        }
    };

    const fetchSimulationData = async (loteId, campaña) => {
        setLoading(true);
        setError(null);
        try {
        const response = await axios.get(`/simulations/${loteId}`, {
            params: { campaña: campaña }
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

    const formatDate = (dateString) => format(new Date(dateString), 'dd/MM/yyyy');
    const formatShortDate = (dateString) => format(new Date(dateString), 'dd/MM');
    const formatNumber = (value) => typeof value === 'number' && !isNaN(value) ? value.toFixed(2).padStart(5, '0') : 'N/A';

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
        x: {
            stacked: true,
            ticks: {
            callback: function(value, index) {
                return formatShortDate(this.getLabelForValue(value));
            }
            }
        },
        y: { stacked: true }
        },
        plugins: {
        legend: { position: 'top' },
        title: {
            display: true,
            text: 'Simulación de Agua, Riego y Lluvia',
        },
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
        },
        {
            type: 'bar',
            label: 'Riego',
            data: simulationData.riego,
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
        },
        {
            type: 'line',
            label: 'Agua Útil',
            data: simulationData.aguaUtil,
            borderColor: 'rgb(255, 99, 132)',
            borderWidth: 2,
            fill: false,
        },
        {
            type: 'line',
            label: 'Agua Útil 50%',
            data: simulationData.aguaUtil50,
            borderColor: 'rgb(255, 159, 64)',
            borderWidth: 2,
            fill: false,
        },
        ],
    } : null;

    return (
        <Container maxWidth="lg">
        <Typography variant="h4" gutterBottom sx={{ my: 4, fontWeight: 'bold', color: theme.palette.primary.main }}>
            Simulaciones
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
            <Grid item xs={12} md={4}>
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
            <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                <InputLabel>Campaña</InputLabel>
                <Select value={selectedCampaña} onChange={handleCampañaChange} disabled={!selectedLote}>
                    {campañas.map((campaña) => (
                    <MenuItem key={campaña} value={campaña}>{campaña}</MenuItem>
                    ))}
                </Select>
                </FormControl>
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

        {simulationData && (
            <>
            <Grid container spacing={2} sx={{ mb: 4 }}>
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
                    title="Fecha de Siembra" 
                    value={formatDate(simulationData.fechaSiembra)} 
                    unit="" 
                    icon="calendar"
                />
                </Grid>
                <Grid item xs={12} md={4}>
                <Widget 
                    title="AU Inicial" 
                    value={formatNumber(simulationData.auInicial)} 
                    unit="mm" 
                    icon="waterDrop"
                />
                </Grid>
                <Grid item xs={12} md={4}>
                <Widget 
                    title="Lluvias Eficientes Acumuladas" 
                    value={formatNumber(simulationData.lluviasEficientesAcumuladas)} 
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
                    value={simulationData.porcentajeAguaUtil} 
                    unit="%" 
                    icon="waterDrop"
                />
                </Grid>
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
                    title="Proyección AU 10 días" 
                    value={formatNumber(simulationData.proyeccionAU10Dias)} 
                    unit="mm" 
                    icon="waterDrop"
                />
                </Grid>
            </Grid>

            <Typography variant="body2" align="right" sx={{ mb: 2, fontStyle: 'italic' }}>
                Última actualización: {formatDate(simulationData.fechaActualizacion)}
            </Typography>

            <Paper elevation={3} sx={{ p: 2, height: isMobile ? '300px' : '400px' }}>
                {chartData && <Chart type="bar" data={chartData} options={chartOptions} />}
            </Paper>
            </>
        )}
        </Container>
    );
}

export default Simulations;