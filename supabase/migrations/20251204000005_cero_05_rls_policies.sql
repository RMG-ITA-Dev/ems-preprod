SET check_function_bodies = false;
SET row_security = off;

-- Migración cero — set consolidado (bugs/migracion_cero/plan_v2.md Fase 2).
-- 05: ENABLE ROW LEVEL SECURITY + policies.
-- Fuente de autoría: bugs/migracion_cero/autoria/dump_full_baseline.sql (pg_dump --schema-only,
-- baseline de 184 migraciones + preseed). Extraído por bloque -- Name:/Type:/Schema: de pg_dump,
-- preservando el orden relativo original (orden topológico real de pg_dump, no reordenado a mano).
-- Ver docs/migraciones/DIFF-INTENCIONAL-consolidacion.md para los cambios deliberados vs baseline.

--
-- Name: timesheet_periods Admin can update all periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admin can update all periods" ON public.timesheet_periods FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role_key = 'admin'::text)))));


--
--
-- Name: holidays Admins can delete holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete holidays" ON public.holidays FOR DELETE USING (public.is_admin());


--
--
-- Name: holidays Admins can insert holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert holidays" ON public.holidays FOR INSERT WITH CHECK (public.is_admin());


--
--
-- Name: practicas Admins can insert practicas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert practicas" ON public.practicas FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
--
-- Name: servicios Admins can insert servicios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert servicios" ON public.servicios FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
--
-- Name: user_roles Admins can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
--
-- Name: wo_budget_lines Admins can manage budget lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage budget lines" ON public.wo_budget_lines TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: categories Admins can manage categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage categories" ON public.categories TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: wo_expense_budget Admins can manage expense budget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage expense budget" ON public.wo_expense_budget TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: expense_types Admins can manage expense types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage expense types" ON public.expense_types TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: industries Admins can manage industries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage industries" ON public.industries TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: wo_payment_installments Admins can manage payment installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage payment installments" ON public.wo_payment_installments TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: wo_payment_plan Admins can manage payment plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage payment plans" ON public.wo_payment_plan TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: global_settings Admins can manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage settings" ON public.global_settings TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: skills Admins can manage skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage skills" ON public.skills TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: work_orders Admins can manage work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage work orders" ON public.work_orders TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: activity_worksheet_cells Admins can manage worksheet cells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage worksheet cells" ON public.activity_worksheet_cells TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: activity_worksheets Admins can manage worksheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage worksheets" ON public.activity_worksheets TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: holidays Admins can update holidays; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update holidays" ON public.holidays FOR UPDATE USING (public.is_admin());


--
--
-- Name: practicas Admins can update practicas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update practicas" ON public.practicas FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: servicios Admins can update servicios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update servicios" ON public.servicios FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: wo_budget_lines Admins can view all budget lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all budget lines" ON public.wo_budget_lines FOR SELECT TO authenticated USING (public.is_admin());


--
--
-- Name: wo_expense_budget Admins can view all expense budget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all expense budget" ON public.wo_expense_budget FOR SELECT TO authenticated USING (public.is_admin());


--
--
-- Name: wo_payment_installments Admins can view all payment installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payment installments" ON public.wo_payment_installments FOR SELECT TO authenticated USING (public.is_admin());


--
--
-- Name: wo_payment_plan Admins can view all payment plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all payment plans" ON public.wo_payment_plan FOR SELECT TO authenticated USING (public.is_admin());


--
--
-- Name: work_orders Admins can view all work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all work orders" ON public.work_orders FOR SELECT TO authenticated USING (public.is_admin());


--
--
-- Name: activity_worksheet_cells Admins can view all worksheet cells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all worksheet cells" ON public.activity_worksheet_cells FOR SELECT TO authenticated USING (public.is_admin());


--
--
-- Name: activity_worksheets Admins can view all worksheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all worksheets" ON public.activity_worksheets FOR SELECT TO authenticated USING (public.is_admin());


--
--
-- Name: user_lifecycle_audit_log Admins can view lifecycle audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view lifecycle audit" ON public.user_lifecycle_audit_log FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
--
-- Name: timesheet_line_approvals Approvers can update assigned line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can update assigned line approvals" ON public.timesheet_line_approvals FOR UPDATE USING (public.can_approve_timesheet_line(auth.uid(), period_id, engagement_id));


--
--
-- Name: timesheet_periods Approvers can update assigned timesheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can update assigned timesheets" ON public.timesheet_periods FOR UPDATE USING (public.can_approve_timesheet(auth.uid(), period_id));


--
--
-- Name: timesheet_line_approvals Approvers can view assigned line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can view assigned line approvals" ON public.timesheet_line_approvals FOR SELECT USING (public.can_approve_timesheet_line(auth.uid(), period_id, engagement_id));


--
--
-- Name: timesheet_periods Approvers can view assigned timesheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers can view assigned timesheets" ON public.timesheet_periods FOR SELECT USING (public.can_approve_timesheet(auth.uid(), period_id));


--
--
-- Name: work_orders Assigned SQR can update work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned SQR can update work orders" ON public.work_orders FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE ((e.engagement_id = work_orders.engagement_id) AND (e.sqr_id = public.get_my_staff_id()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE ((e.engagement_id = work_orders.engagement_id) AND (e.sqr_id = public.get_my_staff_id())))));


--
--
-- Name: work_orders Assigned SQR can view work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Assigned SQR can view work orders" ON public.work_orders FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.engagements e
  WHERE ((e.engagement_id = work_orders.engagement_id) AND (e.sqr_id = public.get_my_staff_id())))));


--
--
-- Name: staff Authenticated staff can view active staff directory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated staff can view active staff directory" ON public.staff FOR SELECT TO authenticated USING (((is_active = true) AND (public.get_my_staff_id() IS NOT NULL)));


--
--
-- Name: activity_codes Authenticated users can read activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read activities" ON public.activity_codes FOR SELECT TO authenticated USING (true);


--
--
-- Name: categories Authenticated users can read categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read categories" ON public.categories FOR SELECT TO authenticated USING (true);


--
--
-- Name: expense_types Authenticated users can read expense types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read expense types" ON public.expense_types FOR SELECT TO authenticated USING (true);


--
--
-- Name: holidays Authenticated users can read holidays; Type: POLICY; Schema: public; Owner: -
--

-- El `TO authenticated` lo agregó el barrido de seguridad del 02/10/2026 (BAR-016). Sin cláusula TO
-- una política rige para PUBLIC, que incluye a `anon`: con `USING (true)` esta era la ÚNICA tabla del
-- esquema con RLS encendida que un visitante sin cuenta podía leer igual. El nombre de la política ya
-- decía la intención; faltaba expresarla. Verificado en vivo contra Test (consulta de políticas que
-- alcanzan a anon/PUBLIC): el resto de las políticas sin TO resuelven por auth.uid(), que es NULL sin
-- sesión, así que esta era el único caso efectivo.
CREATE POLICY "Authenticated users can read holidays" ON public.holidays FOR SELECT TO authenticated USING (true);


--
--
-- Name: industries Authenticated users can read industries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read industries" ON public.industries FOR SELECT TO authenticated USING (true);


--
--
-- Name: practicas Authenticated users can read practicas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read practicas" ON public.practicas FOR SELECT TO authenticated USING (true);


--
--
-- Name: global_settings Authenticated users can read settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read settings" ON public.global_settings FOR SELECT TO authenticated USING (true);


--
--
-- Name: society Authenticated users can read society; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read society" ON public.society FOR SELECT TO authenticated USING (true);


--
--
-- Name: staff Authenticated users can read staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read staff" ON public.staff FOR SELECT TO authenticated USING (true);


--
--
-- Name: staff_skills Authenticated users can read staff skills; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read staff skills" ON public.staff_skills FOR SELECT TO authenticated USING (true);


--
--
-- Name: servicios Authenticated users can read servicios; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read servicios" ON public.servicios FOR SELECT TO authenticated USING (true);


--
--
-- Name: timesheet_line_approvals Firm-wide read line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Firm-wide read line approvals" ON public.timesheet_line_approvals FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.authorization_role_permissions rp ON ((rp.role_key = ur.role_key)))
  WHERE ((ur.user_id = auth.uid()) AND (rp.permission_key = 'timesheet_approval.read'::text) AND (rp.scope_key = 'firm'::text)))));


--
--
-- Name: timesheet_periods Firm-wide read periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Firm-wide read periods" ON public.timesheet_periods FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.user_roles ur
     JOIN public.authorization_role_permissions rp ON ((rp.role_key = ur.role_key)))
  WHERE ((ur.user_id = auth.uid()) AND (rp.permission_key = 'timesheet_approval.read'::text) AND (rp.scope_key = 'firm'::text)))));


--
--
-- Name: timesheet_line_approvals Staff can create own line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create own line approvals" ON public.timesheet_line_approvals FOR INSERT WITH CHECK ((period_id IN ( SELECT tp.period_id
   FROM (public.timesheet_periods tp
     JOIN public.staff s ON ((tp.staff_id = s.staff_id)))
  WHERE (s.auth_user_id = auth.uid()))));


--
--
-- Name: timesheet_periods Staff can create own periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create own periods" ON public.timesheet_periods FOR INSERT WITH CHECK ((staff_id IN ( SELECT s.staff_id
   FROM public.staff s
  WHERE (s.auth_user_id = auth.uid()))));


--
--
-- Name: timesheet_periods Staff can update own unlocked periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update own unlocked periods" ON public.timesheet_periods FOR UPDATE USING (((staff_id IN ( SELECT s.staff_id
   FROM public.staff s
  WHERE (s.auth_user_id = auth.uid()))) AND (is_period_locked = false)));


--
--
-- Name: engagements Staff can view fund request engagements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view fund request engagements" ON public.engagements FOR SELECT TO authenticated USING (public.engagement_in_my_fund_request(engagement_id));


--
--
-- Name: work_orders Staff can view fund request work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view fund request work orders" ON public.work_orders FOR SELECT TO authenticated USING (public.wo_in_my_fund_request(wo_id));


--
--
-- Name: timesheet_line_approvals Staff can view own line approvals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view own line approvals" ON public.timesheet_line_approvals FOR SELECT USING ((period_id IN ( SELECT tp.period_id
   FROM (public.timesheet_periods tp
     JOIN public.staff s ON ((tp.staff_id = s.staff_id)))
  WHERE (s.auth_user_id = auth.uid()))));


--
--
-- Name: timesheet_periods Staff can view own periods; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can view own periods" ON public.timesheet_periods FOR SELECT USING ((staff_id IN ( SELECT s.staff_id
   FROM public.staff s
  WHERE (s.auth_user_id = auth.uid()))));


--
--
-- Name: wo_budget_lines Team can manage budget lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can manage budget lines" ON public.wo_budget_lines TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_budget_lines.wo_id) AND public.is_engagement_team_member(wo.engagement_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_budget_lines.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
--
-- Name: wo_expense_budget Team can manage expense budget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can manage expense budget" ON public.wo_expense_budget TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_expense_budget.wo_id) AND public.is_engagement_team_member(wo.engagement_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_expense_budget.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
--
-- Name: wo_payment_installments Team can manage payment installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can manage payment installments" ON public.wo_payment_installments TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.wo_payment_plan p
     JOIN public.work_orders wo ON ((wo.wo_id = p.wo_id)))
  WHERE ((p.plan_id = wo_payment_installments.plan_id) AND public.is_engagement_team_member(wo.engagement_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.wo_payment_plan p
     JOIN public.work_orders wo ON ((wo.wo_id = p.wo_id)))
  WHERE ((p.plan_id = wo_payment_installments.plan_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
--
-- Name: wo_payment_plan Team can manage payment plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can manage payment plans" ON public.wo_payment_plan TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_payment_plan.wo_id) AND public.is_engagement_team_member(wo.engagement_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_payment_plan.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
--
-- Name: activity_worksheet_cells Team can manage worksheet cells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can manage worksheet cells" ON public.activity_worksheet_cells TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.activity_worksheets aw
  WHERE ((aw.id = activity_worksheet_cells.worksheet_id) AND public.is_engagement_team_member(aw.engagement_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.activity_worksheets aw
  WHERE ((aw.id = activity_worksheet_cells.worksheet_id) AND public.is_engagement_team_member(aw.engagement_id)))));


--
--
-- Name: wo_budget_lines Team can view budget lines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view budget lines" ON public.wo_budget_lines FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_budget_lines.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
--
-- Name: work_orders Team can view engagement work orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view engagement work orders" ON public.work_orders FOR SELECT TO authenticated USING (public.is_engagement_team_member(engagement_id));


--
--
-- Name: wo_expense_budget Team can view expense budget; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view expense budget" ON public.wo_expense_budget FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_expense_budget.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
--
-- Name: wo_payment_installments Team can view payment installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view payment installments" ON public.wo_payment_installments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.wo_payment_plan p
     JOIN public.work_orders wo ON ((wo.wo_id = p.wo_id)))
  WHERE ((p.plan_id = wo_payment_installments.plan_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
--
-- Name: wo_payment_plan Team can view payment plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view payment plans" ON public.wo_payment_plan FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_payment_plan.wo_id) AND public.is_engagement_team_member(wo.engagement_id)))));


--
--
-- Name: activity_worksheet_cells Team can view worksheet cells; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view worksheet cells" ON public.activity_worksheet_cells FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.activity_worksheets aw
  WHERE ((aw.id = activity_worksheet_cells.worksheet_id) AND public.is_engagement_team_member(aw.engagement_id)))));


--
--
-- Name: activity_worksheets Team can view worksheets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Team can view worksheets" ON public.activity_worksheets FOR SELECT TO authenticated USING (public.is_engagement_team_member(engagement_id));


--
--
-- Name: staff Users can update their linked staff record; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their linked staff record" ON public.staff FOR UPDATE USING ((auth_user_id = auth.uid())) WITH CHECK ((auth_user_id = auth.uid()));


--
--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
--
-- Name: activity_codes activity_codes write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "activity_codes write delete" ON public.activity_codes FOR DELETE TO authenticated USING (public.has_permission('activity_code.delete'::text));


--
--
-- Name: activity_codes activity_codes write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "activity_codes write insert" ON public.activity_codes FOR INSERT TO authenticated WITH CHECK (public.has_permission('activity_code.create'::text));


--
--
-- Name: activity_codes activity_codes write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "activity_codes write update" ON public.activity_codes FOR UPDATE TO authenticated USING (public.has_permission('activity_code.update'::text)) WITH CHECK (public.has_permission('activity_code.update'::text));


--
--
-- Name: activity_worksheets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_worksheets ENABLE ROW LEVEL SECURITY;

--
--
-- Name: auth_login_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;

--
--
-- Name: authorization_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.authorization_permissions ENABLE ROW LEVEL SECURITY;

--
--
-- Name: authorization_role_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.authorization_role_permissions ENABLE ROW LEVEL SECURITY;

--
--
-- Name: authorization_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.authorization_roles ENABLE ROW LEVEL SECURITY;

--
--
-- Name: authorization_permissions authz_perms_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authz_perms_select ON public.authorization_permissions FOR SELECT TO authenticated USING (true);


--
--
-- Name: authorization_roles authz_roles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authz_roles_select ON public.authorization_roles FOR SELECT TO authenticated USING (true);


--
--
-- Name: authorization_role_permissions authz_rp_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authz_rp_select_admin ON public.authorization_role_permissions FOR SELECT TO authenticated USING (public.is_admin());


--
--
-- Name: wo_budget_lines budget_lines assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "budget_lines assigned read" ON public.wo_budget_lines FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = 'assigned_engagements'::text) AND (EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_budget_lines.wo_id) AND public.is_assigned_to_engagement(wo.engagement_id))))));


--
--
-- Name: wo_budget_lines budget_lines firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "budget_lines firm read" ON public.wo_budget_lines FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
--
-- Name: categories categories write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories write delete" ON public.categories FOR DELETE TO authenticated USING (public.has_permission('category_rate.delete'::text));


--
--
-- Name: categories categories write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories write insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_permission('category_rate.create'::text));


--
--
-- Name: categories categories write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "categories write update" ON public.categories FOR UPDATE TO authenticated USING (public.has_permission('category_rate.update'::text)) WITH CHECK (public.has_permission('category_rate.update'::text));


--
--
-- Name: clients clients creator read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients creator read" ON public.clients FOR SELECT TO authenticated USING ((public.has_permission('client.read'::text) AND (created_by_staff_id IS NOT NULL) AND (created_by_staff_id = public.get_my_staff_id())));


--
--
-- Name: clients clients read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients read" ON public.clients FOR SELECT TO authenticated USING ((public.has_permission('client.read'::text) AND ((public.permission_scope('client.read'::text) <> 'assigned_clients'::text) OR public.is_assigned_to_client(client_id))));


--
--
-- Name: clients clients write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients write delete" ON public.clients FOR DELETE TO authenticated USING (public.is_admin());


--
--
-- Name: clients clients write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients write insert" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.has_permission('client.create'::text));


--
--
-- Name: clients clients write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "clients write update" ON public.clients FOR UPDATE TO authenticated USING (public.has_permission('client.update'::text)) WITH CHECK (public.has_permission('client.update'::text));


--
--
-- Name: engagement_assignments ea_admin_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_admin_manage ON public.engagement_assignments TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: engagement_assignments ea_select_assigned; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_select_assigned ON public.engagement_assignments FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'senior'::public.app_role) AND public.has_assignment_on_engagement(engagement_id)));


--
--
-- Name: engagement_assignments ea_select_firmwide; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_select_firmwide ON public.engagement_assignments FOR SELECT TO authenticated USING (public.has_firmwide_assignment_visibility());


--
--
-- Name: engagement_assignments ea_select_lead; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_select_lead ON public.engagement_assignments FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'manager'::public.app_role) AND public.is_engagement_team_member(engagement_id)));


--
--
-- Name: engagement_assignments ea_select_responsible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_select_responsible ON public.engagement_assignments FOR SELECT TO authenticated USING (public.is_engagement_responsible(engagement_id));


--
--
-- Name: engagement_assignments ea_team_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_team_delete ON public.engagement_assignments FOR DELETE TO authenticated USING (((public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id)) AND (public.can_read_engagement_assignments(engagement_id) OR public.is_engagement_responsible(engagement_id))));


--
--
-- Name: engagement_assignments ea_team_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_team_insert ON public.engagement_assignments FOR INSERT TO authenticated WITH CHECK (((public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id)) AND (public.can_read_engagement_assignments(engagement_id) OR public.is_engagement_responsible(engagement_id))));


--
--
-- Name: engagement_assignments ea_team_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ea_team_update ON public.engagement_assignments FOR UPDATE TO authenticated USING (((public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id)) AND (public.can_read_engagement_assignments(engagement_id) OR public.is_engagement_responsible(engagement_id)))) WITH CHECK (((public.is_engagement_team_member(engagement_id) OR public.is_engagement_responsible(engagement_id)) AND (public.can_read_engagement_assignments(engagement_id) OR public.is_engagement_responsible(engagement_id))));


--
--
-- Name: engagement_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engagement_assignments ENABLE ROW LEVEL SECURITY;

--
--
-- Name: engagements engagements creator read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements creator read" ON public.engagements FOR SELECT TO authenticated USING ((public.has_permission('engagement.read'::text) AND (created_by_staff_id IS NOT NULL) AND (created_by_staff_id = public.get_my_staff_id())));


--
--
-- Name: engagements engagements creator update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements creator update" ON public.engagements FOR UPDATE TO authenticated USING ((public.has_permission('engagement.update'::text) AND (created_by_staff_id IS NOT NULL) AND (created_by_staff_id = public.get_my_staff_id()))) WITH CHECK ((public.has_permission('engagement.update'::text) AND (created_by_staff_id IS NOT NULL) AND (created_by_staff_id = public.get_my_staff_id())));


--
--
-- Name: engagements engagements read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements read" ON public.engagements FOR SELECT TO authenticated USING ((public.has_permission('engagement.read'::text) AND ((public.permission_scope('engagement.read'::text) <> 'assigned_engagements'::text) OR public.is_assigned_to_engagement(engagement_id))));


--
--
-- Name: engagements engagements write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements write delete" ON public.engagements FOR DELETE TO authenticated USING (public.has_permission('engagement.delete'::text));


--
--
-- Name: engagements engagements write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements write insert" ON public.engagements FOR INSERT TO authenticated WITH CHECK (public.has_permission('engagement.create'::text));


--
--
-- Name: engagements engagements write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "engagements write update" ON public.engagements FOR UPDATE TO authenticated USING ((public.has_permission('engagement.update'::text) AND ((public.permission_scope('engagement.update'::text) = 'firm'::text) OR public.is_engagement_team_member(engagement_id)))) WITH CHECK ((public.has_permission('engagement.update'::text) AND ((public.permission_scope('engagement.update'::text) = 'firm'::text) OR public.is_engagement_team_member(engagement_id))));


--
--
-- Name: wo_expense_budget expense_budget assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_budget assigned read" ON public.wo_expense_budget FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = 'assigned_engagements'::text) AND (EXISTS ( SELECT 1
   FROM public.work_orders wo
  WHERE ((wo.wo_id = wo_expense_budget.wo_id) AND public.is_assigned_to_engagement(wo.engagement_id))))));


--
--
-- Name: wo_expense_budget expense_budget firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_budget firm read" ON public.wo_expense_budget FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
--
-- Name: expense_types expense_types write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_types write delete" ON public.expense_types FOR DELETE TO authenticated USING (public.has_permission('expense_type.delete'::text));


--
--
-- Name: expense_types expense_types write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_types write insert" ON public.expense_types FOR INSERT TO authenticated WITH CHECK (public.has_permission('expense_type.create'::text));


--
--
-- Name: expense_types expense_types write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expense_types write update" ON public.expense_types FOR UPDATE TO authenticated USING (public.has_permission('expense_type.update'::text)) WITH CHECK (public.has_permission('expense_type.update'::text));


--
--
-- Name: fund_requests fr_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_delete_admin ON public.fund_requests FOR DELETE TO authenticated USING (public.is_admin());


--
--
-- Name: fund_requests fr_delete_requester_draft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_delete_requester_draft ON public.fund_requests FOR DELETE TO authenticated USING (((requester_staff_id = public.get_my_staff_id()) AND (status = 'borrador'::public.fund_request_status)));


--
--
-- Name: fund_requests fr_insert_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_insert_requester ON public.fund_requests FOR INSERT TO authenticated WITH CHECK (((requester_staff_id = public.get_my_staff_id()) AND (status = 'borrador'::public.fund_request_status) AND (EXISTS ( SELECT 1
   FROM public.staff
  WHERE ((staff.staff_id = public.get_my_staff_id()) AND (staff.is_active = true))))));


--
--
-- Name: fund_requests fr_select_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_select_accounting ON public.fund_requests FOR SELECT TO authenticated USING (((public.has_permission('fund_disbursement.read'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status]))) OR (public.has_permission('expense_settlement.read'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status])))));


--
--
-- Name: fund_requests fr_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_select_admin ON public.fund_requests FOR SELECT TO authenticated USING (public.is_admin());


--
--
-- Name: fund_requests fr_select_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_select_manager ON public.fund_requests FOR SELECT TO authenticated USING (((status <> 'borrador'::public.fund_request_status) AND public.fr_is_ot_manager(fund_request_id)));


--
--
-- Name: fund_requests fr_select_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_select_requester ON public.fund_requests FOR SELECT TO authenticated USING ((requester_staff_id = public.get_my_staff_id()));


--
--
-- Name: fund_requests fr_update_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_update_accounting ON public.fund_requests FOR UPDATE TO authenticated USING (((public.has_permission('fund_disbursement.update'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status]))) OR (public.has_permission('expense_settlement.update'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status]))))) WITH CHECK (((public.has_permission('fund_disbursement.update'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status]))) OR (public.has_permission('expense_settlement.update'::text) AND (status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status])))));


--
--
-- Name: fund_requests fr_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_update_admin ON public.fund_requests FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: fund_requests fr_update_requester_draft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_update_requester_draft ON public.fund_requests FOR UPDATE TO authenticated USING (((requester_staff_id = public.get_my_staff_id()) AND (status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status])))) WITH CHECK (((requester_staff_id = public.get_my_staff_id()) AND (status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status]))));


--
--
-- Name: fund_request_work_orders fr_wo_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_admin ON public.fund_request_work_orders TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: fund_request_work_orders fr_wo_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_delete ON public.fund_request_work_orders FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status])) AND ((fr.requester_staff_id = public.get_my_staff_id()) OR public.is_admin())))));


--
--
-- Name: fund_request_work_orders fr_wo_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_insert ON public.fund_request_work_orders FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status])) AND ((fr.requester_staff_id = public.get_my_staff_id()) OR public.is_admin())))));


--
--
-- Name: fund_request_work_orders fr_wo_manager_decide; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_manager_decide ON public.fund_request_work_orders FOR UPDATE TO authenticated USING (((manager_staff_id = public.get_my_staff_id()) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = 'pendiente_aprobacion'::public.fund_request_status)))))) WITH CHECK ((manager_staff_id = public.get_my_staff_id()));


--
--
-- Name: fund_request_work_orders fr_wo_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_select ON public.fund_request_work_orders FOR SELECT TO authenticated USING ((((manager_staff_id = public.get_my_staff_id()) AND public.fr_is_submitted(fund_request_id)) OR public.fr_is_requester(fund_request_id) OR public.is_admin()));


--
--
-- Name: fund_request_work_orders fr_wo_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_wo_update ON public.fund_request_work_orders FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['borrador'::public.fund_request_status, 'observado'::public.fund_request_status, 'rechazado'::public.fund_request_status])) AND ((fr.requester_staff_id = public.get_my_staff_id()) OR public.is_admin())))));


--
--
-- Name: fund_request_expenses fre_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_delete_admin ON public.fund_request_expenses FOR DELETE TO authenticated USING (public.is_admin());


--
--
-- Name: fund_request_expenses fre_delete_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_delete_requester ON public.fund_request_expenses FOR DELETE TO authenticated USING (((status = 'borrador'::public.fund_request_expense_status) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.requester_staff_id = public.get_my_staff_id()))))));


--
--
-- Name: fund_request_expenses fre_insert_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_insert_requester ON public.fund_request_expenses FOR INSERT TO authenticated WITH CHECK (((status = 'borrador'::public.fund_request_expense_status) AND (returned_by_assistant = false) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.requester_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status))))));


--
--
-- Name: fund_request_expenses fre_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_select ON public.fund_request_expenses FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND ((fr.requester_staff_id = public.get_my_staff_id()) OR public.is_admin())))) OR ((status <> 'borrador'::public.fund_request_expense_status) AND (EXISTS ( SELECT 1
   FROM public.fund_request_work_orders frwo
  WHERE ((frwo.fund_request_id = fund_request_expenses.fund_request_id) AND (frwo.wo_id = fund_request_expenses.wo_id) AND (frwo.manager_staff_id = public.get_my_staff_id())))))));


--
--
-- Name: fund_request_expenses fre_select_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_select_accounting ON public.fund_request_expenses FOR SELECT TO authenticated USING ((public.has_permission('expense_settlement.read'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status])))))));


--
--
-- Name: fund_request_expenses fre_update_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_update_accounting ON public.fund_request_expenses FOR UPDATE TO authenticated USING (((public.has_permission('fund_disbursement.update'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status])))))) OR (public.has_permission('expense_settlement.update'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status])))))))) WITH CHECK (((public.has_permission('fund_disbursement.update'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status])))))) OR (public.has_permission('expense_settlement.update'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status]))))))));


--
--
-- Name: fund_request_expenses fre_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_update_admin ON public.fund_request_expenses FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
--
-- Name: fund_request_expenses fre_update_manager; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_update_manager ON public.fund_request_expenses FOR UPDATE TO authenticated USING (((status = 'pendiente_aprobacion'::public.fund_request_expense_status) AND (EXISTS ( SELECT 1
   FROM (public.fund_request_work_orders frwo
     JOIN public.fund_requests fr ON ((fr.fund_request_id = frwo.fund_request_id)))
  WHERE ((frwo.fund_request_id = fund_request_expenses.fund_request_id) AND (frwo.wo_id = fund_request_expenses.wo_id) AND (frwo.manager_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status)))))) WITH CHECK (((status = ANY (ARRAY['aprobado_gerente'::public.fund_request_expense_status, 'observado'::public.fund_request_expense_status, 'rechazado'::public.fund_request_expense_status])) AND (EXISTS ( SELECT 1
   FROM (public.fund_request_work_orders frwo
     JOIN public.fund_requests fr ON ((fr.fund_request_id = frwo.fund_request_id)))
  WHERE ((frwo.fund_request_id = fund_request_expenses.fund_request_id) AND (frwo.wo_id = fund_request_expenses.wo_id) AND (frwo.manager_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status))))));


--
--
-- Name: fund_request_expenses fre_update_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fre_update_requester ON public.fund_request_expenses FOR UPDATE TO authenticated USING (((status = ANY (ARRAY['borrador'::public.fund_request_expense_status, 'observado'::public.fund_request_expense_status, 'rechazado'::public.fund_request_expense_status])) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.requester_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status)))))) WITH CHECK (((status = ANY (ARRAY['borrador'::public.fund_request_expense_status, 'observado'::public.fund_request_expense_status, 'rechazado'::public.fund_request_expense_status, 'pendiente_aprobacion'::public.fund_request_expense_status, 'aprobado_gerente'::public.fund_request_expense_status])) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_expenses.fund_request_id) AND (fr.requester_staff_id = public.get_my_staff_id()) AND (fr.status = 'fondos_entregados'::public.fund_request_status))))));


--
--
-- Name: fund_request_work_orders frwo_select_accounting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY frwo_select_accounting ON public.fund_request_work_orders FOR SELECT TO authenticated USING (((public.has_permission('fund_disbursement.read'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status, 'en_liquidacion'::public.fund_request_status, 'cerrado'::public.fund_request_status])))))) OR (public.has_permission('expense_settlement.read'::text) AND (EXISTS ( SELECT 1
   FROM public.fund_requests fr
  WHERE ((fr.fund_request_id = fund_request_work_orders.fund_request_id) AND (fr.status = ANY (ARRAY['aprobado_gerente'::public.fund_request_status, 'fondos_entregados'::public.fund_request_status]))))))));


--
--
-- Name: fund_request_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fund_request_expenses ENABLE ROW LEVEL SECURITY;

--
--
-- Name: fund_request_work_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fund_request_work_orders ENABLE ROW LEVEL SECURITY;

--
--
-- Name: fund_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fund_requests ENABLE ROW LEVEL SECURITY;

--
--
-- Name: global_settings global_settings write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "global_settings write" ON public.global_settings TO authenticated USING (public.has_permission('global_settings.update'::text)) WITH CHECK (public.has_permission('global_settings.update'::text));


--
--
-- Name: global_settings anon reads login settings; Type: POLICY; Schema: public; Owner: -
--
-- A.5b del barrido de seguridad (bugs/seguridad/barrido_report.md §3; BAR-002 lectura, BAR-013
-- escritura). global_settings es la única tabla que la app consulta SIN sesión: LanguageSync
-- (montado en toda la app) y Auth.tsx piden `global_settings?select=*` desde la pantalla de login.
-- Por eso no se resuelve con REVOKE como las otras 16 tablas de A.5a — el login perdería el idioma
-- y la validación del dominio de correo — ni con permisos por columna, porque la app pide `select=*`
-- y además hace falta filtrar FILAS, no columnas: hoy `anon` recibe las 27 claves, incluidas
-- AUTH_MAX_FAILED_ATTEMPTS, AUTH_LOCKOUT_MINUTES, AUTH_EMAIL_GLOBAL_MAX_PER_HOUR, ADM_ACTIVITY_ID
-- y EXCHANGE_RATE_API_URL.
--
-- Encender RLS acá tiene un segundo efecto deliberado: las tres políticas de arriba, que hasta ahora
-- no se aplicaban, pasan a regir la escritura de `authenticated` y cierran que cualquier empleado
-- pueda reescribir TAX_RATE, los parámetros de bloqueo de cuentas o EXCHANGE_RATE_API_URL por la
-- Data API sin ningún control (la mitad de escritura de BAR-013).
--
-- No se activa FORCE ROW LEVEL SECURITY a propósito: el dueño es `postgres`, y de eso dependen las
-- 14 funciones SECURITY DEFINER que leen esta tabla, el trigger guard_auth_lockout_settings y los
-- jobs de pg_cron. `service_role` tampoco se ve afectado (tiene BYPASSRLS), que es lo que mantiene
-- vivas las lecturas de register-user, dashboard-data y exchange-rate-sync.
--
-- El ENABLE y esta política van en el mismo archivo, o sea en la misma transacción: no existe un
-- instante en que la tabla tenga RLS sin política y el login se quede sin acceso.

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon reads login settings" ON public.global_settings FOR SELECT TO anon USING (setting_key IN ('LANGUAGE', 'COMPACT_FONT', 'ALLOWED_EMAIL_DOMAIN'));


--
--
-- Name: holidays; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

--
--
-- Name: holidays holidays write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "holidays write delete" ON public.holidays FOR DELETE TO authenticated USING (public.has_permission('holiday.delete'::text));


--
--
-- Name: holidays holidays write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "holidays write insert" ON public.holidays FOR INSERT TO authenticated WITH CHECK (public.has_permission('holiday.create'::text));


--
--
-- Name: holidays holidays write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "holidays write update" ON public.holidays FOR UPDATE TO authenticated USING (public.has_permission('holiday.update'::text)) WITH CHECK (public.has_permission('holiday.update'::text));


--
--
-- Name: industries industries write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "industries write delete" ON public.industries FOR DELETE TO authenticated USING (public.has_permission('industry.delete'::text));


--
--
-- Name: industries industries write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "industries write insert" ON public.industries FOR INSERT TO authenticated WITH CHECK (public.has_permission('industry.create'::text));


--
--
-- Name: industries industries write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "industries write update" ON public.industries FOR UPDATE TO authenticated USING (public.has_permission('industry.update'::text)) WITH CHECK (public.has_permission('industry.update'::text));


--
--
-- Name: parametro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parametro ENABLE ROW LEVEL SECURITY;

--
--
-- Name: wo_payment_installments payment_installments firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payment_installments firm read" ON public.wo_payment_installments FOR SELECT TO authenticated USING ((public.has_permission('work_order.payment_plan.approve'::text) AND (public.permission_scope('work_order.payment_plan.approve'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
--
-- Name: wo_payment_plan payment_plan firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payment_plan firm read" ON public.wo_payment_plan FOR SELECT TO authenticated USING ((public.has_permission('work_order.payment_plan.approve'::text) AND (public.permission_scope('work_order.payment_plan.approve'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
--
-- Name: practicas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.practicas ENABLE ROW LEVEL SECURITY;

--
--
-- Name: skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

--
--
-- Name: skills skills read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "skills read" ON public.skills FOR SELECT TO authenticated USING (public.has_permission('competency.read'::text));


--
--
-- Name: skills skills write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "skills write delete" ON public.skills FOR DELETE TO authenticated USING (public.has_permission('competency.delete'::text));


--
--
-- Name: skills skills write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "skills write insert" ON public.skills FOR INSERT TO authenticated WITH CHECK (public.has_permission('competency.create'::text));


--
--
-- Name: skills skills write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "skills write update" ON public.skills FOR UPDATE TO authenticated USING (public.has_permission('competency.update'::text)) WITH CHECK (public.has_permission('competency.update'::text));


--
--
-- Name: society; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.society ENABLE ROW LEVEL SECURITY;

--
--
-- Name: staff staff read personnel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff read personnel" ON public.staff FOR SELECT TO authenticated USING (public.has_permission('staff.read'::text));


--
--
-- Name: staff staff write delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff write delete" ON public.staff FOR DELETE TO authenticated USING (public.has_permission('staff.delete'::text));


--
--
-- Name: staff staff write insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff write insert" ON public.staff FOR INSERT TO authenticated WITH CHECK (public.has_permission('staff.create'::text));


--
--
-- Name: staff staff write update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff write update" ON public.staff FOR UPDATE TO authenticated USING (public.has_permission('staff.update'::text)) WITH CHECK (public.has_permission('staff.update'::text));


--
--
-- Name: staff_alert_seen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_alert_seen ENABLE ROW LEVEL SECURITY;

--
--
-- Name: staff_alert_seen staff_alert_seen_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_alert_seen_insert ON public.staff_alert_seen FOR INSERT WITH CHECK ((staff_id IN ( SELECT staff.staff_id
   FROM public.staff
  WHERE (staff.auth_user_id = auth.uid()))));


--
--
-- Name: staff_alert_seen staff_alert_seen_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_alert_seen_select ON public.staff_alert_seen FOR SELECT USING ((staff_id IN ( SELECT staff.staff_id
   FROM public.staff
  WHERE (staff.auth_user_id = auth.uid()))));


--
--
-- Name: staff_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_skills ENABLE ROW LEVEL SECURITY;

--
--
-- Name: staff_skills staff_skills write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "staff_skills write" ON public.staff_skills TO authenticated USING (public.has_permission('staff.update'::text)) WITH CHECK (public.has_permission('staff.update'::text));


--
--
-- Name: servicios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

--
--
-- Name: time_entries time_entries delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "time_entries delete" ON public.time_entries FOR DELETE TO authenticated USING ((public.is_admin() OR (public.has_permission('time_entry.delete'::text) AND (staff_id = public.get_my_staff_id()))));


--
--
-- Name: time_entries time_entries insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "time_entries insert" ON public.time_entries FOR INSERT TO authenticated WITH CHECK ((public.has_permission('time_entry.create'::text) AND (staff_id = public.get_my_staff_id())));


--
--
-- Name: time_entries time_entries read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "time_entries read" ON public.time_entries FOR SELECT TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(engagement_id) OR (public.has_permission('time_entry.read'::text) AND (staff_id = public.get_my_staff_id()))));


--
--
-- Name: time_entries time_entries update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "time_entries update" ON public.time_entries FOR UPDATE TO authenticated USING ((public.is_admin() OR (public.has_permission('time_entry.update'::text) AND (staff_id = public.get_my_staff_id())))) WITH CHECK ((public.is_admin() OR (public.has_permission('time_entry.update'::text) AND (staff_id = public.get_my_staff_id()))));


--
--
-- Name: timer_entries timer_entries delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timer_entries delete" ON public.timer_entries FOR DELETE TO authenticated USING ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id())));


--
--
-- Name: timer_entries timer_entries insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timer_entries insert" ON public.timer_entries FOR INSERT TO authenticated WITH CHECK ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id())));


--
--
-- Name: timer_entries timer_entries read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timer_entries read" ON public.timer_entries FOR SELECT TO authenticated USING ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id())));


--
--
-- Name: timer_entries timer_entries update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "timer_entries update" ON public.timer_entries FOR UPDATE TO authenticated USING ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id()))) WITH CHECK ((public.has_permission('timer.use'::text) AND (staff_id = public.get_my_staff_id())));


--
--
-- Name: user_lifecycle_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_lifecycle_audit_log ENABLE ROW LEVEL SECURITY;

--
--
-- Name: work_orders wo_create_by_permission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_create_by_permission ON public.work_orders FOR INSERT TO authenticated WITH CHECK ((public.has_permission('work_order.create'::text) AND ((public.permission_scope('work_order.create'::text) IS DISTINCT FROM 'assigned_engagements'::text) OR public.is_assigned_to_engagement(engagement_id))));


--
--
-- Name: wo_payment_installments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_payment_installments ENABLE ROW LEVEL SECURITY;

--
--
-- Name: wo_payment_plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_payment_plan ENABLE ROW LEVEL SECURITY;

--
--
-- Name: wo_staffing_requirements wo_staffing_req_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_delete ON public.wo_staffing_requirements FOR DELETE TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id))));


--
--
-- Name: wo_staffing_requirements wo_staffing_req_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_insert ON public.wo_staffing_requirements FOR INSERT TO authenticated WITH CHECK ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id))));


--
--
-- Name: wo_staffing_requirements wo_staffing_req_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_select ON public.wo_staffing_requirements FOR SELECT TO authenticated USING ((public.is_admin() OR public.has_firmwide_assignment_visibility() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id)) OR public.has_assignment_on_engagement(public.resolve_wo_engagement_id(wo_id))));


--
--
-- Name: wo_staffing_requirement_skills wo_staffing_req_skills_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_skills_delete ON public.wo_staffing_requirement_skills FOR DELETE TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id))));


--
--
-- Name: wo_staffing_requirement_skills wo_staffing_req_skills_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_skills_insert ON public.wo_staffing_requirement_skills FOR INSERT TO authenticated WITH CHECK ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id))));


--
--
-- Name: wo_staffing_requirement_skills wo_staffing_req_skills_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_skills_select ON public.wo_staffing_requirement_skills FOR SELECT TO authenticated USING ((public.is_admin() OR public.has_firmwide_assignment_visibility() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.has_assignment_on_engagement(public.resolve_wo_req_skill_engagement_id(requirement_id))));


--
--
-- Name: wo_staffing_requirement_skills wo_staffing_req_skills_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_skills_update ON public.wo_staffing_requirement_skills FOR UPDATE TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id)))) WITH CHECK ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_req_skill_engagement_id(requirement_id)) OR public.is_engagement_responsible(public.resolve_wo_req_skill_engagement_id(requirement_id))));


--
--
-- Name: wo_staffing_requirements wo_staffing_req_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_staffing_req_update ON public.wo_staffing_requirements FOR UPDATE TO authenticated USING ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id)))) WITH CHECK ((public.is_admin() OR public.is_engagement_team_member(public.resolve_wo_engagement_id(wo_id)) OR public.is_engagement_responsible(public.resolve_wo_engagement_id(wo_id))));


--
--
-- Name: wo_staffing_requirement_skills; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_staffing_requirement_skills ENABLE ROW LEVEL SECURITY;

--
--
-- Name: wo_staffing_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wo_staffing_requirements ENABLE ROW LEVEL SECURITY;

--
--
-- Name: work_orders wo_team_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wo_team_update ON public.work_orders FOR UPDATE TO authenticated USING (public.is_engagement_team_member(engagement_id)) WITH CHECK (public.is_engagement_team_member(engagement_id));


--
--
-- Name: work_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

--
--
-- Name: work_orders work_orders assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "work_orders assigned read" ON public.work_orders FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = 'assigned_engagements'::text) AND public.is_assigned_to_engagement(engagement_id)));


--
--
-- Name: work_orders work_orders firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "work_orders firm read" ON public.work_orders FOR SELECT TO authenticated USING ((public.has_permission('work_order.read'::text) AND (public.permission_scope('work_order.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
--
-- Name: activity_worksheet_cells worksheet cells assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worksheet cells assigned read" ON public.activity_worksheet_cells FOR SELECT TO authenticated USING ((public.has_permission('worksheet.read'::text) AND (public.permission_scope('worksheet.read'::text) = 'assigned_engagements'::text) AND (EXISTS ( SELECT 1
   FROM public.activity_worksheets w
  WHERE ((w.id = activity_worksheet_cells.worksheet_id) AND public.is_assigned_to_engagement(w.engagement_id))))));


--
--
-- Name: activity_worksheet_cells worksheet cells firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worksheet cells firm read" ON public.activity_worksheet_cells FOR SELECT TO authenticated USING ((public.has_permission('worksheet.read'::text) AND (public.permission_scope('worksheet.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
--
-- Name: activity_worksheets worksheet_create_by_permission; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worksheet_create_by_permission ON public.activity_worksheets FOR INSERT TO authenticated WITH CHECK ((public.has_permission('worksheet.create'::text) AND ((public.permission_scope('worksheet.create'::text) IS DISTINCT FROM 'assigned_engagements'::text) OR public.is_assigned_to_engagement(engagement_id))));


--
--
-- Name: activity_worksheets worksheet_team_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY worksheet_team_update ON public.activity_worksheets FOR UPDATE TO authenticated USING (public.is_engagement_team_member(engagement_id)) WITH CHECK (public.is_engagement_team_member(engagement_id));


--
--
-- Name: activity_worksheets worksheets assigned read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worksheets assigned read" ON public.activity_worksheets FOR SELECT TO authenticated USING ((public.has_permission('worksheet.read'::text) AND (public.permission_scope('worksheet.read'::text) = 'assigned_engagements'::text) AND public.is_assigned_to_engagement(engagement_id)));


--
--
-- Name: activity_worksheets worksheets firm read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "worksheets firm read" ON public.activity_worksheets FOR SELECT TO authenticated USING ((public.has_permission('worksheet.read'::text) AND (public.permission_scope('worksheet.read'::text) = ANY (ARRAY['firm'::text, 'department'::text]))));


--
