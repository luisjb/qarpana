import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import useMediaQuery from '@mui/material/useMediaQuery';
import useScrollTrigger from '@mui/material/useScrollTrigger';


// Importa los íconos necesarios
// Puedes usar los iconos que prefieras de @mui/icons-material
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import InstagramIcon from '@mui/icons-material/Instagram';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MenuIcon from '@mui/icons-material/Menu';


const LandingPage = () => {
    const [scrollY, setScrollY] = useState(0);
    const [mobileOpen, setMobileOpen] = useState(false);
    const quienesSomosRef = useRef(null);
    const queHacemosRef = useRef(null);
    const comoLoHacemosRef = useRef(null);
    const plataformaRef = useRef(null);
    const contactoRef = useRef(null);
    
    const isMobile = useMediaQuery('(max-width:960px)');
    const trigger = useScrollTrigger({
        disableHysteresis: true,
        threshold: 100,
    });

    useEffect(() => {
        const handleScroll = () => {
        setScrollY(window.scrollY);
        };
        
        window.addEventListener('scroll', handleScroll);
        return () => {
        window.removeEventListener('scroll', handleScroll);
        };
    }, []);

     // Estados para el formulario
    const [formStatus, setFormStatus] = useState({
        isSubmitting: false,
        isSuccess: false,
        isError: false,
        message: ''
    });

    const handleDrawerToggle = () => {
        setMobileOpen(!mobileOpen);
    };

    const scrollToSection = (ref) => {
        if (ref && ref.current) {
            const yOffset = -100; // Ajuste para el header fijo
            const y = ref.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
            if (mobileOpen) setMobileOpen(false);
            }
    };
    // Función para calcular opacidad basada en la posición de scroll
    const getOpacity = (startPos, endPos) => {
        if (scrollY < startPos) return 0;
        if (scrollY > endPos) return 1;
        return (scrollY - startPos) / (endPos - startPos);
    };

    // Función para calcular traducción Y basada en posición de scroll
    const getTranslateY = (startPos, endPos, maxTranslate = 50) => {
        if (scrollY < startPos) return maxTranslate;
        if (scrollY > endPos) return 0;
        return maxTranslate - (maxTranslate * (scrollY - startPos) / (endPos - startPos));
    };

    // Estilo principal que se aplicará a todos los elementos
    const mainStyle = {
        fontFamily: 'Poppins, Arial, sans-serif',
        color: '#00434B',
    };
    
    const navigationItems = [
        { label: 'Quiénes somos', ref: quienesSomosRef },
        { label: 'Qué hacemos', ref: queHacemosRef },
        { label: 'Cómo lo hacemos', ref: comoLoHacemosRef },
        { label: 'Plataforma', ref: plataformaRef },
        { label: 'Contacto', ref: contactoRef },
    ];

    const drawer = (
        <List>
        {navigationItems.map((item) => (
            <ListItem 
            key={item.label} 
            onClick={() => scrollToSection(item.ref)}
            sx={{ 
                cursor: 'pointer',
                '&:hover': { bgcolor: '#f0f7ff' }
            }}
            >
            <Typography variant="body1" fontWeight="medium" sx={{ color: '#00434b' }}>
                {item.label}
            </Typography>
            </ListItem>
        ))}
        <ListItem>
            <Button
            component={Link}
            to="/login"
            variant="contained"
            fullWidth
            sx={{
                bgcolor: '#70AF07',
                color: 'white',
                '&:hover': { bgcolor: '#5c9206' }
            }}
            >
            Iniciar Sesión
            </Button>
        </ListItem>
        </List>
    );

    return (
        <Box sx={{ ...mainStyle, bgcolor: 'background.default' }}>
        {/* Header */}
        <AppBar 
            position="fixed" 
            sx={{ 
            bgcolor: trigger ? 'white' : 'transparent',
            boxShadow: trigger ? 1 : 'none',
            transition: 'all 0.3s ease-in-out',
            }}
        >
            <Container maxWidth="lg">
            <Toolbar disableGutters sx={{ py: trigger ? 0.5 : 1 }}>
                <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
                <img 
                    src="/web0.jpg" 
                    alt="Qarpana Logo"
                    style={{ 
                    height: trigger ? '40px' : '50px',
                    transition: 'height 0.3s ease-in-out'
                    }} 
                />
                </Box>

                {/* Desktop Navigation */}
                {!isMobile && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {navigationItems.map((item, index) => (
                    <Button
                        key={index}
                        onClick={() => scrollToSection(item.ref)}
                        sx={{ 
                        color: trigger ? '#00434b' : 'white', 
                        fontWeight: 'medium',
                        '&:hover': { 
                            bgcolor: trigger ? 'rgba(0, 67, 75, 0.08)' : 'rgba(255, 255, 255, 0.2)'
                        }
                        }}
                    >
                        {item.label}
                    </Button>
                    ))}
                    <Button
                    component={Link}
                    to="/login"
                    variant="contained"
                    sx={{
                        bgcolor: '#70AF07',
                        color: 'white',
                        ml: 2,
                        '&:hover': { bgcolor: '#5c9206' }
                    }}
                    >
                    Iniciar Sesión
                    </Button>
                </Box>
                )}

                {/* Mobile Menu Button */}
                {isMobile && (
                <IconButton
                    color={trigger ? 'primary' : 'inherit'}
                    aria-label="open drawer"
                    edge="end"
                    onClick={handleDrawerToggle}
                    sx={{ color: trigger ? '#00434b' : 'white' }}
                >
                    <MenuIcon />
                </IconButton>
                )}
            </Toolbar>
            </Container>
        </AppBar>

        {/* Mobile Navigation Drawer */}
        <Drawer
            variant="temporary"
            anchor="right"
            open={mobileOpen}
            onClose={handleDrawerToggle}
            ModalProps={{ keepMounted: true }}
            sx={{
            '& .MuiDrawer-paper': { width: 240 },
            }}
        >
            {drawer}
        </Drawer>

        {/* Hero Section */}
        <Box 
            sx={{ 
            position: 'relative', 
            height: '100vh', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            overflow: 'hidden',
            background: 'linear-gradient(to bottom, #00434b, #006064)',
            color: 'white',
            pt: { xs: 6, md: 0 }
            }}
        >
            <Box 
            sx={{
                position: 'absolute',
                inset: 0,
                backgroundImage: "url('/web00.jpg')", // Asegúrate de tener esta imagen
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 0.2,
            }}
            />
            <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
            <Box 
                mb={6}
                sx={{
                opacity: 1 - (scrollY / 400),
                transform: `scale(${1 - (scrollY / 1500)})`,
                }}
            >
                <img 
                src="/web0.png" // Asegúrate de tener esta imagen
                alt="Qarpana Logo" 
                style={{ 
                    height: '10rem', 
                    marginBottom: '1.5rem' 
                }}
                />
            </Box>
            <Typography 
                variant="h1" 
                component="h1" 
                sx={{ 
                fontWeight: 'bold', 
                mb: 3,
                fontSize: { xs: '3rem', md: '5rem' },
                opacity: 1 - (scrollY / 600),
                transform: `translateY(${-scrollY / 10}px)`
                }}
            >
                GESTIÓN DE RIEGO
            </Typography>
            <Typography 
                variant="h4" 
                component="p" 
                sx={{ 
                maxWidth: '48rem', 
                mx: 'auto',
                fontSize: { xs: '1.2rem', md: '1.5rem' },
                opacity: 1 - (scrollY / 500),
                transform: `translateY(${-scrollY / 15}px)`
                }}
            >
                Optimizamos el uso del agua con soluciones personalizadas para maximizar la productividad de tus cultivos
            </Typography>
            <Box 
                sx={{ 
                position: 'absolute', 
                bottom: 40, 
                left: 0, 
                right: 0, 
                textAlign: 'center',
                animation: 'bounce 2s infinite'
                }}
            >
                <IconButton 
                color="inherit"
                aria-label="scroll down"
                size="large"
                onClick={() => scrollToSection(quienesSomosRef)}
                >
                <KeyboardArrowDownIcon fontSize="large" />
                </IconButton>
            </Box>
            </Container>
        </Box>

        {/* Quienes Somos Section */}
        <Box ref={quienesSomosRef} sx={{ py: 10, bgcolor: 'background.paper' }}>
            <Container maxWidth="lg">
            <Grid container spacing={6} alignItems="center">
                <Grid 
                item 
                xs={12} 
                md={6}
                sx={{
                    opacity: getOpacity(100, 500),
                    transform: `translateY(${getTranslateY(100, 500)}px)`
                }}
                >
                <Typography variant="h2" component="h2" fontWeight="bold" mb={3}>
                    <Box component="span" sx={{ color: '#00434b' }}>QUIENES </Box>
                    <Box component="span" sx={{ color: '#70AF07' }}>SOMOS?</Box>
                </Typography>
                <Box mb={4}>
                    <Typography variant="body1" fontWeight="bold" mb={1} sx={{ color: '#00434b' }}>
                    SOMOS UNA EMPRESA QUE BRINDA SERVICIO DE ASESORAMIENTO EN RIEGO PROPORCIONANDO UNA SOLUCIÓN COMPLETA Y PERSONALIZADA
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" sx={{ color: '#70AF07' }}>
                    TENEMOS MÁS DE 20 AÑOS DE EXPERIENCIA
                    </Typography>
                </Box>
                <Typography variant="body1" color="text.secondary">
                    Nuestra misión es liderar en el sector de riego con innovación y uso eficiente de los recursos 
                    ayudando a nuestros clientes a comprender las interacciones del sistema agua, suelo y planta, 
                    para optimizar el rendimiento. Promovemos la eficiencia de los procesos, con flexibilidad ante 
                    los cambios del entorno, ofreciendo soluciones personalizadas en un marco sostenibilidad.
                </Typography>
                </Grid>
                <Grid 
                item 
                xs={12} 
                md={6}
                sx={{
                    opacity: getOpacity(200, 600),
                    transform: `translateY(${getTranslateY(200, 600)}px)`
                }}
                >
                <Grid container spacing={2}>
                    <Grid item xs={6}>
                    <Paper 
                        elevation={3} 
                        sx={{ 
                        borderRadius: '50%',
                        overflow: 'hidden',
                        paddingTop: '100%',
                        position: 'relative'
                        }}
                    >
                        <Box 
                        component="img"
                        src="/web1.jpg" 
                        alt="tecnologia"
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                        }}
                        />
                    </Paper>
                    </Grid>
                    <Grid item xs={6}>
                    <Paper 
                        elevation={3} 
                        sx={{ 
                        borderRadius: '50%',
                        overflow: 'hidden',
                        paddingTop: '100%',
                        position: 'relative',
                        mt: 6
                        }}
                    >
                        <Box 
                        component="img"
                        src="/web2.jpg" 
                        alt="planificacion y estrategia"
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                        }}
                        />
                    </Paper>
                    </Grid>
                    <Grid item xs={12}>
                    <Paper 
                        elevation={3} 
                        sx={{ 
                        borderRadius: '16px',
                        overflow: 'hidden',
                        mx: 'auto',
                        width: '75%',
                        paddingTop: '40%',
                        position: 'relative'
                        }}
                    >
                        <Box 
                        component="img"
                        src="/web3.jpg" 
                        alt="manejo eficiente del agua"
                        sx={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                        }}
                        />
                    </Paper>
                    </Grid>
                </Grid>
                </Grid>
            </Grid>
            </Container>
        </Box>

        {/* Que Hacemos Section */}
        <Box ref={queHacemosRef} sx={{ py: 10, bgcolor: '#f5f9ff' }}>
            <Container maxWidth="lg">
            <Grid container spacing={6} alignItems="center" direction={{ xs: 'column-reverse', md: 'row' }}>
                <Grid 
                item 
                xs={12} 
                md={6}
                sx={{
                    opacity: getOpacity(600, 1000),
                    transform: `translateY(${getTranslateY(600, 1000, 80)}px)`
                }}
                >
                <Box sx={{ position: 'relative' }}>
                    <Box 
                    sx={{ 
                        position: 'absolute', 
                        width: '24rem', 
                        height: '24rem', 
                        bgcolor: '#70AF07', 
                        borderRadius: '50%', 
                        top: '-5rem', 
                        left: '-5rem', 
                        opacity: 0.2 
                    }}
                    />
                    <Paper 
                    elevation={6} 
                    sx={{ 
                        borderRadius: 4, 
                        overflow: 'hidden', 
                        position: 'relative', 
                        zIndex: 10 
                    }}
                    >
                    <Box 
                        component="img"
                        src="/web4.jpg" 
                        alt="estrategia a la medida de tus necesidades"
                        sx={{ width: '100%', display: 'block' }}
                    />
                    </Paper>
                </Box>
                </Grid>
                <Grid 
                item 
                xs={12} 
                md={6}
                sx={{
                    opacity: getOpacity(600, 1000),
                    transform: `translateY(${getTranslateY(600, 1000)}px)`
                }}
                >
                <Typography variant="h2" component="h2" fontWeight="bold" mb={3}>
                    <Box component="span" sx={{ color: '#00434b' }}>QUE </Box>
                    <Box component="span" sx={{ color: '#70AF07' }}>HACEMOS?</Box>
                </Typography>
                <Typography variant="body1" fontWeight="bold" sx={{ color: '#00434b' }}>
                    GESTIONAMOS EL RIEGO CON UN ENFOQUE INTEGRAL DEL SISTEMA, DESDE EL DIAGNÓSTICO INICIAL HASTA EL 
                    ANÁLISIS DE RESULTADOS, ASEGURANDO UNA OPTIMIZACIÓN CONTINUA Y PERSONALIZADA DEL SISTEMA 
                    AGUA – SUELO – CULTIVO
                </Typography>
                </Grid>
            </Grid>
            </Container>
        </Box>

        {/* Como Lo Hacemos Section */}
        <Box ref={comoLoHacemosRef} sx={{ py: 10, bgcolor: 'background.paper' }}>
            <Container maxWidth="lg">
            <Typography 
                variant="h2" 
                component="h2" 
                fontWeight="bold" 
                mb={8} 
                textAlign="center"
                sx={{
                opacity: getOpacity(1000, 1400),
                transform: `translateY(${getTranslateY(1000, 1400)}px)`
                }}
            >
                <Box component="span" sx={{ color: '#00434b' }}>CÓMO LO </Box>
                <Box component="span" sx={{ color: '#70AF07' }}>HACEMOS?</Box>
            </Typography>
            
            <Grid container spacing={4}>
                {/* Step 1 */}
                <Grid 
                item 
                xs={12} 
                sm={6} 
                md={4}
                sx={{
                    opacity: getOpacity(1200, 1600),
                    transform: `translateY(${getTranslateY(1200, 1600)}px)`
                }}
                >
                <Paper
                    elevation={3}
                    sx={{
                    p: 3,
                    borderRadius: 2,
                    position: 'relative',
                    height: '100%'
                    }}
                >
                    <Box 
                    sx={{ 
                        position: 'absolute',
                        top: '-1.5rem',
                        left: '-1.5rem',
                        width: '4rem',
                        height: '4rem',
                        bgcolor: '#70AF07',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '1.5rem',
                        fontWeight: 'bold'
                    }}
                    >
                    01
                    </Box>
                    <Typography variant="h6" component="h3" fontWeight="bold" mt={3} mb={2} sx={{ color: '#00434b' }}>
                    DIAGNÓSTICO INICIAL INTEGRAL
                    </Typography>
                    <Typography component="ul" sx={{ pl: 2 }}>
                    <li>Definición de ambientes y muestreo dirigido</li>
                    <li>Determinación de la capacidad del sistema de riego</li>
                    </Typography>
                </Paper>
                </Grid>
                
                {/* Step 2 */}
                <Grid 
                item 
                xs={12} 
                sm={6} 
                md={4}
                sx={{
                    opacity: getOpacity(1250, 1650),
                    transform: `translateY(${getTranslateY(1250, 1650)}px)`
                }}
                >
                <Paper
                    elevation={3}
                    sx={{
                    p: 3,
                    borderRadius: 2,
                    position: 'relative',
                    height: '100%'
                    }}
                >
                    <Box 
                    sx={{ 
                        position: 'absolute',
                        top: '-1.5rem',
                        left: '-1.5rem',
                        width: '4rem',
                        height: '4rem',
                        bgcolor: '#70AF07',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '1.5rem',
                        fontWeight: 'bold'
                    }}
                    >
                    02
                    </Box>
                    <Typography variant="h6" component="h3" fontWeight="bold" mt={3} mb={2} sx={{ color: '#00434b' }}>
                    DISEÑO DE ESTRATEGIA DE RIEGO PERSONALIZADA
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                    Creamos un plan a medida que optimiza el uso del agua según las necesidades específicas de su campo y cultivos.
                    </Typography>
                </Paper>
                </Grid>
                
                {/* Step 3 */}
                <Grid 
                item 
                xs={12} 
                sm={6} 
                md={4}
                sx={{
                    opacity: getOpacity(1300, 1700),
                    transform: `translateY(${getTranslateY(1300, 1700)}px)`
                }}
                >
                <Paper
                    elevation={3}
                    sx={{
                    p: 3,
                    borderRadius: 2,
                    position: 'relative',
                    height: '100%'
                    }}
                >
                    <Box 
                    sx={{ 
                        position: 'absolute',
                        top: '-1.5rem',
                        left: '-1.5rem',
                        width: '4rem',
                        height: '4rem',
                        bgcolor: '#70AF07',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '1.5rem',
                        fontWeight: 'bold'
                    }}
                    >
                    03
                    </Box>
                    <Typography variant="h6" component="h3" fontWeight="bold" mt={3} mb={2} sx={{ color: '#00434b' }}>
                    PLATAFORMA DIGITALIZADA
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                    <li> Gestión y digitalización de datos para un monitoreo efectivo y toma de decisiones basada en información precisa.</li>
                    <li> Automatización de la carga de datos de precipitación y riego.</li>
                    </Typography>
                </Paper>
                </Grid>
                
                {/* Step 4 */}
                <Grid 
                item 
                xs={12} 
                sm={6} 
                md={4}
                sx={{
                    opacity: getOpacity(1350, 1750),
                    transform: `translateY(${getTranslateY(1350, 1750)}px)`
                }}
                >
                <Paper
                    elevation={3}
                    sx={{
                    p: 3,
                    borderRadius: 2,
                    position: 'relative',
                    height: '100%'
                    }}
                >
                    <Box 
                    sx={{ 
                        position: 'absolute',
                        top: '-1.5rem',
                        left: '-1.5rem',
                        width: '4rem',
                        height: '4rem',
                        bgcolor: '#70AF07',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '1.5rem',
                        fontWeight: 'bold'
                    }}
                    >
                    04
                    </Box>
                    <Typography variant="h6" component="h3" fontWeight="bold" mt={3} mb={2} sx={{ color: '#00434b' }}>
                    SEGUIMIENTO A CAMPO
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                    Visitas periódicas con ajuste de estrategia basado en observaciones directas y mediciones en el sitio.
                    </Typography>
                </Paper>
                </Grid>
                
                {/* Step 5 */}
                <Grid 
                item 
                xs={12} 
                sm={6} 
                md={4}
                sx={{
                    opacity: getOpacity(1400, 1800),
                    transform: `translateY(${getTranslateY(1400, 1800)}px)`
                }}
                >
                <Paper
                    elevation={3}
                    sx={{
                    p: 3,
                    borderRadius: 2,
                    position: 'relative',
                    height: '100%'
                    }}
                >
                    <Box 
                    sx={{ 
                        position: 'absolute',
                        top: '-1.5rem',
                        left: '-1.5rem',
                        width: '4rem',
                        height: '4rem',
                        bgcolor: '#70AF07',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '1.5rem',
                        fontWeight: 'bold'
                    }}
                    >
                    05
                    </Box>
                    <Typography variant="h6" component="h3" fontWeight="bold" mt={3} mb={2} sx={{ color: '#00434b' }}>
                    ATENCIÓN PERSONALIZADA Y VINCULACIÓN CONTINUA
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                    Mantenemos comunicación constante para resolver inquietudes y ajustar estrategias según las necesidades cambiantes.
                    </Typography>
                </Paper>
                </Grid>
                
                {/* Step 6 */}
                <Grid 
                item 
                xs={12} 
                sm={6} 
                md={4}
                sx={{
                    opacity: getOpacity(1450, 1850),
                    transform: `translateY(${getTranslateY(1450, 1850)}px)`
                }}
                >
                <Paper
                    elevation={3}
                    sx={{
                    p: 3,
                    borderRadius: 2,
                    position: 'relative',
                    height: '100%'
                    }}
                >
                    <Box 
                    sx={{ 
                        position: 'absolute',
                        top: '-1.5rem',
                        left: '-1.5rem',
                        width: '4rem',
                        height: '4rem',
                        bgcolor: '#70AF07',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '1.5rem',
                        fontWeight: 'bold'
                    }}
                    >
                    06
                    </Box>
                    <Typography variant="h6" component="h3" fontWeight="bold" mt={3} mb={2} sx={{ color: '#00434b' }}>
                    ANALISIS INTEGRAL DE RESULTADOS
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                    Orientado a la mejora continua y sostenible del sistema de riego y productividad de sus cultivos.
                    </Typography>
                </Paper>
                </Grid>
            </Grid>
            </Container>
        </Box>

        {/* Platform Demo Section */}
        <Box 
            ref={plataformaRef}
            sx={{ 
            py: 10, 
            bgcolor: '#00434b', 
            color: 'white !important',
            '& .MuiTypography-root': {
                color: 'white !important'
            },
            '& li': {
                color: 'white !important'
            }
        }}>
            <Container maxWidth="lg">
            <Grid container spacing={6} alignItems="center">
                <Grid 
                item 
                xs={12} 
                md={6}
                sx={{
                    opacity: getOpacity(1800, 2200),
                    transform: `translateY(${getTranslateY(1800, 2200)}px)`
                }}
                >
                <Typography variant="h3" component="h2" fontWeight="bold" mb={3} sx={{ color: 'white !important' }}>
                    Nuestra Plataforma Digital
                </Typography>
                <Typography variant="body1" mb={3} sx={{ color: 'white !important' }}>
                    Monitoreamos y analizamos datos en tiempo real para tomar decisiones precisas sobre el riego de sus cultivos.
                </Typography>
                <Box component="ul" sx={{ pl: 2, '& > li': { mb: 2,  color: 'white !important' } }}>
                    <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start',  color: 'white !important' }}>
                    <Box sx={{ 
                        width: '1.5rem', 
                        height: '1.5rem', 
                        bgcolor: '#70AF07', 
                        borderRadius: '50%', 
                        mr: 2, 
                        mt: 0.5,
                        flexShrink: 0
                    }} />
                    <Typography sx={{ color: 'white !important' }}>Visualización de datos en tiempo real</Typography>
                    </Box>
                    <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', color: 'white !important'}}>
                    <Box sx={{ 
                        width: '1.5rem', 
                        height: '1.5rem', 
                        bgcolor: '#70AF07', 
                        borderRadius: '50%', 
                        mr: 2, 
                        mt: 0.5,
                        flexShrink: 0
                    }} />
                    <Typography sx={{ color: 'white !important' }}>Automatización de la carga de datos de precipitación y riego</Typography>
                    </Box>
                    <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start', color: 'white !important'  }}>
                    <Box sx={{ 
                        width: '1.5rem', 
                        height: '1.5rem', 
                        bgcolor: '#70AF07', 
                        borderRadius: '50%', 
                        mr: 2, 
                        mt: 0.5,
                        flexShrink: 0
                    }} />
                    <Typography sx={{ color: 'white !important' }}>Proyección de Agua útil a los 7 días según pronostico</Typography>
                    </Box>
                    <Box component="li" sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <Box sx={{ 
                        width: '1.5rem', 
                        height: '1.5rem', 
                        bgcolor: '#70AF07', 
                        borderRadius: '50%', 
                        mr: 2, 
                        mt: 0.5,
                        flexShrink: 0
                    }} />
                    <Typography sx={{ color: 'white !important' }}>Informes personalizados</Typography>
                    </Box>
                </Box>
                </Grid>
                <Grid 
                item 
                xs={12} 
                md={6}
                sx={{
                    opacity: getOpacity(1850, 2250),
                    transform: `translateY(${getTranslateY(1850, 2250)}px)`
                }}
                >
                <Paper 
                    elevation={6} 
                    sx={{ 
                    borderRadius: 2, 
                    overflow: 'hidden', 
                    border: '4px solid white' 
                    }}
                >
                    <Box 
                    component="img"
                    src="/web5.jpg" 
                    alt="Platform screenshot"
                    sx={{ width: '100%', display: 'block' }}
                    />
                </Paper>
                </Grid>
            </Grid>
            </Container>
        </Box>

        {/* Contact Section */}
        <Box ref={contactoRef} sx={{ py: 10, position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
            <Box 
                sx={{ 
                position: 'absolute', 
                top: 0, 
                right: 0, 
                width: '75%', 
                height: '100%', 
                bgcolor: '#70AF07', 
                borderTopLeftRadius: '50%', 
                borderBottomLeftRadius: '50%', 
                opacity: 0.2 
                }}
            />
            </Box>
            <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 10 }}>
            <Paper 
                elevation={6} 
                sx={{
                maxWidth: '64rem',
                mx: 'auto',
                borderRadius: 4,
                overflow: 'hidden',
                opacity: getOpacity(2200, 2600),
                transform: `translateY(${getTranslateY(2200, 2600)}px)`
                }}
            >
                <Box sx={{ p: { xs: 4, md: 6 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
                    <img src="/web6.jpg" alt="Qarpana Logo" style={{ height: '4rem' }} />
                </Box>
                
                <Typography variant="h3" component="h2" fontWeight="bold" textAlign="center" mb={4}>
                    <Box component="span" sx={{ color: '#70AF07' }}>Contactános</Box>
                </Typography>
                
                <Typography variant="body1" textAlign="center" color="text.secondary" mb={6}>
                    Contáctanos para conocer más sobre esta propuesta y descubre cómo nuestra 
                    solución personalizada puede transformar la gestión de tu riego.
                </Typography>
                
                <Grid container spacing={4}>
                    <Grid item xs={12} md={6}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton 
                            sx={{ 
                            bgcolor: '#f0f7ff', 
                            color: '#70AF07', 
                            mr: 2,
                            '&:hover': { bgcolor: '#e0f0ff' }
                            }}
                        >
                            <PhoneIcon />
                        </IconButton>
                        <Box>
                            <Typography variant="subtitle1" fontWeight="bold">Teléfono:</Typography>
                            <Typography variant="body2">3525 640098</Typography>
                            <Typography variant="body2">3525 501392</Typography>
                        </Box>
                        </Box>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton 
                            component="a"
                            href="https://www.instagram.com/qarpanariego"
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ 
                            bgcolor: '#f0f7ff', 
                            color: '#70AF07', 
                            mr: 2,
                            '&:hover': { bgcolor: '#e0f0ff' }
                            }}
                        >
                            <InstagramIcon />
                        </IconButton>
                        <Box>
                            <Typography variant="subtitle1" fontWeight="bold">Instagram:</Typography>
                            <Typography 
                                variant="body2" 
                                component="a"
                                href="https://www.instagram.com/qarpanariego"
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{ 
                                    color: 'inherit', 
                                    textDecoration: 'none',
                                    '&:hover': { textDecoration: 'underline' } 
                                }}
                                >
                                @qarpanariego
                            </Typography>
                        </Box>
                        </Box>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <IconButton 
                            component="a"
                            href="mailto:info@qarpana.com.ar"
                            sx={{ 
                            bgcolor: '#f0f7ff', 
                            color: '#70AF07', 
                            mr: 2,
                            '&:hover': { bgcolor: '#e0f0ff' }
                            }}
                        >
                            <EmailIcon />
                        </IconButton>
                        <Box>
                            <Typography variant="subtitle1" fontWeight="bold">Email:</Typography>
                            <Typography 
                                variant="body2"
                                component="a"
                                href="mailto:info@qarpana.com.ar"
                                sx={{ 
                                    color: 'inherit', 
                                    textDecoration: 'none',
                                    '&:hover': { textDecoration: 'underline' } 
                                }}
                                >
                                info@qarpana.com.ar
                            </Typography>
                        </Box>
                        </Box>
                    </Box>
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                    <Box component="form" noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <TextField
                        label="Nombre"
                        fullWidth
                        variant="outlined"
                        size="small"
                        />
                        <TextField
                        label="Email"
                        fullWidth
                        variant="outlined"
                        size="small"
                        type="email"
                        />
                        <TextField
                        label="Mensaje"
                        fullWidth
                        variant="outlined"
                        multiline
                        rows={4}
                        />
                        <Button
                        variant="contained"
                        fullWidth
                        sx={{ 
                            bgcolor: '#00434b', 
                            color: 'white', 
                            py: 1.5,
                            '&:hover': { bgcolor: '#005a63' }
                        }}
                        >
                        Enviar mensaje
                        </Button>
                    </Box>
                    </Grid>
                </Grid>
                </Box>
            </Paper>
            </Container>
        </Box>
    </Box>
    );
}

export default LandingPage;
