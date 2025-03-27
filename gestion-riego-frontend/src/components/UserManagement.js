import React, { useState, useEffect } from 'react';
import axios from '../axiosConfig';
import { 
    Container, 
    Typography, 
    TextField, 
    Button, 
    Select, 
    MenuItem, 
    FormControl, 
    InputLabel, 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow, 
    Paper,
    IconButton,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle
} from '@mui/material';
import { Edit, Delete, Visibility, VisibilityOff } from '@mui/icons-material';


function UserManagement() {
    const [users, setUsers] = useState([]);
    const [newUser, setNewUser] = useState({ nombre_usuario: '', contraseña: '', tipo_usuario: 'user' });
    const [editingUser, setEditingUser] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/usuarios');
            setUsers(response.data);
        } catch (error) {
            console.error('Error fetching users:', error);
            if (error.response && error.response.status === 401) {
                // Token expirado o inválido, redirigir al login
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                window.location.href = '/login';
            }
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        if (editingUser) {
            setEditingUser({ ...editingUser, [name]: value });
        } else {
            setNewUser({ ...newUser, [name]: value });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingUser) {
                await axios.put(`/usuarios/${editingUser.id}`, editingUser);
            } else {
                await axios.post('/usuarios', newUser);
            }
            fetchUsers();
            setNewUser({ nombre_usuario: '', contraseña: '', tipo_usuario: 'user' });
            setEditingUser(null);
        } catch (error) {
            console.error('Error saving user:', error);
        }
    };

    const handleDelete = async (id) => {
        setOpenDialog(false);
        try {
            await axios.delete(`/usuarios/${id}`);
            fetchUsers();
        } catch (error) {
            console.error('Error deleting user:', error);
        }
    };

    return (
        <Container maxWidth="md">
            <Typography variant="h4" gutterBottom>
                Gestión de Usuarios
            </Typography>
            <form onSubmit={handleSubmit}>
                <TextField
                    fullWidth
                    margin="normal"
                    name="nombre_usuario"
                    label="Nombre de usuario"
                    value={editingUser ? editingUser.nombre_usuario : newUser.nombre_usuario}
                    onChange={handleInputChange}
                    required
                />
                <FormControl fullWidth margin="normal">
                    <TextField
                        type={showPassword ? "text" : "password"}
                        name="contraseña"
                        label="Contraseña"
                        value={editingUser ? editingUser.contraseña : newUser.contraseña}
                        onChange={handleInputChange}
                        required={!editingUser}
                        InputProps={{
                            endAdornment: (
                                <IconButton
                                    onClick={() => setShowPassword(!showPassword)}
                                    edge="end"
                                >
                                    {showPassword ? <VisibilityOff /> : <Visibility />}
                                </IconButton>
                            ),
                        }}
                    />
                </FormControl>
                <FormControl fullWidth margin="normal">
                    <Select
                        name="tipo_usuario"
                        label="Tipo de Usuario"
                        value={editingUser ? editingUser.tipo_usuario : newUser.tipo_usuario}
                        onChange={handleInputChange}
                    >
                        <MenuItem value="user">Usuario</MenuItem>
                        <MenuItem value="Admin">Administrador</MenuItem>
                        <MenuItem value="demo">Demo</MenuItem>
                    </Select>
                </FormControl>
                <Button 
                    type="submit" 
                    variant="contained" 
                    color="primary" 
                    fullWidth 
                    style={{ marginTop: '20px' }}
                >
                    {editingUser ? 'Actualizar' : 'Crear'} Usuario
                </Button>
            </form>
            <TableContainer component={Paper} style={{ marginTop: '20px' }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Nombre de Usuario</TableCell>
                            <TableCell>Tipo de Usuario</TableCell>
                            <TableCell>Acciones</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map(user => (
                            <TableRow key={user.id}>
                                <TableCell>{user.nombre_usuario}</TableCell>
                                <TableCell>{user.tipo_usuario}</TableCell>
                                <TableCell>
                                    <IconButton onClick={() => setEditingUser(user)} color="primary">
                                        <Edit />
                                    </IconButton>
                                    <IconButton onClick={() => {
                                        setUserToDelete(user);
                                        setOpenDialog(true);
                                    }} color="error">
                                        <Delete />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Dialog
                open={openDialog}
                onClose={() => setOpenDialog(false)}
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-description"
            >
                <DialogTitle id="alert-dialog-title">{"Confirmar eliminación"}</DialogTitle>
                <DialogContent>
                    <DialogContentText id="alert-dialog-description">
                        ¿Estás seguro de que quieres eliminar este usuario?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDialog(false)} color="primary">
                        Cancelar
                    </Button>
                    <Button onClick={() => handleDelete(userToDelete.id)} color="primary" autoFocus>
                        Confirmar
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}

export default UserManagement;