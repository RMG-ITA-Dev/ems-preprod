-- 0722-160: flujo de encargos administrativos.
--
-- Los encargos cuya funcion no es Cliente (1) son internos y usan solamente
-- los dos clientes internos de las sociedades. El trigger es la defensa en
-- profundidad frente a llamadas RPC/directas que no pasan por el formulario.

DO $$
BEGIN
  -- El flujo depende de las dos sociedades del catálogo base. Algunos mirrors
  -- históricos no ejecutaron ese seed; se asegura aquí de forma idempotente
  -- antes de resolver los clientes internos contra ellas.
  INSERT INTO public.society (name, is_active) VALUES
    ('Ruizmier Pelaez S.R.L.', true),
    ('Ruizmier Jauregui S.R.L.', true)
  ON CONFLICT (name) DO UPDATE
    SET is_active = true;

  -- Corrección de la primera versión de 0722-160: "Juaregui" fue un error
  -- ortográfico. Se conserva la fila antigua para no romper referencias,
  -- pero deja de ser elegible en catálogos activos.
  UPDATE public.society
     SET is_active = false
   WHERE name = 'Ruizmier Juaregui S.R.L.'
     AND EXISTS (
       SELECT 1
         FROM public.society canonical
        WHERE canonical.name = 'Ruizmier Jauregui S.R.L.'
     );

  -- El mirror conserva un cliente histórico con el NIT correcto y el sufijo
  -- "ADMIN". Se conserva su id (y por tanto sus relaciones) y se normaliza al
  -- nombre oficial de su sociedad antes de validar/sembrar el catálogo.
  UPDATE public.clients c
     SET client_legal_name = s.name,
         is_active = true
    FROM (VALUES
      ('Ruizmier Pelaez S.R.L.'::text, '1006979026'::text),
      ('Ruizmier Jauregui S.R.L.'::text, '184046021'::text)
    ) AS v(society_name, nit)
    JOIN public.society s ON s.name = v.society_name
   WHERE c.unique_tax_id = v.nit
     AND lower(trim(c.client_legal_name)) <> lower(trim(s.name));

  INSERT INTO public.clients (client_legal_name, unique_tax_id, is_active)
  SELECT s.name, v.nit, true
    FROM (VALUES
      ('Ruizmier Pelaez S.R.L.'::text, '1006979026'::text),
      ('Ruizmier Jauregui S.R.L.'::text, '184046021'::text)
    ) AS v(society_name, nit)
    JOIN public.society s ON s.name = v.society_name
   WHERE NOT EXISTS (
     SELECT 1
       FROM public.clients c
      WHERE c.unique_tax_id = v.nit
         OR lower(trim(c.client_legal_name)) = lower(trim(s.name))
   );

  IF NOT EXISTS (
    SELECT 1
      FROM public.clients c
      JOIN public.society s ON s.name = 'Ruizmier Pelaez S.R.L.'
     WHERE lower(trim(c.client_legal_name)) = lower(trim(s.name))
       AND c.unique_tax_id = '1006979026'
  ) OR NOT EXISTS (
    SELECT 1
      FROM public.clients c
      JOIN public.society s ON s.name = 'Ruizmier Jauregui S.R.L.'
     WHERE lower(trim(c.client_legal_name)) = lower(trim(s.name))
       AND c.unique_tax_id = '184046021'
  ) THEN
    RAISE EXCEPTION '0722-160: los clientes internos de sociedad ya existen con un nombre o NIT incompatible';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.enforce_administrative_engagement_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_client_nit text;
  v_society_name text;
BEGIN
  IF NEW.funcion IS NULL OR NEW.funcion = 1 THEN
    RETURN NEW;
  END IF;

  -- Do not make historical administrative rows uneditable merely because their
  -- original client/society predates this flow. A new administrative row, or a
  -- change to its function/client/society, must use the controlled mapping.
  IF TG_OP = 'UPDATE'
     AND OLD.funcion = NEW.funcion
     AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id
     AND OLD.society_id IS NOT DISTINCT FROM NEW.society_id THEN
    NEW.is_internal := true;
    NEW.activity_required := false;
    RETURN NEW;
  END IF;

  SELECT c.unique_tax_id, s.name
    INTO v_client_nit, v_society_name
    FROM public.clients c
    JOIN public.society s ON s.society_id = NEW.society_id
   WHERE c.client_id = NEW.client_id;

  IF (v_society_name = 'Ruizmier Pelaez S.R.L.' AND v_client_nit = '1006979026')
     OR (v_society_name = 'Ruizmier Jauregui S.R.L.' AND v_client_nit = '184046021') THEN
    NEW.is_internal := true;
    NEW.activity_required := false;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '0722-160: el cliente interno debe corresponder a la sociedad del encargo';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_administrative_engagement_rules ON public.engagements;
CREATE TRIGGER trg_enforce_administrative_engagement_rules
  BEFORE INSERT OR UPDATE OF funcion, client_id, society_id, is_internal, activity_required
  ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_administrative_engagement_rules();

COMMENT ON FUNCTION public.enforce_administrative_engagement_rules() IS
  '0722-160: para funciones Administrativa/Capacitacion/Calidad exige el cliente interno de su sociedad y fuerza interno=true/activity_required=false.';

-- `tr_wo_guard_risk_approval` corre antes que el trigger administrativo por
-- orden alfabético. Mantiene su bloqueo para Cliente, pero deja pasar una OT
-- administrativa para que el trigger siguiente descarte cualquier dato Riesgos.
CREATE OR REPLACE FUNCTION public.wo_guard_risk_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.engagements e
     WHERE e.engagement_id = NEW.engagement_id
       AND e.funcion IS NOT NULL
       AND e.funcion <> 1
  ) THEN
    RETURN NEW;
  END IF;

  IF (
    (NEW.risk_approved_by IS DISTINCT FROM OLD.risk_approved_by AND NEW.risk_approved_by IS NOT NULL)
    OR (NEW.risk_status IS DISTINCT FROM OLD.risk_status
        AND NEW.risk_status IN ('Approved', 'Rejected', 'Emergency_Approved'))
    OR (NEW.emergency_review_by IS DISTINCT FROM OLD.emergency_review_by AND NEW.emergency_review_by IS NOT NULL)
    OR (NEW.emergency_partner_by IS DISTINCT FROM OLD.emergency_partner_by AND NEW.emergency_partner_by IS NOT NULL)
  ) AND NOT public.can_approve_wo_risk(NEW.engagement_id) THEN
    RAISE EXCEPTION 'Solo un aprobador de Riesgos autorizado puede aprobar o rechazar la seccion de Riesgos de esta OT';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_administrative_work_order_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_funcion smallint;
BEGIN
  SELECT funcion INTO v_funcion
    FROM public.engagements
   WHERE engagement_id = NEW.engagement_id;

  IF v_funcion IS NOT NULL AND v_funcion <> 1 THEN
    -- Las OTs administrativas pueden presupuestar gastos, pero no facturan ni
    -- pasan por Riesgos. Pending representa una pista no aplicable, no aprobada.
    NEW.risk_status := 'Pending';
    NEW.risk_approved_by := NULL;
    NEW.risk_approved_at := NULL;
    NEW.ceac_completed_at := NULL;
    NEW.ceac_notes := NULL;
    NEW.ceac_number := NULL;
    NEW.san_completed_at := NULL;
    NEW.san_notes := NULL;
    NEW.san_approval_id := NULL;
    NEW.risk_level := NULL;
    NEW.risk_notes := NULL;
    NEW.emergency_deadline_at := NULL;
    NEW.emergency_justification := NULL;
    NEW.emergency_review_by := NULL;
    NEW.emergency_review_at := NULL;
    NEW.emergency_partner_by := NULL;
    NEW.emergency_partner_at := NULL;

    -- Para administrativas, la firma del Socio cierra la OT sin una segunda
    -- aprobación. Cliente conserva el motor de dos pistas.
    IF TG_OP = 'UPDATE'
       AND NEW.approved_at IS NOT NULL
       AND OLD.approved_at IS NULL THEN
      NEW.approval_status := 'Approved';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_administrative_work_order_rules ON public.work_orders;
CREATE TRIGGER trg_enforce_administrative_work_order_rules
  BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_administrative_work_order_rules();

-- Repara OTs administrativas creadas antes de instalar esta regla. El trigger
-- limpia los metadatos de Riesgos al ejecutar este update.
UPDATE public.work_orders wo
   SET risk_status = 'Pending'
  FROM public.engagements e
 WHERE e.engagement_id = wo.engagement_id
   AND e.funcion IS NOT NULL
   AND e.funcion <> 1
   AND (
     wo.risk_status IS DISTINCT FROM 'Pending'
     OR wo.risk_level IS NOT NULL
     OR wo.risk_approved_by IS NOT NULL
     OR wo.risk_approved_at IS NOT NULL
     OR wo.ceac_completed_at IS NOT NULL
     OR wo.ceac_notes IS NOT NULL
     OR wo.ceac_number IS NOT NULL
     OR wo.san_completed_at IS NOT NULL
     OR wo.san_notes IS NOT NULL
     OR wo.san_approval_id IS NOT NULL
     OR wo.risk_notes IS NOT NULL
     OR wo.emergency_deadline_at IS NOT NULL
     OR wo.emergency_justification IS NOT NULL
     OR wo.emergency_review_by IS NOT NULL
     OR wo.emergency_review_at IS NOT NULL
     OR wo.emergency_partner_by IS NOT NULL
     OR wo.emergency_partner_at IS NOT NULL
   );

-- Una OT administrativa histórica puede tener firma de Socio pero haber quedado
-- Pending esperando Riesgos. Al eliminar esa segunda pista, queda aprobada.
UPDATE public.work_orders wo
   SET approval_status = 'Approved'
  FROM public.engagements e
 WHERE e.engagement_id = wo.engagement_id
   AND e.funcion IS NOT NULL
   AND e.funcion <> 1
   AND wo.approval_status = 'Pending_Approval'
   AND wo.approved_at IS NOT NULL;

COMMENT ON FUNCTION public.enforce_administrative_work_order_rules() IS
  '0722-160: OTs administrativas omiten Riesgos; la aprobación del Socio las cierra.';

CREATE OR REPLACE FUNCTION public.list_administrative_engagements()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_can_see_history boolean;
  v_current_fiscal_year int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_can_see_history := public.has_permission('engagement.create');

  -- Espejo de getCurrentFiscalPeriod() (src/lib/fiscalCalculations.ts): el año
  -- fiscal corre de octubre a septiembre; de octubre en adelante ya es el
  -- fiscal del año calendario siguiente.
  v_current_fiscal_year := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 10 THEN EXTRACT(YEAR FROM now())::int + 1
    ELSE EXTRACT(YEAR FROM now())::int
  END;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'engagement_id', e.engagement_id,
          'engagement_code', e.engagement_code,
          'engagement_name', e.engagement_name,
          'funcion', e.funcion,
          'society_id', e.society_id,
          'society_name', s.name,
          'client_id', e.client_id,
          'client_name', c.client_legal_name,
          'oficina', e.oficina,
          'practica', e.practica,
          'practica_name', p.name,
          'anio_fiscal', e.anio_fiscal,
          'start_date', e.start_date,
          'end_date', e.end_date,
          'status', e.status
        )
        ORDER BY e.created_at DESC NULLS LAST, e.engagement_id
      )
        FROM public.engagements e
        JOIN public.clients c ON c.client_id = e.client_id
        JOIN public.society s ON s.society_id = e.society_id
        LEFT JOIN public.practicas p ON p.code = e.practica
       WHERE e.funcion <> 1
         AND (v_can_see_history OR (e.anio_fiscal IS NOT NULL AND e.anio_fiscal >= v_current_fiscal_year))
    ),
    '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.list_administrative_engagements() IS
  '0722-160: listado minimo de encargos Administrativa/Capacitacion/Calidad. Quien tiene engagement.create ve todo el historico; el resto solo ve anio_fiscal vigente o futuro (espejo server-side del filtro que antes vivia solo en el frontend). No concede acceso al detalle.';

REVOKE ALL ON FUNCTION public.list_administrative_engagements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_administrative_engagements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_administrative_engagements() TO service_role;

-- Review fix (Codex): hr_manager/hr_analyst reciben engagement.create justamente para crear
-- encargos Administrativa/Capacitacion (20260826221706), pero nunca recibieron client.read
-- (misma migracion). El selector de cliente interno de EngagementForm filtra sobre useClients(),
-- que corre bajo RLS -- para esos dos roles vuelve vacio, asi que no pueden completar client_id
-- y la creacion queda bloqueada pese a tener el permiso pensado para este flujo exacto.
-- Se resuelve con un RPC angosto (mismo patron que list_administrative_engagements): expone
-- solo los dos clientes internos controlados, nunca la cartera real, a cualquiera con
-- engagement.create -- evita ademas otorgar client.read de alcance amplio solo para esto.
CREATE OR REPLACE FUNCTION public.list_administrative_internal_clients()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'client_id', c.client_id,
        'client_legal_name', c.client_legal_name,
        'unique_tax_id', c.unique_tax_id,
        'is_active', c.is_active
      )
      ORDER BY c.client_legal_name
    ),
    '[]'::jsonb
  )
    FROM public.clients c
   WHERE c.unique_tax_id IN ('1006979026', '184046021')
     AND public.has_permission('engagement.create');
$$;

COMMENT ON FUNCTION public.list_administrative_internal_clients() IS
  '0722-160: expone unicamente los dos clientes internos de sociedad (Pelaez/Jauregui) a quien tiene engagement.create, sin depender de client.read -- hr_manager/hr_analyst tienen engagement.create para este flujo pero no client.read, y otorgarles client.read general expondria la cartera completa en vez de solo los dos clientes controlados.';

REVOKE ALL ON FUNCTION public.list_administrative_internal_clients() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_administrative_internal_clients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_administrative_internal_clients() TO service_role;

-- Review fix (Codex): el trigger de arriba (enforce_administrative_work_order_rules) ya limpia
-- Riesgos en OTs administrativas segun su propio comentario ("no facturan ni pasan por Riesgos"),
-- pero el "no facturan" solo se aplicaba en la UI (WorkOrderForm oculta la pestana de plan de
-- pagos para isAdministrative). La policy "Manager can manage payment plans"
-- (20260908150000_0722-156b) solo chequea e.manager_id, sin mirar funcion -- un gerente de
-- encargo administrativo puede insertar wo_payment_plan/wo_payment_installments via llamada
-- directa. Este trigger cierra esa escritura a nivel de base, simetrico al de Riesgos.
CREATE OR REPLACE FUNCTION public.enforce_administrative_no_payment_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_funcion smallint;
BEGIN
  SELECT e.funcion INTO v_funcion
    FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
   WHERE wo.wo_id = NEW.wo_id;

  IF v_funcion IS NOT NULL AND v_funcion <> 1 THEN
    RAISE EXCEPTION '0722-160: las OTs administrativas no facturan; no admiten plan de pagos';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_administrative_no_payment_plan() IS
  '0722-160: defensa en profundidad -- bloquea a nivel de base la escritura de wo_payment_plan para OTs administrativas; hasta ahora solo la UI ocultaba la pestana.';

DROP TRIGGER IF EXISTS trg_enforce_administrative_no_payment_plan ON public.wo_payment_plan;
CREATE TRIGGER trg_enforce_administrative_no_payment_plan
  BEFORE INSERT OR UPDATE ON public.wo_payment_plan
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_administrative_no_payment_plan();
