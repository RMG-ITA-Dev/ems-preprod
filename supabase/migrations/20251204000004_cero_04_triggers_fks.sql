SET check_function_bodies = false;
SET row_security = off;

-- Migración cero — set consolidado (bugs/migracion_cero/plan_v2.md Fase 2).
-- 04: triggers + foreign keys (requieren que todas las tablas ya existan).
-- Fuente de autoría: bugs/migracion_cero/autoria/dump_full_baseline.sql (pg_dump --schema-only,
-- baseline de 184 migraciones + preseed). Extraído por bloque -- Name:/Type:/Schema: de pg_dump,
-- preservando el orden relativo original (orden topológico real de pg_dump, no reordenado a mano).
-- Ver docs/migraciones/DIFF-INTENCIONAL-consolidacion.md para los cambios deliberados vs baseline.

--
-- Name: time_entries enforce_holiday_blocking; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enforce_holiday_blocking BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_holiday_blocking();


--
--
-- Name: engagements engagements_fiscal_year_invariant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER engagements_fiscal_year_invariant BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.enforce_engagement_fiscal_year_invariant();


--
--
-- Name: fund_requests tr_fr_guard_accounting_cols; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_guard_accounting_cols BEFORE UPDATE ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.fr_guard_accounting_cols();


--
--
-- Name: fund_request_work_orders tr_fr_wo_guard_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_wo_guard_approval BEFORE UPDATE ON public.fund_request_work_orders FOR EACH ROW EXECUTE FUNCTION public.fr_wo_guard_approval_cols();


--
--
-- Name: fund_request_work_orders tr_fr_wo_rollup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_wo_rollup AFTER UPDATE OF approval_status ON public.fund_request_work_orders FOR EACH ROW EXECUTE FUNCTION public.fr_wo_rollup_status();


--
--
-- Name: fund_request_work_orders tr_fr_wo_set_manager; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_wo_set_manager BEFORE INSERT OR UPDATE OF wo_id ON public.fund_request_work_orders FOR EACH ROW EXECUTE FUNCTION public.fr_wo_set_manager();


--
--
-- Name: fund_request_work_orders tr_fr_wo_validate_approved; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fr_wo_validate_approved BEFORE INSERT OR UPDATE OF wo_id ON public.fund_request_work_orders FOR EACH ROW EXECUTE FUNCTION public.fr_wo_validate_approved();


--
--
-- Name: fund_request_expenses tr_fre_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fre_touch BEFORE UPDATE ON public.fund_request_expenses FOR EACH ROW EXECUTE FUNCTION public.fund_request_expenses_touch_updated_at();


--
--
-- Name: fund_request_expenses tr_fre_validate_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fre_validate_transition BEFORE UPDATE ON public.fund_request_expenses FOR EACH ROW EXECUTE FUNCTION public.fre_validate_transition();


--
--
-- Name: fund_request_expenses tr_fre_validate_wo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fre_validate_wo BEFORE INSERT OR UPDATE OF wo_id, fund_request_id, currency ON public.fund_request_expenses FOR EACH ROW EXECUTE FUNCTION public.fre_validate_wo_in_request();


--
--
-- Name: fund_requests tr_fund_requests_enforce_bob; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fund_requests_enforce_bob BEFORE INSERT OR UPDATE ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.fund_requests_enforce_bob();


--
--
-- Name: fund_requests tr_fund_requests_set_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fund_requests_set_number BEFORE INSERT ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.set_fund_request_number();


--
--
-- Name: fund_requests tr_fund_requests_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_fund_requests_touch BEFORE UPDATE ON public.fund_requests FOR EACH ROW EXECUTE FUNCTION public.fund_requests_touch_updated_at();


--
--
-- Name: work_orders tr_wo_guard_risk_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_wo_guard_risk_approval BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.wo_guard_risk_approval();


--
--
-- Name: engagements trg_authorize_engagement_state_override; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_authorize_engagement_state_override BEFORE INSERT OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.authorize_engagement_state_override();


--
--
-- Name: authorization_permissions trg_authz_perms_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_authz_perms_updated_at BEFORE UPDATE ON public.authorization_permissions FOR EACH ROW EXECUTE FUNCTION public.set_authz_updated_at();


--
--
-- Name: authorization_roles trg_authz_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_authz_roles_updated_at BEFORE UPDATE ON public.authorization_roles FOR EACH ROW EXECUTE FUNCTION public.set_authz_updated_at();


--
--
-- Name: practicas trg_cascade_abbreviation_rename; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cascade_abbreviation_rename AFTER UPDATE OF abbreviation ON public.practicas FOR EACH ROW EXECUTE FUNCTION public.cascade_practice_abbreviation_rename();


--
--
-- Name: time_entries trg_check_engagement_dates; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_engagement_dates BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.check_time_entry_engagement_dates();


--
--
-- Name: time_entries trg_check_wo_approved; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_wo_approved BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.check_wo_approved();


--
--
-- Name: clients trg_clients_created_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_clients_created_by BEFORE INSERT OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_client_created_by();


--
--
-- Name: time_entries trg_enforce_activity_default; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_activity_default BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_default();


--
--
-- Name: engagement_assignments trg_enforce_assignment_practice_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_assignment_practice_scope BEFORE INSERT OR UPDATE ON public.engagement_assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_practice_scope();


--
--
-- Name: time_entries trg_enforce_termination_date; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_termination_date BEFORE INSERT OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.enforce_termination_date();


--
--
-- Name: wo_staffing_requirements trg_enforce_wo_staffing_practice_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_wo_staffing_practice_scope BEFORE INSERT OR UPDATE ON public.wo_staffing_requirements FOR EACH ROW EXECUTE FUNCTION public.enforce_wo_staffing_practice_scope();


--
--
-- Name: activity_worksheet_cells trg_enforce_worksheet_cell_practice_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_worksheet_cell_practice_scope BEFORE INSERT OR UPDATE ON public.activity_worksheet_cells FOR EACH ROW EXECUTE FUNCTION public.enforce_worksheet_cell_practice_scope();


--
--
-- Name: engagements trg_engagements_created_by; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_engagements_created_by BEFORE INSERT OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.set_engagement_created_by();


--
--
-- Name: engagements trg_engagements_creator_team; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_engagements_creator_team BEFORE INSERT ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.enforce_engagement_creator_team();


--
--
-- Name: global_settings trg_guard_auth_lockout_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_auth_lockout_settings BEFORE INSERT OR UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION public.guard_auth_lockout_settings();


--
--
-- Name: staff trg_link_staff_to_auth_user; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_link_staff_to_auth_user BEFORE INSERT OR UPDATE OF email ON public.staff FOR EACH ROW EXECUTE FUNCTION public.link_staff_to_auth_user();


--
--
-- Name: timer_entries trg_prevent_imported_timer_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_imported_timer_delete BEFORE DELETE ON public.timer_entries FOR EACH ROW EXECUTE FUNCTION public.prevent_imported_timer_delete();


--
--
-- Name: staff trg_prevent_self_blocked_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_self_blocked_change BEFORE UPDATE OF is_blocked ON public.staff FOR EACH ROW EXECUTE FUNCTION public.prevent_self_blocked_change();


--
--
-- Name: staff trg_prevent_staff_reactivation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_staff_reactivation BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_reactivation();


--
--
-- Name: time_entries trg_protect_approved_time_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_approved_time_entries BEFORE INSERT OR DELETE OR UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.protect_approved_time_entries();


--
--
-- Name: engagements trg_recompute_engagement_finalization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recompute_engagement_finalization BEFORE INSERT OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.recompute_engagement_finalization();


--
--
-- Name: timer_entries trg_reset_timer_import_on_unlink; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reset_timer_import_on_unlink BEFORE UPDATE ON public.timer_entries FOR EACH ROW EXECUTE FUNCTION public.reset_timer_import_on_unlink();


--
--
-- Name: timesheet_periods trg_validate_submission_has_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_submission_has_entries BEFORE UPDATE ON public.timesheet_periods FOR EACH ROW WHEN (((new.submitted_at IS NOT NULL) AND (old.submitted_at IS NULL))) EXECUTE FUNCTION public.validate_submission_has_entries();


--
--
-- Name: timer_entries trg_validate_timer_duration; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_timer_duration BEFORE INSERT OR UPDATE ON public.timer_entries FOR EACH ROW EXECUTE FUNCTION public.validate_timer_entry_duration();


--
--
-- Name: activity_worksheet_cells update_activity_worksheet_cells_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_activity_worksheet_cells_updated_at BEFORE UPDATE ON public.activity_worksheet_cells FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: activity_worksheets update_activity_worksheets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_activity_worksheets_updated_at BEFORE UPDATE ON public.activity_worksheets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: categories update_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: clients update_clients_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: engagement_assignments update_engagement_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_engagement_assignments_updated_at BEFORE UPDATE ON public.engagement_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: engagements update_engagements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_engagements_updated_at BEFORE UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: global_settings update_global_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_global_settings_updated_at BEFORE UPDATE ON public.global_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: holidays update_holidays_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_holidays_updated_at BEFORE UPDATE ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: industries update_industries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_industries_updated_at BEFORE UPDATE ON public.industries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: skills update_skills_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_skills_updated_at BEFORE UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: staff_skills update_staff_skills_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_staff_skills_updated_at BEFORE UPDATE ON public.staff_skills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: staff update_staff_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: time_entries update_time_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_time_entries_updated_at BEFORE UPDATE ON public.time_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: timesheet_line_approvals update_timesheet_line_approvals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timesheet_line_approvals_updated_at BEFORE UPDATE ON public.timesheet_line_approvals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: timesheet_periods update_timesheet_periods_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_timesheet_periods_updated_at BEFORE UPDATE ON public.timesheet_periods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: wo_payment_installments update_wo_payment_installments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_wo_payment_installments_updated_at BEFORE UPDATE ON public.wo_payment_installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: wo_payment_plan update_wo_payment_plan_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_wo_payment_plan_updated_at BEFORE UPDATE ON public.wo_payment_plan FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: wo_staffing_requirements update_wo_staffing_requirements_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_wo_staffing_requirements_updated_at BEFORE UPDATE ON public.wo_staffing_requirements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: work_orders update_work_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_work_orders_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
--
-- Name: activity_codes activity_codes_default_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_default_category_id_fkey FOREIGN KEY (default_category_id) REFERENCES public.categories(category_id);


--
--
-- Name: activity_codes activity_codes_practica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_practica_id_fkey FOREIGN KEY (practica_id) REFERENCES public.practicas(practica_id) ON DELETE RESTRICT;


--
--
-- Name: activity_worksheet_cells activity_worksheet_cells_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity_codes(activity_id);


--
--
-- Name: activity_worksheet_cells activity_worksheet_cells_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id);


--
--
-- Name: activity_worksheet_cells activity_worksheet_cells_worksheet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_worksheet_id_fkey FOREIGN KEY (worksheet_id) REFERENCES public.activity_worksheets(id) ON DELETE CASCADE;


--
--
-- Name: activity_worksheets activity_worksheets_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: activity_worksheets activity_worksheets_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id) ON DELETE CASCADE;


--
--
-- Name: activity_worksheets activity_worksheets_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE SET NULL;


--
--
-- Name: authorization_role_permissions authorization_role_permissions_permission_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_role_permissions
    ADD CONSTRAINT authorization_role_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.authorization_permissions(permission_key) ON DELETE CASCADE;


--
--
-- Name: authorization_role_permissions authorization_role_permissions_role_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_role_permissions
    ADD CONSTRAINT authorization_role_permissions_role_key_fkey FOREIGN KEY (role_key) REFERENCES public.authorization_roles(role_key) ON DELETE CASCADE;


--
--
-- Name: categories categories_practica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_practica_id_fkey FOREIGN KEY (practica_id) REFERENCES public.practicas(practica_id) ON DELETE RESTRICT;


--
--
-- Name: clients clients_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: clients clients_industry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_industry_id_fkey FOREIGN KEY (industry_id) REFERENCES public.industries(industry_id);


--
--
-- Name: engagement_assignments engagement_assignments_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_assignments
    ADD CONSTRAINT engagement_assignments_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE RESTRICT;


--
--
-- Name: engagement_assignments engagement_assignments_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_assignments
    ADD CONSTRAINT engagement_assignments_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id) ON DELETE CASCADE;


--
--
-- Name: engagement_assignments engagement_assignments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_assignments
    ADD CONSTRAINT engagement_assignments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: engagements engagements_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(client_id) ON DELETE CASCADE;


--
--
-- Name: engagements engagements_created_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_created_by_staff_id_fkey FOREIGN KEY (created_by_staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: engagements engagements_encargado_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_encargado_id_fkey FOREIGN KEY (encargado_id) REFERENCES public.staff(staff_id);


--
--
-- Name: engagements engagements_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.staff(staff_id);


--
--
-- Name: engagements engagements_partner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.staff(staff_id);


--
--
-- Name: engagements engagements_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON DELETE RESTRICT;


--
--
-- Name: engagements engagements_specialist_it_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_specialist_it_id_fkey FOREIGN KEY (specialist_it_id) REFERENCES public.staff(staff_id);


--
--
-- Name: engagements engagements_specialist_tax_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_specialist_tax_id_fkey FOREIGN KEY (specialist_tax_id) REFERENCES public.staff(staff_id);


--
--
-- Name: engagements engagements_sqr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_sqr_id_fkey FOREIGN KEY (sqr_id) REFERENCES public.staff(staff_id);


--
--
-- Name: engagements engagements_taxonomy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_taxonomy_id_fkey FOREIGN KEY (taxonomy_id) REFERENCES public.servicios(taxonomy_id);


--
--
-- Name: fund_request_expenses fund_request_expenses_expense_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES public.expense_types(expense_type_id);


--
--
-- Name: fund_request_expenses fund_request_expenses_fund_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_fund_request_id_fkey FOREIGN KEY (fund_request_id) REFERENCES public.fund_requests(fund_request_id) ON DELETE CASCADE;


--
--
-- Name: fund_request_expenses fund_request_expenses_reviewed_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_reviewed_by_staff_id_fkey FOREIGN KEY (reviewed_by_staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: fund_request_expenses fund_request_expenses_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id);


--
--
-- Name: fund_request_work_orders fund_request_work_orders_fund_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_fund_request_id_fkey FOREIGN KEY (fund_request_id) REFERENCES public.fund_requests(fund_request_id) ON DELETE CASCADE;


--
--
-- Name: fund_request_work_orders fund_request_work_orders_manager_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_manager_staff_id_fkey FOREIGN KEY (manager_staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: fund_request_work_orders fund_request_work_orders_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id);


--
--
-- Name: fund_requests fund_requests_approver_manager_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_approver_manager_staff_id_fkey FOREIGN KEY (approver_manager_staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: fund_requests fund_requests_disbursed_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_disbursed_by_staff_id_fkey FOREIGN KEY (disbursed_by_staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: fund_requests fund_requests_requester_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_requester_staff_id_fkey FOREIGN KEY (requester_staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: fund_requests fund_requests_settled_by_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_settled_by_staff_id_fkey FOREIGN KEY (settled_by_staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: holidays holidays_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.staff(staff_id);


--
--
-- Name: staff_alert_seen staff_alert_seen_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_alert_seen
    ADD CONSTRAINT staff_alert_seen_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id) ON DELETE CASCADE;


--
--
-- Name: staff staff_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
--
-- Name: staff staff_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id);


--
--
-- Name: staff staff_practica_category_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_practica_category_fk FOREIGN KEY (practica_id, category_id) REFERENCES public.categories(practica_id, category_id);


--
--
-- Name: staff staff_practica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_practica_id_fkey FOREIGN KEY (practica_id) REFERENCES public.practicas(practica_id) ON DELETE RESTRICT;


--
--
-- Name: staff_skills staff_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_skills
    ADD CONSTRAINT staff_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id) ON DELETE RESTRICT;


--
--
-- Name: staff_skills staff_skills_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_skills
    ADD CONSTRAINT staff_skills_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id) ON DELETE CASCADE;


--
--
-- Name: staff staff_society_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_society_id_fkey FOREIGN KEY (society_id) REFERENCES public.society(society_id) ON DELETE RESTRICT;


--
--
-- Name: servicios servicios_practica_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_practica_id_fkey FOREIGN KEY (practica_id) REFERENCES public.practicas(practica_id) ON DELETE SET NULL;


--
--
-- Name: time_entries time_entries_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity_codes(activity_id);


--
--
-- Name: time_entries time_entries_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id);


--
--
-- Name: time_entries time_entries_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.timesheet_periods(period_id);


--
--
-- Name: time_entries time_entries_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: timer_entries timer_entries_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity_codes(activity_id);


--
--
-- Name: timer_entries timer_entries_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id);


--
--
-- Name: timer_entries timer_entries_imported_to_time_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_imported_to_time_id_fkey FOREIGN KEY (imported_to_time_id) REFERENCES public.time_entries(time_id) ON DELETE SET NULL;


--
--
-- Name: timer_entries timer_entries_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id);


--
--
-- Name: timesheet_line_approvals timesheet_line_approvals_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activity_codes(activity_id);


--
--
-- Name: timesheet_line_approvals timesheet_line_approvals_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.staff(staff_id);


--
--
-- Name: timesheet_line_approvals timesheet_line_approvals_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id);


--
--
-- Name: timesheet_line_approvals timesheet_line_approvals_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.timesheet_periods(period_id) ON DELETE CASCADE;


--
--
-- Name: timesheet_periods timesheet_periods_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_periods
    ADD CONSTRAINT timesheet_periods_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.staff(staff_id) ON DELETE CASCADE;


--
--
-- Name: user_roles user_roles_role_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_key_fkey FOREIGN KEY (role_key) REFERENCES public.authorization_roles(role_key);


--
--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
--
-- Name: wo_budget_lines wo_budget_lines_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_budget_lines
    ADD CONSTRAINT wo_budget_lines_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id);


--
--
-- Name: wo_budget_lines wo_budget_lines_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_budget_lines
    ADD CONSTRAINT wo_budget_lines_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
--
-- Name: wo_expense_budget wo_expense_budget_expense_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_expense_budget
    ADD CONSTRAINT wo_expense_budget_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES public.expense_types(expense_type_id);


--
--
-- Name: wo_expense_budget wo_expense_budget_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_expense_budget
    ADD CONSTRAINT wo_expense_budget_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
--
-- Name: wo_payment_installments wo_payment_installments_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_installments
    ADD CONSTRAINT wo_payment_installments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.wo_payment_plan(plan_id) ON DELETE CASCADE;


--
--
-- Name: wo_payment_installments wo_payment_installments_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_installments
    ADD CONSTRAINT wo_payment_installments_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
--
-- Name: wo_payment_plan wo_payment_plan_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_plan
    ADD CONSTRAINT wo_payment_plan_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
--
-- Name: wo_staffing_requirement_skills wo_staffing_requirement_skills_requirement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirement_skills
    ADD CONSTRAINT wo_staffing_requirement_skills_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES public.wo_staffing_requirements(id) ON DELETE CASCADE;


--
--
-- Name: wo_staffing_requirement_skills wo_staffing_requirement_skills_skill_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirement_skills
    ADD CONSTRAINT wo_staffing_requirement_skills_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES public.skills(skill_id) ON DELETE RESTRICT;


--
--
-- Name: wo_staffing_requirements wo_staffing_requirements_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirements
    ADD CONSTRAINT wo_staffing_requirements_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE RESTRICT;


--
--
-- Name: wo_staffing_requirements wo_staffing_requirements_wo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirements
    ADD CONSTRAINT wo_staffing_requirements_wo_id_fkey FOREIGN KEY (wo_id) REFERENCES public.work_orders(wo_id) ON DELETE CASCADE;


--
--
-- Name: work_orders work_orders_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.staff(staff_id);


--
--
-- Name: work_orders work_orders_emergency_partner_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_emergency_partner_by_fkey FOREIGN KEY (emergency_partner_by) REFERENCES public.staff(staff_id);


--
--
-- Name: work_orders work_orders_emergency_review_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_emergency_review_by_fkey FOREIGN KEY (emergency_review_by) REFERENCES public.staff(staff_id);


--
--
-- Name: work_orders work_orders_engagement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_engagement_id_fkey FOREIGN KEY (engagement_id) REFERENCES public.engagements(engagement_id) ON DELETE CASCADE;


--
--
-- Name: work_orders work_orders_risk_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_risk_approved_by_fkey FOREIGN KEY (risk_approved_by) REFERENCES public.staff(staff_id);


--
