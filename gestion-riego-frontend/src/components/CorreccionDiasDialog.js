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

    useEffect(() => {
        if (open && selectedLote && selectedCampaña) {
            fetchCultivo();
        }
    }, [open, selectedLote, selectedCampaña]);

    const fetchCultivo = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`/lotes/${selectedLote}/cultivo`, {
                params: { campaña: selectedCampaña }
            });
            setCultivo(response.data);
            if (response.data && response.data.cultivo_id) {
                fetchCoeficientes(response.data.cultivo_id);
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

    const fetchCoeficientes = async (cultivoId) => {
        try {
            const response = await axios.get(`/coeficiente-cultivo/${cultivoId}`);
            setCoeficientes(response.data);
        } catch (error) {
            console.error('Error al obtener coeficientes:', error);
            setError('Error al obtener los coeficientes. Por favor, intente de nuevo.');
            setCoeficientes([]);
        }
    };

    const handleDiasCorreccionChange = (index, value) => {
        const updatedCoeficientes = [...coeficientes];
        updatedCoeficientes[index].dias_correccion = value;
        setCoeficientes(updatedCoeficientes);
    };

    const handleSave = async () => {
        if (!cultivo || !cultivo.cultivo_id) {
            setError('No hay cultivo seleccionado');
            return;
        }

        try {
            await axios.post('/coeficiente-cultivo/update-dias-correccion', {
                cultivoId: cultivo.cultivo_id,
                coeficientes: coeficientes
            });
            onClose();
        } catch (error) {
            console.error('Error al guardar los cambios:', error);
            setError('Error al guardar los cambios. Por favor, intente de nuevo.');
        }
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
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Corrección de Días</DialogTitle>
            <DialogContent>
                {loading ? (
                    <CircularProgress />
                ) : error ? (
                    <Typography color="error">{error}</Typography>
                ) : cultivo ? (
                    <>
                        <Typography variant="h6" gutterBottom>
                            Cultivo: {cultivo.nombre_cultivo || cultivo.especie}
                        </Typography>
                        {coeficientes.length > 0 ? (
                            <TableContainer component={Paper}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Etapa</TableCell>
                                            <TableCell>Días Originales</TableCell>
                                            <TableCell>Días Corrección</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {coeficientes.map((coef, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{`Etapa ${index + 1}`}</TableCell>
                                                <TableCell>{coef.indice_dias}</TableCell>
                                                <TableCell>
                                                    <TextField
                                                        type="number"
                                                        value={coef.dias_correccion || ''}
                                                        onChange={(e) => handleDiasCorreccionChange(index, e.target.value)}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
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
                <Button onClick={handleSave} color="primary" disabled={!cultivo || coeficientes.length === 0}>
                    Guardar
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default CorreccionDiasDialog;