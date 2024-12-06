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
    "ubicación" text not null,
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
    "ubicación" text not null
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

