-- Migración cero — Fase 4 (plan §4.1/§4.2): seed de catálogos base sin dependencias.
-- society (2), industries (32), expense_types (9). Sociedades: bugs/migracion_cero/datos_maestros.md;
-- industrias y gastos definitivos: bugs/ETL/01_lineaNegocio-industries.md y 05_tipos_gastos.md
-- (ETL fase 1, bugs/ETL/carga/fase1/plan_v2.md F1-M04; copiados literal, no de memoria). Todo INSERT con guarda de idempotencia sobre la clave
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

-- 2. Industrias (public.industries) — 32 filas de ETL 01 (26 activas, 6 inactivas), que SUSTITUYEN
-- a las 10 provisionales: no se unen ambos catálogos. Los nombres se conservan tal como los
-- devuelve la base legacy (algunos vienen truncados a 50 caracteres: es el dato de origen, no una
-- omisión). Las líneas con RETIRADO se crean 'inactive': se conservan para referencias históricas
-- pero no se ofrecen para asignaciones nuevas. La línea 28 (Miscellaneous) se normaliza a
-- 'Misceláneo'. Cierre fiscal: 'March 31' para los IDs legacy 10, 12 y 37; 'December 31' el resto. Se siembra en INGLÉS,
-- el formato estándar que guarda y espera la app (src/lib/fiscalYearDisplay.ts); la interfaz lo muestra localizado
-- ("31 de marzo" / "31 de diciembre" en español). ETL 01 lista el texto en español: la carga de fase 2 debe escribir el valor inglés.
INSERT INTO public.industries (industry_name, fiscal_year_end, status) VALUES
  ('Administrativo',                                                  'December 31'      , 'active'),
  ('/RETIRADO) Not currently assigned',                               'December 31'      , 'inactive'),
  ('Financial Services-Insurance',                                    'December 31'      , 'active'),
  ('Industrial Markets-Automotive',                                   'March 31'         ,     'active'),
  ('Energy & Natural Resources-Energy & Natural Resour',              'December 31'      , 'active'),
  ('Industrial Markets-Industrial Manufacturing',                     'March 31'         ,     'active'),
  ('(RETIRADO) Consumer & Retail-Food & Drink',                       'December 31'      , 'inactive'),
  ('Consumer & Retail-Retail',                                        'December 31'      , 'active'),
  ('Technology, Media & Telecommunications-Telecommuni',              'December 31'      , 'active'),
  ('Technology, Media & Telecommunications-Media',                    'December 31'      , 'active'),
  ('Technology, Media & Telecommunications-Technology',               'December 31'      , 'active'),
  ('Infrastructure, Government & Healthcare-Profession',              'December 31'      , 'active'),
  ('Infrastructure, Government & Healthcare-Healthcare',              'December 31'      , 'active'),
  ('Life Sciences-Life Sciences',                                     'December 31'      , 'active'),
  ('Infrastructure, Government & Healthcare-Government',              'December 31'      , 'active'),
  ('Financial Services-Capital Markets',                              'December 31'      , 'active'),
  ('(RETIRADO) Financial Services-Investment Managemen',              'December 31'      , 'inactive'),
  ('Financial Services-Banking',                                      'December 31'      , 'active'),
  ('Consumer & Retail-Consumer Goods',                                'December 31'      , 'active'),
  ('Infrastructure, Government & Healthcare-Building &',              'December 31'      , 'active'),
  ('Infrastructure, Government & Healthcare-Transport',               'December 31'      , 'active'),
  ('Misceláneo',                                                      'December 31'      , 'active'),
  ('Memorandum Reporting-Pension Funds',                              'December 31'      , 'active'),
  ('Memorandum Reporting-Real Estate',                                'December 31'      , 'active'),
  ('Memorandum Reporting-Private Equity',                             'December 31'      , 'active'),
  ('Memorandum Reporting-Enterprise',                                 'December 31'      , 'active'),
  ('Infrastructure, Government & Healthcare-Internatio',              'December 31'      , 'active'),
  ('Memorandum Reporting-Sovereign Wealth Funds',                     'December 31'      , 'active'),
  ('(RETIRADO) Financial Services',                                   'December 31'      , 'inactive'),
  ('(RETIRADO) Non-Governmental Organization - NGO',                  'December 31'      , 'inactive'),
  ('(RETIRADO) Chemicals & Pharmaceuticals',                          'March 31'         ,     'inactive'),
  ('Financial Services-Asset Management',                             'December 31'      , 'active')
ON CONFLICT (industry_name) DO NOTHING;

-- 3. Tipos de gasto (public.expense_types) — 9 filas de ETL 05, que SUSTITUYEN a las 5
-- provisionales. Viáticos tiene un costo unitario por defecto de 90.00 (BOB, por decisión del
-- operador; la tabla no tiene columna de moneda y no se añade); los demás, 0.00.
INSERT INTO public.expense_types (expense_name, default_unit_cost) VALUES
  ('Viaje',            0),
  ('Pasajes',          0),
  ('Hotel',            0),
  ('Viáticos',        90),
  ('Comunicaciones',   0),
  ('Reproducción',     0),
  ('Movilidad',        0),
  ('Circularización',  0),
  ('Otros',            0)
ON CONFLICT (expense_name) DO NOTHING;
