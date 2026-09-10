-- Bug 0722-156b (Fase 2) — review iteracion 12 (codex), hallazgo #1. No se reescribe la
-- migracion existente 20260905172820_0722-156b_add_payment_exchange_rates.sql (convencion
-- del proyecto: esa migracion ya se confirmo aplicada contra el Supabase de Test el
-- 2026-09-08 -- ver bugs/0722-156/review.md) -- esta migracion nueva reemplaza la funcion
-- del trigger via CREATE OR REPLACE, valido entre migraciones.
--
-- Hallazgo: el chequeo de aprobacion (v_exchange_rate_mode = 'variable' AND
-- v_approval_status IS DISTINCT FROM 'Approved') solo se evaluaba en modo variable. En
-- modo fijo, mientras la cuota siguiera 'Pending', no habia NINGUN chequeo de valor -- un
-- UPDATE directo (mismo rol de equipo que ya autoriza la policy RLS, sin chequear
-- approval_status) podia poner cualquier numero en invoice_exchange_rate/
-- payment_exchange_rate, rompiendo la garantia central de "Fijo": todas las cuotas deben
-- reflejar siempre el mismo TC congelado del plan. La UI nunca permite esto (en modo Fijo
-- las celdas de TC por cuota son de solo lectura, ver WorkOrderPaymentPlanSection.tsx) --
-- alcanzable solo via un UPDATE directo/malformado -- defensa en profundidad, no una
-- regresion de UI.
--
-- Fix: ademas del chequeo ya existente para modo variable, exigir en modo fijo que el
-- valor nuevo coincida exactamente con el TC vigente del plan (wo_payment_plan.
-- exchange_rate) -- en Fijo nunca existe una captura independiente por cuota.
--
-- Decision del operador 2026-09-10: la captura independiente por cuota (solo existe en
-- modo Variable, una vez aprobada la OT) queda reservada a collections_analyst (o
-- admin) -- "el departamento de contabilidad". En modo Fijo el valor nunca es una
-- captura independiente (es un espejo automatico del TC del plan, ya resincronizado
-- por el propio gerente al editar el plan), asi que ese caso NO exige este rol -- solo
-- el chequeo de coincidencia con el TC del plan de mas arriba.
--
-- MUST FIX review iteracion 14 #2: el chequeo de coincidencia en modo Fijo de arriba
-- solo se agrego en la ruta de UPDATE -- el branch de INSERT (mas abajo) solo validaba
-- status = 'Pending', nunca el TC, dejando el mismo bypass abierto para un INSERT
-- directo de una cuota nueva con un TC arbitrario. Nota: NO se agrega una restriccion
-- equivalente para modo Variable en INSERT -- verificado contra
-- handleNumInstallmentsChange (WorkOrderPaymentPlanSection.tsx) que una cuota nueva en
-- modo Variable SI se inserta legitimamente con un TC no nulo (initialRate =
-- latestBuyRate), consistente con que invoice_exchange_rate es capturable desde
-- 'Pending' en Variable (Decision #4) -- restringir el INSERT ahi romperia ese flujo.

CREATE OR REPLACE FUNCTION public.wo_payment_installments_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
  v_exchange_rate_mode text;
  v_plan_exchange_rate numeric;
  v_legal_transition boolean;
  v_is_accounting_or_admin boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.wo_payment_installments WHERE installment_id = NEW.installment_id) THEN
      -- No es una insercion real -- resolvera como UPDATE por conflicto; el BEFORE
      -- UPDATE real que Postgres dispara a continuacion para esta misma fila aplica
      -- el resto de este guard con el OLD correcto.
      RETURN NEW;
    END IF;
    IF NEW.status <> 'Pending' THEN
      RAISE EXCEPTION 'INSTALLMENT_LOCKED: una cuota nueva debe crearse en estado Pending';
    END IF;

    SELECT p.exchange_rate_mode, p.exchange_rate
    INTO v_exchange_rate_mode, v_plan_exchange_rate
    FROM public.wo_payment_plan p
    WHERE p.wo_id = NEW.wo_id;

    IF v_exchange_rate_mode = 'fijo' AND (
      NEW.invoice_exchange_rate IS DISTINCT FROM v_plan_exchange_rate
      OR NEW.payment_exchange_rate IS DISTINCT FROM v_plan_exchange_rate
    ) THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: en modo fijo, el tipo de cambio de una cuota nueva debe coincidir con el del plan';
    END IF;

    RETURN NEW;
  END IF;

  -- MUST FIX review iteracion 16 #1 (greptile + codex): la policy RLS "Accounting can
  -- update payment installments" (mas abajo en este archivo) autoriza a
  -- collections_analyst a hacer UPDATE de la fila COMPLETA -- ningun chequeo de este
  -- trigger restringia por columna para ese rol especificamente. Sin este guard, un
  -- collections_analyst podia reasignar la cuota a otro plan/OT (plan_id/wo_id) o
  -- tocar fechas/porcentaje/monto "acordados" -- campos que la decision del operador
  -- 2026-09-10 (ver plan_v2.md, Amendment del mismo dia) reservo exclusivamente al
  -- gerente del encargo. Se rechaza cualquier cambio a esas columnas hecho por un
  -- collections_analyst no-admin; status, fechas de Cobranza
  -- (collection_invoice_date/collection_payment_date/payment_date_actual) e
  -- invoice_exchange_rate/payment_exchange_rate (ya gateadas mas abajo) quedan sin
  -- restriccion adicional por este chequeo -- son exactamente las columnas que ese rol
  -- SI debe poder tocar.
  IF NOT public.is_admin() AND public.current_role_key() = 'collections_analyst' THEN
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
       OR NEW.wo_id IS DISTINCT FROM OLD.wo_id
       OR NEW.agreed_invoice_date IS DISTINCT FROM OLD.agreed_invoice_date
       OR NEW.agreed_payment_date IS DISTINCT FROM OLD.agreed_payment_date
       OR NEW.percentage IS DISTINCT FROM OLD.percentage
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
    THEN
      RAISE EXCEPTION 'INSTALLMENT_FIELD_FORBIDDEN: contabilidad solo puede modificar estado, fechas de cobranza y tipo de cambio por cuota';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_legal_transition := CASE OLD.status
      WHEN 'Pending'   THEN NEW.status = 'Invoiced'
      WHEN 'Overdue'   THEN NEW.status = 'Invoiced'
      WHEN 'Invoiced'  THEN NEW.status IN ('Completed', 'Overdue')
      ELSE false
    END;
    IF NOT v_legal_transition THEN
      RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: % -> % no es una transicion de estado permitida', OLD.status, NEW.status;
    END IF;

    -- Iteración 17 #2 (codex): la UI (isStatusEditable) exige la OT Aprobada para
    -- transicionar el estado de una cuota -- la base de datos nunca lo replicaba,
    -- solo validaba que la transicion fuera legal. Sin esto, un collections_analyst
    -- (o cualquiera con RLS de escritura sobre esta tabla) podia facturar/completar
    -- una cuota de una OT todavia en Draft o en revision via un UPDATE directo.
    IF NOT public.is_admin() THEN
      SELECT approval_status INTO v_approval_status
      FROM public.work_orders
      WHERE wo_id = NEW.wo_id;

      IF v_approval_status IS DISTINCT FROM 'Approved' THEN
        RAISE EXCEPTION 'INSTALLMENT_LOCKED: la transicion de estado de una cuota solo puede hacerse con la orden de trabajo aprobada';
      END IF;
    END IF;
  END IF;

  -- MUST FIX review iteracion 2 #1/#3 (decision del operador 2026-09-07: "si una cuota
  -- ya esta facturada, no se puede modificar o eliminar de ninguna manera"): una vez
  -- que status sale de 'Pending', percentage/amount/installment_number tambien quedan
  -- congelados -- no solo las 2 columnas de TC. Sin esto, agregar/quitar cuotas del
  -- plan podia redistribuir el porcentaje de una cuota ya facturada, desalineandolo
  -- del TC ya congelado (que se calculo sobre el porcentaje original).
  IF OLD.status <> 'Pending' AND (
    NEW.percentage IS DISTINCT FROM OLD.percentage
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
  ) THEN
    RAISE EXCEPTION 'INSTALLMENT_LOCKED: esta cuota ya fue facturada y no puede modificarse (porcentaje/monto/numero)';
  END IF;

  IF NEW.invoice_exchange_rate IS DISTINCT FROM OLD.invoice_exchange_rate
     OR NEW.payment_exchange_rate IS DISTINCT FROM OLD.payment_exchange_rate THEN
    SELECT wo.approval_status, p.exchange_rate_mode, p.exchange_rate
    INTO v_approval_status, v_exchange_rate_mode, v_plan_exchange_rate
    FROM public.work_orders wo
    JOIN public.wo_payment_plan p ON p.wo_id = wo.wo_id
    WHERE wo.wo_id = NEW.wo_id;
  END IF;

  IF NEW.invoice_exchange_rate IS DISTINCT FROM OLD.invoice_exchange_rate THEN
    IF OLD.status <> 'Pending' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion de esta cuota ya esta congelado';
    END IF;
    IF v_exchange_rate_mode = 'variable' THEN
      IF v_approval_status IS DISTINCT FROM 'Approved' THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de facturacion solo puede capturarse una vez que la orden de trabajo fue aprobada';
      END IF;
      SELECT is_admin() OR COALESCE(current_role_key() = 'collections_analyst', false) INTO v_is_accounting_or_admin;
      IF NOT v_is_accounting_or_admin THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_FORBIDDEN: solo contabilidad (o un administrador) puede capturar el tipo de cambio de facturacion por cuota';
      END IF;
    END IF;
    IF v_exchange_rate_mode = 'fijo' AND NEW.invoice_exchange_rate IS DISTINCT FROM v_plan_exchange_rate THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: en modo fijo, el tipo de cambio de facturacion de la cuota debe coincidir con el del plan';
    END IF;
  END IF;

  IF NEW.payment_exchange_rate IS DISTINCT FROM OLD.payment_exchange_rate THEN
    IF OLD.status = 'Completed' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago de esta cuota ya esta congelado';
    END IF;
    IF v_exchange_rate_mode = 'variable' THEN
      IF OLD.status = 'Pending' THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago solo puede capturarse una vez facturada la cuota';
      END IF;
      IF v_approval_status IS DISTINCT FROM 'Approved' THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio de pago solo puede capturarse una vez que la orden de trabajo fue aprobada';
      END IF;
      SELECT is_admin() OR COALESCE(current_role_key() = 'collections_analyst', false) INTO v_is_accounting_or_admin;
      IF NOT v_is_accounting_or_admin THEN
        RAISE EXCEPTION 'EXCHANGE_RATE_FORBIDDEN: solo contabilidad (o un administrador) puede capturar el tipo de cambio de pago por cuota';
      END IF;
    END IF;
    IF v_exchange_rate_mode = 'fijo' AND NEW.payment_exchange_rate IS DISTINCT FROM v_plan_exchange_rate THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: en modo fijo, el tipo de cambio de pago de la cuota debe coincidir con el del plan';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Decision del operador 2026-09-10 (misma sesion, tras acotar "Team can manage
-- payment plans/installments" a solo el gerente del encargo en
-- 20260908150000_0722-156b_plan_insert_guard.sql): collections_analyst nunca tuvo
-- NINGUN camino de escritura RLS hacia wo_payment_installments -- la unica policy de
-- escritura para no-admin era "Team can manage..."/ahora "Manager can manage..."
-- (nunca colections_analyst, is_engagement_team_member() no lo contempla -- ver
-- 20260826221706_0817-180_grant_hr_engagement_work_order.sql) y la unica policy
-- department-scope existente ("payment_installments firm read") es de solo lectura.
-- Sin esto, isStatusEditable (WorkOrderEdit.tsx: admin O collections_analyst, con la
-- OT Approved) habilitaba en pantalla 3 capacidades -- transicion de estado,
-- correccion de fecha de Cobranza, y captura de TC por cuota en modo Variable -- que
-- en la practica fallaban en silencio (UPDATE de 0 filas, sin error, sin .select()
-- encadenado en ninguna de las 3 mutaciones) para cualquier collections_analyst.
-- Se agrega UNA policy de UPDATE (no INSERT/DELETE -- collections_analyst nunca crea
-- ni borra cuotas, es tarea exclusiva del gerente) para el rol puntual -- el resto de
-- las reglas (transicion legal de estado, freeze por status, rol/aprobacion para las 2
-- columnas de TC) ya las aplica el trigger de este mismo archivo, independientemente
-- de quien pase esta policy.
CREATE POLICY "Accounting can update payment installments" ON public.wo_payment_installments
  FOR UPDATE
  TO authenticated
  USING (public.current_role_key() = 'collections_analyst')
  WITH CHECK (public.current_role_key() = 'collections_analyst');
