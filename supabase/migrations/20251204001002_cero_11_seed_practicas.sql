-- Migración cero — Fase 4 (plan §4.1/§4.2): seed de practicas (8), categories (61) y
-- activity_codes (24 + ADM). Fuente: bugs/migracion_cero/practicas.md /
-- bugs/practicas/Configuracion_Practicas_EMS.md, columna "Rol por Defecto" ya cerrada
-- (bugs/migracion_cero/autoria/default_app_role.md — 61/61 filas con rol, cero NULL).
-- Depende de: nada (practicas es la base de este archivo). cero_14/cero_15 dependen de este.

-- 1. Practicas (8) — códigos 0-7. Firmwide no tiene categorías propias, por eso
-- allows_rates_activities queda en false para ella; las 7 restantes sí ofrecen tarifas y
-- actividades (categories/activity_codes sembradas más abajo), por eso true.
INSERT INTO public.practicas (code, name, abbreviation, allows_rates_activities, is_active) VALUES
  (0, 'Firmwide',                    'FIR', false, true),
  (1, 'Auditoría',                   'AUD', true,  true),
  (2, 'Compliance',                  'COM', true,  true),
  (3, 'Tax & Advisory',              'TAX', true,  true),
  (4, 'Precios de Transferencias',   'PTR', true,  true),
  (5, 'M&A',                         'MYA', true,  true),
  (6, 'Legal',                       'LEG', true,  true),
  (7, 'Growth & Strategy',           'GYS', true,  true)
ON CONFLICT (code) DO NOTHING;

-- 2. Categories (61) — AUD 15 + COM 8 + TAX 8 + PTR 8 + MYA 8 + LEG 6 + GYS 8. Firmwide sin
-- categorías (decisión del plan §4.2). Tarifas Alta=Baja donde el catálogo maestro no define
-- temporada alta (informe §6.2). default_app_role mapeado por nombre de categoría, cerrado por
-- el operador 2026-08-23 (autoria/default_app_role.md) — cero NULL.
INSERT INTO public.categories (
  practica_id, category_name, display_order, can_approve_wo, can_approve_timesheets,
  rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd, default_app_role
)
SELECT p.practica_id, v.category_name, v.display_order, v.can_approve_wo, v.can_approve_timesheets,
       v.rate_high_bob, v.rate_low_bob, v.rate_high_usd, v.rate_low_usd,
       v.default_app_role::public.app_role
FROM (VALUES
  -- Auditoría (15)
  ('AUD', 'Socio',                          1,  true,  true,  1530, 1400, 153,  140,  'partner'),
  ('AUD', 'SQR',                            2,  true,  false, 1050, 840,  150,  120,  'sqr'),
  ('AUD', 'Director',                       3,  true,  true,  1230, 1200, 123,  120,  'director'),
  ('AUD', 'Gerente',                        4,  true,  true,  700,  600,  70,   60,   'manager'),
  ('AUD', 'Supervisor',                     5,  false, false, 700,  600,  70,   60,   'senior'),
  ('AUD', 'Senior',                         6,  false, false, 350,  280,  35,   28,   'senior'),
  ('AUD', 'Semi-Senior',                    7,  false, false, 200,  170,  20,   17,   'semisenior'),
  ('AUD', 'Asistente',                      8,  false, false, 100,  90,   10,   9,    'staff'),
  ('AUD', 'Pasante',                        9,  false, false, 50,   45,   5,    5,    'staff'),
  ('AUD', 'Gerente - Especialista IT',      10, false, false, 560,  455,  80,   65,   'specialist_it'),
  ('AUD', 'Senior - Especialista IT',       11, false, false, 350,  280,  35,   28,   'senior'),
  ('AUD', 'Asistente - Especialista IT',    12, false, false, 100,  90,   10,   9,    'staff'),
  ('AUD', 'Gerente - Especialista Tax',     13, false, false, 630,  525,  90,   75,   'specialist_tax'),
  ('AUD', 'Senior - Especialista Tax',      14, false, false, 350,  280,  35,   28,   'senior'),
  ('AUD', 'Asistente - Especialista Tax',   15, false, false, 100,  90,   10,   9,    'staff'),
  -- Compliance (8)
  ('COM', 'Socio',                          1,  true,  true,  280,  280,  28,   28,   'partner'),
  ('COM', 'Director',                       2,  true,  true,  250,  250,  25,   25,   'director'),
  ('COM', 'Gerente',                        3,  false, true,  180,  180,  18,   18,   'manager'),
  ('COM', 'Supervisor',                     4,  false, false, 120,  120,  12,   12,   'senior'),
  ('COM', 'Senior',                         5,  false, false, 80,   80,   8,    8,    'senior'),
  ('COM', 'Semi Senior',                    6,  false, false, 50,   50,   5,    5,    'semisenior'),
  ('COM', 'Asistente',                      7,  false, false, 25,   25,   2.5,  2.5,  'staff'),
  ('COM', 'Pasante',                        8,  false, false, 0,    0,    0,    0,    'staff'),
  -- Tax & Advisory (8)
  ('TAX', 'Socio',                          1,  true,  true,  308,  308,  30.8, 30.8, 'partner'),
  ('TAX', 'Director',                       2,  true,  true,  275,  275,  27.5, 27.5, 'director'),
  ('TAX', 'Gerente',                        3,  false, true,  198,  198,  19.8, 19.8, 'manager'),
  ('TAX', 'Supervisor',                     4,  false, false, 132,  132,  13.2, 13.2, 'senior'),
  ('TAX', 'Senior',                         5,  false, false, 88,   88,   8.8,  8.8,  'senior'),
  ('TAX', 'Semi Senior',                    6,  false, false, 55,   55,   5.5,  5.5,  'semisenior'),
  ('TAX', 'Asistente',                      7,  false, false, 27.5, 27.5, 2.75, 2.75, 'staff'),
  ('TAX', 'Pasante',                        8,  false, false, 0,    0,    0,    0,    'staff'),
  -- Precios de Transferencias (8)
  ('PTR', 'Socio',                          1,  true,  true,  308,  308,  30.8, 30.8, 'partner'),
  ('PTR', 'Director',                       2,  true,  true,  275,  275,  27.5, 27.5, 'director'),
  ('PTR', 'Gerente',                        3,  false, true,  198,  198,  19.8, 19.8, 'manager'),
  ('PTR', 'Supervisor',                     4,  false, false, 132,  132,  13.2, 13.2, 'senior'),
  ('PTR', 'Senior',                         5,  false, false, 88,   88,   8.8,  8.8,  'senior'),
  ('PTR', 'Semi Senior',                    6,  false, false, 55,   55,   5.5,  5.5,  'semisenior'),
  ('PTR', 'Asistente',                      7,  false, false, 27.5, 27.5, 2.75, 2.75, 'staff'),
  ('PTR', 'Pasante',                        8,  false, false, 0,    0,    0,    0,    'staff'),
  -- M&A (8)
  ('MYA', 'Socio',                          1,  true,  true,  308,  308,  30.8, 30.8, 'partner'),
  ('MYA', 'Director',                       2,  true,  true,  275,  275,  27.5, 27.5, 'director'),
  ('MYA', 'Gerente',                        3,  false, true,  198,  198,  19.8, 19.8, 'manager'),
  ('MYA', 'Supervisor',                     4,  false, false, 132,  132,  13.2, 13.2, 'senior'),
  ('MYA', 'Senior',                         5,  false, false, 88,   88,   8.8,  8.8,  'senior'),
  ('MYA', 'Semi Senior',                    6,  false, false, 55,   55,   5.5,  5.5,  'semisenior'),
  ('MYA', 'Asistente',                      7,  false, false, 27.5, 27.5, 2.75, 2.75, 'staff'),
  ('MYA', 'Pasante',                        8,  false, false, 0,    0,    0,    0,    'staff'),
  -- Legal (6)
  ('LEG', 'Socio',                          1,  true,  true,  308,  308,  30.8, 30.8, 'partner'),
  ('LEG', 'Director',                       2,  true,  true,  275,  275,  27.5, 27.5, 'director'),
  ('LEG', 'Gerente/Asociado Senior',        3,  false, true,  198,  198,  19.8, 19.8, 'manager'),
  ('LEG', 'Asociado',                       4,  false, false, 88,   88,   8.8,  8.8,  'senior'),
  ('LEG', 'Asociado Junior',                5,  false, false, 55,   55,   5.5,  5.5,  'semisenior'),
  ('LEG', 'Abogado practicante',            6,  false, false, 27.5, 27.5, 2.75, 2.75, 'staff'),
  -- Growth & Strategy (8)
  ('GYS', 'Socio',                          1,  true,  true,  308,  308,  30.8, 30.8, 'partner'),
  ('GYS', 'Director',                       2,  true,  true,  275,  275,  27.5, 27.5, 'director'),
  ('GYS', 'Gerente',                        3,  false, true,  198,  198,  19.8, 19.8, 'manager'),
  ('GYS', 'Supervisor',                     4,  false, false, 132,  132,  13.2, 13.2, 'senior'),
  ('GYS', 'Senior',                         5,  false, false, 88,   88,   8.8,  8.8,  'senior'),
  ('GYS', 'Semi Senior',                    6,  false, false, 55,   55,   5.5,  5.5,  'semisenior'),
  ('GYS', 'Asistente',                      7,  false, false, 27.5, 27.5, 2.75, 2.75, 'staff'),
  ('GYS', 'Pasante',                        8,  false, false, 0,    0,    0,    0,    'staff')
) AS v(abbrev, category_name, display_order, can_approve_wo, can_approve_timesheets,
       rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd, default_app_role)
JOIN public.practicas p ON p.abbreviation = v.abbrev
ON CONFLICT (practica_id, category_name) DO NOTHING;

-- 3. Activity codes (24 + ADM) — esquema ordinal {ABREV}-A{n}. Cero códigos de las
-- poblaciones legacy A/B (informe §5.0): ninguno de PLN/FLD/REV/DOC/MTG/TRV/TRN se recrea.
INSERT INTO public.activity_codes (activity_code, description, practica_id)
SELECT v.code, v.description, p.practica_id
FROM (VALUES
  ('AUD-A1', 'Actividades Previas',        'AUD'),
  ('AUD-A2', 'Planificación',               'AUD'),
  ('AUD-A3', 'Ejecución',                   'AUD'),
  ('AUD-A4', 'Informes',                    'AUD'),
  ('AUD-A5', 'Actividades IT Audit',        'AUD'),
  ('AUD-A6', 'Actividades Tax',             'AUD'),
  ('COM-A1', 'Planificación',               'COM'),
  ('COM-A2', 'Ejecución',                   'COM'),
  ('COM-A3', 'Informes y discusiones',      'COM'),
  ('TAX-A1', 'Planificación',               'TAX'),
  ('TAX-A2', 'Ejecución',                   'TAX'),
  ('TAX-A3', 'Informes y discusiones',      'TAX'),
  ('PTR-A1', 'Planificación',               'PTR'),
  ('PTR-A2', 'Ejecución',                   'PTR'),
  ('PTR-A3', 'Informes y discusiones',      'PTR'),
  ('MYA-A1', 'Planificación',               'MYA'),
  ('MYA-A2', 'Ejecución',                   'MYA'),
  ('MYA-A3', 'Informes y discusiones',      'MYA'),
  ('LEG-A1', 'Planificación',               'LEG'),
  ('LEG-A2', 'Ejecución',                   'LEG'),
  ('LEG-A3', 'Informes y discusiones',      'LEG'),
  ('GYS-A1', 'Planificación',               'GYS'),
  ('GYS-A2', 'Ejecución',                   'GYS'),
  ('GYS-A3', 'Informes y discusiones',      'GYS')
) AS v(code, description, abbrev)
JOIN public.practicas p ON p.abbreviation = v.abbrev
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;

-- La fila ADM: actividad de sistema, no cuelga de ninguna práctica (diseño is_system, informe
-- §5, plan §2.2.1). Descripción 'Administrative' — estado final real antes del incidente de
-- purga (20260217233439 la actualizó de 'Administration' a 'Administrative').
INSERT INTO public.activity_codes (activity_code, description, is_system, practica_id)
VALUES ('ADM', 'Administrative', true, NULL)
ON CONFLICT (activity_code) WHERE (is_active = true) DO NOTHING;
