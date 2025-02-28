import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { WaterDrop, CalendarToday, Grass, Cloud, Opacity } from '@mui/icons-material';

function Widget({ title, value, unit, icon, small = false }) {
    const getIcon = () => {
        switch (icon) {
            case 'waterDrop':
                return <WaterDrop style={{ color: '#3FA9F5' }} />;
            case 'calendar':
                return <CalendarToday color="secondary" />;
            case 'grass':
                return <Grass style={{ color: 'green' }} />;
            case 'cloud':
                return <Cloud style={{ color: 'lightblue' }} />;
            case 'opacity':
                return <Opacity style={{ color: '#3FA9F5' }} />;
            default:
                return null;
        }
    };

    return (
        <Paper elevation={3} style={{ padding: small ? '10px' : '15px', height: '100%' }}>
            <Box display="flex" alignItems="center" mb={small ? 1 : 2}>
                {getIcon()}
                <Typography 
                    variant={small ? "body1" : "h6"} 
                    color="primary" 
                    style={{ fontSize: small ? '0.9rem' : undefined }}
                >
                    {title}
                </Typography>
            </Box>
            {typeof value === 'object' ? (
                value
            ) : (
                <Typography 
                    variant={small ? "body1" : "h4"} 
                    color="text.primary"
                    style={{ 
                        fontSize: small ? '1.1rem' : undefined,
                        fontWeight: small ? 'medium' : undefined 
                    }}
                >
                    {value} <Typography component="span" variant="body1" color="text.secondary">{unit}</Typography>
                </Typography>
            )}
        </Paper>
    );
}

export default Widget;