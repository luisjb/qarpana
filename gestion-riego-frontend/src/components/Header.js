import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
    AppBar, 
    Toolbar, 
    Typography, 
    Button, 
    Box, 
    IconButton, 
    Menu, 
    MenuItem, 
    useMediaQuery, 
    useTheme 
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LandscapeIcon from '@mui/icons-material/Landscape';
import ChangeCircleIcon from '@mui/icons-material/ChangeCircle';
import PeopleIcon from '@mui/icons-material/People';
import WaterDrop from '@mui/icons-material/WaterDrop';


import logo from '../assets/logo.jpeg';

const Header = () => {
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [anchorEl, setAnchorEl] = useState(null);
    const userRole = localStorage.getItem('role');
    const isAdmin = userRole && userRole.toLowerCase() === 'admin';
    const isDemo = userRole && userRole.toLowerCase() === 'demo';

    const handleMenu = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        navigate('/login');
    };

    const menuItems = [
        { text: 'Panel', icon: <DashboardIcon />, link: '/simulations' },
        { text: 'Resumen de Círculos', icon: <WaterDrop />, link: '/resumen-circulos' },
        ...(isDemo ? [] : [
            ...(isAdmin ? [{ text: 'Campos', icon: <LandscapeIcon />, link: '/campos' }] : []),
            { text: 'Cambios Diarios', icon: <ChangeCircleIcon />, link: '/cambios-diarios' },
            ...(isAdmin ? [{ text: 'Gestión de Usuarios', icon: <PeopleIcon />, link: '/admin/users' }] : []),
        ]),
    ];

    return (
        <AppBar position="static">
        <Toolbar>
            <Box 
                    component={Link} 
                    to="/" 
                    sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        flexGrow: 1,
                        textDecoration: 'none' 
                    }}
                >
            <img src={logo} alt="Logo" style={{ height: 40, marginRight: 10 }} />
            <Typography variant="h6" component="div" sx={{ fontFamily: 'Poppins, Arial, sans-serif', color: 'white' }}>
                Qarpana
            </Typography>
            </Box>
            
            {isMobile ? (
            <>
                <IconButton
                size="large"
                edge="start"
                color="inherit"
                aria-label="menu"
                onClick={handleMenu}
                >
                <MenuIcon />
                </IconButton>
                <Menu
                id="menu-appbar"
                anchorEl={anchorEl}
                anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                keepMounted
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                open={Boolean(anchorEl)}
                onClose={handleClose}
                >
                {menuItems.map((item) => (
                    <MenuItem key={item.text} onClick={() => { handleClose(); navigate(item.link); }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {item.icon}
                        <Typography sx={{ ml: 1, fontFamily: 'Poppins, Arial, sans-serif' }}>{item.text}</Typography>
                    </Box>
                    </MenuItem>
                ))}
                <MenuItem onClick={handleLogout}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <LogoutIcon />
                    <Typography sx={{ ml: 1, fontFamily: 'Poppins, Arial, sans-serif' }}>Cerrar Sesión</Typography>
                    </Box>
                </MenuItem>
                </Menu>
            </>
            ) : (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {menuItems.map((item) => (
                <Button 
                    key={item.text}
                    color="inherit" 
                    component={Link} 
                    to={item.link}
                    startIcon={item.icon}
                    sx={{ mr: 1, fontFamily: 'Poppins, Arial, sans-serif' }}
                >
                    {item.text}
                </Button>
                ))}
                <Button 
                color="inherit" 
                onClick={handleLogout} 
                startIcon={<LogoutIcon />}
                sx={{ fontFamily: 'Poppins, Arial, sans-serif' }}
                >
                Cerrar Sesión
                </Button>
            </Box>
            )}
        </Toolbar>
        </AppBar>
    );
};

export default Header;