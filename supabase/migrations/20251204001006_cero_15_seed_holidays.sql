-- Migración cero — Fase 4 (plan §4.1/§4.2, decisión §0.1): seed de holidays 2026-2027.
-- Fuente de verdad: src/lib/boliviaHolidays.ts — getBoliviaNationalHolidays(año), con
-- traslado dominical. Estas 26 filas son EXACTAMENTE su salida (verificado corriendo el
-- generador: 13 filas/año = 11 nacionales oficina=0 + La Paz oficina=1 + Santa Cruz
-- oficina=2) — no se re-derivan a mano, se transcriben del resultado real del algoritmo.
--
-- Extras del catálogo maestro (datos_maestros.md): 2 "Feriado adicional (puente)"
-- (2026-06-05, 2026-08-07) no vienen del generador. Decisión del operador (2026-08-23):
-- se siembran renombradas a "Puente (Adicional)" — cumple el patrón protegido de sufijo
-- "(Adicional)" exigido por §0.1, así NATIONAL_HOLIDAY_NAMES nunca las puede colisionar
-- ni el botón "Generar" las toca.
--
-- created_by: sub-select del staff del bootstrap (cero_14) por email — depende de cero_14.

INSERT INTO public.holidays (holiday_date, holiday_name, oficina, created_by)
SELECT v.holiday_date::date, v.holiday_name, v.oficina, s.staff_id
FROM (VALUES
  -- 2026 — getBoliviaNationalHolidays(2026), con traslado dominical
  ('2026-01-01', 'Año Nuevo',                                     0),
  ('2026-01-22', 'Día del Estado Plurinacional',                  0),
  ('2026-02-16', 'Lunes de Carnaval',                              0),
  ('2026-02-17', 'Martes de Carnaval',                             0),
  ('2026-04-03', 'Viernes Santo',                                  0),
  ('2026-05-01', 'Día del Trabajo',                                0),
  ('2026-06-04', 'Corpus Christi',                                 0),
  ('2026-06-22', 'Año Nuevo Andino Amazónico',                     0),
  ('2026-07-16', 'Aniversario del Departamento de La Paz',         1),
  ('2026-08-06', 'Día de la Independencia',                        0),
  ('2026-09-24', 'Aniversario del Departamento de Santa Cruz',     2),
  ('2026-11-02', 'Día de los Difuntos',                            0),
  ('2026-12-25', 'Navidad',                                        0),
  -- 2026 — extras del catálogo maestro, nombre con sufijo protegido (decisión 2026-08-23)
  ('2026-06-05', 'Puente (Adicional)',                             0),
  ('2026-08-07', 'Puente (Adicional)',                             0),
  -- 2027 — getBoliviaNationalHolidays(2027), con traslado dominical
  ('2027-01-01', 'Año Nuevo',                                     0),
  ('2027-01-22', 'Día del Estado Plurinacional',                  0),
  ('2027-02-08', 'Lunes de Carnaval',                              0),
  ('2027-02-09', 'Martes de Carnaval',                             0),
  ('2027-03-26', 'Viernes Santo',                                  0),
  ('2027-05-01', 'Día del Trabajo',                                0),
  ('2027-05-27', 'Corpus Christi',                                 0),
  ('2027-06-21', 'Año Nuevo Andino Amazónico',                     0),
  ('2027-07-16', 'Aniversario del Departamento de La Paz',         1),
  ('2027-08-06', 'Día de la Independencia',                        0),
  ('2027-09-24', 'Aniversario del Departamento de Santa Cruz',     2),
  ('2027-11-02', 'Día de los Difuntos',                            0),
  ('2027-12-25', 'Navidad',                                        0)
) AS v(holiday_date, holiday_name, oficina)
CROSS JOIN (
  SELECT staff_id FROM public.staff WHERE lower(trim(email)) = 'neilgraneros@ruizmier.com'
) AS s
ON CONFLICT (holiday_date, oficina) DO NOTHING;
