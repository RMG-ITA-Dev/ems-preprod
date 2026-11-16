-- BUG 0817-180 (bugs/0817-180/plan_v2.md): restringe sociedad/practica/oficina de un encargo a
-- la ficha del creador. Un solo trigger BEFORE INSERT OR UPDATE cubre el RPC (SECURITY DEFINER,
-- inserta en public.engagements) y el INSERT/UPDATE REST directo con una sola regla autoritativa.
--
-- INSERT: exige engagement.create (el RPC lo saltea via SECURITY DEFINER) y, para todo role_key
-- distinto de admin/senior_partner, exige que society_id/practica/oficina coincidan EXACTAMENTE
-- con lo derivado de la ficha del llamante (staff.society_id / staff.practica_id -> practicas.code
-- / staff.city -> 1|2). Perfil incompleto o practica inactiva -> rechazo (fail-closed).
--
-- UPDATE: asimetrico, espejo de lo que la UI ya permite hoy (0722-157) — society_id lo sigue
-- editando solo admin; oficina/practica quedan inmutables para TODOS, incluido admin (ninguna UI
-- los ha ofrecido nunca editables a nadie).
CREATE FUNCTION public.enforce_engagement_profile_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_role          text;
  v_staff_id      uuid;
  v_society_id    uuid;
  v_practica_id   uuid;
  v_city          text;
  v_practica_code smallint;
  v_oficina       smallint;
  v_manager_role  text;
  v_manager_society uuid;
BEGIN
  -- Sin identidad autenticada no hay perfil que comparar: seeds, imports, migraciones y
  -- cualquier operación con service_role pasan intactas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_role_key();

  -- 1110-220 (plan_v5 §6.1, 2026-11-12): quién puede quedar en manager_id depende de la función del encargo.
  --   · No-Cliente (0/2/3): manager_id es el "Aprobador de horas". Obligatorio y elegido entre 14 roles, igual
  --     para admin, hr_manager y hr_analyst (no hay autoasignación). De CUALQUIER sociedad (operador 2026-11-16: Talento
  --     Humano y Riesgos aprueban encargos de otra sociedad); la unica excepcion es Contabilidad, que por su alcance por
  --     sociedad no vería uno de otra.
  --   · Cliente (1 o NULL): el pool de Gerente de siempre (manager, ita_manager, tax_manager) y, por decision del
  --     operador (2026-11-16), director: tambien puede ser Gerente/Supervisor de un encargo de Cliente.
  -- En ambos: staff activo, no borrado, con cuenta vinculada y rol activo. Corre al crear y cuando cambia la
  -- persona; un asignado que luego pierde elegibilidad queda guardado pero no se puede volver a elegir. Espejo de
  -- get_hours_approver_candidates() / get_engagement_team_candidates() y de EngagementForm.
  -- En no-Cliente también corre cuando cambia la sociedad (review de Codex, 2026-11-12): admin edita society_id
  -- solo, y sin esto el Aprobador de la sociedad vieja quedaba guardado. En Cliente la sociedad no restringe al
  -- Gerente, así que cambiarla no revalida.
  IF TG_OP = 'INSERT'
     OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
     OR (COALESCE(NEW.funcion, 1) <> 1 AND NEW.society_id IS DISTINCT FROM OLD.society_id) THEN
    IF COALESCE(NEW.funcion, 1) <> 1 AND NEW.manager_id IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: el Aprobador de horas es obligatorio en un encargo Administrativa, Capacitacion o Calidad'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.manager_id IS NOT NULL THEN
      SELECT ur.role_key, s.society_id INTO v_manager_role, v_manager_society
        FROM public.staff s
        JOIN public.user_roles ur          ON ur.user_id  = s.auth_user_id
        JOIN public.authorization_roles ar ON ar.role_key = ur.role_key AND ar.is_active
       WHERE s.staff_id = NEW.manager_id
         AND s.is_active
         AND s.deleted_at IS NULL;

      IF COALESCE(NEW.funcion, 1) <> 1 THEN
        IF NOT (COALESCE(v_manager_role, '') = ANY (public.hours_approver_role_keys())) THEN
          RAISE EXCEPTION 'FORBIDDEN: Aprobador de horas no valido para un encargo Administrativa, Capacitacion o Calidad'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF public.is_society_scoped_role_key(v_manager_role) AND v_manager_society IS DISTINCT FROM NEW.society_id THEN
          RAISE EXCEPTION 'FORBIDDEN: el Aprobador de horas debe ser de la sociedad del encargo'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      ELSIF NOT (COALESCE(v_manager_role, '') = ANY (ARRAY['manager', 'ita_manager', 'tax_manager', 'director'])) THEN
        RAISE EXCEPTION 'FORBIDDEN: Gerente no valido para un encargo de Cliente'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  -- 1110-220 (plan_v5, reemplaza N15): approval_required ya no se fuerza en no-Cliente. Lo eligen admin o el
  -- Talento Humano creador al crear; apagado, el envío autoaprueba las líneas.

  IF TG_OP = 'INSERT' THEN
    -- El RPC create_engagement_with_code es SECURITY DEFINER y saltea la RLS de INSERT
    -- ("engagements write insert" exige engagement.create); replicar el mismo chequeo acá cierra
    -- ese hueco tanto para el RPC como para un INSERT REST directo.
    IF NOT public.has_permission('engagement.create') THEN
      RAISE EXCEPTION 'FORBIDDEN: falta el permiso engagement.create'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Analista de Talento Humano: engagement.create es SOLO para encargos Administrativa,
    -- Capacitación y Calidad (funcion 0/2/3); los de Cliente no los crea ni los ve (decisión del
    -- operador, 27/10/2026). funcion NULL se lee como Cliente en todo el sistema, así que también
    -- se rechaza. Espejo de EngagementNew.tsx, que fuerza el modo administrativo para este rol.
    IF v_role = 'hr_analyst' AND COALESCE(NEW.funcion, 1) = 1 THEN
      RAISE EXCEPTION 'FORBIDDEN: el Analista de Talento Humano solo puede crear encargos Administrativa, Capacitacion o Calidad'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 1110-220 (plan_v3, N9, 2026-11-11): el Gerente de Talento Humano tampoco crea encargos de
    -- Cliente, igual que el Analista: TH solo gestiona Administrativa/Capacitación/Calidad. Bloque
    -- propio para no tocar el mensaje del Analista (test #18). Espejo de
    -- ADMINISTRATIVE_ONLY_CREATOR_ROLE_KEYS.
    IF v_role = 'hr_manager' AND COALESCE(NEW.funcion, 1) = 1 THEN
      RAISE EXCEPTION 'FORBIDDEN: el Gerente de Talento Humano solo puede crear encargos Administrativa, Capacitacion o Calidad'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 1110-220 (plan_v3, N1, 2026-11-11): los encargos no-Cliente (funcion 0/2/3) los crean SOLO
    -- Sistemas (admin) y Talento Humano (hr_manager, hr_analyst). Ni el Gerente normal, ni ITA/Tax,
    -- ni Contabilidad, Riesgos o Secretaría: esos solo aprueban las horas de lo que gerencian.
    -- Espejo de ADMINISTRATIVE_CREATOR_ROLE_KEYS (src/lib/engagementRoleAccess.ts). La funcion es
    -- inmutable después de crear (0722-160), así que basta con el INSERT.
    IF COALESCE(NEW.funcion, 1) <> 1
       AND v_role NOT IN ('admin', 'hr_manager', 'hr_analyst') THEN
      RAISE EXCEPTION 'FORBIDDEN: solo Talento Humano y Sistemas crean encargos Administrativa, Capacitacion o Calidad'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 1110-220 (plan_v3, N13, 2026-11-11): Talento Humano crea Administrativa y Capacitación, NO
    -- Control de Calidad (funcion 3), que queda solo para admin.
    IF NEW.funcion = 3 AND v_role IN ('hr_manager', 'hr_analyst') THEN
      RAISE EXCEPTION 'FORBIDDEN: Talento Humano no crea encargos de Control de Calidad'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 1110-220 (plan_v3 N14/N16, plan_v5 Q3): la "Política de Planilla" (switches del final del alta) es de admin.
    -- Todo encargo que crea otro rol exige OT aprobada por el Socio para cargar horas y aprobación de
    -- las líneas de horas, SALVO un no-Cliente creado por Talento Humano: TH elige al crear si lleva OT
    -- y si sus horas requieren aprobación.
    IF v_role IS DISTINCT FROM 'admin'
       AND NOT (v_role IN ('hr_manager', 'hr_analyst') AND COALESCE(NEW.funcion, 1) <> 1) THEN
      NEW.work_order_required := true;
      NEW.approval_required   := true;
    END IF;

    -- Super Admin (role_key = 'admin') y Senior Partner eligen sociedad/practica/oficina libres.
    -- senior_partner no tiene engagement.create en el seed vigente (decisión del operador,
    -- 0817-180 OQ2/OQ6): el chequeo de arriba ya lo rechaza antes de llegar acá, pero la exención
    -- queda escrita por corrección — cumple la letra del bug aunque hoy sea inalcanzable.
    IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'senior_partner' THEN
      SELECT s.staff_id, s.society_id, s.practica_id, s.city
        INTO v_staff_id, v_society_id, v_practica_id, v_city
        FROM public.staff s
       WHERE s.staff_id = public.get_my_staff_id();

      IF v_staff_id IS NULL OR v_society_id IS NULL OR v_practica_id IS NULL OR v_city IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: tu ficha de personal no tiene sociedad, practica u oficina configuradas — no se puede crear el encargo'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      SELECT p.code INTO v_practica_code
        FROM public.practicas p
       WHERE p.practica_id = v_practica_id AND p.is_active;

      IF v_practica_code IS NULL THEN
        RAISE EXCEPTION 'FORBIDDEN: la practica de tu ficha de personal no esta activa en el catalogo'
          USING ERRCODE = 'insufficient_privilege';
      END IF;

      v_oficina := CASE v_city WHEN 'La Paz' THEN 1 WHEN 'Santa Cruz' THEN 2 ELSE NULL END;

      IF NEW.society_id IS DISTINCT FROM v_society_id
         OR NEW.practica  IS DISTINCT FROM v_practica_code
         OR NEW.oficina   IS DISTINCT FROM v_oficina
      THEN
        RAISE EXCEPTION 'FORBIDDEN: sociedad/practica/oficina del encargo deben coincidir exactamente con tu ficha de personal'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'. Solo se inspecciona el CAMBIO de estas tres columnas (IS DISTINCT FROM
  -- contra OLD) — un update que no las toca (nombre, fechas, equipo, etc.) nunca entra acá, así
  -- que no bloquea actualizaciones legítimas de encargos ajenos.

  -- 0722-157, sin cambios: society_id lo sigue editando solo admin tras la creación.
  IF NEW.society_id IS DISTINCT FROM OLD.society_id AND v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: solo Admin puede modificar la sociedad de un encargo existente'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Ninguna UI ha ofrecido nunca editar oficina/practica a nadie (disabled={isEdit} sin
  -- excepción de rol) — el guard de BD no abre una vía nueva que la UI nunca tuvo, ni siquiera
  -- para admin: cambiarlas desincronizaría engagement_code de sus dígitos.
  IF NEW.oficina IS DISTINCT FROM OLD.oficina OR NEW.practica IS DISTINCT FROM OLD.practica THEN
    RAISE EXCEPTION 'FORBIDDEN: oficina y practica son inmutables una vez creado el encargo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;


COMMENT ON FUNCTION public.enforce_engagement_profile_scope() IS 'BUG 0817-180: en INSERT exige engagement.create, rechaza funcion Cliente (1 o NULL) para hr_analyst y (1110-220) hr_manager; (1110-220) rechaza funcion no-Cliente para todo rol distinto de admin/hr_manager/hr_analyst y funcion 3 (Control de Calidad) para Talento Humano; fuerza work_order_required/approval_required=true en lo que crea todo rol distinto de admin, salvo un no-Cliente de Talento Humano (elige ambos); valida manager_id (1110-220 plan_v5): en no-Cliente es el Aprobador de horas, obligatorio, de 14 roles y de la sociedad del encargo (se revalida también cuando cambia la sociedad); en Cliente, manager/ita_manager/tax_manager; siempre staff activo, no borrado, con cuenta y rol activo; y, para role_key distinto de admin/senior_partner, que society_id/practica/oficina coincidan con la ficha del creador (staff.society_id/practica_id->code/city->1|2); perfil incompleto o practica inactiva rechaza (fail-closed). En UPDATE, asimetrico: society_id solo lo edita admin (0722-157); oficina/practica quedan inmutables para todos. Exento: auth.uid() IS NULL (seeds/migraciones/service_role).';


GRANT ALL ON FUNCTION public.enforce_engagement_profile_scope() TO anon;
GRANT ALL ON FUNCTION public.enforce_engagement_profile_scope() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_engagement_profile_scope() TO service_role;


CREATE TRIGGER trg_engagements_profile_scope BEFORE INSERT OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.enforce_engagement_profile_scope();


-- Cierra el acceso anónimo al RPC: el escape `auth.uid() IS NULL` del trigger de arriba (necesario
-- para seeds/imports/service_role) convertiría el GRANT a `anon` en un bypass total del guard.
REVOKE ALL ON FUNCTION public.create_engagement_with_code(p_engagement_name text, p_client_id uuid, p_partner_id uuid, p_manager_id uuid, p_start_date date, p_end_date date, p_status text, p_oficina smallint, p_practica smallint, p_funcion smallint, p_anio_fiscal integer, p_work_order_required boolean, p_activity_required boolean, p_is_internal boolean, p_approval_required boolean, p_fecha_cierre date, p_anio_fiscal_override boolean, p_society_id uuid, p_sqr_id uuid, p_encargado_id uuid, p_specialist_it_id uuid, p_specialist_tax_id uuid, p_contract_file_path text, p_taxonomy_id uuid) FROM anon;
