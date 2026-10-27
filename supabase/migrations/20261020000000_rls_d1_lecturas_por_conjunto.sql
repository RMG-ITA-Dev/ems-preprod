-- d1_lecturas_por_conjunto.sql - BORRADOR de la migracion de correccion D1 (Etapa 3 de la campana k6 en xcdc, 19-20/10/2026).
-- Objetivo: que las politicas RLS de LECTURA dejen de llamar funciones SECURITY DEFINER FILA POR FILA. Mismo patron que ya usa time_entries
-- (engagement_id IN (SELECT my_responsible_engagement_ids())): el conjunto se calcula UNA vez por consulta; lo que no depende de la fila se envuelve en (SELECT ...).
-- Regla de oro: cada politica reescrita conserva EXACTAMENTE su semantica (mismo conjunto de filas visibles para cada cuenta). Se verifica con e3_50_equivalencia.sql
-- (huella md5 de los ids visibles por cuenta y tabla, antes y despues) y, para escrituras, con e3_51_escrituras.sql en el desechable.
-- Solo se tocan politicas de SELECT y las ALL cuyo SELECT era caro. NO se tocan las de INSERT/UPDATE/DELETE (can_approve_* de UPDATE, wo_create_by_permission, ea_team_*, etc.).

-- ============ 1. Funciones de conjunto (SECURITY DEFINER: leen sin RLS, como my_responsible_engagement_ids) ============
CREATE OR REPLACE FUNCTION public.my_assigned_engagement_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo de is_assigned_to_engagement(): yo en (socio, gerente, sqr, encargado).
  SELECT e.engagement_id FROM public.engagements e
   WHERE (SELECT public.get_my_staff_id()) IN (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id)
$$;

CREATE OR REPLACE FUNCTION public.my_team_engagement_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo de is_engagement_team_member(): gerente o socio.
  SELECT e.engagement_id FROM public.engagements e
   WHERE e.manager_id = (SELECT public.get_my_staff_id()) OR e.partner_id = (SELECT public.get_my_staff_id())
$$;

CREATE OR REPLACE FUNCTION public.my_staffed_engagement_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo de is_engagement_responsible(): yo en los seis cargos del equipo.
  SELECT e.engagement_id FROM public.engagements e
   WHERE (SELECT public.get_my_staff_id()) IN (e.manager_id, e.partner_id, e.sqr_id, e.encargado_id, e.specialist_it_id, e.specialist_tax_id)
$$;

CREATE OR REPLACE FUNCTION public.my_assigned_client_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo de is_assigned_to_client(): clientes con algun encargo donde ocupo uno de los seis cargos.
  SELECT e.client_id FROM public.engagements e
   WHERE (SELECT public.get_my_staff_id()) IN (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id, e.specialist_it_id, e.specialist_tax_id)
$$;

CREATE OR REPLACE FUNCTION public.my_assignment_engagement_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo de has_assignment_on_engagement(): tengo una asignacion vigente en el encargo.
  SELECT ea.engagement_id FROM public.engagement_assignments ea
   WHERE ea.staff_id = (SELECT public.get_my_staff_id()) AND ea.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.my_fund_request_engagement_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo de engagement_in_my_fund_request(): se llama a la funcion real, pero solo para los encargos con alguna solicitud enviada.
  SELECT e.engagement_id FROM public.engagements e
   WHERE e.engagement_id IN (
           SELECT wo.engagement_id
             FROM public.fund_request_work_orders frwo
             JOIN public.fund_requests fr ON fr.fund_request_id = frwo.fund_request_id
             JOIN public.work_orders wo ON wo.wo_id = frwo.wo_id
            WHERE fr.status <> 'borrador')
     AND public.engagement_in_my_fund_request(e.engagement_id)
$$;

CREATE OR REPLACE FUNCTION public.my_fund_request_wo_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo de wo_in_my_fund_request(): idem, solo para OT con alguna solicitud enviada.
  SELECT DISTINCT frwo.wo_id
    FROM public.fund_request_work_orders frwo
    JOIN public.fund_requests fr ON fr.fund_request_id = frwo.fund_request_id
   WHERE fr.status <> 'borrador' AND public.wo_in_my_fund_request(frwo.wo_id)
$$;

CREATE OR REPLACE FUNCTION public.my_sqr_visible_engagement_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo del EXISTS de "Assigned SQR can view work orders": encargos donde soy SQR Y que la RLS de engagements me deja ver (RLS anidada).
  SELECT e.engagement_id FROM public.engagements e
   WHERE e.sqr_id = (SELECT public.get_my_staff_id())
     AND e.engagement_id IN (SELECT public.my_visible_engagement_ids())
$$;

CREATE OR REPLACE FUNCTION public.my_team_wo_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT wo.wo_id FROM public.work_orders wo
   WHERE wo.engagement_id IN (SELECT e.engagement_id FROM public.engagements e
                               WHERE e.manager_id = (SELECT public.get_my_staff_id()) OR e.partner_id = (SELECT public.get_my_staff_id()))
$$;

CREATE OR REPLACE FUNCTION public.my_assigned_wo_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT wo.wo_id FROM public.work_orders wo
   WHERE wo.engagement_id IN (SELECT e.engagement_id FROM public.engagements e
                               WHERE (SELECT public.get_my_staff_id()) IN (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id))
$$;

CREATE OR REPLACE FUNCTION public.my_managed_visible_wo_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo del EXISTS de "Manager can manage payment plans": OT de encargos que gerencio Y que la RLS de engagements me deja ver.
  SELECT wo.wo_id FROM public.work_orders wo
   WHERE wo.engagement_id IN (SELECT e.engagement_id FROM public.engagements e
                               WHERE e.manager_id = (SELECT public.get_my_staff_id())
                                 AND e.engagement_id IN (SELECT public.my_visible_engagement_ids()))
$$;

CREATE OR REPLACE FUNCTION public.my_team_plan_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.plan_id FROM public.wo_payment_plan p WHERE p.wo_id IN (SELECT public.my_team_wo_ids())
$$;

CREATE OR REPLACE FUNCTION public.my_managed_visible_plan_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.plan_id FROM public.wo_payment_plan p WHERE p.wo_id IN (SELECT public.my_managed_visible_wo_ids())
$$;

CREATE OR REPLACE FUNCTION public.my_line_approval_mode() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Parte constante de can_approve_timesheet_line / can_approve_timesheet: 'all' (admin por role_key), 'engagements' (permiso de aprobar) o 'none'.
  SELECT CASE
    WHEN (SELECT public.get_my_staff_id()) IS NULL THEN 'none'
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_key = 'admin') THEN 'all'
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.authorization_role_permissions rp ON rp.role_key = ur.role_key
                  WHERE ur.user_id = auth.uid() AND rp.permission_key = 'timesheet_approval.approve') THEN 'engagements'
    ELSE 'none'
  END
$$;

CREATE OR REPLACE FUNCTION public.my_approvable_period_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  -- Espejo de can_approve_timesheet(auth.uid(), period_id): admin => todos; con permiso de aprobar => periodos de personas (no autoaprobadas) que cargaron
  -- horas esa semana en un encargo que gerencio o del que soy socio (get_timesheet_approvers).
  SELECT tp.period_id FROM public.timesheet_periods tp WHERE (SELECT public.my_line_approval_mode()) = 'all'
  UNION
  SELECT tp.period_id
    FROM public.timesheet_periods tp
    JOIN (SELECT DISTINCT te.staff_id, te.date_worked
            FROM public.time_entries te
            JOIN public.engagements e ON e.engagement_id = te.engagement_id
           WHERE (SELECT public.my_line_approval_mode()) = 'engagements'
             AND (e.manager_id = (SELECT public.get_my_staff_id()) OR e.partner_id = (SELECT public.get_my_staff_id()))) x
      ON x.staff_id = tp.staff_id AND x.date_worked >= tp.week_start_date AND x.date_worked < tp.week_start_date + interval '7 days'
   WHERE NOT public.is_auto_approved_category(tp.staff_id)
$$;

-- Mismos privilegios que las funciones auxiliares actuales: authenticated y service_role (no anon / PUBLIC).
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['my_assigned_engagement_ids','my_team_engagement_ids','my_staffed_engagement_ids','my_assigned_client_ids','my_assignment_engagement_ids',
                           'my_fund_request_engagement_ids','my_fund_request_wo_ids','my_sqr_visible_engagement_ids','my_team_wo_ids','my_assigned_wo_ids',
                           'my_managed_visible_wo_ids','my_team_plan_ids','my_managed_visible_plan_ids','my_line_approval_mode','my_approvable_period_ids']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ============ 2. Politicas reescritas (mismos nombres, comandos y roles) ============
-- engagements (SELECT)
DROP POLICY IF EXISTS "Staff can view fund request engagements" ON public.engagements;
CREATE POLICY "Staff can view fund request engagements" ON public.engagements FOR SELECT TO authenticated
  USING (engagement_id IN (SELECT public.my_fund_request_engagement_ids()));
DROP POLICY IF EXISTS "engagements creator read" ON public.engagements;
CREATE POLICY "engagements creator read" ON public.engagements FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('engagement.read')) AND created_by_staff_id IS NOT NULL AND created_by_staff_id = (SELECT public.get_my_staff_id()));
DROP POLICY IF EXISTS "engagements hr administrative read" ON public.engagements;
CREATE POLICY "engagements hr administrative read" ON public.engagements FOR SELECT TO authenticated
  USING (funcion <> 1 AND (SELECT public.has_permission('engagement.read')) AND ((SELECT public.current_role_key()) = ANY (ARRAY['hr_manager', 'hr_analyst'])));
DROP POLICY IF EXISTS "engagements read" ON public.engagements;
CREATE POLICY "engagements read" ON public.engagements FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('engagement.read'))
         AND ((SELECT public.permission_scope('engagement.read')) <> 'assigned_engagements' OR engagement_id IN (SELECT public.my_assigned_engagement_ids())));

-- clients (SELECT)
DROP POLICY IF EXISTS "clients creator read" ON public.clients;
CREATE POLICY "clients creator read" ON public.clients FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('client.read')) AND created_by_staff_id IS NOT NULL AND created_by_staff_id = (SELECT public.get_my_staff_id()));
DROP POLICY IF EXISTS "clients read" ON public.clients;
CREATE POLICY "clients read" ON public.clients FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('client.read'))
         AND ((SELECT public.permission_scope('client.read')) <> 'assigned_clients' OR client_id IN (SELECT public.my_assigned_client_ids())));

-- work_orders (SELECT y la ALL de admin)
DROP POLICY IF EXISTS "Admins can manage work orders" ON public.work_orders;
CREATE POLICY "Admins can manage work orders" ON public.work_orders FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Admins can view all work orders" ON public.work_orders;
CREATE POLICY "Admins can view all work orders" ON public.work_orders FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Assigned SQR can view work orders" ON public.work_orders;
CREATE POLICY "Assigned SQR can view work orders" ON public.work_orders FOR SELECT TO authenticated
  USING (engagement_id IN (SELECT public.my_sqr_visible_engagement_ids()));
DROP POLICY IF EXISTS "Staff can view fund request work orders" ON public.work_orders;
CREATE POLICY "Staff can view fund request work orders" ON public.work_orders FOR SELECT TO authenticated
  USING (wo_id IN (SELECT public.my_fund_request_wo_ids()));
DROP POLICY IF EXISTS "Team can view engagement work orders" ON public.work_orders;
CREATE POLICY "Team can view engagement work orders" ON public.work_orders FOR SELECT TO authenticated
  USING (engagement_id IN (SELECT public.my_team_engagement_ids()));
DROP POLICY IF EXISTS "work_orders assigned read" ON public.work_orders;
CREATE POLICY "work_orders assigned read" ON public.work_orders FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('work_order.read')) AND (SELECT public.permission_scope('work_order.read')) = 'assigned_engagements'
         AND engagement_id IN (SELECT public.my_assigned_engagement_ids()));
DROP POLICY IF EXISTS "work_orders firm read" ON public.work_orders;
CREATE POLICY "work_orders firm read" ON public.work_orders FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('work_order.read')) AND (SELECT public.permission_scope('work_order.read')) = ANY (ARRAY['firm', 'department']));

-- wo_budget_lines
DROP POLICY IF EXISTS "Admins can manage budget lines" ON public.wo_budget_lines;
CREATE POLICY "Admins can manage budget lines" ON public.wo_budget_lines FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Team can manage budget lines" ON public.wo_budget_lines;
CREATE POLICY "Team can manage budget lines" ON public.wo_budget_lines FOR ALL TO authenticated
  USING (wo_id IN (SELECT public.my_team_wo_ids())) WITH CHECK (wo_id IN (SELECT public.my_team_wo_ids()));
DROP POLICY IF EXISTS "Admins can view all budget lines" ON public.wo_budget_lines;
CREATE POLICY "Admins can view all budget lines" ON public.wo_budget_lines FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Team can view budget lines" ON public.wo_budget_lines;
CREATE POLICY "Team can view budget lines" ON public.wo_budget_lines FOR SELECT TO authenticated
  USING (wo_id IN (SELECT public.my_team_wo_ids()));
DROP POLICY IF EXISTS "budget_lines assigned read" ON public.wo_budget_lines;
CREATE POLICY "budget_lines assigned read" ON public.wo_budget_lines FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('work_order.read')) AND (SELECT public.permission_scope('work_order.read')) = 'assigned_engagements'
         AND wo_id IN (SELECT public.my_assigned_wo_ids()));
DROP POLICY IF EXISTS "budget_lines firm read" ON public.wo_budget_lines;
CREATE POLICY "budget_lines firm read" ON public.wo_budget_lines FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('work_order.read')) AND (SELECT public.permission_scope('work_order.read')) = ANY (ARRAY['firm', 'department']));

-- wo_expense_budget
DROP POLICY IF EXISTS "Admins can manage expense budget" ON public.wo_expense_budget;
CREATE POLICY "Admins can manage expense budget" ON public.wo_expense_budget FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Team can manage expense budget" ON public.wo_expense_budget;
CREATE POLICY "Team can manage expense budget" ON public.wo_expense_budget FOR ALL TO authenticated
  USING (wo_id IN (SELECT public.my_team_wo_ids())) WITH CHECK (wo_id IN (SELECT public.my_team_wo_ids()));
DROP POLICY IF EXISTS "Admins can view all expense budget" ON public.wo_expense_budget;
CREATE POLICY "Admins can view all expense budget" ON public.wo_expense_budget FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Team can view expense budget" ON public.wo_expense_budget;
CREATE POLICY "Team can view expense budget" ON public.wo_expense_budget FOR SELECT TO authenticated
  USING (wo_id IN (SELECT public.my_team_wo_ids()));
DROP POLICY IF EXISTS "expense_budget assigned read" ON public.wo_expense_budget;
CREATE POLICY "expense_budget assigned read" ON public.wo_expense_budget FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('work_order.read')) AND (SELECT public.permission_scope('work_order.read')) = 'assigned_engagements'
         AND wo_id IN (SELECT public.my_assigned_wo_ids()));
DROP POLICY IF EXISTS "expense_budget firm read" ON public.wo_expense_budget;
CREATE POLICY "expense_budget firm read" ON public.wo_expense_budget FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('work_order.read')) AND (SELECT public.permission_scope('work_order.read')) = ANY (ARRAY['firm', 'department']));

-- wo_payment_plan
DROP POLICY IF EXISTS "Admins can manage payment plans" ON public.wo_payment_plan;
CREATE POLICY "Admins can manage payment plans" ON public.wo_payment_plan FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Manager can manage payment plans" ON public.wo_payment_plan;
CREATE POLICY "Manager can manage payment plans" ON public.wo_payment_plan FOR ALL TO authenticated
  USING (wo_id IN (SELECT public.my_managed_visible_wo_ids())) WITH CHECK (wo_id IN (SELECT public.my_managed_visible_wo_ids()));
DROP POLICY IF EXISTS "Admins can view all payment plans" ON public.wo_payment_plan;
CREATE POLICY "Admins can view all payment plans" ON public.wo_payment_plan FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Team can view payment plans" ON public.wo_payment_plan;
CREATE POLICY "Team can view payment plans" ON public.wo_payment_plan FOR SELECT TO authenticated
  USING (wo_id IN (SELECT public.my_team_wo_ids()));
DROP POLICY IF EXISTS "payment_plan firm read" ON public.wo_payment_plan;
CREATE POLICY "payment_plan firm read" ON public.wo_payment_plan FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('work_order.payment_plan.approve')) AND (SELECT public.permission_scope('work_order.payment_plan.approve')) = ANY (ARRAY['firm', 'department']));

-- wo_payment_installments (la UPDATE de collections_analyst no se toca)
DROP POLICY IF EXISTS "Admins can manage payment installments" ON public.wo_payment_installments;
CREATE POLICY "Admins can manage payment installments" ON public.wo_payment_installments FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Manager can manage payment installments" ON public.wo_payment_installments;
CREATE POLICY "Manager can manage payment installments" ON public.wo_payment_installments FOR ALL TO authenticated
  USING (plan_id IN (SELECT public.my_managed_visible_plan_ids())) WITH CHECK (plan_id IN (SELECT public.my_managed_visible_plan_ids()));
DROP POLICY IF EXISTS "Admins can view all payment installments" ON public.wo_payment_installments;
CREATE POLICY "Admins can view all payment installments" ON public.wo_payment_installments FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "Team can view payment installments" ON public.wo_payment_installments;
CREATE POLICY "Team can view payment installments" ON public.wo_payment_installments FOR SELECT TO authenticated
  USING (plan_id IN (SELECT public.my_team_plan_ids()));
DROP POLICY IF EXISTS "payment_installments firm read" ON public.wo_payment_installments;
CREATE POLICY "payment_installments firm read" ON public.wo_payment_installments FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('work_order.payment_plan.approve')) AND (SELECT public.permission_scope('work_order.payment_plan.approve')) = ANY (ARRAY['firm', 'department']));

-- engagement_assignments (las de escritura ea_team_* no se tocan)
DROP POLICY IF EXISTS "ea_admin_manage" ON public.engagement_assignments;
CREATE POLICY "ea_admin_manage" ON public.engagement_assignments FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));
DROP POLICY IF EXISTS "ea_select_assigned" ON public.engagement_assignments;
CREATE POLICY "ea_select_assigned" ON public.engagement_assignments FOR SELECT TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'senior'::public.app_role)) AND engagement_id IN (SELECT public.my_assignment_engagement_ids()));
DROP POLICY IF EXISTS "ea_select_firmwide" ON public.engagement_assignments;
CREATE POLICY "ea_select_firmwide" ON public.engagement_assignments FOR SELECT TO authenticated
  USING ((SELECT public.has_firmwide_assignment_visibility()));
DROP POLICY IF EXISTS "ea_select_lead" ON public.engagement_assignments;
CREATE POLICY "ea_select_lead" ON public.engagement_assignments FOR SELECT TO authenticated
  USING ((SELECT public.has_role(auth.uid(), 'manager'::public.app_role)) AND engagement_id IN (SELECT public.my_team_engagement_ids()));
DROP POLICY IF EXISTS "ea_select_own" ON public.engagement_assignments;
CREATE POLICY "ea_select_own" ON public.engagement_assignments FOR SELECT TO authenticated
  USING (staff_id = (SELECT public.get_my_staff_id()));
DROP POLICY IF EXISTS "ea_select_responsible" ON public.engagement_assignments;
CREATE POLICY "ea_select_responsible" ON public.engagement_assignments FOR SELECT TO authenticated
  USING (engagement_id IN (SELECT public.my_staffed_engagement_ids()));

-- timesheet_periods y timesheet_line_approvals (solo las dos de "approvers" de SELECT; las de UPDATE no se tocan)
DROP POLICY IF EXISTS "Approvers can view assigned timesheets" ON public.timesheet_periods;
CREATE POLICY "Approvers can view assigned timesheets" ON public.timesheet_periods FOR SELECT
  USING (period_id IN (SELECT public.my_approvable_period_ids()));
DROP POLICY IF EXISTS "Approvers can view assigned line approvals" ON public.timesheet_line_approvals;
CREATE POLICY "Approvers can view assigned line approvals" ON public.timesheet_line_approvals FOR SELECT
  USING ((SELECT public.my_line_approval_mode()) = 'all'
         OR ((SELECT public.my_line_approval_mode()) = 'engagements' AND engagement_id IN (SELECT public.my_team_engagement_ids())));
