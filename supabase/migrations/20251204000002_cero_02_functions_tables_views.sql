SET check_function_bodies = false;
SET row_security = off;

-- Migración cero — set consolidado (bugs/migracion_cero/plan_v2.md Fase 2).
-- 02: funciones, tablas y vistas. pg_dump las interfoliza por dependencia real (una función puede referenciar una tabla creada 40 líneas antes o crear un tipo usado 200 líneas después) — separar 'funciones' de 'tablas' en archivos distintos habría roto ese orden topológico, así que viajan juntas en un solo archivo (ajuste de corte explícitamente permitido por el plan §2.1).
-- Fuente de autoría: bugs/migracion_cero/autoria/dump_full_baseline.sql (pg_dump --schema-only,
-- baseline de 184 migraciones + preseed). Extraído por bloque -- Name:/Type:/Schema: de pg_dump,
-- preservando el orden relativo original (orden topológico real de pg_dump, no reordenado a mano).
-- Ver docs/migraciones/DIFF-INTENCIONAL-consolidacion.md para los cambios deliberados vs baseline.

--
-- Name: admin_set_user_role(uuid, public.app_role, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_user_role(p_target_user_id uuid, p_new_role public.app_role, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_old_role app_role; v_admin_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(67890);
  IF NOT has_role(v_caller_id, 'admin') THEN
    RETURN jsonb_build_object('success',false,'code','NOT_ADMIN','message','Only admins can change roles');
  END IF;
  IF v_caller_id = p_target_user_id THEN
    RETURN jsonb_build_object('success',false,'code','SELF_CHANGE','message','Cannot change own role');
  END IF;
  SELECT role INTO v_old_role FROM user_roles WHERE user_id = p_target_user_id FOR UPDATE;
  IF v_old_role IS NULL THEN
    RETURN jsonb_build_object('success',false,'code','USER_NOT_FOUND','message','User role not found');
  END IF;
  IF v_old_role = p_new_role THEN
    RETURN jsonb_build_object('success',true,'code','ALREADY_SET','message','Role already set',
      'old_role',v_old_role::text,'new_role',p_new_role::text);
  END IF;
  IF v_old_role = 'admin' AND p_new_role != 'admin' THEN
    SELECT count(*) INTO v_admin_count FROM user_roles WHERE role = 'admin';
    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object('success',false,'code','LAST_ADMIN','message','Cannot remove the last admin');
    END IF;
  END IF;
  UPDATE user_roles SET role = p_new_role WHERE user_id = p_target_user_id;
  INSERT INTO user_lifecycle_audit_log (actor_user_id, target_user_id, action, old_role, new_role, reason)
  VALUES (v_caller_id, p_target_user_id, 'role_change', v_old_role, p_new_role, p_reason);
  RETURN jsonb_build_object('success',true,'code','UPDATED','message','Role updated',
    'old_role',v_old_role::text,'new_role',p_new_role::text);
END; $$;


--
--
-- Name: admin_set_user_role_key(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_caller_id      uuid := auth.uid();
  v_is_admin       boolean;
  v_old_role       app_role;
  v_old_role_key   text;
  v_new_legacy     app_role;
  v_admin_count    integer;
begin
  -- Serializa con admin_set_user_role (mismo lock) para que el guard de
  -- "último admin" no pueda ser sorteado por dos cambios concurrentes.
  perform pg_advisory_xact_lock(67890);

  -- Admin por role_key (autoridad actual) o por el enum legacy, para no
  -- quedar bloqueados si algún admin aún no tiene role_key.
  select exists (
    select 1 from user_roles
    where user_id = v_caller_id
      and (role_key = 'admin' or role = 'admin')
  ) into v_is_admin;

  if not v_is_admin then
    return jsonb_build_object('success', false, 'code', 'NOT_ADMIN',
      'message', 'Only admins can change roles');
  end if;

  if v_caller_id = p_target_user_id then
    return jsonb_build_object('success', false, 'code', 'SELF_CHANGE',
      'message', 'Cannot change own role');
  end if;

  -- El rol destino debe existir en el catálogo, estar activo y declarar su
  -- espejo legacy (si no, no sabríamos qué poner en user_roles.role).
  select legacy_app_role into v_new_legacy
  from authorization_roles
  where role_key = p_new_role_key and is_active;

  if not found then
    return jsonb_build_object('success', false, 'code', 'INVALID_ROLE',
      'message', format('Unknown or inactive role_key: %s', p_new_role_key));
  end if;

  if v_new_legacy is null then
    return jsonb_build_object('success', false, 'code', 'ROLE_NOT_MAPPED',
      'message', format('role_key %s has no legacy_app_role mapping', p_new_role_key));
  end if;

  select role, role_key into v_old_role, v_old_role_key
  from user_roles
  where user_id = p_target_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'code', 'USER_NOT_FOUND',
      'message', 'User role not found');
  end if;

  if v_old_role_key = p_new_role_key then
    return jsonb_build_object('success', true, 'code', 'ALREADY_SET',
      'message', 'Role already set',
      'old_role_key', v_old_role_key, 'new_role_key', p_new_role_key);
  end if;

  -- Guard de último admin, ahora sobre role_key (la autoridad del motor).
  if v_old_role_key = 'admin' and p_new_role_key <> 'admin' then
    select count(*) into v_admin_count from user_roles where role_key = 'admin';
    if v_admin_count <= 1 then
      return jsonb_build_object('success', false, 'code', 'LAST_ADMIN',
        'message', 'Cannot remove the last admin');
    end if;
  end if;

  update user_roles
  set role_key = p_new_role_key,
      role     = v_new_legacy
  where user_id = p_target_user_id;

  insert into user_lifecycle_audit_log
    (actor_user_id, target_user_id, action, old_role, new_role,
     old_role_key, new_role_key, reason)
  values
    (v_caller_id, p_target_user_id, 'role_key_change', v_old_role, v_new_legacy,
     v_old_role_key, p_new_role_key, p_reason);

  return jsonb_build_object('success', true, 'code', 'UPDATED',
    'message', 'Role updated',
    'old_role_key', v_old_role_key, 'new_role_key', p_new_role_key,
    'legacy_role', v_new_legacy::text);
end;
$$;


--
--
-- Name: FUNCTION admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.admin_set_user_role_key(p_target_user_id uuid, p_new_role_key text, p_reason text) IS 'Asigna un role_key del catálogo (23 roles) y espeja el enum legacy. Reemplaza a admin_set_user_role, que solo escribía el enum.';


--
--
-- Name: admin_unblock_account(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_unblock_account(p_staff_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email text;
BEGIN
  -- Resolve email from staff record.
  SELECT lower(trim(email)) INTO v_email
  FROM public.staff
  WHERE staff_id = p_staff_id
    AND deleted_at IS NULL;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'STAFF_NOT_FOUND');
  END IF;

  -- Clear the persistent blocked flag. Authorize the write past
  -- prevent_self_blocked_change() (this RPC is service_role-only, so auth.uid()
  -- is already NULL, but the flag keeps the trusted-writer contract uniform).
  PERFORM set_config('app.allow_blocked_change', 'on', true);
  UPDATE public.staff
  SET is_blocked = false
  WHERE staff_id = p_staff_id;

  -- Clear the lockout row so the user is not stuck behind locked_until.
  DELETE FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  RETURN jsonb_build_object('ok', true, 'email', v_email);
END;
$$;


--
--
-- Name: assign_user_role_atomic(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_user_role_atomic(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_role_count integer;
  v_assigned_role text;
  v_assigned_role_key text;
  v_existing_role text;
begin
  -- Lock para evitar carrera en el chequeo de primer-usuario.
  perform pg_advisory_xact_lock(12345);

  select role::text into v_existing_role
  from user_roles
  where user_id = p_user_id;

  if v_existing_role is not null then
    return jsonb_build_object(
      'role', v_existing_role,
      'isFirstUser', false,
      'message', 'Role already assigned'
    );
  end if;

  select count(*) into v_role_count from user_roles;

  -- Primer usuario = admin (bootstrap); el resto = staff/assistant.
  if v_role_count = 0 then
    v_assigned_role     := 'admin';
    v_assigned_role_key := 'admin';
  else
    v_assigned_role     := 'staff';
    v_assigned_role_key := 'assistant';   -- role_key equivalente (Fase 1 backfill)
  end if;

  -- Ahora setea AMBOS: role (enum legacy) y role_key (motor de autorización).
  insert into user_roles (user_id, role, role_key)
  values (p_user_id, v_assigned_role::app_role, v_assigned_role_key);

  return jsonb_build_object(
    'role', v_assigned_role,
    'role_key', v_assigned_role_key,
    'isFirstUser', v_role_count = 0
  );
end;
$$;


--
--
-- Name: authorize_engagement_state_override(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authorize_engagement_state_override() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Sistema (cron/service_role/definer sin sesión): sin auth.uid() → permitir.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.engagement_state_override is not null and not public.is_admin() then
      raise exception 'No autorizado a fijar el estado del encargo';
    end if;
    return new;
  end if;

  -- Decisión A: bloqueo server-side de edición de fechas por no-admin cuando el
  -- estado actual es terminal (override 6/7/9). Se evalúa aunque el override no
  -- cambie.
  if not public.is_admin()
     and old.engagement_state_override in (6, 7, 9)
     and (
       new.start_date    is distinct from old.start_date
       or new.end_date   is distinct from old.end_date
       or new.fecha_cierre is distinct from old.fecha_cierre
     )
  then
    raise exception 'No autorizado a editar fechas de un encargo Cancelado/Finalizado/Congelado';
  end if;

  -- UPDATE: validación del override solo si cambia.
  if new.engagement_state_override is not distinct from old.engagement_state_override then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- Gerente DEL ENCARGO: congelar (null→9) o descongelar (9→null), solo con
  -- estado derivado Aprobado. Antes: has_role(..., 'manager') sin asignación.
  if public.has_permission('engagement.update')
     and new.manager_id = public.get_my_staff_id()
     and public.engagement_is_approved_state(new.engagement_id, null, new.work_order_required)
     and (
       (old.engagement_state_override is null and new.engagement_state_override = 9)
       or (old.engagement_state_override = 9 and new.engagement_state_override is null)
     )
  then
    return new;
  end if;

  raise exception 'No autorizado a cambiar el estado del encargo (override)';
end;
$$;


--
--
-- Name: FUNCTION authorize_engagement_state_override(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.authorize_engagement_state_override() IS 'Guard del estado del encargo. Admin: control total. Gerente DEL encargo (has_permission(''engagement.update'') + manager_id = get_my_staff_id()): solo congelar/descongelar (null<->9) y solo si el estado derivado es Aprobado.';


--
--
-- Name: batch_upsert_worksheet_cells(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.batch_upsert_worksheet_cells(p_worksheet_id uuid, p_cells jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_engagement_id uuid;
begin
  select engagement_id into v_engagement_id
    from public.activity_worksheets
   where id = p_worksheet_id;

  if v_engagement_id is null then
    raise exception 'Worksheet not found: %', p_worksheet_id;
  end if;

  if not (public.is_admin() or public.is_engagement_team_member(v_engagement_id)) then
    raise exception 'Permission denied: not a team member of this engagement'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.activity_worksheet_cells where worksheet_id = p_worksheet_id;

  insert into public.activity_worksheet_cells (worksheet_id, category_id, activity_id, budget_hours)
  select
    p_worksheet_id,
    (elem->>'category_id')::uuid,
    (elem->>'activity_id')::uuid,
    (elem->>'budget_hours')::numeric
  from jsonb_array_elements(p_cells) as elem
  where (elem->>'budget_hours')::numeric > 0;
end;
$$;


--
--
-- Name: can_approve_timesheet(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_approve_timesheet(p_approver_auth_id uuid, p_period_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_approver_staff uuid;
  v_period record;
begin
  select staff_id into v_approver_staff from staff where auth_user_id = p_approver_auth_id;
  if v_approver_staff is null then
    return false;
  end if;

  -- admin aprueba cualquier periodo
  if exists (select 1 from user_roles where user_id = p_approver_auth_id and role_key = 'admin') then
    return true;
  end if;

  select tp.staff_id, tp.week_start_date into v_period
  from timesheet_periods tp where tp.period_id = p_period_id;
  if v_period is null then
    return false;
  end if;

  return exists (
    select 1 from get_timesheet_approvers(v_period.staff_id, v_period.week_start_date) g
    where g.approver_staff_id = v_approver_staff
  );
end;
$$;


--
--
-- Name: can_approve_timesheet_line(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_approve_timesheet_line(p_approver_auth_id uuid, p_period_id uuid, p_engagement_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_approver_staff uuid;
begin
  select staff_id into v_approver_staff from staff where auth_user_id = p_approver_auth_id;
  if v_approver_staff is null then
    return false;
  end if;

  -- admin aprueba todo
  if exists (select 1 from user_roles where user_id = p_approver_auth_id and role_key = 'admin') then
    return true;
  end if;

  -- debe tener el permiso de aprobar
  if not exists (
    select 1 from user_roles ur
    join authorization_role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = p_approver_auth_id
      and rp.permission_key = 'timesheet_approval.approve'
  ) then
    return false;
  end if;

  -- y ser el Gerente o Socio asignado del encargo (aprueba cualquier línea, incl. la propia)
  return exists (
    select 1 from engagements e
    where e.engagement_id = p_engagement_id
      and (e.manager_id = v_approver_staff or e.partner_id = v_approver_staff)
  );
end;
$$;


--
--
-- Name: can_approve_wo_risk(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_approve_wo_risk(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    public.is_admin()
    or (
      public.has_permission('work_order.risk.approve')
      and (
        -- department / firm -> cualquier encargo (igual que las olas de lectura).
        public.permission_scope('work_order.risk.approve') is distinct from 'assigned_engagements'
        -- assigned_engagements -> SOLO el SQR asignado del encargo.
        or public.get_my_staff_id() = (
          select e.sqr_id from public.engagements e
          where e.engagement_id = p_engagement_id
        )
      )
    );
$$;


--
--
-- Name: can_read_engagement_assignments(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_engagement_assignments(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT has_firmwide_assignment_visibility()
    OR (has_role(auth.uid(),'manager'::app_role) AND is_engagement_team_member(p_engagement_id))
    OR (has_role(auth.uid(),'senior'::app_role)  AND has_assignment_on_engagement(p_engagement_id))
$$;


--
--
-- Name: cascade_practice_abbreviation_rename(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cascade_practice_abbreviation_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only act when abbreviation actually changes between two non-null values.
  IF OLD.abbreviation IS DISTINCT FROM NEW.abbreviation
     AND OLD.abbreviation IS NOT NULL
     AND NEW.abbreviation IS NOT NULL THEN

    UPDATE public.activity_codes
       SET activity_code = NEW.abbreviation
                        || substring(activity_code FROM length(OLD.abbreviation) + 1)
     WHERE practica_id    = OLD.practica_id
       AND activity_code LIKE OLD.abbreviation || '-%';

  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: check_login_allowed(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_login_allowed(p_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email   text := lower(trim(p_email));
  v_locked  timestamptz;
  v_remaining integer;
BEGIN
  SELECT locked_until INTO v_locked
  FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  IF v_locked IS NOT NULL AND v_locked > now() THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked - now()))::integer);
    RETURN jsonb_build_object(
      'allowed', false,
      'remaining_seconds', v_remaining
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining_seconds', 0
  );
END;
$$;


--
--
-- Name: check_pending_hours_before_termination(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_pending_hours_before_termination(p_staff_id uuid, p_termination_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_hire_date date;
  v_capacity numeric;
  v_staff_city text;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_gap numeric;
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT hire_date, weekly_capacity_hours, city
  INTO v_hire_date, v_capacity, v_staff_city
  FROM staff WHERE staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN
    v_hire_date := p_termination_date;
  END IF;

  v_daily := COALESCE(v_capacity, 40) / 5.0;

  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= p_termination_date LOOP
    v_week_end := v_cursor + 4;

    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, p_termination_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
    FROM holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
      AND (
        h.oficina = 0
        OR (h.oficina = 1 AND v_staff_city = 'La Paz')
        OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
      );

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor,
          'effective_start', v_eff_start,
          'effective_end', v_eff_end,
          'expected_hours', v_expected,
          'actual_hours', v_actual,
          'gap', v_gap
        );
      END IF;
    END IF;

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;


--
--
-- Name: check_time_entry_engagement_dates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_time_entry_engagement_dates() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  SELECT e.start_date, e.end_date
  INTO v_start, v_end
  FROM engagements e
  WHERE e.engagement_id = NEW.engagement_id;

  IF v_start IS NOT NULL AND NEW.date_worked < v_start THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE: date_worked % is before engagement start_date %',
      NEW.date_worked, v_start
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_end IS NOT NULL AND NEW.date_worked > v_end THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE: date_worked % is after engagement end_date %',
      NEW.date_worked, v_end
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: check_wo_approved(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_wo_approved() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_wo_required boolean;
  v_override    smallint;
BEGIN
  SELECT work_order_required, engagement_state_override
    INTO v_wo_required, v_override
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  -- FEAT 0602-135: el override manual manda. Solo 4/5 permiten cargar; el resto bloquea.
  IF v_override IS NOT NULL THEN
    IF v_override NOT IN (4, 5) THEN
      RAISE EXCEPTION 'Cannot log time: engagement state (override %) does not allow logging', v_override;
    END IF;
    RETURN NEW;  -- override 4/5: aprobado manualmente, salta el chequeo de OT
  END IF;

  -- Sin override → estado derivado de la OT.
  -- Non-WO-required engagements bypass the WO approval check
  IF v_wo_required IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- WO approval check. FEAT 0602-135: excluye OT con Riesgos rechazado — useRejectRisk deja
  -- approval_status='Approved' pero risk_status='Rejected', que la máquina trata como estado 8
  -- Rechazado (no cargable). Sin este filtro el gate permitiría horas en un encargo rechazado.
  IF NOT EXISTS (
    SELECT 1 FROM work_orders wo
    WHERE wo.engagement_id = NEW.engagement_id
    AND wo.approval_status = 'Approved'
    AND wo.risk_status IS DISTINCT FROM 'Rejected'
  ) THEN
    RAISE EXCEPTION 'Cannot log time: Work Order is not approved';
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: copy_categories_between_practices(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.copy_categories_between_practices(p_source_practice_id uuid, p_target_practice_id uuid, p_replace boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
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

  IF p_source_practice_id = p_target_practice_id THEN
    RAISE EXCEPTION 'same_practice';
  END IF;

  SELECT is_active, allows_rates_activities
    INTO v_src_active, v_src_allows
    FROM public.practicas
   WHERE practica_id = p_source_practice_id;

  IF v_src_active IS NULL THEN
    RAISE EXCEPTION 'source_not_found';
  END IF;
  IF NOT v_src_active OR NOT v_src_allows THEN
    RAISE EXCEPTION 'source_invalid';
  END IF;

  SELECT is_active, allows_rates_activities
    INTO v_tgt_active, v_tgt_allows
    FROM public.practicas
   WHERE practica_id = p_target_practice_id
   FOR UPDATE;

  IF v_tgt_active IS NULL THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;
  IF NOT v_tgt_active OR NOT v_tgt_allows THEN
    RAISE EXCEPTION 'target_invalid';
  END IF;

  SELECT COUNT(*) INTO v_target_count
    FROM public.categories
   WHERE practica_id = p_target_practice_id;

  IF v_target_count > 0 THEN
    IF NOT p_replace THEN
      RAISE EXCEPTION 'target_not_empty';
    END IF;

    SELECT COUNT(*) INTO v_referenced
      FROM public.categories c
     WHERE c.practica_id = p_target_practice_id
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

    DELETE FROM public.categories WHERE practica_id = p_target_practice_id;
  END IF;

  INSERT INTO public.categories (
    practica_id, category_name, display_order,
    rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
    can_approve_wo, can_approve_timesheets, default_app_role
  )
  SELECT p_target_practice_id,
         src.category_name,
         row_number() OVER (ORDER BY src.display_order, src.category_name),
         src.rate_high_bob, src.rate_low_bob, src.rate_high_usd, src.rate_low_usd,
         src.can_approve_wo, src.can_approve_timesheets, src.default_app_role
    FROM public.categories src
   WHERE src.practica_id = p_source_practice_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    category_id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_name character varying(50) NOT NULL,
    rate_high_bob numeric(10,2) DEFAULT 0 NOT NULL,
    rate_low_bob numeric(10,2) DEFAULT 0 NOT NULL,
    rate_high_usd numeric(10,2) DEFAULT 0 NOT NULL,
    rate_low_usd numeric(10,2) DEFAULT 0 NOT NULL,
    display_order integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    can_approve_wo boolean DEFAULT false,
    can_approve_timesheets boolean DEFAULT false,
    default_app_role public.app_role,
    practica_id uuid NOT NULL,
    CONSTRAINT categories_display_order_positive CHECK ((display_order >= 1))
);


--
--
-- Name: create_category_for_practice(uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_category_for_practice(p_practice_id uuid, p_category_name text, p_display_order integer DEFAULT NULL::integer, p_rate_high_bob numeric DEFAULT 0, p_rate_low_bob numeric DEFAULT 0, p_rate_high_usd numeric DEFAULT 0, p_rate_low_usd numeric DEFAULT 0, p_can_approve_wo boolean DEFAULT false, p_can_approve_timesheets boolean DEFAULT false, p_default_app_role public.app_role DEFAULT NULL::public.app_role) RETURNS public.categories
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_active     boolean;
  v_allows     boolean;
  v_max        integer;
  v_position   integer;
  v_row        public.categories;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the practice row to serialize concurrent inserts for the same practice.
  SELECT is_active, allows_rates_activities
    INTO v_active, v_allows
    FROM public.practicas
   WHERE practica_id = p_practice_id
   FOR UPDATE;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'Practice not found';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Practice is inactive';
  END IF;
  IF NOT v_allows THEN
    RAISE EXCEPTION 'Practice does not allow rates/categories';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) INTO v_max
    FROM public.categories
   WHERE practica_id = p_practice_id;

  -- Null / out-of-range → append; otherwise clamp to [1, max+1] (gap-free).
  IF p_display_order IS NULL OR p_display_order > v_max + 1 THEN
    v_position := v_max + 1;
  ELSIF p_display_order < 1 THEN
    v_position := 1;
  ELSE
    v_position := p_display_order;
  END IF;

  -- Shift existing siblings from the target position onward.
  UPDATE public.categories
     SET display_order = display_order + 1
   WHERE practica_id = p_practice_id
     AND display_order >= v_position;

  INSERT INTO public.categories (
    practica_id, category_name, display_order,
    rate_high_bob, rate_low_bob, rate_high_usd, rate_low_usd,
    can_approve_wo, can_approve_timesheets, default_app_role
  ) VALUES (
    p_practice_id, p_category_name, v_position,
    p_rate_high_bob, p_rate_low_bob, p_rate_high_usd, p_rate_low_usd,
    p_can_approve_wo, p_can_approve_timesheets, p_default_app_role
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
--
-- Name: engagements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagements (
    engagement_id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid NOT NULL,
    engagement_name character varying(255) NOT NULL,
    engagement_code character varying(50),
    partner_id uuid,
    manager_id uuid,
    start_date date,
    end_date date,
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    work_order_required boolean DEFAULT true NOT NULL,
    activity_required boolean DEFAULT true NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    approval_required boolean DEFAULT true NOT NULL,
    oficina smallint,
    practica smallint,
    anio_fiscal integer,
    funcion smallint,
    sqr_id uuid,
    encargado_id uuid,
    specialist_it_id uuid,
    specialist_tax_id uuid,
    fecha_cierre date NOT NULL,
    anio_fiscal_override boolean DEFAULT false NOT NULL,
    contract_file_path text,
    taxonomy_id uuid,
    engagement_state_override smallint,
    created_by_staff_id uuid,
    society_id uuid,
    CONSTRAINT chk_engagements_funcion CHECK ((funcion = ANY (ARRAY[0, 1, 2, 3]))),
    CONSTRAINT chk_engagements_oficina CHECK ((oficina = ANY (ARRAY[0, 1, 2]))),
    CONSTRAINT chk_engagements_practica CHECK (((practica >= 0) AND (practica <= 9))),
    CONSTRAINT engagements_state_override_check CHECK (((engagement_state_override IS NULL) OR ((engagement_state_override >= 1) AND (engagement_state_override <= 9)))),
    CONSTRAINT engagements_status_check CHECK (status IN ('active', 'pending', 'completed', 'cancelled'))
);


--
--
-- Name: COLUMN engagements.engagement_state_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.engagements.engagement_state_override IS 'FEAT 0602-135: override manual del estado del encargo (1..9). NULL = derivado de la OT. 6 Cancelado / 7 Finalizado / 9 Congelado son terminales; 7 lo escribe el cron finalize-engagements.';


--
--
-- Name: COLUMN engagements.created_by_staff_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.engagements.created_by_staff_id IS 'Staff que creó el encargo. La puebla un trigger desde get_my_staff_id(); no la envía el cliente HTTP. Da a su autor lectura y edición aunque no figure entre los 4 campos de asignación. NULL en las filas previas a esta migración.';


--
--
-- Name: create_engagement_with_code(text, uuid, uuid, uuid, date, date, text, smallint, smallint, smallint, integer, boolean, boolean, boolean, boolean, date, boolean, uuid, uuid, uuid, uuid, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_engagement_with_code(p_engagement_name text, p_client_id uuid, p_partner_id uuid, p_manager_id uuid, p_start_date date, p_end_date date, p_status text, p_oficina smallint, p_practica smallint, p_funcion smallint, p_anio_fiscal integer, p_work_order_required boolean, p_activity_required boolean, p_is_internal boolean, p_approval_required boolean, p_fecha_cierre date, p_anio_fiscal_override boolean, p_society_id uuid, p_sqr_id uuid DEFAULT NULL::uuid, p_encargado_id uuid DEFAULT NULL::uuid, p_specialist_it_id uuid DEFAULT NULL::uuid, p_specialist_tax_id uuid DEFAULT NULL::uuid, p_contract_file_path text DEFAULT NULL::text, p_taxonomy_id uuid DEFAULT NULL::uuid) RETURNS public.engagements
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_correlativo integer;
  v_code        text;
  v_engagement  public.engagements;
  v_date_begin  date;
  v_date_end    date;
  v_tipo        text;
  v_derived_fy  integer;
BEGIN
  IF p_oficina IS NULL OR p_oficina NOT IN (0, 1, 2) THEN
    RAISE EXCEPTION 'Oficina inválida: %', p_oficina;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.practicas WHERE code = p_practica AND is_active) THEN
    RAISE EXCEPTION 'Práctica inválida: %', p_practica;
  END IF;

  IF p_funcion IS NULL OR p_funcion NOT IN (0, 1, 2, 3) THEN
    RAISE EXCEPTION 'Función inválida: %', p_funcion;
  END IF;

  IF p_anio_fiscal IS NULL OR p_anio_fiscal < 2020 OR p_anio_fiscal > 2100 THEN
    RAISE EXCEPTION 'Año fiscal inválido: %', p_anio_fiscal;
  END IF;

  IF p_fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'Fecha de cierre requerida';
  END IF;

  -- FEAT 0714-155: sociedad interna del encargo — obligatoria y debe estar activa.
  IF p_society_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.society WHERE society_id = p_society_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Sociedad inválida o inactiva: %', p_society_id;
  END IF;

  -- Servicio is optional, but if provided it must reference an active row.
  IF p_taxonomy_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.servicios WHERE taxonomy_id = p_taxonomy_id AND is_active
  ) THEN
    RAISE EXCEPTION 'Servicio inválido o inactivo: %', p_taxonomy_id;
  END IF;

  -- Mirrors getFiscalYearForDate (src/lib/fiscalCalculations.ts): fiscal year runs Oct 1 -> Sep 30,
  -- named by the ending year.
  v_derived_fy := CASE
    WHEN EXTRACT(MONTH FROM p_fecha_cierre) >= 10 THEN EXTRACT(YEAR FROM p_fecha_cierre)::integer + 1
    ELSE EXTRACT(YEAR FROM p_fecha_cierre)::integer
  END;

  IF p_anio_fiscal_override THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'FORBIDDEN: el override manual del año fiscal requiere rol administrador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF p_anio_fiscal IS DISTINCT FROM v_derived_fy THEN
    RAISE EXCEPTION 'Año fiscal % no coincide con el derivado de la fecha de cierre % (esperado %)',
      p_anio_fiscal, p_fecha_cierre, v_derived_fy;
  END IF;

  v_date_begin := ((p_anio_fiscal - 1)::text || '-10-01')::date;
  v_date_end   := (p_anio_fiscal::text        || '-09-30')::date;

  v_tipo := CASE p_funcion
    WHEN 0 THEN 'administrativa'
    WHEN 1 THEN 'cliente'
    WHEN 2 THEN 'capacitacion'
    WHEN 3 THEN 'calidad'
  END;

  INSERT INTO public.parametro (nombre, periodo, date_begin, date_end, valor, descripcion, tipo)
  VALUES (
    'Correlativo OT',
    p_anio_fiscal,
    v_date_begin,
    v_date_end,
    1,
    'Correlativo encargos FY ' || p_anio_fiscal::text || ' - ' || v_tipo,
    v_tipo
  )
  ON CONFLICT (nombre, periodo, tipo) DO NOTHING;

  UPDATE public.parametro
    SET valor = valor + 1
  WHERE nombre  = 'Correlativo OT'
    AND periodo = p_anio_fiscal
    AND tipo    = v_tipo
  RETURNING valor - 1 INTO v_correlativo;

  IF v_correlativo IS NULL THEN
    RAISE EXCEPTION 'No se pudo obtener el correlativo para FY % tipo %', p_anio_fiscal, v_tipo;
  END IF;

  v_code := p_anio_fiscal::text
    || '.' || p_oficina::text || p_practica::text || p_funcion::text
    || '.' || LPAD(v_correlativo::text, 3, '0');

  INSERT INTO public.engagements (
    engagement_name, engagement_code, client_id, partner_id, manager_id,
    start_date, end_date, status, oficina, practica, funcion, anio_fiscal,
    work_order_required, activity_required, is_internal, approval_required,
    sqr_id, encargado_id, specialist_it_id, specialist_tax_id,
    fecha_cierre, anio_fiscal_override, contract_file_path, taxonomy_id, society_id
  ) VALUES (
    p_engagement_name, v_code, p_client_id, p_partner_id, p_manager_id,
    p_start_date, p_end_date, p_status, p_oficina, p_practica, p_funcion, p_anio_fiscal,
    p_work_order_required, p_activity_required, p_is_internal, p_approval_required,
    p_sqr_id, p_encargado_id, p_specialist_it_id, p_specialist_tax_id,
    p_fecha_cierre, p_anio_fiscal_override, p_contract_file_path, p_taxonomy_id, p_society_id
  ) RETURNING * INTO v_engagement;

  RETURN v_engagement;
END;
$$;


--
--
-- Name: activity_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_codes (
    activity_id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_code character varying(10) NOT NULL,
    description character varying(100) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    default_category_id uuid,
    practica_id uuid,
    entity_type text DEFAULT 'A'::text NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    CONSTRAINT activity_codes_entity_type_check CHECK ((entity_type = 'A'::text)),
    -- Cambio deliberado de consolidación (informe §5, plan §2.2.1): reemplaza el
    -- `practica_id NOT NULL` del baseline. `is_system` identifica actividades de
    -- sistema (p.ej. ADM) que no cuelgan de ninguna práctica; todo lo demás debe
    -- seguir teniendo practica_id. Ver docs/migraciones/DIFF-INTENCIONAL-consolidacion.md.
    CONSTRAINT activity_codes_practica_id_or_system CHECK ((is_system OR (practica_id IS NOT NULL)))
);


--
--
-- Name: create_practice_activity(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_practice_activity(p_practice_id uuid, p_description text, p_entity_type text DEFAULT 'A'::text) RETURNS public.activity_codes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_abbrev       text;
  v_max_ordinal  integer;
  v_code         text;
  v_row          public.activity_codes;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  IF p_entity_type NOT IN ('A') THEN
    RAISE EXCEPTION 'Invalid entity_type: %', p_entity_type;
  END IF;

  -- Lock practice row to prevent concurrent inserts for the same practice.
  SELECT abbreviation INTO v_abbrev
    FROM public.practicas
   WHERE practica_id = p_practice_id AND is_active = true
   FOR UPDATE;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Practice not found, inactive, or has no abbreviation';
  END IF;

  -- Highest existing ordinal among active, ordinal-scheme activities for
  -- this (practice, entity_type) pair. System activities (is_system=true,
  -- e.g. ADM) never have a practica_id, so they can never match p_practice_id
  -- here regardless of code shape. Using MAX (not COUNT) also survives any
  -- gap left by an environment where a real activity was already created
  -- under an unfiltered count before this guard existed — the next code
  -- always beats the highest one on record, so it can never collide.
  SELECT COALESCE(MAX(substring(activity_code FROM '[0-9]+$')::int), 0) INTO v_max_ordinal
    FROM public.activity_codes
   WHERE practica_id  = p_practice_id
     AND entity_type = p_entity_type
     AND is_active   = true
     AND is_system   = false
     AND activity_code ~ ('^' || v_abbrev || '-' || p_entity_type || '[0-9]+$');

  -- No hard cap: 1–9 is a UI recommendation only.
  v_code := v_abbrev || '-' || p_entity_type || (v_max_ordinal + 1)::text;

  INSERT INTO public.activity_codes (activity_code, description, is_active, practica_id, entity_type)
  VALUES (v_code, p_description, true, p_practice_id, p_entity_type)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$_$;


--
--
-- Name: current_role_key(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_role_key() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role_key from public.user_roles where user_id = auth.uid() limit 1;
$$;


--
--
-- Name: deactivate_practice_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deactivate_practice_activity(p_activity_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_practica_id  uuid;
  v_entity_type text;
  v_abbrev      text;
  v_old_code    text;
  v_old_ordinal integer;
  rec           RECORD;
  v_ordinal     integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock and fetch the target activity (and its practice row) atomically.
  SELECT ac.practica_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_practica_id, v_entity_type, v_old_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.practicas s USING (practica_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true AND ac.is_system = false
   FOR UPDATE OF ac, s;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found, already inactive, or not practice-linked';
  END IF;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Practice has no abbreviation';
  END IF;

  -- Extract current ordinal from code (e.g. AUD-A3 → 3, AUD-A10 → 10).
  v_old_ordinal := (regexp_replace(v_old_code, '^.*[A-Z](\d+)$', '\1'))::integer;

  -- Mark target as inactive with AX code.
  UPDATE public.activity_codes
     SET is_active = false,
         activity_code = v_abbrev || '-' || v_entity_type || 'X'
   WHERE activity_id = p_activity_id;

  -- Renumber actives with ordinal > old_ordinal (shift back by 1). Legacy
  -- siblings have no trailing digits, so the substring/cast is NULL and the
  -- NULL > v_old_ordinal comparison excludes them from this set already.
  v_ordinal := v_old_ordinal;
  FOR rec IN
    SELECT activity_id
      FROM public.activity_codes
     WHERE practica_id  = v_practica_id
       AND entity_type = v_entity_type
       AND is_active   = true
       AND substring(activity_code FROM '[0-9]+$')::int > v_old_ordinal
     ORDER BY substring(activity_code FROM '[0-9]+$')::int
     FOR UPDATE
  LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || v_ordinal::text
     WHERE activity_id = rec.activity_id;
    v_ordinal := v_ordinal + 1;
  END LOOP;
END;
$_$;


--
--
-- Name: delete_category_for_practice(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_category_for_practice(p_category_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica_id uuid;
  v_pos        integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the target row; capture its practice + position for the compaction.
  SELECT practica_id, display_order
    INTO v_practica_id, v_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  DELETE FROM public.categories WHERE category_id = p_category_id;

  -- Close the gap: everything after the removed position shifts up by one.
  -- The (practica_id, display_order) unique is DEFERRABLE, so the bulk shift is
  -- safe within this transaction.
  UPDATE public.categories
     SET display_order = display_order - 1
   WHERE practica_id = v_practica_id
     AND display_order > v_pos;
END;
$$;


--
--
-- Name: enforce_activity_default(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_activity_default() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_activity_required boolean;
  v_raw text;
  v_adm_id uuid;
BEGIN
  -- Check if engagement requires activity selection
  SELECT activity_required INTO v_activity_required
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  -- If activity is required (default), no auto-assignment
  IF v_activity_required IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  -- Read ADM activity ID from global_settings
  SELECT setting_value INTO v_raw
  FROM global_settings
  WHERE setting_key = 'ADM_ACTIVITY_ID';

  IF v_raw IS NULL OR TRIM(v_raw) = '' THEN
    RAISE EXCEPTION 'ADM_ACTIVITY_NOT_CONFIGURED';
  END IF;

  v_adm_id := TRIM(v_raw)::uuid;

  -- Force activity to ADM regardless of what was sent
  NEW.activity_id := v_adm_id;
  RETURN NEW;
END;
$$;


--
--
-- Name: enforce_assignment_practice_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_assignment_practice_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica    smallint;
  v_practica_id  uuid;
  v_cat_practica uuid;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.engagements e
   WHERE e.engagement_id = NEW.engagement_id;

  IF v_practica IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT practica_id INTO v_practica_id
    FROM public.practicas
   WHERE code = v_practica;

  SELECT practica_id INTO v_cat_practica
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
    RAISE EXCEPTION 'Category % does not belong to the engagement''s practice', NEW.category_id;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: enforce_engagement_creator_team(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_engagement_creator_team() RETURNS trigger
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
  -- Solo los roles BASE, igual que el mapa de candidatos de 0722-162. Quedan deliberadamente FUERA
  -- (sin restricción alguna): ita_manager y tax_manager — que sí tienen engagement.create pero
  -- pertenecen a los grupos specialist_it/specialist_tax y por lo tanto no son candidatos elegibles
  -- para el campo Gerente — más senior_partner, risk_partner, risk_supervisor,
  -- it_security_manager, accounting_*, hr_*, sqr, senior, semisenior y assistant.
  IF v_role IN ('partner', 'director') THEN
    NEW.partner_id := v_staff;
  ELSIF v_role = 'manager' THEN
    NEW.manager_id := v_staff;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: FUNCTION enforce_engagement_creator_team(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.enforce_engagement_creator_team() IS 'BUG 0810-172: en la CREACIÓN de un encargo canoniza partner_id/manager_id al staff del llamante según su role_key (partner/director -> partner_id; manager -> manager_id). Exentos: role_key admin, inserts sin auth.uid() (seeds/service_role) y llamantes sin staff vinculado. Espejo de src/lib/engagementSelfAssignment.ts. Solo INSERT: el UPDATE no aplica esta regla.';


--
--
-- Name: enforce_engagement_fiscal_year_invariant(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_engagement_fiscal_year_invariant() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_derived_fy integer;
BEGIN
  -- Only re-validate when a field this invariant governs actually changes; unrelated updates
  -- (status, name, personnel, dates, etc.) pass through untouched.
  IF NEW.fecha_cierre IS NOT DISTINCT FROM OLD.fecha_cierre
     AND NEW.anio_fiscal IS NOT DISTINCT FROM OLD.anio_fiscal
     AND NEW.anio_fiscal_override IS NOT DISTINCT FROM OLD.anio_fiscal_override THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'Fecha de cierre requerida';
  END IF;

  -- Mirrors getFiscalYearForDate (src/lib/fiscalCalculations.ts) and the check added to
  -- create_engagement_with_code: fiscal year runs Oct 1 -> Sep 30, named by the ending year.
  v_derived_fy := CASE
    WHEN EXTRACT(MONTH FROM NEW.fecha_cierre) >= 10 THEN EXTRACT(YEAR FROM NEW.fecha_cierre)::integer + 1
    ELSE EXTRACT(YEAR FROM NEW.fecha_cierre)::integer
  END;

  -- Admin required to: (a) change the override flag in either direction, or
  -- (b) change anio_fiscal while override is already active.
  -- Non-admins (Manager/Partner/Director) may update fecha_cierre while both the flag and
  -- anio_fiscal stay unchanged (their UI payload carries the same admin-set value).
  IF NEW.anio_fiscal_override IS DISTINCT FROM OLD.anio_fiscal_override
     OR (NEW.anio_fiscal_override AND NEW.anio_fiscal IS DISTINCT FROM OLD.anio_fiscal) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'FORBIDDEN: el override manual del año fiscal requiere rol administrador'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NOT NEW.anio_fiscal_override AND NEW.anio_fiscal IS DISTINCT FROM v_derived_fy THEN
    RAISE EXCEPTION 'Año fiscal % no coincide con el derivado de la fecha de cierre % (esperado %)',
      NEW.anio_fiscal, NEW.fecha_cierre, v_derived_fy;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: enforce_holiday_blocking(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_holiday_blocking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_holiday_name text;
  v_raw text;
  v_setting text;
  v_holiday_engagement_id uuid;
  v_staff_city text;
BEGIN
  SELECT city INTO v_staff_city FROM staff WHERE staff_id = NEW.staff_id;

  -- Check if date_worked is a holiday applicable to this staff's office
  SELECT holiday_name INTO v_holiday_name
  FROM holidays
  WHERE holiday_date = NEW.date_worked
    AND (
      oficina = 0
      OR (oficina = 1 AND v_staff_city = 'La Paz')
      OR (oficina = 2 AND v_staff_city = 'Santa Cruz')
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;  -- Not a holiday applicable to this staff's office, allow
  END IF;

  -- Read the holiday engagement setting
  SELECT setting_value INTO v_raw
  FROM global_settings
  WHERE setting_key = 'HOLIDAY_ENGAGEMENT_ID';

  v_setting := NULLIF(TRIM(v_raw), '');

  IF v_setting IS NULL THEN
    RAISE EXCEPTION 'HOLIDAY_NOT_CONFIGURED';
  END IF;

  v_holiday_engagement_id := v_setting::uuid;

  IF NEW.engagement_id != v_holiday_engagement_id THEN
    RAISE EXCEPTION 'HOLIDAY_BLOCKED:%', v_holiday_name;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: enforce_termination_date(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_termination_date() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_term date;
BEGIN
  SELECT termination_date INTO v_term
  FROM staff WHERE staff_id = NEW.staff_id;
  IF v_term IS NOT NULL AND NEW.date_worked > v_term THEN
    RAISE EXCEPTION 'TERMINATION_DATE_BLOCKED: Cannot log time after termination date %', v_term;
  END IF;
  RETURN NEW;
END; $$;


--
--
-- Name: enforce_wo_staffing_practice_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_wo_staffing_practice_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica    smallint;
  v_practica_id  uuid;
  v_cat_practica uuid;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
   WHERE wo.wo_id = NEW.wo_id;

  -- Engagement sin servicio asignado: sin scope, igual que el precedente.
  IF v_practica IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT practica_id INTO v_practica_id
    FROM public.practicas
   WHERE code = v_practica;

  SELECT practica_id INTO v_cat_practica
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
    RAISE EXCEPTION 'Category % does not belong to the work order''s engagement practice', NEW.category_id;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: enforce_worksheet_cell_practice_scope(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_worksheet_cell_practice_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica    smallint;
  v_practica_id  uuid;
  v_cat_practica uuid;
  v_act_practica uuid;
BEGIN
  SELECT e.practica INTO v_practica
    FROM public.activity_worksheets aw
    JOIN public.engagements e ON e.engagement_id = aw.engagement_id
   WHERE aw.id = NEW.worksheet_id;

  -- Legacy engagements with no assigned practice are not scoped by this rule;
  -- the UI already limits them to no categories (categories.practica_id is NOT NULL).
  IF v_practica IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT practica_id INTO v_practica_id
    FROM public.practicas
   WHERE code = v_practica;

  SELECT practica_id INTO v_cat_practica
    FROM public.categories
   WHERE category_id = NEW.category_id;

  IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
    RAISE EXCEPTION 'Category % does not belong to the engagement''s practice', NEW.category_id;
  END IF;

  SELECT practica_id INTO v_act_practica
    FROM public.activity_codes
   WHERE activity_id = NEW.activity_id;

  -- NULL activity practica_id = global activity (e.g. 100-PLA, ADM), valid for every practice.
  IF v_act_practica IS NOT NULL AND v_act_practica <> v_practica_id THEN
    RAISE EXCEPTION 'Activity % does not belong to the engagement''s practice', NEW.activity_id;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: engagement_accepts_assignment_writes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_accepts_assignment_writes(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT engagement_state_override NOT IN (6, 7, 9)
       FROM public.engagements
      WHERE engagement_id = p_engagement_id),
    true)  -- override NULL (estado derivado 1..5/8) o engagement inexistente ⇒ escribible
$$;


--
--
-- Name: engagement_allows_hours_or_requests(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_allows_hours_or_requests(p_engagement_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_override    smallint;
  v_wo_required boolean;
  v_approval    text;
  v_risk        text;
BEGIN
  SELECT e.engagement_state_override, e.work_order_required
    INTO v_override, v_wo_required
  FROM public.engagements e WHERE e.engagement_id = p_engagement_id;

  -- Override manual manda: solo 4/5 permiten.
  IF v_override IS NOT NULL THEN
    RETURN v_override IN (4, 5);
  END IF;
  -- Administrativo (sin OT) = Aprobado.
  IF v_wo_required = false THEN
    RETURN true;
  END IF;
  -- Derivado: OT aprobada y NO risk-rejected (=8 Rechazado).
  SELECT approval_status, risk_status INTO v_approval, v_risk
  FROM public.work_orders WHERE engagement_id = p_engagement_id;
  RETURN v_approval = 'Approved' AND v_risk IS DISTINCT FROM 'Rejected';
END;
$$;


--
--
-- Name: engagement_in_my_fund_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_in_my_fund_request(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.fund_request_work_orders frwo
    join public.fund_requests fr on fr.fund_request_id = frwo.fund_request_id
    join public.work_orders  wo on wo.wo_id = frwo.wo_id
    where wo.engagement_id = p_engagement_id
      and fr.status <> 'borrador'
      and (
        fr.requester_staff_id = get_my_staff_id()
        or frwo.manager_staff_id = get_my_staff_id()
        -- Contabilidad, con el MISMO corte que fr_select_accounting (Ola D):
        --   Gerente (fund_disbursement.read)  -> toda la fase contable.
        --   Analista (expense_settlement.read) -> hasta 'fondos_entregados'; queda
        --   fuera de 'en_liquidacion' y 'cerrado'.
        or (public.has_permission('fund_disbursement.read')
            and fr.status = any (array['aprobado_gerente','fondos_entregados',
                                       'en_liquidacion','cerrado']::fund_request_status[]))
        or (public.has_permission('expense_settlement.read')
            and fr.status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[]))
      )
  );
$$;


--
--
-- Name: FUNCTION engagement_in_my_fund_request(p_engagement_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.engagement_in_my_fund_request(p_engagement_id uuid) IS 'True si el encargo pertenece a una OT incluida en una solicitud de fondos ENVIADA donde el usuario es solicitante o gerente de esa OT. Espejo de wo_in_my_fund_request para el nivel encargo (embed anidado del select de fondos).';


--
--
-- Name: engagement_is_approved_state(uuid, smallint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.engagement_is_approved_state(p_engagement_id uuid, p_override smallint, p_wo_required boolean) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Override manual gana: solo el 4 (Aprobado) cuenta como aprobado.
  IF p_override IS NOT NULL THEN
    RETURN p_override = 4;
  END IF;
  -- Derivado: administrativo (sin OT) = Aprobado.
  IF p_wo_required = false THEN
    RETURN true;
  END IF;
  -- Derivado: estado 4 Aprobado = OT aprobada, NO en emergencia (sería 5) y NO risk-rejected
  -- (sería 8 Rechazado). Ambos se excluyen del auto-cierre.
  RETURN EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.engagement_id = p_engagement_id
      AND wo.approval_status = 'Approved'
      AND wo.risk_status IS DISTINCT FROM 'Emergency_Approved'
      AND wo.risk_status IS DISTINCT FROM 'Rejected'
  );
END;
$$;


--
--
-- Name: finalize_all_stale_timers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_all_stale_timers() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours',
      duration_minutes = 480
  WHERE ended_at IS NULL
    AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
--
-- Name: finalize_due_engagements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_due_engagements() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.engagements e
     SET engagement_state_override = 7,   -- 7 Finalizado
         updated_at = now()
   WHERE e.end_date IS NOT NULL
     AND e.end_date < (now() AT TIME ZONE 'America/La_Paz')::date
     -- Solo estado efectivo Aprobado (4). Un override 7 ya fijado devuelve false → idempotente.
     AND public.engagement_is_approved_state(e.engagement_id, e.engagement_state_override, e.work_order_required);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
--
-- Name: finalize_my_stale_timers(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_my_stale_timers() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id uuid;
  v_count integer;
BEGIN
  SELECT staff_id INTO v_staff_id
  FROM staff WHERE auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN RETURN 0; END IF;

  UPDATE timer_entries
  SET ended_at = started_at + interval '8 hours',
      duration_minutes = 480
  WHERE ended_at IS NULL
    AND staff_id = v_staff_id
    AND started_at < now() - interval '8 hours';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
--
-- Name: fr_guard_accounting_cols(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_guard_accounting_cols() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if is_admin() then
    return new;
  end if;

  -- Columnas de DESEMBOLSO / cierre: requieren fund_disbursement.update.
  if (
    new.total_disbursed_amount is distinct from old.total_disbursed_amount or
    new.disbursed_at is distinct from old.disbursed_at or
    new.disbursed_by_staff_id is distinct from old.disbursed_by_staff_id or
    new.accounting_notes is distinct from old.accounting_notes or
    new.closed_at is distinct from old.closed_at
  ) and not public.has_permission('fund_disbursement.update') then
    raise exception 'Solo contabilidad (desembolso) puede modificar estos campos';
  end if;

  -- Columnas de LIQUIDACIÓN: requieren expense_settlement.update.
  if (
    new.settlement_total_spent is distinct from old.settlement_total_spent or
    new.settlement_balance is distinct from old.settlement_balance or
    new.settlement_iva_total is distinct from old.settlement_iva_total or
    new.settlement_resolution is distinct from old.settlement_resolution or
    new.settlement_amount is distinct from old.settlement_amount or
    new.settlement_notes is distinct from old.settlement_notes or
    new.settled_at is distinct from old.settled_at or
    new.settled_by_staff_id is distinct from old.settled_by_staff_id
  ) and not public.has_permission('expense_settlement.update') then
    raise exception 'Solo contabilidad (liquidacion) puede modificar estos campos';
  end if;

  return new;
end;
$$;


--
--
-- Name: fr_is_ot_manager(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_is_ot_manager(p_fr_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders frwo
    WHERE frwo.fund_request_id = p_fr_id
      AND frwo.manager_staff_id = get_my_staff_id()
  );
$$;


--
--
-- Name: fr_is_requester(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_is_requester(p_fr_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_requests fr
    WHERE fr.fund_request_id = p_fr_id
      AND fr.requester_staff_id = get_my_staff_id()
  );
$$;


--
--
-- Name: fr_is_submitted(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_is_submitted(p_fr_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fund_requests fr
    WHERE fr.fund_request_id = p_fr_id
      AND fr.status <> 'borrador'
  );
$$;


--
--
-- Name: fr_wo_guard_approval_cols(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_wo_guard_approval_cols() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me UUID := get_my_staff_id();
  v_parent_status public.fund_request_status;
  v_decision_changed BOOLEAN;
  v_alloc_changed BOOLEAN;
  v_submit_reset BOOLEAN;
  v_manager_decision BOOLEAN;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- ¿Cambian las columnas de asignación / identidad de la OT?
  v_alloc_changed :=
       NEW.allocated_amount IS DISTINCT FROM OLD.allocated_amount
    OR NEW.wo_id            IS DISTINCT FROM OLD.wo_id
    OR NEW.fund_request_id  IS DISTINCT FROM OLD.fund_request_id
    OR NEW.manager_staff_id IS DISTINCT FROM OLD.manager_staff_id;

  -- NINGÚN no-admin puede cambiar la asignación/identidad por UPDATE: las
  -- allocations se editan vía RPC (delete+insert) y manager_staff_id lo fija el
  -- setter. Esto cierra que el solicitante se ponga como gerente de su OT
  -- (manager_staff_id) para luego auto-aprobarse.
  IF v_alloc_changed THEN
    RAISE EXCEPTION 'No se puede modificar la asignación de la OT (monto/OT/gerente) por esta vía';
  END IF;

  v_decision_changed :=
       NEW.approval_status   IS DISTINCT FROM OLD.approval_status
    OR NEW.manager_notes     IS DISTINCT FROM OLD.manager_notes
    OR NEW.rejection_reason  IS DISTINCT FROM OLD.rejection_reason
    OR NEW.manager_decided_at IS DISTINCT FROM OLD.manager_decided_at;

  IF v_decision_changed THEN
    -- Reset del reenvío: SOLO desde el RPC fund_request_submit (lleva el flag
    -- transaccional). Un UPDATE directo por API no puede resetear las OTs y
    -- brincarse las validaciones del submit (suma de OTs, submitted_at,
    -- limpieza de notas).
    v_submit_reset :=
      NEW.approval_status = 'pendiente'
      AND NEW.manager_notes IS NULL
      AND NEW.rejection_reason IS NULL
      AND NEW.manager_decided_at IS NULL
      AND COALESCE(current_setting('app.fr_submitting', true) = 'on', false);

    IF v_submit_reset THEN
      RETURN NEW;
    END IF;

    SELECT status INTO v_parent_status
    FROM public.fund_requests
    WHERE fund_request_id = OLD.fund_request_id;

    -- Decisión legítima del gerente: solo durante la fase pendiente_aprobacion,
    -- desde una OT pendiente hacia uno de los estados finales de decisión.
    v_manager_decision :=
      OLD.manager_staff_id IS NOT DISTINCT FROM v_me
      AND v_parent_status = 'pendiente_aprobacion'
      AND OLD.approval_status = 'pendiente'
      AND NEW.approval_status IN ('aprobado', 'observado', 'rechazado');

    IF v_manager_decision THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Las columnas de decisión de la OT solo pueden cambiarse por el gerente durante la aprobación pendiente o mediante la acción de enviar la solicitud';
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: fr_wo_rollup_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_wo_rollup_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_fr_id uuid;
  v_total int; v_aprobado int; v_observado int; v_rechazado int;
  v_new public.fund_request_status;
  v_current public.fund_request_status;
BEGIN
  v_fr_id := COALESCE(NEW.fund_request_id, OLD.fund_request_id);

  SELECT status INTO v_current FROM public.fund_requests WHERE fund_request_id = v_fr_id;

  -- Solo recalcular durante la fase de aprobación del gerente.
  IF v_current IS NULL OR v_current NOT IN
     ('pendiente_aprobacion','observado','rechazado','aprobado_gerente') THEN
    RETURN NULL;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE approval_status = 'aprobado'),
    count(*) FILTER (WHERE approval_status = 'observado'),
    count(*) FILTER (WHERE approval_status = 'rechazado')
  INTO v_total, v_aprobado, v_observado, v_rechazado
  FROM public.fund_request_work_orders
  WHERE fund_request_id = v_fr_id;

  IF v_rechazado > 0 THEN
    v_new := 'rechazado';
  ELSIF v_observado > 0 THEN
    v_new := 'observado';
  ELSIF v_total > 0 AND v_aprobado = v_total THEN
    v_new := 'aprobado_gerente';
  ELSE
    v_new := 'pendiente_aprobacion';
  END IF;

  IF v_new <> v_current THEN
    UPDATE public.fund_requests
    SET status = v_new,
        manager_decided_at = CASE WHEN v_new = 'aprobado_gerente' THEN now() ELSE manager_decided_at END
    WHERE fund_request_id = v_fr_id;
  END IF;

  RETURN NULL;
END;
$$;


--
--
-- Name: fr_wo_set_manager(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_wo_set_manager() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_mgr uuid;
BEGIN
  SELECT e.manager_id INTO v_mgr
  FROM public.work_orders wo
  JOIN public.engagements e ON e.engagement_id = wo.engagement_id
  WHERE wo.wo_id = NEW.wo_id;

  IF v_mgr IS NULL THEN
    RAISE EXCEPTION 'La OT % no tiene gerente asignado en su engagement; no puede usarse en una solicitud de fondos', NEW.wo_id;
  END IF;

  NEW.manager_staff_id := v_mgr;
  RETURN NEW;
END;
$$;


--
--
-- Name: fr_wo_validate_approved(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fr_wo_validate_approved() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
  v_wo_currency text;
  v_fr_currency text;
  v_engagement_id uuid;
BEGIN
  SELECT approval_status, currency, engagement_id
    INTO v_status, v_wo_currency, v_engagement_id
  FROM public.work_orders WHERE wo_id = NEW.wo_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Work order % does not exist', NEW.wo_id;
  END IF;
  IF v_status <> 'Approved' THEN
    RAISE EXCEPTION 'Work order % must be Approved to be allocated (current: %)', NEW.wo_id, v_status;
  END IF;

  -- FEAT 0602-135: el estado efectivo del encargo debe admitir solicitudes (4/5). Bloquea
  -- Congelado(9)/Finalizado(7)/Cancelado(6)/Rechazado(8) y overrides no-cargables.
  IF NOT public.engagement_allows_hours_or_requests(v_engagement_id) THEN
    RAISE EXCEPTION 'El encargo no admite solicitudes de fondos en su estado actual';
  END IF;

  -- BUG 0722-164 (1): la moneda de la OT ya no tiene que coincidir con la de la
  -- solicitud (el monto asignado va en la moneda de la solicitud), pero sí debe
  -- ser una que el módulo de fondos modela.
  IF v_wo_currency NOT IN ('BOB', 'USD') THEN
    RAISE EXCEPTION 'La moneda de la OT (%) no está habilitada para solicitudes de fondos', v_wo_currency;
  END IF;

  -- BUG 0722-164 (2): la solicitud es el EFECTIVO entregado y se rinde con
  -- facturas bolivianas + IVA 13 %, así que debe estar en BOB. Reemplaza el freno
  -- accidental que daba la igualdad de monedas (ver cabecera).
  SELECT currency INTO v_fr_currency
  FROM public.fund_requests WHERE fund_request_id = NEW.fund_request_id;
  -- IS DISTINCT FROM y no <>: con NULL, `<>` devuelve NULL y el IF no dispararía.
  IF v_fr_currency IS DISTINCT FROM 'BOB' THEN
    RAISE EXCEPTION 'La solicitud debe estar en BOB para asignarle OTs (actual: %)', v_fr_currency;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: fre_validate_transition(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fre_validate_transition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_me UUID := get_my_staff_id();
  v_is_requester BOOLEAN;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- (P1a) Solo Contabilidad puede ENCENDER el flag de devolución.
  -- 2026-07-31: antes bastaba con "no-admin" para bloquear, porque el asistente
  -- contable se modelaba como admin y salía por el RETURN de arriba. Con los roles
  -- reales, devolver un gasto por falta de respaldo lanzaba esta excepción.
  IF NEW.returned_by_assistant AND NOT OLD.returned_by_assistant
     AND NOT public.has_permission('expense_settlement.update') THEN
    RAISE EXCEPTION 'No autorizado a marcar el gasto como devuelto por contabilidad';
  END IF;

  -- Campos de revisión contable: SOLO Contabilidad los toca. Ni gerente ni
  -- solicitante pueden cambiarlos (un iva_penalty_amount forjado se colaría en el
  -- total de la liquidación).
  --
  -- 2026-07-31: antes exigía is_admin(), que se escribió cuando "asistente
  -- contable" se modelaba como admin. Con los roles reales del catálogo, el
  -- Gerente y el Analista de Contabilidad quedaban bloqueados: revisar una factura
  -- lanzaba esta excepción. Ahora se gatea por el permiso de la matriz
  -- (expense_settlement.update = admin, accounting_manager, accounting_analyst).
  IF NOT public.has_permission('expense_settlement.update')
     AND (NEW.reviewed_at          IS DISTINCT FROM OLD.reviewed_at
     OR NEW.reviewed_by_staff_id      IS DISTINCT FROM OLD.reviewed_by_staff_id
     OR NEW.has_invoice_observation   IS DISTINCT FROM OLD.has_invoice_observation
     OR NEW.invoice_observation_notes IS DISTINCT FROM OLD.invoice_observation_notes
     OR NEW.iva_penalty_amount        IS DISTINCT FROM OLD.iva_penalty_amount) THEN
    RAISE EXCEPTION 'Solo contabilidad puede modificar los campos de revisión del gasto';
  END IF;

  -- El gasto NO se puede mover a otra solicitud por UPDATE (ni el solicitante ni
  -- el gerente): cambiaría conteos/liquidación de ambas. El solicitante sí puede
  -- reasignar el `wo_id` dentro de la MISMA solicitud (se valida aparte).
  IF NEW.fund_request_id IS DISTINCT FROM OLD.fund_request_id THEN
    RAISE EXCEPTION 'No se puede mover el gasto a otra solicitud de fondos';
  END IF;

  -- ¿El que actúa es el solicitante (dueño) de la solicitud?
  SELECT (fr.requester_staff_id = v_me) INTO v_is_requester
  FROM public.fund_requests fr
  WHERE fr.fund_request_id = NEW.fund_request_id;

  -- (P1b) Si NO es el solicitante (=> gerente), solo puede tocar columnas de
  -- decisión; los DATOS del gasto quedan inmutables para él.
  IF NOT COALESCE(v_is_requester, false) THEN
    IF NEW.amount           IS DISTINCT FROM OLD.amount
       OR NEW.wo_id            IS DISTINCT FROM OLD.wo_id
       OR NEW.expense_type_id  IS DISTINCT FROM OLD.expense_type_id
       OR NEW.expense_date     IS DISTINCT FROM OLD.expense_date
       OR NEW.expense_date_end IS DISTINCT FROM OLD.expense_date_end
       OR NEW.days             IS DISTINCT FROM OLD.days
       OR NEW.description      IS DISTINCT FROM OLD.description
       OR NEW.document_number  IS DISTINCT FROM OLD.document_number
       OR NEW.supplier_name    IS DISTINCT FROM OLD.supplier_name
       OR NEW.supplier_tax_id  IS DISTINCT FROM OLD.supplier_tax_id
       OR NEW.attachment_url   IS DISTINCT FROM OLD.attachment_url
       OR NEW.currency         IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'El gerente no puede modificar los datos del gasto, solo aprobar/observar/rechazar';
    END IF;
  END IF;

  -- En un gasto devuelto por contabilidad (returned_by_assistant) el solicitante
  -- SOLO puede re-adjuntar el respaldo; cambiar datos exige reenviar al gerente.
  -- Aplica AUNQUE no cambie el status: si no, editaría datos con status observado
  -- y luego reenviaría a aprobado_gerente sin que el guard del reenvío (que
  -- compara contra la fila ya mutada) detecte la diferencia.
  IF OLD.returned_by_assistant AND OLD.status = 'observado' THEN
    IF NEW.amount           IS DISTINCT FROM OLD.amount
       OR NEW.wo_id            IS DISTINCT FROM OLD.wo_id
       OR NEW.expense_type_id  IS DISTINCT FROM OLD.expense_type_id
       OR NEW.expense_date     IS DISTINCT FROM OLD.expense_date
       OR NEW.expense_date_end IS DISTINCT FROM OLD.expense_date_end
       OR NEW.days             IS DISTINCT FROM OLD.days
       OR NEW.description      IS DISTINCT FROM OLD.description
       OR NEW.document_number  IS DISTINCT FROM OLD.document_number
       OR NEW.supplier_name    IS DISTINCT FROM OLD.supplier_name
       OR NEW.supplier_tax_id  IS DISTINCT FROM OLD.supplier_tax_id
       OR NEW.currency         IS DISTINCT FROM OLD.currency THEN
      RAISE EXCEPTION 'En un gasto devuelto por contabilidad solo se puede actualizar el respaldo (adjunto); para cambiar datos reenvíe al gerente';
    END IF;
  END IF;

  -- ── Validación de transiciones de estado ──
  -- En una edición SIN cambio de estado, un no-admin no puede tocar la metadata
  -- de decisión/envío: esos campos solo cambian en transiciones legítimas (la
  -- decisión del gerente o el reenvío, que SÍ cambian el status). Evita que el
  -- solicitante forje o borre el rastro de aprobación por un UPDATE directo.
  IF NEW.status = OLD.status THEN
    IF NEW.manager_notes      IS DISTINCT FROM OLD.manager_notes
       OR NEW.rejection_reason   IS DISTINCT FROM OLD.rejection_reason
       OR NEW.manager_decided_at IS DISTINCT FROM OLD.manager_decided_at
       OR NEW.submitted_at       IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'No autorizado a modificar la metadata de aprobación/envío del gasto';
    END IF;
    RETURN NEW;
  END IF;

  -- Reenvío del solicitante hacia el gerente
  IF NEW.status = 'pendiente_aprobacion'
     AND OLD.status IN ('borrador', 'observado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  -- Reenvío del solicitante DIRECTO al asistente (solo si fue devuelto por él).
  -- La inmutabilidad de datos ya se validó arriba (guard de returned_by_assistant),
  -- así que aquí solo se permite la transición.
  IF NEW.status = 'aprobado_gerente'
     AND OLD.status = 'observado'
     AND OLD.returned_by_assistant THEN
    RETURN NEW;
  END IF;

  -- Decisión del gerente sobre un gasto pendiente
  IF OLD.status = 'pendiente_aprobacion'
     AND NEW.status IN ('aprobado_gerente', 'observado', 'rechazado') THEN
    RETURN NEW;
  END IF;

  -- Decisión de CONTABILIDAD sobre un gasto ya aprobado por el gerente.
  -- 2026-07-31: estas dos transiciones nunca estuvieron en la lista porque solo
  -- las hacía el admin, y el `IF is_admin() THEN RETURN NEW` del inicio se saltaba
  -- toda la validación. Con los roles reales del catálogo hay que declararlas:
  --   revisado_asistente -> factura correcta (useReviewFundRequestExpense)
  --   observado          -> devuelta por falta de respaldo, con returned_by_assistant
  --                         (useReturnFundRequestExpense; el flag lo autoriza P1a)
  IF OLD.status = 'aprobado_gerente'
     AND NEW.status IN ('revisado_asistente', 'observado')
     AND public.has_permission('expense_settlement.update') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Transición de estado no permitida para el gasto: % -> %', OLD.status, NEW.status;
END;
$$;


--
--
-- Name: fre_validate_wo_in_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fre_validate_wo_in_request() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_fr_currency text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders frwo
    WHERE frwo.fund_request_id = NEW.fund_request_id
      AND frwo.wo_id = NEW.wo_id
  ) THEN
    RAISE EXCEPTION 'Work order % is not associated with fund request %', NEW.wo_id, NEW.fund_request_id;
  END IF;

  -- La moneda del gasto debe coincidir con la de la solicitud (la liquidación
  -- suma montos como números planos bajo fr.currency; mezclar monedas corrompe
  -- el saldo). El form siempre manda la moneda de la solicitud, pero por API no.
  SELECT currency INTO v_fr_currency
  FROM public.fund_requests WHERE fund_request_id = NEW.fund_request_id;
  IF NEW.currency IS DISTINCT FROM v_fr_currency THEN
    RAISE EXCEPTION 'La moneda del gasto (%) no coincide con la de la solicitud (%)', NEW.currency, v_fr_currency;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: fund_request_expenses_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_request_expenses_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
--
-- Name: fund_request_save_edit(uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_request_save_edit(p_fund_request_id uuid, p_fields jsonb, p_allocations jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Header: solo las columnas presentes en el jsonb (las demás se conservan).
  IF p_fields IS NOT NULL AND p_fields <> '{}'::jsonb THEN
    UPDATE public.fund_requests SET
      total_requested_amount =
        CASE WHEN p_fields ? 'total_requested_amount'
             THEN (p_fields->>'total_requested_amount')::NUMERIC
             ELSE total_requested_amount END,
      currency =
        CASE WHEN p_fields ? 'currency'
             THEN p_fields->>'currency'
             ELSE currency END,
      purpose =
        CASE WHEN p_fields ? 'purpose'
             THEN p_fields->>'purpose'
             ELSE purpose END,
      due_back_date =
        CASE WHEN p_fields ? 'due_back_date'
             THEN NULLIF(p_fields->>'due_back_date', '')::DATE
             ELSE due_back_date END
    WHERE fund_request_id = p_fund_request_id;
  END IF;

  -- OTs: reemplazo completo (delete + insert) solo si se proveen.
  IF p_allocations IS NOT NULL THEN
    DELETE FROM public.fund_request_work_orders
    WHERE fund_request_id = p_fund_request_id;

    IF jsonb_array_length(p_allocations) > 0 THEN
      INSERT INTO public.fund_request_work_orders (fund_request_id, wo_id, allocated_amount)
      SELECT
        p_fund_request_id,
        (a->>'wo_id')::UUID,
        (a->>'allocated_amount')::NUMERIC
      FROM jsonb_array_elements(p_allocations) AS a;
    END IF;
  END IF;
END;
$$;


--
--
-- Name: fund_request_submit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_request_submit(p_fund_request_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_requester UUID;
  v_status public.fund_request_status;
  v_total NUMERIC;
  v_alloc NUMERIC;
BEGIN
  SELECT requester_staff_id, status, total_requested_amount
  INTO v_requester, v_status, v_total
  FROM public.fund_requests
  WHERE fund_request_id = p_fund_request_id;

  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'Solicitud de fondos % no encontrada', p_fund_request_id;
  END IF;

  -- Solo el solicitante (o admin) puede enviar.
  IF NOT (is_admin() OR v_requester = get_my_staff_id()) THEN
    RAISE EXCEPTION 'No autorizado a enviar esta solicitud';
  END IF;

  -- Solo desde un estado editable (borrador / observado / rechazado).
  IF v_status NOT IN ('borrador', 'observado', 'rechazado') THEN
    RAISE EXCEPTION 'La solicitud no se puede enviar en su estado actual (%)', v_status;
  END IF;

  -- Debe tener al menos una OT; si no, nadie podría aprobarla.
  SELECT COALESCE(SUM(allocated_amount), 0)
  INTO v_alloc
  FROM public.fund_request_work_orders
  WHERE fund_request_id = p_fund_request_id;

  IF v_alloc = 0 AND NOT EXISTS (
    SELECT 1 FROM public.fund_request_work_orders
    WHERE fund_request_id = p_fund_request_id
  ) THEN
    RAISE EXCEPTION 'La solicitud no tiene OTs asignadas; no se puede enviar a aprobación';
  END IF;

  -- La suma de las asignaciones por OT debe cuadrar con el monto solicitado.
  -- (El form ya lo valida, pero por API directa podría enviarse descuadrada.)
  IF round(v_alloc, 2) <> round(COALESCE(v_total, 0), 2) THEN
    RAISE EXCEPTION 'La suma de las OTs (%) no coincide con el monto solicitado (%)', v_alloc, v_total;
  END IF;

  -- Todas las OTs asignadas deben estar en estado 'Approved'; si alguna fue
  -- des-aprobada o rechazada después de haber sido asignada, se rechaza el envío.
  IF EXISTS (
    SELECT 1
    FROM public.fund_request_work_orders frwo
    JOIN public.work_orders wo ON wo.wo_id = frwo.wo_id
    WHERE frwo.fund_request_id = p_fund_request_id
      AND wo.approval_status IS DISTINCT FROM 'Approved'
  ) THEN
    RAISE EXCEPTION 'Una o más OTs asignadas ya no estan en estado Approved; no se puede enviar a aprobacion';
  END IF;

  -- FEAT 0602-135: el estado efectivo del encargo debe seguir admitiendo solicitudes
  -- (4 Aprobado / 5 Emergencia) al momento de ENVIAR. El trigger de INSERT ya bloquea
  -- asignaciones nuevas, pero una asignación creada mientras el encargo estaba activo y
  -- luego Congelado(9)/Finalizado(7)/Cancelado(6)/Rechazado(8) llegaría hasta aquí.
  IF EXISTS (
    SELECT 1
    FROM public.fund_request_work_orders frwo
    JOIN public.work_orders wo ON wo.wo_id = frwo.wo_id
    WHERE frwo.fund_request_id = p_fund_request_id
      AND NOT public.engagement_allows_hours_or_requests(wo.engagement_id)
  ) THEN
    RAISE EXCEPTION 'Una o más OTs pertenecen a un encargo que ya no admite solicitudes (congelado/finalizado/cancelado)';
  END IF;

  -- Reset de las OTs a 'pendiente' (en reenvío todas vuelven a requerir
  -- aprobación). Dispara el rollup, que puede mover la solicitud a
  -- 'pendiente_aprobacion'; el update siguiente fija submitted_at y limpia.
  -- Marca transaccional para que el guard `fr_wo_guard_approval_cols` permita
  -- el reset SOLO desde este RPC (un UPDATE directo por API no lleva el flag).
  PERFORM set_config('app.fr_submitting', 'on', true);

  UPDATE public.fund_request_work_orders
  SET approval_status = 'pendiente',
      manager_notes = NULL,
      rejection_reason = NULL,
      manager_decided_at = NULL
  WHERE fund_request_id = p_fund_request_id;

  UPDATE public.fund_requests
  SET status = 'pendiente_aprobacion',
      submitted_at = now(),
      rejection_reason = NULL,
      manager_notes = NULL
  WHERE fund_request_id = p_fund_request_id;
END;
$$;


--
--
-- Name: fund_requests_enforce_bob(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_requests_enforce_bob() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.currency IS DISTINCT FROM 'BOB' THEN
      RAISE EXCEPTION 'Las solicitudes de fondos se registran en BOB (recibido: %)', NEW.currency;
    END IF;
  -- En UPDATE solo se valida cuando la moneda CAMBIA: así una fila legacy en USD
  -- puede seguir aprobándose, desembolsándose, liquidándose y cerrándose.
  ELSIF NEW.currency IS DISTINCT FROM OLD.currency
        AND NEW.currency IS DISTINCT FROM 'BOB' THEN
    RAISE EXCEPTION 'No se puede cambiar la moneda de la solicitud a % (solo BOB)', NEW.currency;
  END IF;
  RETURN NEW;
END;
$$;


--
--
-- Name: fund_requests_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fund_requests_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
--
-- Name: get_all_user_roles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_user_roles() RETURNS TABLE(role_id uuid, user_id uuid, email text, role public.app_role, role_key text, staff_name text, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    ur.id AS role_id,
    ur.user_id,
    au.email::text,
    ur.role,
    ur.role_key,
    COALESCE(s.first_name || ' ' || s.last_name, NULL) AS staff_name,
    ur.created_at
  FROM user_roles ur
  JOIN auth.users au ON ur.user_id = au.id
  LEFT JOIN staff s ON s.auth_user_id = au.id
  WHERE public.has_permission('user_role.read')
  ORDER BY ur.created_at DESC;
$$;


--
--
-- Name: get_approvable_pairs(uuid[], uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_approvable_pairs(p_period_ids uuid[], p_engagement_ids uuid[]) RETURNS TABLE(period_id uuid, engagement_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_count integer;
  i integer;
begin
  v_count := array_length(p_period_ids, 1);
  if v_count is null or v_count <> coalesce(array_length(p_engagement_ids, 1), 0) then
    return;
  end if;

  for i in 1..v_count loop
    if public.can_approve_timesheet_line(auth.uid(), p_period_ids[i], p_engagement_ids[i]) then
      period_id := p_period_ids[i];
      engagement_id := p_engagement_ids[i];
      return next;
    end if;
  end loop;
end;
$$;


--
--
-- Name: get_engagement_team_candidates(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_engagement_team_candidates() RETURNS TABLE(staff_id uuid, display_name text, candidate_group text, practica_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT s.staff_id,
         (s.first_name || ' ' || s.last_name)::text AS display_name,
         -- Solo el ROL BASE de cada nivel (decisión de negocio 2026-08-17). Fuera:
         -- senior_partner, risk_partner, risk_supervisor, it_security_manager,
         -- accounting_*, hr_*, collections_analyst, sqr, assistant, viewer y admin.
         -- Este CASE está espejado en src/lib/engagementTeamCandidates.ts
         -- (ROLE_KEY_TO_GROUP); si se toca uno, tocar el otro.
         CASE ur.role_key
           WHEN 'partner'       THEN 'partner_director'
           WHEN 'director'      THEN 'partner_director'
           WHEN 'manager'       THEN 'manager'
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
     AND ur.role_key IN ('partner','director','manager','senior','semisenior',
                         'ita_manager','ita_senior','ita_assistant',
                         'tax_manager','tax_senior','tax_assistant')
   ORDER BY s.last_name, s.first_name;
$$;


--
--
-- Name: FUNCTION get_engagement_team_candidates(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_engagement_team_candidates() IS 'BUG 0722-162: candidatos elegibles por campo del bloque Equipo del encargo. Agrupa role_key en 5 grupos de candidatura (partner_director, manager, encargado, specialist_it, specialist_tax) y NO expone email, auth_user_id ni el role_key crudo. Gateada por engagement.create OR engagement.update, así que cubre creación y edición con un solo RPC.';


--
--
-- Name: get_line_approver(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_line_approver(p_staff_id uuid, p_engagement_id uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_engagement record;
begin
  if public.is_auto_approved_category(p_staff_id) then
    return null;
  end if;

  select manager_id, partner_id into v_engagement
  from engagements
  where engagement_id = p_engagement_id;

  return coalesce(v_engagement.manager_id, v_engagement.partner_id);
end;
$$;


--
--
-- Name: get_my_authorization_context(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_authorization_context() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'role_key', (select role_key from public.user_roles where user_id = auth.uid() limit 1),
    'permissions', coalesce((
      select jsonb_object_agg(rp.permission_key, rp.scope_key)
      from public.user_roles ur
      join public.authorization_role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = auth.uid()
    ), '{}'::jsonb)
  );
$$;


--
--
-- Name: get_my_pending_hours(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_pending_hours(p_staff_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_hire_date date;
  v_end_date date;
  v_capacity numeric;
  v_staff_city text;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_gap numeric;
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT s.hire_date, s.weekly_capacity_hours, s.termination_date, s.city
  INTO v_hire_date, v_capacity, v_end_date, v_staff_city
  FROM public.staff s WHERE s.staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_end_date := LEAST(COALESCE(v_end_date, CURRENT_DATE), CURRENT_DATE);
  v_daily := COALESCE(v_capacity, 40) / 5.0;

  -- Start from Monday of hire_date's week
  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= v_end_date LOOP
    v_week_end := v_cursor + 4;  -- Friday

    -- Skip current/incomplete week (ascending order, so EXIT is safe)
    IF v_week_end >= CURRENT_DATE THEN
      EXIT;
    END IF;

    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, v_end_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
    FROM public.holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
      AND (
        h.oficina = 0
        OR (h.oficina = 1 AND v_staff_city = 'La Paz')
        OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
      );

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM public.time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor,
          'expected_hours', v_expected,
          'actual_hours', v_actual,
          'gap', v_gap
        );
      END IF;
    END IF;

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;


--
--
-- Name: get_my_staff_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_staff_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT staff_id FROM staff WHERE auth_user_id = auth.uid()
$$;


--
--
-- Name: get_staff_assignment_segments(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date) RETURNS TABLE(engagement_id uuid, start_date date, end_date date)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_staff_id uuid := public.get_my_staff_id();
  v_is_self      boolean;
  v_is_firmwide  boolean;
  v_is_approver  boolean;
  v_authorized   boolean;
BEGIN
  IF p_staff_id IS NULL OR p_week_start IS NULL OR p_week_end IS NULL
     OR p_week_end < p_week_start
     OR (p_week_end - p_week_start) > 6              -- one timesheet week max
     OR EXTRACT(ISODOW FROM p_week_start) <> 1 THEN  -- canonical Monday only (D5-2 halo gate)
    RAISE EXCEPTION 'EA_SEGMENTS_INVALID_RANGE';
  END IF;

  v_is_self     := (v_caller_staff_id IS NOT NULL AND p_staff_id = v_caller_staff_id);   -- (1)
  v_is_firmwide := public.has_firmwide_assignment_visibility();                          -- (2)
  v_is_approver := EXISTS (                                                              -- (3)
    SELECT 1
    FROM public.get_timesheet_approvers(p_staff_id, p_week_start) g
    WHERE g.approver_staff_id = v_caller_staff_id
  );
  v_authorized := v_is_self OR v_is_firmwide OR v_is_approver;

  -- NULL-safe deny (Greptile r3607763303): anything that is not TRUE is denied.
  IF v_authorized IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'EA_SEGMENTS_DENIED';
  END IF;

  RETURN QUERY
  SELECT
    ea.engagement_id,
    GREATEST(ea.start_date, p_week_start)::date AS start_date,  -- clamp to the requested week:
    LEAST(ea.end_date,   p_week_end)::date      AS end_date     -- never disclose out-of-week endpoints
  FROM public.engagement_assignments ea
  WHERE ea.staff_id = p_staff_id
    AND ea.deleted_at IS NULL
    AND ea.start_date <= p_week_end       -- overlap probe; uses
    AND ea.end_date   >= p_week_start     -- idx_eng_assign_staff_dates_active
    AND (
          v_is_self
          OR v_is_firmwide
          -- Approver arm (minimum-necessary): return an engagement's window ONLY
          -- when the caller leads it AND the target logged POSITIVE hours on it
          -- inside the REQUESTED [p_week_start, p_week_end] interval — i.e. a cell
          -- the approver actually renders. Three guards, each closing a distinct
          -- escape:
          --   * is_engagement_team_member (== the time_entries team SELECT policy,
          --     migration 20260107032620:54-70) — bounds disclosure to engagements
          --     whose hours the approver already reads; excludes UNLED engagements.
          --   * date_worked <= p_week_end (the REQUESTED end, NOT +7 days) — with a
          --     Friday p_week_end a Sat/Sun entry must NOT authorize a Mon-Fri
          --     window; the evidence window equals the rendered interval
          --     (PR #223 rev.3 P1-01). Adapts automatically to 5- or 6-day config.
          --   * hours_logged > 0 — matches the UI's hours>0 flag, so a zero-hour
          --     row (schema allows CHECK hours_logged >= 0) can neither authorize
          --     nor return a window (PR #223 rev.3 P2-03).
          --   * is_forecast = false — the evidence must be ACTUAL logged time, the
          --     same set the whole authorization domain uses: submit_timesheet_safe
          --     (schema :1133/:1147/:1205), the self grid (useTimesheetWeek :126),
          --     and every dashboard read all filter is_forecast = false. A forecast
          --     PLAN is not logged work and must never disclose a segment boundary
          --     (PR #224 P1-01).
          --   * period_id IN (the timesheet_period for this staff+week) — binds the
          --     evidence to EXACTLY the rendered approval dataset, which the approval
          --     detail fetches with `.eq("period_id", periodId)`
          --     (useTimesheetApprovals :299). date_worked-in-week alone let an
          --     actual entry ORPHANED from the viewed period (in-week date, wrong/NULL
          --     period_id) disclose a segment for an engagement absent from the grid.
          --     The client passes the viewed period's week_start_date as p_week_start,
          --     so the canonical period here == the rendered period; a missing period
          --     yields no match (fail-closed) (PR #224 P1-01).
          -- get_timesheet_approvers stays the TOP-LEVEL staff-week eligibility gate
          -- (it may admit via a Sat/Sun, zero-hour, forecast, or wrong-period entry —
          -- that only decides whether the caller may ASK; the RETURN above discloses
          -- nothing beyond the rendered, positive-hours, actual, in-period cells).
          -- Excludes entry-less led engagements (rev.2 P1-01), out-of-interval / zero-
          -- hour rows (rev.3), and forecast / orphan-period rows (PR #224).
          OR (
               public.is_engagement_team_member(ea.engagement_id)
               AND EXISTS (
                 SELECT 1
                 FROM public.time_entries te
                 WHERE te.staff_id      = p_staff_id
                   AND te.engagement_id = ea.engagement_id
                   AND te.date_worked  >= p_week_start
                   AND te.date_worked  <= p_week_end     -- requested interval, not +7d (P1-01)
                   AND te.hours_logged  > 0              -- match UI hours>0 flag (P2-03)
                   AND te.is_forecast   = false          -- actuals only (PR #224 P1-01)
                   AND te.period_id IN (                 -- belongs to the rendered approval period
                     SELECT tp.period_id
                     FROM public.timesheet_periods tp
                     WHERE tp.staff_id = p_staff_id
                       AND tp.week_start_date = p_week_start
                   )
               )
             )
        )
  ORDER BY ea.engagement_id, ea.start_date;
END;
$$;


--
--
-- Name: FUNCTION get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_staff_assignment_segments(p_staff_id uuid, p_week_start date, p_week_end date) IS 'Phase 5 advisory: active assignment segments for one staff member across one timesheet week. Admit: self OR firmwide (admin/partner/director) OR eligible timesheet approver for (staff, week) per get_timesheet_approvers; deny raises EA_SEGMENTS_DENIED (never a silent empty result). RETURN scoped per-engagement for the approver arm to engagements the caller leads (is_engagement_team_member) AND on which the target logged POSITIVE, NON-FORECAST hours inside the REQUESTED [p_week_start, p_week_end] interval AND in the timesheet_period for (staff, p_week_start) — exactly the rendered approval-grid cells (which the detail fetches by period_id), nothing more — with endpoints clamped to the probed week for all arms; success + zero rows = authoritatively unassigned. Returns only (engagement_id, start_date, end_date). Span capped at 6 days; p_week_start must be the canonical Monday (ISODOW = 1).';


--
--
-- Name: get_staff_full(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_staff_full() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(fila order by fila->>'last_name'), '[]'::jsonb)
  from (
    select to_jsonb(s) || jsonb_build_object(
      'category',
        (select to_jsonb(c) from categories c where c.category_id = s.category_id),
      'staff_skills',
        (select coalesce(jsonb_agg(jsonb_build_object(
            'staff_skill_id',       ss.staff_skill_id,
            'skill_id',             ss.skill_id,
            'proficiency_level',    ss.proficiency_level,
            'last_evaluated_date',  ss.last_evaluated_date,
            'skill', (select jsonb_build_object(
                        'skill_id',  sk.skill_id,
                        'name',      sk.name,
                        'category',  sk.category,
                        'is_active', sk.is_active)
                      from skills sk where sk.skill_id = ss.skill_id)
          )), '[]'::jsonb)
         from staff_skills ss where ss.staff_id = s.staff_id)
    ) as fila
    from staff s
    -- El gate: sin staff.read no devuelve nada. Antes de esta migración,
    -- CUALQUIER usuario con ficha obtenía PII del personal activo por `select *`.
    where public.has_permission('staff.read')
  ) t;
$$;


--
--
-- Name: FUNCTION get_staff_full(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_staff_full() IS 'Personal con PII (documento, registro de auditor) para la pantalla de Personal y StaffForm. Gated por has_permission(''staff.read''). Reemplaza el select * directo, que exponía PII a cualquier usuario con ficha.';


--
--
-- Name: get_timesheet_approvers(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_timesheet_approvers(p_staff_id uuid, p_week_start date) RETURNS TABLE(approver_staff_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if public.is_auto_approved_category(p_staff_id) then
    return;
  end if;

  return query
  select distinct app.staff_id
  from (
    select e.manager_id as staff_id
    from time_entries te
    join engagements e on te.engagement_id = e.engagement_id
    where te.staff_id = p_staff_id
      and te.date_worked >= p_week_start
      and te.date_worked < p_week_start + interval '7 days'
      and e.manager_id is not null
    union
    select e.partner_id
    from time_entries te
    join engagements e on te.engagement_id = e.engagement_id
    where te.staff_id = p_staff_id
      and te.date_worked >= p_week_start
      and te.date_worked < p_week_start + interval '7 days'
      and e.partner_id is not null
  ) app
  join staff app_s on app_s.staff_id = app.staff_id
  join user_roles ur on ur.user_id = app_s.auth_user_id
  join authorization_role_permissions rp on rp.role_key = ur.role_key
  where rp.permission_key = 'timesheet_approval.approve';
end;
$$;


--
--
-- Name: get_week_statuses(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_week_statuses(p_staff_id uuid, p_start_date date, p_end_date date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_hire_date date;
  v_term_date date;
  v_capacity numeric;
  v_staff_city text;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_missing numeric;
  v_period_id uuid;
  v_submitted_at timestamptz;
  v_status text;
  v_is_current boolean;
  v_approval_total integer;
  v_approval_approved integer;
  v_approval_rejected integer;
  v_result jsonb := '[]'::jsonb;
  v_today date := CURRENT_DATE;
BEGIN
  -- Get staff info
  SELECT s.hire_date, s.termination_date, s.weekly_capacity_hours, s.city
  INTO v_hire_date, v_term_date, v_capacity, v_staff_city
  FROM public.staff s WHERE s.staff_id = p_staff_id;

  v_daily := COALESCE(v_capacity, 40) / 5.0;

  -- Start from Monday of p_start_date's week
  v_cursor := p_start_date - (EXTRACT(ISODOW FROM p_start_date)::int - 1);

  WHILE v_cursor <= p_end_date LOOP
    v_week_end := v_cursor + 4;  -- Friday

    -- Clamp to hire/termination boundaries
    v_eff_start := v_cursor;
    v_eff_end := v_week_end;

    IF v_hire_date IS NOT NULL AND v_eff_start < v_hire_date THEN
      v_eff_start := v_hire_date;
    END IF;
    IF v_term_date IS NOT NULL AND v_eff_end > v_term_date THEN
      v_eff_end := v_term_date;
    END IF;

    -- Skip weeks entirely outside employment
    IF v_hire_date IS NOT NULL AND v_week_end < v_hire_date THEN
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;
    IF v_term_date IS NOT NULL AND v_cursor > v_term_date THEN
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;

    -- Determine if current week
    v_is_current := (v_cursor <= v_today AND v_week_end >= v_today);

    -- CURRENT week (Amendment A2: return it, don't exit)
    IF v_is_current THEN
      -- Still compute hours for informational purposes
      SELECT COUNT(*) INTO v_working_days
      FROM generate_series(v_eff_start, LEAST(v_eff_end, v_today), '1 day'::interval) d
      WHERE EXTRACT(ISODOW FROM d) <= 5;

      SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
      FROM public.holidays h
      WHERE h.holiday_date BETWEEN v_eff_start AND LEAST(v_eff_end, v_today)
        AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
        AND (
          h.oficina = 0
          OR (h.oficina = 1 AND v_staff_city = 'La Paz')
          OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
        );

      v_working_days := v_working_days - v_holiday_count;
      v_expected := GREATEST(v_working_days, 0) * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM public.time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_result := v_result || jsonb_build_object(
        'week_start', v_cursor,
        'week_end', v_week_end,
        'status', 'CURRENT',
        'total_logged_hours', v_actual,
        'expected_hours', v_expected,
        'missing_hours', GREATEST(v_expected - v_actual, 0),
        'is_submitted', false,
        'is_current_week', true
      );
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;

    -- FUTURE weeks
    IF v_cursor > v_today THEN
      v_result := v_result || jsonb_build_object(
        'week_start', v_cursor,
        'week_end', v_week_end,
        'status', 'FUTURE',
        'total_logged_hours', 0,
        'expected_hours', 0,
        'missing_hours', 0,
        'is_submitted', false,
        'is_current_week', false
      );
      v_cursor := v_cursor + 7;
      CONTINUE;
    END IF;

    -- Past weeks: compute expected hours (holiday-aware)
    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(DISTINCT h.holiday_date) INTO v_holiday_count
    FROM public.holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5
      AND (
        h.oficina = 0
        OR (h.oficina = 1 AND v_staff_city = 'La Paz')
        OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
      );

    v_working_days := v_working_days - v_holiday_count;
    v_expected := GREATEST(v_working_days, 0) * v_daily;

    -- Sum actual logged hours
    SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
    FROM public.time_entries te
    WHERE te.staff_id = p_staff_id
      AND te.date_worked BETWEEN v_eff_start AND v_eff_end
      AND te.is_forecast = false;

    v_missing := GREATEST(v_expected - v_actual, 0);

    -- Look up timesheet_period
    SELECT tp.period_id, tp.submitted_at
    INTO v_period_id, v_submitted_at
    FROM public.timesheet_periods tp
    WHERE tp.staff_id = p_staff_id
      AND tp.week_start_date = v_cursor;

    -- Determine status
    IF v_period_id IS NULL THEN
      -- No period row
      IF v_actual > 0 THEN
        v_status := 'NOT_SUBMITTED';  -- Amendment A3
      ELSE
        v_status := 'NOT_LOGGED';
      END IF;
    ELSIF v_submitted_at IS NULL THEN
      v_status := 'DRAFT';
    ELSE
      -- Period submitted: check line approvals
      SELECT COUNT(*),
             COUNT(*) FILTER (WHERE tla.status = 'approved'),
             COUNT(*) FILTER (WHERE tla.status = 'rejected')
      INTO v_approval_total, v_approval_approved, v_approval_rejected
      FROM public.timesheet_line_approvals tla
      WHERE tla.period_id = v_period_id;

      IF v_approval_total = 0 THEN
        v_status := 'PENDING_APPROVAL';  -- Amendment A6
      ELSIF v_approval_approved = v_approval_total THEN
        v_status := 'APPROVED';
      ELSIF v_approval_rejected > 0 THEN
        v_status := 'REJECTED';
      ELSE
        v_status := 'PENDING_APPROVAL';
      END IF;
    END IF;

    v_result := v_result || jsonb_build_object(
      'week_start', v_cursor,
      'week_end', v_week_end,
      'status', v_status,
      'total_logged_hours', v_actual,
      'expected_hours', v_expected,
      'missing_hours', v_missing,
      'is_submitted', (v_submitted_at IS NOT NULL),
      'is_current_week', false
    );

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;


--
--
-- Name: guard_auth_lockout_settings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_auth_lockout_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.setting_key IN ('AUTH_MAX_FAILED_ATTEMPTS', 'AUTH_LOCKOUT_MINUTES')
     AND auth.uid() IS NOT NULL          -- not service_role / postgres
     AND NOT public.is_admin() THEN      -- not an administrator
    RAISE EXCEPTION 'FORBIDDEN: % can only be changed by an administrator', NEW.setting_key
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;


--
--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_role_count integer;
begin
  -- Guard de reentrada: si otra vía ya asignó el rol, no se toca.
  if exists (select 1 from public.user_roles where user_id = new.id) then
    return new;
  end if;

  select count(*) into v_role_count from public.user_roles;

  if v_role_count = 0 then
    -- Primer usuario = admin (bootstrap)
    insert into public.user_roles (user_id, role, role_key)
    values (new.id, 'admin', 'admin');
  else
    insert into public.user_roles (user_id, role, role_key)
    values (new.id, 'staff', 'assistant');
  end if;

  return new;
end;
$$;


--
--
-- Name: has_assignment_on_engagement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_assignment_on_engagement(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM engagement_assignments ea WHERE ea.engagement_id = p_engagement_id AND ea.staff_id = get_my_staff_id() AND ea.deleted_at IS NULL)
$$;


--
--
-- Name: has_firmwide_assignment_visibility(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_firmwide_assignment_visibility() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role_key IN ('admin', 'senior_partner', 'partner', 'director')
  )
$$;


--
--
-- Name: has_permission(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_permission(p_permission_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    join public.authorization_role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = auth.uid()
      and rp.permission_key = p_permission_key
  );
$$;


--
--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--
--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;


--
--
-- Name: is_assigned_to_client(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_assigned_to_client(p_client_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Cliente asignado = tengo >=1 encargo (en cualquier estado) donde soy
  -- partner/manager/sqr/encargado. Simétrico con is_assigned_to_engagement.
  select exists (
    select 1 from engagements e
    where e.client_id = p_client_id
      and get_my_staff_id() in (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id)
  )
$$;


--
--
-- Name: FUNCTION is_assigned_to_client(p_client_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_assigned_to_client(p_client_id uuid) IS 'True si el usuario actual está asignado (partner/manager/sqr/encargado) a algún encargo de este cliente, sin importar el estado del encargo. Simétrica con is_assigned_to_engagement: si ves el encargo, ves su cliente.';


--
--
-- Name: is_assigned_to_engagement(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_assigned_to_engagement(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from engagements e
    where e.engagement_id = p_engagement_id
      and get_my_staff_id() in (e.partner_id, e.manager_id, e.sqr_id, e.encargado_id)
  )
$$;


--
--
-- Name: is_auto_approved_category(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_auto_approved_category(p_staff_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from staff s
    join user_roles ur on ur.user_id = s.auth_user_id
    join authorization_role_permissions rp on rp.role_key = ur.role_key
    where s.staff_id = p_staff_id
      and rp.permission_key = 'timesheet.self_approve'
  )
$$;


--
--
-- Name: is_engagement_responsible(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_engagement_responsible(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagements e
    WHERE e.engagement_id = p_engagement_id
      AND public.get_my_staff_id() IN (e.manager_id, e.partner_id,
                                        e.sqr_id, e.encargado_id,
                                        e.specialist_it_id, e.specialist_tax_id)
  )
$$;


--
--
-- Name: is_engagement_team_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_engagement_team_member(p_engagement_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM engagements e
    WHERE e.engagement_id = p_engagement_id
    AND (
      e.manager_id = get_my_staff_id() 
      OR e.partner_id = get_my_staff_id()
    )
  )
$$;


--
--
-- Name: link_auth_user_to_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_auth_user_to_staff() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.staff
  SET auth_user_id = NEW.id,
      is_active = true,
      updated_at = now()
  WHERE lower(trim(email)) = lower(trim(NEW.email))
    AND auth_user_id IS NULL
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;


--
--
-- Name: link_staff_to_auth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_staff_to_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_auth_user_id UUID;
BEGIN
  -- Guard: skip soft-deleted staff records
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NOT NULL AND NEW.auth_user_id IS NULL THEN
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim(NEW.email))
    LIMIT 1;

    IF v_auth_user_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.staff
        WHERE auth_user_id = v_auth_user_id
          AND staff_id != NEW.staff_id
          AND deleted_at IS NULL
      ) THEN
        NEW.auth_user_id := v_auth_user_id;
        NEW.is_active := true;  -- Auto-activate on link
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: move_category(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_category(p_category_id uuid, p_new_position integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica_id uuid;
  v_old_pos    integer;
  v_total      integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  SELECT practica_id, display_order
    INTO v_practica_id, v_old_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.categories
   WHERE practica_id = v_practica_id;

  IF p_new_position < 1 OR p_new_position > v_total THEN
    RAISE EXCEPTION 'Position % out of range (1-%)', p_new_position, v_total;
  END IF;

  IF p_new_position = v_old_pos THEN
    RETURN;
  END IF;

  IF p_new_position < v_old_pos THEN
    UPDATE public.categories
       SET display_order = display_order + 1
     WHERE practica_id = v_practica_id
       AND display_order >= p_new_position
       AND display_order <  v_old_pos;
  ELSE
    UPDATE public.categories
       SET display_order = display_order - 1
     WHERE practica_id = v_practica_id
       AND display_order >  v_old_pos
       AND display_order <= p_new_position;
  END IF;

  UPDATE public.categories
     SET display_order = p_new_position
   WHERE category_id = p_category_id;
END;
$$;


--
--
-- Name: permission_scope(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.permission_scope(p_permission_key text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select rp.scope_key
  from public.user_roles ur
  join public.authorization_role_permissions rp on rp.role_key = ur.role_key
  where ur.user_id = auth.uid()
    and rp.permission_key = p_permission_key
  limit 1;
$$;


--
--
-- Name: prevent_imported_timer_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_imported_timer_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.is_imported = true THEN
    RAISE EXCEPTION 'Cannot delete imported timer entry (timer_id: %)', OLD.timer_id;
  END IF;
  RETURN OLD;
END;
$$;


--
--
-- Name: prevent_self_blocked_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_self_blocked_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Reject only a genuine change to the flag that did NOT come from a trusted
  -- lockout function. Those functions (record_failed_login /
  -- reset_login_attempts / admin_unblock_account) set this transaction-local
  -- flag before touching the row. This indirection is required because
  -- reset_login_attempts runs with the *user's own JWT* (so secure-signin can
  -- enforce its jwt-email guard on a successful login), which auth.uid() alone
  -- cannot tell apart from a self-service UPDATE. A direct PostgREST UPDATE on
  -- the staff table cannot set the flag, so self-service tampering is rejected
  -- while the auto-unlock-on-login path keeps working.
  IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     AND current_setting('app.allow_blocked_change', true) IS DISTINCT FROM 'on'
     AND auth.uid() IS NOT NULL          -- not service_role / postgres (edge fns, Studio)
     AND NOT public.is_admin() THEN      -- not an administrator
    RAISE EXCEPTION 'FORBIDDEN: is_blocked can only be changed by an administrator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;


--
--
-- Name: prevent_staff_reactivation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_staff_reactivation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Reactivation block intentionally removed for BUG 0526-123.
  -- (Previously raised REACTIVATION_BLOCKED on the OLD.is_active=false ->
  --  NEW.is_active=true transition when termination_date or deleted_at
  --  was set. Admins must now be able to reactivate to regularize
  --  prior-period timesheets.)

  -- termination_date immutability — protects audit evidence on inactive
  -- rows (0511-109/110) AND prevents clearing the date as part of the
  -- reactivation flow (0526-123 criterion 2: reactivation must preserve
  -- the date so trg_enforce_termination_date on time_entries keeps
  -- blocking post-exit hour entries).
  --
  -- The only case where clearing termination_date is allowed is on a
  -- row that was already active and stays active (TD-4 cleanup path):
  -- an admin may fix a stray/erroneous date on a still-active employee.
  IF OLD.termination_date IS NOT NULL
     AND NEW.termination_date IS NULL
     AND NOT (OLD.is_active = true AND NEW.is_active = true) THEN
    RAISE EXCEPTION 'TERMINATION_DATE_IMMUTABLE: Cannot clear termination_date except on an already-active staff row.';
  END IF;

  -- Soft-deleted rows cannot be reactivated. The 0526-123 policy change
  -- only lifted the block for rows that were terminated but NOT deleted.
  IF OLD.deleted_at IS NOT NULL
     AND OLD.is_active = false
     AND NEW.is_active = true THEN
    RAISE EXCEPTION 'REACTIVATION_BLOCKED: Cannot reactivate a soft-deleted staff row. Create a new record instead.';
  END IF;

  -- deleted_at is never reversible. Soft-deletes are one-way regardless
  -- of is_active state (aligned with the errors.deletedAtImmutable toast:
  -- "create a new record instead").
  IF OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'DELETED_AT_IMMUTABLE: Cannot clear deleted_at on a staff row. Soft-deleted records cannot be restored; create a new record instead.';
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: protect_approved_time_entries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_approved_time_entries() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  old_period     uuid;
  old_engagement uuid;
  old_activity   uuid;
  new_period     uuid;
  new_engagement uuid;
  new_activity   uuid;
BEGIN
  -- ── DELETE ──────────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    old_period     := OLD.period_id;
    old_engagement := OLD.engagement_id;
    old_activity   := OLD.activity_id;

    IF old_period IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals tla
      WHERE tla.period_id    = old_period
        AND tla.engagement_id = old_engagement
        AND tla.activity_id   = old_activity
        AND tla.status        = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot delete time entries on an approved line';
    END IF;
    RETURN OLD;
  END IF;

  -- ── INSERT ──────────────────────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    new_period     := NEW.period_id;
    new_engagement := NEW.engagement_id;
    new_activity   := NEW.activity_id;

    IF new_period IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.timesheet_line_approvals tla
      WHERE tla.period_id    = new_period
        AND tla.engagement_id = new_engagement
        AND tla.activity_id   = new_activity
        AND tla.status        = 'approved'
    ) THEN
      RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot insert time entries into an approved line';
    END IF;
    RETURN NEW;
  END IF;

  -- ── UPDATE ──────────────────────────────────────────────────────────
  old_period     := OLD.period_id;
  old_engagement := OLD.engagement_id;
  old_activity   := OLD.activity_id;
  new_period     := COALESCE(NEW.period_id,    OLD.period_id);
  new_engagement := COALESCE(NEW.engagement_id, OLD.engagement_id);
  new_activity   := COALESCE(NEW.activity_id,  OLD.activity_id);

  IF old_period IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timesheet_line_approvals tla
    WHERE tla.period_id    = old_period
      AND tla.engagement_id = old_engagement
      AND tla.activity_id   = old_activity
      AND tla.status        = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot modify time entries on an approved line';
  END IF;

  IF new_period IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timesheet_line_approvals tla
    WHERE tla.period_id    = new_period
      AND tla.engagement_id = new_engagement
      AND tla.activity_id   = new_activity
      AND tla.status        = 'approved'
  ) THEN
    RAISE EXCEPTION 'APPROVED_LINE_LOCKED: Cannot move time entries into an approved line';
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: reactivate_practice_activity(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivate_practice_activity(p_activity_id uuid) RETURNS public.activity_codes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_practica_id   uuid;
  v_entity_type  text;
  v_abbrev       text;
  v_old_code     text;
  v_max_ordinal  integer;
  v_code         text;
  v_row          public.activity_codes;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock and fetch the target (and its practice row) atomically.
  SELECT ac.practica_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_practica_id, v_entity_type, v_old_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.practicas s USING (practica_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = false AND ac.is_system = false
   FOR UPDATE OF ac, s;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found, already active, or not practice-linked';
  END IF;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Practice has no abbreviation';
  END IF;

  -- Highest existing ordinal among active, ordinal-scheme activities for
  -- this (practice, entity_type) pair — same MAX-based derivation as
  -- create_practice_activity, so a code assigned before this guard existed
  -- can never collide with the one generated here.
  SELECT COALESCE(MAX(substring(activity_code FROM '[0-9]+$')::int), 0) INTO v_max_ordinal
    FROM public.activity_codes
   WHERE practica_id  = v_practica_id
     AND entity_type = v_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$');

  -- No hard cap: 1–9 is a UI recommendation only.
  v_code := v_abbrev || '-' || v_entity_type || (v_max_ordinal + 1)::text;

  UPDATE public.activity_codes
     SET is_active = true,
         activity_code = v_code
   WHERE activity_id = p_activity_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$_$;


--
--
-- Name: recompute_engagement_finalization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_engagement_finalization() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Recalcular si cambia end_date O el override. (Codex P2: limpiar/cambiar el override de un
  -- encargo cuya fecha fin ya pasó debía re-evaluar la finalización, no esperar al cron.)
  IF TG_OP = 'UPDATE'
     AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date
     AND NEW.engagement_state_override IS NOT DISTINCT FROM OLD.engagement_state_override THEN
    RETURN NEW;
  END IF;

  -- (a) Forward → Finalizado
  IF NEW.end_date IS NOT NULL
     AND NEW.end_date < (now() AT TIME ZONE 'America/La_Paz')::date
     AND public.engagement_is_approved_state(NEW.engagement_id, NEW.engagement_state_override, NEW.work_order_required)
  THEN
    NEW.engagement_state_override := 7;  -- Finalizado
    RETURN NEW;
  END IF;

  -- (b) Reapertura → Aprobado (solo Admin, y solo si el estado sigue marcado Finalizado)
  IF TG_OP = 'UPDATE'
     AND OLD.engagement_state_override = 7
     AND NEW.engagement_state_override = 7
     AND (NEW.end_date IS NULL OR NEW.end_date >= (now() AT TIME ZONE 'America/La_Paz')::date)
     AND public.is_admin()
  THEN
    IF public.engagement_is_approved_state(NEW.engagement_id, NULL, NEW.work_order_required) THEN
      NEW.engagement_state_override := NULL;  -- vínculo con la OT (derivado = Aprobado)
    ELSE
      NEW.engagement_state_override := 4;     -- fijar Aprobado
    END IF;
  END IF;

  -- (c) Reactivar el `status` legacy al SALIR de un estado terminal legacy-mapeado (override 6/7).
  -- El backfill dejó status='cancelled'/'completed' en las filas que mapeó a override 6/7. Al reabrir
  -- (override final → NULL o 1..5, sea por extensión de fecha (b) o por cambio manual del Admin), esos
  -- encargos seguirían excluidos por el gate `status='active'` de los selectores operativos
  -- (timesheet/manual-entry/dashboard), quedando invisibles/inusables. Se evalúa con el override FINAL
  -- porque este trigger corre último; si (a) forward-finalize ya hizo RETURN, no llega aquí (correcto).
  IF TG_OP = 'UPDATE'
     AND OLD.engagement_state_override IN (6, 7)
     AND (NEW.engagement_state_override IS NULL OR NEW.engagement_state_override BETWEEN 1 AND 5)
     AND NEW.status IS DISTINCT FROM 'active'
  THEN
    NEW.status := 'active';
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: record_failed_login(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_failed_login(p_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_email        text        := lower(trim(p_email));
  v_max          integer;
  v_lockout      interval;
  v_reset        interval    := interval '15 minutes';
  v_now          timestamptz := now();
  v_existing     public.auth_login_attempts%ROWTYPE;
  v_new_count    integer;
  v_locked_until timestamptz;
  v_remaining    integer;
  v_raw          text;
BEGIN
  -- Read configurable thresholds with defensive parsing.
  -- Regex guard (^[1-9][0-9]*$) ensures the value is a positive integer, and
  -- the numeric upper-bound guard rejects values that would overflow the
  -- ::integer cast (and, for the interval, blow past a sane maximum). Any
  -- non-numeric, zero, or out-of-range value falls back to the original
  -- hardcoded default so a bad setting can never disable lockout.

  SELECT setting_value INTO v_raw
  FROM public.global_settings
  WHERE setting_key = 'AUTH_MAX_FAILED_ATTEMPTS'
  LIMIT 1;
  IF v_raw ~ '^[1-9][0-9]*$' AND v_raw::numeric <= 1000 THEN
    v_max := v_raw::integer;
  ELSE
    v_max := 5;
  END IF;

  SELECT setting_value INTO v_raw
  FROM public.global_settings
  WHERE setting_key = 'AUTH_LOCKOUT_MINUTES'
  LIMIT 1;
  -- 525600 minutes = 1 year; a generous ceiling that stays well within int range.
  IF v_raw ~ '^[1-9][0-9]*$' AND v_raw::numeric <= 525600 THEN
    v_lockout := make_interval(mins => v_raw::integer);
  ELSE
    v_lockout := interval '15 minutes';
  END IF;

  -- Atomic upsert so two parallel first-failures don't race on the PK.
  INSERT INTO public.auth_login_attempts (email_normalized, attempts_count, last_attempt_at)
  VALUES (v_email, 0, v_now)
  ON CONFLICT (email_normalized) DO NOTHING;

  SELECT * INTO v_existing
  FROM public.auth_login_attempts
  WHERE email_normalized = v_email
  FOR UPDATE;

  -- Already locked and still in force: report remaining time, don't bump.
  IF v_existing.locked_until IS NOT NULL AND v_existing.locked_until > v_now THEN
    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_existing.locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  -- Inactivity reset: if last failure is older than v_reset, start over at 1.
  IF v_existing.last_attempt_at < (v_now - v_reset) THEN
    v_new_count := 1;
  ELSE
    v_new_count := v_existing.attempts_count + 1;
  END IF;

  IF v_new_count >= v_max THEN
    v_locked_until := v_now + v_lockout;
  ELSE
    v_locked_until := NULL;
  END IF;

  UPDATE public.auth_login_attempts
  SET attempts_count  = v_new_count,
      last_attempt_at = v_now,
      locked_until    = v_locked_until
  WHERE email_normalized = v_email;

  -- BUG 0601-132: propagate is_blocked to the staff row.
  IF v_locked_until IS NOT NULL THEN
    BEGIN
      PERFORM set_config('app.allow_blocked_change', 'on', true);
      UPDATE public.staff
      SET is_blocked = true
      WHERE lower(trim(email)) = v_email
        AND is_blocked = false;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[0601-132] record_failed_login: could not set staff.is_blocked: %', SQLERRM;
    END;

    v_remaining := GREATEST(0, EXTRACT(EPOCH FROM (v_locked_until - v_now))::integer);
    RETURN jsonb_build_object('locked', true, 'remaining_seconds', v_remaining);
  END IF;

  -- BUG 0625-146: include attempts_remaining so the caller can surface the
  -- countdown to the user without a separate query.
  RETURN jsonb_build_object(
    'locked', false,
    'remaining_seconds', 0,
    'attempts_remaining', GREATEST(0, v_max - v_new_count)
  );
END;
$_$;


--
--
-- Name: reorder_practice_activity(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_practice_activity(p_activity_id uuid, p_new_position integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_practica_id  uuid;
  v_entity_type text;
  v_abbrev      text;
  v_code        text;
  v_total       integer;
  v_ids         uuid[];
  i             integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Fetch and lock the target activity (and its practice row) atomically.
  SELECT ac.practica_id, ac.entity_type, ac.activity_code, s.abbreviation
    INTO v_practica_id, v_entity_type, v_code, v_abbrev
    FROM public.activity_codes ac
    JOIN public.practicas s USING (practica_id)
   WHERE ac.activity_id = p_activity_id AND ac.is_active = true AND ac.is_system = false
   FOR UPDATE OF ac, s;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Activity not found or not an active practice-linked activity';
  END IF;

  IF v_abbrev IS NULL THEN
    RAISE EXCEPTION 'Practice has no abbreviation';
  END IF;

  -- Lock every active, ordinal-scheme sibling of this (practice, entity_type)
  -- before reading the ordered set (FOR UPDATE cannot be combined with
  -- array_agg). Legacy siblings are excluded so they're never renumbered.
  PERFORM 1
    FROM public.activity_codes
   WHERE practica_id  = v_practica_id
     AND entity_type = v_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$')
   FOR UPDATE;

  SELECT array_agg(activity_id ORDER BY substring(activity_code FROM '[0-9]+$')::int)
    INTO v_ids
    FROM public.activity_codes
   WHERE practica_id  = v_practica_id
     AND entity_type = v_entity_type
     AND is_active   = true
     AND activity_code ~ ('^' || v_abbrev || '-' || v_entity_type || '[0-9]+$');

  v_total := array_length(v_ids, 1);

  IF p_new_position < 1 OR p_new_position > v_total THEN
    RAISE EXCEPTION 'Position % out of range (1-%)', p_new_position, v_total;
  END IF;

  -- Remove the target, then reinsert it at the requested 1-based position.
  v_ids := array_remove(v_ids, p_activity_id);
  v_ids := v_ids[1:p_new_position - 1]
           || ARRAY[p_activity_id]
           || v_ids[p_new_position:array_length(v_ids, 1)];

  -- PHASE 1: temporary codes A{v_total+1}..A{2*v_total}. Always greater than any
  -- current final code (A1..A{v_total}), so they never collide — for any count.
  FOR i IN 1..v_total LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || (v_total + i)::text
     WHERE activity_id = v_ids[i];
  END LOOP;

  -- PHASE 2: final codes A1..A{v_total} in the desired order.
  FOR i IN 1..v_total LOOP
    UPDATE public.activity_codes
       SET activity_code = v_abbrev || '-' || v_entity_type || i::text
     WHERE activity_id = v_ids[i];
  END LOOP;
END;
$_$;


--
--
-- Name: reset_login_attempts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_login_attempts(p_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email     text := lower(trim(p_email));
  v_jwt_email text := lower(trim(coalesce((auth.jwt() ->> 'email'), '')));
BEGIN
  -- When a JWT is present (authenticated user), the email must match.
  -- When no JWT is present (postgres / service_role from Studio), allow.
  IF auth.jwt() IS NOT NULL AND v_jwt_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'RESET_FORBIDDEN: caller email mismatch';
  END IF;

  DELETE FROM public.auth_login_attempts
  WHERE email_normalized = v_email;

  -- BUG 0601-132: clear the admin-visible blocked flag at the same time.
  -- This covers the auto-unlock path: 15 min pass → user logs in
  -- successfully → secure-signin calls this RPC (with the user's own JWT) →
  -- admin switch goes to OFF. The transaction-local flag authorizes the write
  -- past prevent_self_blocked_change(), which otherwise can't distinguish this
  -- trusted reset from a self-service UPDATE (both carry the user's JWT).
  BEGIN
    PERFORM set_config('app.allow_blocked_change', 'on', true);
    UPDATE public.staff
    SET is_blocked = false
    WHERE lower(trim(email)) = v_email
      AND is_blocked = true;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[0601-132] reset_login_attempts: could not clear staff.is_blocked: %', SQLERRM;
  END;
END;
$$;


--
--
-- Name: reset_timer_import_on_unlink(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_timer_import_on_unlink() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.imported_to_time_id IS NULL AND OLD.imported_to_time_id IS NOT NULL THEN
    NEW.is_imported := false;
  END IF;
  RETURN NEW;
END;
$$;


--
--
-- Name: resolve_wo_engagement_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_wo_engagement_id(p_wo_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT wo.engagement_id FROM public.work_orders wo WHERE wo.wo_id = p_wo_id
$$;


--
--
-- Name: resolve_wo_req_skill_engagement_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_wo_req_skill_engagement_id(p_requirement_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT wo.engagement_id
    FROM public.wo_staffing_requirements r
    JOIN public.work_orders wo ON wo.wo_id = r.wo_id
   WHERE r.id = p_requirement_id
$$;


--
--
-- Name: save_engagement_assignments(uuid, jsonb, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_engagement_assignments(p_engagement_id uuid, p_upserts jsonb, p_deleted_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_state_override smallint;
  v_practica        smallint;
  v_eng_start       date;
  v_eng_end         date;
  v_practica_id      uuid;
  v_cat_practica     uuid;
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
    SELECT practica_id INTO v_practica_id FROM public.practicas WHERE code = v_practica;
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

    IF v_practica_id IS NOT NULL THEN
      SELECT practica_id INTO v_cat_practica FROM public.categories WHERE category_id = v_category_id;
      IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
        RAISE EXCEPTION 'EAS_CATEGORY_FOREIGN_PRACTICE'
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


--
--
-- Name: save_wo_staffing(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_wo_staffing(p_wo_id uuid, p_requirements jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_engagement_id uuid;
  v_status        text;
  v_practica      smallint;
  v_practica_id    uuid;
  v_cat_practica   uuid;
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
    SELECT practica_id INTO v_practica_id FROM public.practicas WHERE code = v_practica;
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

    IF v_practica_id IS NOT NULL THEN
      SELECT practica_id INTO v_cat_practica FROM public.categories WHERE category_id = v_category_id;
      IF v_cat_practica IS DISTINCT FROM v_practica_id THEN
        RAISE EXCEPTION 'WOS_CATEGORY_FOREIGN_PRACTICE'
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


--
--
-- Name: set_authz_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_authz_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


--
--
-- Name: set_client_created_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_client_created_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.created_by_staff_id := get_my_staff_id();
  else
    new.created_by_staff_id := old.created_by_staff_id;
  end if;
  return new;
end;
$$;


--
--
-- Name: set_engagement_created_by(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_engagement_created_by() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.created_by_staff_id := get_my_staff_id();
  else
    new.created_by_staff_id := old.created_by_staff_id;
  end if;
  return new;
end;
$$;


--
--
-- Name: set_fund_request_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_fund_request_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.request_number IS NULL THEN
    NEW.request_number := 'FR-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.fund_request_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;


--
--
-- Name: staff_id_number_conflict(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.staff_id_number_conflict(p_id_number text, p_exclude_staff_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_first text;
  v_last  text;
begin
  if not (public.has_permission('staff.create') or public.has_permission('staff.update')) then
    raise exception 'Permission denied: staff.create or staff.update required'
      using errcode = 'insufficient_privilege';
  end if;

  if p_id_number is null or btrim(p_id_number) = '' then
    return jsonb_build_object('conflict', false);
  end if;

  select first_name, last_name into v_first, v_last
  from staff
  where id_number = btrim(p_id_number)
    and deleted_at is null
    and (p_exclude_staff_id is null or staff_id <> p_exclude_staff_id)
  limit 1;

  if v_first is null then
    return jsonb_build_object('conflict', false);
  end if;

  return jsonb_build_object('conflict', true, 'first_name', v_first, 'last_name', v_last);
end;
$$;


--
--
-- Name: start_timer_entry(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_timer_entry(p_engagement_id uuid, p_activity_id uuid, p_description text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id uuid;
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  SELECT staff_id INTO v_staff_id
  FROM staff WHERE auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record linked to current user';
  END IF;

  SELECT timer_id INTO v_existing_id
  FROM timer_entries
  WHERE staff_id = v_staff_id AND ended_at IS NULL;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'RUNNING_TIMER_EXISTS:%', v_existing_id;
  END IF;

  INSERT INTO timer_entries (staff_id, engagement_id, activity_id, description, started_at)
  VALUES (v_staff_id, p_engagement_id, p_activity_id, p_description, now())
  RETURNING timer_id INTO v_new_id;

  RETURN v_new_id;
END;
$$;


--
--
-- Name: stop_timer_entry(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stop_timer_entry(p_timer_id uuid, p_ended_at timestamp with time zone DEFAULT now()) RETURNS TABLE(timer_id uuid, duration_minutes integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id uuid;
  v_started_at timestamptz;
  v_clamped_end timestamptz;
  v_raw_minutes numeric;
  v_duration integer;
BEGIN
  SELECT s.staff_id INTO v_staff_id
  FROM staff s WHERE s.auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record linked to current user';
  END IF;

  SELECT te.started_at INTO v_started_at
  FROM timer_entries te
  WHERE te.timer_id = p_timer_id
    AND te.staff_id = v_staff_id
    AND te.ended_at IS NULL;

  IF v_started_at IS NULL THEN
    RAISE EXCEPTION 'Timer not found, not yours, or already stopped';
  END IF;

  v_clamped_end := LEAST(p_ended_at, v_started_at + interval '8 hours');
  v_raw_minutes := EXTRACT(EPOCH FROM (v_clamped_end - v_started_at)) / 60;
  v_duration := LEAST(480, GREATEST(5, ROUND(v_raw_minutes / 5.0) * 5));

  UPDATE timer_entries te
  SET ended_at = v_clamped_end,
      duration_minutes = v_duration
  WHERE te.timer_id = p_timer_id;

  RETURN QUERY SELECT p_timer_id, v_duration;
END;
$$;


--
--
-- Name: submit_timesheet_safe(uuid, uuid, uuid[], uuid[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_timesheet_safe(p_period_id uuid, p_staff_id uuid, p_engagement_ids uuid[], p_activity_ids uuid[], p_is_auto_approved boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_period                    RECORD;
  v_existing                  RECORD;
  v_max_te_updated            timestamptz;
  v_affected                  integer;
  v_pair_count                integer;
  i                           integer;
  v_eng_id                    uuid;
  v_act_id                    uuid;

  -- Per-engagement approval policy (BUG 0220-61)
  v_skip_approval             boolean;
  v_effective_auto            boolean;
  v_upgraded_to_approved      integer := 0;

  v_preserved_approved        integer := 0;
  v_reset_to_pending          integer := 0;
  v_kept_rejected             integer := 0;
  v_new_pending                integer := 0;
  v_new_auto_approved         integer := 0;
  v_guarded_update_skips      integer := 0;

  -- Min/max validation (BUG 0213-36)
  v_weekly_min                numeric;
  v_weekly_max                numeric;
  v_actual_hours              numeric;

  -- BUG 0306-74: Partial week proration
  v_hire_date                 date;
  v_term_date                 date;
  v_week_start                date;
  v_week_end                  date;
  v_eff_start                 date;
  v_eff_end                   date;
  v_total_workdays            integer;
  v_workable_days             integer;
  v_work_days_setting         integer;

  -- BUG 0526-122: Holiday engagement dynamic approval
  v_holiday_engagement_id     uuid;
  v_staff_city                text;
BEGIN
  -- 1. VALIDATE: Arrays must be same length and non-empty
  v_pair_count := array_length(p_engagement_ids, 1);
  IF v_pair_count IS NULL OR v_pair_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_ENGAGEMENTS: No valid engagement/activity pairs after sanitization';
  END IF;
  IF COALESCE(array_length(p_activity_ids, 1), 0) <> v_pair_count THEN
    RAISE EXCEPTION 'ARRAY_LENGTH_MISMATCH: p_engagement_ids and p_activity_ids must be the same length';
  END IF;

  -- 2. LOCK: Acquire row-level lock on period
  SELECT period_id, staff_id, submitted_at
  INTO v_period
  FROM timesheet_periods
  WHERE period_id = p_period_id AND staff_id = p_staff_id
  FOR UPDATE;

  IF v_period IS NULL THEN
    RAISE EXCEPTION 'PERIOD_NOT_FOUND: Period % does not exist or does not belong to staff %', p_period_id, p_staff_id;
  END IF;

  -- BUG 0526-122: Resolve the holiday engagement and this staff's office once,
  -- used by the per-pair loop below to override its approval policy.
  SELECT NULLIF(TRIM(setting_value), '')::uuid INTO v_holiday_engagement_id
  FROM global_settings WHERE setting_key = 'HOLIDAY_ENGAGEMENT_ID';

  SELECT city INTO v_staff_city FROM staff WHERE staff_id = p_staff_id;

  -- BUG 0213-36: Enforce weekly min/max (period-scoped)
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MIN'), 40
  ) INTO v_weekly_min;

  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MAX'), 40
  ) INTO v_weekly_max;

  -- BUG 0306-74: Prorate weekly limits for partial weeks (hire/termination only)
  -- BUG 0402-XX: Holidays are NOT subtracted — staff must log 8h on holiday engagement
  SELECT s.hire_date, s.termination_date INTO v_hire_date, v_term_date FROM staff s WHERE s.staff_id = p_staff_id;
  SELECT tp.week_start_date INTO v_week_start FROM timesheet_periods tp WHERE tp.period_id = p_period_id;
  SELECT COALESCE((SELECT setting_value::int FROM global_settings WHERE setting_key = 'TS_WORK_DAYS'), 5) INTO v_work_days_setting;
  v_week_end := v_week_start + (v_work_days_setting - 1);

  SELECT COUNT(*) INTO v_total_workdays
  FROM generate_series(v_week_start, v_week_end, '1 day'::interval) d
  WHERE EXTRACT(ISODOW FROM d) <= v_work_days_setting;

  v_eff_start := v_week_start;
  v_eff_end   := v_week_end;
  IF v_hire_date IS NOT NULL AND v_eff_start < v_hire_date THEN v_eff_start := v_hire_date; END IF;
  IF v_term_date IS NOT NULL AND v_eff_end   > v_term_date THEN v_eff_end   := v_term_date; END IF;

  SELECT COUNT(*) INTO v_workable_days
  FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
  WHERE EXTRACT(ISODOW FROM d) <= v_work_days_setting;

  IF v_total_workdays > 0 AND v_workable_days < v_total_workdays THEN
    v_weekly_min := ROUND(v_weekly_min * v_workable_days::numeric / v_total_workdays::numeric, 1);
    v_weekly_max := ROUND(v_weekly_max * v_workable_days::numeric / v_total_workdays::numeric, 1);
  END IF;

  SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual_hours
  FROM time_entries te
  WHERE te.period_id   = p_period_id
    AND te.staff_id    = p_staff_id
    AND te.is_forecast = false;

  IF v_actual_hours < v_weekly_min THEN
    RAISE EXCEPTION 'WEEKLY_MIN_NOT_MET:actual=%,min=%', v_actual_hours, v_weekly_min;
  END IF;

  IF v_actual_hours > v_weekly_max THEN
    RAISE EXCEPTION 'WEEKLY_MAX_EXCEEDED:actual=%,max=%', v_actual_hours, v_weekly_max;
  END IF;

  -- BUG 0220-63: Reject submission if any entry violates engagement date window
  IF EXISTS (
    SELECT 1
    FROM time_entries te
    JOIN engagements e ON te.engagement_id = e.engagement_id
    WHERE te.period_id   = p_period_id
      AND te.staff_id    = p_staff_id
      AND te.is_forecast = false
      AND (
        (e.start_date IS NOT NULL AND te.date_worked < e.start_date)
        OR (e.end_date IS NOT NULL AND te.date_worked > e.end_date)
      )
  ) THEN
    RAISE EXCEPTION 'ENGAGEMENT_DATE_RANGE_VIOLATION: Period contains entries outside engagement date range';
  END IF;

  -- 3. UPDATE PERIOD: Set submitted_at
  UPDATE timesheet_periods
  SET submitted_at = now()
  WHERE period_id = p_period_id;

  -- 3b. DELETE orphaned pending/rejected rows for pairs that no longer have entries.
  -- This prevents stale rejected rows (from a changed activity) from keeping
  -- hasRejectedLines=true or blocking isFullyApproved in the frontend.
  -- Approved rows are intentionally excluded: the protect_approved_time_entries trigger
  -- prevents deleting entries on approved lines, so approved rows always have entries.
  DELETE FROM timesheet_line_approvals tla
  WHERE tla.period_id = p_period_id
    AND tla.status IN ('pending', 'rejected')
    AND NOT EXISTS (
      SELECT 1 FROM time_entries te
      WHERE te.period_id     = p_period_id
        AND te.engagement_id = tla.engagement_id
        AND te.activity_id   = tla.activity_id
        AND te.is_forecast   = false
    );

  -- 4-7. Process each (engagement, activity) pair
  FOR i IN 1 .. v_pair_count LOOP
    v_eng_id := p_engagement_ids[i];
    v_act_id := p_activity_ids[i];

    -- Skip NULLs
    IF v_eng_id IS NULL OR v_act_id IS NULL THEN CONTINUE; END IF;

    IF v_holiday_engagement_id IS NOT NULL AND v_eng_id = v_holiday_engagement_id THEN
      -- BUG 0526-122: dynamic per-date validation replaces both approval_required
      -- and p_is_auto_approved for this line — all-or-nothing per line, no bypass.
      SELECT NOT EXISTS (
        SELECT 1
        FROM time_entries te
        WHERE te.period_id     = p_period_id
          AND te.engagement_id = v_eng_id
          AND te.activity_id   = v_act_id
          AND te.is_forecast   = false
          AND NOT EXISTS (
            SELECT 1 FROM holidays h
            WHERE h.holiday_date = te.date_worked
              AND (
                h.oficina = 0
                OR (h.oficina = 1 AND v_staff_city = 'La Paz')
                OR (h.oficina = 2 AND v_staff_city = 'Santa Cruz')
              )
          )
      )
      INTO v_effective_auto;
    ELSE
      -- BUG 0220-61: Fetch per-engagement approval policy (fail-safe default true)
      SELECT NOT COALESCE(e.approval_required, true)
      INTO v_skip_approval
      FROM engagements e WHERE e.engagement_id = v_eng_id;

      v_effective_auto := p_is_auto_approved OR COALESCE(v_skip_approval, false);
    END IF;

    -- 4. Fetch existing line approval for this (period, engagement, activity)
    SELECT approval_id, status, updated_at
    INTO v_existing
    FROM timesheet_line_approvals
    WHERE period_id     = p_period_id
      AND engagement_id = v_eng_id
      AND activity_id   = v_act_id;

    IF FOUND THEN
      -- b. Approved: SKIP
      IF v_existing.status = 'approved' THEN
        v_preserved_approved := v_preserved_approved + 1;
        CONTINUE;
      END IF;

      -- c. Pending: upgrade if effective auto-approve, otherwise skip
      IF v_existing.status = 'pending' THEN
        IF v_effective_auto THEN
          UPDATE timesheet_line_approvals
          SET status      = 'approved',
              approved_by = p_staff_id,
              approved_at = now()
          WHERE period_id     = p_period_id
            AND engagement_id = v_eng_id
            AND activity_id   = v_act_id
            AND status        = 'pending';
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected > 0 THEN
            v_upgraded_to_approved := v_upgraded_to_approved + 1;
          ELSE
            v_guarded_update_skips := v_guarded_update_skips + 1;
          END IF;
        END IF;
        CONTINUE;
      END IF;

      -- d. Rejected: auto-upgrade if effective auto, else check modified-since-rejection
      IF v_existing.status = 'rejected' THEN
        IF v_effective_auto THEN
          UPDATE timesheet_line_approvals
          SET status       = 'approved',
              approved_by  = p_staff_id,
              approved_at  = now(),
              review_notes = NULL
          WHERE period_id     = p_period_id
            AND engagement_id = v_eng_id
            AND activity_id   = v_act_id
            AND status        = 'rejected';
          GET DIAGNOSTICS v_affected = ROW_COUNT;
          IF v_affected > 0 THEN
            v_upgraded_to_approved := v_upgraded_to_approved + 1;
          ELSE
            v_guarded_update_skips := v_guarded_update_skips + 1;
          END IF;
        ELSE
          SELECT MAX(te.updated_at)
          INTO v_max_te_updated
          FROM time_entries te
          WHERE te.period_id     = p_period_id
            AND te.engagement_id = v_eng_id
            AND te.activity_id   = v_act_id
            AND te.is_forecast   = false;

          IF v_max_te_updated IS NOT NULL AND v_max_te_updated > v_existing.updated_at THEN
            v_affected := 0;
            UPDATE timesheet_line_approvals
            SET status       = 'pending',
                approved_by  = NULL,
                approved_at  = NULL,
                review_notes = NULL
            WHERE period_id     = p_period_id
              AND engagement_id = v_eng_id
              AND activity_id   = v_act_id
              AND status        = 'rejected';

            GET DIAGNOSTICS v_affected = ROW_COUNT;

            IF v_affected = 0 THEN
              v_guarded_update_skips := v_guarded_update_skips + 1;
              v_preserved_approved   := v_preserved_approved + 1;
            ELSE
              v_reset_to_pending := v_reset_to_pending + 1;
            END IF;
          ELSE
            v_kept_rejected := v_kept_rejected + 1;
          END IF;
        END IF;

        CONTINUE;
      END IF;
    ELSE
      -- e. No existing row: INSERT
      IF v_effective_auto THEN
        INSERT INTO timesheet_line_approvals
          (period_id, engagement_id, activity_id, status, approved_by, approved_at)
        VALUES
          (p_period_id, v_eng_id, v_act_id, 'approved', p_staff_id, now());
        v_new_auto_approved := v_new_auto_approved + 1;
      ELSE
        INSERT INTO timesheet_line_approvals
          (period_id, engagement_id, activity_id, status)
        VALUES
          (p_period_id, v_eng_id, v_act_id, 'pending');
        v_new_pending := v_new_pending + 1;
      END IF;
    END IF;
  END LOOP;

  -- 7. Return summary
  RETURN jsonb_build_object(
    'period_id',              p_period_id,
    'preserved_approved',     v_preserved_approved,
    'reset_to_pending',       v_reset_to_pending,
    'kept_rejected',          v_kept_rejected,
    'new_pending',            v_new_pending,
    'new_auto_approved',      v_new_auto_approved,
    'guarded_update_skips',   v_guarded_update_skips,
    'upgraded_to_approved',   v_upgraded_to_approved
  );
END;
$$;


--
--
-- Name: sync_worksheet_to_wo_budget(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_worksheet_to_wo_budget(p_worksheet_id uuid, p_wo_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_wo RECORD;
BEGIN
    -- Get work order details for rate calculation
    SELECT wo_id, currency, season_mode INTO v_wo
    FROM work_orders
    WHERE wo_id = p_wo_id;

    IF v_wo IS NULL THEN
        RAISE EXCEPTION 'Work order not found: %', p_wo_id;
    END IF;

    -- Link worksheet to work order
    UPDATE activity_worksheets
    SET wo_id = p_wo_id, updated_at = now()
    WHERE id = p_worksheet_id;

    -- Delete existing budget lines for this work order
    DELETE FROM wo_budget_lines WHERE wo_id = p_wo_id;

    -- Insert aggregated budget lines from worksheet cells
    INSERT INTO wo_budget_lines (wo_id, category_id, budgeted_hours, standard_rate)
    SELECT 
        p_wo_id,
        awc.category_id,
        SUM(awc.budget_hours),
        -- Calculate rate based on currency and season
        CASE 
            WHEN v_wo.currency = 'USD' AND v_wo.season_mode = 'High' THEN c.rate_high_usd
            WHEN v_wo.currency = 'USD' AND v_wo.season_mode = 'Low' THEN c.rate_low_usd
            WHEN v_wo.currency = 'BOB' AND v_wo.season_mode = 'High' THEN c.rate_high_bob
            ELSE c.rate_low_bob
        END
    FROM activity_worksheet_cells awc
    JOIN categories c ON c.category_id = awc.category_id
    WHERE awc.worksheet_id = p_worksheet_id
      AND awc.budget_hours > 0
    GROUP BY awc.category_id, c.rate_high_usd, c.rate_low_usd, c.rate_high_bob, c.rate_low_bob;
END;
$$;


--
--
-- Name: unsubmit_timesheet_safe(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unsubmit_timesheet_safe(p_period_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_staff_id     uuid;
  v_period       record;
  v_all_approved boolean;
BEGIN
  -- 1. Resolve caller's staff_id via auth.uid()
  SELECT s.staff_id
    INTO v_staff_id
    FROM staff s
   WHERE s.auth_user_id = auth.uid();

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_OWNER';
  END IF;

  -- 2. Load and row-lock the period
  SELECT tp.*
    INTO v_period
    FROM timesheet_periods tp
   WHERE tp.period_id = p_period_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_OWNER';
  END IF;

  -- 3. Caller must own the period
  IF v_period.staff_id IS DISTINCT FROM v_staff_id THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_OWNER';
  END IF;

  -- 4. Reject hard-locked periods
  IF v_period.is_period_locked THEN
    RAISE EXCEPTION 'UNSUBMIT_PERIOD_LOCKED';
  END IF;

  -- 5. Reject periods that were never submitted
  IF v_period.submitted_at IS NULL THEN
    RAISE EXCEPTION 'UNSUBMIT_NOT_SUBMITTED';
  END IF;

  -- 6. Detect fully-approved status (COALESCE: bool_and on empty set returns NULL, not false)
  SELECT COALESCE(bool_and(tla.status = 'approved'), false)
    INTO v_all_approved
    FROM timesheet_line_approvals tla
   WHERE tla.period_id = p_period_id;

  -- 6b. Only admin or partner roles can recall a fully-approved period
  IF v_all_approved THEN
    IF NOT EXISTS (
      SELECT 1 FROM user_roles
       WHERE user_id = auth.uid()
         AND role IN ('partner', 'admin')
    ) THEN
      RAISE EXCEPTION 'UNSUBMIT_NOT_PARTNER';
    END IF;
  END IF;

  -- 7. Week-window guard (only for fully-approved periods)
  --    current_date is UTC; frontend provides the first enforcement layer.
  --    Decision OQ1: UTC-only (safe over-restriction near week boundaries).
  --    Decision OQ5: Mon–Sun inclusive (+6 days from week_start_date).
  IF v_all_approved THEN
    IF current_date NOT BETWEEN v_period.week_start_date
                             AND v_period.week_start_date + 6 THEN
      RAISE EXCEPTION 'APPROVED_WEEK_RECALL_WINDOW_CLOSED';
    END IF;
  END IF;

  -- 8. Clear submitted_at
  UPDATE timesheet_periods
     SET submitted_at = NULL
   WHERE period_id = p_period_id;

  -- 9. Delete approved line approval rows so the APPROVED_LINE_LOCKED trigger
  --    no longer blocks edits, and so re-submit's INSERT path re-fires auto-approval.
  IF v_all_approved THEN
    DELETE FROM timesheet_line_approvals
     WHERE period_id = p_period_id
       AND status    = 'approved';
  END IF;
END;
$$;


--
--
-- Name: update_category_for_practice(uuid, text, integer, numeric, numeric, numeric, numeric, boolean, boolean, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_category_for_practice(p_category_id uuid, p_category_name text, p_display_order integer, p_rate_high_bob numeric, p_rate_low_bob numeric, p_rate_high_usd numeric, p_rate_low_usd numeric, p_can_approve_wo boolean, p_can_approve_timesheets boolean, p_default_app_role public.app_role) RETURNS public.categories
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_practica_id uuid;
  v_old_pos    integer;
  v_total      integer;
  v_new_pos    integer;
  v_row        public.categories;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  -- Lock the target category.
  SELECT practica_id, display_order
    INTO v_practica_id, v_old_pos
    FROM public.categories
   WHERE category_id = p_category_id
   FOR UPDATE;

  IF v_practica_id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM public.categories
   WHERE practica_id = v_practica_id;

  -- Clamp requested order to the valid range.
  v_new_pos := GREATEST(1, LEAST(COALESCE(p_display_order, v_old_pos), v_total));

  IF v_new_pos <> v_old_pos THEN
    IF v_new_pos < v_old_pos THEN
      -- Moving up: push the block [new, old-1] down by one.
      UPDATE public.categories
         SET display_order = display_order + 1
       WHERE practica_id = v_practica_id
         AND display_order >= v_new_pos
         AND display_order <  v_old_pos;
    ELSE
      -- Moving down: pull the block [old+1, new] up by one.
      UPDATE public.categories
         SET display_order = display_order - 1
       WHERE practica_id = v_practica_id
         AND display_order >  v_old_pos
         AND display_order <= v_new_pos;
    END IF;
  END IF;

  UPDATE public.categories
     SET category_name          = p_category_name,
         display_order          = v_new_pos,
         rate_high_bob          = p_rate_high_bob,
         rate_low_bob           = p_rate_low_bob,
         rate_high_usd          = p_rate_high_usd,
         rate_low_usd           = p_rate_low_usd,
         can_approve_wo         = p_can_approve_wo,
         can_approve_timesheets = p_can_approve_timesheets,
         default_app_role       = p_default_app_role,
         updated_at             = now()
   WHERE category_id = p_category_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
--
-- Name: update_timesheet_minmax_settings(numeric, numeric, numeric, numeric, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timesheet_minmax_settings(p_daily_min numeric, p_daily_max numeric, p_weekly_min numeric, p_weekly_max numeric, p_work_days integer DEFAULT 5) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_daily_min > p_daily_max THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DAILY_MIN_EXCEEDS_MAX');
  END IF;

  IF p_weekly_min > p_weekly_max THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MIN_EXCEEDS_MAX');
  END IF;

  IF p_weekly_min > p_daily_max * p_work_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MIN_EXCEEDS_DAILY_MAX');
  END IF;

  IF p_weekly_max < p_daily_min * p_work_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MAX_BELOW_DAILY_MIN');
  END IF;

  UPDATE global_settings SET setting_value = p_daily_min::text, updated_at = now()
  WHERE setting_key = 'DAILY_MIN';
  UPDATE global_settings SET setting_value = p_daily_max::text, updated_at = now()
  WHERE setting_key = 'DAILY_MAX';
  UPDATE global_settings SET setting_value = p_weekly_min::text, updated_at = now()
  WHERE setting_key = 'WEEKLY_MIN';
  UPDATE global_settings SET setting_value = p_weekly_max::text, updated_at = now()
  WHERE setting_key = 'WEEKLY_MAX';

  RETURN jsonb_build_object('success', true);
END;
$$;


--
--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
--
-- Name: validate_email_domain(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_email_domain() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  allowed_domain TEXT;
  user_domain TEXT;
BEGIN
  -- Get allowed domain from global_settings
  SELECT setting_value INTO allowed_domain
  FROM public.global_settings
  WHERE setting_key = 'ALLOWED_EMAIL_DOMAIN';
  
  -- If no setting found or empty, allow all domains
  IF allowed_domain IS NULL OR allowed_domain = '' THEN
    RETURN NEW;
  END IF;
  
  -- Extract domain from email
  user_domain := split_part(NEW.email, '@', 2);
  
  -- Check if domain matches (case-insensitive)
  IF lower(user_domain) != lower(allowed_domain) THEN
    RAISE EXCEPTION 'Registration restricted to @% emails only', allowed_domain;
  END IF;
  
  RETURN NEW;
END;
$$;


--
--
-- Name: validate_submission_has_entries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_submission_has_entries() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_entry_count integer;
BEGIN
  -- Only fires when submitted_at transitions NULL -> NOT NULL (via WHEN clause)
  SELECT COUNT(*) INTO v_entry_count
  FROM time_entries te
  WHERE te.staff_id = NEW.staff_id
    AND te.date_worked >= NEW.week_start_date
    AND te.date_worked <= NEW.week_start_date + 4  -- Monday through Friday inclusive
    AND te.is_forecast = false;

  IF v_entry_count = 0 THEN
    RAISE EXCEPTION 'SUBMIT_NO_ENTRIES: Cannot submit a timesheet with no time entries for week starting %', NEW.week_start_date;
  END IF;

  RETURN NEW;
END;
$$;


--
--
-- Name: validate_timer_entry_duration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_timer_entry_duration() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL THEN
    IF NEW.ended_at > NEW.started_at + interval '8 hours' THEN
      RAISE EXCEPTION 'Timer entry cannot exceed 8 hours';
    END IF;
  END IF;
  IF NEW.duration_minutes IS NOT NULL AND NEW.duration_minutes > 480 THEN
    RAISE EXCEPTION 'Duration cannot exceed 480 minutes (8 hours)';
  END IF;
  RETURN NEW;
END;
$$;


--
--
-- Name: FUNCTION validate_timer_entry_duration(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_timer_entry_duration() IS 'Validates 8h max on timer_entries. Legacy data cleaned by migration (Bug 0213-31).';


--
--
-- Name: wo_guard_risk_approval(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wo_guard_risk_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Acto de aprobación / rechazo de Riesgos:
  --   * registrar aprobador (risk_approved_by no nulo)
  --   * transición de risk_status a un veredicto (Approved / Rejected / Emergency_Approved).
  --     'Pending' queda fuera: lo escriben submit/complete/revert (no es aprobación).
  --   * pasos de emergencia (review / partner sign-off).
  if (
    (new.risk_approved_by is distinct from old.risk_approved_by and new.risk_approved_by is not null)
    or (new.risk_status is distinct from old.risk_status
        and new.risk_status in ('Approved', 'Rejected', 'Emergency_Approved'))
    or (new.emergency_review_by is distinct from old.emergency_review_by and new.emergency_review_by is not null)
    or (new.emergency_partner_by is distinct from old.emergency_partner_by and new.emergency_partner_by is not null)
  ) and not public.can_approve_wo_risk(new.engagement_id) then
    raise exception 'Solo un aprobador de Riesgos autorizado puede aprobar o rechazar la seccion de Riesgos de esta OT';
  end if;

  return new;
end;
$$;


--
--
-- Name: wo_in_my_fund_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.wo_in_my_fund_request(p_wo_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.fund_request_work_orders frwo
    join public.fund_requests fr on fr.fund_request_id = frwo.fund_request_id
    where frwo.wo_id = p_wo_id
      -- Solo solicitudes YA ENVIADAS: un borrador no debe conceder lectura de la
      -- OT base (en borrador la info viene de la vista segura
      -- fund_request_selectable_work_orders).
      and fr.status <> 'borrador'
      and (
        fr.requester_staff_id = get_my_staff_id()
        or frwo.manager_staff_id = get_my_staff_id()
        -- Contabilidad, con el MISMO corte que fr_select_accounting (Ola D):
        --   Gerente (fund_disbursement.read)  -> toda la fase contable.
        --   Analista (expense_settlement.read) -> hasta 'fondos_entregados'; queda
        --   fuera de 'en_liquidacion' y 'cerrado'.
        or (public.has_permission('fund_disbursement.read')
            and fr.status = any (array['aprobado_gerente','fondos_entregados',
                                       'en_liquidacion','cerrado']::fund_request_status[]))
        or (public.has_permission('expense_settlement.read')
            and fr.status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[]))
      )
  );
$$;


--
--
-- Name: FUNCTION wo_in_my_fund_request(p_wo_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.wo_in_my_fund_request(p_wo_id uuid) IS 'True si la OT está incluida en una solicitud de fondos ENVIADA donde el usuario es solicitante, gerente de esa OT, o Contabilidad (expense_settlement.read) con la solicitud en fase contable. Habilita el embed work_order de los selects de fondos sin abrir la tabla base work_orders.';


--
--
-- Name: activity_worksheet_cells; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_worksheet_cells (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    worksheet_id uuid NOT NULL,
    category_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    budget_hours numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_worksheet_cells_budget_hours_check CHECK ((budget_hours >= (0)::numeric))
);


--
--
-- Name: activity_worksheets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_worksheets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    wo_id uuid,
    version integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    notes text,
    created_by_staff_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_worksheets_status_check CHECK (status IN ('draft', 'approved', 'archived'))
);


--
--
-- Name: auth_login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_login_attempts (
    email_normalized text NOT NULL,
    attempts_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone
);


--
--
-- Name: authorization_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorization_permissions (
    permission_key text NOT NULL,
    module_key text NOT NULL,
    action_key text NOT NULL,
    label_key text NOT NULL,
    description text,
    is_sensitive boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: TABLE authorization_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.authorization_permissions IS 'Catálogo de permisos atómicos. permission_key = "<modulo>.<accion>" (p.ej. client.read).';


--
--
-- Name: authorization_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorization_role_permissions (
    role_key text NOT NULL,
    permission_key text NOT NULL,
    scope_key text DEFAULT 'none'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT authz_rp_scope_chk CHECK ((scope_key = ANY (ARRAY['firm'::text, 'assigned_clients'::text, 'assigned_engagements'::text, 'own'::text, 'department'::text, 'none'::text])))
);


--
--
-- Name: TABLE authorization_role_permissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.authorization_role_permissions IS 'Matriz rol x permiso con scope_key (ABAC). Una fila = una concesión. Objetivo: 737 filas.';


--
--
-- Name: COLUMN authorization_role_permissions.scope_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.authorization_role_permissions.scope_key IS 'Alcance del dato: firm | assigned_clients | assigned_engagements | own | department | none.';


--
--
-- Name: authorization_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorization_roles (
    role_key text NOT NULL,
    label_key text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_app_role public.app_role
);


--
--
-- Name: TABLE authorization_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.authorization_roles IS 'Catálogo de roles de negocio (reemplaza el enum app_role). role_key = identificador técnico.';


--
--
-- Name: COLUMN authorization_roles.legacy_app_role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.authorization_roles.legacy_app_role IS 'Valor del enum app_role con el que se espeja este rol para las políticas RLS legacy que aún usan has_role(). Es el NIVEL jerárquico equivalente, no el rol de negocio: varios role_key comparten el mismo legacy_app_role.';


--
--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    client_id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_legal_name character varying(255) NOT NULL,
    unique_tax_id character varying(50) NOT NULL,
    industry_id uuid,
    contact_name character varying(200),
    contact_email character varying(255),
    contact_phone character varying(50),
    address text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by_staff_id uuid
);


--
--
-- Name: COLUMN clients.created_by_staff_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clients.created_by_staff_id IS 'Staff que creó el cliente. La puebla un trigger desde get_my_staff_id(); no la envía el cliente HTTP. Habilita que el creador vea el cliente antes de tener un encargo que lo haga "asignado". NULL en las filas previas a esta migración.';


--
--
-- Name: clients_directory; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.clients_directory AS
 SELECT client_id,
    client_legal_name,
    industry_id,
    contact_name,
    contact_email,
    contact_phone,
    address,
    is_active,
    created_at,
    updated_at
   FROM public.clients;


--
--
-- Name: engagement_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engagement_assignments (
    assignment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    hours_per_week numeric DEFAULT 40 NOT NULL,
    allocation_percent numeric DEFAULT 100 NOT NULL,
    status text DEFAULT 'PROPOSED'::text NOT NULL,
    notes text,
    requirement_id uuid,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    category_id uuid NOT NULL,
    CONSTRAINT chk_assignment_allocation CHECK (((allocation_percent > (0)::numeric) AND (allocation_percent <= (100)::numeric))),
    CONSTRAINT chk_assignment_hours CHECK (((hours_per_week > (0)::numeric) AND (hours_per_week <= (80)::numeric))),
    CONSTRAINT chk_assignment_status CHECK ((status = ANY (ARRAY['PROPOSED'::text, 'PROVISIONAL'::text, 'CONFIRMED'::text, 'COMPLETED'::text, 'CANCELLED'::text]))),
    CONSTRAINT engagement_assignments_dates_chk CHECK ((end_date >= start_date))
);


--
--
-- Name: work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_orders (
    wo_id uuid DEFAULT gen_random_uuid() NOT NULL,
    engagement_id uuid NOT NULL,
    currency text NOT NULL,
    season_mode character varying(4) NOT NULL,
    tax_rate numeric(5,4) DEFAULT 0.13,
    adjustment_amount numeric(15,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    approval_status character varying(20) DEFAULT 'Draft'::character varying,
    approved_by uuid,
    approved_at timestamp with time zone,
    ceac_completed_at date,
    ceac_notes text,
    san_completed_at date,
    san_notes text,
    ceac_number text,
    san_approval_id text,
    risk_level text,
    risk_status text DEFAULT 'Pending'::text,
    risk_approved_by uuid,
    risk_approved_at timestamp with time zone,
    risk_notes text,
    emergency_deadline_at date,
    emergency_justification text,
    emergency_review_by uuid,
    emergency_review_at timestamp with time zone,
    emergency_partner_by uuid,
    emergency_partner_at timestamp with time zone,
    CONSTRAINT work_orders_approval_status_check CHECK (approval_status IN ('Draft', 'Pending_Approval', 'Approved', 'Rejected')),
    CONSTRAINT work_orders_currency_check CHECK ((currency = ANY (ARRAY['USD'::text, 'BOB'::text, 'USDT'::text]))),
    CONSTRAINT work_orders_risk_level_check CHECK (((risk_level IS NULL) OR (risk_level = ANY (ARRAY['Bajo'::text, 'Moderado'::text, 'Alto'::text])))),
    CONSTRAINT work_orders_risk_status_check CHECK ((risk_status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Emergency_Approved'::text, 'Rejected'::text]))),
    CONSTRAINT work_orders_season_mode_check CHECK (season_mode IN ('High', 'Low'))
);


--
--
-- Name: engagement_wo_state; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.engagement_wo_state WITH (security_invoker='false') AS
 SELECT engagement_id,
    approval_status,
    approved_at,
    risk_status
   FROM public.work_orders;


--
--
-- Name: expense_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_types (
    expense_type_id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_name character varying(100) NOT NULL,
    default_unit_cost numeric(10,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: fund_request_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_request_expenses (
    fre_id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_request_id uuid NOT NULL,
    wo_id uuid NOT NULL,
    expense_type_id uuid,
    expense_date date NOT NULL,
    amount numeric NOT NULL,
    currency character varying NOT NULL,
    description text,
    document_number character varying,
    supplier_name character varying,
    supplier_tax_id character varying,
    attachment_url text,
    status public.fund_request_expense_status DEFAULT 'borrador'::public.fund_request_expense_status NOT NULL,
    submitted_at timestamp with time zone,
    manager_decided_at timestamp with time zone,
    manager_notes text,
    rejection_reason text,
    reviewed_at timestamp with time zone,
    reviewed_by_staff_id uuid,
    has_invoice_observation boolean DEFAULT false NOT NULL,
    invoice_observation_notes text,
    iva_penalty_amount numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    expense_date_end date,
    days integer,
    returned_by_assistant boolean DEFAULT false NOT NULL,
    CONSTRAINT fund_request_expenses_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT fund_request_expenses_currency_check CHECK (currency IN ('BOB', 'USD'))
);


--
--
-- Name: staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff (
    staff_id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    email character varying(255),
    category_id uuid,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    city character varying,
    id_number character varying,
    aud_reg_number character varying,
    short_name character varying(50),
    initials character varying(4),
    deleted_at timestamp with time zone,
    hire_date date,
    weekly_capacity_hours numeric DEFAULT 40 NOT NULL,
    termination_date date,
    is_blocked boolean DEFAULT false NOT NULL,
    is_schedulable boolean DEFAULT true NOT NULL,
    society_id uuid NOT NULL,
    practica_id uuid NOT NULL,
    -- Drift positivo de consolidación (plan §0.5.6/§2.2.5): existe en Dev 2.0 real y en
    -- types.ts, pero ninguna de las 184 migraciones originales la crea, así que el replay
    -- local nunca la capturó. Ver docs/migraciones/DIFF-INTENCIONAL-consolidacion.md.
    target_utilization_percent numeric DEFAULT 85 NOT NULL,
    CONSTRAINT chk_termination_after_hire CHECK (((termination_date IS NULL) OR (hire_date IS NULL) OR (termination_date >= hire_date))),
    CONSTRAINT staff_city_check CHECK (city IN ('La Paz', 'Santa Cruz'))
);


--
--
-- Name: COLUMN staff.id_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.staff.id_number IS 'Documento de identidad. SELECT revocado a `authenticated`: se lee solo por get_staff_full() / staff_id_number_conflict() (SECURITY DEFINER, gated por permiso).';


--
--
-- Name: COLUMN staff.aud_reg_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.staff.aud_reg_number IS 'Registro de auditor. SELECT revocado a `authenticated` — ver id_number.';


--
--
-- Name: fund_request_selectable_work_orders; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.fund_request_selectable_work_orders WITH (security_invoker='false') AS
 SELECT wo.wo_id,
    wo.currency,
    wo.approval_status,
    e.engagement_id,
    e.engagement_code,
    e.engagement_name,
    e.manager_id,
    s.staff_id AS manager_staff_id,
    s.short_name AS manager_short_name,
    s.first_name AS manager_first_name,
    s.last_name AS manager_last_name
   FROM ((public.work_orders wo
     JOIN public.engagements e ON ((e.engagement_id = wo.engagement_id)))
     LEFT JOIN public.staff s ON ((s.staff_id = e.manager_id)))
  WHERE (((wo.approval_status)::text = 'Approved'::text) AND (public.get_my_staff_id() IS NOT NULL) AND public.engagement_allows_hours_or_requests(e.engagement_id));


--
--
-- Name: fund_request_work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_request_work_orders (
    fr_wo_id uuid DEFAULT gen_random_uuid() NOT NULL,
    fund_request_id uuid NOT NULL,
    wo_id uuid NOT NULL,
    allocated_amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    manager_staff_id uuid,
    approval_status public.fr_wo_approval_status DEFAULT 'pendiente'::public.fr_wo_approval_status NOT NULL,
    manager_notes text,
    rejection_reason text,
    manager_decided_at timestamp with time zone,
    CONSTRAINT fund_request_work_orders_allocated_amount_check CHECK ((allocated_amount > (0)::numeric))
);


--
--
-- Name: fund_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_requests (
    fund_request_id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_number character varying,
    requester_staff_id uuid NOT NULL,
    approver_manager_staff_id uuid,
    total_requested_amount numeric NOT NULL,
    currency character varying NOT NULL,
    status public.fund_request_status DEFAULT 'borrador'::public.fund_request_status NOT NULL,
    purpose text,
    due_back_date date,
    submitted_at timestamp with time zone,
    manager_decided_at timestamp with time zone,
    manager_notes text,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    total_disbursed_amount numeric DEFAULT 0 NOT NULL,
    disbursed_at timestamp with time zone,
    disbursed_by_staff_id uuid,
    accounting_notes text,
    closed_at timestamp with time zone,
    settlement_total_spent numeric,
    settlement_balance numeric,
    settlement_iva_total numeric,
    settlement_resolution text,
    settlement_amount numeric,
    settlement_notes text,
    settled_at timestamp with time zone,
    settled_by_staff_id uuid,
    CONSTRAINT fund_requests_currency_check CHECK (currency IN ('BOB', 'USD')),
    CONSTRAINT fund_requests_disbursed_nonneg CHECK ((total_disbursed_amount >= (0)::numeric)),
    CONSTRAINT fund_requests_settlement_resolution_check CHECK (((settlement_resolution IS NULL) OR (settlement_resolution = ANY (ARRAY['sin_saldo'::text, 'devolucion'::text, 'descuento_planilla'::text, 'pago_solicitante'::text])))),
    CONSTRAINT fund_requests_total_requested_amount_check CHECK ((total_requested_amount > (0)::numeric))
);


--
--
-- Name: global_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.global_settings (
    setting_key character varying(100) NOT NULL,
    setting_value character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holidays (
    holiday_id uuid DEFAULT gen_random_uuid() NOT NULL,
    holiday_date date NOT NULL,
    holiday_name text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    oficina smallint DEFAULT 0 NOT NULL,
    CONSTRAINT chk_holidays_oficina CHECK ((oficina = ANY (ARRAY[0, 1, 2])))
);


--
--
-- Name: industries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.industries (
    industry_id uuid DEFAULT gen_random_uuid() NOT NULL,
    industry_name character varying(100) NOT NULL,
    fiscal_year_end character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: migration_run_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_run_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    migration_key text NOT NULL,
    backup_table_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    executed_by text DEFAULT CURRENT_USER
);


--
--
-- Name: parametro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parametro (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    periodo integer NOT NULL,
    date_begin date NOT NULL,
    date_end date NOT NULL,
    valor integer DEFAULT 1 NOT NULL,
    descripcion text,
    created_at timestamp with time zone DEFAULT now(),
    tipo text
);


--
--
-- Name: practicas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.practicas (
    practica_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code smallint NOT NULL,
    allows_rates_activities boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    abbreviation text,
    CONSTRAINT practicas_abbreviation_check CHECK ((abbreviation ~ '^[A-Z]{2,5}$'::text)),
    CONSTRAINT practicas_code_check CHECK (((code >= 0) AND (code <= 9)))
);


--
--
-- Name: skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skills (
    skill_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    category character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_skills_category_code CHECK (category IN ('framework', 'industry', 'tool', 'language', 'certification', 'other')),
    CONSTRAINT chk_skills_category_not_empty CHECK ((TRIM(BOTH FROM category) <> ''::text)),
    CONSTRAINT chk_skills_name_not_empty CHECK ((TRIM(BOTH FROM name) <> ''::text))
);


--
--
-- Name: society; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.society (
    society_id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: staff_alert_seen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_alert_seen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    entity_id text NOT NULL,
    alert_type text NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
--
-- Name: staff_directory; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.staff_directory AS
 SELECT staff_id,
    first_name,
    last_name,
    short_name,
    initials,
    category_id,
    city,
    is_active,
    created_at,
    updated_at
   FROM public.staff
  WHERE (deleted_at IS NULL);


--
--
-- Name: staff_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_skills (
    staff_skill_id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    proficiency_level character varying NOT NULL,
    last_evaluated_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT staff_skills_proficiency_level_check CHECK (proficiency_level IN ('Beginner', 'Intermediate', 'Advanced'))
);


--
--
-- Name: servicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicios (
    taxonomy_id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(10) NOT NULL,
    name text NOT NULL,
    practica_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT servicios_code_check CHECK (((char_length(TRIM(BOTH FROM code)) >= 1) AND (char_length(TRIM(BOTH FROM code)) <= 10))),
    CONSTRAINT servicios_name_check CHECK ((TRIM(BOTH FROM name) <> ''::text))
);


--
--
-- Name: time_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_entries (
    time_id uuid DEFAULT gen_random_uuid() NOT NULL,
    date_worked date NOT NULL,
    hours_logged numeric(4,2) NOT NULL,
    staff_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    period_id uuid,
    is_forecast boolean DEFAULT false,
    CONSTRAINT time_entries_hours_logged_check CHECK ((hours_logged >= (0)::numeric))
);


--
--
-- Name: timer_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timer_entries (
    timer_id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    activity_id uuid NOT NULL,
    description text,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    duration_minutes integer,
    is_imported boolean DEFAULT false NOT NULL,
    imported_to_time_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    has_explicit_times boolean DEFAULT true NOT NULL
);


--
--
-- Name: timesheet_line_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheet_line_approvals (
    approval_id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    engagement_id uuid NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    review_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    activity_id uuid NOT NULL,
    CONSTRAINT timesheet_line_approvals_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);


--
--
-- Name: timesheet_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.timesheet_periods (
    period_id uuid DEFAULT gen_random_uuid() NOT NULL,
    staff_id uuid NOT NULL,
    week_start_date date NOT NULL,
    week_number integer NOT NULL,
    year integer NOT NULL,
    deadline date,
    is_period_locked boolean DEFAULT false,
    total_hours numeric(6,2) DEFAULT 0,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: user_lifecycle_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_lifecycle_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid NOT NULL,
    target_user_id uuid NOT NULL,
    action text NOT NULL,
    old_role public.app_role,
    new_role public.app_role,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    old_role_key text,
    new_role_key text
);


--
--
-- Name: COLUMN user_lifecycle_audit_log.old_role_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_lifecycle_audit_log.old_role_key IS 'role_key previo. Las columnas old_role/new_role (enum) quedan como espejo legacy.';


--
--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'staff'::public.app_role NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    role_key text
);


--
--
-- Name: user_roles_backup_0220_56_20260224; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles_backup_0220_56_20260224 (
    id uuid,
    user_id uuid,
    role public.app_role,
    created_at timestamp with time zone
);


--
--
-- Name: vw_actual_hours_by_category_activity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_actual_hours_by_category_activity WITH (security_invoker='on') AS
 SELECT te.engagement_id,
    s.category_id,
    c.category_name,
    c.display_order AS category_display_order,
    te.activity_id,
    ac.activity_code,
    ac.description AS activity_description,
    sum(te.hours_logged) AS actual_hours
   FROM (((public.time_entries te
     JOIN public.staff s ON ((s.staff_id = te.staff_id)))
     JOIN public.categories c ON ((c.category_id = s.category_id)))
     JOIN public.activity_codes ac ON ((ac.activity_id = te.activity_id)))
  WHERE (te.is_forecast = false)
  GROUP BY te.engagement_id, s.category_id, c.category_name, c.display_order, te.activity_id, ac.activity_code, ac.description;


--
--
-- Name: vw_wo_budget_hours_by_category_activity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_wo_budget_hours_by_category_activity WITH (security_invoker='on') AS
 SELECT wo.wo_id,
    wo.engagement_id,
    aw.id AS worksheet_id,
    awc.category_id,
    c.category_name,
    c.display_order AS category_display_order,
    awc.activity_id,
    ac.activity_code,
    ac.description AS activity_description,
    awc.budget_hours
   FROM ((((public.work_orders wo
     JOIN public.activity_worksheets aw ON ((aw.wo_id = wo.wo_id)))
     JOIN public.activity_worksheet_cells awc ON ((awc.worksheet_id = aw.id)))
     JOIN public.categories c ON ((c.category_id = awc.category_id)))
     JOIN public.activity_codes ac ON ((ac.activity_id = awc.activity_id)))
  WHERE (awc.budget_hours > (0)::numeric);


--
--
-- Name: vw_budget_vs_actual_hours_by_category_activity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_budget_vs_actual_hours_by_category_activity WITH (security_invoker='on') AS
 SELECT COALESCE(b.wo_id, wo.wo_id) AS wo_id,
    COALESCE(b.engagement_id, a.engagement_id) AS engagement_id,
    COALESCE(b.category_id, a.category_id) AS category_id,
    COALESCE(b.category_name, a.category_name) AS category_name,
    COALESCE(b.category_display_order, a.category_display_order) AS category_display_order,
    COALESCE(b.activity_id, a.activity_id) AS activity_id,
    COALESCE(b.activity_code, a.activity_code) AS activity_code,
    COALESCE(b.activity_description, a.activity_description) AS activity_description,
    COALESCE(b.budget_hours, (0)::numeric) AS budget_hours,
    COALESCE(a.actual_hours, (0)::numeric) AS actual_hours,
    (COALESCE(b.budget_hours, (0)::numeric) - COALESCE(a.actual_hours, (0)::numeric)) AS variance_hours
   FROM ((public.vw_wo_budget_hours_by_category_activity b
     FULL JOIN public.vw_actual_hours_by_category_activity a ON (((b.engagement_id = a.engagement_id) AND (b.category_id = a.category_id) AND (b.activity_id = a.activity_id))))
     LEFT JOIN public.work_orders wo ON ((wo.engagement_id = a.engagement_id)));


--
--
-- Name: vw_staffing_alerts; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_staffing_alerts WITH (security_invoker='true') AS
 SELECT 'timesheet_pending_approval'::text AS alert_type,
    c.category_name,
    (((((s_sub.first_name)::text || ' '::text) || (s_sub.last_name)::text) || ' — '::text) || (e.engagement_name)::text) AS description,
    tla.created_at AS detected_at,
    e.engagement_id,
    e.engagement_name,
    e.engagement_code,
    (tla.approval_id)::text AS entity_id,
        CASE
            WHEN (tla.created_at < (now() - '3 days'::interval)) THEN 'high'::text
            ELSE 'medium'::text
        END AS priority_level,
    tla.approved_by AS staff_id,
    (((s_apr.first_name)::text || ' '::text) || (s_apr.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    tp.week_start_date AS start_date,
    (tp.week_start_date + 6) AS end_date
   FROM (((((public.timesheet_line_approvals tla
     JOIN public.timesheet_periods tp ON ((tp.period_id = tla.period_id)))
     JOIN public.engagements e ON ((e.engagement_id = tla.engagement_id)))
     JOIN public.staff s_sub ON ((s_sub.staff_id = tp.staff_id)))
     JOIN public.categories c ON ((c.category_id = s_sub.category_id)))
     JOIN public.staff s_apr ON ((s_apr.staff_id = tla.approved_by)))
  WHERE (((tla.status)::text = 'pending'::text) AND (tla.approved_by IS NOT NULL))
UNION ALL
 SELECT 'work_order_pending_approval'::text AS alert_type,
    NULL::character varying AS category_name,
    ('WO pendiente de aprobación — '::text || (e.engagement_name)::text) AS description,
    wo.created_at AS detected_at,
    e.engagement_id,
    e.engagement_name,
    e.engagement_code,
    (wo.wo_id)::text AS entity_id,
    'medium'::text AS priority_level,
    e.partner_id AS staff_id,
    (((s_partner.first_name)::text || ' '::text) || (s_partner.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    e.start_date,
    e.end_date
   FROM ((public.work_orders wo
     JOIN public.engagements e ON ((e.engagement_id = wo.engagement_id)))
     JOIN public.staff s_partner ON ((s_partner.staff_id = e.partner_id)))
  WHERE (((wo.approval_status)::text = 'Pending_Approval'::text) AND (e.partner_id IS NOT NULL))
UNION ALL
 SELECT 'engagement_created'::text AS alert_type,
    NULL::character varying AS category_name,
    cl.client_legal_name AS description,
    e.created_at AS detected_at,
    e.engagement_id,
    e.engagement_name,
    e.engagement_code,
    (e.engagement_id)::text AS entity_id,
    'medium'::text AS priority_level,
    e.partner_id AS staff_id,
    (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    e.start_date,
    e.end_date
   FROM ((public.engagements e
     JOIN public.clients cl ON ((cl.client_id = e.client_id)))
     JOIN public.staff s ON ((s.staff_id = e.partner_id)))
  WHERE ((e.partner_id IS NOT NULL) AND (e.created_at >= (now() - '7 days'::interval)))
UNION ALL
 SELECT 'engagement_created'::text AS alert_type,
    NULL::character varying AS category_name,
    cl.client_legal_name AS description,
    e.created_at AS detected_at,
    e.engagement_id,
    e.engagement_name,
    e.engagement_code,
    (e.engagement_id)::text AS entity_id,
    'medium'::text AS priority_level,
    e.manager_id AS staff_id,
    (((s.first_name)::text || ' '::text) || (s.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    e.start_date,
    e.end_date
   FROM ((public.engagements e
     JOIN public.clients cl ON ((cl.client_id = e.client_id)))
     JOIN public.staff s ON ((s.staff_id = e.manager_id)))
  WHERE ((e.manager_id IS NOT NULL) AND (e.manager_id IS DISTINCT FROM e.partner_id) AND (e.created_at >= (now() - '7 days'::interval)))
UNION ALL
 SELECT 'new_user_registered'::text AS alert_type,
    c.category_name,
    (((s_new.first_name)::text || ' '::text) || (s_new.last_name)::text) AS description,
    s_new.created_at AS detected_at,
    NULL::uuid AS engagement_id,
    NULL::character varying AS engagement_name,
    NULL::character varying AS engagement_code,
    (s_new.staff_id)::text AS entity_id,
    'medium'::text AS priority_level,
    s_admin.staff_id,
    (((s_admin.first_name)::text || ' '::text) || (s_admin.last_name)::text) AS staff_name,
    (1)::numeric AS required_count,
    NULL::date AS start_date,
    NULL::date AS end_date
   FROM ((public.staff s_new
     JOIN public.categories c ON ((c.category_id = s_new.category_id)))
     CROSS JOIN ( SELECT s.staff_id,
            s.first_name,
            s.last_name
           FROM (public.staff s
             JOIN public.user_roles ur ON ((ur.user_id = s.auth_user_id)))
          WHERE ((ur.role = 'admin'::public.app_role) AND (s.is_active = true) AND (s.auth_user_id IS NOT NULL))) s_admin)
  WHERE ((s_new.is_active = true) AND (s_new.created_at >= (now() - '30 days'::interval)) AND (s_new.staff_id <> s_admin.staff_id));


--
--
-- Name: vw_wo_budget_hours_by_category; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_wo_budget_hours_by_category WITH (security_invoker='on') AS
 SELECT wo.wo_id,
    wo.engagement_id,
    awc.category_id,
    c.category_name,
    c.display_order AS category_display_order,
    sum(awc.budget_hours) AS total_budget_hours
   FROM (((public.work_orders wo
     JOIN public.activity_worksheets aw ON ((aw.wo_id = wo.wo_id)))
     JOIN public.activity_worksheet_cells awc ON ((awc.worksheet_id = aw.id)))
     JOIN public.categories c ON ((c.category_id = awc.category_id)))
  WHERE (awc.budget_hours > (0)::numeric)
  GROUP BY wo.wo_id, wo.engagement_id, awc.category_id, c.category_name, c.display_order;


--
--
-- Name: wo_budget_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_budget_lines (
    wo_line_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wo_id uuid NOT NULL,
    category_id uuid NOT NULL,
    budgeted_hours numeric(10,2) DEFAULT 0 NOT NULL,
    standard_rate numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: wo_expense_budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_expense_budget (
    wo_exp_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wo_id uuid NOT NULL,
    expense_type_id uuid NOT NULL,
    budgeted_amount numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: wo_payment_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_payment_installments (
    installment_id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    wo_id uuid NOT NULL,
    installment_number integer NOT NULL,
    agreed_invoice_date date,
    agreed_payment_date date,
    collection_invoice_date date,
    collection_payment_date date,
    payment_date_actual date,
    percentage numeric DEFAULT 0 NOT NULL,
    amount numeric,
    status text DEFAULT 'Pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT wo_payment_installments_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Invoiced'::text, 'Completed'::text, 'Overdue'::text])))
);


--
--
-- Name: wo_payment_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_payment_plan (
    plan_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wo_id uuid NOT NULL,
    exchange_rate numeric,
    payment_days integer DEFAULT 30 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
--
-- Name: wo_staffing_requirement_skills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_staffing_requirement_skills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requirement_id uuid NOT NULL,
    skill_id uuid NOT NULL,
    min_proficiency_level text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_staffing_requirement_skills_min_proficiency_level_check CHECK ((min_proficiency_level = ANY (ARRAY['Beginner'::text, 'Intermediate'::text, 'Advanced'::text])))
);


--
--
-- Name: wo_staffing_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wo_staffing_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wo_id uuid NOT NULL,
    category_id uuid NOT NULL,
    staff_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wo_staffing_requirements_staff_count_check CHECK (((staff_count >= 1) AND (staff_count <= 999)))
);


--
--
-- Name: work_order_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.work_order_summary AS
SELECT
    NULL::uuid AS wo_id,
    NULL::uuid AS engagement_id,
    NULL::text AS currency,
    NULL::character varying(4) AS season_mode,
    NULL::numeric(5,4) AS tax_rate,
    NULL::numeric(15,2) AS adjustment_amount,
    NULL::text AS notes,
    NULL::timestamp with time zone AS created_at,
    NULL::timestamp with time zone AS updated_at,
    NULL::character varying(20) AS approval_status,
    NULL::uuid AS approved_by,
    NULL::timestamp with time zone AS approved_at,
    NULL::numeric AS total_standard_fee,
    NULL::numeric AS realization_percent,
    NULL::numeric AS fee_with_tax_gross_up;


--
