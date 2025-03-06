import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, FormControlLabel, Checkbox, Grid
} from '@mui/material';
import axios from '../axiosConfig';

function AguaUtilDialog({ open, onClose, loteId, onSave }) {
    const [aguaUtil, setAguaUtil] = useState(Array(10).fill(''));
    const [utilizarUnMetro, setUtilizarUnMetro] = useState(false);

    useEffect(() => {
        if (loteId && open) {
            fetchAguaUtil();
        }
    }, [loteId, open]);

    const fetchAguaUtil = async () => {
        try {
            const response = await axios.get(`/agua-util-inicial/${loteId}`);
            if (response.data && response.data.length > 0) {
                const newAguaUtil = Array(10).fill('');
                response.data.forEach((au, index) => {
                    if (index < 10) {
                        newAguaUtil[index] = au.valor;
                    }
                });
                setAguaUtil(newAguaUtil);
            }
            const loteResponse = await axios.get(`/lotes/${loteId}`);
            if (loteResponse.data) {
                setUtilizarUnMetro(loteResponse.data.utilizar_un_metro || false);
            }
        } catch (error) {
            console.error('Error al obtener agua útil:', error);
        }
    };

    const handleAguaUtilChange = (index, value) => {
        const newAguaUtil = [...aguaUtil];
        newAguaUtil[index] = value;
        setAguaUtil(newAguaUtil);
    };

    const handleSave = async () => {
        try {
            const aguaUtilData = aguaUtil.map((valor, index) => ({
                estrato: index + 1,
                valor: parseFloat(valor) || 0 // Convertir a número y manejar valores vacíos
            }));
            await axios.post(`/agua-util-inicial/${loteId}`, { 
                agua_util_inicial: aguaUtilData,
                utilizar_un_metro: utilizarUnMetro 
            });            

            await axios.put(`/lotes/${loteId}`, { utilizar_un_metro: utilizarUnMetro });

            onSave();
            onClose();
        } catch (error) {
            console.error('Error al guardar agua útil:', error);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Agua Útil Inicial</DialogTitle>
            <DialogContent>
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={utilizarUnMetro}
                            onChange={(e) => setUtilizarUnMetro(e.target.checked)}
                        />
                    }
                    label="Utilizar agua útil a 1 metro"
                />
                <Grid container spacing={2}>
                    {aguaUtil.map((valor, index) => (
                        <Grid item xs={12} sm={6} key={index}>
                            <TextField
                                    fullWidth
                                    label={`Estrato ${index + 1} (${index * 20}-${(index + 1) * 20}cm)`}
                                    type="number"
                                    value={valor}
                                    onChange={(e) => handleAguaUtilChange(index, e.target.value)}
                                    variant="outlined"
                                    size="small"
                                    style={{ marginBottom: '10px' }}
                            />  
                        </Grid>
                    ))}
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancelar</Button>
                <Button onClick={handleSave} color="primary">Guardar</Button>
            </DialogActions>
        </Dialog>
    );
}

export default AguaUtilDialog;