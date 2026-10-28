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
-- ETL fase 1 (bugs/ETL/carga/fase1/plan_v2.md F1-M07): el INSERT con CROSS JOIN a la ficha fija de
-- cero_14 se sustituye por la función public.seed_initial_holidays(uuid). Una instalación nueva
-- NO tiene ningún feriado hasta que la consola de fase 1 la ejecuta con el administrador ya
-- confirmado; el CROSS JOIN contra un staff inexistente habría omitido las 28 filas en silencio.
--
-- Contrato:
--   * LANGUAGE plpgsql, SECURITY INVOKER, search_path = public. Ejecutable SOLO por el propietario
--     de las migraciones (conexión SQL del operador): se revoca de PUBLIC, anon, authenticated y
--     service_role. Una función que escribe feriados a nombre de otra persona no se expone por API.
--   * Valida que p_created_by sea un staff activo, no borrado, enlazado a Auth y con rol efectivo admin.
--   * Compara las filas existentes con el catálogo y el autor esperado ANTES de aceptar una
--     reanudación: un feriado con la misma (fecha, oficina) pero nombre o autor distinto aborta toda
--     la llamada, sin sobrescribir nada.
--   * Inserta solo los faltantes; una repetición correcta no modifica ninguna fila.
--   * Comprueba el conjunto esperado completo y devuelve 28.
CREATE OR REPLACE FUNCTION public.seed_initial_holidays(p_created_by uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO public
AS $$
DECLARE
  v_expected constant integer := 28;
  v_inserted integer;
  v_present  integer;
  v_conflicts text;
BEGIN
  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'HOLIDAYS_ACTOR_INVALID: falta el staff autor';
  END IF;

  -- El rol se consulta con el helper SECURITY DEFINER has_role(), no con una lectura directa de la
  -- tabla de roles: la suite B2 exige que toda función de public que lea esa tabla sea SECURITY
  -- DEFINER del dueño. El helper comprueba el espejo app_role = admin, que handle_new_user() y
  -- admin_set_user_role_key() mantienen sincronizado con role_key = admin.
  IF NOT EXISTS (
    SELECT 1
      FROM public.staff s
     WHERE s.staff_id = p_created_by
       AND s.is_active IS TRUE
       AND s.deleted_at IS NULL
       AND s.auth_user_id IS NOT NULL
       AND public.has_role(s.auth_user_id, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'HOLIDAYS_ACTOR_INVALID: % no es un staff activo, enlazado a Auth y con rol admin', p_created_by;
  END IF;

  -- Repetible dentro de una misma transacción: se descarta cualquier copia previa.
  DROP TABLE IF EXISTS pg_temp._seed_holidays_catalog;
  CREATE TEMP TABLE _seed_holidays_catalog (
    holiday_date date NOT NULL,
    holiday_name text NOT NULL,
    oficina smallint NOT NULL,
    PRIMARY KEY (holiday_date, oficina)
  ) ON COMMIT DROP;

  INSERT INTO _seed_holidays_catalog (holiday_date, holiday_name, oficina)
  SELECT v.holiday_date::date, v.holiday_name, v.oficina
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
  ) AS v(holiday_date, holiday_name, oficina);

  IF (SELECT count(*) FROM _seed_holidays_catalog) <> v_expected THEN
    RAISE EXCEPTION 'HOLIDAYS_CATALOG_INVALID: el catálogo literal no tiene % filas', v_expected;
  END IF;

  SELECT string_agg(format('%s/oficina %s', h.holiday_date, h.oficina), ', ' ORDER BY h.holiday_date, h.oficina)
    INTO v_conflicts
    FROM public.holidays h
    JOIN _seed_holidays_catalog c ON c.holiday_date = h.holiday_date AND c.oficina = h.oficina
   WHERE h.holiday_name IS DISTINCT FROM c.holiday_name
      OR h.created_by IS DISTINCT FROM p_created_by;
  IF v_conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'HOLIDAYS_CONFLICT: feriados existentes contradicen el catálogo o el autor esperado: %', v_conflicts;
  END IF;

  INSERT INTO public.holidays (holiday_date, holiday_name, oficina, created_by)
  SELECT c.holiday_date, c.holiday_name, c.oficina, p_created_by
    FROM _seed_holidays_catalog c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.holidays h
      WHERE h.holiday_date = c.holiday_date AND h.oficina = c.oficina
   );
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT count(*) INTO v_present
    FROM _seed_holidays_catalog c
    JOIN public.holidays h
      ON h.holiday_date = c.holiday_date AND h.oficina = c.oficina
     AND h.holiday_name = c.holiday_name AND h.created_by = p_created_by;
  IF v_present <> v_expected THEN
    RAISE EXCEPTION 'HOLIDAYS_INCOMPLETE: el calendario tiene % de % filas esperadas (insertadas en esta llamada: %)', v_present, v_expected, v_inserted;
  END IF;

  RETURN v_present;
END;
$$;

COMMENT ON FUNCTION public.seed_initial_holidays(uuid) IS
  'ETL fase 1: siembra el calendario inicial (28 feriados) a nombre de un administrador confirmado. Solo propietario; repetible sin modificar filas; aborta ante contradicciones.';

REVOKE ALL ON FUNCTION public.seed_initial_holidays(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_initial_holidays(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seed_initial_holidays(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.seed_initial_holidays(uuid) FROM service_role;
