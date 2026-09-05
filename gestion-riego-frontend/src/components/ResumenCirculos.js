import React, { useState, useEffect } from 'react';
import {
    Container, Grid, Typography, Paper, FormControl, InputLabel,
    Select, MenuItem, CircularProgress, useTheme, Box, Card, CardContent,
    CardActionArea, Divider, Button, Tooltip
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from '../axiosConfig';
import { WaterDrop, PictureAsPdf, Send } from '@mui/icons-material';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
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
                    fontSize: `${size / 3}px`,
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
    const [todosLotes, setTodosLotes] = useState([]);
    const [lotes, setLotes] = useState([]);
    const [campañasFiltro, setCampañasFiltro] = useState([]);
    const [filtroCampaña, setFiltroCampaña] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [recomendaciones, setRecomendaciones] = useState([]);
    const [generatingPDF, setGeneratingPDF] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailSnack, setEmailSnack] = useState({ open: false, message: '', severity: 'success' });
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

    const fetchLotesPorCampo = async (campoId, campañaFiltro = '') => {
        try {
            setLoading(true);
            const response = await axios.get(`/lotes/campo/${campoId}`);

            const all = response.data.lotes && response.data.lotes.length > 0
                ? response.data.lotes
                : [];

            setTodosLotes(all);
            const campañasUnicas = [...new Set(all.map(l => l.campaña).filter(Boolean))].sort();
            setCampañasFiltro(campañasUnicas);

            const filtro = campañaFiltro || (campañasUnicas.length === 1 ? campañasUnicas[0] : '');
            if (filtro && !campañaFiltro) setFiltroCampaña(filtro);

            // No mostrar lotes hasta que el usuario elija una campaña explícitamente
            const lotesVer = filtro ? all.filter(l => l.campaña === filtro) : [];

            if (lotesVer.length > 0) {
                // IMPORTANTE: El endpoint /simulations/summary/${lote.id} debe devolver
                // el campo 'porcentajeAguaUtilUmbral' para que los colores de los indicadores
                // se ajusten correctamente según la configuración de cada lote
                const lotesPromises = lotesVer.map(async (lote) => {
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
                                porcentajeProyectado: 0,
                                porcentajeProyectado2m: 0,
                                proyeccionAU1mDia8: 0,
                                proyeccionAU2mDia8: 0,
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
            const response = await axios.get(`/recomendaciones/campo/${campoId}`);
            // Backend returns sorted DESC by fecha → response.data[0] is most recent
            setRecomendaciones(response.data || []);
        } catch (error) {
            console.error('Error al obtener recomendaciones:', error);
            setRecomendaciones([]);
        }
    };

    const handleCampoChange = (event) => {
        const campoId = event.target.value;
        setSelectedCampo(campoId);
        setFiltroCampaña('');
        setTodosLotes([]);
        setCampañasFiltro([]);
        fetchLotesPorCampo(campoId);
    };

    const handleFiltroCampañaChange = (event) => {
        const campaña = event.target.value;
        setFiltroCampaña(campaña);
        const lotesVer = campaña ? todosLotes.filter(l => l.campaña === campaña) : todosLotes;
        // Re-fetch waterData only for the filtered lots
        if (lotesVer.length > 0) {
            setLoading(true);
            Promise.all(lotesVer.map(async (lote) => {
                try {
                    const dataResponse = await axios.get(`/simulations/summary/${lote.id}`);
                    return { ...lote, waterData: dataResponse.data };
                } catch {
                    return { ...lote, waterData: { porcentajeAu1m: 0, porcentajeAu2m: 0, aguaUtil1m: 0, aguaUtil2m: 0, auInicial1m: 0, auInicial2m: 0, porcentajeAguaUtilUmbral: 50, porcentajeProyectado: 0, porcentajeProyectado2m: 0, proyeccionAU1mDia8: 0, proyeccionAU2mDia8: 0, error: true } };
                }
            })).then(result => {
                setLotes(result);
                setLoading(false);
            });
        } else {
            setLotes([]);
        }
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

    const handleEnviarInforme = async () => {
        if (!selectedCampo || lotes.length === 0) {
            setEmailSnack({ open: true, message: 'Seleccione un campo con lotes antes de enviar', severity: 'warning' });
            return;
        }

        setSendingEmail(true);

        try {
            const { default: PDFReportGenerator } = await import('./PDFReportGenerator');

            const campoSeleccionado = campos.find(c => c.id === selectedCampo);
            if (!campoSeleccionado) throw new Error('Campo no encontrado');

            const lotesDetallados = await Promise.all(
                lotes.map(async (lote) => {
                    try {
                        const simResponse = await axios.get(`/simulations/${lote.id}`, {
                            params: { campaña: lote.campaña, cultivo: lote.especie }
                        });
                        return { ...lote, simulationData: simResponse.data };
                    } catch {
                        return { ...lote, simulationData: null };
                    }
                })
            );

            const pdfGenerator = new PDFReportGenerator();
            const pdfBytes = await pdfGenerator.generateReport(
                campoSeleccionado,
                lotesDetallados,
                recomendaciones || [],
                { returnBytes: true }
            );

            // Convertir Uint8Array a base64
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));

            const response = await axios.post('/reportes/enviar-pdf', {
                campoId: selectedCampo,
                pdfBase64: base64,
                nombreCampo: campoSeleccionado.nombre_campo,
                campañaNombre: filtroCampaña || '',
            });

            setEmailSnack({ open: true, message: response.data.message, severity: 'success' });

        } catch (error) {
            console.error('Error al enviar informe:', error);
            const msg = error.response?.data?.error || error.message || 'Error al enviar el informe';
            setEmailSnack({ open: true, message: msg, severity: 'error' });
        } finally {
            setSendingEmail(false);
        }
    };

    const formatNumber = (value) => {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        return Math.round(Number(value));
    };

    const formatDate = (dateString) => {
        try {
            const [y, m, d] = (dateString || '').substring(0, 10).split('-');
            return `${d}/${m}/${y}`;
        } catch { return dateString || ''; }
    };

    const stripMarkdown = (text) =>
        (text || '').replace(/\*\*/g, '').replace(/\*/g, '');

    // Map especie → most recent recommendation (backend returns DESC, so [0] is newest)
    const lastRecByEspecie = recomendaciones.reduce((map, rec) => {
        if (rec.cultivo && !map.has(rec.cultivo)) map.set(rec.cultivo, rec);
        return map;
    }, new Map());
    const lastGenRec = recomendaciones.find(r => !r.cultivo) || null;

    return (
        <>
        <Container maxWidth="lg">
            <Typography variant="h4" gutterBottom sx={{ my: 4, fontWeight: 'bold', color: theme.palette.primary.main }}>
                Resumen de Círculos
            </Typography>

            <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={6} md={4}>
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
                    <Grid item xs={12} sm={6} md={4}>
                        <FormControl fullWidth>
                            <InputLabel>Campaña</InputLabel>
                            <Select
                                value={filtroCampaña}
                                onChange={handleFiltroCampañaChange}
                                disabled={!selectedCampo}
                                label="Campaña"
                            >
                                <MenuItem value=""><em>Todas</em></MenuItem>
                                {campañasFiltro.map(c => (
                                    <MenuItem key={c} value={c}>{c}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box display="flex" gap={1}>
                            <Button
                                variant="contained"
                                color="primary"
                                startIcon={<PictureAsPdf />}
                                onClick={handleGenerarInforme}
                                disabled={!isAdmin || !selectedCampo || lotes.length === 0 || generatingPDF || sendingEmail}
                                sx={{ height: '56px', flex: 1, minWidth: 0 }}
                            >
                                {generatingPDF ? (
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <CircularProgress size={20} color="inherit" />
                                        Generando...
                                    </Box>
                                ) : (
                                    'Informe PDF'
                                )}
                            </Button>
                            {isAdmin && (
                                <Tooltip title="Enviar informe por email a los usuarios del campo">
                                    <span>
                                        <Button
                                            variant="outlined"
                                            color="primary"
                                            startIcon={sendingEmail ? <CircularProgress size={16} color="inherit" /> : <Send />}
                                            onClick={handleEnviarInforme}
                                            disabled={!selectedCampo || lotes.length === 0 || generatingPDF || sendingEmail}
                                            sx={{ height: '56px', whiteSpace: 'nowrap' }}
                                        >
                                            {sendingEmail ? 'Enviando...' : 'Enviar'}
                                        </Button>
                                    </span>
                                </Tooltip>
                            )}
                        </Box>
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

            {!loading && selectedCampo && campañasFiltro.length > 1 && !filtroCampaña && (
                <Box display="flex" justifyContent="center" alignItems="center" my={6}>
                    <Typography variant="body1" color="text.secondary">
                        Seleccione una campaña para ver los lotes del campo
                    </Typography>
                </Box>
            )}

            {(() => {
                // Agrupar lotes por especie (cultivo), ordenados alfabéticamente
                const grupos = lotes.reduce((acc, lote) => {
                    const especie = lote.especie || 'Sin cultivo';
                    if (!acc[especie]) acc[especie] = [];
                    acc[especie].push(lote);
                    return acc;
                }, {});
                const especiesOrdenadas = Object.keys(grupos).sort();

                return (
                    <>
                        {especiesOrdenadas.map((especie, grupoIdx) => (
                            <React.Fragment key={especie}>
                                {grupoIdx > 0 && (
                                    <Divider sx={{ my: 3, borderColor: 'rgba(0,0,0,0.1)' }} />
                                )}
                                <Box sx={{ mb: 2 }}>
                                    <Typography
                                        variant="overline"
                                        sx={{ fontWeight: 700, fontSize: '0.78rem', letterSpacing: 1.2, color: 'text.secondary' }}
                                    >
                                        {especie}
                                        <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 1, fontWeight: 400 }}>
                                            ({grupos[especie].length} lote{grupos[especie].length !== 1 ? 's' : ''})
                                        </Typography>
                                    </Typography>
                                </Box>
                                <Grid container spacing={3}>
                                    {grupos[especie].map((lote) => {
                                        const ultimaRec = lastRecByEspecie.get(lote.especie) || lastGenRec;
                                        const tooltipTitle = ultimaRec ? (
                                            <Box sx={{ p: 0.5, maxWidth: 300 }}>
                                                <Typography variant="caption" display="block" sx={{ opacity: 0.75, mb: 0.5, fontWeight: 600 }}>
                                                    Última recomendación · {formatDate(ultimaRec.fecha)}
                                                    {ultimaRec.usuario ? ` · ${ultimaRec.usuario}` : ''}
                                                </Typography>
                                                <Typography variant="body2" sx={{ fontSize: '0.78rem', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                                                    {stripMarkdown(ultimaRec.texto || '').substring(0, 260)}
                                                    {(ultimaRec.texto || '').length > 260 ? '…' : ''}
                                                </Typography>
                                            </Box>
                                        ) : '';
                                        return (
                                        <Grid item xs={12} sm={6} md={4} key={lote.id}>
                                            <Tooltip
                                                title={tooltipTitle}
                                                placement="top"
                                                arrow
                                                enterDelay={450}
                                                componentsProps={{
                                                    tooltip: { sx: { maxWidth: 320, bgcolor: 'background.paper', color: 'text.primary', boxShadow: 4, border: '1px solid', borderColor: 'divider', p: 1.5 } },
                                                    arrow: { sx: { color: 'background.paper', filter: 'drop-shadow(0 -1px 0 rgba(0,0,0,0.12))' } }
                                                }}
                                            >
                                            <Card
                                                elevation={3}
                                                sx={{
                                                    height: '100%',
                                                    transition: 'transform 0.2s',
                                                    '&:hover': { transform: 'scale(1.02)' }
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
                                                            Estado Fenológico: {lote.waterData?.estadoFenologico || 'Desconocido'}
                                                        </Typography>

                                                        <Divider sx={{ my: 2 }} />

                                                        <Box display="flex" flexDirection="column" alignItems="center" sx={{ mt: 2 }}>
                                                            <Typography variant="subtitle2" color="text.secondary" align="left" sx={{ width: '100%', mb: 1, borderBottom: '1px solid #eee' }}>
                                                                Profundidad 0-100 cm
                                                            </Typography>
                                                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                                                <Grid item xs={6}>
                                                                    <Box display="flex" flexDirection="column" alignItems="center">
                                                                        <Box display="flex" alignItems="center" mb={1} sx={{ minHeight: '36px', textAlign: 'center' }}>
                                                                            <WaterDrop style={{ color: '#3FA9F5', marginRight: '4px' }} fontSize="small" />
                                                                            <Typography variant="caption" sx={{ lineHeight: 1.1 }}>Actual</Typography>
                                                                        </Box>
                                                                        <GaugeIndicator
                                                                            percentage={formatNumber(lote.waterData?.porcentajeAu1m || 0)}
                                                                            size={60}
                                                                            umbral={lote.waterData?.porcentajeAguaUtilUmbral || 50}
                                                                        />
                                                                    </Box>
                                                                </Grid>
                                                                <Grid item xs={6}>
                                                                    <Box display="flex" flexDirection="column" alignItems="center">
                                                                        <Box display="flex" alignItems="center" mb={1} sx={{ minHeight: '36px', textAlign: 'center' }}>
                                                                            <WaterDrop style={{ color: '#3FA9F5', marginRight: '4px' }} fontSize="small" />
                                                                            <Typography variant="caption" sx={{ lineHeight: 1.1 }}>Proy. 7 días</Typography>
                                                                        </Box>
                                                                        <GaugeIndicator
                                                                            percentage={formatNumber(lote.waterData?.porcentajeProyectado || 0)}
                                                                            size={60}
                                                                            umbral={lote.waterData?.porcentajeAguaUtilUmbral || 50}
                                                                        />
                                                                    </Box>
                                                                </Grid>
                                                            </Grid>

                                                            <Typography variant="subtitle2" color="text.secondary" align="left" sx={{ width: '100%', mb: 1, borderBottom: '1px solid #eee' }}>
                                                                Profundidad 0-200 cm
                                                            </Typography>
                                                            <Grid container spacing={2}>
                                                                <Grid item xs={6}>
                                                                    <Box display="flex" flexDirection="column" alignItems="center">
                                                                        <Box display="flex" alignItems="center" mb={1} sx={{ minHeight: '36px', textAlign: 'center' }}>
                                                                            <WaterDrop style={{ color: '#3FA9F5', marginRight: '4px' }} fontSize="small" />
                                                                            <Typography variant="caption" sx={{ lineHeight: 1.1 }}>Actual</Typography>
                                                                        </Box>
                                                                        <GaugeIndicator
                                                                            percentage={formatNumber(lote.waterData?.porcentajeAu2m || 0)}
                                                                            size={60}
                                                                            umbral={lote.waterData?.porcentajeAguaUtilUmbral || 50}
                                                                        />
                                                                    </Box>
                                                                </Grid>
                                                                <Grid item xs={6}>
                                                                    <Box display="flex" flexDirection="column" alignItems="center">
                                                                        <Box display="flex" alignItems="center" mb={1} sx={{ minHeight: '36px', textAlign: 'center' }}>
                                                                            <WaterDrop style={{ color: '#3FA9F5', marginRight: '4px' }} fontSize="small" />
                                                                            <Typography variant="caption" sx={{ lineHeight: 1.1 }}>Proy. 7 días</Typography>
                                                                        </Box>
                                                                        <GaugeIndicator
                                                                            percentage={formatNumber(lote.waterData?.porcentajeProyectado2m || 0)}
                                                                            size={60}
                                                                            umbral={lote.waterData?.porcentajeAguaUtilUmbral || 50}
                                                                        />
                                                                    </Box>
                                                                </Grid>
                                                            </Grid>
                                                        </Box>
                                                    </CardContent>
                                                </CardActionArea>
                                            </Card>
                                            </Tooltip>
                                        </Grid>
                                        );
                                    })}
                                </Grid>
                            </React.Fragment>
                        ))}

                        {isAdmin && selectedCampo && (
                            <Paper elevation={3} sx={{ p: 3, mb: 4, mt: 4 }}>
                                <RecomendacionesSection campoId={selectedCampo} especies={especiesOrdenadas} />
                            </Paper>
                        )}
                    </>
                );
            })()}
        </Container>

        <Snackbar
            open={emailSnack.open}
            autoHideDuration={5000}
            onClose={() => setEmailSnack(s => ({ ...s, open: false }))}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
            <Alert severity={emailSnack.severity} variant="filled" sx={{ borderRadius: 2 }}
                onClose={() => setEmailSnack(s => ({ ...s, open: false }))}>
                {emailSnack.message}
            </Alert>
        </Snackbar>
        </>
    );
}

export default ResumenCirculos;