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
import annotationPlugin from 'chartjs-plugin-annotation';
import DownloadIcon from '@mui/icons-material/Download';
import { WaterDrop } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';
import ObservacionesSection from './ObservacionesSection';



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
    const location = useLocation();


    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const GaugeIndicator = ({ percentage, size = 60 }) => {
        const safePercentage = percentage === null || percentage === undefined || isNaN(percentage) ? 0 : Math.round(Number(percentage));
        
        const getColor = (value) => {
            value = Number(value) || 0;
            if (value <= simulationData.porcentajeAguaUtilUmbral/2) return '#ef4444';
            if (value <= simulationData.porcentajeAguaUtilUmbral) return '#f97316';
            return '#22c55e';
        };
    
        const color = getColor(safePercentage);
        
        return (
            <div style={{
                position: 'relative',
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: '50%',
                background: '#e5e7eb', // color de fondo
            }}>
                <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: `conic-gradient(${color} ${safePercentage}%, transparent ${safePercentage}%, transparent 100%)`,
                    transform: 'rotate(-90deg)', // Comienza desde arriba
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
                        transform: 'rotate(90deg)', // Corrige la rotación para el texto
                        fontSize: `${size/3}px`,
                    }}>
                        {safePercentage}%
                    </div>
                </div>
            </div>
        );
    };

    useEffect(() => {
        fetchCampos();
        checkAdminStatus();
        
        // Procesar parámetros de URL, si existen
        const params = new URLSearchParams(window.location.search);
        const loteId = params.get('lote');
        const campana = params.get('campana');
        console.log("Parámetros URL detectados:", { loteId, campana });

        if (loteId) {
            // Primero necesitamos encontrar a qué campo pertenece este lote
            const findCampoForLote = async () => {
                try {
                    const response = await axios.get(`/lotes/${loteId}`);
                    if (response.data && response.data.campo_id) {
                        setSelectedCampo(response.data.campo_id);
                        await fetchLotes(response.data.campo_id);
                        setSelectedLote(loteId);
                        
                        if (campana) {
                            setSelectedCampaña(campana);
                            await fetchCultivos(loteId, campana);
                        } else {
                            await fetchCampañas(loteId);
                        }
                    }
                } catch (error) {
                    console.error('Error al obtener información del lote:', error);
                }
            };
            
            findCampoForLote();
        }
    }, [location.search]);

    const checkAdminStatus = () => {
        const userRole = localStorage.getItem('role');
        console.log('Este es el User role:', userRole); // Para depuración
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    };

    const fetchCampos = async () => {
        try {
            const userRole = localStorage.getItem('role');
            // Si es Admin, obtener todos los campos, si no, solo los asociados al usuario
            const endpoint = userRole === 'Admin' ? '/campos/all' : '/campos';
            const response = await axios.get(endpoint);
            console.log('Campos fetched:', response.data);
            setCampos(response.data);
        } catch (error) {
            console.error('Error al obtener campos:', error);
            setCampos([]);
        }
    };

    const fetchLotes = async (campoId) => {
        try {
            const response = await axios.get(`/lotes/campo/${campoId}`);
            setLotes(Array.isArray(response.data) 
                ? response.data.filter(lote => lote.activo) 
                : (response.data.lotes || []).filter(lote => lote.activo));
        } catch (error) {
            console.error('Error al obtener lotes:', error);
            setLotes([]);
        }
    };

    const fetchCampañas = async (loteId) => {
        try {
            const response = await axios.get(`/campanas/lote/${loteId}`);
            if (response.data && Array.isArray(response.data.todasLasCampañas)) {
                // Filtrar para mostrar solo las campañas que pertenecen a este lote específico
                const campañasLote = response.data.todasLasCampañas.filter(campaña => {
                    return response.data.campañasDelLote && response.data.campañasDelLote.includes(campaña);
                });
                
                setCampañas(campañasLote);
                
                // Si solo hay una campaña, seleccionarla automáticamente
                if (campañasLote.length === 1) {
                    setSelectedCampaña(campañasLote[0]);
                    fetchSimulationData(loteId, campañasLote[0]);
                } else if (campañasLote.length > 0) {
                    // Establecer la campaña actual del lote como seleccionada por defecto
                    const campañaActual = response.data.loteCampaña || '';
                    if (campañaActual && campañasLote.includes(campañaActual)) {
                        setSelectedCampaña(campañaActual);
                        fetchSimulationData(loteId, campañaActual);
                    } else {
                        setSelectedCampaña(''); // Ninguna seleccionada si no hay coincidencia
                    }
                } else {
                    setCampañas([]);
                    setSelectedCampaña('');
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
                } else if (response.data.length > 0) {
                    // Si venimos de una URL con parámetros, seleccionamos el primer cultivo
                    const urlParams = new URLSearchParams(location.search);
                    if (urlParams.get('lote') && urlParams.get('campana')) {
                        setSelectedCultivo(response.data[0].especie);
                        fetchSimulationData(loteId, campaña, response.data[0].especie);
                    } else {
                        setSelectedCultivo('');
                    }
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
            const lastIndex = response.data.aguaUtil.length - 1;
            console.log(`Datos de simulación para lote ${loteId}:`, {
                auZonaRadicular: response.data.aguaUtil[lastIndex],
                porcentajeAu: response.data.porcentajeAguaUtil,
                porcentaje1m: response.data.porcentajeAu1m,
                porcentaje2m: response.data.porcentajeAu2m,
                valor1m: response.data.aguaUtil1m,
                valor2m: response.data.aguaUtil2m,
                fecha: response.data.fechas[lastIndex]
            });

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
    // Función auxiliar para verificar si una fecha es válida
    const isValidDate = (dateString) => {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    };

    const formatDate = (dateString) => {
        if (!dateString || !isValidDate(dateString)) return '';
        try {
            return format(new Date(dateString), 'dd/MM/yyyy');
        } catch (error) {
            console.error('Error formatting date:', error);
            return '';
        }
    };
    const formatShortDate = (dateString) => {
        if (!dateString || !isValidDate(dateString)) return '';
        try {
            return format(new Date(dateString), 'dd/MM');
        } catch (error) {
            console.error('Error formatting short date:', error);
            return '';
        }
    };
    const formatNumber = (value) => {
        if (value === null || value === undefined || isNaN(value)) {
            return 0;
        }
        return Math.round(Number(value));
    };

    const prepareCSVData = (simulationData) => {
        // Log inicial para depuración
        console.log('Preparando CSV con simulationData:', {
            fechas: simulationData.fechas?.length || 0,
            fechasProyeccion: simulationData.fechasProyeccion?.length || 0,
            estadosFenologicos: simulationData.estadosFenologicos,
            fechaSiembra: simulationData.fechaSiembra
        });
        
        // Función interna para validar fechas
        const isDateValid = (dateString) => {
            if (!dateString) return false;
            const date = new Date(dateString);
            return date instanceof Date && !isNaN(date.getTime());
        };
        
        // Usar la función de validación disponible o la interna
        const validateDate = typeof isValidDate === 'function' ? isValidDate : isDateValid;
        
        // Combinar fechas válidas
        const fechasHistoricas = (simulationData.fechas || []).filter(date => validateDate(date));
        const fechasProyeccion = (simulationData.fechasProyeccion || []).filter(date => validateDate(date));
        const allDates = [...fechasHistoricas, ...fechasProyeccion];
        
        
        if (allDates.length === 0) {
            console.error('No hay fechas válidas para procesar');
            return [];
        }
        
        // Funciones de formato
        const formatDecimal = (value) => parseFloat(value || 0).toFixed(2);
        const formatNumber = (value) => Math.round(parseFloat(value) || 0);
        
        // Calcular días absolutos desde siembra
        let diasDesdeSiembra = [];
        
        if (simulationData.fechaSiembra && validateDate(simulationData.fechaSiembra)) {
            const fechaSiembra = new Date(simulationData.fechaSiembra);
            
            diasDesdeSiembra = allDates.map((date, index) => {
                if (!validateDate(date)) return 0;
                const dateObj = new Date(date);
                const dias = Math.floor((dateObj - fechaSiembra) / (1000 * 60 * 60 * 24));
                return Math.max(0, dias);
            });
            
        } else {
            // Fallback si no hay fecha de siembra válida
            diasDesdeSiembra = allDates.map((_, index) => index);
        }
        
        // Crear rangos de estados fenológicos
        let rangosEstadosFenologicos = [];
        
        if (simulationData.estadosFenologicos && 
            Array.isArray(simulationData.estadosFenologicos) && 
            simulationData.estadosFenologicos.length > 0) {
            
            
            // Ordenar por días para asegurar secuencia correcta
            const estadosOrdenados = [...simulationData.estadosFenologicos].sort((a, b) => 
                parseInt(a.dias || 0) - parseInt(b.dias || 0)
            );
            
            let startDay = 0;
            estadosOrdenados.forEach((estado, index) => {
                const diasEstado = parseInt(estado.dias || 0);
                
                if (isNaN(diasEstado)) {
                    return;
                }
                
                if (diasEstado >= startDay) {
                    rangosEstadosFenologicos.push({
                        fenologia: estado.fenologia,
                        inicio: startDay,
                        fin: diasEstado
                    });
                    startDay = diasEstado;
                }
            });
            
            // Agregar el último estado para cubrir días restantes
            if (rangosEstadosFenologicos.length > 0) {
                const ultimoEstado = estadosOrdenados[estadosOrdenados.length - 1];
                rangosEstadosFenologicos.push({
                    fenologia: ultimoEstado.fenologia,
                    inicio: parseInt(ultimoEstado.dias || 0),
                    fin: Infinity
                });
            }
        } else if (simulationData.estadoFenologico) {
            // Fallback si solo tenemos el estado actual
            rangosEstadosFenologicos.push({
                fenologia: simulationData.estadoFenologico,
                inicio: 0,
                fin: Infinity
            });
        } else {
            // Fallback si no hay información de estados
            rangosEstadosFenologicos.push({
                fenologia: "Desconocido",
                inicio: 0,
                fin: Infinity
            });
        }
        
        // Si no se crearon rangos, usar uno por defecto
        if (rangosEstadosFenologicos.length === 0) {
            rangosEstadosFenologicos.push({
                fenologia: "Sin datos",
                inicio: 0,
                fin: Infinity
            });
        }
        
        
        
        
        // Determinar el ciclo total del cultivo (último día definido en estados fenológicos)
        const ultimoDiaDefinido = rangosEstadosFenologicos.length > 1 ? 
            rangosEstadosFenologicos[rangosEstadosFenologicos.length - 2].fin : 50;
        
        
        // Normalizar los días para que estén dentro del rango de estados fenológicos
        const diasNormalizados = diasDesdeSiembra.map(dia => {
            if (dia <= ultimoDiaDefinido) {
                return dia; // Usar día directamente si está dentro del rango
            } else {
                // Normalizar al ciclo del cultivo usando módulo
                return dia % ultimoDiaDefinido;
            }
        });
        
        
        // Función para determinar estado fenológico basada en días normalizados
        const determinarEstadoFenologico = (dia) => {
            const diaNum = parseInt(dia);
            if (isNaN(diaNum)) {
                return rangosEstadosFenologicos[0]?.fenologia || "Desconocido";
            }
            
            for (const rango of rangosEstadosFenologicos) {
                if (diaNum >= rango.inicio && diaNum < rango.fin) {
                    return rango.fenologia;
                }
            }
            
            return rangosEstadosFenologicos[rangosEstadosFenologicos.length - 1]?.fenologia || "Desconocido";
        };
        
        // Verificar con ejemplos
        if (diasNormalizados.length > 0) {
            console.log('Ejemplos de asignación de estados con días normalizados:');
            const diasMuestra = [0, Math.floor(diasNormalizados.length / 3), Math.floor(diasNormalizados.length * 2 / 3)];
            
            diasMuestra.forEach(indice => {
                const diaAbs = diasDesdeSiembra[indice];
                const diaNorm = diasNormalizados[indice];
                const estado = determinarEstadoFenologico(diaNorm);
                console.log(`Fecha ${allDates[indice]}, Día absoluto ${diaAbs}, Día normalizado ${diaNorm}: Estado ${estado}`);
            });
        }
        
        // Función para formatear fechas
        const formatDate = (dateString) => {
            if (!validateDate(dateString)) return '';
            
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric'});
            } catch (error) {
                console.error('Error al formatear fecha:', error);
                return dateString;
            }
        };
        
        // Preparar los datos para el CSV
        const csvData = allDates.map((date, index) => {
            const isHistorical = index < fechasHistoricas.length;
            const etcValue = formatDecimal(simulationData.etc?.[index] || 0);
            
            let aguaUtil;
            if (isHistorical) {
                aguaUtil = formatNumber(simulationData.aguaUtil?.[index] || 0);
            } else {
                const proyIndex = index - fechasHistoricas.length;
                aguaUtil = formatNumber(simulationData.aguaUtilProyectada?.[proyIndex] || 0);
            }
            
            const umbral = formatNumber(simulationData.aguaUtilUmbral?.[index] || 0);
            
            let porcentajeAU = 0;
            if (umbral > 0 && simulationData.porcentajeAguaUtilUmbral) {
                const porcentajeUmbral = parseFloat(simulationData.porcentajeAguaUtilUmbral) / 100;
                porcentajeAU = formatNumber((aguaUtil / (umbral / porcentajeUmbral)) * 100);
            }
            
            // Usar día normalizado para determinar el estado fenológico
            const diaNormalizado = diasNormalizados[index];
            const estadoFenologico = determinarEstadoFenologico(diaNormalizado);
            
            // Crear el objeto de datos
            return {
                Fecha: formatDate(date),
                'Agua Útil (mm)': isHistorical ? 
                    formatNumber(simulationData.aguaUtil[index]) : 
                    formatNumber(simulationData.aguaUtilProyectada[index - simulationData.fechas.length]),
                'Agua Útil Umbral (mm)': formatNumber(simulationData.aguaUtilUmbral[index]),
                '% Agua Útil': porcentajeAU,
                'Lluvias (mm)': formatNumber(simulationData.lluvias[index] || 0),
                'Lluvia Efectiva (mm)': formatNumber(simulationData.lluviasEfectivas[index] || 0),
                'Riego (mm)': formatNumber(simulationData.riego[index] || 0),
                'Estrato': simulationData.estratosDisponibles[index],
                'KC': simulationData.kc[index] ? parseFloat(simulationData.kc[index]).toFixed(2) : '0.00',
                'Evapotranspiración': parseFloat(simulationData.evapotranspiracion[index] || 0).toFixed(2),
                'ETC': etcValue,
                'Capacidad Extracción': formatDecimal(simulationData.capacidadExtraccion[index] || 0),
                'Estado Fenológico': estadoFenologico
            };
        });
    
        return csvData;
    };

    const downloadCSV = (simulationData) => {
        const csvData = prepareCSVData(simulationData);
        
        // Crear las cabeceras del CSV
        const headers = Object.keys(csvData[0]);
        
        // Convertir los datos a formato CSV
        const csvContent = [
            headers.join(','),
            ...csvData.map(row => headers.map(header => row[header]).join(','))
        ].join('\n');
    
        // Crear el blob y descargar
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `balance_hidrico_${selectedLote}_${formatDate(new Date())}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    
    const getEstadosFenologicosAnnotations = () => {
        if (!simulationData || !simulationData.estadosFenologicos) return [];

        let annotations = [];
        let startDay = 0;
        const colors = ['rgba(110, 243, 110, 0.2)', 'rgba(156, 105, 46, 0.2)', 'rgba(255, 238, 86, 0.2)', 'rgba(75, 192, 192, 0.2)'];

        const allAguaUtilValues = [
            ...simulationData.aguaUtil, 
            ...simulationData.aguaUtilProyectada.filter(val => val !== null && !isNaN(val))
        ];

        const maxAguaUtil = Math.max(...simulationData.aguaUtil, ...simulationData.aguaUtilProyectada.filter(val => val !== null));
        const labelPosition = maxAguaUtil * 0.85; // 85% del máximo

        const labelYPosition = Math.max(...allAguaUtilValues) * 1.1; // 110% del máximo


        simulationData.estadosFenologicos.forEach((estado, index) => {
            // Añadimos la caja de color para cada estado fenológico
            annotations.push({
                type: 'box',
                xMin: startDay,
                xMax: estado.dias,
                yMin: 0,
                yMax: Math.max(...allAguaUtilValues) * 1.2, // Asegurar que la caja llegue hasta arriba
                backgroundColor: colors[index % colors.length],
                borderColor: 'transparent',
                drawTime: 'beforeDatasetsDraw',
                z: -1 // Para que esté detrás de los datasets

            });
            
            // Añadimos la etiqueta con el nombre del estado fenológico
            annotations.push({
                type: 'label',
                xValue: (startDay + estado.dias) / 2, // Posición x centrada entre inicio y fin
                yValue: labelYPosition,
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                borderRadius: 4,
                content: estado.fenologia,
                font: {
                    size: 12,
                    weight: 'bold'
                },
                color: 'rgba(0, 0, 0, 0.8)',
                padding: {
                    top: 4,
                    bottom: 4,
                    left: 6,
                    right: 6
                },
                 // Asegurar que la etiqueta siempre esté visible
                drawTime: 'afterDatasetsDraw',
                z: 100, // Alto valor de z-index para asegurar que esté por encima de todo
                position: {
                    y: 'top' // Forzar la posición en la parte superior
                }
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
                    text: 'Lluvia y Riego (mm)'
                },
                grid: {
                    drawOnChartArea: false
                },
                // Asegurar que haya suficiente espacio en la parte superior para las etiquetas
                suggestedMax: function(context) {
                    if (simulationData && simulationData.aguaUtil) {
                        const maxValue = Math.max(
                            ...simulationData.aguaUtil.filter(val => val !== null && !isNaN(val)),
                            ...simulationData.aguaUtilProyectada.filter(val => val !== null && !isNaN(val))
                        );
                        return maxValue * 1.2; // 20% extra de espacio arriba
                    }
                    return undefined;
                }
            },
            y1: {
                position: 'right',
                title: {
                    display: true,
                    text: 'Agua Útil (mm)'
                },
                grid: {
                    drawOnChartArea: false
                },
                // Asegurar que haya suficiente espacio en la parte superior para las etiquetas
                suggestedMax: function(context) {
                    if (simulationData && simulationData.aguaUtil) {
                        const maxValue = Math.max(
                            ...simulationData.aguaUtil.filter(val => val !== null && !isNaN(val)),
                            ...simulationData.aguaUtilProyectada.filter(val => val !== null && !isNaN(val))
                        );
                        return maxValue * 1.2; // 20% extra de espacio arriba
                    }
                    return undefined;
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
            },
            annotation: {
                drawTime: 'afterDraw', // Asegurar que las anotaciones se dibujen después de todos los elementos
                common: {
                    drawTime: 'afterDraw'
                },
                annotations: getEstadosFenologicosAnnotations()
            }
        },
        layout: {
            padding: {
                top: 30
            }
        }
    };

    const chartData = simulationData ? {
        labels: [
            ...(simulationData.fechas || []).filter(date => isValidDate(date)),
            ...(simulationData.fechasProyeccion || []).filter(date => isValidDate(date))
        ],
        datasets: [
            {
                type: 'bar',
                label: 'Lluvias',
                data: simulationData.lluvias || [],
                backgroundColor: 'rgb(81, 175, 238)',
                order: 1
            },
            {
                type: 'bar',
                label: 'Riego',
                data: simulationData.riego,
                backgroundColor: 'rgb(76, 0, 255)',
                order: 2
            },
            {
                type: 'line',
                label: 'Agua Útil',
                data: [...simulationData.aguaUtil, ...new Array(simulationData.fechasProyeccion.length).fill(null)],
                borderColor: 'rgb(15, 18, 139)',
                borderWidth: 2,
                fill: false,
                tension: 0.1,
                order: 0,
                yAxisID: 'y1'
            },
            {
                type: 'line',
                label: 'Agua Útil Proyectada',
                data: [...new Array(simulationData.fechas.length).fill(null), ...simulationData.aguaUtilProyectada],
                borderColor: 'rgba(15, 17, 139, 0.5)',
                borderWidth: 2,
                borderDash: [5, 5],
                fill: false,
                tension: 0.1,
                order: 0,
                yAxisID: 'y1'
            },
            {
                type: 'line',
                label: `Agua Útil Umbral`,
                // Ahora usamos directamente el array completo de umbrales
                data: simulationData.aguaUtilUmbral,
                borderColor: 'rgb(214, 0, 0)',
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
                color='#3FA9F5'
            />
        </Grid>
    ) : null;

    if (chartData && simulationData.estadosFenologicos) {
        chartOptions.plugins.annotation = {
            annotations: getEstadosFenologicosAnnotations()
        };
    }

    return (
        <Container maxWidth="lg">
            <Typography variant="h4" gutterBottom sx={{ my: 4, fontWeight: 'bold', color: theme.palette.primary.main }}>
                Balance Hídrico
            </Typography>
            
            <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
            <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4} lg={4.5}>
                <FormControl fullWidth>
                <InputLabel label="Campo" variant="outlined">Campo</InputLabel>
                <Select
                    value={selectedCampo}
                    onChange={handleCampoChange}
                    label="Campo"
                >
                    <MenuItem value=""><em>Seleccione un campo</em></MenuItem>
                    {campos.map(campo => (
                    <MenuItem key={campo.id} value={campo.id}>{campo.nombre_campo}</MenuItem>
                    ))}
                </Select>
                </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3} lg={3}>
                <FormControl fullWidth>
                <InputLabel>Lote</InputLabel>
                <Select 
                    value={selectedLote} 
                    onChange={handleLoteChange}
                    disabled={!selectedCampo}
                    label="Lote"
                >
                    <MenuItem value=""><em>Seleccione un lote</em></MenuItem>
                    {lotes.map(lote => (
                    <MenuItem key={lote.id} value={lote.id}>{lote.nombre_lote}</MenuItem>
                    ))}
                </Select>
                </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={2} lg={1.5}>
                <FormControl fullWidth>
                <InputLabel>Campaña</InputLabel>
                <Select 
                    value={selectedCampaña} 
                    onChange={handleCampañaChange}
                    disabled={!selectedLote}
                    label="Campaña"
                >
                    {campañas.map((campaña) => (
                    <MenuItem key={campaña} value={campaña}>{campaña}</MenuItem>
                    ))}
                </Select>
                </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6} md={3} lg={3}>
                <FormControl fullWidth>
                <InputLabel>Cultivo</InputLabel>
                <Select 
                    value={selectedCultivo} 
                    onChange={handleCultivoChange}
                    disabled={!selectedCampaña}
                    label="Cultivo"
                >
                    <MenuItem value=""><em>Seleccione un cultivo</em></MenuItem>
                    {cultivos.map((cultivo) => (
                    <MenuItem key={cultivo.id} value={cultivo.especie}>{cultivo.especie}</MenuItem>
                    ))}
                </Select>
                </FormControl>
            </Grid>
            </Grid>
                {isAdmin && (
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={() => downloadCSV(simulationData)}
                                startIcon={<DownloadIcon />}
                                size="small"
                            >
                                Descargar CSV
                            </Button>
                            <Button 
                                variant="contained" 
                                color="primary" 
                                onClick={handleForzarActualizacion}
                                >
                                Forzar Actualización Diaria
                            </Button>
                            <Button 
                                variant="contained" 
                                color="primary" 
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
                <Grid item xs={6} md={3}>
                    <Widget 
                        title="Cultivo" 
                        value={simulationData.cultivo} 
                        unit="" 
                        icon="grass"
                        small
                        />
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <Widget 
                            title="Variedad" 
                            value={simulationData.variedad} 
                            unit="" 
                            icon="grass"
                            small
                            />
                    </Grid>
                    <Grid item xs={6} md={3}>
                    <Widget 
                        title="Fecha de Siembra" 
                        value={formatDate(simulationData.fechaSiembra)} 
                        unit="" 
                        icon="calendar"
                        small
                        />
                    </Grid>
                    <Grid item xs={6} md={3}>
                    <Widget 
                        title="Estado Fenológico" 
                        value={simulationData.estadoFenologico} 
                        unit="" 
                        icon="grass"
                        small
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
                            <Box display="flex" alignItems="center" mb={2}>
                                <WaterDrop style={{ color: '#3FA9F5' }} />
                                <Typography variant="h6" color="primary" style={{ marginLeft: '10px' }}>
                                    Agua Útil Inicial
                                </Typography>
                            </Box>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography variant="body1" color="text.secondary">1 Metro</Typography>
                                    <Typography variant="h5">{formatNumber(simulationData.auInicial1m)} mm</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body1" color="text.secondary">2 Metros</Typography>
                                    <Typography variant="h5">{formatNumber(simulationData.auInicial2m)} mm</Typography>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                    <Widget 
                        title=" Lluvias Efectiva Acumuladas" 
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
                            title="%AU Zona Radicular" 
                            value={
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center',
                                    justifyContent: 'center', 
                                    gap: 2,
                                    '& .gauge': { flexShrink: 0 },
                                    '& .value': { 
                                        fontSize: '1.2rem',
                                        opacity: 0.7,
                                        marginLeft: 2
                                    }
                                }}>
                                    <div className="gauge">
                                        <GaugeIndicator percentage={simulationData.porcentajeAguaUtil} size={80} />
                                    </div>
                                    <span className="value">
                                        {formatNumber(simulationData.aguaUtil[simulationData.aguaUtil.length - 1])}mm
                                    </span>
                                </Box>
                            }
                            icon="waterDrop"
                            color='#3FA9F5'
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
                            <Box display="flex" alignItems="center" mb={2}>
                                <WaterDrop style={{ color: '#3FA9F5' }} />
                                <Typography variant="h6" color="primary" style={{ marginLeft: '10px' }}>
                                    % Agua Útil
                                </Typography>
                            </Box>
                            <Grid container spacing={2} justifyContent="center">
                                <Grid item xs={6} sx={{ textAlign: 'center' }}>
                                    <Typography variant="body1" color="text.secondary">1 Metro</Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
                                        <GaugeIndicator 
                                            percentage={formatNumber(simulationData.porcentajeAu1m)} 
                                            size={60}
                                        />
                                    </Box>
                                    <Typography variant="body1" fontWeight="medium">
                                    {formatNumber(simulationData.aguaUtil1m[simulationData.aguaUtil1m.length - 1])} mm
                                    </Typography>
                                </Grid>
                                <Grid item xs={6} sx={{ textAlign: 'center' }}>
                                    <Typography variant="body1" color="text.secondary">2 Metros</Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
                                        <GaugeIndicator 
                                            percentage={formatNumber(simulationData.porcentajeAu2m)} 
                                            size={60}
                                        />
                                    </Box>
                                    <Typography variant="body1" fontWeight="medium">
                                    {formatNumber(simulationData.aguaUtil2m[simulationData.aguaUtil2m.length - 1])} mm
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
                            <Box display="flex" alignItems="center" mb={2}>
                                <WaterDrop style={{ color: '#3FA9F5' }} />
                                <Typography variant="h6" color="primary" style={{ marginLeft: '10px' }}>
                                    Proyección AU 7 días
                                </Typography>
                            </Box>
                            <Grid container spacing={2} justifyContent="center">
                                <Grid item xs={6} sx={{ textAlign: 'center' }}>
                                    <Typography variant="body1" color="text.secondary">1 Metro</Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
                                        <GaugeIndicator 
                                            percentage={formatNumber(simulationData.porcentajeProyectado || 0)}
                                            size={60}
                                        />
                                    </Box>
                                    <Typography variant="body1" fontWeight="medium">
                                        {formatNumber(simulationData.proyeccionAU1mDia8 || simulationData.proyeccionAU10Dias)} mm
                                    </Typography>
                                </Grid>
                                <Grid item xs={6} sx={{ textAlign: 'center' }}>
                                    <Typography variant="body1" color="text.secondary">2 Metros</Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
                                        <GaugeIndicator 
                                            percentage={formatNumber(simulationData.porcentajeProyectado2m || 0)}
                                            size={60}
                                        />
                                    </Box>
                                    <Typography variant="body1" fontWeight="medium">
                                        {formatNumber(simulationData.proyeccionAU2mDia8 || simulationData.proyeccionAU10Dias)} mm
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>
                </Grid>

                <Typography variant="body2" align="right" sx={{ mb: 2, fontStyle: 'italic' }}>
                    Profundidad estratos: {simulationData.estratosDisponibles ? 
                        `${formatNumber(simulationData.estratosDisponibles[simulationData.estratosDisponibles.length - 1] * 20)}cm` : '0cm'} - 
                    % Agua Util Umbral: {formatNumber(simulationData.porcentajeAguaUtilUmbral)}% - 
                    Última actualización: {formatDate(simulationData.fechaActualizacion)}
                </Typography>
                
                <Paper elevation={3} sx={{ p: 2, height: isMobile ? '300px' : '400px' }}>
                    <div id="balance-chart" data-testid="balance-chart">
                        {chartData && <Chart type="bar" data={chartData} options={chartOptions} />}
                    </div>
                </Paper>
                {simulationData && isAdmin && (
                <Paper elevation={3} sx={{ p: 2, height: isMobile ? '300px' : '400px' }}>
                        <ObservacionesSection 
                            loteId={selectedLote} 
                            campaña={selectedCampaña} 
                        />
                </Paper>
                )}
                </>
            )}
            
            <CorreccionDiasDialog 
                    open={openCorreccionDialog} 
                    onClose={() => setOpenCorreccionDialog(false)}
                    selectedLote={selectedLote}
                    selectedCampaña={selectedCampaña}
                />
            </Container>
    );
}

export default Simulations;
