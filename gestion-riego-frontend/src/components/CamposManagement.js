import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../axiosConfig';
import {
    Container, Typography, TextField, Button, List, ListItem, ListItemText,
    Select, MenuItem, FormControl, InputLabel, Grid, Dialog, DialogActions,
    DialogContent, DialogContentText, DialogTitle, IconButton
} from '@mui/material';
import { Edit, Delete, Add } from '@mui/icons-material';

function CamposManagement() {
    const [campos, setCampos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [nuevoCampo, setNuevoCampo] = useState({ nombre_campo: '', ubicación: '', usuario_id: '' });
    const [editingCampo, setEditingCampo] = useState(null);
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
    const [campoToDelete, setCampoToDelete] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    
    const navigate = useNavigate();

    const checkAdminStatus = () => {
        const userRole = localStorage.getItem('role');
        setIsAdmin(userRole && userRole.toLowerCase() === 'admin');
    };

    useEffect(() => {
        fetchCampos();
        fetchUsuarios();
        checkAdminStatus();
    }, []);

    const fetchCampos = async () => {
        try {
            const response = await axios.get('/campos/all');
            setCampos(response.data);
        } catch (error) {
            console.error('Error al obtener campos:', error);
        }
    };

    const fetchUsuarios = async () => {
        try {
            const response = await axios.get('/usuarios');
            setUsuarios(response.data);
        } catch (error) {
            console.error('Error al obtener usuarios:', error);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (editingCampo) {
            setEditingCampo(prev => ({
                ...prev,
                [name]: value
            }));
        } else {
            setNuevoCampo(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingCampo) {
                await axios.put(`/campos/${editingCampo.id}`, editingCampo);
            } else {
                await axios.post('/campos', nuevoCampo);
            }
            fetchCampos();
            setNuevoCampo({ nombre_campo: '', ubicacion: '', usuario_id: '' });
            setEditingCampo(null);
            setOpenDialog(false);
        } catch (error) {
            console.error('Error al guardar campo:', error);
        }
    };

    const handleDelete = async () => {
        try {
            await axios.delete(`/campos/${campoToDelete.id}`);
            fetchCampos();
            setOpenDeleteDialog(false);
        } catch (error) {
            console.error('Error al eliminar campo:', error);
        }
    };

    const handleAddLotes = (campoId) => {
        navigate(`/lotes/${campoId}`);
    };

    return (
        <Container maxWidth="md">
            <Typography variant="h4" gutterBottom>Gestión de Campos</Typography>
            <Button variant="contained" color="primary" onClick={() => setOpenDialog(true)}>
                Agregar Nuevo Campo
            </Button>
            <List>
                {campos.map((campo) => (
                    <ListItem key={campo.id}>
                        <ListItemText
                            primary={campo.nombre_campo}
                            secondary={`Ubicación: ${campo.ubicación || 'No especificada'} | Usuario: ${campo.nombre_usuario || 'No asignado'}`}
                        />
                        <IconButton onClick={() => handleAddLotes(campo.id)}>
                            <Add />
                        </IconButton>
                        {isAdmin && (
                            <>
                                <IconButton onClick={() => {
                                        setEditingCampo({
                                            ...campo,
                                            usuario_id: campo.usuario_id || '',  // Asegurar que no sea null
                                            ubicación: campo.ubicación || ''     // Asegurar que no sea null
                                        });
                                        setOpenDialog(true);
                                    }} color="primary">
                                        <Edit />
                                </IconButton>
                                <IconButton onClick={() => {
                                    setCampoToDelete(campo);
                                    setOpenDeleteDialog(true);
                                }} color="error">
                                    <Delete />
                                
                                </IconButton>
                            </>
                        )}
                    </ListItem>
                ))}
            </List>

            <Dialog open={openDialog} onClose={() => {
                setOpenDialog(false);
                setEditingCampo(null);
            }}>
                <DialogTitle>{editingCampo ? 'Editar Campo' : 'Agregar Nuevo Campo'}</DialogTitle>
                <DialogContent>
                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            margin="normal"
                            name="nombre_campo"
                            label="Nombre del Campo"
                            value={editingCampo ? editingCampo.nombre_campo : nuevoCampo.nombre_campo}
                            onChange={handleInputChange}
                            required
                        />
                        <TextField
                            fullWidth
                            margin="normal"
                            name="ubicación"
                            label="Ubicación"
                            value={editingCampo ? editingCampo.ubicación : nuevoCampo.ubicación}
                            onChange={handleInputChange}
                            required
                        />
                        <FormControl fullWidth margin="normal">
                            <InputLabel>Usuario</InputLabel>
                            <Select
                                name="usuario_id"
                                value={editingCampo ? editingCampo.usuario_id || '' : nuevoCampo.usuario_id}
                                onChange={handleInputChange}
                                required
                            >
                                {usuarios.map((usuario) => (
                                    <MenuItem key={usuario.id} value={usuario.id}>
                                        {usuario.nombre_usuario}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button type="submit" variant="contained" color="primary">
                            {editingCampo ? 'Actualizar' : 'Agregar'} Campo
                        </Button>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={openDeleteDialog}
                onClose={() => setOpenDeleteDialog(false)}
            >
                <DialogTitle>Confirmar Eliminación</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        ¿Estás seguro de que quieres eliminar este campo?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDeleteDialog(false)}>Cancelar</Button>
                    <Button onClick={handleDelete} color="error">Eliminar</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default CamposManagement;