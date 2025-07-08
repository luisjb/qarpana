import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    TextField,
    CircularProgress,
    Typography
} from '@mui/material';
import axios from '../axiosConfig';

function CorreccionDiasDialog({ open, onClose, selectedLote, selectedCampaña }) {
    const [cultivo, setCultivo] = useState(null);
    const [coeficientes, setCoeficientes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [cambiosRealizados, setCambiosRealizados] = useState(false);


    useEffect(() => {
        if (open && selectedLote && selectedCampaña) {
            fetchCultivo();
        }
    }, [open, selectedLote, selectedCampaña]);

    const fetchCultivo = async () => {
        setLoading(true);
        setError(null);
        setCambiosRealizados(false);

        try {
            const response = await axios.get(`/lotes/${selectedLote}/cultivo`, {
                params: { campaña: selectedCampaña }
            });
            setCultivo(response.data);
            if (response.data && response.data.cultivo_id) {
                await fetchCoeficientesPorLote(selectedLote);
            } else {
                setError('No se encontró un cultivo para el lote y campaña seleccionados.');
            }
        } catch (error) {
            console.error('Error al obtener cultivo:', error);
            setError('Error al obtener el cultivo. Por favor, intente de nuevo.');
            setCultivo(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchCoeficientesPorLote = async (loteId) => {
        try {
            const response = await axios.get(`/coeficiente-cultivo/lote/${loteId}`);
            setCoeficientes(response.data);
        } catch (error) {
            console.error('Error al obtener coeficientes por lote:', error);
            setError('Error al obtener los coeficientes. Por favor, intente de nuevo.');
            setCoeficientes([]);
        }
    };

    const handleDiasCorreccionChange = (index, value) => {
        const updatedCoeficientes = [...coeficientes];
        updatedCoeficientes[index].dias_correccion_lote = value === '' ? null : parseInt(value);
        setCoeficientes(updatedCoeficientes);
        setCambiosRealizados(true);

    };

    const handleRestoreAll = async () => {
        try {
            await axios.delete(`/coeficiente-cultivo/lote/${selectedLote}/restore-all`);
            
            // Actualizar el estado local
            const updatedCoeficientes = coeficientes.map(coef => ({
                ...coef,
                dias_correccion_lote: null
            }));
            setCoeficientes(updatedCoeficientes);
            setCambiosRealizados(true);
        } catch (error) {
            console.error('Error al restablecer todos los coeficientes:', error);
            setError('Error al restablecer los coeficientes. Por favor, intente de nuevo.');
        }
    };

    const handleRestoreIndividual = async (index) => {
        const coeficiente = coeficientes[index];
        try {
            await axios.delete(`/coeficiente-cultivo/lote/${selectedLote}/coeficiente/${coeficiente.id}`);
            
            // Actualizar el estado local
            const updatedCoeficientes = [...coeficientes];
            updatedCoeficientes[index].dias_correccion_lote = null;
            setCoeficientes(updatedCoeficientes);
            setCambiosRealizados(true);
        } catch (error) {
            console.error('Error al restablecer coeficiente:', error);
            setError('Error al restablecer el coeficiente. Por favor, intente de nuevo.');
        }
    };

    const handleSave = async () => {
        if (!selectedLote) {
            setError('No hay lote seleccionado');
            return;
        }

        try {
            await axios.post(`/coeficiente-cultivo/lote/${selectedLote}/update-dias-correccion`, {
                coeficientes: coeficientes.map(coef => ({
                    id: coef.id,
                    dias_correccion: coef.dias_correccion_lote
                }))
            });
            
            setCambiosRealizados(false);
            onClose();
        } catch (error) {
            console.error('Error al guardar los cambios:', error);
            setError('Error al guardar los cambios. Por favor, intente de nuevo.');
        }
    };

    const getDiasEfectivos = (coef) => {
        return coef.dias_correccion_lote !== null && coef.dias_correccion_lote !== undefined 
            ? coef.dias_correccion_lote 
            : coef.indice_dias;
    };

    if (!selectedLote || !selectedCampaña) {
        return (
            <Dialog open={open} onClose={onClose}>
                <DialogTitle>Error</DialogTitle>
                <DialogContent>
                    <Typography>Por favor, seleccione un lote y una campaña antes de abrir este diálogo.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cerrar</Button>
                </DialogActions>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>
                Corrección de Días - Lote {selectedLote}
                {cultivo && (
                    <Typography variant="subtitle1" color="textSecondary">
                        {cultivo.nombre_cultivo || cultivo.especie} - Campaña {selectedCampaña}
                    </Typography>
                )}
            </DialogTitle>
            <DialogContent>
                {loading ? (
                    <CircularProgress />
                ) : error ? (
                    <Typography color="error">{error}</Typography>
                ) : cultivo ? (
                    <>
                        <Typography variant="body2" color="textSecondary" gutterBottom>
                            Las correcciones realizadas aquí solo afectarán a este lote específico.
                        </Typography>
                        
                        {coeficientes.length > 0 ? (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Typography variant="h6">
                                        Coeficientes Kc por Etapa
                                    </Typography>
                                    <Button 
                                        startIcon={<RestoreIcon />}
                                        onClick={handleRestoreAll}
                                        variant="outlined"
                                        size="small"
                                    >
                                        Restablecer Todo
                                    </Button>
                                </div>
                                
                                <TableContainer component={Paper}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Etapa</TableCell>
                                                <TableCell>Kc</TableCell>
                                                <TableCell>Días Originales</TableCell>
                                                <TableCell>Días Corrección</TableCell>
                                                <TableCell>Días Efectivos</TableCell>
                                                <TableCell>Estado</TableCell>
                                                <TableCell>Acciones</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {coeficientes.map((coef, index) => (
                                                <TableRow key={coef.id}>
                                                    <TableCell>{`Etapa ${index + 1}`}</TableCell>
                                                    <TableCell>{coef.indice_kc}</TableCell>
                                                    <TableCell>{coef.indice_dias}</TableCell>
                                                    <TableCell>
                                                        <TextField
                                                            type="number"
                                                            value={coef.dias_correccion_lote || ''}
                                                            onChange={(e) => handleDiasCorreccionChange(index, e.target.value)}
                                                            placeholder={coef.indice_dias.toString()}
                                                            size="small"
                                                            fullWidth
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <strong>{getDiasEfectivos(coef)}</strong>
                                                    </TableCell>
                                                    <TableCell>
                                                        {coef.dias_correccion_lote !== null && coef.dias_correccion_lote !== undefined ? (
                                                            <Chip 
                                                                label="Modificado" 
                                                                color="warning" 
                                                                size="small" 
                                                            />
                                                        ) : (
                                                            <Chip 
                                                                label="Original" 
                                                                color="default" 
                                                                size="small" 
                                                            />
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {coef.dias_correccion_lote !== null && coef.dias_correccion_lote !== undefined && (
                                                            <Tooltip title="Restablecer a valor original">
                                                                <IconButton 
                                                                    size="small"
                                                                    onClick={() => handleRestoreIndividual(index)}
                                                                >
                                                                    <RestoreIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </>
                        ) : (
                            <Typography>No hay coeficientes disponibles para este cultivo.</Typography>
                        )}
                    </>
                ) : (
                    <Typography>No se encontró un cultivo para el lote y campaña seleccionados.</Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancelar</Button>
                <Button 
                    onClick={handleSave} 
                    color="primary" 
                    disabled={!cultivo || coeficientes.length === 0 || !cambiosRealizados}
                    variant="contained"
                >
                    Guardar Cambios
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default CorreccionDiasDialog;