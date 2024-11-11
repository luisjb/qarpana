import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { WaterDrop, CalendarToday, Grass, Cloud, Opacity } from '@mui/icons-material';

function Widget({ title, value, unit, icon }) {
    const getIcon = () => {
        switch (icon) {
        case 'waterDrop':
            return <WaterDrop />;
        case 'calendar':
            return <CalendarToday />;
        case 'grass':
            return <Grass />;
        case 'cloud':
            return <Cloud />;
        case 'opacity':
            return <Opacity />;
        default:
            return null;
        }
    };

    return (
        <Paper elevation={3} style={{ padding: '15px', height: '100%' }}>
        <Box display="flex" alignItems="center" mb={2}>
            {getIcon()}
            <Typography variant="h6" style={{ marginLeft: '10px' }}>{title}</Typography>
        </Box>
        <Typography variant="h4">
            {value} <Typography component="span" variant="body1">{unit}</Typography>
        </Typography>
        </Paper>
    );
}

export default Widget;