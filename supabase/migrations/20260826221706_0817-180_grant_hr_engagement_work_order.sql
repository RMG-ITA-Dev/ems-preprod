-- Cambio suelto en fix/0817-180 (pedido directo del operador, 2026-08-26; no forma parte del
-- root cause del bug 0817-180 — tracking informal, sin bugs/ propio).
--
-- Otorga a hr_manager y hr_analyst ("Talento Humano") el permiso para crear y gestionar encargos
-- Administrativa/Capacitación para el personal, y sus órdenes de trabajo asociadas. Antes de esta
-- migración ninguno de los dos roles tenía engagement.* ni work_order.*, así que no podían siquiera
-- llegar a /engagements/new (el PermissionRoute lo gatea con engagement.create).
--
-- Scope 'assigned_engagements' en todos los casos, igual que `manager` para estos mismos
-- permisos — Talento Humano gestiona sus propios encargos, no la cartera completa de la firma.
--
-- Incluye además timesheet_approval.read/approve/reject (mismo scope, mismo motivo):
-- Talento Humano ya es manager_id de los encargos que crea, pero sin este permiso no aparece
-- en get_timesheet_approvers() ni puede leer/aprobar/rechazar las líneas de horas cargadas
-- contra esos encargos:
--   - can_approve_timesheet_line() (cero_02:405) exige el permiso timesheet_approval.approve
--     Y manager_id/partner_id = aprobador — ya cumple manager_id, solo falta el permiso.
--   - get_timesheet_approvers() (cero_02:3053) filtra candidatos por manager_id/partner_id del
--     encargo Y por tener timesheet_approval.approve — sin el permiso, Talento Humano nunca
--     entra en la lista de aprobadores de ese periodo.
-- El valor de scope_key no rama la lógica en estas funciones (solo importa que el permiso
-- exista); se usa 'assigned_engagements' por consistencia con `manager`, no porque el código
-- lo lea explícitamente.
INSERT INTO public.authorization_role_permissions (role_key, permission_key, scope_key) VALUES
  ('hr_manager', 'engagement.create', 'assigned_engagements'),
  ('hr_manager', 'engagement.read',   'assigned_engagements'),
  ('hr_manager', 'engagement.update', 'assigned_engagements'),
  ('hr_manager', 'worksheet.read',    'assigned_engagements'),
  ('hr_manager', 'worksheet.create',  'assigned_engagements'),
  ('hr_manager', 'work_order.read',                  'assigned_engagements'),
  ('hr_manager', 'work_order.create',                'assigned_engagements'),
  ('hr_manager', 'work_order.update',                'assigned_engagements'),
  ('hr_manager', 'work_order.payment_plan.approve',  'assigned_engagements'),
  ('hr_manager', 'work_order.risk.approve',          'assigned_engagements'),
  ('hr_manager', 'timesheet_approval.read',          'assigned_engagements'),
  ('hr_manager', 'timesheet_approval.approve',       'assigned_engagements'),
  ('hr_manager', 'timesheet_approval.reject',        'assigned_engagements'),

  ('hr_analyst', 'engagement.create', 'assigned_engagements'),
  ('hr_analyst', 'engagement.read',   'assigned_engagements'),
  ('hr_analyst', 'engagement.update', 'assigned_engagements'),
  ('hr_analyst', 'worksheet.read',    'assigned_engagements'),
  ('hr_analyst', 'worksheet.create',  'assigned_engagements'),
  ('hr_analyst', 'work_order.read',                  'assigned_engagements'),
  ('hr_analyst', 'work_order.create',                'assigned_engagements'),
  ('hr_analyst', 'work_order.update',                'assigned_engagements'),
  ('hr_analyst', 'work_order.payment_plan.approve',  'assigned_engagements'),
  ('hr_analyst', 'work_order.risk.approve',          'assigned_engagements'),
  ('hr_analyst', 'timesheet_approval.read',          'assigned_engagements'),
  ('hr_analyst', 'timesheet_approval.approve',       'assigned_engagements'),
  ('hr_analyst', 'timesheet_approval.reject',        'assigned_engagements')
ON CONFLICT (role_key, permission_key) DO UPDATE SET scope_key = EXCLUDED.scope_key;


-- Decisión del operador, 2026-08-27: "no hagamos casos especiales" — el Gerente de Talento
-- Humano se comporta como cualquier otro Gerente: crea su encargo, queda autoasignado como
-- manager_id, y aprueba las horas que se le carguen. Sin esto, los grants de arriba (engagement.*/
-- work_order.*/worksheet.*/timesheet_approval.* con scope 'assigned_engagements') NO tenían efecto
-- práctico: hr_manager estaba explícitamente EXCLUIDO de los seis campos del bloque Equipo
-- (0722-162, decisión del operador 2026-08-17) y de la autoasignación al crear (0810-172), así que
-- nunca podía llegar a ser manager_id/partner_id/sqr_id/encargado_id de NINGÚN encargo — ni el suyo
-- propio. Sin ser manager_id/partner_id, is_assigned_to_engagement() y get_timesheet_approvers()
-- (cero_02:3468,3053) nunca lo reconocen, así que jamás veía la Matriz de Trabajo, la Orden de
-- Trabajo ni aparecía como aprobador de horas de lo que él mismo creaba. hr_analyst se deja FUERA
-- a propósito, igual que el resto de los `*_analyst` (ninguno es candidato hoy) — no es un
-- descuido, es el mismo criterio que ya aplicaba a accounting_analyst/collections_analyst.
--
-- Reemplaza get_engagement_team_candidates() (cero_02:2677) para que hr_manager aparezca en el
-- grupo 'manager' del combobox "Gerente/Supervisor" — espejo en src/lib/engagementTeamCandidates.ts
-- (ROLE_KEY_TO_GROUP).
CREATE OR REPLACE FUNCTION public.get_engagement_team_candidates() RETURNS TABLE(staff_id uuid, display_name text, candidate_group text, practica_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT s.staff_id,
         (s.first_name || ' ' || s.last_name)::text AS display_name,
         -- Solo el ROL BASE de cada nivel (decisión de negocio 2026-08-17), MÁS hr_manager
         -- (0817-180, decisión del operador 2026-08-27: TH se comporta como cualquier otro
         -- Gerente, sin caso especial). Fuera: senior_partner, risk_partner, risk_supervisor,
         -- it_security_manager, accounting_*, hr_analyst, collections_analyst, sqr, assistant,
         -- viewer y admin.
         -- Este CASE está espejado en src/lib/engagementTeamCandidates.ts
         -- (ROLE_KEY_TO_GROUP); si se toca uno, tocar el otro.
         CASE ur.role_key
           WHEN 'partner'       THEN 'partner_director'
           WHEN 'director'      THEN 'partner_director'
           WHEN 'manager'       THEN 'manager'
           WHEN 'hr_manager'    THEN 'manager'
           WHEN 'senior'        THEN 'encargado'
           WHEN 'semisenior'    THEN 'encargado'
           WHEN 'ita_manager'   THEN 'specialist_it'
           WHEN 'ita_senior'    THEN 'specialist_it'
           WHEN 'ita_assistant' THEN 'specialist_it'
           WHEN 'tax_manager'   THEN 'specialist_tax'
           WHEN 'tax_senior'    THEN 'specialist_tax'
           WHEN 'tax_assistant' THEN 'specialist_tax'
         END AS candidate_group,
         -- El cliente refina por el servicio del encargo sin volver a pedir datos.
         s.practica_id
    FROM public.staff s
    -- INNER JOIN: excluye al personal sin cuenta vinculada (staff.auth_user_id es nullable
    -- por diseño — se vincula por email vía trigger) y, con el IN de abajo, a quien tenga
    -- role_key NULL. Es el comportamiento decidido: sin rol asignado no hay elegibilidad.
    JOIN public.user_roles ur          ON ur.user_id  = s.auth_user_id
    JOIN public.authorization_roles ar ON ar.role_key = ur.role_key
   WHERE (public.has_permission('engagement.create')
          OR public.has_permission('engagement.update'))
     AND s.is_active
     AND s.deleted_at IS NULL
     AND ar.is_active
     AND ur.role_key IN ('partner','director','manager','hr_manager','senior','semisenior',
                         'ita_manager','ita_senior','ita_assistant',
                         'tax_manager','tax_senior','tax_assistant')
   ORDER BY s.last_name, s.first_name;
$$;

COMMENT ON FUNCTION public.get_engagement_team_candidates() IS 'BUG 0722-162 (actualizado 0817-180, 2026-08-27): candidatos elegibles por campo del bloque Equipo del encargo. Agrupa role_key en 5 grupos de candidatura (partner_director, manager, encargado, specialist_it, specialist_tax) y NO expone email, auth_user_id ni el role_key crudo. hr_manager se agregó al grupo manager (decisión del operador: TH se comporta como cualquier otro Gerente). Gateada por engagement.create OR engagement.update, así que cubre creación y edición con un solo RPC.';


-- Reemplaza enforce_engagement_creator_team() (cero_02:1393) para que hr_manager también quede
-- autoasignado a manager_id al crear, igual que `manager` — espejo en
-- src/lib/engagementSelfAssignment.ts (SELF_ASSIGN_MANAGER_ROLE_KEYS).
CREATE OR REPLACE FUNCTION public.enforce_engagement_creator_team() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role  text;
  v_staff uuid;
BEGIN
  -- Sin identidad autenticada no hay a quién asignar: seeds, imports, migraciones de backfill y
  -- cualquier operación con service_role pasan intactas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Espejo EXACTO del `isAdmin` del formulario (`roleKey === "admin"` vía
  -- get_my_authorization_context). A PROPÓSITO no se usa public.is_admin(): esa helper lee el enum
  -- LEGACY `user_roles.role` (20260107032620, nunca redefinida), no `role_key`. Un usuario con
  -- role_key = 'admin' cuyo espejo legacy no diga 'admin' vería su elección reescrita pese a que la
  -- UI se la ofrece editable.
  v_role := public.current_role_key();
  IF v_role IS NULL OR v_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Sin staff vinculado no hay `staff_id` que canonizar. Se deja el payload intacto: escribir NULL
  -- en un campo que el negocio considera obligatorio sería peor, y rechazar dejaría al usuario sin
  -- forma de crear nada. Es el mismo criterio fail-open que aplica la UI, que en ese caso tampoco
  -- bloquea el campo.
  v_staff := public.get_my_staff_id();
  IF v_staff IS NULL THEN
    RETURN NEW;
  END IF;

  -- ESPEJO de src/lib/engagementSelfAssignment.ts (SELF_ASSIGN_PARTNER_ROLE_KEYS /
  -- SELF_ASSIGN_MANAGER_ROLE_KEYS). Si se toca uno, tocar el otro.
  --
  -- Solo los roles BASE, igual que el mapa de candidatos de 0722-162, MÁS hr_manager (0817-180,
  -- 2026-08-27). Quedan deliberadamente FUERA (sin restricción alguna): ita_manager y tax_manager
  -- — que sí tienen engagement.create pero pertenecen a los grupos specialist_it/specialist_tax y
  -- por lo tanto no son candidatos elegibles para el campo Gerente — más senior_partner,
  -- risk_partner, risk_supervisor, it_security_manager, accounting_*, hr_analyst, sqr, senior,
  -- semisenior y assistant.
  IF v_role IN ('partner', 'director') THEN
    NEW.partner_id := v_staff;
  ELSIF v_role IN ('manager', 'hr_manager') THEN
    NEW.manager_id := v_staff;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_engagement_creator_team() IS 'BUG 0810-172 (actualizado 0817-180, 2026-08-27): en la CREACIÓN de un encargo canoniza partner_id/manager_id al staff del llamante según su role_key (partner/director -> partner_id; manager/hr_manager -> manager_id). Exentos: role_key admin, inserts sin auth.uid() (seeds/service_role) y llamantes sin staff vinculado. Espejo de src/lib/engagementSelfAssignment.ts. Solo INSERT: el UPDATE no aplica esta regla.';
