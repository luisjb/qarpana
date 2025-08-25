-- Migrations will appear here as you chat with AI

create table usuarios (
    id bigint primary key generated always as identity,
    nombre_usuario text not null,
    tipo_usuario text not null,
    "contraseña" text not null
);

create table cultivos (
    id bigint primary key generated always as identity,
    usuario_id bigint references usuarios (id),
    cultivo text not null,
    especie text not null,
    variedad text not null,
    fecha date not null,
    campo text not null,
    lote text not null,
    ubicacion text not null,
    riego_cantidad numeric,
    riego_fecha_inicio date,
    precipitaciones numeric,
    observaciones text,
    humedad numeric,
    temperatura numeric,
    fechas_cambios date[0],
    agua_util_inicial numeric,
    evapotranspiracion numeric,
    fenologia text,
    kc numeric,
    porcentaje_agua_util_umbral numeric,
    etc numeric,
    tasa_crecimiento_radicular numeric,
    capacidad_extraccion numeric,
    lluvia_eficiente numeric
);

drop table if exists cultivos cascade;

create table campos (
    id bigint primary key generated always as identity,
    usuario_id bigint references usuarios (id),
    nombre_campo text not null,
    ubicacion text not null
);

create table lotes (
    id bigint primary key generated always as identity,
    campo_id bigint references campos (id),
    nombre_lote text not null,
    cultivo text not null,
    fecha_siembra date not null,
    especie text not null,
    variedad text not null,
    observaciones text,
    agua_util_inicial numeric
);

create table cambios_diarios (
    id bigint primary key generated always as identity,
    lote_id bigint references lotes (id),
    fecha_cambio date not null,
    riego_cantidad numeric,
    riego_fecha_inicio date,
    precipitaciones numeric,
    humedad numeric,
    temperatura numeric,
    evapotranspiracion numeric,
    capacidad_extraccion numeric,
    kc numeric,
    porcentaje_agua_util_umbral numeric,
    etc numeric,
    tasa_crecimiento_radicular numeric,
    lluvia_eficiente numeric
);

create table cultivos (
    id bigint primary key generated always as identity,
    nombre_cultivo text not null,
    crecimiento_radicular numeric,
    capacidad_extraccion numeric
);

alter table lotes
add column cultivo_id bigint references cultivos (id);

alter table cambios_diarios
add column cultivo_id bigint references cultivos (id);

create table estado_fenologico (
    id bigint primary key generated always as identity,
    cultivo_id bigint references cultivos (id),
    fenologia text not null,
    dias int not null
);

alter table estado_fenologico
alter column cultivo_id
set not null;

create table coeficiente_cultivo (
    id bigint primary key generated always as identity,
    cultivo_id bigint references cultivos (id),
    kc numeric not null,
    dias int not null
);

alter table cambios_diarios
drop tasa_crecimiento_radicular;

alter table cambios_diarios
drop capacidad_extraccion;

alter table cambios_diarios
drop kc;

CREATE TABLE agua_util_inicial (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    lote_id BIGINT REFERENCES lotes(id),
    valor NUMERIC NOT NULL,
    estratos INT NOT NULL
);

alter table lotes
drop agua_util_inicial;

alter table usuarios
add constraint tipo_usuario_check check (tipo_usuario in ('Admin', 'user'));

alter table cultivos
rename column crecimiento_radicular to indice_crecimiento_radicular;

alter table cultivos
rename column capacidad_extraccion to indice_capacidad_extraccion;

alter table cambios_diarios
add column crecimiento_radicular numeric;

alter table cambios_diarios
add column capacidad_extraccion numeric;

alter table cambios_diarios
add column fecha_siembra date;

alter table lotes
add column activo boolean default true;

alter table cambios_diarios
add column kc numeric;

alter table cambios_diarios
add column dias int;

alter table coeficiente_cultivo
rename column kc to indice_kc;

alter table coeficiente_cultivo
rename column dias to indice_dias;

alter table cambios_diarios
add column dias_correccion int;

alter table cambios_diarios
add column agua_util_diaria numeric;

alter table cambios_diarios
add column estrato_alcanzado int;

alter table cambios_diarios
add column pronostico_evapotranspiracion_1 numeric,
add column pronostico_evapotranspiracion_2 numeric,
add column pronostico_evapotranspiracion_3 numeric,
add column pronostico_evapotranspiracion_4 numeric,
add column pronostico_evapotranspiracion_5 numeric,
add column pronostico_evapotranspiracion_6 numeric,
add column pronostico_evapotranspiracion_7 numeric,
add column pronostico_evapotranspiracion_8 numeric,
add column pronostico_evapotranspiracion_9 numeric,
add column pronostico_evapotranspiracion_10 numeric,
add column pronostico_agua_util_1 numeric,
add column pronostico_agua_util_2 numeric,
add column pronostico_agua_util_3 numeric,
add column pronostico_agua_util_4 numeric,
add column pronostico_agua_util_5 numeric,
add column pronostico_agua_util_6 numeric,
add column pronostico_agua_util_7 numeric,
add column pronostico_agua_util_8 numeric,
add column pronostico_agua_util_9 numeric,
add column pronostico_agua_util_10 numeric;

alter table cambios_diarios
drop pronostico_evapotranspiracion_1,
drop pronostico_evapotranspiracion_2,
drop pronostico_evapotranspiracion_3,
drop pronostico_evapotranspiracion_4,
drop pronostico_evapotranspiracion_5,
drop pronostico_evapotranspiracion_6,
drop pronostico_evapotranspiracion_7,
drop pronostico_evapotranspiracion_8,
drop pronostico_evapotranspiracion_9,
drop pronostico_evapotranspiracion_10,
drop pronostico_agua_util_1,
drop pronostico_agua_util_2,
drop pronostico_agua_util_3,
drop pronostico_agua_util_4,
drop pronostico_agua_util_5,
drop pronostico_agua_util_6,
drop pronostico_agua_util_7,
drop pronostico_agua_util_8,
drop pronostico_agua_util_9,
drop pronostico_agua_util_10;

create table pronostico (
    id bigint primary key generated always as identity,
    lote_id bigint references lotes (id),
    prono_dias int,
    prono_etc numeric,
    prono_etp numeric,
    prono_agua_util numeric,
    prono_temperatura numeric,
    prono_humedad numeric,
    prono_lluvia numeric,
    prono_viento numeric
);

alter table coeficiente_cultivo
add column dias_correccion int;

alter table cambios_diarios
drop dias_correccion;

-- Eliminar la columna cultivo de la tabla lotes si aún existe
ALTER TABLE lotes DROP COLUMN IF EXISTS cultivo;

ALTER TABLE lotes
ADD COLUMN campaña VARCHAR(5);

ALTER TABLE lotes
ADD COLUMN estado_fenologico_id BIGINT REFERENCES estado_fenologico(id);

ALTER TABLE estado_fenologico
ADD COLUMN lote_id BIGINT REFERENCES lotes(id),
DROP COLUMN cultivo_id;

-- Mover porcentaje_agua_util_umbral a la tabla lotes
ALTER TABLE lotes ADD COLUMN porcentaje_agua_util_umbral NUMERIC;
ALTER TABLE cambios_diarios DROP COLUMN porcentaje_agua_util_umbral;

-- Modificar la columna etc en cambios_diarios para permitir valores nulos
ALTER TABLE cambios_diarios ALTER COLUMN etc DROP NOT NULL;
ALTER TABLE cambios_diarios ALTER COLUMN evapotranspiracion DROP NOT NULL;

-- Renombrar lluvia_eficiente a lluvia_efectiva
ALTER TABLE cambios_diarios RENAME COLUMN lluvia_eficiente TO lluvia_efectiva;

ALTER TABLE cambios_diarios
ADD CONSTRAINT unique_lote_fecha UNIQUE (lote_id, fecha_cambio);

ALTER TABLE lotes
ADD COLUMN agua_util_total NUMERIC;

-- Modificar las columnas para permitir explícitamente NULL
ALTER TABLE cambios_diarios 
    ALTER COLUMN dias DROP NOT NULL,
    ALTER COLUMN crecimiento_radicular DROP NOT NULL,
    ALTER COLUMN kc DROP NOT NULL,
    ALTER COLUMN capacidad_extraccion DROP NOT NULL,
    ALTER COLUMN lluvia_efectiva DROP NOT NULL,
    ALTER COLUMN agua_util_diaria DROP NOT NULL,
    ALTER COLUMN estrato_alcanzado DROP NOT NULL;

-- Eliminar la tabla existente si es necesario
DROP TABLE IF EXISTS pronostico CASCADE;

-- Crear la nueva tabla pronostico
CREATE TABLE pronostico (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    lote_id BIGINT REFERENCES lotes(id),
    fecha_pronostico DATE NOT NULL, -- Fecha para la cual se hace el pronóstico
    prono_dias INTEGER NOT NULL CHECK (prono_dias BETWEEN 1 AND 8), -- Día del pronóstico (1-8)
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Cuándo se actualizó este pronóstico
    
    -- Datos meteorológicos de la API
    temperatura_media NUMERIC,
    temperatura_max NUMERIC,
    temperatura_min NUMERIC,
    humedad NUMERIC,
    presion NUMERIC,
    velocidad_viento NUMERIC,
    
    -- Datos calculados
    evapotranspiracion NUMERIC,
    etc NUMERIC, -- evapotranspiracion * kc
    kc NUMERIC,
    precipitaciones NUMERIC,
    lluvia_efectiva NUMERIC,
    
    -- Datos de riego y agua
    agua_util_diaria NUMERIC,
    capacidad_extraccion NUMERIC,
    
    -- Constraint para asegurar única combinación de lote, fecha y día de pronóstico
    CONSTRAINT unique_pronostico_por_dia UNIQUE (lote_id, fecha_pronostico, prono_dias)
);

-- Índices para mejorar el rendimiento de las consultas
CREATE INDEX idx_pronostico_lote_fecha ON pronostico(lote_id, fecha_pronostico);
CREATE INDEX idx_pronostico_fecha ON pronostico(fecha_pronostico);



ALTER TABLE cambios_diarios ALTER COLUMN riego_fecha_inicio DROP NOT NULL;

ALTER TABLE lotes
ADD COLUMN capacidad_almacenamiento_2m NUMERIC;

ALTER TABLE lotes
ADD COLUMN utilizar_un_metro BOOLEAN DEFAULT FALSE;

ALTER TABLE cambios_diarios
ADD COLUMN correccion_agua NUMERIC DEFAULT 0;

-- Agregar la columna capacidad_extraccion a la tabla lotes
ALTER TABLE lotes
ADD COLUMN capacidad_extraccion NUMERIC;

CREATE TABLE observaciones (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    lote_id BIGINT REFERENCES lotes(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    texto TEXT NOT NULL,
    usuario_id BIGINT REFERENCES usuarios(id),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices para mejorar el rendimiento de consultas
CREATE INDEX idx_observaciones_lote_id ON observaciones(lote_id);
CREATE INDEX idx_observaciones_fecha ON observaciones(fecha);

-- Crear tabla para recomendaciones a nivel de campo
CREATE TABLE recomendaciones_campo (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    campo_id BIGINT REFERENCES campos(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    texto TEXT NOT NULL,
    usuario_id BIGINT REFERENCES usuarios(id),
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices para mejorar el rendimiento de consultas
CREATE INDEX idx_recomendaciones_campo_id ON recomendaciones_campo(campo_id);
CREATE INDEX idx_recomendaciones_fecha ON recomendaciones_campo(fecha);

-- Tabla para almacenar estaciones meteorológicas
CREATE TABLE estaciones_meteorologicas (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    codigo TEXT NOT NULL UNIQUE,  -- El "code" de la API de OMIXOM
    titulo TEXT NOT NULL,
    latitud TEXT,
    longitud TEXT,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    datos_json JSONB  -- Para almacenar todos los datos de la estación incluyendo módulos
);

-- Agregar campo para asociar estaciones a campos
ALTER TABLE campos
ADD COLUMN estacion_id TEXT;  -- Aquí guardamos el código de la estación (no el ID de nuestra tabla)

-- Primero, verificamos si la extensión está instalada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agregar una columna para almacenar múltiples IDs de usuarios
ALTER TABLE campos 
ADD COLUMN IF NOT EXISTS usuarios_ids BIGINT[];

UPDATE campos 
SET usuarios_ids = ARRAY[usuario_id]
WHERE usuario_id IS NOT NULL AND (usuarios_ids IS NULL OR array_length(usuarios_ids, 1) IS NULL);

-- Tabla para los módulos de las estaciones meteorológicas
CREATE TABLE IF NOT EXISTS estaciones_modulos (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    estacion_codigo TEXT NOT NULL REFERENCES estaciones_meteorologicas(codigo) ON DELETE CASCADE,
    modulo_id INTEGER NOT NULL,
    modulo_titulo TEXT NOT NULL,
    modulo_tipo TEXT NOT NULL,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(estacion_codigo, modulo_id)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_estaciones_modulos_codigo ON estaciones_modulos(estacion_codigo);
CREATE INDEX IF NOT EXISTS idx_estaciones_modulos_tipo ON estaciones_modulos(modulo_tipo);
CREATE INDEX IF NOT EXISTS idx_estaciones_modulos_id ON estaciones_modulos(modulo_id);

CREATE TABLE coeficiente_cultivo_lote (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    lote_id BIGINT REFERENCES lotes(id) ON DELETE CASCADE,
    coeficiente_cultivo_id BIGINT REFERENCES coeficiente_cultivo(id) ON DELETE CASCADE,
    dias_correccion INT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lote_id, coeficiente_cultivo_id)
);

CREATE INDEX idx_coeficiente_cultivo_lote_lote_id ON coeficiente_cultivo_lote(lote_id);
CREATE INDEX idx_coeficiente_cultivo_lote_coef_id ON coeficiente_cultivo_lote(coeficiente_cultivo_id);


CREATE TABLE regadores (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    campo_id BIGINT REFERENCES campos(id) ON DELETE CASCADE,
    nombre_dispositivo TEXT NOT NULL, -- Debe coincidir con el nombre en Traccar
    device_id TEXT, -- ID del dispositivo en Traccar (si está disponible)
    tipo_regador TEXT CHECK (tipo_regador IN ('pivote', 'lineal', 'aspersion')) DEFAULT 'pivote',
    
    -- Configuración del pivote
    radio_cobertura NUMERIC NOT NULL, -- Radio en metros
    caudal NUMERIC, -- Litros por minuto (si se especifica caudal directo)
    tiempo_vuelta_completa INTEGER, -- Minutos para vuelta completa (si se especifica tiempo)
    
    -- Ubicación central del pivote
    latitud_centro NUMERIC NOT NULL,
    longitud_centro NUMERIC NOT NULL,
    
    -- Configuración
    activo BOOLEAN DEFAULT true,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint para nombre único por campo
    CONSTRAINT unique_regador_nombre_campo UNIQUE (campo_id, nombre_dispositivo)
);

-- Tabla para las geozonas (sectores del pivote)
CREATE TABLE geozonas_pivote (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    regador_id BIGINT REFERENCES regadores(id) ON DELETE CASCADE,
    lote_id BIGINT REFERENCES lotes(id) ON DELETE CASCADE,
    
    -- Identificación del sector
    nombre_sector TEXT NOT NULL,
    numero_sector INTEGER NOT NULL CHECK (numero_sector > 0),
    
    -- Geometría del sector (porción de pizza)
    angulo_inicio NUMERIC NOT NULL CHECK (angulo_inicio >= 0 AND angulo_inicio < 360),
    angulo_fin NUMERIC NOT NULL CHECK (angulo_fin >= 0 AND angulo_fin < 360),
    radio_interno NUMERIC DEFAULT 0, -- Para anillos concéntricos si es necesario
    radio_externo NUMERIC NOT NULL,
    
    -- Estado del sector
    activo BOOLEAN DEFAULT true,
    color_display TEXT DEFAULT '#4CAF50', -- Color para mostrar en UI
    
    -- Configuración específica del sector
    coeficiente_riego NUMERIC DEFAULT 1.0, -- Multiplicador de riego para este sector
    prioridad INTEGER DEFAULT 1, -- Prioridad de riego (1 = más prioritario)
    
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_sector_regador UNIQUE (regador_id, numero_sector),
    CONSTRAINT valid_angles CHECK (
        (angulo_fin > angulo_inicio) OR 
        (angulo_inicio > angulo_fin AND angulo_inicio > 180) -- Para sectores que cruzan 0°
    )
);

-- Tabla para el historial de eventos de riego (basado en eventos de Traccar)
CREATE TABLE eventos_riego (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    regador_id BIGINT REFERENCES regadores(id) ON DELETE CASCADE,
    geozona_id BIGINT REFERENCES geozonas_pivote(id) ON DELETE CASCADE,
    
    -- Información del evento
    tipo_evento TEXT CHECK (tipo_evento IN ('entrada', 'salida', 'inicio_riego', 'fin_riego', 'movimiento', 'detencion')),
    fecha_evento TIMESTAMP NOT NULL,
    
    -- Posición en el momento del evento
    latitud NUMERIC,
    longitud NUMERIC,
    angulo_actual NUMERIC, -- Ángulo calculado desde el centro
    
    -- Datos del dispositivo
    dispositivo_online BOOLEAN,
    velocidad NUMERIC,
    
    -- Datos adicionales
    evento_traccar_id BIGINT, -- ID del evento original de Traccar
    procesado BOOLEAN DEFAULT false,
    
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para el estado actual de cada sector
CREATE TABLE estado_sectores_riego (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    geozona_id BIGINT REFERENCES geozonas_pivote(id) ON DELETE CASCADE,
    
    -- Estado actual
    estado TEXT CHECK (estado IN ('pendiente', 'en_progreso', 'completado', 'pausado')) DEFAULT 'pendiente',
    progreso_porcentaje NUMERIC DEFAULT 0 CHECK (progreso_porcentaje >= 0 AND progreso_porcentaje <= 100),
    
    -- Tiempos
    fecha_inicio_prevista TIMESTAMP,
    fecha_inicio_real TIMESTAMP,
    fecha_fin_prevista TIMESTAMP,
    fecha_fin_real TIMESTAMP,
    tiempo_estimado_minutos INTEGER,
    tiempo_real_minutos INTEGER,
    
    -- Datos de riego
    agua_aplicada_litros NUMERIC DEFAULT 0,
    agua_prevista_litros NUMERIC,
    
    -- Control
    ciclo_riego_id TEXT, -- Identificador del ciclo de riego actual
    ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_estado_por_geozona UNIQUE (geozona_id)
);

-- Índices para optimizar consultas
CREATE INDEX idx_regadores_campo ON regadores(campo_id);
CREATE INDEX idx_regadores_dispositivo ON regadores(nombre_dispositivo);
CREATE INDEX idx_geozonas_regador ON geozonas_pivote(regador_id);
CREATE INDEX idx_geozonas_lote ON geozonas_pivote(lote_id);
CREATE INDEX idx_eventos_riego_regador ON eventos_riego(regador_id);
CREATE INDEX idx_eventos_riego_fecha ON eventos_riego(fecha_evento);
CREATE INDEX idx_estado_sectores_geozona ON estado_sectores_riego(geozona_id);

