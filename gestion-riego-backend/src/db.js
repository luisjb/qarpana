// src/db.js
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER || 'usuario',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_NAME || 'bambooDB',
    password: process.env.DB_PASSWORD || 'contraseña',
    port: process.env.DB_PORT || 5432,
});

module.exports = pool;