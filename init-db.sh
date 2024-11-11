#!/bin/bash
set -e

echo "Iniciando script de inicialización"

# Esperar a que PostgreSQL esté listo
for i in {1..60}; do
    if pg_isready -h /var/run/postgresql -U "$POSTGRES_USER"; then
        echo "PostgreSQL is ready"
        break
    fi
    echo "Waiting for PostgreSQL to be ready... $i/60"
    sleep 1
done

if [ $i -eq 60 ]; then
    echo "Timeout waiting for PostgreSQL"
    exit 1
fi

echo "PostgreSQL está listo para aceptar conexiones"

# Ejecutar el script de semilla
echo "Ejecutando script de semilla..."
psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/seed.sql

echo "Inicialización completada"