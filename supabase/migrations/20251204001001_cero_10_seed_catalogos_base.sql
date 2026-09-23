-- Migración cero — Fase 4 (plan §4.1/§4.2): seed de catálogos base sin dependencias.
-- society (2), industries (10), expense_types (5). Fuente: bugs/migracion_cero/datos_maestros.md
-- (copiado literal, no de memoria). Todo INSERT con guarda de idempotencia sobre la clave
-- natural (ON CONFLICT ... DO NOTHING) — este archivo puede reaplicarse sin duplicar filas.

-- 1. Sociedad (public.society) — ya documentado como seedeado en el historial original
-- (20260812140000_0810-173_staff_society_and_service.sql); acá se siembra de cero porque esa
-- migración no pasa al set consolidado (plan §2.1: cero datos fuera de Fase 4).
-- 2026-09-17: corrige el nombre de la segunda sociedad -- "Juaregui" (u antes de la
-- a) era un typo de transposición; el nombre correcto es "Jauregui", sin tilde.
INSERT INTO public.society (name, is_active) VALUES
  ('Ruizmier Pelaez S.R.L.',   true),
  ('Ruizmier Jauregui S.R.L.', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Industrias (public.industries) — 10 filas, sin "Otro" (decisión del catálogo maestro).
-- La columna "Temporada Predeterminada" del catálogo maestro no tiene columna en el esquema
-- (public.industries solo tiene industry_name/fiscal_year_end) — no se siembra porque no hay
-- dónde guardarla, no es una omisión.
INSERT INTO public.industries (industry_name, fiscal_year_end) VALUES
  ('Agroindustria',       '30 de junio'),
  ('Banca',                '31 de diciembre'),
  ('Comercial',            '31 de diciembre'),
  ('Hidrocarburos',        '31 de diciembre'),
  ('Industrial',           '31 de marzo'),
  ('Minería',              '30 de septiembre'),
  ('Seguros',              '31 de diciembre'),
  ('Servicios',            '31 de diciembre'),
  ('Telecomunicaciones',   '31 de diciembre'),
  ('Valores',              '31 de diciembre')
ON CONFLICT (industry_name) DO NOTHING;

-- 3. Tipos de gasto (public.expense_types) — 5 filas provisionales (issue #262, plan §7.7 del
-- informe): el listado definitivo de la firma lo actualiza otro esfuerzo, no bloquea acá.
INSERT INTO public.expense_types (expense_name, default_unit_cost) VALUES
  ('Pasajes aéreos',    1000),
  ('Pasajes terrestre',  500),
  ('Transporte',          20),
  ('Hospedaje',          400),
  ('Refrigerio',          20)
ON CONFLICT (expense_name) DO NOTHING;
