import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
    TextField, 
    Button, 
    List, 
    ListItem, 
    ListItemText, 
    Container, 
    Typography, 
    Box, 
    MenuItem,
    Checkbox,
    FormControlLabel
} from '@mui/material';

function DataEntry() {
    const [cultivos, setCultivos] = useState([]);
    const [especies, setEspecies] = useState([]);
    const [nuevoCultivo, setNuevoCultivo] = useState({
        cultivo: '',
        especie: '',
        variedad: '',
        fecha_siembra: '',
        campo: '',
        lote: '',
        ubicacion: '',
        lote_activo: true
    });

    useEffect(() => {
        fetchCultivos();
        fetchEspecies();
    }, []);

    const fetchCultivos = async () => {
        try {
            const response = await fetch('http://qarpana.com.ar:5000/api/cultivos');
            if (!response.ok) {
                throw new Error('Error al cargar los cultivos');
            }
            const data = await response.json();
            setCultivos(data);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const fetchEspecies = async () => {
        try {
            const response = await fetch('http://qarpana.com.ar:5000/api/especies');
            if (!response.ok) {
                throw new Error('Error al cargar las especies');
            }
            const data = await response.json();
            setEspecies(data);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNuevoCultivo({ ...nuevoCultivo, [name]: value });
    };

    const handleCheckboxChange = (e) => {
        setNuevoCultivo({ ...nuevoCultivo, lote_activo: e.target.checked });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch('http://qarpana.com.ar:5000/api/cultivos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(nuevoCultivo),
            });
            if (!response.ok) {
                throw new Error('Error al agregar el cultivo');
            }
            fetchCultivos();
            setNuevoCultivo({
                cultivo: '',
                especie: '',
                variedad: '',
                fecha_siembra: '',
                campo: '',
                lote: '',
                ubicacion: '',
                lote_activo: true
            });
        } catch (error) {
            console.error('Error:', error);
        }
    };

    return (
        <Container maxWidth="md">
            <Typography variant="h4" component="h1" gutterBottom>
                Carga de Datos de Cultivos
            </Typography>
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
                <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="cultivo"
                    label="Cultivo"
                    value={nuevoCultivo.cultivo}
                    onChange={handleInputChange}
                />
                <TextField
                    select
                    margin="normal"
                    required
                    fullWidth
                    name="especie"
                    label="Especie"
                    value={nuevoCultivo.especie}
                    onChange={handleInputChange}
                >
                    {especies.map((opcion) => (
                        <MenuItem key={opcion.id} value={opcion.nombre_cultivo}>
                            {opcion.nombre_cultivo}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="variedad"
                    label="Variedad"
                    value={nuevoCultivo.variedad}
                    onChange={handleInputChange}
                />
                <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="fecha_siembra"
                    label="Fecha de Siembra"
                    type="date"
                    value={nuevoCultivo.fecha_siembra}
                    onChange={handleInputChange}
                    InputLabelProps={{
                        shrink: true,
                    }}
                />
                <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="campo"
                    label="Campo"
                    value={nuevoCultivo.campo}
                    onChange={handleInputChange}
                />
                <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="lote"
                    label="Lote"
                    value={nuevoCultivo.lote}
                    onChange={handleInputChange}
                />
                <TextField
                    margin="normal"
                    required
                    fullWidth
                    name="ubicacion"
                    label="Ubicación (Lat, Long)"
                    value={nuevoCultivo.ubicacion}
                    onChange={handleInputChange}
                />
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={nuevoCultivo.lote_activo}
                            onChange={handleCheckboxChange}
                            name="lote_activo"
                            color="primary"
                        />
                    }
                    label="Lote Activo"
                />
                <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    sx={{ mt: 3, mb: 2 }}
                >
                    Agregar Cultivo
                </Button>
            </Box>

            <Typography variant="h5" component="h2" gutterBottom>
                Cultivos Registrados
            </Typography>
            <List>
                {cultivos.map(cultivo => (
                    <ListItem key={cultivo.id}>
                        <ListItemText
                            primary={`${cultivo.cultivo} - ${cultivo.especie} - ${cultivo.variedad}`}
                            secondary={`${cultivo.fecha_siembra} - ${cultivo.campo} - ${cultivo.lote} - ${cultivo.ubicacion} - Activo: ${cultivo.lote_activo ? 'Sí' : 'No'}`}
                        />
                        <Button component={Link} to={`/cultivo/${cultivo.id}`} variant="outlined">
                            Ver detalles
                        </Button>
                    </ListItem>
                ))}
            </List>
        </Container>
    );
}

export default DataEntry;