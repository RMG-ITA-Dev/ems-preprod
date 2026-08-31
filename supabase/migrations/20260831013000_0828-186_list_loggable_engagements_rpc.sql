--
-- BUG 0828-186 (Plan v2): RPC dedicado para los selectores de carga de horas (Hoja de
-- Tiempo, Tracker/Registro Diario, Carga Manual).
--
-- Hallazgo del plan: el INSERT de time_entries ya NO exige asignación
-- (cero_05_rls_policies.sql:1459, "time_entries insert" -> solo
-- has_permission('time_entry.create') AND staff_id = get_my_staff_id()). El único bloqueo
-- real es de VISIBILIDAD: los 3 selectores leen `engagements` bajo la policy "engagements
-- read" (alcance assigned_engagements), que oculta encargos no asignados. Decisión del
-- operador (2026-08-30): todos los empleados deben poder ENCONTRAR todos los encargos
-- elegibles para cargar horas, sin importar asignación -- alguien no asignado puede ayudar
-- una semana y el manager aprueba después.
--
-- Este RPC NO reemplaza is_assigned_to_engagement()/is_assigned_to_client() ni toca la RLS
-- general de `engagements` -- eso quedó fuera de alcance de este issue (visibilidad de
-- scheduler en OT/worksheets/dashboards, Punto A del reporte). Es SECURITY DEFINER,
-- gateado por has_permission('time_entry.create'): quien no puede cargar horas recibe una
-- lista vacía.
--

CREATE FUNCTION public.list_loggable_engagements()
  RETURNS TABLE (
    engagement_id uuid,
    engagement_code character varying(50),
    engagement_name character varying(255),
    activity_required boolean,
    work_order_required boolean,
    is_internal boolean,
    practica smallint,
    funcion smallint,
    start_date date,
    end_date date,
    engagement_state_override smallint,
    client_id uuid,
    client_legal_name character varying(255)
  )
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- funcion (0827-184, mergeado tras crear este RPC): 0 administrativa, 1 cliente,
  -- 2 capacitación, 3 calidad. Los selectores de actividad (filterActivitiesForEngagement)
  -- lo necesitan para decidir si el encargo requiere actividad -- viajaba en el SELECT
  -- directo a `engagements` que este RPC reemplazó, así que debe seguir viajando aquí.
  SELECT e.engagement_id, e.engagement_code, e.engagement_name,
         e.activity_required, e.work_order_required, e.is_internal,
         e.practica, e.funcion, e.start_date, e.end_date, e.engagement_state_override,
         e.client_id, c.client_legal_name
    FROM public.engagements e
    LEFT JOIN public.clients c ON c.client_id = e.client_id
   WHERE public.has_permission('time_entry.create')
     AND e.status = 'active'
     -- Regla de check_wo_approved()/engagement_allows_hours_or_requests(): con override manual
     -- presente, SOLO 4 (Aprobado) y 5 (Aprobado Emergencia) permiten cargar horas -- el resto
     -- (1 Pendiente, 2 AprobadoSocio, 3 AprobadoRiesgos, 6/7/8/9) bloquea, sin importar OT.
     AND (e.engagement_state_override IS NULL OR e.engagement_state_override IN (4, 5))
     AND (
       -- Group A: encargo con Orden de Trabajo Aprobada (y Riesgos no Rechazado).
       EXISTS (
         SELECT 1 FROM public.work_orders wo
          WHERE wo.engagement_id = e.engagement_id
            AND wo.approval_status = 'Approved'
            AND COALESCE(wo.risk_status, '') <> 'Rejected'
       )
       -- Group B: administrativo (sin OT requerida).
       OR e.work_order_required = false
       -- Group B: override manual Aprobado/Emergencia (4/5), cargable aunque la OT no lo esté.
       OR e.engagement_state_override IN (4, 5)
     )
   -- Paridad con las queries que reemplaza (Tracker/Carga Manual ordenaban created_at DESC).
   ORDER BY e.created_at DESC, e.engagement_id
$$;

COMMENT ON FUNCTION public.list_loggable_engagements() IS 'BUG 0828-186: encargos elegibles para cargar horas (Hoja de Tiempo/Tracker/Carga Manual), sin filtrar por asignación -- alcance decidido por el operador. Gateado por time_entry.create. No sustituye is_assigned_to_engagement/is_assigned_to_client (fuera de alcance de este issue).';

REVOKE ALL ON FUNCTION public.list_loggable_engagements() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_loggable_engagements() TO authenticated;
GRANT ALL ON FUNCTION public.list_loggable_engagements() TO service_role;
