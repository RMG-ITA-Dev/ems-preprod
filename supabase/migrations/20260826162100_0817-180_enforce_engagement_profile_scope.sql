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
BEGIN
  -- Sin identidad autenticada no hay perfil que comparar: seeds, imports, migraciones y
  -- cualquier operación con service_role pasan intactas.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_role_key();

  IF TG_OP = 'INSERT' THEN
    -- El RPC create_engagement_with_code es SECURITY DEFINER y saltea la RLS de INSERT
    -- ("engagements write insert" exige engagement.create); replicar el mismo chequeo acá cierra
    -- ese hueco tanto para el RPC como para un INSERT REST directo.
    IF NOT public.has_permission('engagement.create') THEN
      RAISE EXCEPTION 'FORBIDDEN: falta el permiso engagement.create'
        USING ERRCODE = 'insufficient_privilege';
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


COMMENT ON FUNCTION public.enforce_engagement_profile_scope() IS 'BUG 0817-180: en INSERT exige engagement.create y, para role_key distinto de admin/senior_partner, que society_id/practica/oficina coincidan con la ficha del creador (staff.society_id/practica_id->code/city->1|2); perfil incompleto o practica inactiva rechaza (fail-closed). En UPDATE, asimetrico: society_id solo lo edita admin (0722-157); oficina/practica quedan inmutables para todos. Exento: auth.uid() IS NULL (seeds/migraciones/service_role).';


GRANT ALL ON FUNCTION public.enforce_engagement_profile_scope() TO anon;
GRANT ALL ON FUNCTION public.enforce_engagement_profile_scope() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_engagement_profile_scope() TO service_role;


CREATE TRIGGER trg_engagements_profile_scope BEFORE INSERT OR UPDATE ON public.engagements FOR EACH ROW EXECUTE FUNCTION public.enforce_engagement_profile_scope();


-- Cierra el acceso anónimo al RPC: el escape `auth.uid() IS NULL` del trigger de arriba (necesario
-- para seeds/imports/service_role) convertiría el GRANT a `anon` en un bypass total del guard.
REVOKE ALL ON FUNCTION public.create_engagement_with_code(p_engagement_name text, p_client_id uuid, p_partner_id uuid, p_manager_id uuid, p_start_date date, p_end_date date, p_status text, p_oficina smallint, p_practica smallint, p_funcion smallint, p_anio_fiscal integer, p_work_order_required boolean, p_activity_required boolean, p_is_internal boolean, p_approval_required boolean, p_fecha_cierre date, p_anio_fiscal_override boolean, p_society_id uuid, p_sqr_id uuid, p_encargado_id uuid, p_specialist_it_id uuid, p_specialist_tax_id uuid, p_contract_file_path text, p_taxonomy_id uuid) FROM anon;
