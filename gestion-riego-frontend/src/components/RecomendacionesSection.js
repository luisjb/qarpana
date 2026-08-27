import React, { useState, useEffect, useRef } from 'react';
import {
    Paper, Typography, Box, TextField, Button, List, ListItem,
    ListItemText, IconButton, Divider, Grid, Dialog, DialogTitle,
    DialogContent, DialogActions, Tooltip, Chip, FormControl,
    InputLabel, Select, MenuItem
} from '@mui/material';
import {
    Delete, Edit, Add, Save, Cancel, Announcement,
    FormatBold, FormatItalic, FormatListBulleted
} from '@mui/icons-material';
import { format } from 'date-fns';
import axios from '../axiosConfig';

// Renderiza texto con formato markdown básico: **negrita**, *cursiva*, líneas con • o -
const MarkdownText = ({ text }) => {
    if (!text) return null;

    const parseLine = (line) => {
        const result = [];
        // **bold** tiene prioridad sobre *italic* gracias al orden del alternation
        const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
        let last = 0;
        let m;
        while ((m = regex.exec(line)) !== null) {
            if (m.index > last) result.push(line.slice(last, m.index));
            if (m[1] !== undefined) {
                result.push(<strong key={m.index}>{m[1]}</strong>);
            } else {
                result.push(<em key={m.index}>{m[2]}</em>);
            }
            last = m.index + m[0].length;
        }
        if (last < line.length) result.push(line.slice(last));
        return result.length > 0 ? result : [line];
    };

    return (
        <Box component="div" sx={{ lineHeight: 1.7 }}>
            {text.split('\n').map((line, idx) => {
                const isBullet = line.startsWith('• ') || line.startsWith('- ');
                const content = isBullet ? line.slice(2) : line;
                const parsed = parseLine(content);

                if (isBullet) {
                    return (
                        <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', ml: 1 }}>
                            <Box component="span" sx={{ mr: 1, flexShrink: 0, mt: '1px' }}>•</Box>
                            <Box component="span">{parsed}</Box>
                        </Box>
                    );
                }
                return (
                    <Box key={idx} component="p" sx={{ m: 0, minHeight: line ? 'auto' : '0.8em' }}>
                        {parsed}
                    </Box>
                );
            })}
        </Box>
    );
};

function RecomendacionesSection({ campoId, especies = [] }) {
    const [recomendaciones, setRecomendaciones] = useState([]);
    const [nuevaRecomendacion, setNuevaRecomendacion] = useState({
        fecha: format(new Date(), 'yyyy-MM-dd'),
        cultivo: '',
        texto: ''
    });
    const [editando, setEditando] = useState(null);
    const [mostrarFormulario, setMostrarFormulario] = useState(false);
    const [dialogoConfirmacion, setDialogoConfirmacion] = useState({ abierto: false, recomendacionId: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        if (campoId) fetchRecomendaciones();
    }, [campoId]);

    const fetchRecomendaciones = async () => {
        try {
            setLoading(true);
            const response = await axios.get(`/recomendaciones/campo/${campoId}`);
            setRecomendaciones(response.data);
            setError(null);
        } catch (err) {
            console.error('Error al obtener recomendaciones:', err);
            setError('Error al cargar las recomendaciones');
        } finally {
            setLoading(false);
        }
    };

    const getCurrentTexto = () => editando ? editando.texto : nuevaRecomendacion.texto;

    const setTexto = (newTexto) => {
        if (editando) setEditando(prev => ({ ...prev, texto: newTexto }));
        else setNuevaRecomendacion(prev => ({ ...prev, texto: newTexto }));
    };

    // Aplica formato wrapping al texto seleccionado o en posición del cursor
    const applyWrapFormat = (prefix, suffix = prefix) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const current = getCurrentTexto();
        const selected = current.substring(start, end);
        const newText = current.substring(0, start) + prefix + selected + suffix + current.substring(end);
        setTexto(newText);

        setTimeout(() => {
            const newPos = selected
                ? start + prefix.length + selected.length + suffix.length
                : start + prefix.length;
            textarea.setSelectionRange(newPos, newPos);
            textarea.focus();
        }, 0);
    };

    // Alterna bullet en la línea actual
    const applyBullet = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const current = getCurrentTexto();
        const lineStart = current.lastIndexOf('\n', start - 1) + 1;
        const lineContent = current.substring(lineStart);
        const bulletPrefix = '• ';

        if (lineContent.startsWith('• ') || lineContent.startsWith('- ')) {
            const existing = lineContent.startsWith('• ') ? '• ' : '- ';
            setTexto(current.substring(0, lineStart) + current.substring(lineStart + existing.length));
        } else {
            setTexto(current.substring(0, lineStart) + bulletPrefix + current.substring(lineStart));
            setTimeout(() => {
                textarea.setSelectionRange(start + bulletPrefix.length, start + bulletPrefix.length);
                textarea.focus();
            }, 0);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (editando) setEditando(prev => ({ ...prev, [name]: value }));
        else setNuevaRecomendacion(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            if (editando) {
                await axios.put(`/recomendaciones/${editando.id}`, {
                    fecha: editando.fecha,
                    cultivo: editando.cultivo,
                    texto: editando.texto
                });
                setEditando(null);
            } else {
                await axios.post('/recomendaciones', {
                    campo_id: campoId,
                    fecha: nuevaRecomendacion.fecha,
                    cultivo: nuevaRecomendacion.cultivo,
                    texto: nuevaRecomendacion.texto
                });
                setNuevaRecomendacion({ fecha: format(new Date(), 'yyyy-MM-dd'), cultivo: '', texto: '' });
                setMostrarFormulario(false);
            }
            fetchRecomendaciones();
        } catch (err) {
            console.error('Error al guardar recomendación:', err);
            setError('Error al guardar la recomendación');
        } finally {
            setLoading(false);
        }
    };

    const handleEditClick = (rec) => {
        setEditando({
            id: rec.id,
            // substring(0,10) evita la conversión de timezone de parseISO
            // que en UTC-3 convierte el midnight UTC al día anterior
            fecha: rec.fecha.substring(0, 10),
            cultivo: rec.cultivo || '',
            texto: rec.texto
        });
        setMostrarFormulario(true);
    };

    const handleDeleteClick = (id) => setDialogoConfirmacion({ abierto: true, recomendacionId: id });

    const confirmarEliminacion = async () => {
        try {
            setLoading(true);
            await axios.delete(`/recomendaciones/${dialogoConfirmacion.recomendacionId}`);
            fetchRecomendaciones();
        } catch (err) {
            console.error('Error al eliminar recomendación:', err);
            setError('Error al eliminar la recomendación');
        } finally {
            setLoading(false);
            setDialogoConfirmacion({ abierto: false, recomendacionId: null });
        }
    };

    const cancelarEdicion = () => {
        setEditando(null);
        if (recomendaciones.length === 0) setMostrarFormulario(false);
    };

    const formatDate = (dateString) => {
        try {
            // Tomar solo la parte YYYY-MM-DD antes de parsear, evita desfase de timezone
            const [year, month, day] = dateString.substring(0, 10).split('-');
            return `${day}/${month}/${year}`;
        } catch { return dateString; }
    };

    const currentCultivo = editando ? editando.cultivo : nuevaRecomendacion.cultivo;
    const currentTexto = editando ? editando.texto : nuevaRecomendacion.texto;

    return (
        <Paper elevation={3} sx={{ p: 3, mt: 4 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Box display="flex" alignItems="center">
                    <Announcement sx={{ color: 'primary.main', mr: 1 }} />
                    <Typography variant="h6" color="primary">Recomendaciones del Campo</Typography>
                </Box>
                {!mostrarFormulario && (
                    <Button variant="contained" color="primary" startIcon={<Add />} onClick={() => setMostrarFormulario(true)}>
                        Nueva Recomendación
                    </Button>
                )}
            </Box>

            {mostrarFormulario && (
                <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Grid container spacing={2}>
                        {/* Columna izquierda: Fecha encima de Cultivo */}
                        <Grid item xs={12} md={4}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <TextField
                                    fullWidth label="Fecha" type="date" name="fecha"
                                    value={editando ? editando.fecha : nuevaRecomendacion.fecha}
                                    onChange={handleInputChange}
                                    InputLabelProps={{ shrink: true }} required
                                />
                                <FormControl fullWidth>
                                    <InputLabel>Cultivo</InputLabel>
                                    <Select name="cultivo" value={currentCultivo} onChange={handleInputChange} label="Cultivo">
                                        <MenuItem value=""><em>General (todos los cultivos)</em></MenuItem>
                                        {especies.map(esp => (
                                            <MenuItem key={esp} value={esp}>{esp}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>
                        </Grid>
                        {/* Columna derecha: toolbar + textarea */}
                        <Grid item xs={12} md={8}>
                            {/* Barra de formato */}
                            <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                                <Tooltip title="Negrita — seleccioná texto y hacé clic">
                                    <IconButton size="small" onClick={() => applyWrapFormat('**')}
                                        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5 }}>
                                        <FormatBold fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Cursiva — seleccioná texto y hacé clic">
                                    <IconButton size="small" onClick={() => applyWrapFormat('*')}
                                        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5 }}>
                                        <FormatItalic fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Ítem de lista — activa/desactiva en la línea actual">
                                    <IconButton size="small" onClick={applyBullet}
                                        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.5 }}>
                                        <FormatListBulleted fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                            <TextField
                                fullWidth label="Recomendación" name="texto"
                                value={currentTexto}
                                onChange={handleInputChange}
                                multiline rows={5} required
                                inputRef={textareaRef}
                                inputProps={{ style: { fontFamily: 'inherit', lineHeight: 1.7, fontSize: '0.95rem' } }}
                                helperText="** negrita **   * cursiva *   • lista"
                            />
                        </Grid>
                    </Grid>
                    <Box display="flex" justifyContent="flex-end" mt={2} gap={1}>
                        <Button variant="outlined" color="secondary" onClick={cancelarEdicion} startIcon={<Cancel />}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="contained" color="primary" startIcon={<Save />} disabled={loading}>
                            {editando ? 'Actualizar' : 'Guardar'}
                        </Button>
                    </Box>
                </Box>
            )}

            {error && <Typography color="error" sx={{ my: 2 }}>{error}</Typography>}

            {recomendaciones.length > 0 ? (
                <List disablePadding>
                    {recomendaciones.map((rec) => (
                        <React.Fragment key={rec.id}>
                            <ListItem alignItems="flex-start" sx={{ px: 0, py: 1.5 }}
                                secondaryAction={
                                    <Box sx={{ display: 'flex' }}>
                                        <Tooltip title="Editar">
                                            <IconButton edge="end" onClick={() => handleEditClick(rec)} sx={{ mr: 0.5 }}>
                                                <Edit />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Eliminar">
                                            <IconButton edge="end" onClick={() => handleDeleteClick(rec.id)} color="error">
                                                <Delete />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                }
                            >
                                <ListItemText
                                    primary={
                                        <Box display="flex" alignItems="center" flexWrap="wrap" gap={1} pr={12}>
                                            <Typography variant="subtitle2" component="span" sx={{ fontWeight: 'bold' }}>
                                                {formatDate(rec.fecha)}
                                            </Typography>
                                            {rec.cultivo && (
                                                <Chip label={rec.cultivo} size="small" color="primary" variant="outlined"
                                                    sx={{ fontWeight: 600, fontSize: '0.72rem' }} />
                                            )}
                                            <Typography variant="caption" color="text.secondary" component="span">
                                                {rec.usuario || 'Usuario'}
                                            </Typography>
                                        </Box>
                                    }
                                    secondary={
                                        <Box sx={{ mt: 0.5, pr: 12 }}>
                                            <MarkdownText text={rec.texto} />
                                        </Box>
                                    }
                                />
                            </ListItem>
                            <Divider component="li" />
                        </React.Fragment>
                    ))}
                </List>
            ) : (
                <Typography variant="body1" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                    No hay recomendaciones registradas para este campo
                </Typography>
            )}

            <Dialog open={dialogoConfirmacion.abierto}
                onClose={() => setDialogoConfirmacion({ abierto: false, recomendacionId: null })}>
                <DialogTitle>Confirmar eliminación</DialogTitle>
                <DialogContent>
                    <Typography>¿Está seguro de que desea eliminar esta recomendación? Esta acción no se puede deshacer.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogoConfirmacion({ abierto: false, recomendacionId: null })} color="primary">
                        Cancelar
                    </Button>
                    <Button onClick={confirmarEliminacion} color="error" variant="contained" autoFocus>
                        Eliminar
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

export default RecomendacionesSection;
