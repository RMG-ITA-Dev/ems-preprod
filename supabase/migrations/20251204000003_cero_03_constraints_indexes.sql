SET check_function_bodies = false;
SET row_security = off;

-- Migración cero — set consolidado (bugs/migracion_cero/plan_v2.md Fase 2).
-- 03: constraints (PK/UNIQUE/CHECK) + índices + la regla _RETURN de work_order_summary (representación interna de pg_dump para esa vista).
-- Fuente de autoría: bugs/migracion_cero/autoria/dump_full_baseline.sql (pg_dump --schema-only,
-- baseline de 184 migraciones + preseed). Extraído por bloque -- Name:/Type:/Schema: de pg_dump,
-- preservando el orden relativo original (orden topológico real de pg_dump, no reordenado a mano).
-- Ver docs/migraciones/DIFF-INTENCIONAL-consolidacion.md para los cambios deliberados vs baseline.

--
-- Name: activity_codes activity_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_codes
    ADD CONSTRAINT activity_codes_pkey PRIMARY KEY (activity_id);


--
--
-- Name: activity_worksheet_cells activity_worksheet_cells_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_pkey PRIMARY KEY (id);


--
--
-- Name: activity_worksheet_cells activity_worksheet_cells_worksheet_id_category_id_activity__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheet_cells
    ADD CONSTRAINT activity_worksheet_cells_worksheet_id_category_id_activity__key UNIQUE (worksheet_id, category_id, activity_id);


--
--
-- Name: activity_worksheets activity_worksheets_engagement_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_engagement_id_version_key UNIQUE (engagement_id, version);


--
--
-- Name: activity_worksheets activity_worksheets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_worksheets
    ADD CONSTRAINT activity_worksheets_pkey PRIMARY KEY (id);


--
--
-- Name: auth_login_attempts auth_login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_login_attempts
    ADD CONSTRAINT auth_login_attempts_pkey PRIMARY KEY (email_normalized);


--
--
-- Name: authorization_permissions authorization_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_permissions
    ADD CONSTRAINT authorization_permissions_pkey PRIMARY KEY (permission_key);


--
--
-- Name: authorization_role_permissions authorization_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_role_permissions
    ADD CONSTRAINT authorization_role_permissions_pkey PRIMARY KEY (role_key, permission_key);


--
--
-- Name: authorization_roles authorization_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorization_roles
    ADD CONSTRAINT authorization_roles_pkey PRIMARY KEY (role_key);


--
--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (category_id);


--
--
-- Name: categories categories_practica_category_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_practica_category_unique UNIQUE (practica_id, category_id);


--
--
-- Name: categories categories_practica_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_practica_name_unique UNIQUE (practica_id, category_name);


--
--
-- Name: categories categories_practica_order_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_practica_order_unique UNIQUE (practica_id, display_order) DEFERRABLE INITIALLY DEFERRED;


--
--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (client_id);


--
--
-- Name: clients clients_unique_tax_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_unique_tax_id_key UNIQUE (unique_tax_id);


--
--
-- Name: engagement_assignments engagement_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagement_assignments
    ADD CONSTRAINT engagement_assignments_pkey PRIMARY KEY (assignment_id);


--
--
-- Name: engagements engagements_contract_file_path_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_contract_file_path_unique UNIQUE (contract_file_path);


--
--
-- Name: engagements engagements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engagements
    ADD CONSTRAINT engagements_pkey PRIMARY KEY (engagement_id);


--
--
-- Name: expense_types expense_types_expense_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_types
    ADD CONSTRAINT expense_types_expense_name_key UNIQUE (expense_name);


--
--
-- Name: expense_types expense_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_types
    ADD CONSTRAINT expense_types_pkey PRIMARY KEY (expense_type_id);


--
--
-- Name: fund_request_expenses fund_request_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_expenses
    ADD CONSTRAINT fund_request_expenses_pkey PRIMARY KEY (fre_id);


--
--
-- Name: fund_request_work_orders fund_request_work_orders_fund_request_id_wo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_fund_request_id_wo_id_key UNIQUE (fund_request_id, wo_id);


--
--
-- Name: fund_request_work_orders fund_request_work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_request_work_orders
    ADD CONSTRAINT fund_request_work_orders_pkey PRIMARY KEY (fr_wo_id);


--
--
-- Name: fund_requests fund_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_pkey PRIMARY KEY (fund_request_id);


--
--
-- Name: fund_requests fund_requests_request_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_requests
    ADD CONSTRAINT fund_requests_request_number_key UNIQUE (request_number);


--
--
-- Name: global_settings global_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.global_settings
    ADD CONSTRAINT global_settings_pkey PRIMARY KEY (setting_key);


--
--
-- Name: holidays holidays_holiday_date_oficina_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_holiday_date_oficina_key UNIQUE (holiday_date, oficina);


--
--
-- Name: holidays holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holidays
    ADD CONSTRAINT holidays_pkey PRIMARY KEY (holiday_id);


--
--
-- Name: industries industries_industry_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industries
    ADD CONSTRAINT industries_industry_name_key UNIQUE (industry_name);


--
--
-- Name: industries industries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industries
    ADD CONSTRAINT industries_pkey PRIMARY KEY (industry_id);


--
--
-- Name: migration_run_log migration_run_log_migration_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_run_log
    ADD CONSTRAINT migration_run_log_migration_key_key UNIQUE (migration_key);


--
--
-- Name: migration_run_log migration_run_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_run_log
    ADD CONSTRAINT migration_run_log_pkey PRIMARY KEY (id);


--
--
-- Name: parametro parametro_nombre_periodo_tipo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametro
    ADD CONSTRAINT parametro_nombre_periodo_tipo_key UNIQUE (nombre, periodo, tipo);


--
--
-- Name: parametro parametro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parametro
    ADD CONSTRAINT parametro_pkey PRIMARY KEY (id);


--
--
-- Name: practicas practicas_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practicas
    ADD CONSTRAINT practicas_code_key UNIQUE (code);


--
--
-- Name: practicas practicas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.practicas
    ADD CONSTRAINT practicas_pkey PRIMARY KEY (practica_id);


--
--
-- Name: skills skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skills
    ADD CONSTRAINT skills_pkey PRIMARY KEY (skill_id);


--
--
-- Name: society society_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society
    ADD CONSTRAINT society_name_key UNIQUE (name);


--
--
-- Name: society society_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.society
    ADD CONSTRAINT society_pkey PRIMARY KEY (society_id);


--
--
-- Name: staff_alert_seen staff_alert_seen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_alert_seen
    ADD CONSTRAINT staff_alert_seen_pkey PRIMARY KEY (id);


--
--
-- Name: staff_alert_seen staff_alert_seen_staff_id_entity_id_alert_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_alert_seen
    ADD CONSTRAINT staff_alert_seen_staff_id_entity_id_alert_type_key UNIQUE (staff_id, entity_id, alert_type);


--
--
-- Name: staff staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff
    ADD CONSTRAINT staff_pkey PRIMARY KEY (staff_id);


--
--
-- Name: staff_skills staff_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_skills
    ADD CONSTRAINT staff_skills_pkey PRIMARY KEY (staff_skill_id);


--
--
-- Name: staff_skills staff_skills_staff_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_skills
    ADD CONSTRAINT staff_skills_staff_id_skill_id_key UNIQUE (staff_id, skill_id);


--
--
-- Name: servicios servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_pkey PRIMARY KEY (taxonomy_id);


--
--
-- Name: time_entries time_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_entries
    ADD CONSTRAINT time_entries_pkey PRIMARY KEY (time_id);


--
--
-- Name: timer_entries timer_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timer_entries
    ADD CONSTRAINT timer_entries_pkey PRIMARY KEY (timer_id);


--
--
-- Name: timesheet_line_approvals timesheet_line_approvals_period_engagement_activity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_period_engagement_activity_key UNIQUE (period_id, engagement_id, activity_id);


--
--
-- Name: timesheet_line_approvals timesheet_line_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_line_approvals
    ADD CONSTRAINT timesheet_line_approvals_pkey PRIMARY KEY (approval_id);


--
--
-- Name: timesheet_periods timesheet_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_periods
    ADD CONSTRAINT timesheet_periods_pkey PRIMARY KEY (period_id);


--
--
-- Name: timesheet_periods timesheet_periods_staff_id_week_start_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.timesheet_periods
    ADD CONSTRAINT timesheet_periods_staff_id_week_start_date_key UNIQUE (staff_id, week_start_date);


--
--
-- Name: user_lifecycle_audit_log user_lifecycle_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lifecycle_audit_log
    ADD CONSTRAINT user_lifecycle_audit_log_pkey PRIMARY KEY (id);


--
--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
--
-- Name: user_roles user_roles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);


--
--
-- Name: wo_budget_lines wo_budget_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_budget_lines
    ADD CONSTRAINT wo_budget_lines_pkey PRIMARY KEY (wo_line_id);


--
--
-- Name: wo_expense_budget wo_expense_budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_expense_budget
    ADD CONSTRAINT wo_expense_budget_pkey PRIMARY KEY (wo_exp_id);


--
--
-- Name: wo_payment_installments wo_payment_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_installments
    ADD CONSTRAINT wo_payment_installments_pkey PRIMARY KEY (installment_id);


--
--
-- Name: wo_payment_installments wo_payment_installments_plan_id_installment_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_installments
    ADD CONSTRAINT wo_payment_installments_plan_id_installment_number_key UNIQUE (plan_id, installment_number);


--
--
-- Name: wo_payment_plan wo_payment_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_plan
    ADD CONSTRAINT wo_payment_plan_pkey PRIMARY KEY (plan_id);


--
--
-- Name: wo_payment_plan wo_payment_plan_wo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_payment_plan
    ADD CONSTRAINT wo_payment_plan_wo_id_key UNIQUE (wo_id);


--
--
-- Name: wo_staffing_requirement_skills wo_staffing_requirement_skills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirement_skills
    ADD CONSTRAINT wo_staffing_requirement_skills_pkey PRIMARY KEY (id);


--
--
-- Name: wo_staffing_requirement_skills wo_staffing_requirement_skills_requirement_id_skill_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirement_skills
    ADD CONSTRAINT wo_staffing_requirement_skills_requirement_id_skill_id_key UNIQUE (requirement_id, skill_id);


--
--
-- Name: wo_staffing_requirements wo_staffing_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirements
    ADD CONSTRAINT wo_staffing_requirements_pkey PRIMARY KEY (id);


--
--
-- Name: wo_staffing_requirements wo_staffing_requirements_wo_id_category_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wo_staffing_requirements
    ADD CONSTRAINT wo_staffing_requirements_wo_id_category_id_key UNIQUE (wo_id, category_id);


--
--
-- Name: work_orders work_orders_engagement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_engagement_id_key UNIQUE (engagement_id);


--
--
-- Name: work_orders work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_pkey PRIMARY KEY (wo_id);


--
--
-- Name: activity_codes_active_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activity_codes_active_code_unique ON public.activity_codes USING btree (activity_code) WHERE (is_active = true);


--
--
-- Name: clients_client_legal_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX clients_client_legal_name_unique ON public.clients USING btree (lower(TRIM(BOTH FROM client_legal_name)));


--
--
-- Name: idx_activity_worksheet_cells_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheet_cells_activity ON public.activity_worksheet_cells USING btree (activity_id);


--
--
-- Name: idx_activity_worksheet_cells_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheet_cells_category ON public.activity_worksheet_cells USING btree (category_id);


--
--
-- Name: idx_activity_worksheet_cells_worksheet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheet_cells_worksheet ON public.activity_worksheet_cells USING btree (worksheet_id);


--
--
-- Name: idx_activity_worksheets_engagement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheets_engagement ON public.activity_worksheets USING btree (engagement_id);


--
--
-- Name: idx_activity_worksheets_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activity_worksheets_wo ON public.activity_worksheets USING btree (wo_id);


--
--
-- Name: idx_authz_perms_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authz_perms_module ON public.authorization_permissions USING btree (module_key);


--
--
-- Name: idx_authz_rp_permission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authz_rp_permission ON public.authorization_role_permissions USING btree (permission_key);


--
--
-- Name: idx_clients_created_by_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clients_created_by_staff ON public.clients USING btree (created_by_staff_id) WHERE (created_by_staff_id IS NOT NULL);


--
--
-- Name: idx_eng_assign_category_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eng_assign_category_active ON public.engagement_assignments USING btree (category_id) WHERE (deleted_at IS NULL);


--
--
-- Name: idx_eng_assign_engagement_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eng_assign_engagement_active ON public.engagement_assignments USING btree (engagement_id) WHERE (deleted_at IS NULL);


--
--
-- Name: idx_eng_assign_staff_dates_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_eng_assign_staff_dates_active ON public.engagement_assignments USING btree (staff_id, start_date, end_date) WHERE (deleted_at IS NULL);


--
--
-- Name: idx_engagements_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_engagements_code_unique ON public.engagements USING btree (engagement_code) WHERE (engagement_code IS NOT NULL);


--
--
-- Name: idx_engagements_created_by_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagements_created_by_staff ON public.engagements USING btree (created_by_staff_id) WHERE (created_by_staff_id IS NOT NULL);


--
--
-- Name: idx_engagements_manager_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagements_manager_status ON public.engagements USING btree (manager_id, status);


--
--
-- Name: idx_engagements_partner_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_engagements_partner_status ON public.engagements USING btree (partner_id, status);


--
--
-- Name: idx_fr_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_created_at ON public.fund_requests USING btree (created_at DESC);


--
--
-- Name: idx_fr_manager_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_manager_status ON public.fund_requests USING btree (approver_manager_staff_id, status);


--
--
-- Name: idx_fr_requester_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_requester_status ON public.fund_requests USING btree (requester_staff_id, status);


--
--
-- Name: idx_fr_wo_manager; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_wo_manager ON public.fund_request_work_orders USING btree (manager_staff_id);


--
--
-- Name: idx_fr_wo_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_wo_request ON public.fund_request_work_orders USING btree (fund_request_id);


--
--
-- Name: idx_fr_wo_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fr_wo_wo ON public.fund_request_work_orders USING btree (wo_id);


--
--
-- Name: idx_fre_fund_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fre_fund_request ON public.fund_request_expenses USING btree (fund_request_id);


--
--
-- Name: idx_fre_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fre_status ON public.fund_request_expenses USING btree (status);


--
--
-- Name: idx_fre_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fre_wo ON public.fund_request_expenses USING btree (wo_id);


--
--
-- Name: idx_one_running_timer_per_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_running_timer_per_staff ON public.timer_entries USING btree (staff_id) WHERE (ended_at IS NULL);


--
--
-- Name: idx_skills_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_skills_name_unique ON public.skills USING btree (lower(TRIM(BOTH FROM name)));


--
--
-- Name: idx_staff_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_staff_email_unique ON public.staff USING btree (lower(TRIM(BOTH FROM email))) WHERE ((email IS NOT NULL) AND (deleted_at IS NULL));


--
--
-- Name: idx_staff_id_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_staff_id_number_unique ON public.staff USING btree (id_number) WHERE ((id_number IS NOT NULL) AND (TRIM(BOTH FROM id_number) <> ''::text) AND (deleted_at IS NULL));


--
--
-- Name: idx_staff_skills_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_skills_skill ON public.staff_skills USING btree (skill_id);


--
--
-- Name: idx_staff_skills_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_skills_staff ON public.staff_skills USING btree (staff_id);


--
--
-- Name: idx_servicios_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_servicios_code_unique ON public.servicios USING btree (lower(TRIM(BOTH FROM code)));


--
--
-- Name: idx_servicios_practica_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicios_practica_id ON public.servicios USING btree (practica_id);


--
--
-- Name: idx_time_entries_engagement_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_engagement_date ON public.time_entries USING btree (engagement_id, date_worked);


--
--
-- Name: idx_time_entries_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_period ON public.time_entries USING btree (period_id);


--
--
-- Name: idx_time_entries_period_engagement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_period_engagement ON public.time_entries USING btree (period_id, engagement_id);


--
--
-- Name: idx_time_entries_staff_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_time_entries_staff_date ON public.time_entries USING btree (staff_id, date_worked);


--
--
-- Name: idx_time_entries_unique_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_time_entries_unique_entry ON public.time_entries USING btree (staff_id, engagement_id, activity_id, date_worked, is_forecast);


--
--
-- Name: idx_timer_entries_is_imported; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timer_entries_is_imported ON public.timer_entries USING btree (is_imported);


--
--
-- Name: idx_timer_entries_one_running_per_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_timer_entries_one_running_per_staff ON public.timer_entries USING btree (staff_id) WHERE (ended_at IS NULL);


--
--
-- Name: idx_timer_entries_staff_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timer_entries_staff_id ON public.timer_entries USING btree (staff_id);


--
--
-- Name: idx_timer_entries_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timer_entries_started_at ON public.timer_entries USING btree (started_at);


--
--
-- Name: idx_timesheet_periods_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timesheet_periods_deadline ON public.timesheet_periods USING btree (deadline);


--
--
-- Name: idx_timesheet_periods_staff_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_timesheet_periods_staff_date ON public.timesheet_periods USING btree (staff_id, week_start_date);


--
--
-- Name: idx_tla_engagement_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tla_engagement_period ON public.timesheet_line_approvals USING btree (engagement_id, period_id);


--
--
-- Name: idx_tla_pending_engagement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tla_pending_engagement ON public.timesheet_line_approvals USING btree (engagement_id) WHERE ((status)::text = 'pending'::text);


--
--
-- Name: idx_user_roles_role_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role_key ON public.user_roles USING btree (role_key);


--
--
-- Name: idx_wo_payment_installments_wo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_payment_installments_wo_id ON public.wo_payment_installments USING btree (wo_id);


--
--
-- Name: idx_wo_req_skills_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_req_skills_req ON public.wo_staffing_requirement_skills USING btree (requirement_id);


--
--
-- Name: idx_wo_req_skills_skill; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_req_skills_skill ON public.wo_staffing_requirement_skills USING btree (skill_id);


--
--
-- Name: idx_wo_staffing_requirements_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_staffing_requirements_cat ON public.wo_staffing_requirements USING btree (category_id);


--
--
-- Name: idx_wo_staffing_requirements_wo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wo_staffing_requirements_wo ON public.wo_staffing_requirements USING btree (wo_id);


--
--
-- Name: practicas_abbreviation_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX practicas_abbreviation_unique ON public.practicas USING btree (abbreviation) WHERE (abbreviation IS NOT NULL);


--
--
-- Name: work_order_summary _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.work_order_summary WITH (security_invoker='true') AS
 SELECT wo.wo_id,
    wo.engagement_id,
    wo.currency,
    wo.season_mode,
    wo.tax_rate,
    wo.adjustment_amount,
    wo.notes,
    wo.created_at,
    wo.updated_at,
    wo.approval_status,
    wo.approved_by,
    wo.approved_at,
    COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric) AS total_standard_fee,
        CASE
            WHEN (COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric) > (0)::numeric) THEN ((COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric) + COALESCE(wo.adjustment_amount, (0)::numeric)) / COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric))
            ELSE (1)::numeric
        END AS realization_percent,
    ((COALESCE(sum((bl.budgeted_hours * bl.standard_rate)), (0)::numeric) + COALESCE(wo.adjustment_amount, (0)::numeric)) / ((1)::numeric - COALESCE(wo.tax_rate, 0.13))) AS fee_with_tax_gross_up
   FROM (public.work_orders wo
     LEFT JOIN public.wo_budget_lines bl ON ((wo.wo_id = bl.wo_id)))
  GROUP BY wo.wo_id;


--
