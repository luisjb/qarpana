import React, { useState, useEffect } from 'react';
import axios from '../axiosConfig';
import {
    Box, Container, Typography, Button, IconButton, Chip,
    Dialog, DialogActions, DialogContent, DialogTitle,
    TextField, Select, MenuItem, FormControl, InputLabel,
    Grid, Card, CardContent, Avatar, Divider,
    InputAdornment, Alert, Snackbar, Tooltip
} from '@mui/material';
import {
    Edit, Delete, PersonAdd, Visibility, VisibilityOff,
    Email, Phone, Person, AdminPanelSettings, Badge, Notes
} from '@mui/icons-material';

const ROLE_CONFIG = {
    Admin: { label: 'Administrador', color: 'error', icon: <AdminPanelSettings fontSize="small" /> },
    user:  { label: 'Usuario',        color: 'primary', icon: <Person fontSize="small" /> },
    demo:  { label: 'Demo',           color: 'default', icon: <Badge fontSize="small" /> },
};

const EMPTY_FORM = {
    nombre_usuario: '', contraseña: '', tipo_usuario: 'user',
    nombre_completo: '', email: '', telefono: '', notas: ''
};

function getInitials(u) {
    if (u.nombre_completo) {
        const parts = u.nombre_completo.trim().split(' ');
        return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }
    return u.nombre_usuario.substring(0, 2).toUpperCase();
}

function avatarColor(name) {
    const colors = ['#2e7d32','#1565c0','#6a1b9a','#c62828','#e65100','#004d40','#283593'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
}

function UserManagement() {
    const [users, setUsers] = useState([]);
    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [editingId, setEditingId] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState({ open: false, user: null });
    const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
    const [errors, setErrors] = useState({});

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/usuarios');
            setUsers(res.data);
        } catch (err) {
            if (err.response?.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                window.location.href = '/login';
            }
        }
    };

    const openCreate = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setErrors({});
        setShowPassword(false);
        setFormOpen(true);
    };

    const openEdit = (user) => {
        setForm({
            nombre_usuario: user.nombre_usuario || '',
            contraseña: '',
            tipo_usuario: user.tipo_usuario || 'user',
            nombre_completo: user.nombre_completo || '',
            email: user.email || '',
            telefono: user.telefono || '',
            notas: user.notas || '',
        });
        setEditingId(user.id);
        setErrors({});
        setShowPassword(false);
        setFormOpen(true);
    };

    const validate = () => {
        const e = {};
        if (!form.nombre_usuario.trim()) e.nombre_usuario = 'Requerido';
        if (!editingId && !form.contraseña) e.contraseña = 'Requerido';
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email inválido';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        const payload = { ...form };
        if (!payload.contraseña) delete payload.contraseña;
        try {
            if (editingId) {
                await axios.put(`/usuarios/${editingId}`, payload);
                setSnack({ open: true, message: 'Usuario actualizado', severity: 'success' });
            } else {
                await axios.post('/usuarios', payload);
                setSnack({ open: true, message: 'Usuario creado', severity: 'success' });
            }
            setFormOpen(false);
            fetchUsers();
        } catch (err) {
            const msg = err.response?.data?.error || 'Error al guardar';
            setSnack({ open: true, message: msg, severity: 'error' });
        }
    };

    const handleDelete = async () => {
        try {
            await axios.delete(`/usuarios/${deleteDialog.user.id}`);
            setDeleteDialog({ open: false, user: null });
            setSnack({ open: true, message: 'Usuario eliminado', severity: 'success' });
            fetchUsers();
        } catch {
            setSnack({ open: true, message: 'Error al eliminar', severity: 'error' });
        }
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
                <Box>
                    <Typography variant="h5" fontWeight={700} color="text.primary">
                        Gestión de Usuarios
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mt={0.5}>
                        {users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<PersonAdd />}
                    onClick={openCreate}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
                >
                    Nuevo Usuario
                </Button>
            </Box>

            {/* User Cards */}
            <Grid container spacing={2}>
                {users.map(user => {
                    const role = ROLE_CONFIG[user.tipo_usuario] || ROLE_CONFIG.user;
                    const initials = getInitials(user);
                    const bgColor = avatarColor(user.nombre_usuario);
                    return (
                        <Grid item xs={12} sm={6} md={4} key={user.id}>
                            <Card
                                elevation={0}
                                sx={{
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 3,
                                    transition: 'box-shadow 0.2s',
                                    '&:hover': { boxShadow: 4 }
                                }}
                            >
                                <CardContent sx={{ p: 2.5 }}>
                                    {/* Card header */}
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Avatar sx={{ bgcolor: bgColor, width: 46, height: 46, fontSize: 16, fontWeight: 700 }}>
                                                {initials}
                                            </Avatar>
                                            <Box>
                                                <Typography variant="subtitle1" fontWeight={600} lineHeight={1.2}>
                                                    {user.nombre_completo || user.nombre_usuario}
                                                </Typography>
                                                {user.nombre_completo && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        @{user.nombre_usuario}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                        <Box>
                                            <Tooltip title="Editar">
                                                <IconButton size="small" onClick={() => openEdit(user)} sx={{ color: 'primary.main' }}>
                                                    <Edit fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Eliminar">
                                                <IconButton size="small" onClick={() => setDeleteDialog({ open: true, user })} sx={{ color: 'error.main' }}>
                                                    <Delete fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>

                                    <Divider sx={{ my: 1.5 }} />

                                    {/* Role chip */}
                                    <Chip
                                        icon={role.icon}
                                        label={role.label}
                                        color={role.color}
                                        size="small"
                                        variant="outlined"
                                        sx={{ mb: 1.5, fontWeight: 500 }}
                                    />

                                    {/* Contact info */}
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
                                        {user.email && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                                <Email sx={{ fontSize: 14, color: 'text.disabled' }} />
                                                <Typography variant="caption" color="text.secondary" noWrap>
                                                    {user.email}
                                                </Typography>
                                            </Box>
                                        )}
                                        {user.telefono && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                                                <Phone sx={{ fontSize: 14, color: 'text.disabled' }} />
                                                <Typography variant="caption" color="text.secondary">
                                                    {user.telefono}
                                                </Typography>
                                            </Box>
                                        )}
                                        {user.notas && (
                                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.8 }}>
                                                <Notes sx={{ fontSize: 14, color: 'text.disabled', mt: 0.2 }} />
                                                <Typography variant="caption" color="text.secondary" sx={{
                                                    display: '-webkit-box', WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical', overflow: 'hidden'
                                                }}>
                                                    {user.notas}
                                                </Typography>
                                            </Box>
                                        )}
                                        {!user.email && !user.telefono && !user.notas && (
                                            <Typography variant="caption" color="text.disabled" fontStyle="italic">
                                                Sin información adicional
                                            </Typography>
                                        )}
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            {/* Create/Edit Dialog */}
            <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>
                    {editingId ? 'Editar Usuario' : 'Nuevo Usuario'}
                </DialogTitle>
                <Divider />
                <DialogContent sx={{ pt: 2.5 }}>
                    <Grid container spacing={2}>
                        {/* Required fields */}
                        <Grid item xs={12}>
                            <Typography variant="caption" fontWeight={600} color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>
                                Datos de acceso
                            </Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth size="small" label="Usuario *"
                                value={form.nombre_usuario}
                                onChange={e => setForm(f => ({ ...f, nombre_usuario: e.target.value }))}
                                error={!!errors.nombre_usuario} helperText={errors.nombre_usuario}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Rol *</InputLabel>
                                <Select label="Rol *" value={form.tipo_usuario}
                                    onChange={e => setForm(f => ({ ...f, tipo_usuario: e.target.value }))}>
                                    <MenuItem value="user">Usuario</MenuItem>
                                    <MenuItem value="Admin">Administrador</MenuItem>
                                    <MenuItem value="demo">Demo</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth size="small"
                                type={showPassword ? 'text' : 'password'}
                                label={editingId ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
                                value={form.contraseña}
                                onChange={e => setForm(f => ({ ...f, contraseña: e.target.value }))}
                                error={!!errors.contraseña} helperText={errors.contraseña}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton size="small" onClick={() => setShowPassword(s => !s)}>
                                                {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                        </Grid>

                        {/* Optional fields */}
                        <Grid item xs={12} sx={{ mt: 1 }}>
                            <Typography variant="caption" fontWeight={600} color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>
                                Información adicional (opcional)
                            </Typography>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth size="small" label="Nombre completo"
                                value={form.nombre_completo}
                                onChange={e => setForm(f => ({ ...f, nombre_completo: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth size="small" label="Email"
                                type="email" value={form.email}
                                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                                error={!!errors.email} helperText={errors.email}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth size="small" label="Teléfono"
                                value={form.telefono}
                                onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth size="small" label="Notas"
                                multiline rows={2} value={form.notas}
                                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <Divider />
                <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
                    <Button onClick={() => setFormOpen(false)} sx={{ textTransform: 'none' }}>
                        Cancelar
                    </Button>
                    <Button variant="contained" onClick={handleSubmit} sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 3 }}>
                        {editingId ? 'Guardar cambios' : 'Crear usuario'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete confirm dialog */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, user: null })}
                PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle fontWeight={700}>Eliminar usuario</DialogTitle>
                <DialogContent>
                    <Typography>
                        ¿Estás seguro de que querés eliminar a <strong>{deleteDialog.user?.nombre_usuario}</strong>? Esta acción no se puede deshacer.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
                    <Button onClick={() => setDeleteDialog({ open: false, user: null })} sx={{ textTransform: 'none' }}>
                        Cancelar
                    </Button>
                    <Button variant="contained" color="error" onClick={handleDelete}
                        sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>
                        Eliminar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar feedback */}
            <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack(s => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
                <Alert severity={snack.severity} variant="filled" sx={{ borderRadius: 2 }}>
                    {snack.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}

export default UserManagement;
