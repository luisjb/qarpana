import React, { useState, useEffect } from 'react';
import axios from '../axiosConfig';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Grid, Typography, IconButton
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';

function EstadoFenologicoDialog({ open, onClose, loteId, cultivoNombre, onSave }) {
    const [estados, setEstados] = useState([{ nombre: '', dias: '' }]);
    const [isEditing, setIsEditing] = useState(false);

    useEffect(() => {
        console.log('EstadoFenologicoDialog useEffect - loteId:', loteId, 'open:', open);
        if (loteId && open) {
            fetchEstadosFenologicos();
        } else if (open && !loteId) {
            console.error('Dialog opened but loteId is undefined');
            setEstados([{ nombre: '', dias: '' }]);
            setIsEditing(false);
        }
    }, [loteId, open]);

    const fetchEstadosFenologicos = async () => {
        if (!loteId) {
            console.error('fetchEstadosFenologicos - loteId is undefined');
            return;
        }
        try {
            console.log('Fetching estados fenológicos for loteId:', loteId);
            const response = await axios.get(`/estados-fenologicos/lote/${loteId}`);
            console.log('Fetched estados fenológicos:', response.data);
            if (response.data.length > 0) {
                setEstados(response.data.map(estado => ({
                    id: estado.id,
                    nombre: estado.fenologia,
                    dias: estado.dias
                })));
                setIsEditing(true);
            } else {
                setEstados([{ nombre: '', dias: '' }]);
                setIsEditing(false);
            }
        } catch (error) {
            console.error('Error al obtener estados fenológicos:', error);
            setEstados([{ nombre: '', dias: '' }]);
            setIsEditing(false);
        }
    };

    const handleChange = (index, field, value) => {
        const newEstados = [...estados];
        newEstados[index][field] = value;
        setEstados(newEstados);
    };

    const handleAddEstado = () => {
        setEstados([...estados, { nombre: '', dias: '' }]);
    };

    const handleRemoveEstado = (index) => {
        if (estados.length > 1) {
            console.log("Removiendo estado en índice:", index);
            const newEstados = estados.filter((_, i) => i !== index);
            setEstados(newEstados);
        }
    };


    const handleSave = async () => {
        if (!loteId) {
            console.error('Cannot save: loteId is undefined');
            return;
        }
        try {
            const estadosToSave = estados.filter(estado => estado.nombre && estado.dias);
            console.log('Saving estados for loteId:', loteId, 'Estados:', estadosToSave);
            if (isEditing) {
                await axios.put(`/estados-fenologicos/lote/${loteId}`, { estados: estadosToSave });
            } else {
                await axios.post(`/estados-fenologicos/lote/${loteId}`, { estados: estadosToSave });
            }
            console.log('Estados fenológicos saved successfully');
            onSave();
        } catch (error) {
            console.error('Error al guardar estados fenológicos:', error);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                Estados Fenológicos - {cultivoNombre}
                {isEditing ? " (Actualizar)" : " (Agregar)"}
                
            </DialogTitle>
            <DialogContent>
                {!loteId ? (
                    <Typography color="error">Error: ID de lote no definido</Typography>
                ) : (
                    <Grid container spacing={2} paddingTop={5}>
                        {estados.map((estado, index) => (
                            <Grid item xs={12} key={index} container alignItems="center" spacing={1}>
                                <Grid item xs={5}>
                                    <TextField
                                        fullWidth
                                        label="Nombre del estado"
                                        value={estado.nombre}
                                        onChange={(e) => handleChange(index, 'nombre', e.target.value)}
                                        required
                                    />
                                </Grid>
                                <Grid item xs={5}>
                                    <TextField
                                        fullWidth
                                        marginTop='10'
                                        label="Días Hasta"
                                        type="number"
                                        value={estado.dias}
                                        onChange={(e) => handleChange(index, 'dias', e.target.value)}
                                        required
                                    />
                                </Grid>
                                <Grid item xs={2}>
                                    <IconButton onClick={() => handleRemoveEstado(index)} color="error" disabled={estados.length === 1}>
                                        <DeleteIcon />
                                    </IconButton>
                                </Grid>
                            </Grid>
                        ))}
                    </Grid>
                )}
                <Button
                    startIcon={<AddIcon />}
                    onClick={handleAddEstado}
                    style={{ marginTop: '20px' }}
                    variant="contained"
                    color="primary"
                >
                    Agregar Estado
                </Button>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancelar</Button>
                <Button 
                    onClick={handleSave} 
                    color="primary" 
                    disabled={!loteId || estados.every(estado => !estado.nombre && !estado.dias)}
                >
                    {isEditing ? "Actualizar" : "Guardar"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default EstadoFenologicoDialog;