-- Fase 2 del Scheduler — C3: RPC save_wo_staffing.
--
-- Referencia: bugs/scheduler/fase_2/plan_v2.md, sección "C3 — save_wo_staffing".
-- Reutiliza el precedente batch_upsert_worksheet_cells (20260719000000): payload jsonb,
-- autorización que espeja explícitamente la RLS que evita, delete+insert en un solo cuerpo =
-- atomicidad.
--
-- Contrato del payload p_requirements (jsonb array; asumido — no existe todavía
-- useWorkOrderStaffingRequirements en este repo para espejar; F4 debe confirmar/ajustar la forma
-- exacta contra el hook real, ver Regression Risks de plan_v2.md):
--   [
--     {
--       "category_id": uuid,
--       "staff_count": int,
--       "skills": [ { "skill_id": uuid, "min_proficiency_level": "Beginner"|"Intermediate"|"Advanced" }, ... ]
--     },
--     ...
--   ]
-- Estado completo, no diff: cualquier categoría/skill ya persistida que NO aparezca en el payload
-- se borra (mismo contrato que useWorkOrderStaffingRequirements probablemente use, dado que no
-- hay p_deleted_ids como en C4 — a confirmar en F4).
--
-- Autorización: is_admin() OR is_engagement_team_member() OR is_engagement_responsible() — el
-- texto de C3 en plan_v2.md solo lista los primeros 2, pero se agrega is_engagement_responsible()
-- (creado en C1) por consistencia con la RLS directa de wo_staffing_requirements (que sí la
-- incluye desde C1): sin esto, sqr/specialist_it/specialist_tax solo podrían escribir vía DML
-- directo, evadiendo TODAS las validaciones de esta RPC (duplicados, rango, proficiency,
-- categoría cruzada) — exactamente lo que Q3 busca evitar, no facilitar.
CREATE OR REPLACE FUNCTION public.save_wo_staffing(
  p_wo_id        uuid,
  p_requirements jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_engagement_id uuid;
  v_status        text;
  v_practica      smallint;
  v_service_id    uuid;
  v_cat_service   uuid;
  v_category_id   uuid;
  v_staff_count   int;
  v_req           jsonb;
  v_skill         jsonb;
  v_result        jsonb;
BEGIN
  p_requirements := COALESCE(p_requirements, '[]'::jsonb);

  -- 1-2. Resolver + bloquear el work order (serializa transacciones concurrentes), autorizar,
  --      y exigir Draft (solo Draft editable — WorkOrderEdit.tsx:296-297 trata Approved/
  --      Pending_Approval/Rejected como bloqueados; cierra el bloqueo de G8).
  SELECT wo.engagement_id, wo.approval_status
    INTO v_engagement_id, v_status
    FROM public.work_orders wo
   WHERE wo.wo_id = p_wo_id
   FOR UPDATE;

  IF v_engagement_id IS NULL THEN
    RAISE EXCEPTION 'WOS_WO_NOT_FOUND'
      USING DETAIL = jsonb_build_object('wo_id', p_wo_id)::text;
  END IF;

  IF NOT (
    public.is_admin()
    OR public.is_engagement_team_member(v_engagement_id)
    OR public.is_engagement_responsible(v_engagement_id)
  ) THEN
    RAISE EXCEPTION 'WOS_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'Draft' THEN
    RAISE EXCEPTION 'WOS_WO_LOCKED'
      USING DETAIL = jsonb_build_object('wo_id', p_wo_id, 'status', v_status)::text;
  END IF;

  -- 3. practica del engagement, para el chequeo de categoría cruzada (omitido si NULL — engagement
  --    legado sin servicio asignado, mismo precedente que los triggers de C2).
  SELECT e.practica INTO v_practica FROM public.engagements e WHERE e.engagement_id = v_engagement_id;
  IF v_practica IS NOT NULL THEN
    SELECT service_id INTO v_service_id FROM public.services WHERE code = v_practica;
  END IF;

  -- 4. Validar TODO el payload antes de tocar ninguna fila (todo-o-nada).
  IF EXISTS (
    SELECT 1 FROM (
      SELECT (elem->>'category_id')::uuid AS category_id
        FROM jsonb_array_elements(p_requirements) elem
    ) dup
    GROUP BY category_id
   HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'WOS_REQUIREMENT_DUPLICATE';
  END IF;

  FOR v_req IN SELECT * FROM jsonb_array_elements(p_requirements)
  LOOP
    v_category_id := (v_req->>'category_id')::uuid;
    v_staff_count := (v_req->>'staff_count')::int;

    IF v_staff_count IS NULL OR v_staff_count < 1 OR v_staff_count > 999 THEN
      RAISE EXCEPTION 'WOS_STAFF_COUNT_RANGE'
        USING DETAIL = jsonb_build_object('category_id', v_category_id, 'staff_count', v_staff_count)::text;
    END IF;

    IF v_service_id IS NOT NULL THEN
      SELECT service_id INTO v_cat_service FROM public.categories WHERE category_id = v_category_id;
      IF v_cat_service IS DISTINCT FROM v_service_id THEN
        RAISE EXCEPTION 'WOS_CATEGORY_FOREIGN_SERVICE'
          USING DETAIL = jsonb_build_object('category_id', v_category_id)::text;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM (
        SELECT (s->>'skill_id')::uuid AS skill_id
          FROM jsonb_array_elements(COALESCE(v_req->'skills', '[]'::jsonb)) s
      ) dup
      GROUP BY skill_id
     HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'WOS_SKILL_DUPLICATE'
        USING DETAIL = jsonb_build_object('category_id', v_category_id)::text;
    END IF;

    FOR v_skill IN SELECT * FROM jsonb_array_elements(COALESCE(v_req->'skills', '[]'::jsonb))
    LOOP
      IF (v_skill->>'min_proficiency_level') NOT IN ('Beginner', 'Intermediate', 'Advanced') THEN
        RAISE EXCEPTION 'WOS_PROFICIENCY_INVALID'
          USING DETAIL = jsonb_build_object(
                  'category_id', v_category_id,
                  'skill_id', v_skill->>'skill_id',
                  'min_proficiency_level', v_skill->>'min_proficiency_level')::text;
      END IF;
    END LOOP;
  END LOOP;

  -- 5. Aplicar en el orden del cliente: borrar skills ausentes -> borrar requisitos ausentes
  --    (CASCADE, redundante con lo anterior pero explícito) -> upsert requisitos -> upsert skills.

  DELETE FROM public.wo_staffing_requirement_skills rs
   USING public.wo_staffing_requirements r
   WHERE rs.requirement_id = r.id
     AND r.wo_id = p_wo_id
     AND NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(p_requirements) req
         JOIN jsonb_array_elements(COALESCE(req->'skills', '[]'::jsonb)) sk ON true
        WHERE (req->>'category_id')::uuid = r.category_id
          AND (sk->>'skill_id')::uuid = rs.skill_id
     );

  DELETE FROM public.wo_staffing_requirements r
   WHERE r.wo_id = p_wo_id
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_requirements) req
        WHERE (req->>'category_id')::uuid = r.category_id
     );

  INSERT INTO public.wo_staffing_requirements (wo_id, category_id, staff_count)
  SELECT p_wo_id, (req->>'category_id')::uuid, (req->>'staff_count')::int
    FROM jsonb_array_elements(p_requirements) req
  ON CONFLICT (wo_id, category_id) DO UPDATE
    SET staff_count = EXCLUDED.staff_count,
        updated_at  = now();

  INSERT INTO public.wo_staffing_requirement_skills (requirement_id, skill_id, min_proficiency_level)
  SELECT r.id, (sk->>'skill_id')::uuid, sk->>'min_proficiency_level'
    FROM jsonb_array_elements(p_requirements) req
    JOIN public.wo_staffing_requirements r
      ON r.wo_id = p_wo_id AND r.category_id = (req->>'category_id')::uuid
    JOIN jsonb_array_elements(COALESCE(req->'skills', '[]'::jsonb)) sk ON true
  ON CONFLICT (requirement_id, skill_id) DO UPDATE
    SET min_proficiency_level = EXCLUDED.min_proficiency_level;

  -- 6. Devolver el estado final persistido.
  SELECT jsonb_agg(
           jsonb_build_object(
             'id', r.id,
             'category_id', r.category_id,
             'staff_count', r.staff_count,
             'skills', COALESCE(sk.skills, '[]'::jsonb)
           )
         )
    INTO v_result
    FROM public.wo_staffing_requirements r
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
               jsonb_build_object('skill_id', rs.skill_id, 'min_proficiency_level', rs.min_proficiency_level)
             ) AS skills
        FROM public.wo_staffing_requirement_skills rs
       WHERE rs.requirement_id = r.id
    ) sk ON true
   WHERE r.wo_id = p_wo_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.save_wo_staffing(uuid, jsonb) FROM PUBLIC;
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'service_role'] LOOP
    IF to_regrole(r) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.save_wo_staffing(uuid, jsonb) FROM %I', r);
    END IF;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.save_wo_staffing(uuid, jsonb) TO authenticated;
