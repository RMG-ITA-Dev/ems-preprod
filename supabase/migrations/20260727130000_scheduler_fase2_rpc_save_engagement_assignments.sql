-- Fase 2 del Scheduler — C4: RPC save_engagement_assignments.
--
-- Referencia: bugs/scheduler/fase_2/plan_v2.md, sección
-- "C4 — save_engagement_assignments(p_engagement_id uuid, p_upserts jsonb, p_deleted_ids uuid[])".
-- Diff explícito, no estado completo: el borrado nunca se infiere de la ausencia
-- (engagementAssignments.ts:57-64) — por eso p_deleted_ids es un argumento separado, no derivado
-- de "lo que falta en p_upserts".
--
-- Contrato del payload p_upserts (jsonb array; enmendado en Fase 5 — bugs/scheduler/fase_5/
-- plan_v2.md, Open Questions O1/O4/O7 — ANTES de la primera ejecución en Supabase, sin migración
-- nueva porque C4 todavía no corrió en ningún ambiente real):
--   [
--     {
--       "assignment_id": uuid,          -- SIEMPRE requerido. El cliente lo genera una sola vez
--                                        -- (crypto.randomUUID()) y lo conserva entre reintentos:
--                                        -- si la fila YA existe en este engagement -> UPDATE; si
--                                        -- no existe -> INSERT con ese id. Repetir el mismo insert
--                                        -- tras un commit no-acusado es entonces idempotente (la
--                                        -- segunda llamada encuentra la fila y sólo la actualiza
--                                        -- con los mismos valores) en vez de duplicar.
--       "staff_id": uuid,
--       "category_id": uuid,
--       "start_date": "yyyy-mm-dd",
--       "end_date": "yyyy-mm-dd",
--       "hours_per_week": numeric,
--       "allocation_percent": numeric,
--       "notes": text | null
--     },
--     ...
--   ]
-- p_deleted_ids: assignment_id[] a soft-borrar (deleted_at = now()) — la tabla ya es soft-delete
-- (columna deleted_at, índices parciales WHERE deleted_at IS NULL desde Phase 3/D5).
--
-- Autorización: is_admin() OR is_engagement_responsible() — sin is_engagement_team_member()
-- explícito porque is_engagement_responsible() ya incluye manager_id/partner_id en su IN(...)
-- (creado en C1); listarlo también sería redundante, no un permiso adicional.
--
-- Fase 5 O4: cada segmento del payload debe caer dentro del rango inclusivo start_date..end_date
-- del engagement (si el engagement tiene fechas — un legado sin fechas queda sin cota, igual que
-- el precedente de practica IS NULL). Fase 5 O7 (enmendado tras review): un INSERT nuevo, o un
-- UPDATE que CAMBIA el staff_id de una fila existente, sólo se acepta si el staff está activo y
-- is_schedulable=true; una fila que conserva su staff_id histórico está exenta, para no bloquear
-- a un staff que se volvió inactivo después de ser asignado.
CREATE OR REPLACE FUNCTION public.save_engagement_assignments(
  p_engagement_id uuid,
  p_upserts       jsonb,
  p_deleted_ids   uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_state_override smallint;
  v_practica        smallint;
  v_eng_start       date;
  v_eng_end         date;
  v_service_id      uuid;
  v_cat_service     uuid;
  v_row             jsonb;
  v_assignment_id   uuid;
  v_staff_id        uuid;
  v_category_id     uuid;
  v_start_date      date;
  v_end_date        date;
  v_hours           numeric;
  v_allocation      numeric;
  v_exists          boolean;
  v_persisted_staff_id uuid;
  v_staff_active    boolean;
  v_staff_schedulable boolean;
  v_result          jsonb;
BEGIN
  p_upserts     := COALESCE(p_upserts, '[]'::jsonb);
  p_deleted_ids := COALESCE(p_deleted_ids, ARRAY[]::uuid[]);

  -- 1-3. Resolver + bloquear el engagement (serializa escrituras concurrentes, hace correcto el
  --      chequeo de overlaps del paso 6), autorizar, y confirmar que acepta escrituras.
  SELECT engagement_state_override, practica, start_date, end_date
    INTO v_state_override, v_practica, v_eng_start, v_eng_end
    FROM public.engagements
   WHERE engagement_id = p_engagement_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EAS_ENGAGEMENT_NOT_FOUND'
      USING DETAIL = jsonb_build_object('engagement_id', p_engagement_id)::text;
  END IF;

  IF NOT (public.is_admin() OR public.is_engagement_responsible(p_engagement_id)) THEN
    RAISE EXCEPTION 'EAS_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.engagement_accepts_assignment_writes(p_engagement_id) THEN
    RAISE EXCEPTION 'EAS_ENGAGEMENT_LOCKED'
      USING DETAIL = jsonb_build_object(
              'engagement_id', p_engagement_id,
              'engagement_state_override', v_state_override)::text;
  END IF;

  IF v_practica IS NOT NULL THEN
    SELECT service_id INTO v_service_id FROM public.services WHERE code = v_practica;
  END IF;

  -- 4. Validar TODO el payload antes de escribir nada.
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_upserts)
  LOOP
    v_assignment_id := (v_row->>'assignment_id')::uuid;
    v_staff_id    := (v_row->>'staff_id')::uuid;
    v_category_id := (v_row->>'category_id')::uuid;
    v_start_date  := (v_row->>'start_date')::date;
    v_end_date    := (v_row->>'end_date')::date;
    v_hours       := (v_row->>'hours_per_week')::numeric;
    v_allocation  := (v_row->>'allocation_percent')::numeric;

    -- Fase 5 O1: assignment_id ahora es SIEMPRE requerido — lo genera el cliente una sola vez
    -- (insert idempotente) y lo conserva para updates.
    IF v_assignment_id IS NULL OR v_staff_id IS NULL OR v_category_id IS NULL
       OR v_start_date IS NULL OR v_end_date IS NULL OR v_hours IS NULL OR v_allocation IS NULL THEN
      RAISE EXCEPTION 'EAS_MISSING_FIELD'
        USING DETAIL = jsonb_build_object('row', v_row)::text;
    END IF;

    -- Mismo día es válido (intersección inclusiva, mismo criterio que el overlap del paso 6).
    IF v_end_date < v_start_date THEN
      RAISE EXCEPTION 'EAS_DATE_RANGE'
        USING DETAIL = jsonb_build_object('start_date', v_start_date, 'end_date', v_end_date)::text;
    END IF;

    -- Fase 5 O4: el segmento debe caer dentro del rango inclusivo del engagement (si el
    -- engagement tiene fechas — un legado sin fechas queda sin cota).
    IF (v_eng_start IS NOT NULL AND v_start_date < v_eng_start)
       OR (v_eng_end IS NOT NULL AND v_end_date > v_eng_end) THEN
      RAISE EXCEPTION 'EAS_ENGAGEMENT_RANGE'
        USING DETAIL = jsonb_build_object(
                'start_date', v_start_date, 'end_date', v_end_date,
                'engagement_start_date', v_eng_start, 'engagement_end_date', v_eng_end)::text;
    END IF;

    IF v_hours <= 0 OR v_hours > 80 THEN
      RAISE EXCEPTION 'EAS_HOURS_RANGE'
        USING DETAIL = jsonb_build_object('hours_per_week', v_hours)::text;
    END IF;

    IF v_allocation <= 0 OR v_allocation > 100 THEN
      RAISE EXCEPTION 'EAS_ALLOCATION_RANGE'
        USING DETAIL = jsonb_build_object('allocation_percent', v_allocation)::text;
    END IF;

    IF v_service_id IS NOT NULL THEN
      SELECT service_id INTO v_cat_service FROM public.categories WHERE category_id = v_category_id;
      IF v_cat_service IS DISTINCT FROM v_service_id THEN
        RAISE EXCEPTION 'EAS_CATEGORY_FOREIGN_SERVICE'
          USING DETAIL = jsonb_build_object('category_id', v_category_id)::text;
      END IF;
    END IF;

    -- Fase 5 O7 (enmienda del review #4): elegibilidad de staff para inserts nuevos Y para
    -- updates que CAMBIAN el staff_id de una fila existente — una fila que conserva su staff_id
    -- histórico está exenta (permite staff inactivo/no-schedulable ya asignado sin re-validar en
    -- cada guardado no relacionado), pero reasignar la fila a un staff DISTINTO exige la misma
    -- elegibilidad que un insert nuevo.
    SELECT EXISTS (
      SELECT 1 FROM public.engagement_assignments
       WHERE assignment_id = v_assignment_id AND engagement_id = p_engagement_id
    ) INTO v_exists;

    v_persisted_staff_id := NULL;
    IF v_exists THEN
      SELECT staff_id INTO v_persisted_staff_id
        FROM public.engagement_assignments
       WHERE assignment_id = v_assignment_id AND engagement_id = p_engagement_id;
    END IF;

    IF NOT v_exists OR v_persisted_staff_id IS DISTINCT FROM v_staff_id THEN
      SELECT is_active, is_schedulable INTO v_staff_active, v_staff_schedulable
        FROM public.staff
       WHERE staff_id = v_staff_id;
      IF v_staff_active IS NOT TRUE OR v_staff_schedulable IS NOT TRUE THEN
        RAISE EXCEPTION 'EAS_STAFF_INELIGIBLE'
          USING DETAIL = jsonb_build_object('staff_id', v_staff_id)::text;
      END IF;
    END IF;
  END LOOP;

  -- 5. Aplicar el diff explícito: soft-delete -> update -> insert (en ese orden). status nunca se
  --    escribe (el DEFAULT de la BD gobierna — decisión de negocio Q1, F2 solo verifica PROPOSED
  --    en C2); created_by tampoco (paridad con el cliente, que igual lo omite hoy).
  IF cardinality(p_deleted_ids) > 0 THEN
    UPDATE public.engagement_assignments
       SET deleted_at = now()
     WHERE assignment_id = ANY(p_deleted_ids)
       AND engagement_id = p_engagement_id
       AND deleted_at IS NULL;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_upserts)
  LOOP
    v_assignment_id := (v_row->>'assignment_id')::uuid;

    -- Fase 5 O1: idempotencia por UUID cliente — la fila YA existe en este engagement -> UPDATE;
    -- si no -> INSERT con ese mismo id (un reintento tras un commit no-acusado encuentra la fila
    -- en la segunda llamada y actualiza en vez de duplicar).
    SELECT EXISTS (
      SELECT 1 FROM public.engagement_assignments
       WHERE assignment_id = v_assignment_id AND engagement_id = p_engagement_id
    ) INTO v_exists;

    IF v_exists THEN
      UPDATE public.engagement_assignments
         SET staff_id           = (v_row->>'staff_id')::uuid,
             category_id        = (v_row->>'category_id')::uuid,
             start_date         = (v_row->>'start_date')::date,
             end_date           = (v_row->>'end_date')::date,
             hours_per_week     = (v_row->>'hours_per_week')::numeric,
             allocation_percent = (v_row->>'allocation_percent')::numeric,
             notes              = v_row->>'notes'
       WHERE assignment_id = v_assignment_id
         AND engagement_id = p_engagement_id;
    ELSE
      INSERT INTO public.engagement_assignments (
        assignment_id, engagement_id, staff_id, category_id,
        start_date, end_date, hours_per_week, allocation_percent, notes
      ) VALUES (
        v_assignment_id,
        p_engagement_id,
        (v_row->>'staff_id')::uuid,
        (v_row->>'category_id')::uuid,
        (v_row->>'start_date')::date,
        (v_row->>'end_date')::date,
        (v_row->>'hours_per_week')::numeric,
        (v_row->>'allocation_percent')::numeric,
        v_row->>'notes'
      );
    END IF;
  END LOOP;

  -- 6. Overlap detection: contra el estado YA persistido (preexistentes intocados + actualizados +
  --    nuevos), tras aplicar el diff completo del paso 5 — verifica tanto contra preexistentes como
  --    dentro del propio payload de una sola pasada. '[]' reproduce la intersección inclusiva del
  --    cliente. El RAISE revierte TODA la transacción (incluido el paso 5) si dispara.
  IF EXISTS (
    SELECT 1 FROM public.engagement_assignments a
    JOIN public.engagement_assignments b
      ON b.engagement_id = a.engagement_id
     AND b.staff_id = a.staff_id
     AND b.assignment_id <> a.assignment_id
     AND daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
    WHERE a.engagement_id = p_engagement_id
      AND a.deleted_at IS NULL
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'EAS_OVERLAP';
  END IF;

  -- 7. Devolver el estado final persistido, con la forma que lee useEngagementAssignments.
  --    No renombrar engagement_assignments_staff_id_fkey.
  SELECT jsonb_agg(
           jsonb_build_object(
             'assignment_id', a.assignment_id,
             'staff_id', a.staff_id,
             'category_id', a.category_id,
             'start_date', a.start_date,
             'end_date', a.end_date,
             'hours_per_week', a.hours_per_week,
             'allocation_percent', a.allocation_percent,
             'status', a.status,
             'notes', a.notes
           )
         )
    INTO v_result
    FROM public.engagement_assignments a
   WHERE a.engagement_id = p_engagement_id
     AND a.deleted_at IS NULL;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.save_engagement_assignments(uuid, jsonb, uuid[]) FROM PUBLIC;
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'service_role'] LOOP
    IF to_regrole(r) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.save_engagement_assignments(uuid, jsonb, uuid[]) FROM %I', r);
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.save_engagement_assignments(uuid, jsonb, uuid[]) TO authenticated;
