-- Fase 2 del Scheduler — C2: convergencia de esquema.
--
-- Referencia: bugs/scheduler/fase_2/plan_v2.md, sección "C2 — Convergencia de esquema".
-- Cierra: G6 (staff.is_schedulable fantasma), G5 (verifica el default de status, no lo cambia —
-- ver Q1), G4 (gate de estado mínimo), G3 (service-scope backstop vía triggers).
--
-- A diferencia de C1 (solo catálogo), esta migración SÍ puede abortar por datos: la sonda de G5
-- hace RAISE si el default de `status` no es el esperado, y el trigger backstop rechazará
-- cualquier INSERT/UPDATE existente que ya tuviera una categoría fuera de servicio (no debería
-- haber ninguno — las tablas nacen vacías en A/B/C — pero en el Lovable real de P8 sí podría).

-- =====================================================================
-- 1. staff.is_schedulable (cierra G6)
--
-- Columna fantasma: ninguna migración la crea, pero types.ts ya la trae (boolean no-nullable) y
-- el Lovable real ya la tiene con esta forma exacta — IF NOT EXISTS es legítimo acá porque la
-- preexistencia está confirmada, no asumida.
-- =====================================================================
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS is_schedulable boolean NOT NULL DEFAULT true;

-- =====================================================================
-- 2. Verificar el default de engagement_assignments.status (G5)
--
-- El issue solo exige "default válido + inserts no fallan" — ya se cumple con PROPOSED
-- (useEngagementAssignmentMutations.ts omite status a propósito). Esta sonda CONFIRMA el default
-- en catálogo y aborta si difiere, en vez de asumirlo silenciosamente. No cambia nada — el cambio
-- a CONFIRMED es una decisión de negocio (Q1), fuera de alcance de F2.
-- =====================================================================
DO $$
DECLARE
  v_default text;
BEGIN
  SELECT column_default INTO v_default
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'engagement_assignments'
     AND column_name  = 'status';

  IF v_default IS DISTINCT FROM '''PROPOSED''::text' THEN
    RAISE EXCEPTION
      'engagement_assignments.status default drifted from PROPOSED (found %). Esto es una decisión de negocio pendiente (Q1 de plan_v2.md) — no se auto-corrige.',
      v_default;
  END IF;
END $$;

-- =====================================================================
-- 3. Gate de estado mínimo (cierra G4)
--
-- Verificado (estado_encargo_0602-135.sql + engagementStatus.ts): los estados derivados de la OT
-- son solo {1,2,3,4,5,8}; 6 Cancelado / 7 Finalizado / 9 Congelado ocurren únicamente en
-- engagement_state_override (manual o cron). Por tanto el gate NO necesita replicar
-- deriveEngagementState en SQL — basta con excluir los 3 terminales.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.engagement_accepts_assignment_writes(p_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT engagement_state_override NOT IN (6, 7, 9)
       FROM public.engagements
      WHERE engagement_id = p_engagement_id),
    true)  -- override NULL (estado derivado 1..5/8) o engagement inexistente ⇒ escribible
$$;

REVOKE EXECUTE ON FUNCTION public.engagement_accepts_assignment_writes(uuid) FROM PUBLIC;
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'service_role'] LOOP
    IF to_regrole(r) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.engagement_accepts_assignment_writes(uuid) FROM %I', r);
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.engagement_accepts_assignment_writes(uuid) TO authenticated;

-- =====================================================================
-- 4. Triggers de service-scope (cierra G3) — calcados de
--    enforce_worksheet_cell_service_scope (20260719000000_0714_154_worksheet_service_scope.sql):
--    RETURN NEW si practica IS NULL (engagement legado sin servicio, sin scope); RAISE si la
--    categoría no pertenece al servicio del engagement. Backstop además de la validación
--    equivalente en las RPC (C3/C4) — defensa en profundidad, no el único guardia.
-- =====================================================================

-- --- wo_staffing_requirements: resuelve el engagement vía work_orders.engagement_id ---
CREATE OR REPLACE FUNCTION public.enforce_wo_staffing_service_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_practica    smallint;
  v_service_id  uuid;
  v_cat_service uuid;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
   WHERE wo.wo_id = NEW.wo_id;

  -- Engagement sin servicio asignado: sin scope, igual que el precedente.
  IF v_practica IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT service_id INTO v_service_id
    FROM public.services
   WHERE code = v_practica;

  SELECT service_id INTO v_cat_service
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_service IS DISTINCT FROM v_service_id THEN
    RAISE EXCEPTION 'Category % does not belong to the work order''s engagement service', NEW.category_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_wo_staffing_service_scope ON public.wo_staffing_requirements;
CREATE TRIGGER trg_enforce_wo_staffing_service_scope
  BEFORE INSERT OR UPDATE ON public.wo_staffing_requirements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_wo_staffing_service_scope();

-- --- engagement_assignments: resuelve el engagement directo (columna propia) ---
CREATE OR REPLACE FUNCTION public.enforce_assignment_service_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_practica    smallint;
  v_service_id  uuid;
  v_cat_service uuid;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.engagements e
   WHERE e.engagement_id = NEW.engagement_id;

  IF v_practica IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT service_id INTO v_service_id
    FROM public.services
   WHERE code = v_practica;

  SELECT service_id INTO v_cat_service
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_service IS DISTINCT FROM v_service_id THEN
    RAISE EXCEPTION 'Category % does not belong to the engagement''s service', NEW.category_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_assignment_service_scope ON public.engagement_assignments;
CREATE TRIGGER trg_enforce_assignment_service_scope
  BEFORE INSERT OR UPDATE ON public.engagement_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_assignment_service_scope();

-- =====================================================================
-- 5. Pre-flight de categorías cruzadas (issue §6) — informativo, no bloquea.
--    En A/B/C las tablas nacen vacías (no-op garantizado); en el Lovable real de P8 esto sí
--    puede tener filas — el conteo queda para ese diagnóstico, no para esta migración.
-- =====================================================================
DO $$
DECLARE
  v_count_req integer;
  v_count_ea  integer;
BEGIN
  SELECT count(*) INTO v_count_req
    FROM public.wo_staffing_requirements r
    JOIN public.work_orders wo  ON wo.wo_id = r.wo_id
    JOIN public.engagements e   ON e.engagement_id = wo.engagement_id
    JOIN public.services svc    ON svc.code = e.practica
    JOIN public.categories c    ON c.category_id = r.category_id
   WHERE e.practica IS NOT NULL
     AND c.service_id <> svc.service_id;

  IF v_count_req > 0 THEN
    RAISE NOTICE 'Pre-flight (informativo): % fila(s) de wo_staffing_requirements referencian una categoría fuera del servicio del engagement', v_count_req;
  END IF;

  SELECT count(*) INTO v_count_ea
    FROM public.engagement_assignments a
    JOIN public.engagements e ON e.engagement_id = a.engagement_id
    JOIN public.services svc  ON svc.code = e.practica
    JOIN public.categories c  ON c.category_id = a.category_id
   WHERE e.practica IS NOT NULL
     AND c.service_id <> svc.service_id
     AND a.deleted_at IS NULL;

  IF v_count_ea > 0 THEN
    RAISE NOTICE 'Pre-flight (informativo): % fila(s) de engagement_assignments referencian una categoría fuera del servicio del engagement', v_count_ea;
  END IF;
END $$;

-- =====================================================================
-- 6. Extender la guarda de copy_categories_between_services (cierra el resto de G8) —
--    de 4 a 6 referrers, agregando los 2 nuevos FK ON DELETE RESTRICT hacia categories que trae
--    el scheduler. Firma idéntica a 20260703000001_service_scoped_categories_fixes.sql (#3 review
--    fix): validar source/target activos y rate-bearing, bloquear en modo reemplazo si el target
--    tiene categorías referenciadas — ahora también por wo_staffing_requirements/
--    engagement_assignments, no solo por staff/wo_budget_lines/activity_worksheet_cells/
--    activity_codes.default_category_id.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.copy_categories_between_services(
  p_source_service_id uuid,
  p_target_service_id uuid,
  p_replace           boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_src_active   boolean;
  v_src_allows   boolean;
  v_tgt_active   boolean;
  v_tgt_allows   boolean;
  v_target_count integer;
  v_referenced   integer;
  v_inserted     integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  IF p_source_service_id = p_target_service_id THEN
    RAISE EXCEPTION 'same_service';
  END IF;

  SELECT is_active, allows_rates_activities
    INTO v_src_active, v_src_allows
    FROM public.services
   WHERE service_id = p_source_service_id;

  IF v_src_active IS NULL THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;
  IF NOT v_src_active OR NOT v_src_allows THEN
    RAISE EXCEPTION 'source_invalid';
  END IF;

  SELECT is_active, allows_rates_activities
    INTO v_tgt_active, v_tgt_allows
    FROM public.services
   WHERE service_id = p_target_service_id
   FOR UPDATE;

  IF v_tgt_active IS NULL THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;
  IF NOT v_tgt_active OR NOT v_tgt_allows THEN
    RAISE EXCEPTION 'target_invalid';
  END IF;

  SELECT COUNT(*) INTO v_target_count
    FROM public.categories
   WHERE service_id = p_target_service_id;

  IF v_target_count > 0 THEN
    IF NOT p_replace THEN
      RAISE EXCEPTION 'target_not_empty';
    END IF;

    SELECT COUNT(*) INTO v_referenced
      FROM public.categories c
     WHERE c.service_id = p_target_service_id
       AND (
         EXISTS (SELECT 1 FROM public.staff s WHERE s.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.wo_budget_lines b WHERE b.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.activity_worksheet_cells w WHERE w.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.activity_codes a WHERE a.default_category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.wo_staffing_requirements r WHERE r.category_id = c.category_id)
         OR EXISTS (SELECT 1 FROM public.engagement_assignments ea WHERE ea.category_id = c.category_id)
       );

    IF v_referenced > 0 THEN
      RAISE EXCEPTION 'target_referenced';
    END IF;

    DELETE FROM public.categories WHERE service_id = p_target_service_id;
  END IF;

  INSERT INTO public.categories (
    service_id, category_name, display_order,
    rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
    can_approve_wo, can_approve_timesheets, default_app_role
  )
  SELECT p_target_service_id,
         src.category_name,
         row_number() OVER (ORDER BY src.display_order, src.category_name),
         src.rate_high_bob, src.rate_low_bob, src.rate_high_usd, src.rate_low_usd,
         src.can_approve_wo, src.can_approve_timesheets, src.default_app_role
    FROM public.categories src
   WHERE src.service_id = p_source_service_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_categories_between_services(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_categories_between_services(uuid, uuid, boolean) TO authenticated;
