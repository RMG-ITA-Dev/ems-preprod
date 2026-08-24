SET check_function_bodies = false;
SET row_security = off;

-- Migración cero — set consolidado (bugs/migracion_cero/plan_v2.md Fase 2).
-- 06: grants de tabla, de columna (incluye el hardening PII de staff) y de rutina.
-- Fuente de autoría: bugs/migracion_cero/autoria/dump_full_baseline.sql (pg_dump --schema-only,
-- baseline de 184 migraciones + preseed). Extraído por bloque -- Name:/Type:/Schema: de pg_dump,
-- preservando el orden relativo original (orden topológico real de pg_dump, no reordenado a mano).
-- Ver docs/migraciones/DIFF-INTENCIONAL-consolidacion.md para los cambios deliberados vs baseline.

--
-- Name: FUNCTION admin_set_user_role(p_target_user_id uuid, p_new_role public.app_role, p_reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_user_role(p_target_user_id uuid, p_new_role public.app_role, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_user_role(p_target_user_id uuid, p_new_role public.app_role, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_user_role(p_target_user_id uuid, p_new_role public.app_role, p_reason text) TO service_role;


--
--
-- Name: FUNCTION admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text) TO service_role;


--
--
-- Name: FUNCTION admin_unblock_account(p_staff_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.admin_unblock_account(p_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_unblock_account(p_staff_id uuid) TO service_role;


--
--
-- Name: FUNCTION assign_user_role_atomic(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.assign_user_role_atomic(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.assign_user_role_atomic(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assign_user_role_atomic(p_user_id uuid) TO service_role;


--
--
-- Name: FUNCTION authorize_engagement_state_override(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.authorize_engagement_state_override() TO anon;
GRANT ALL ON FUNCTION public.authorize_engagement_state_override() TO authenticated;
GRANT ALL ON FUNCTION public.authorize_engagement_state_override() TO service_role;


--
--
-- Name: FUNCTION batch_upsert_worksheet_cells(p_worksheet_id uuid, p_cells jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.batch_upsert_worksheet_cells(p_worksheet_id uuid, p_cells jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.batch_upsert_worksheet_cells(p_worksheet_id uuid, p_cells jsonb) TO anon;
GRANT ALL ON FUNCTION public.batch_upsert_worksheet_cells(p_worksheet_id uuid, p_cells jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.batch_upsert_worksheet_cells(p_worksheet_id uuid, p_cells jsonb) TO service_role;


--
--
-- Name: FUNCTION can_approve_timesheet(p_approver_auth_id uuid, p_period_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_approve_timesheet(p_approver_auth_id uuid, p_period_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_approve_timesheet(p_approver_auth_id uuid, p_period_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_approve_timesheet(p_approver_auth_id uuid, p_period_id uuid) TO service_role;


--
--
-- Name: FUNCTION can_approve_timesheet_line(p_approver_auth_id uuid, p_period_id uuid, p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_approve_timesheet_line(p_approver_auth_id uuid, p_period_id uuid, p_engagement_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_approve_timesheet_line(p_approver_auth_id uuid, p_period_id uuid, p_engagement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_approve_timesheet_line(p_approver_auth_id uuid, p_period_id uuid, p_engagement_id uuid) TO service_role;


--
--
-- Name: FUNCTION can_approve_wo_risk(p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_approve_wo_risk(p_engagement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_approve_wo_risk(p_engagement_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_approve_wo_risk(p_engagement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_approve_wo_risk(p_engagement_id uuid) TO service_role;


--
--
-- Name: FUNCTION can_read_engagement_assignments(p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.can_read_engagement_assignments(p_engagement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_read_engagement_assignments(p_engagement_id uuid) TO authenticated;


--
--
-- Name: FUNCTION cascade_practice_abbreviation_rename(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.cascade_practice_abbreviation_rename() TO anon;
GRANT ALL ON FUNCTION public.cascade_practice_abbreviation_rename() TO authenticated;
GRANT ALL ON FUNCTION public.cascade_practice_abbreviation_rename() TO service_role;


--
--
-- Name: FUNCTION check_login_allowed(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_login_allowed(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_login_allowed(p_email text) TO service_role;


--
--
-- Name: FUNCTION check_pending_hours_before_termination(p_staff_id uuid, p_termination_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_pending_hours_before_termination(p_staff_id uuid, p_termination_date date) TO anon;
GRANT ALL ON FUNCTION public.check_pending_hours_before_termination(p_staff_id uuid, p_termination_date date) TO authenticated;
GRANT ALL ON FUNCTION public.check_pending_hours_before_termination(p_staff_id uuid, p_termination_date date) TO service_role;


--
--
-- Name: FUNCTION check_time_entry_engagement_dates(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_time_entry_engagement_dates() TO anon;
GRANT ALL ON FUNCTION public.check_time_entry_engagement_dates() TO authenticated;
GRANT ALL ON FUNCTION public.check_time_entry_engagement_dates() TO service_role;


--
--
-- Name: FUNCTION check_wo_approved(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_wo_approved() TO anon;
GRANT ALL ON FUNCTION public.check_wo_approved() TO authenticated;
GRANT ALL ON FUNCTION public.check_wo_approved() TO service_role;


--
--
-- Name: FUNCTION copy_categories_between_practices(p_source_practice_id uuid, p_target_practice_id uuid, p_replace boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.copy_categories_between_practices(p_source_practice_id uuid, p_target_practice_id uuid, p_replace boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.copy_categories_between_practices(p_source_practice_id uuid, p_target_practice_id uuid, p_replace boolean) TO anon;
GRANT ALL ON FUNCTION public.copy_categories_between_practices(p_source_practice_id uuid, p_target_practice_id uuid, p_replace boolean) TO authenticated;
GRANT ALL ON FUNCTION public.copy_categories_between_practices(p_source_practice_id uuid, p_target_practice_id uuid, p_replace boolean) TO service_role;


--
--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.categories TO anon;
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
--
-- Name: FUNCTION create_category_for_practice(p_practice_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_category_for_practice(p_practice_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_category_for_practice(p_practice_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.create_category_for_practice(p_practice_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.create_category_for_practice(p_practice_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role) TO service_role;


--
--
-- Name: TABLE engagements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engagements TO anon;
GRANT ALL ON TABLE public.engagements TO authenticated;
GRANT ALL ON TABLE public.engagements TO service_role;


--
--
-- Name: FUNCTION create_engagement_with_code(p_engagement_name text, p_client_id uuid, p_partner_id uuid, p_manager_id uuid, p_start_date date, p_end_date date, p_status text, p_oficina smallint, p_practica smallint, p_funcion smallint, p_anio_fiscal integer, p_work_order_required boolean, p_activity_required boolean, p_is_internal boolean, p_approval_required boolean, p_fecha_cierre date, p_anio_fiscal_override boolean, p_society_id uuid, p_sqr_id uuid, p_encargado_id uuid, p_specialist_it_id uuid, p_specialist_tax_id uuid, p_contract_file_path text, p_taxonomy_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_engagement_with_code(p_engagement_name text, p_client_id uuid, p_partner_id uuid, p_manager_id uuid, p_start_date date, p_end_date date, p_status text, p_oficina smallint, p_practica smallint, p_funcion smallint, p_anio_fiscal integer, p_work_order_required boolean, p_activity_required boolean, p_is_internal boolean, p_approval_required boolean, p_fecha_cierre date, p_anio_fiscal_override boolean, p_society_id uuid, p_sqr_id uuid, p_encargado_id uuid, p_specialist_it_id uuid, p_specialist_tax_id uuid, p_contract_file_path text, p_taxonomy_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_engagement_with_code(p_engagement_name text, p_client_id uuid, p_partner_id uuid, p_manager_id uuid, p_start_date date, p_end_date date, p_status text, p_oficina smallint, p_practica smallint, p_funcion smallint, p_anio_fiscal integer, p_work_order_required boolean, p_activity_required boolean, p_is_internal boolean, p_approval_required boolean, p_fecha_cierre date, p_anio_fiscal_override boolean, p_society_id uuid, p_sqr_id uuid, p_encargado_id uuid, p_specialist_it_id uuid, p_specialist_tax_id uuid, p_contract_file_path text, p_taxonomy_id uuid) TO anon;
GRANT ALL ON FUNCTION public.create_engagement_with_code(p_engagement_name text, p_client_id uuid, p_partner_id uuid, p_manager_id uuid, p_start_date date, p_end_date date, p_status text, p_oficina smallint, p_practica smallint, p_funcion smallint, p_anio_fiscal integer, p_work_order_required boolean, p_activity_required boolean, p_is_internal boolean, p_approval_required boolean, p_fecha_cierre date, p_anio_fiscal_override boolean, p_society_id uuid, p_sqr_id uuid, p_encargado_id uuid, p_specialist_it_id uuid, p_specialist_tax_id uuid, p_contract_file_path text, p_taxonomy_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_engagement_with_code(p_engagement_name text, p_client_id uuid, p_partner_id uuid, p_manager_id uuid, p_start_date date, p_end_date date, p_status text, p_oficina smallint, p_practica smallint, p_funcion smallint, p_anio_fiscal integer, p_work_order_required boolean, p_activity_required boolean, p_is_internal boolean, p_approval_required boolean, p_fecha_cierre date, p_anio_fiscal_override boolean, p_society_id uuid, p_sqr_id uuid, p_encargado_id uuid, p_specialist_it_id uuid, p_specialist_tax_id uuid, p_contract_file_path text, p_taxonomy_id uuid) TO service_role;


--
--
-- Name: TABLE activity_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_codes TO anon;
GRANT ALL ON TABLE public.activity_codes TO authenticated;
GRANT ALL ON TABLE public.activity_codes TO service_role;


--
--
-- Name: FUNCTION create_practice_activity(p_practice_id uuid, p_description text, p_entity_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_practice_activity(p_practice_id uuid, p_description text, p_entity_type text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_practice_activity(p_practice_id uuid, p_description text, p_entity_type text) TO anon;
GRANT ALL ON FUNCTION public.create_practice_activity(p_practice_id uuid, p_description text, p_entity_type text) TO authenticated;
GRANT ALL ON FUNCTION public.create_practice_activity(p_practice_id uuid, p_description text, p_entity_type text) TO service_role;


--
--
-- Name: FUNCTION current_role_key(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.current_role_key() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_role_key() TO anon;
GRANT ALL ON FUNCTION public.current_role_key() TO authenticated;
GRANT ALL ON FUNCTION public.current_role_key() TO service_role;


--
--
-- Name: FUNCTION deactivate_practice_activity(p_activity_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.deactivate_practice_activity(p_activity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.deactivate_practice_activity(p_activity_id uuid) TO anon;
GRANT ALL ON FUNCTION public.deactivate_practice_activity(p_activity_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.deactivate_practice_activity(p_activity_id uuid) TO service_role;


--
--
-- Name: FUNCTION delete_category_for_practice(p_category_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_category_for_practice(p_category_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_category_for_practice(p_category_id uuid) TO anon;
GRANT ALL ON FUNCTION public.delete_category_for_practice(p_category_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_category_for_practice(p_category_id uuid) TO service_role;


--
--
-- Name: FUNCTION enforce_activity_default(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_activity_default() TO anon;
GRANT ALL ON FUNCTION public.enforce_activity_default() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_activity_default() TO service_role;


--
--
-- Name: FUNCTION enforce_assignment_practice_scope(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_assignment_practice_scope() TO anon;
GRANT ALL ON FUNCTION public.enforce_assignment_practice_scope() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_assignment_practice_scope() TO service_role;


--
--
-- Name: FUNCTION enforce_engagement_creator_team(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_engagement_creator_team() TO anon;
GRANT ALL ON FUNCTION public.enforce_engagement_creator_team() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_engagement_creator_team() TO service_role;


--
--
-- Name: FUNCTION enforce_engagement_fiscal_year_invariant(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_engagement_fiscal_year_invariant() TO anon;
GRANT ALL ON FUNCTION public.enforce_engagement_fiscal_year_invariant() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_engagement_fiscal_year_invariant() TO service_role;


--
--
-- Name: FUNCTION enforce_holiday_blocking(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_holiday_blocking() TO anon;
GRANT ALL ON FUNCTION public.enforce_holiday_blocking() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_holiday_blocking() TO service_role;


--
--
-- Name: FUNCTION enforce_termination_date(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_termination_date() TO anon;
GRANT ALL ON FUNCTION public.enforce_termination_date() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_termination_date() TO service_role;


--
--
-- Name: FUNCTION enforce_wo_staffing_practice_scope(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_wo_staffing_practice_scope() TO anon;
GRANT ALL ON FUNCTION public.enforce_wo_staffing_practice_scope() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_wo_staffing_practice_scope() TO service_role;


--
--
-- Name: FUNCTION enforce_worksheet_cell_practice_scope(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_worksheet_cell_practice_scope() TO anon;
GRANT ALL ON FUNCTION public.enforce_worksheet_cell_practice_scope() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_worksheet_cell_practice_scope() TO service_role;


--
--
-- Name: FUNCTION engagement_accepts_assignment_writes(p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.engagement_accepts_assignment_writes(p_engagement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.engagement_accepts_assignment_writes(p_engagement_id uuid) TO authenticated;


--
--
-- Name: FUNCTION engagement_allows_hours_or_requests(p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.engagement_allows_hours_or_requests(p_engagement_id uuid) TO anon;
GRANT ALL ON FUNCTION public.engagement_allows_hours_or_requests(p_engagement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.engagement_allows_hours_or_requests(p_engagement_id uuid) TO service_role;


--
--
-- Name: FUNCTION engagement_in_my_fund_request(p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.engagement_in_my_fund_request(p_engagement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.engagement_in_my_fund_request(p_engagement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.engagement_in_my_fund_request(p_engagement_id uuid) TO service_role;


--
--
-- Name: FUNCTION engagement_is_approved_state(p_engagement_id uuid, p_override smallint, p_wo_required boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.engagement_is_approved_state(p_engagement_id uuid, p_override smallint, p_wo_required boolean) TO anon;
GRANT ALL ON FUNCTION public.engagement_is_approved_state(p_engagement_id uuid, p_override smallint, p_wo_required boolean) TO authenticated;
GRANT ALL ON FUNCTION public.engagement_is_approved_state(p_engagement_id uuid, p_override smallint, p_wo_required boolean) TO service_role;


--
--
-- Name: FUNCTION finalize_all_stale_timers(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finalize_all_stale_timers() FROM PUBLIC;
GRANT ALL ON FUNCTION public.finalize_all_stale_timers() TO service_role;


--
--
-- Name: FUNCTION finalize_due_engagements(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.finalize_due_engagements() TO anon;
GRANT ALL ON FUNCTION public.finalize_due_engagements() TO authenticated;
GRANT ALL ON FUNCTION public.finalize_due_engagements() TO service_role;


--
--
-- Name: FUNCTION finalize_my_stale_timers(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.finalize_my_stale_timers() TO anon;
GRANT ALL ON FUNCTION public.finalize_my_stale_timers() TO authenticated;
GRANT ALL ON FUNCTION public.finalize_my_stale_timers() TO service_role;


--
--
-- Name: FUNCTION fr_guard_accounting_cols(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fr_guard_accounting_cols() TO anon;
GRANT ALL ON FUNCTION public.fr_guard_accounting_cols() TO authenticated;
GRANT ALL ON FUNCTION public.fr_guard_accounting_cols() TO service_role;


--
--
-- Name: FUNCTION fr_is_ot_manager(p_fr_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fr_is_ot_manager(p_fr_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fr_is_ot_manager(p_fr_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fr_is_ot_manager(p_fr_id uuid) TO service_role;


--
--
-- Name: FUNCTION fr_is_requester(p_fr_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fr_is_requester(p_fr_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fr_is_requester(p_fr_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fr_is_requester(p_fr_id uuid) TO service_role;


--
--
-- Name: FUNCTION fr_is_submitted(p_fr_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fr_is_submitted(p_fr_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fr_is_submitted(p_fr_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fr_is_submitted(p_fr_id uuid) TO service_role;


--
--
-- Name: FUNCTION fr_wo_guard_approval_cols(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fr_wo_guard_approval_cols() TO anon;
GRANT ALL ON FUNCTION public.fr_wo_guard_approval_cols() TO authenticated;
GRANT ALL ON FUNCTION public.fr_wo_guard_approval_cols() TO service_role;


--
--
-- Name: FUNCTION fr_wo_rollup_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fr_wo_rollup_status() TO anon;
GRANT ALL ON FUNCTION public.fr_wo_rollup_status() TO authenticated;
GRANT ALL ON FUNCTION public.fr_wo_rollup_status() TO service_role;


--
--
-- Name: FUNCTION fr_wo_set_manager(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fr_wo_set_manager() TO anon;
GRANT ALL ON FUNCTION public.fr_wo_set_manager() TO authenticated;
GRANT ALL ON FUNCTION public.fr_wo_set_manager() TO service_role;


--
--
-- Name: FUNCTION fr_wo_validate_approved(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fr_wo_validate_approved() TO anon;
GRANT ALL ON FUNCTION public.fr_wo_validate_approved() TO authenticated;
GRANT ALL ON FUNCTION public.fr_wo_validate_approved() TO service_role;


--
--
-- Name: FUNCTION fre_validate_transition(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fre_validate_transition() TO anon;
GRANT ALL ON FUNCTION public.fre_validate_transition() TO authenticated;
GRANT ALL ON FUNCTION public.fre_validate_transition() TO service_role;


--
--
-- Name: FUNCTION fre_validate_wo_in_request(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fre_validate_wo_in_request() TO anon;
GRANT ALL ON FUNCTION public.fre_validate_wo_in_request() TO authenticated;
GRANT ALL ON FUNCTION public.fre_validate_wo_in_request() TO service_role;


--
--
-- Name: FUNCTION fund_request_expenses_touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fund_request_expenses_touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.fund_request_expenses_touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.fund_request_expenses_touch_updated_at() TO service_role;


--
--
-- Name: FUNCTION fund_request_save_edit(p_fund_request_id uuid, p_fields jsonb, p_allocations jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fund_request_save_edit(p_fund_request_id uuid, p_fields jsonb, p_allocations jsonb) TO anon;
GRANT ALL ON FUNCTION public.fund_request_save_edit(p_fund_request_id uuid, p_fields jsonb, p_allocations jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.fund_request_save_edit(p_fund_request_id uuid, p_fields jsonb, p_allocations jsonb) TO service_role;


--
--
-- Name: FUNCTION fund_request_submit(p_fund_request_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fund_request_submit(p_fund_request_id uuid) TO anon;
GRANT ALL ON FUNCTION public.fund_request_submit(p_fund_request_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fund_request_submit(p_fund_request_id uuid) TO service_role;


--
--
-- Name: FUNCTION fund_requests_enforce_bob(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fund_requests_enforce_bob() TO anon;
GRANT ALL ON FUNCTION public.fund_requests_enforce_bob() TO authenticated;
GRANT ALL ON FUNCTION public.fund_requests_enforce_bob() TO service_role;


--
--
-- Name: FUNCTION fund_requests_touch_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fund_requests_touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.fund_requests_touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.fund_requests_touch_updated_at() TO service_role;


--
--
-- Name: FUNCTION get_all_user_roles(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_all_user_roles() TO anon;
GRANT ALL ON FUNCTION public.get_all_user_roles() TO authenticated;
GRANT ALL ON FUNCTION public.get_all_user_roles() TO service_role;


--
--
-- Name: FUNCTION get_approvable_pairs(p_period_ids uuid[], p_engagement_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_approvable_pairs(p_period_ids uuid[], p_engagement_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.get_approvable_pairs(p_period_ids uuid[], p_engagement_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_approvable_pairs(p_period_ids uuid[], p_engagement_ids uuid[]) TO service_role;


--
--
-- Name: FUNCTION get_engagement_team_candidates(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_engagement_team_candidates() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_engagement_team_candidates() TO authenticated;
GRANT ALL ON FUNCTION public.get_engagement_team_candidates() TO service_role;


--
--
-- Name: FUNCTION get_line_approver(p_staff_id uuid, p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_line_approver(p_staff_id uuid, p_engagement_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_line_approver(p_staff_id uuid, p_engagement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_line_approver(p_staff_id uuid, p_engagement_id uuid) TO service_role;


--
--
-- Name: FUNCTION get_my_authorization_context(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_authorization_context() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_authorization_context() TO anon;
GRANT ALL ON FUNCTION public.get_my_authorization_context() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_authorization_context() TO service_role;


--
--
-- Name: FUNCTION get_my_pending_hours(p_staff_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_pending_hours(p_staff_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_my_pending_hours(p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_my_pending_hours(p_staff_id uuid) TO service_role;


--
--
-- Name: FUNCTION get_my_staff_id(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_staff_id() TO anon;
GRANT ALL ON FUNCTION public.get_my_staff_id() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_staff_id() TO service_role;


--
--
-- Name: FUNCTION get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date) TO authenticated;


--
--
-- Name: FUNCTION get_staff_full(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_staff_full() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_staff_full() TO authenticated;
GRANT ALL ON FUNCTION public.get_staff_full() TO service_role;


--
--
-- Name: FUNCTION get_timesheet_approvers(p_staff_id uuid, p_week_start date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_timesheet_approvers(p_staff_id uuid, p_week_start date) TO anon;
GRANT ALL ON FUNCTION public.get_timesheet_approvers(p_staff_id uuid, p_week_start date) TO authenticated;
GRANT ALL ON FUNCTION public.get_timesheet_approvers(p_staff_id uuid, p_week_start date) TO service_role;


--
--
-- Name: FUNCTION get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date) TO anon;
GRANT ALL ON FUNCTION public.get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date) TO service_role;


--
--
-- Name: FUNCTION guard_auth_lockout_settings(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_auth_lockout_settings() TO anon;
GRANT ALL ON FUNCTION public.guard_auth_lockout_settings() TO authenticated;
GRANT ALL ON FUNCTION public.guard_auth_lockout_settings() TO service_role;


--
--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
--
-- Name: FUNCTION has_assignment_on_engagement(p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_assignment_on_engagement(p_engagement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_assignment_on_engagement(p_engagement_id uuid) TO authenticated;


--
--
-- Name: FUNCTION has_firmwide_assignment_visibility(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_firmwide_assignment_visibility() FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_firmwide_assignment_visibility() TO authenticated;


--
--
-- Name: FUNCTION has_permission(p_permission_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_permission(p_permission_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_permission(p_permission_key text) TO anon;
GRANT ALL ON FUNCTION public.has_permission(p_permission_key text) TO authenticated;
GRANT ALL ON FUNCTION public.has_permission(p_permission_key text) TO service_role;


--
--
-- Name: FUNCTION has_role(_user_id uuid, _role public.app_role); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(_user_id uuid, _role public.app_role) TO service_role;


--
--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
--
-- Name: FUNCTION is_assigned_to_client(p_client_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_assigned_to_client(p_client_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_assigned_to_client(p_client_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_assigned_to_client(p_client_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_assigned_to_client(p_client_id uuid) TO service_role;


--
--
-- Name: FUNCTION is_assigned_to_engagement(p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_assigned_to_engagement(p_engagement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_assigned_to_engagement(p_engagement_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_assigned_to_engagement(p_engagement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_assigned_to_engagement(p_engagement_id uuid) TO service_role;


--
--
-- Name: FUNCTION is_auto_approved_category(p_staff_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_auto_approved_category(p_staff_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_auto_approved_category(p_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_auto_approved_category(p_staff_id uuid) TO service_role;


--
--
-- Name: FUNCTION is_engagement_responsible(p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_engagement_responsible(p_engagement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_engagement_responsible(p_engagement_id uuid) TO authenticated;


--
--
-- Name: FUNCTION is_engagement_team_member(p_engagement_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_engagement_team_member(p_engagement_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_engagement_team_member(p_engagement_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_engagement_team_member(p_engagement_id uuid) TO service_role;


--
--
-- Name: FUNCTION link_auth_user_to_staff(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.link_auth_user_to_staff() TO anon;
GRANT ALL ON FUNCTION public.link_auth_user_to_staff() TO authenticated;
GRANT ALL ON FUNCTION public.link_auth_user_to_staff() TO service_role;


--
--
-- Name: FUNCTION link_staff_to_auth_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.link_staff_to_auth_user() TO anon;
GRANT ALL ON FUNCTION public.link_staff_to_auth_user() TO authenticated;
GRANT ALL ON FUNCTION public.link_staff_to_auth_user() TO service_role;


--
--
-- Name: FUNCTION move_category(p_category_id uuid, p_new_position integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.move_category(p_category_id uuid, p_new_position integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.move_category(p_category_id uuid, p_new_position integer) TO anon;
GRANT ALL ON FUNCTION public.move_category(p_category_id uuid, p_new_position integer) TO authenticated;
GRANT ALL ON FUNCTION public.move_category(p_category_id uuid, p_new_position integer) TO service_role;


--
--
-- Name: FUNCTION permission_scope(p_permission_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.permission_scope(p_permission_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.permission_scope(p_permission_key text) TO anon;
GRANT ALL ON FUNCTION public.permission_scope(p_permission_key text) TO authenticated;
GRANT ALL ON FUNCTION public.permission_scope(p_permission_key text) TO service_role;


--
--
-- Name: FUNCTION prevent_imported_timer_delete(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_imported_timer_delete() TO anon;
GRANT ALL ON FUNCTION public.prevent_imported_timer_delete() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_imported_timer_delete() TO service_role;


--
--
-- Name: FUNCTION prevent_self_blocked_change(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_self_blocked_change() TO anon;
GRANT ALL ON FUNCTION public.prevent_self_blocked_change() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_self_blocked_change() TO service_role;


--
--
-- Name: FUNCTION prevent_staff_reactivation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_staff_reactivation() TO anon;
GRANT ALL ON FUNCTION public.prevent_staff_reactivation() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_staff_reactivation() TO service_role;


--
--
-- Name: FUNCTION protect_approved_time_entries(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.protect_approved_time_entries() TO anon;
GRANT ALL ON FUNCTION public.protect_approved_time_entries() TO authenticated;
GRANT ALL ON FUNCTION public.protect_approved_time_entries() TO service_role;


--
--
-- Name: FUNCTION reactivate_practice_activity(p_activity_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reactivate_practice_activity(p_activity_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reactivate_practice_activity(p_activity_id uuid) TO anon;
GRANT ALL ON FUNCTION public.reactivate_practice_activity(p_activity_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reactivate_practice_activity(p_activity_id uuid) TO service_role;


--
--
-- Name: FUNCTION recompute_engagement_finalization(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.recompute_engagement_finalization() TO anon;
GRANT ALL ON FUNCTION public.recompute_engagement_finalization() TO authenticated;
GRANT ALL ON FUNCTION public.recompute_engagement_finalization() TO service_role;


--
--
-- Name: FUNCTION record_failed_login(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_failed_login(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_failed_login(p_email text) TO service_role;


--
--
-- Name: FUNCTION reorder_practice_activity(p_activity_id uuid, p_new_position integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reorder_practice_activity(p_activity_id uuid, p_new_position integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_practice_activity(p_activity_id uuid, p_new_position integer) TO anon;
GRANT ALL ON FUNCTION public.reorder_practice_activity(p_activity_id uuid, p_new_position integer) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_practice_activity(p_activity_id uuid, p_new_position integer) TO service_role;


--
--
-- Name: FUNCTION reset_login_attempts(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_login_attempts(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_login_attempts(p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.reset_login_attempts(p_email text) TO service_role;


--
--
-- Name: FUNCTION reset_timer_import_on_unlink(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reset_timer_import_on_unlink() TO anon;
GRANT ALL ON FUNCTION public.reset_timer_import_on_unlink() TO authenticated;
GRANT ALL ON FUNCTION public.reset_timer_import_on_unlink() TO service_role;


--
--
-- Name: FUNCTION resolve_wo_engagement_id(p_wo_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_wo_engagement_id(p_wo_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_wo_engagement_id(p_wo_id uuid) TO authenticated;


--
--
-- Name: FUNCTION resolve_wo_req_skill_engagement_id(p_requirement_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_wo_req_skill_engagement_id(p_requirement_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resolve_wo_req_skill_engagement_id(p_requirement_id uuid) TO authenticated;


--
--
-- Name: FUNCTION save_engagement_assignments(p_engagement_id uuid, p_upserts jsonb, p_deleted_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_engagement_assignments(p_engagement_id uuid, p_upserts jsonb, p_deleted_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_engagement_assignments(p_engagement_id uuid, p_upserts jsonb, p_deleted_ids uuid[]) TO authenticated;


--
--
-- Name: FUNCTION save_wo_staffing(p_wo_id uuid, p_requirements jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_wo_staffing(p_wo_id uuid, p_requirements jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_wo_staffing(p_wo_id uuid, p_requirements jsonb) TO authenticated;


--
--
-- Name: FUNCTION set_authz_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_authz_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_authz_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_authz_updated_at() TO service_role;


--
--
-- Name: FUNCTION set_client_created_by(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_client_created_by() TO anon;
GRANT ALL ON FUNCTION public.set_client_created_by() TO authenticated;
GRANT ALL ON FUNCTION public.set_client_created_by() TO service_role;


--
--
-- Name: FUNCTION set_engagement_created_by(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_engagement_created_by() TO anon;
GRANT ALL ON FUNCTION public.set_engagement_created_by() TO authenticated;
GRANT ALL ON FUNCTION public.set_engagement_created_by() TO service_role;


--
--
-- Name: FUNCTION set_fund_request_number(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_fund_request_number() TO anon;
GRANT ALL ON FUNCTION public.set_fund_request_number() TO authenticated;
GRANT ALL ON FUNCTION public.set_fund_request_number() TO service_role;


--
--
-- Name: FUNCTION staff_id_number_conflict(p_id_number text, p_exclude_staff_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.staff_id_number_conflict(p_id_number text, p_exclude_staff_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.staff_id_number_conflict(p_id_number text, p_exclude_staff_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.staff_id_number_conflict(p_id_number text, p_exclude_staff_id uuid) TO service_role;


--
--
-- Name: FUNCTION start_timer_entry(p_engagement_id uuid, p_activity_id uuid, p_description text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.start_timer_entry(p_engagement_id uuid, p_activity_id uuid, p_description text) TO anon;
GRANT ALL ON FUNCTION public.start_timer_entry(p_engagement_id uuid, p_activity_id uuid, p_description text) TO authenticated;
GRANT ALL ON FUNCTION public.start_timer_entry(p_engagement_id uuid, p_activity_id uuid, p_description text) TO service_role;


--
--
-- Name: FUNCTION stop_timer_entry(p_timer_id uuid, p_ended_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.stop_timer_entry(p_timer_id uuid, p_ended_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.stop_timer_entry(p_timer_id uuid, p_ended_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.stop_timer_entry(p_timer_id uuid, p_ended_at timestamp with time zone) TO service_role;


--
--
-- Name: FUNCTION submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_activity_ids uuid[], p_is_auto_approved boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_activity_ids uuid[], p_is_auto_approved boolean) TO anon;
GRANT ALL ON FUNCTION public.submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_activity_ids uuid[], p_is_auto_approved boolean) TO authenticated;
GRANT ALL ON FUNCTION public.submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_activity_ids uuid[], p_is_auto_approved boolean) TO service_role;


--
--
-- Name: FUNCTION sync_worksheet_to_wo_budget(p_worksheet_id uuid, p_wo_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_worksheet_to_wo_budget(p_worksheet_id uuid, p_wo_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sync_worksheet_to_wo_budget(p_worksheet_id uuid, p_wo_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sync_worksheet_to_wo_budget(p_worksheet_id uuid, p_wo_id uuid) TO service_role;


--
--
-- Name: FUNCTION unsubmit_timesheet_safe(p_period_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unsubmit_timesheet_safe(p_period_id uuid) TO anon;
GRANT ALL ON FUNCTION public.unsubmit_timesheet_safe(p_period_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unsubmit_timesheet_safe(p_period_id uuid) TO service_role;


--
--
-- Name: FUNCTION update_category_for_practice(p_category_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_category_for_practice(p_category_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_category_for_practice(p_category_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role) TO anon;
GRANT ALL ON FUNCTION public.update_category_for_practice(p_category_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role) TO authenticated;
GRANT ALL ON FUNCTION public.update_category_for_practice(p_category_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role) TO service_role;


--
--
-- Name: FUNCTION update_timesheet_minmax_settings(p_daily_min numeric, p_daily_max numeric, p_weekly_min numeric, p_weekly_max numeric, p_work_days integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_timesheet_minmax_settings(p_daily_min numeric, p_daily_max numeric, p_weekly_min numeric, p_weekly_max numeric, p_work_days integer) TO anon;
GRANT ALL ON FUNCTION public.update_timesheet_minmax_settings(p_daily_min numeric, p_daily_max numeric, p_weekly_min numeric, p_weekly_max numeric, p_work_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.update_timesheet_minmax_settings(p_daily_min numeric, p_daily_max numeric, p_weekly_min numeric, p_weekly_max numeric, p_work_days integer) TO service_role;


--
--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;


--
--
-- Name: FUNCTION validate_email_domain(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_email_domain() TO anon;
GRANT ALL ON FUNCTION public.validate_email_domain() TO authenticated;
GRANT ALL ON FUNCTION public.validate_email_domain() TO service_role;


--
--
-- Name: FUNCTION validate_submission_has_entries(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_submission_has_entries() TO anon;
GRANT ALL ON FUNCTION public.validate_submission_has_entries() TO authenticated;
GRANT ALL ON FUNCTION public.validate_submission_has_entries() TO service_role;


--
--
-- Name: FUNCTION validate_timer_entry_duration(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_timer_entry_duration() TO anon;
GRANT ALL ON FUNCTION public.validate_timer_entry_duration() TO authenticated;
GRANT ALL ON FUNCTION public.validate_timer_entry_duration() TO service_role;


--
--
-- Name: FUNCTION wo_guard_risk_approval(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wo_guard_risk_approval() TO anon;
GRANT ALL ON FUNCTION public.wo_guard_risk_approval() TO authenticated;
GRANT ALL ON FUNCTION public.wo_guard_risk_approval() TO service_role;


--
--
-- Name: FUNCTION wo_in_my_fund_request(p_wo_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.wo_in_my_fund_request(p_wo_id uuid) TO anon;
GRANT ALL ON FUNCTION public.wo_in_my_fund_request(p_wo_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.wo_in_my_fund_request(p_wo_id uuid) TO service_role;


--
--
-- Name: TABLE activity_worksheet_cells; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_worksheet_cells TO anon;
GRANT ALL ON TABLE public.activity_worksheet_cells TO authenticated;
GRANT ALL ON TABLE public.activity_worksheet_cells TO service_role;


--
--
-- Name: TABLE activity_worksheets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.activity_worksheets TO anon;
GRANT ALL ON TABLE public.activity_worksheets TO authenticated;
GRANT ALL ON TABLE public.activity_worksheets TO service_role;


--
--
-- Name: TABLE auth_login_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.auth_login_attempts TO service_role;


--
--
-- Name: TABLE authorization_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.authorization_permissions TO anon;
GRANT ALL ON TABLE public.authorization_permissions TO authenticated;
GRANT ALL ON TABLE public.authorization_permissions TO service_role;


--
--
-- Name: TABLE authorization_role_permissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.authorization_role_permissions TO anon;
GRANT ALL ON TABLE public.authorization_role_permissions TO authenticated;
GRANT ALL ON TABLE public.authorization_role_permissions TO service_role;


--
--
-- Name: TABLE authorization_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.authorization_roles TO anon;
GRANT ALL ON TABLE public.authorization_roles TO authenticated;
GRANT ALL ON TABLE public.authorization_roles TO service_role;


--
--
-- Name: TABLE clients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clients TO anon;
GRANT ALL ON TABLE public.clients TO authenticated;
GRANT ALL ON TABLE public.clients TO service_role;


--
--
-- Name: TABLE clients_directory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clients_directory TO anon;
GRANT ALL ON TABLE public.clients_directory TO authenticated;
GRANT ALL ON TABLE public.clients_directory TO service_role;


--
--
-- Name: TABLE engagement_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engagement_assignments TO authenticated;
GRANT ALL ON TABLE public.engagement_assignments TO service_role;


--
--
-- Name: TABLE work_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.work_orders TO anon;
GRANT ALL ON TABLE public.work_orders TO authenticated;
GRANT ALL ON TABLE public.work_orders TO service_role;


--
--
-- Name: TABLE engagement_wo_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.engagement_wo_state TO anon;
GRANT ALL ON TABLE public.engagement_wo_state TO authenticated;
GRANT ALL ON TABLE public.engagement_wo_state TO service_role;


--
--
-- Name: TABLE expense_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.expense_types TO anon;
GRANT ALL ON TABLE public.expense_types TO authenticated;
GRANT ALL ON TABLE public.expense_types TO service_role;


--
--
-- Name: TABLE fund_request_expenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fund_request_expenses TO anon;
GRANT ALL ON TABLE public.fund_request_expenses TO authenticated;
GRANT ALL ON TABLE public.fund_request_expenses TO service_role;


--
--
-- Name: SEQUENCE fund_request_number_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.fund_request_number_seq TO anon;
GRANT ALL ON SEQUENCE public.fund_request_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.fund_request_number_seq TO service_role;


--
--
-- Name: TABLE staff; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff TO anon;
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.staff TO authenticated;
GRANT ALL ON TABLE public.staff TO service_role;

-- Corrección deliberada de consolidación (ver nota más abajo, hunk de verificación Fase 2.6):
-- el bootstrap de plataforma concede SELECT de tabla a `authenticated` por defecto al crear la
-- tabla; el GRANT explícito de arriba (verbatim del historial) nunca incluyó SELECT porque el
-- diseño es acceso por columna (grants de abajo). Debe ir ANTES de esos grants por columna:
-- REVOKE a nivel de tabla también revoca cualquier SELECT(columna) ya otorgado al mismo rol.
REVOKE SELECT ON TABLE public.staff FROM authenticated;


--
--
-- Name: COLUMN staff.staff_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(staff_id) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.auth_user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(auth_user_id) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.first_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(first_name) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.last_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(last_name) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.email; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(email) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.category_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(category_id) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.is_active; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_active) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.city; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(city) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.short_name; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(short_name) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.initials; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(initials) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.deleted_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(deleted_at) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.hire_date; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(hire_date) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.weekly_capacity_hours; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(weekly_capacity_hours) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.termination_date; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(termination_date) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.is_blocked; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_blocked) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.is_schedulable; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(is_schedulable) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.society_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(society_id) ON TABLE public.staff TO authenticated;


--
--
-- Name: COLUMN staff.practica_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(practica_id) ON TABLE public.staff TO authenticated;


--
--
-- Name: TABLE fund_request_selectable_work_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fund_request_selectable_work_orders TO anon;
GRANT ALL ON TABLE public.fund_request_selectable_work_orders TO authenticated;
GRANT ALL ON TABLE public.fund_request_selectable_work_orders TO service_role;


--
--
-- Name: TABLE fund_request_work_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fund_request_work_orders TO anon;
GRANT ALL ON TABLE public.fund_request_work_orders TO authenticated;
GRANT ALL ON TABLE public.fund_request_work_orders TO service_role;


--
--
-- Name: TABLE fund_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fund_requests TO anon;
GRANT ALL ON TABLE public.fund_requests TO authenticated;
GRANT ALL ON TABLE public.fund_requests TO service_role;


--
--
-- Name: TABLE global_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.global_settings TO anon;
GRANT ALL ON TABLE public.global_settings TO authenticated;
GRANT ALL ON TABLE public.global_settings TO service_role;


--
--
-- Name: TABLE holidays; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.holidays TO anon;
GRANT ALL ON TABLE public.holidays TO authenticated;
GRANT ALL ON TABLE public.holidays TO service_role;


--
--
-- Name: TABLE industries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.industries TO anon;
GRANT ALL ON TABLE public.industries TO authenticated;
GRANT ALL ON TABLE public.industries TO service_role;


--
--
-- Name: TABLE migration_run_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.migration_run_log TO anon;
GRANT ALL ON TABLE public.migration_run_log TO authenticated;
GRANT ALL ON TABLE public.migration_run_log TO service_role;


--
--
-- Name: TABLE parametro; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.parametro TO anon;
GRANT ALL ON TABLE public.parametro TO authenticated;
GRANT ALL ON TABLE public.parametro TO service_role;


--
--
-- Name: TABLE practicas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.practicas TO anon;
GRANT ALL ON TABLE public.practicas TO authenticated;
GRANT ALL ON TABLE public.practicas TO service_role;


--
--
-- Name: TABLE skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.skills TO anon;
GRANT ALL ON TABLE public.skills TO authenticated;
GRANT ALL ON TABLE public.skills TO service_role;


--
--
-- Name: TABLE society; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.society TO anon;
GRANT ALL ON TABLE public.society TO authenticated;
GRANT ALL ON TABLE public.society TO service_role;


--
--
-- Name: TABLE staff_alert_seen; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff_alert_seen TO anon;
GRANT ALL ON TABLE public.staff_alert_seen TO authenticated;
GRANT ALL ON TABLE public.staff_alert_seen TO service_role;


--
--
-- Name: TABLE staff_directory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff_directory TO anon;
GRANT ALL ON TABLE public.staff_directory TO authenticated;
GRANT ALL ON TABLE public.staff_directory TO service_role;


--
--
-- Name: TABLE staff_skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff_skills TO anon;
GRANT ALL ON TABLE public.staff_skills TO authenticated;
GRANT ALL ON TABLE public.staff_skills TO service_role;


--
--
-- Name: TABLE servicios; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.servicios TO anon;
GRANT ALL ON TABLE public.servicios TO authenticated;
GRANT ALL ON TABLE public.servicios TO service_role;


--
--
-- Name: TABLE time_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.time_entries TO anon;
GRANT ALL ON TABLE public.time_entries TO authenticated;
GRANT ALL ON TABLE public.time_entries TO service_role;


--
--
-- Name: TABLE timer_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timer_entries TO anon;
GRANT ALL ON TABLE public.timer_entries TO authenticated;
GRANT ALL ON TABLE public.timer_entries TO service_role;


--
--
-- Name: TABLE timesheet_line_approvals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timesheet_line_approvals TO anon;
GRANT ALL ON TABLE public.timesheet_line_approvals TO authenticated;
GRANT ALL ON TABLE public.timesheet_line_approvals TO service_role;


--
--
-- Name: TABLE timesheet_periods; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.timesheet_periods TO anon;
GRANT ALL ON TABLE public.timesheet_periods TO authenticated;
GRANT ALL ON TABLE public.timesheet_periods TO service_role;


--
--
-- Name: TABLE user_lifecycle_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.user_lifecycle_audit_log TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.user_lifecycle_audit_log TO authenticated;
GRANT ALL ON TABLE public.user_lifecycle_audit_log TO service_role;


--
--
-- Name: TABLE user_roles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles TO anon;
GRANT ALL ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;


--
--
-- Name: TABLE user_roles_backup_0220_56_20260224; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_roles_backup_0220_56_20260224 TO anon;
GRANT ALL ON TABLE public.user_roles_backup_0220_56_20260224 TO authenticated;
GRANT ALL ON TABLE public.user_roles_backup_0220_56_20260224 TO service_role;


--
--
-- Name: TABLE vw_actual_hours_by_category_activity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_actual_hours_by_category_activity TO authenticated;
GRANT ALL ON TABLE public.vw_actual_hours_by_category_activity TO service_role;


--
--
-- Name: TABLE vw_wo_budget_hours_by_category_activity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_wo_budget_hours_by_category_activity TO authenticated;
GRANT ALL ON TABLE public.vw_wo_budget_hours_by_category_activity TO service_role;


--
--
-- Name: TABLE vw_budget_vs_actual_hours_by_category_activity; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_budget_vs_actual_hours_by_category_activity TO authenticated;
GRANT ALL ON TABLE public.vw_budget_vs_actual_hours_by_category_activity TO service_role;


--
--
-- Name: TABLE vw_staffing_alerts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_staffing_alerts TO service_role;
GRANT SELECT ON TABLE public.vw_staffing_alerts TO authenticated;


--
--
-- Name: TABLE vw_wo_budget_hours_by_category; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vw_wo_budget_hours_by_category TO authenticated;
GRANT ALL ON TABLE public.vw_wo_budget_hours_by_category TO service_role;


--
--
-- Name: TABLE wo_budget_lines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wo_budget_lines TO anon;
GRANT ALL ON TABLE public.wo_budget_lines TO authenticated;
GRANT ALL ON TABLE public.wo_budget_lines TO service_role;


--
--
-- Name: TABLE wo_expense_budget; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wo_expense_budget TO anon;
GRANT ALL ON TABLE public.wo_expense_budget TO authenticated;
GRANT ALL ON TABLE public.wo_expense_budget TO service_role;


--
--
-- Name: TABLE wo_payment_installments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wo_payment_installments TO anon;
GRANT ALL ON TABLE public.wo_payment_installments TO authenticated;
GRANT ALL ON TABLE public.wo_payment_installments TO service_role;


--
--
-- Name: TABLE wo_payment_plan; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wo_payment_plan TO anon;
GRANT ALL ON TABLE public.wo_payment_plan TO authenticated;
GRANT ALL ON TABLE public.wo_payment_plan TO service_role;


--
--
-- Name: TABLE wo_staffing_requirement_skills; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wo_staffing_requirement_skills TO authenticated;
GRANT ALL ON TABLE public.wo_staffing_requirement_skills TO service_role;


--
--
-- Name: TABLE wo_staffing_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wo_staffing_requirements TO authenticated;
GRANT ALL ON TABLE public.wo_staffing_requirements TO service_role;


--
--
-- Name: TABLE work_order_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.work_order_summary TO anon;
GRANT ALL ON TABLE public.work_order_summary TO authenticated;
GRANT ALL ON TABLE public.work_order_summary TO service_role;

--
-- Corrección deliberada de consolidación (hallazgo de verificación, Fase 2.6): el bootstrap de
-- plataforma de Supabase (roles.sql, corre antes de cualquier migración) fija
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated,
-- service_role, postgres — toda tabla/vista nueva hereda ALL para anon/authenticated al
-- crearse. El historial original de 184 migraciones revocaba esto explícitamente tabla por
-- tabla según se iban hardenizando. pg_dump no puede reproducir ese REVOKE histórico como texto
-- reejecutable cuando todas las tablas se crean en una sola sesión nueva (su lógica de
-- init-privileges asume que el default en el momento de creación ya era el angosto, cosa que en
-- un `CREATE TABLE` de una sola vez no es cierto). Fingerprint de referencia:
-- baseline_184_catalog_grants.txt no tiene ninguna de estas filas. El caso de `staff` (hardening
-- de columnas PII, 20260730080000/20260806000000) se corrigió más arriba, junto al GRANT de
-- tabla que reemplaza — el orden importa: un REVOKE a nivel de tabla también revoca cualquier
-- SELECT(columna) ya otorgado al mismo rol, así que debía ir ANTES de los grants por columna.
--

REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.auth_login_attempts FROM anon;
REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.auth_login_attempts FROM authenticated;
REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.engagement_assignments FROM anon;
REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vw_actual_hours_by_category_activity FROM anon;
REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vw_budget_vs_actual_hours_by_category_activity FROM anon;
REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vw_staffing_alerts FROM anon;
REVOKE DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vw_staffing_alerts FROM authenticated;
REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vw_wo_budget_hours_by_category FROM anon;
REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.vw_wo_budget_hours_by_category_activity FROM anon;
REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wo_staffing_requirement_skills FROM anon;
REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wo_staffing_requirements FROM anon;
REVOKE DELETE, INSERT, UPDATE ON TABLE public.user_lifecycle_audit_log FROM anon;
REVOKE DELETE, INSERT, UPDATE ON TABLE public.user_lifecycle_audit_log FROM authenticated;

-- Mismo mecanismo, para funciones: el default de plataforma también concede EXECUTE a
-- anon/authenticated/service_role en toda función nueva; el `REVOKE ... FROM PUBLIC` que
-- escriben las funciones de abajo (verbatim del historial) solo revoca lo heredado por
-- membresía PUBLIC — nunca un GRANT directo a un rol nombrado como el que fija este default.
REVOKE EXECUTE ON FUNCTION public.admin_unblock_account(p_staff_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_read_engagement_assignments(p_engagement_id uuid) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.check_login_allowed(p_email text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.engagement_accepts_assignment_writes(p_engagement_id uuid) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.engagement_in_my_fund_request(p_engagement_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.finalize_all_stale_timers() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_engagement_team_candidates() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.get_staff_full() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_assignment_on_engagement(p_engagement_id uuid) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.has_firmwide_assignment_visibility() FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.is_engagement_responsible(p_engagement_id uuid) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(p_email text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_login_attempts(p_email text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_wo_engagement_id(p_wo_id uuid) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_wo_req_skill_engagement_id(p_requirement_id uuid) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.save_engagement_assignments(p_engagement_id uuid, p_upserts jsonb, p_deleted_ids uuid[]) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.save_wo_staffing(p_wo_id uuid, p_requirements jsonb) FROM anon, service_role;
REVOKE EXECUTE ON FUNCTION public.staff_id_number_conflict(p_id_number text, p_exclude_staff_id uuid) FROM anon;
