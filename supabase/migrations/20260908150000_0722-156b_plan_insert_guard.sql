-- Bug 0722-156b (Fase 2) — review iteracion 6 (codex), hallazgo #1. No se reescribe la
-- migracion existente 20260905172820_0722-156b_add_payment_exchange_rates.sql (convencion
-- del proyecto: esa migracion ya se confirmo aplicada contra el Supabase de Test el
-- 2026-09-08 -- ver bugs/0722-156/review.md) -- esta migracion nueva reemplaza la funcion
-- del trigger via CREATE OR REPLACE, valido entre migraciones.
--
-- Hallazgo: trg_wo_payment_plan_guard_exchange_rate solo corria BEFORE UPDATE. Una OT
-- Aprobada puede legitimamente no tener ningun wo_payment_plan todavia (el plan es
-- opcional); sin este guard en INSERT, cualquier miembro del equipo de la OT (mismo rol
-- que ya puede escribir la tabla via la policy "Team can manage payment plans", que solo
-- valida pertenencia al equipo, nunca approval_status) podia crear un plan nuevo con un
-- exchange_rate/exchange_rate_mode arbitrario para una OT ya aprobada, sin pasar por
-- ninguna validacion -- mismo patron que el bypass de INSERT ya cerrado para cuotas
-- (20260905172820, seccion del guard de wo_payment_installments). La UI normal nunca crea
-- un plan fuera de Draft (isEditable en WorkOrderForm.tsx), asi que esto es alcanzable
-- solo via un INSERT directo/malformado -- defensa en profundidad, no una regresion de UI.
--
-- MUST FIX review iteracion 7 #1: el guard de UPDATE solo resolvia approval_status desde
-- NEW.wo_id, nunca OLD.wo_id -- wo_id no era inmutable. Un UPDATE que reasignara el plan
-- de una OT Aprobada hacia una OT Draft (sin cuotas facturadas) MIENTRAS cambia el TC
-- pasaba el gate (NEW.wo_id resuelve a la OT Draft); un segundo UPDATE que devolviera el
-- wo_id a la OT Aprobada original, sin tocar exchange_rate/exchange_rate_mode, caia en el
-- early-return de mas abajo (que solo compara esos 2 campos) y no pasaba por ningun
-- chequeo -- dejando el TC "oficial" de la OT Aprobada modificado en 2 pasos. Requeria
-- pertenecer al equipo de ambas OT (la RLS valida wo_id viejo y nuevo), pero un plan
-- nunca tiene motivo legitimo para cambiar de OT -- se lo vuelve inmutable directamente,
-- en vez de solo validar aprobacion contra OLD.wo_id (que cerraria el cambio de TC pero
-- seguiria permitiendo la reasignacion en si).
--
-- MUST FIX review iteracion 8 #2: el branch de INSERT solo rechazaba 'Approved', pero
-- isEditable (WorkOrderForm.tsx:549) tambien excluye 'Pending_Approval' -- la pantalla
-- nunca permite crear un plan mientras la OT esta en revision, pero el guard si dejaba
-- pasar un INSERT directo en ese estado. Se agrega 'Pending_Approval' al mismo chequeo
-- para que la defensa en profundidad cubra el mismo conjunto de estados no-editables que
-- ya usa el frontend.
--
-- Consolidacion 2026-09-08: el fix de review iteracion 9 #3 (mas abajo, sobre
-- sync_wo_payment_installments) vivia en un archivo aparte
-- (20260908160000_0722-156b_sync_installments_wo_ownership_guard.sql) -- se fusiona aca
-- porque ninguna de las 2 migraciones se habia aplicado nunca a un Supabase real (regla
-- del proyecto: minimizar archivos de migracion nuevos por issue, ver
-- bugs/0722-156/review.md).
--
-- MUST FIX review iteracion 12 #2: wo_payment_installments_plan_id_fkey tiene
-- ON DELETE CASCADE hacia wo_payment_plan; el trigger de este archivo solo corria en
-- INSERT/UPDATE, y el guard de DELETE de cuotas (wo_payment_installments_guard_delete)
-- solo rechaza si ALGUNA cuota individual no esta 'Pending'. Con todas las cuotas
-- 'Pending' (tipico recien aprobada la OT, antes de facturar cualquiera), un DELETE
-- directo sobre wo_payment_plan (mismo rol de equipo, RLS no chequea approval_status)
-- borraba el plan Y todas sus cuotas en cascada sin ningun chequeo -- destruyendo el
-- snapshot de auditoria del TC/modo ya congelado. Se agrega un branch TG_OP = 'DELETE'
-- con el mismo criterio que el branch de INSERT (rechaza si la OT esta Approved o
-- Pending_Approval); el trigger pasa a BEFORE INSERT OR UPDATE OR DELETE.
--
-- Decision del operador 2026-09-10: solo el gerente (manager_id) del encargo dueño de
-- la OT -- o un admin -- puede crear el plan o modificar su TC inicial/modo. La policy
-- RLS "Team can manage payment plans" autoriza a todo el equipo (manager_id O
-- partner_id via is_engagement_team_member()), pero nunca distinguio entre ambos para
-- esta accion en particular -- un socio (partner_id) podia tocar el TC igual que el
-- gerente. Se agrega el chequeo de rol en el mismo trigger, en los 2 unicos puntos
-- donde el TC/modo realmente cambia (creacion via INSERT, o el UPDATE que ya paso el
-- early-return de "no cambio nada").

CREATE OR REPLACE FUNCTION public.wo_payment_plan_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
  v_has_locked_installment boolean;
  v_is_manager_or_admin boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT approval_status INTO v_approval_status
    FROM public.work_orders
    WHERE wo_id = OLD.wo_id;

    IF v_approval_status IN ('Approved', 'Pending_Approval') THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: no se puede eliminar el plan de pagos: la orden de trabajo ya fue aprobada o esta en revision';
    END IF;

    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT approval_status INTO v_approval_status
    FROM public.work_orders
    WHERE wo_id = NEW.wo_id;

    IF v_approval_status IN ('Approved', 'Pending_Approval') THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: no se puede crear un plan de pagos: la orden de trabajo ya fue aprobada o esta en revision';
    END IF;

    SELECT is_admin() OR EXISTS (
      SELECT 1 FROM public.work_orders wo
      JOIN public.engagements e ON e.engagement_id = wo.engagement_id
      WHERE wo.wo_id = NEW.wo_id AND e.manager_id = get_my_staff_id()
    ) INTO v_is_manager_or_admin;

    IF NOT v_is_manager_or_admin THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_FORBIDDEN: solo el gerente del encargo (o un administrador) puede crear el plan de pagos y su tipo de cambio inicial';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.wo_id IS DISTINCT FROM OLD.wo_id THEN
    RAISE EXCEPTION 'WO_ID_IMMUTABLE: un plan de pagos no puede reasignarse a otra orden de trabajo';
  END IF;

  -- Iteración 17/18 (decisión del operador 2026-09-10): NULL solo es valido mientras
  -- el plan NUNCA tuvo un TC real (exchange_rate_history vacia, Decision #7 de
  -- plan_v2.md) -- una vez que tiene un valor real, no puede borrarse a NULL (para
  -- corregirlo se sobreescribe con el numero nuevo, nunca hace falta pasar por NULL).
  -- Sin esto, un plan con cuotas ya sincronizadas a un TC podia quedar en NULL
  -- mientras las cuotas se quedaban con el TC viejo -- reemplaza el fix original
  -- (propagar NULL en wo_payment_plan_sync_fixed_installments) por prevenirlo en el
  -- origen. Sin excepcion de rol, ni siquiera admin -- mismo criterio que
  -- WO_ID_IMMUTABLE arriba: no hay motivo legitimo para necesitarlo.
  IF OLD.exchange_rate IS NOT NULL AND NEW.exchange_rate IS NULL THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio del plan de pagos no puede borrarse una vez establecido';
  END IF;

  IF NEW.exchange_rate IS NOT DISTINCT FROM OLD.exchange_rate
     AND NEW.exchange_rate_mode IS NOT DISTINCT FROM OLD.exchange_rate_mode THEN
    RETURN NEW;
  END IF;

  SELECT is_admin() OR EXISTS (
    SELECT 1 FROM public.work_orders wo
    JOIN public.engagements e ON e.engagement_id = wo.engagement_id
    WHERE wo.wo_id = NEW.wo_id AND e.manager_id = get_my_staff_id()
  ) INTO v_is_manager_or_admin;

  IF NOT v_is_manager_or_admin THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_FORBIDDEN: solo el gerente del encargo (o un administrador) puede modificar el tipo de cambio inicial del plan de pagos';
  END IF;

  SELECT approval_status INTO v_approval_status
  FROM public.work_orders
  WHERE wo_id = NEW.wo_id;

  IF v_approval_status = 'Approved' THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio del plan de pagos no puede modificarse: la orden de trabajo ya fue aprobada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.wo_payment_installments
    WHERE plan_id = NEW.plan_id AND status <> 'Pending'
  ) INTO v_has_locked_installment;

  IF v_has_locked_installment THEN
    RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: el tipo de cambio del plan de pagos no puede modificarse: ya existe una cuota facturada con un tipo de cambio congelado';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_payment_plan_guard_exchange_rate ON public.wo_payment_plan;
CREATE TRIGGER trg_wo_payment_plan_guard_exchange_rate BEFORE INSERT OR UPDATE OR DELETE ON public.wo_payment_plan
  FOR EACH ROW EXECUTE FUNCTION public.wo_payment_plan_guard_exchange_rate();

-- MUST FIX review iteracion 14 #1: al cambiar el TC del plan en modo Fijo, nada forzaba
-- que las cuotas 'Pending' ya guardadas siguieran al nuevo valor -- WorkOrderEdit.tsx
-- guarda el plan y re-sincroniza las cuotas en 2 llamadas HTTP separadas
-- (upsertPaymentPlan y despues batchUpsertInstallments/sync_wo_payment_installments); si
-- la 1ra tiene exito y la 2da falla, el plan queda con un TC nuevo mientras sus cuotas
-- siguen con el viejo, violando la garantia central de "Fijo" (toda cuota debe reflejar
-- el TC del plan). Un AFTER UPDATE en la misma tabla/transaccion que ya escribe el TC
-- nuevo es atomico con ese UPDATE (misma transaccion, MVCC ve el valor ya escrito) --
-- no requiere ningun cambio en el frontend ni en sync_wo_payment_installments.
CREATE OR REPLACE FUNCTION public.wo_payment_plan_sync_fixed_installments() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.exchange_rate_mode = 'fijo' AND NEW.exchange_rate IS NOT NULL AND (
    NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
    OR NEW.exchange_rate_mode IS DISTINCT FROM OLD.exchange_rate_mode
  ) THEN
    UPDATE public.wo_payment_installments
    SET invoice_exchange_rate = NEW.exchange_rate,
        payment_exchange_rate = NEW.exchange_rate
    WHERE plan_id = NEW.plan_id
      AND status = 'Pending'
      AND (invoice_exchange_rate IS DISTINCT FROM NEW.exchange_rate
           OR payment_exchange_rate IS DISTINCT FROM NEW.exchange_rate);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_wo_payment_plan_sync_fixed_installments ON public.wo_payment_plan;
CREATE TRIGGER trg_wo_payment_plan_sync_fixed_installments AFTER UPDATE ON public.wo_payment_plan
  FOR EACH ROW EXECUTE FUNCTION public.wo_payment_plan_sync_fixed_installments();

-- MUST FIX review iteracion 9 #3: sync_wo_payment_installments validaba (desde
-- Iteracion 5 #1) que un installment_id EXISTENTE recibido en el payload perteneciera a
-- p_plan_id, pero nunca el sentido inverso: que p_plan_id realmente perteneciera a
-- p_wo_id. La policy RLS "Team can manage payment installments" autoriza por plan_id
-- (via join a wo_payment_plan.wo_id real), nunca mira la columna wo_id de la fila que se
-- esta escribiendo -- asi que un team member de la OT dueña de p_plan_id podia invocar
-- el RPC con un p_wo_id de una OT DISTINTA (ajena), y la funcion insertaria/actualizaria
-- cuotas con plan_id correcto pero wo_id ajeno, sin ningun chequeo. El trigger de freeze
-- (wo_payment_installments_guard_exchange_rate) resuelve approval_status por NEW.wo_id,
-- no por el wo_id real del plan -- una fila con wo_id incorrecto terminaria gobernada
-- por las reglas de aprobacion de la OT equivocada. Alcanzable solo via una llamada RPC
-- directa/malformada (la UI normal siempre arma p_wo_id desde el mismo estado que
-- p_plan_id, nunca los mezcla).
--
-- Fix: antes del DELETE/INSERT, validar que wo_payment_plan.wo_id = p_wo_id para el
-- p_plan_id declarado, rechazando con un codigo reconocible si no coincide.

CREATE OR REPLACE FUNCTION public.sync_wo_payment_installments(
  p_plan_id uuid,
  p_wo_id uuid,
  p_installments jsonb
) RETURNS SETOF public.wo_payment_installments
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_kept_ids uuid[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wo_payment_plan
    WHERE plan_id = p_plan_id AND wo_id = p_wo_id
  ) THEN
    RAISE EXCEPTION 'PLAN_WO_MISMATCH: el plan de pagos indicado no pertenece a la orden de trabajo indicada';
  END IF;

  SELECT array_agg((row_data->>'installment_id')::uuid)
  INTO v_kept_ids
  FROM jsonb_array_elements(p_installments) AS row_data
  WHERE row_data->>'installment_id' IS NOT NULL;

  IF v_kept_ids IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.wo_payment_installments existing
    WHERE existing.installment_id = ANY (v_kept_ids)
      AND existing.plan_id <> p_plan_id
  ) THEN
    RAISE EXCEPTION 'INSTALLMENT_PLAN_MISMATCH: una o mas cuotas del payload no pertenecen al plan de pagos indicado';
  END IF;

  -- Borra huerfanos PRIMERO, para que una fila renumerada no choque contra el UNIQUE
  -- (plan_id, installment_number) de una fila vieja que todavia no se borro -- mismo
  -- orden que ya usaba useBatchUpsertInstallments, ahora atomico con el paso de abajo.
  IF v_kept_ids IS NOT NULL AND array_length(v_kept_ids, 1) > 0 THEN
    DELETE FROM public.wo_payment_installments
    WHERE plan_id = p_plan_id AND installment_id <> ALL (v_kept_ids);
  ELSE
    DELETE FROM public.wo_payment_installments
    WHERE plan_id = p_plan_id;
  END IF;

  RETURN QUERY
  INSERT INTO public.wo_payment_installments AS w (
    installment_id, plan_id, wo_id, installment_number,
    agreed_invoice_date, agreed_payment_date,
    collection_invoice_date, collection_payment_date, payment_date_actual,
    percentage, amount, status, invoice_exchange_rate, payment_exchange_rate
  )
  SELECT
    COALESCE((row_data->>'installment_id')::uuid, gen_random_uuid()),
    p_plan_id,
    p_wo_id,
    (row_data->>'installment_number')::integer,
    (row_data->>'agreed_invoice_date')::date,
    (row_data->>'agreed_payment_date')::date,
    (row_data->>'collection_invoice_date')::date,
    (row_data->>'collection_payment_date')::date,
    (row_data->>'payment_date_actual')::date,
    (row_data->>'percentage')::numeric,
    (row_data->>'amount')::numeric,
    row_data->>'status',
    (row_data->>'invoice_exchange_rate')::numeric,
    (row_data->>'payment_exchange_rate')::numeric
  FROM jsonb_array_elements(p_installments) AS row_data
  ON CONFLICT (installment_id) DO UPDATE SET
    installment_number = EXCLUDED.installment_number,
    agreed_invoice_date = EXCLUDED.agreed_invoice_date,
    agreed_payment_date = EXCLUDED.agreed_payment_date,
    collection_invoice_date = EXCLUDED.collection_invoice_date,
    collection_payment_date = EXCLUDED.collection_payment_date,
    payment_date_actual = EXCLUDED.payment_date_actual,
    percentage = EXCLUDED.percentage,
    amount = EXCLUDED.amount,
    status = EXCLUDED.status,
    invoice_exchange_rate = EXCLUDED.invoice_exchange_rate,
    payment_exchange_rate = EXCLUDED.payment_exchange_rate
  RETURNING w.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_wo_payment_installments(uuid, uuid, jsonb) TO authenticated;

-- Decision del operador 2026-09-10 (misma sesion que el modelo de autorizacion de
-- Iteracion 13, ver bugs/0722-156/review.md): la policy base "Team can manage payment
-- plans"/"Team can manage payment installments" (cero_05_rls_policies.sql) autorizaba
-- ESCRITURA (INSERT/UPDATE/DELETE) a todo el equipo -- manager_id O partner_id, via
-- is_engagement_team_member() -- desde antes de este ticket. La Iteracion 13 ya habia
-- cerrado el TC especificamente (trigger, EXCHANGE_RATE_FORBIDDEN) para que un socio no
-- lo toque, pero dejaba abierto el resto del plan (payment_days/cuotas/fechas) a
-- cualquier team member "por diseno" (Decision #1 original del Amendment 2026-09-10 de
-- plan_v2.md). El operador ahora corrige esa premisa: un socio NO debe poder escribir
-- NADA de wo_payment_plan/wo_payment_installments -- solo el gerente del encargo o un
-- admin. No se puede editar una policy base ya aplicada a todo ambiente real (cero_05) --
-- se reemplaza via DROP + CREATE en esta migracion (0722-156b, todavia sin aplicar a
-- ningun Supabase real). La LECTURA no cambia: "Team can view payment plans"/
-- "installments" (mismo is_engagement_team_member(), solo SELECT, cero_05:579-592) se
-- dejan intactas -- un socio sigue viendo el plan de pagos de sus encargos, solo ya no
-- puede escribirlo. "Admins can manage payment plans/installments" (cero_05:105-113,
-- solo is_admin()) tampoco se toca -- sigue cubriendo a admin via OR de policies
-- permisivas, por eso esta policy nueva solo necesita chequear al gerente.
DROP POLICY IF EXISTS "Team can manage payment plans" ON public.wo_payment_plan;
CREATE POLICY "Manager can manage payment plans" ON public.wo_payment_plan
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_orders wo
      JOIN public.engagements e ON e.engagement_id = wo.engagement_id
      WHERE wo.wo_id = wo_payment_plan.wo_id
        AND e.manager_id = public.get_my_staff_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.work_orders wo
      JOIN public.engagements e ON e.engagement_id = wo.engagement_id
      WHERE wo.wo_id = wo_payment_plan.wo_id
        AND e.manager_id = public.get_my_staff_id()
    )
  );

DROP POLICY IF EXISTS "Team can manage payment installments" ON public.wo_payment_installments;
CREATE POLICY "Manager can manage payment installments" ON public.wo_payment_installments
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wo_payment_plan p
      JOIN public.work_orders wo ON wo.wo_id = p.wo_id
      JOIN public.engagements e ON e.engagement_id = wo.engagement_id
      WHERE p.plan_id = wo_payment_installments.plan_id
        AND e.manager_id = public.get_my_staff_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wo_payment_plan p
      JOIN public.work_orders wo ON wo.wo_id = p.wo_id
      JOIN public.engagements e ON e.engagement_id = wo.engagement_id
      WHERE p.plan_id = wo_payment_installments.plan_id
        AND e.manager_id = public.get_my_staff_id()
    )
  );
