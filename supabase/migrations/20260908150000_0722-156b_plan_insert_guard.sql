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

CREATE OR REPLACE FUNCTION public.wo_payment_plan_guard_exchange_rate() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_approval_status text;
  v_has_locked_installment boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT approval_status INTO v_approval_status
    FROM public.work_orders
    WHERE wo_id = NEW.wo_id;

    IF v_approval_status = 'Approved' THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_LOCKED: no se puede crear un plan de pagos: la orden de trabajo ya fue aprobada';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.exchange_rate IS NOT DISTINCT FROM OLD.exchange_rate
     AND NEW.exchange_rate_mode IS NOT DISTINCT FROM OLD.exchange_rate_mode THEN
    RETURN NEW;
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
CREATE TRIGGER trg_wo_payment_plan_guard_exchange_rate BEFORE INSERT OR UPDATE ON public.wo_payment_plan
  FOR EACH ROW EXECUTE FUNCTION public.wo_payment_plan_guard_exchange_rate();
