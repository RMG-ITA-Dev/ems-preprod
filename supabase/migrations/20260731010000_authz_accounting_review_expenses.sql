-- =====================================================================
-- Fondos — Contabilidad puede revisar facturas y ver la OT de la solicitud
--
-- Síntoma reportado (2026-07-31), como Gerente de Contabilidad:
--   (a) Revisa una factura, ve el toast "Factura revisada", y el estado NO cambia:
--       la solicitud sigue con "1 por revisar" y el gasto en "Aprobado Gerente".
--   (b) La columna "Orden de Trabajo" del listado de gastos y el desplegable del
--       detalle muestran "-" / "(OT sin acceso al detalle del encargo)".
--
-- Son CUATRO bloqueos encadenados. Los cuatro se resuelven gateando por los
-- permisos de la matriz (`expense_settlement.read` / `.update`, que tienen admin,
-- accounting_manager y accounting_analyst) en lugar de `is_admin()`.
--
-- ── (a) La revisión no persistía ──
--
--   1. Sin policy de UPDATE. Ola D (20260724100000) le dio a Contabilidad SELECT
--      sobre fund_request_expenses (fre_select_accounting) pero NO update. Las
--      únicas policies de UPDATE eran fre_update_requester, fre_update_manager y
--      fre_update_admin. RLS no lanza error al bloquear un UPDATE: afecta 0 filas
--      y PostgREST responde 204 sin error, así que la mutación resolvía y la UI
--      cantaba éxito. (El frontend tampoco verificaba filas afectadas; se corrige
--      en el mismo commit con `assertAffected` en las 11 mutaciones del archivo.)
--
--   2. El trigger fre_validate_transition (20260610170000) exigía is_admin() para
--      tocar los campos de revisión. Ese guard se escribió cuando "asistente
--      contable" se modelaba como admin; con los roles reales del catálogo, el
--      Gerente y el Analista quedaban fuera. Incluso con la policy del punto 1, la
--      revisión habría fallado con
--      'Solo contabilidad puede modificar los campos de revisión del gasto'.
--
-- ── (b) La OT venía vacía ──
--
-- El embed es una CADENA de tres eslabones:
--     fund_request_work_orders → work_order:work_orders → engagement:engagements
-- y faltaban los dos últimos:
--
--   3. `work_orders`: solo se abre a Contabilidad por la policy "Staff can view
--      fund request work orders" (20260610190000), cuyo helper
--      `wo_in_my_fund_request` admitía únicamente al solicitante y al gerente de
--      la OT. Contabilidad no es ninguno, y NO tiene `work_order.read` en la
--      matriz. Con `work_order` en null, `work_order.engagement` es null por
--      construcción — el eslabón del medio hacía inútil cualquier arreglo del
--      último.
--
--   4. `engagements`: `engagement_in_my_fund_request` (20260731000000) tenía la
--      misma limitación.
--
-- Decisión del negocio (2026-07-31): el Gerente Y el Analista de Contabilidad
-- deben ver la OT y su encargo, siempre ligados a la solicitud en la que trabajan.
--
-- Se conserva el alcance angosto que motivó 20260610190000 (no exponer cliente,
-- NIT, presupuesto y notas de TODAS las OT aprobadas): solo las de solicitudes en
-- fase contable, y nunca en 'borrador' — si no, cualquiera crea un borrador, le
-- agrega una OT aprobada y lee sus datos.
--
-- Idempotente. Aplicar en Lovable o por SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) UPDATE de gastos para Contabilidad
-- ---------------------------------------------------------------------
-- Mismos estados que fre_select_accounting, para que pueda escribir exactamente
-- sobre lo que ya puede leer. Las columnas que puede tocar las sigue limitando el
-- trigger fre_validate_transition (punto 2).
drop policy if exists "fre_update_accounting" on public.fund_request_expenses;
create policy "fre_update_accounting" on public.fund_request_expenses
  for update to authenticated
  using (
    -- Gerente de Contabilidad (fund_disbursement.update): toda la fase contable.
    (public.has_permission('fund_disbursement.update')
      and exists (
        select 1 from public.fund_requests fr
        where fr.fund_request_id = fund_request_expenses.fund_request_id
          and fr.status = any (array['aprobado_gerente','fondos_entregados',
                                     'en_liquidacion','cerrado']::fund_request_status[])
      ))
    or
    -- Analista de Contabilidad (solo expense_settlement.update): hasta
    -- 'fondos_entregados'. Queda FUERA de 'en_liquidacion' y 'cerrado' — los tabs
    -- "En Liquidación" y "Cerrados" son del Gerente.
    (public.has_permission('expense_settlement.update')
      and exists (
        select 1 from public.fund_requests fr
        where fr.fund_request_id = fund_request_expenses.fund_request_id
          and fr.status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[])
      ))
  )
  with check (
    -- Gerente de Contabilidad (fund_disbursement.update): toda la fase contable.
    (public.has_permission('fund_disbursement.update')
      and exists (
        select 1 from public.fund_requests fr
        where fr.fund_request_id = fund_request_expenses.fund_request_id
          and fr.status = any (array['aprobado_gerente','fondos_entregados',
                                     'en_liquidacion','cerrado']::fund_request_status[])
      ))
    or
    -- Analista de Contabilidad (solo expense_settlement.update): hasta
    -- 'fondos_entregados'. Queda FUERA de 'en_liquidacion' y 'cerrado' — los tabs
    -- "En Liquidación" y "Cerrados" son del Gerente.
    (public.has_permission('expense_settlement.update')
      and exists (
        select 1 from public.fund_requests fr
        where fr.fund_request_id = fund_request_expenses.fund_request_id
          and fr.status = any (array['aprobado_gerente','fondos_entregados']::fund_request_status[])
      ))
  );

-- ---------------------------------------------------------------------
-- 2) El guard de columnas de revisión: por permiso, no por is_admin()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fre_validate_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me UUID := get_my_staff_id();
  v_is_requester BOOLEAN;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- (P1a) Un no-admin no puede ENCENDER el flag de devolución del asistente.
  IF NEW.returned_by_assistant AND NOT OLD.returned_by_assistant THEN
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

  RAISE EXCEPTION 'Transición de estado no permitida para el gasto: % -> %', OLD.status, NEW.status;
END;
$$;
-- ---------------------------------------------------------------------
-- 3) Contabilidad ve el encargo de las OT de la solicitud
-- ---------------------------------------------------------------------
-- Extiende el helper de 20260731000000: además del solicitante y del gerente de
-- la OT, Contabilidad (expense_settlement.read) sobre las solicitudes que ya
-- están en fase contable. Se mantiene la exclusión de 'borrador'.
create or replace function public.engagement_in_my_fund_request(p_engagement_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
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

-- ---------------------------------------------------------------------
-- 4) Contabilidad ve la OT de la solicitud (eslabón del medio de la cadena)
-- ---------------------------------------------------------------------
-- Sin esto el punto 3 no sirve de nada: si `work_orders` no es legible, el embed
-- `work_order` vuelve null y nunca se llega a `engagement`.
create or replace function public.wo_in_my_fund_request(p_wo_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
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

comment on function public.wo_in_my_fund_request(uuid) is
  'True si la OT está incluida en una solicitud de fondos ENVIADA donde el usuario '
  'es solicitante, gerente de esa OT, o Contabilidad (expense_settlement.read) con '
  'la solicitud en fase contable. Habilita el embed work_order de los selects de '
  'fondos sin abrir la tabla base work_orders.';

-- =====================================================================
-- VALIDACIÓN (impersonando al Gerente de Contabilidad)
--
--   begin;
--     select set_config('request.jwt.claims', '{"sub":"<UUID_CONTABILIDAD>"}', true);
--     select public.current_role_key();                     -- accounting_manager
--
--     -- 1) Ahora puede escribir: antes 0 filas
--     update public.fund_request_expenses
--        set reviewed_at = now(), has_invoice_observation = false, iva_penalty_amount = 0,
--            status = 'revisado_asistente'
--      where fre_id = '<GASTO_APROBADO_GERENTE>'
--     returning fre_id;                                     -- 1 fila
--
--     -- 3+4) La CADENA COMPLETA: primero la OT, después su encargo.
--     --      Si la primera vuelve vacía, la segunda no puede funcionar.
--     select wo.wo_id from public.work_orders wo
--      where public.wo_in_my_fund_request(wo.wo_id);          -- antes: 0 filas
--     select e.engagement_code, e.engagement_name
--     from public.engagements e
--     where public.engagement_in_my_fund_request(e.engagement_id);
--   rollback;
--
--   -- El guard sigue cerrado para quien NO es Contabilidad: un gerente de OT que
--   -- intente tocar iva_penalty_amount debe recibir
--   -- 'Solo contabilidad puede modificar los campos de revisión del gasto'.
--
--   -- En la app: como Gerente de Contabilidad, revisar la factura debe mover el
--   -- gasto a "Revisado" y bajar el contador "por revisar" a 0.
-- =====================================================================
