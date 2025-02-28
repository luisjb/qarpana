-- seed.sql
INSERT INTO usuarios (nombre_usuario, tipo_usuario, contraseña) VALUES
('admin', 'Admin', '$argon2id$v=19$m=65536,t=3,p=4$HpExSl27mg2AJMfbIl6i+w$CZ8j9WH2yaQi98oFwOzRnZf0nyKZrcEJGLa23dA0X5M'),
('seba', 'Admin', '$argon2id$v=19$m=65536,t=3,p=4$RhQ9cw/HpkLPzb9w5SWL+A$ZG3Oy7+rUHpcIKnCYNruiKIW3A2Awi3zQl7OWH0A2XI'),
('carla', 'Admin', '$argon2id$v=19$m=65536,t=3,p=4$ZZZeRDxlJ4Ec0KUHOVUvqA$C2VB+KKvbDbdO2623VoVGnj1pyGFDhxNuYgHu2vik0E');

-- Insertar cultivos (asumiendo que necesitas estos primero)
INSERT INTO cultivos (nombre_cultivo, indice_crecimiento_radicular, indice_capacidad_extraccion) VALUES
('Trigo', 2, 4),
('Soja', 2, 9),
('Garbanzo', 2, 1.8),
('Maiz', 2.5, 8);

-- Insertar datos en la tabla coeficiente_cultivo
-- Trigo
INSERT INTO coeficiente_cultivo (cultivo_id, indice_kc, indice_dias)
SELECT id, 0.3, 0 FROM cultivos WHERE nombre_cultivo = 'Trigo'
UNION ALL
SELECT id, 0.3, 16 FROM cultivos WHERE nombre_cultivo = 'Trigo'
UNION ALL
SELECT id, 1.45, 80 FROM cultivos WHERE nombre_cultivo = 'Trigo'
UNION ALL
SELECT id, 1.45, 125 FROM cultivos WHERE nombre_cultivo = 'Trigo'
UNION ALL
SELECT id, 0.25, 160 FROM cultivos WHERE nombre_cultivo = 'Trigo';

-- Soja
INSERT INTO coeficiente_cultivo (cultivo_id, indice_kc, indice_dias)
SELECT id, 0.5, 0 FROM cultivos WHERE nombre_cultivo = 'Soja'
UNION ALL
SELECT id, 0.5, 20 FROM cultivos WHERE nombre_cultivo = 'Soja'
UNION ALL
SELECT id, 1.15, 50 FROM cultivos WHERE nombre_cultivo = 'Soja'
UNION ALL
SELECT id, 1.15, 110 FROM cultivos WHERE nombre_cultivo = 'Soja'
UNION ALL
SELECT id, 0.5, 140 FROM cultivos WHERE nombre_cultivo = 'Soja';

-- Garbanzo
INSERT INTO coeficiente_cultivo (cultivo_id, indice_kc, indice_dias)
SELECT id, 0.4, 0 FROM cultivos WHERE nombre_cultivo = 'Garbanzo'
UNION ALL
SELECT id, 0.4, 25 FROM cultivos WHERE nombre_cultivo = 'Garbanzo'
UNION ALL
SELECT id, 1, 119 FROM cultivos WHERE nombre_cultivo = 'Garbanzo'
UNION ALL
SELECT id, 1, 161 FROM cultivos WHERE nombre_cultivo = 'Garbanzo'
UNION ALL
SELECT id, 0.35, 192 FROM cultivos WHERE nombre_cultivo = 'Garbanzo';

-- Maiz
INSERT INTO coeficiente_cultivo (cultivo_id, indice_kc, indice_dias)
SELECT id, 0.3, 0 FROM cultivos WHERE nombre_cultivo = 'Maiz'
UNION ALL
SELECT id, 0.3, 25 FROM cultivos WHERE nombre_cultivo = 'Maiz'
UNION ALL
SELECT id, 1.2, 65 FROM cultivos WHERE nombre_cultivo = 'Maiz'
UNION ALL
SELECT id, 1.2, 110 FROM cultivos WHERE nombre_cultivo = 'Maiz'
UNION ALL
SELECT id, 0.35, 140 FROM cultivos WHERE nombre_cultivo = 'Maiz';

-- Campos de ejemplo
INSERT INTO campos (usuario_id, nombre_campo, ubicacion) VALUES
(1, 'Campo Norte', 'Córdoba, Argentina'),
(1, 'Campo Sur', 'Santa Fe, Argentina'),
(2, 'Campo Este', 'Buenos Aires, Argentina'),
(3, 'Campo Oeste', 'Mendoza, Argentina');

-- Lotes de ejemplo
INSERT INTO lotes (campo_id, nombre_lote, cultivo_id, fecha_siembra, especie, variedad, observaciones, campaña, porcentaje_agua_util_umbral) VALUES
(1, 'Lote 1A', 1, '2023-05-15', 'Trigo', 'Variedad A', 'Lote en buenas condiciones', '23/24', 50),
(1, 'Lote 1B', 2, '2023-11-10', 'Soja', 'Variedad B', 'Siembra directa', '23/24', 50),
(2, 'Lote 2A', 3, '2023-07-01', 'Garbanzo', 'Variedad C', 'Rotación con trigo', '23/24', 50),
(2, 'Lote 2B', 4, '2023-09-20', 'Maíz', 'Variedad D', 'Riego por aspersión', '23/24', 50);

-- Estados fenológicos de ejemplo
INSERT INTO estado_fenologico (lote_id, fenologia, dias) VALUES
(1, 'Emergencia', 0),
(1, 'Macollaje', 30),
(1, 'Encañazón', 60),
(2, 'Emergencia', 0),
(2, 'Desarrollo de hojas', 20),
(2, 'Floración', 50),
(3, 'Emergencia', 0),
(3, 'Desarrollo vegetativo', 30),
(3, 'Floración', 60),
(4, 'Emergencia', 0),
(4, 'Desarrollo de hojas', 25),
(4, 'Floración', 65);

-- Agua útil inicial de ejemplo
INSERT INTO agua_util_inicial (lote_id, valor, estratos) VALUES
(1, 100, 3),
(2, 120, 3),
(3, 90, 3),
(4, 110, 3);

-- Cambios diarios de ejemplo (simplificado para los últimos 30 días)
INSERT INTO cambios_diarios (lote_id, fecha_cambio, riego_cantidad, precipitaciones, humedad, temperatura, evapotranspiracion, etc, lluvia_efectiva, kc, dias, agua_util_diaria, estrato_alcanzado)
SELECT 
    l.id AS lote_id,
    (CURRENT_DATE - (30 - generate_series(1, 30))::integer) AS fecha_cambio,
    CASE WHEN random() < 0.3 THEN round(cast(random() * 20 as numeric), 2) ELSE 0 END AS riego_cantidad,
    CASE WHEN random() < 0.2 THEN round(cast(random() * 30 as numeric), 2) ELSE 0 END AS precipitaciones,
    round(cast(50 + random() * 30 as numeric), 2) AS humedad,
    round(cast(15 + random() * 15 as numeric), 2) AS temperatura,
    round(cast(2 + random() * 4 as numeric), 2) AS evapotranspiracion,
    round(cast(1.5 + random() * 3 as numeric), 2) AS etc,
    CASE WHEN random() < 0.2 THEN round(cast(random() * 20 as numeric), 2) ELSE 0 END AS lluvia_efectiva,
    CASE 
        WHEN c.nombre_cultivo = 'Trigo' THEN round(cast(0.3 + (random() * 1.15) as numeric), 2)
        WHEN c.nombre_cultivo = 'Soja' THEN round(cast(0.5 + (random() * 0.65) as numeric), 2)
        WHEN c.nombre_cultivo = 'Garbanzo' THEN round(cast(0.4 + (random() * 0.6) as numeric), 2)
        WHEN c.nombre_cultivo = 'Maiz' THEN round(cast(0.7 + (random() * 0.5) as numeric), 2)
    END AS kc,
    generate_series(1, 30) AS dias,
    round(cast(80 + random() * 40 as numeric), 2) AS agua_util_diaria,
    floor(random() * 3) + 1 AS estrato_alcanzado
FROM lotes l
JOIN cultivos c ON l.cultivo_id = c.id
CROSS JOIN generate_series(1, 30)
ON CONFLICT (lote_id, fecha_cambio) DO NOTHING;

