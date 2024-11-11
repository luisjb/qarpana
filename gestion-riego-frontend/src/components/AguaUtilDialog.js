import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, FormControl, InputLabel, Select, MenuItem, Grid
} from '@mui/material';
import axios from '../axiosConfig';


function AguaUtilDialog({ open, onClose, loteId, onSave }) {
    const [profundidad, setProfundidad] = useState('1');
    const [aguaUtil, setAguaUtil] = useState(Array(5).fill(''));

    useEffect(() => {
        if (loteId && open) {
            fetchAguaUtil();
        }
    }, [loteId, open]);


    const fetchAguaUtil = async () => {
        try {
            const response = await axios.get(`/agua-util-inicial/${loteId}`);
            if (response.data && response.data.length > 0) {
                setAguaUtil(response.data.map(au => au.valor));
                setProfundidad(response.data.length === 10 ? '2' : '1');
            }
        } catch (error) {
            console.error('Error al obtener agua útil:', error);
        }
    };

    const handleProfundidadChange = (event) => {
        const newProfundidad = event.target.value;
        setProfundidad(newProfundidad);
        setAguaUtil(Array(newProfundidad === '1' ? 5 : 10).fill(''));
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
                valor: parseFloat(valor)
            }));
            await axios.post(`/agua-util-inicial/${loteId}`, { agua_util_inicial: aguaUtilData });
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
                <FormControl fullWidth margin="normal">
                    <InputLabel>Profundidad</InputLabel>
                    <Select value={profundidad} onChange={handleProfundidadChange}>
                        <MenuItem value="1">1 metro (5 estratos)</MenuItem>
                        <MenuItem value="2">2 metros (10 estratos)</MenuItem>
                    </Select>
                </FormControl>
                <Grid container spacing={2}>
                    {aguaUtil.map((valor, index) => (
                        <Grid item xs={12} sm={6} key={index}>
                            <TextField
                                fullWidth
                                label={`Estrato ${index + 1} (${index * 20}-${(index + 1) * 20}cm)`}
                                type="number"
                                value={valor}
                                onChange={(e) => handleAguaUtilChange(index, e.target.value)}
                                margin="normal"
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