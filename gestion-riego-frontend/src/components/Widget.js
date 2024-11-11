import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { WaterDrop, CalendarToday, Grass, Cloud, Opacity } from '@mui/icons-material';

function Widget({ title, value, unit, icon }) {
    const getIcon = () => {
        switch (icon) {
            case 'waterDrop':
                return <WaterDrop color="water" />;
            case 'calendar':
                return <CalendarToday color="secondary" />;
            case 'grass':
                return <Grass style={{ color: 'green' }} />;
            case 'cloud':
                return <Cloud style={{ color: 'lightblue' }} />;
            case 'opacity':
                return <Opacity color="water" />;
            default:
                return null;
        }
    };

    return (
        <Paper elevation={3} style={{ padding: '15px', height: '100%' }}>
            <Box display="flex" alignItems="center" mb={2}>
                {getIcon()}
                <Typography variant="h6" color="primary" style={{ marginLeft: '10px' }}>{title}</Typography>
            </Box>
            <Typography variant="h4" color="text.primary">
                {value} <Typography component="span" variant="body1" color="text.secondary">{unit}</Typography>
            </Typography>
        </Paper>
    );
}

export default Widget;