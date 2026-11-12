import React, { useState, useEffect } from 'react';
import axios from '../axiosConfig';
import {
    Box, Typography, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, TextField, IconButton, Button,
    Collapse, Divider, Tooltip, CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

function FenologiaDefaultPanel() {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState({});   // { especie: [{id, etapa, dias, grados_dias, orden}] }
    const [dirty, setDirty] = useState({}); // { especie: true }
    const [saving, setSaving] = useState({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && Object.keys(data).length === 0) fetchData();
    }, [open]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/fenologia-default');
            const grouped = {};
            for (const row of res.data) {
                if (!grouped[row.especie]) grouped[row.especie] = [];
                grouped[row.especie].push({ ...row, grados_dias: parseFloat(row.grados_dias) });
            }
            setData(grouped);
        } catch (err) {
            console.error('Error al cargar fenología por defecto:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (especie, index, field, value) => {
        setData(prev => {
            const updated = [...prev[especie]];
            updated[index] = { ...updated[index], [field]: value };
            return { ...prev, [especie]: updated };
        });
        setDirty(prev => ({ ...prev, [especie]: true }));
    };

    const handleAddRow = (especie) => {
        setData(prev => {
            const rows = prev[especie] || [];
            const nextOrden = rows.length > 0 ? Math.max(...rows.map(r => r.orden)) + 1 : 1;
            return { ...prev, [especie]: [...rows, { etapa: '', dias: '', grados_dias: '', orden: nextOrden }] };
        });
        setDirty(prev => ({ ...prev, [especie]: true }));
    };

    const handleRemoveRow = (especie, index) => {
        setData(prev => {
            const updated = prev[especie].filter((_, i) => i !== index);
            return { ...prev, [especie]: updated };
        });
        setDirty(prev => ({ ...prev, [especie]: true }));
    };

    const handleSave = async (especie) => {
        setSaving(prev => ({ ...prev, [especie]: true }));
        try {
            const etapas = data[especie]
                .filter(e => e.etapa && e.dias !== '' && e.grados_dias !== '')
                .map((e, i) => ({ ...e, orden: i + 1 }));
            await axios.put(`/fenologia-default/${encodeURIComponent(especie)}`, { etapas });
            setDirty(prev => ({ ...prev, [especie]: false }));
            await fetchData();
        } catch (err) {
            console.error('Error al guardar fenología:', err);
        } finally {
            setSaving(prev => ({ ...prev, [especie]: false }));
        }
    };

    const totalGDD = (especie) =>
        (data[especie] || []).reduce((sum, e) => sum + (parseFloat(e.grados_dias) || 0), 0);

    const especies = Object.keys(data).sort();

    return (
        <Box sx={{ mb: 3 }}>
            <Button
                variant="outlined"
                size="small"
                startIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={() => setOpen(v => !v)}
                sx={{ mb: 1 }}
            >
                Fenología por Defecto por Cultivo
            </Button>

            <Collapse in={open}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                    {loading && <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>}

                    {!loading && especies.map((especie, idx) => (
                        <Box key={especie} sx={{ mb: 3 }}>
                            {idx > 0 && <Divider sx={{ mb: 2 }} />}
                            <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                                <Typography variant="subtitle2" fontWeight={700} color="primary">
                                    {especie}
                                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                        — Total: {totalGDD(especie).toFixed(0)} °días
                                    </Typography>
                                </Typography>
                                <Box display="flex" gap={1}>
                                    <Tooltip title="Agregar etapa">
                                        <IconButton size="small" onClick={() => handleAddRow(especie)}>
                                            <AddIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Button
                                        size="small"
                                        variant="contained"
                                        startIcon={saving[especie] ? <CircularProgress size={14} color="inherit" /> : <SaveIcon fontSize="small" />}
                                        onClick={() => handleSave(especie)}
                                        disabled={!dirty[especie] || saving[especie]}
                                        color={dirty[especie] ? 'primary' : 'inherit'}
                                    >
                                        Guardar
                                    </Button>
                                </Box>
                            </Box>

                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 600, width: '45%' }}>Etapa</TableCell>
                                            <TableCell sx={{ fontWeight: 600, width: '20%' }}>Días acum.</TableCell>
                                            <TableCell sx={{ fontWeight: 600, width: '20%' }}>°Días etapa</TableCell>
                                            <TableCell sx={{ width: '15%' }} />
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {(data[especie] || []).map((row, i) => (
                                            <TableRow key={i} hover>
                                                <TableCell>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        variant="standard"
                                                        value={row.etapa}
                                                        onChange={e => handleChange(especie, i, 'etapa', e.target.value)}
                                                        placeholder="Nombre de etapa"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        size="small"
                                                        variant="standard"
                                                        type="number"
                                                        value={row.dias}
                                                        onChange={e => handleChange(especie, i, 'dias', e.target.value)}
                                                        inputProps={{ min: 0, style: { textAlign: 'right' } }}
                                                        sx={{ width: 70 }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <TextField
                                                        size="small"
                                                        variant="standard"
                                                        type="number"
                                                        value={row.grados_dias}
                                                        onChange={e => handleChange(especie, i, 'grados_dias', e.target.value)}
                                                        inputProps={{ min: 0, style: { textAlign: 'right' } }}
                                                        sx={{ width: 70 }}
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleRemoveRow(especie, i)}
                                                        disabled={(data[especie] || []).length <= 1}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow>
                                            <TableCell colSpan={2} sx={{ border: 0 }} />
                                            <TableCell sx={{ fontWeight: 700, border: 0, textAlign: 'right', pr: 1 }}>
                                                {totalGDD(especie).toFixed(0)}
                                            </TableCell>
                                            <TableCell sx={{ border: 0 }} />
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    ))}
                </Paper>
            </Collapse>
        </Box>
    );
}

export default FenologiaDefaultPanel;
