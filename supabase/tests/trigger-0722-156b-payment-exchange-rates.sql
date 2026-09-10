-- Trigger assertions for bug 0722-156b (Fase 2) — tipo de cambio fijo/variable en el
-- plan de pagos de las ordenes de trabajo. Ver bugs/0722-156/plan_v2.md ("Tests to
-- Add or Update"). Run via supabase/tests/local/run-rls-tests.sh against the
-- disposable scratch database, AFTER 20260905172820_0722-156b_add_payment_exchange_rates.sql
-- (and Fase 1's 20260905070913) have been applied. Single transaction, ALWAYS rolls back.
--
-- Under test (both triggers are plain BEFORE UPDATE guards, unrelated to RLS, so this
-- suite runs as the default session role — no persona impersonation needed):
--   - CHECK constraints: exchange_rate_mode IN ('fijo','variable'); invoice/payment_
--     exchange_rate NULL or > 0.
--   - Backfill statement (re-run verbatim here against fixtures inserted to look like
--     pre-migration rows, since a fresh scratch DB has nothing to backfill at apply time):
--     copies plan.exchange_rate into both installment columns, preserving NULL.
--   - wo_payment_installments freeze (Amendment 2026-09-07, refinada en review
--     iteracion 1): invoice_exchange_rate editable only while status = 'Pending';
--     payment_exchange_rate editable only while status IN ('Invoiced','Overdue') in
--     modo Variable (never while still Pending — MUST FIX #1), or while status <>
--     'Completed' in modo Fijo. The owning-WO-Approved gate applies ONLY in modo
--     Variable — modo Fijo's resync must keep working in Draft (MUST FIX #3). Illegal
--     status transitions (e.g. a direct revert Invoiced->Pending) are rejected
--     (INVALID_STATUS_TRANSITION), closing the 2-step freeze bypass (MUST FIX #4).
--     Re-sending an already-frozen value unchanged is a no-op (not rejected); changing
--     status + the still-editable rate in the SAME UPDATE succeeds atomically; a
--     column-unrelated UPDATE (e.g. collection_invoice_date) on an otherwise-frozen row
--     is never rejected.
--   - wo_payment_plan freeze: exchange_rate / exchange_rate_mode rejected once the
--     owning work order is Approved; unrelated columns (payment_days) on an Approved
--     plan still save; both still editable while Draft.
--
-- Success output: one NOTICE per passing check ending with
-- "PAYMENT EXCHANGE RATES TRIGGERS: ALL CHECKS PASSED (rolled back)".

BEGIN;

-- ── Fixtures (as postgres; these triggers don't depend on RLS) ────────
INSERT INTO public.practicas (practica_id, name, code, abbreviation)
VALUES ('5e000000-0000-4000-8000-0000000000c1', 'PER Test Practice (Auditoria)', 1, 'AUD')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.society (society_id, name)
VALUES ('50c00000-0000-4000-8000-0000000000c1', 'PER Test Society');

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id) VALUES
  ('c1000000-0000-4000-8000-0000000000c1', 'PER Test Client', 'PER-TAX-001');

-- E1/WO1: Draft, modo Fijo (plan/mode still editable, resync SIN exigir OT Approved).
-- E2/WO2: Approved, modo Variable (plan/mode frozen; captura por cuota recien se habilita aca).
-- E3/WO3: Draft, modo Variable (captura por cuota SIGUE bloqueada pese a status=Pending —
--   wo_payment_plan.wo_id es UNIQUE, asi que un plan Variable en Draft necesita su propia OT,
--   no puede compartir la c1 que ya tiene el plan Fijo).
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000c1', 'c1000000-0000-4000-8000-0000000000c1', 'PER E1 (Draft WO, Fijo)',    1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1')),
  ('e0000000-0000-4000-8000-0000000000c2', 'c1000000-0000-4000-8000-0000000000c1', 'PER E2 (Approved WO, Variable)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1')),
  ('e0000000-0000-4000-8000-0000000000c3', 'c1000000-0000-4000-8000-0000000000c1', 'PER E3 (Draft WO, Variable)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1')),
  ('e0000000-0000-4000-8000-0000000000c4', 'c1000000-0000-4000-8000-0000000000c1', 'PER E4 (TC nulo)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

-- wo_payment_plan.wo_id es UNIQUE (cero_03_constraints_indexes.sql) -- cada OT de arriba
-- tiene como maximo un plan; el fixture de "TC nulo" mas abajo NO puede reusar c2
-- (bug preexistente en este archivo: insertaba un 2do plan para c2, que ya tiene
-- v_plan_approved -- nunca se detecto porque el suite no se habia corrido contra una
-- DB real todavia). Usa c4, su propia OT.
-- MUST FIX review iteracion 6 #1: c2 y c4 se creaban directamente como Approved -- desde
-- que trg_wo_payment_plan_guard_exchange_rate tambien corre BEFORE INSERT
-- (20260908150000), el INSERT de sus planes (v_plan_approved / v_plan_null_rate) quedaba
-- rechazado, porque en la realidad un plan SIEMPRE se crea en Draft y recien despues la
-- OT se aprueba -- nunca al reves. c2 arranca Draft aca y se aprueba con un UPDATE justo
-- despues de crear su plan (reflejando la secuencia real, el resto del suite si necesita
-- que quede Approved); c4 no necesita estar Approved para lo que este fixture ejercita
-- (preservacion de NULL en el backfill), asi que se deja en Draft sin mas.
INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-0000000000c1', 'USD', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000c2', 'e0000000-0000-4000-8000-0000000000c2', 'USD', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000c3', 'e0000000-0000-4000-8000-0000000000c3', 'USD', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000c4', 'e0000000-0000-4000-8000-0000000000c4', 'USD', 'High', 'Draft');

DO $$
DECLARE
  v_plan_draft    uuid;
  v_plan_approved uuid;
  v_inst_pending   uuid;
  v_inst_invoiced  uuid;
  v_inst_overdue   uuid; -- persisted Overdue, reached via a prior manual revert from Invoiced
  v_inst_completed uuid;
  denied boolean;
BEGIN
  -- ══════════════════════════════════════════════════════════════════
  -- CHECK constraints
  -- ══════════════════════════════════════════════════════════════════

  denied := false;
  BEGIN
    INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, exchange_rate_mode)
    VALUES ('40000000-0000-4000-8000-0000000000c1', 6.96, 'invalido');
  EXCEPTION WHEN check_violation THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — exchange_rate_mode aceptó un valor fuera de (fijo, variable)';
  END IF;
  RAISE NOTICE 'PASS — exchange_rate_mode rechaza un modo invalido (CHECK)';

  -- Fixture real para el resto del suite: plan Draft en modo 'fijo' (default).
  INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, payment_days)
  VALUES ('40000000-0000-4000-8000-0000000000c1', 6.96, 30)
  RETURNING plan_id INTO v_plan_draft;

  IF (SELECT exchange_rate_mode FROM public.wo_payment_plan WHERE plan_id = v_plan_draft) <> 'fijo' THEN
    RAISE EXCEPTION 'PER FAIL — exchange_rate_mode DEFAULT esperado ''fijo'', no se aplico';
  END IF;
  RAISE NOTICE 'PASS — exchange_rate_mode DEFAULT ''fijo'' se aplica sin especificarlo';

  -- modo 'variable' a proposito: es el unico modo donde el gate de aprobacion (Amendment
  -- 2026-09-07) rige — en 'fijo' esa columna nunca exige OT Approved (ver seccion Draft).
  INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, payment_days, exchange_rate_mode)
  VALUES ('40000000-0000-4000-8000-0000000000c2', 6.90, 30, 'variable')
  RETURNING plan_id INTO v_plan_approved;

  -- Recien AHORA se aprueba la OT (el plan ya existe, como en la realidad) -- ver
  -- comentario de la fixture de work_orders mas arriba.
  UPDATE public.work_orders SET approval_status = 'Approved' WHERE wo_id = '40000000-0000-4000-8000-0000000000c2';

  denied := false;
  BEGIN
    INSERT INTO public.wo_payment_installments
      (plan_id, wo_id, installment_number, percentage, status, invoice_exchange_rate)
    VALUES (v_plan_draft, '40000000-0000-4000-8000-0000000000c1', 99, 1, 'Pending', 0);
  EXCEPTION WHEN check_violation THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — invoice_exchange_rate acepto un valor no-positivo (0)';
  END IF;
  RAISE NOTICE 'PASS — invoice_exchange_rate rechaza un valor no-positivo (CHECK)';

  -- ══════════════════════════════════════════════════════════════════
  -- Modo Fijo en Draft: el re-sync SI debe escribir invoice/payment_exchange_rate sin
  -- exigir OT Approved (review iteracion 1 #3 — el gate de aprobacion solo aplica a
  -- modo Variable). Modo Variable en Draft: SI sigue bloqueado (captura independiente
  -- real, Amendment 2026-09-07).
  -- ══════════════════════════════════════════════════════════════════

  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, status)
  VALUES (v_plan_draft, '40000000-0000-4000-8000-0000000000c1', 1, 100, 'Pending')
  RETURNING installment_id INTO v_inst_pending;

  -- v_plan_draft esta en modo 'fijo' (DEFAULT) -> el re-sync de Fijo debe pasar sin aprobar.
  UPDATE public.wo_payment_installments
  SET invoice_exchange_rate = 6.96, payment_exchange_rate = 6.96
  WHERE installment_id = v_inst_pending;
  IF (SELECT invoice_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_pending) <> 6.96
     OR (SELECT payment_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_pending) <> 6.96 THEN
    RAISE EXCEPTION 'PER FAIL — el re-sync de modo Fijo no pudo escribir invoice/payment_exchange_rate en Draft';
  END IF;
  RAISE NOTICE 'PASS — modo Fijo: invoice/payment_exchange_rate se sincronizan en Draft sin exigir OT Approved';

  -- Un plan Draft en modo 'variable' SI sigue exigiendo OT Approved (captura independiente
  -- real) -- en su propia OT (c3): wo_payment_plan.wo_id es UNIQUE, no puede compartir c1.
  DECLARE
    v_plan_draft_var   uuid;
    v_inst_pending_var uuid;
  BEGIN
    INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, payment_days, exchange_rate_mode)
    VALUES ('40000000-0000-4000-8000-0000000000c3', 6.96, 30, 'variable')
    RETURNING plan_id INTO v_plan_draft_var;

    INSERT INTO public.wo_payment_installments
      (plan_id, wo_id, installment_number, percentage, status)
    VALUES (v_plan_draft_var, '40000000-0000-4000-8000-0000000000c3', 1, 100, 'Pending')
    RETURNING installment_id INTO v_inst_pending_var;

    denied := false;
    BEGIN
      UPDATE public.wo_payment_installments SET invoice_exchange_rate = 6.96 WHERE installment_id = v_inst_pending_var;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
        denied := true;
      ELSE
        RAISE;
      END IF;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'PER FAIL — modo Variable pudo capturar invoice_exchange_rate en Draft (deberia exigir OT Approved)';
    END IF;
    RAISE NOTICE 'PASS — modo Variable: invoice_exchange_rate sigue rechazado en Draft (EXCHANGE_RATE_LOCKED)';

    denied := false;
    BEGIN
      UPDATE public.wo_payment_installments SET payment_exchange_rate = 6.96 WHERE installment_id = v_inst_pending_var;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
        denied := true;
      ELSE
        RAISE;
      END IF;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'PER FAIL — modo Variable pudo capturar payment_exchange_rate en Draft (deberia exigir OT Approved)';
    END IF;
    RAISE NOTICE 'PASS — modo Variable: payment_exchange_rate sigue rechazado en Draft (EXCHANGE_RATE_LOCKED)';
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- Backfill statement (re-run verbatim from the migration against fixtures made to
  -- look pre-migration: columns start as NULL after insert). The real migration ran its
  -- backfill BEFORE installing the guard. Re-running it against the final schema uses
  -- a Fixed-mode plan: Variable-mode payment rates intentionally reject a Pending
  -- installment, which is a post-migration capture rule unrelated to this backfill.
  -- ══════════════════════════════════════════════════════════════════

  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, status)
  VALUES (v_plan_approved, '40000000-0000-4000-8000-0000000000c2', 1, 100, 'Pending')
  RETURNING installment_id INTO v_inst_pending;

  -- A plan with NO exchange_rate at all (its own OT, c4 -- wo_id es UNIQUE, no puede
  -- compartir c2), to assert NULL is preserved, not invented.
  DECLARE
    v_inst_backfill uuid;
    v_plan_null_rate uuid;
    v_inst_null_rate uuid;
  BEGIN
    INSERT INTO public.wo_payment_installments
      (plan_id, wo_id, installment_number, percentage, status)
    VALUES (v_plan_draft, '40000000-0000-4000-8000-0000000000c1', 2, 100, 'Pending')
    RETURNING installment_id INTO v_inst_backfill;

    INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, payment_days)
    VALUES ('40000000-0000-4000-8000-0000000000c4', NULL, 30)
    RETURNING plan_id INTO v_plan_null_rate;

    INSERT INTO public.wo_payment_installments
      (plan_id, wo_id, installment_number, percentage, status)
    VALUES (v_plan_null_rate, '40000000-0000-4000-8000-0000000000c4', 1, 100, 'Pending')
    RETURNING installment_id INTO v_inst_null_rate;

    -- The migration's backfill statement, re-run verbatim against this transaction's own fixtures.
    UPDATE public.wo_payment_installments i
    SET invoice_exchange_rate = p.exchange_rate,
        payment_exchange_rate = p.exchange_rate
    FROM public.wo_payment_plan p
    WHERE i.plan_id = p.plan_id
      AND i.installment_id IN (v_inst_backfill, v_inst_null_rate);

    IF (SELECT invoice_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_backfill) IS DISTINCT FROM 6.96
       OR (SELECT payment_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_backfill) IS DISTINCT FROM 6.96 THEN
      RAISE EXCEPTION 'PER FAIL — backfill no copio el TC del plan (6.96) a la cuota existente';
    END IF;
    RAISE NOTICE 'PASS — backfill copia el TC del plan a invoice/payment_exchange_rate de la cuota existente';

    IF (SELECT invoice_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_null_rate) IS NOT NULL
       OR (SELECT payment_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_null_rate) IS NOT NULL THEN
      RAISE EXCEPTION 'PER FAIL — backfill inteo un TC para un plan sin exchange_rate (debia preservar NULL)';
    END IF;
    RAISE NOTICE 'PASS — backfill preserva NULL cuando el plan no tenia TC (nunca inventa un valor)';
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- wo_payment_installments freeze — invoice_exchange_rate (OT ya Approved: v_plan_approved/c2)
  -- ══════════════════════════════════════════════════════════════════

  -- Pending + OT Approved + modo Variable: editable (captura independiente habilitada
  -- tras aprobar; a diferencia del re-sync de Fijo, esto SI es una captura real).
  UPDATE public.wo_payment_installments SET invoice_exchange_rate = 6.97 WHERE installment_id = v_inst_pending;
  IF (SELECT invoice_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_pending) <> 6.97 THEN
    RAISE EXCEPTION 'PER FAIL — invoice_exchange_rate no se pudo editar en una OT Approved con la cuota Pending';
  END IF;
  RAISE NOTICE 'PASS — invoice_exchange_rate editable con OT Approved y status = Pending';

  -- Atomic write: status Pending->Invoiced together with the invoice_exchange_rate snapshot,
  -- in the SAME statement (OLD.status is still 'Pending' when the trigger evaluates it).
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, status)
  VALUES (v_plan_approved, '40000000-0000-4000-8000-0000000000c2', 3, 100, 'Pending')
  RETURNING installment_id INTO v_inst_invoiced;

  UPDATE public.wo_payment_installments
  SET status = 'Invoiced', invoice_exchange_rate = 6.98
  WHERE installment_id = v_inst_invoiced;

  IF (SELECT status FROM public.wo_payment_installments WHERE installment_id = v_inst_invoiced) <> 'Invoiced'
     OR (SELECT invoice_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_invoiced) <> 6.98 THEN
    RAISE EXCEPTION 'PER FAIL — la transicion Pending->Invoiced no escribio status+invoice_exchange_rate atomicamente';
  END IF;
  RAISE NOTICE 'PASS — status + invoice_exchange_rate se escriben atomicamente en la misma transicion a Invoiced';

  -- Now Invoiced: invoice_exchange_rate is permanently frozen (regardless of approval_status).
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET invoice_exchange_rate = 7.00 WHERE installment_id = v_inst_invoiced;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — invoice_exchange_rate se pudo cambiar a un valor distinto en una cuota Invoiced';
  END IF;
  RAISE NOTICE 'PASS — invoice_exchange_rate rechaza un cambio de valor una vez Invoiced (EXCHANGE_RATE_LOCKED)';

  -- Re-sending the SAME already-frozen value is a no-op for the trigger (never rejected) —
  -- this is exactly what a Fijo-mode synced batch upsert does for an already-frozen row.
  UPDATE public.wo_payment_installments SET invoice_exchange_rate = 6.98 WHERE installment_id = v_inst_invoiced;
  RAISE NOTICE 'PASS — re-enviar el mismo TC ya congelado es un no-op (no rechazado)';

  -- A column-unrelated UPDATE on the same frozen row is never rejected (column-by-column check).
  UPDATE public.wo_payment_installments SET collection_invoice_date = '2026-09-10' WHERE installment_id = v_inst_invoiced;
  RAISE NOTICE 'PASS — un UPDATE de una columna no relacionada no es rechazado por el freeze de TC';

  -- Manual revert Invoiced -> Overdue (persisted): invoice_exchange_rate stays frozen permanently.
  UPDATE public.wo_payment_installments SET status = 'Overdue' WHERE installment_id = v_inst_invoiced;
  v_inst_overdue := v_inst_invoiced;

  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET invoice_exchange_rate = 7.01 WHERE installment_id = v_inst_overdue;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — invoice_exchange_rate se reabrio tras un revert manual Invoiced->Overdue';
  END IF;
  RAISE NOTICE 'PASS — invoice_exchange_rate sigue congelado tras un revert manual a Overdue post-factura';

  -- ══════════════════════════════════════════════════════════════════
  -- MUST FIX review iteracion 1 #4: un UPDATE directo no puede revertir el status a un
  -- valor anterior del state machine (STATUS_TRANSITIONS en WorkOrderPaymentPlanSection).
  -- Sin este guard, revertir Invoiced/Overdue -> Pending reabria invoice_exchange_rate
  -- (su freeze depende de OLD.status <> 'Pending') en un bypass de 2 pasos.
  -- ══════════════════════════════════════════════════════════════════

  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET status = 'Pending' WHERE installment_id = v_inst_overdue;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INVALID_STATUS_TRANSITION%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — se pudo revertir directamente el status de Overdue a Pending (bypass del freeze en 2 pasos)';
  END IF;
  RAISE NOTICE 'PASS — un UPDATE directo no puede revertir el status a Pending (INVALID_STATUS_TRANSITION)';

  -- Nota: que Overdue -> Invoiced siga siendo una transicion legal (re-facturacion
  -- manual) ya queda probado mas abajo, como efecto colateral de "Re-invoice Overdue ->
  -- Invoiced, then complete" — si el guard la bloqueara, ese paso fallaria con una
  -- excepcion inesperada y todo el bloque abortaria.

  -- ══════════════════════════════════════════════════════════════════
  -- wo_payment_installments freeze — payment_exchange_rate (OT ya Approved)
  -- ══════════════════════════════════════════════════════════════════

  -- MUST FIX review iteracion 1 #1: en modo Variable, payment_exchange_rate NUNCA es
  -- capturable mientras la cuota sigue Pending (todavia no se facturo nada), aunque la
  -- OT ya este Approved — antes de esta correccion, el campo quedaba editable en
  -- pantalla en ese estado. v_inst_pending sigue Pending en este punto del suite.
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET payment_exchange_rate = 6.50 WHERE installment_id = v_inst_pending;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — payment_exchange_rate se pudo capturar en modo Variable con la cuota todavia Pending';
  END IF;
  RAISE NOTICE 'PASS — modo Variable: payment_exchange_rate rechaza captura mientras la cuota sigue Pending, pese a OT Approved';

  -- Editable while Overdue (post-invoice) — operator decision: payment TC stays editable
  -- through both Invoiced and a post-invoice persisted Overdue alike.
  UPDATE public.wo_payment_installments SET payment_exchange_rate = 6.99 WHERE installment_id = v_inst_overdue;
  IF (SELECT payment_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_overdue) <> 6.99 THEN
    RAISE EXCEPTION 'PER FAIL — payment_exchange_rate no se pudo editar en una cuota Overdue post-factura';
  END IF;
  RAISE NOTICE 'PASS — payment_exchange_rate editable durante Overdue post-factura';

  -- Re-invoice Overdue -> Invoiced, then complete: status+payment_exchange_rate written atomically.
  UPDATE public.wo_payment_installments SET status = 'Invoiced' WHERE installment_id = v_inst_overdue;
  UPDATE public.wo_payment_installments
  SET status = 'Completed', payment_exchange_rate = 7.02
  WHERE installment_id = v_inst_overdue;
  v_inst_completed := v_inst_overdue;

  IF (SELECT payment_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_completed) <> 7.02 THEN
    RAISE EXCEPTION 'PER FAIL — la transicion a Completed no escribio payment_exchange_rate atomicamente';
  END IF;
  RAISE NOTICE 'PASS — status + payment_exchange_rate se escriben atomicamente en la transicion a Completed';

  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET payment_exchange_rate = 7.05 WHERE installment_id = v_inst_completed;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — payment_exchange_rate se pudo cambiar a un valor distinto una vez Completed';
  END IF;
  RAISE NOTICE 'PASS — payment_exchange_rate rechaza un cambio de valor una vez Completed (EXCHANGE_RATE_LOCKED)';

  -- Completed es terminal: ninguna transicion de status sale de ahi (STATUS_TRANSITIONS.Completed = []).
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET status = 'Invoiced' WHERE installment_id = v_inst_completed;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INVALID_STATUS_TRANSITION%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — se pudo revertir el status de una cuota Completed (deberia ser terminal)';
  END IF;
  RAISE NOTICE 'PASS — Completed es terminal: ninguna transicion de status sale de ahi (INVALID_STATUS_TRANSITION)';

  -- ══════════════════════════════════════════════════════════════════
  -- MUST FIX review iteracion 2 #1/#3 (decision del operador: "si una cuota ya esta
  -- facturada, no se puede modificar o eliminar de ninguna manera"): percentage/amount/
  -- installment_number quedan congelados junto con el TC, y el DELETE se rechaza.
  -- ══════════════════════════════════════════════════════════════════

  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET percentage = 50 WHERE installment_id = v_inst_completed;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — percentage se pudo cambiar en una cuota ya facturada (Completed)';
  END IF;
  RAISE NOTICE 'PASS — percentage rechaza cambios en una cuota ya facturada (INSTALLMENT_LOCKED)';

  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET amount = 999 WHERE installment_id = v_inst_completed;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — amount se pudo cambiar en una cuota ya facturada (Completed)';
  END IF;
  RAISE NOTICE 'PASS — amount rechaza cambios en una cuota ya facturada (INSTALLMENT_LOCKED)';

  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET installment_number = 77 WHERE installment_id = v_inst_completed;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — installment_number se pudo cambiar en una cuota ya facturada (Completed)';
  END IF;
  RAISE NOTICE 'PASS — installment_number rechaza cambios en una cuota ya facturada (INSTALLMENT_LOCKED)';

  -- Sanity: esos mismos campos SI se pueden editar en una cuota todavia Pending
  -- (v_inst_pending, bajo v_plan_approved) — el guard es especifico de status <> 'Pending'.
  UPDATE public.wo_payment_installments SET percentage = 42 WHERE installment_id = v_inst_pending;
  IF (SELECT percentage FROM public.wo_payment_installments WHERE installment_id = v_inst_pending) <> 42 THEN
    RAISE EXCEPTION 'PER FAIL — percentage no se pudo editar en una cuota todavia Pending';
  END IF;
  RAISE NOTICE 'PASS — percentage sigue editable en una cuota todavia Pending';

  -- DELETE de una cuota ya facturada: rechazado.
  denied := false;
  BEGIN
    DELETE FROM public.wo_payment_installments WHERE installment_id = v_inst_completed;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — se pudo borrar una cuota ya facturada (Completed)';
  END IF;
  RAISE NOTICE 'PASS — DELETE rechaza una cuota ya facturada (INSTALLMENT_LOCKED)';

  -- DELETE de una cuota todavia Pending: permitido.
  DELETE FROM public.wo_payment_installments WHERE installment_id = v_inst_pending;
  IF EXISTS (SELECT 1 FROM public.wo_payment_installments WHERE installment_id = v_inst_pending) THEN
    RAISE EXCEPTION 'PER FAIL — no se pudo borrar una cuota todavia Pending';
  END IF;
  RAISE NOTICE 'PASS — DELETE permitido en una cuota todavia Pending';

  -- NULL is a valid, non-blocking snapshot (exchange_rate_history vacia -> no se exige un TC
  -- manual). Un INSERT no pasa por este trigger (es BEFORE UPDATE), asi que el estado
  -- Draft/Approved de la OT es irrelevante aca -- se inserta bajo la OT Draft a proposito.
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, status, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan_draft, '40000000-0000-4000-8000-0000000000c1', 4, 100, 'Pending', NULL, NULL);
  RAISE NOTICE 'PASS — invoice_exchange_rate/payment_exchange_rate en NULL no bloquean el INSERT';

  -- ══════════════════════════════════════════════════════════════════
  -- wo_payment_plan freeze
  -- ══════════════════════════════════════════════════════════════════

  -- Draft: exchange_rate / exchange_rate_mode still editable.
  UPDATE public.wo_payment_plan SET exchange_rate = 6.95, exchange_rate_mode = 'variable' WHERE plan_id = v_plan_draft;
  IF (SELECT exchange_rate_mode FROM public.wo_payment_plan WHERE plan_id = v_plan_draft) <> 'variable' THEN
    RAISE EXCEPTION 'PER FAIL — exchange_rate_mode no se pudo editar mientras la OT esta Draft';
  END IF;
  RAISE NOTICE 'PASS — exchange_rate / exchange_rate_mode editables mientras la OT dueña esta Draft';

  -- Approved: both columns are frozen.
  denied := false;
  BEGIN
    UPDATE public.wo_payment_plan SET exchange_rate = 7.10 WHERE plan_id = v_plan_approved;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — wo_payment_plan.exchange_rate se pudo cambiar con la OT dueña ya Approved';
  END IF;
  RAISE NOTICE 'PASS — wo_payment_plan.exchange_rate rechaza cambios con la OT dueña Approved (EXCHANGE_RATE_LOCKED)';

  -- v_plan_approved ya esta en modo 'variable' (ver fixture arriba) -- el cambio de
  -- valor real que ejercita el freeze es volver a 'fijo', no reenviar 'variable'
  -- (el mismo valor seria un no-op silencioso para el trigger, que compara IS NOT
  -- DISTINCT FROM, y este test daria PASS por la razon equivocada).
  denied := false;
  BEGIN
    UPDATE public.wo_payment_plan SET exchange_rate_mode = 'fijo' WHERE plan_id = v_plan_approved;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — wo_payment_plan.exchange_rate_mode se pudo cambiar con la OT dueña ya Approved';
  END IF;
  RAISE NOTICE 'PASS — wo_payment_plan.exchange_rate_mode rechaza cambios con la OT dueña Approved (EXCHANGE_RATE_LOCKED)';

  -- Column-unrelated UPDATE (payment_days) on the same Approved plan is never rejected.
  UPDATE public.wo_payment_plan SET payment_days = 45 WHERE plan_id = v_plan_approved;
  IF (SELECT payment_days FROM public.wo_payment_plan WHERE plan_id = v_plan_approved) <> 45 THEN
    RAISE EXCEPTION 'PER FAIL — payment_days no se pudo editar en un plan Approved (no deberia frenarlo el freeze de TC)';
  END IF;
  RAISE NOTICE 'PASS — payment_days sigue editable en un plan Approved (freeze es columna por columna)';

  -- ══════════════════════════════════════════════════════════════════
  -- MUST FIX review iteracion 2 #4 (decision del operador: bloquear): el plan tambien
  -- queda bloqueado si ya tiene alguna cuota facturada, aunque la OT dueña siga (o haya
  -- vuelto a) Draft -- ej. revertir aprobacion + intentar cambiar de modo/TC dejaria el
  -- TC "oficial" del plan desalineado del TC ya aplicado a esa cuota. Se simula
  -- facturando una cuota bajo v_plan_draft (transicion de status permitida sin importar
  -- approval_status) y probando el freeze con la OT todavia en Draft.
  -- ══════════════════════════════════════════════════════════════════

  DECLARE
    v_inst_draft_invoiced uuid;
  BEGIN
    INSERT INTO public.wo_payment_installments
      (plan_id, wo_id, installment_number, percentage, status)
    VALUES (v_plan_draft, '40000000-0000-4000-8000-0000000000c1', 5, 100, 'Pending')
    RETURNING installment_id INTO v_inst_draft_invoiced;

    UPDATE public.wo_payment_installments SET status = 'Invoiced' WHERE installment_id = v_inst_draft_invoiced;

    denied := false;
    BEGIN
      UPDATE public.wo_payment_plan SET exchange_rate = 5.55 WHERE plan_id = v_plan_draft;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
        denied := true;
      ELSE
        RAISE;
      END IF;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'PER FAIL — wo_payment_plan.exchange_rate se pudo cambiar pese a tener una cuota ya facturada (OT sigue Draft)';
    END IF;
    RAISE NOTICE 'PASS — wo_payment_plan.exchange_rate rechaza cambios si ya existe una cuota facturada, aunque la OT siga Draft (EXCHANGE_RATE_LOCKED)';

    -- v_plan_draft ya esta en modo 'variable' (fixture de mas arriba) -- probar con
    -- 'fijo' para ejercitar un cambio de valor real, no un no-op.
    denied := false;
    BEGIN
      UPDATE public.wo_payment_plan SET exchange_rate_mode = 'fijo' WHERE plan_id = v_plan_draft;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
        denied := true;
      ELSE
        RAISE;
      END IF;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'PER FAIL — wo_payment_plan.exchange_rate_mode se pudo cambiar pese a tener una cuota ya facturada (OT sigue Draft)';
    END IF;
    RAISE NOTICE 'PASS — wo_payment_plan.exchange_rate_mode rechaza cambios si ya existe una cuota facturada, aunque la OT siga Draft (EXCHANGE_RATE_LOCKED)';
  END;

  RAISE NOTICE 'PAYMENT EXCHANGE RATES TRIGGERS: ALL CHECKS PASSED (rolled back)';
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- MUST FIX 0722-156b review iteracion 4 #3/#4 — migracion 20260905172820 (consolidado):
--   #3: el guard de freeze solo corria BEFORE UPDATE; un INSERT directo podia crear una
--       cuota ya Invoiced/Completed con un TC "congelado" arbitrario.
--   #4: sync_wo_payment_installments() reemplaza el delete+upsert en 2 llamadas
--       separadas (frontend) por una unica funcion transaccional: si el upsert falla
--       (ej. INSTALLMENT_LOCKED), el delete de huerfanos tambien debe revertirse.
-- Fixture propio (E5/WO5) para no depender de mutaciones del bloque anterior.
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000c5', 'c1000000-0000-4000-8000-0000000000c1', 'PER E5 (INSERT guard + sync RPC)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000c5', 'e0000000-0000-4000-8000-0000000000c5', 'USD', 'High', 'Draft');

-- Fixture aparte (E6/WO6), plan/cuota de OTRO plan de pagos, para el hallazgo #1 de la
-- Iteración 5 (ownership de plan en sync_wo_payment_installments).
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000c6', 'c1000000-0000-4000-8000-0000000000c1', 'PER E6 (sync RPC ownership)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000c6', 'e0000000-0000-4000-8000-0000000000c6', 'USD', 'High', 'Draft');

DO $$
DECLARE
  v_plan       uuid;
  v_inst_keep  uuid;
  v_inst_lost  uuid;
  v_wo_other   uuid := '40000000-0000-4000-8000-0000000000c6';
  v_plan_other uuid;
  v_inst_other uuid;
  denied       boolean;
BEGIN
  INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, payment_days)
  VALUES ('40000000-0000-4000-8000-0000000000c5', 6.96, 30)
  RETURNING plan_id INTO v_plan;

  -- Plan/cuota de OTRO plan de pagos (OT distinta), usado abajo para el hallazgo #1 de
  -- ownership en sync_wo_payment_installments.
  INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, payment_days)
  VALUES (v_wo_other, 6.96, 30)
  RETURNING plan_id INTO v_plan_other;

  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan_other, v_wo_other, 1, 100, 500, 'Pending', 6.96, 6.96)
  RETURNING installment_id INTO v_inst_other;

  -- ── #3: INSERT directo de una cuota ya Invoiced/Completed con TC "congelado" ──
  denied := false;
  BEGIN
    INSERT INTO public.wo_payment_installments
      (plan_id, wo_id, installment_number, percentage, amount, status, invoice_exchange_rate, payment_exchange_rate)
    VALUES (v_plan, '40000000-0000-4000-8000-0000000000c5', 90, 100, 1000, 'Completed', 6.96, 6.96);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — un INSERT directo pudo crear una cuota ya Completed con TC congelado (bypass del freeze)';
  END IF;
  RAISE NOTICE 'PASS — INSERT directo de una cuota no-Pending es rechazado (INSTALLMENT_LOCKED)';

  -- El comportamiento legitimo de la app (insertar una cuota nueva en Pending, TC
  -- prellenado) debe seguir funcionando sin cambios.
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan, '40000000-0000-4000-8000-0000000000c5', 1, 40, 400, 'Pending', 6.96, 6.96)
  RETURNING installment_id INTO v_inst_keep;
  RAISE NOTICE 'PASS — INSERT de una cuota nueva en Pending (TC prellenado) sigue permitido';

  -- Segunda cuota, que el payload del RPC de abajo NO incluira (queda "huerfana").
  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan, '40000000-0000-4000-8000-0000000000c5', 2, 60, 600, 'Pending', 6.96, 6.96)
  RETURNING installment_id INTO v_inst_lost;

  -- La marca como Invoiced para que quede "bloqueada" (amount ya no se puede tocar).
  UPDATE public.wo_payment_installments SET status = 'Invoiced' WHERE installment_id = v_inst_lost;

  -- ── #4: sync_wo_payment_installments debe ser atomico ──
  -- Payload: solo v_inst_keep sobrevive (v_inst_lost queda huerfana -> se borraria) Y
  -- ademas intenta cambiar el amount de v_inst_lost -- pero v_inst_lost YA NO esta en el
  -- payload (fue "removida" por el usuario en la misma edicion que cambio el fee), asi
  -- que el intento real es: el UPDATE de v_inst_keep con un amount distinto simulando un
  -- cambio de feeWithTax, mientras v_inst_lost (Invoiced, huerfana) intentaria borrarse.
  -- Para forzar el fallo del UPDATE (no del DELETE), el payload SI incluye v_inst_lost
  -- pero con un amount distinto al que tiene en DB -- el guard de UPDATE lo rechaza.
  denied := false;
  BEGIN
    PERFORM public.sync_wo_payment_installments(
      v_plan,
      '40000000-0000-4000-8000-0000000000c5'::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'installment_id', v_inst_keep, 'installment_number', 1, 'percentage', 40, 'amount', 500,
          'status', 'Pending', 'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96
        ),
        jsonb_build_object(
          'installment_id', v_inst_lost, 'installment_number', 2, 'percentage', 60, 'amount', 999,
          'status', 'Invoiced', 'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — sync_wo_payment_installments acepto cambiar el amount de una cuota Invoiced';
  END IF;
  RAISE NOTICE 'PASS — sync_wo_payment_installments rechaza (INSTALLMENT_LOCKED) tocar el amount de una cuota ya facturada';

  -- La cuota "keep" NUNCA debio tocarse (la funcion entera revierte ante el error de la
  -- otra fila) -- prueba directa de atomicidad: ambas filas siguen exactamente como
  -- estaban antes de la llamada fallida.
  IF (SELECT amount FROM public.wo_payment_installments WHERE installment_id = v_inst_keep) <> 400 THEN
    RAISE EXCEPTION 'PER FAIL — sync_wo_payment_installments no fue atomica: v_inst_keep quedo modificada pese a que la funcion fallo';
  END IF;
  IF (SELECT amount FROM public.wo_payment_installments WHERE installment_id = v_inst_lost) <> 600 THEN
    RAISE EXCEPTION 'PER FAIL — sync_wo_payment_installments no fue atomica: v_inst_lost quedo modificada pese a que la funcion fallo';
  END IF;
  RAISE NOTICE 'PASS — sync_wo_payment_installments es atomica: un fallo en cualquier fila revierte TODA la llamada, ninguna fila queda a mitad de camino';

  -- Camino feliz: payload que solo cambia la fila editable (v_inst_keep) y remueve la
  -- ya facturada del array (representa que el usuario ya no la ve en pantalla) -- debe
  -- borrarse igual que antes via el mismo mecanismo, siempre que su propio status/monto
  -- no cambien (nada la esta modificando, solo dejando de listarla). Como v_inst_lost
  -- sigue Invoiced en DB y el payload no la incluye, el DELETE de huerfanos la afecta;
  -- eso es exactamente lo que el guard BEFORE DELETE (trg_wo_payment_installments_
  -- guard_delete) ya cubre — debe rechazarse tambien aca, coherente con "una cuota
  -- facturada no puede eliminarse de ninguna manera".
  denied := false;
  BEGIN
    PERFORM public.sync_wo_payment_installments(
      v_plan,
      '40000000-0000-4000-8000-0000000000c5'::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'installment_id', v_inst_keep, 'installment_number', 1, 'percentage', 100, 'amount', 1000,
          'status', 'Pending', 'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — sync_wo_payment_installments pudo borrar (como huerfana) una cuota ya facturada';
  END IF;
  RAISE NOTICE 'PASS — sync_wo_payment_installments respeta el guard BEFORE DELETE: no borra una cuota ya facturada aunque quede fuera del payload';

  -- Camino feliz: ambas filas presentes, v_inst_keep con un cambio real (Pending, sigue
  -- editable), v_inst_lost reenviada IDENTICA a como esta en DB (no-op para el guard de
  -- la cuota ya facturada) -- debe tener exito sin excepcion.
  PERFORM public.sync_wo_payment_installments(
    v_plan,
    '40000000-0000-4000-8000-0000000000c5'::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'installment_id', v_inst_keep, 'installment_number', 1, 'percentage', 100, 'amount', 1000,
        'status', 'Pending', 'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96
      ),
      jsonb_build_object(
        'installment_id', v_inst_lost, 'installment_number', 2, 'percentage', 60, 'amount', 600,
        'status', 'Invoiced', 'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96
      )
    )
  );
  IF (SELECT amount FROM public.wo_payment_installments WHERE installment_id = v_inst_keep) <> 1000 THEN
    RAISE EXCEPTION 'PER FAIL — sync_wo_payment_installments no aplico un cambio valido en una cuota Pending';
  END IF;
  RAISE NOTICE 'PASS — sync_wo_payment_installments aplica cambios validos (camino feliz) sin excepcion';

  -- ── review iteracion 5 #1: sync_wo_payment_installments debe validar ownership de plan ──
  -- Payload declara v_plan (nuestro plan) pero incluye el installment_id de v_inst_other, que
  -- pertenece a v_plan_other (otra OT). Sin el guard, el UPDATE por conflicto tocaria el amount
  -- de esa cuota ajena sin ninguna verificacion.
  denied := false;
  BEGIN
    PERFORM public.sync_wo_payment_installments(
      v_plan,
      '40000000-0000-4000-8000-0000000000c5'::uuid,
      jsonb_build_array(
        jsonb_build_object(
          'installment_id', v_inst_keep, 'installment_number', 1, 'percentage', 100, 'amount', 1000,
          'status', 'Pending', 'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96
        ),
        jsonb_build_object(
          'installment_id', v_inst_other, 'installment_number', 2, 'percentage', 60, 'amount', 999,
          'status', 'Pending', 'invoice_exchange_rate', 6.96, 'payment_exchange_rate', 6.96
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'INSTALLMENT_PLAN_MISMATCH%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — sync_wo_payment_installments acepto un installment_id de otro plan (bypass de ownership)';
  END IF;
  RAISE NOTICE 'PASS — sync_wo_payment_installments rechaza (INSTALLMENT_PLAN_MISMATCH) un installment_id que pertenece a otro plan';

  -- La cuota ajena NUNCA debio tocarse -- prueba directa de que el rechazo ocurrio antes de
  -- cualquier escritura (ni siquiera el DELETE de huerfanos del plan propio se aplico).
  IF (SELECT amount FROM public.wo_payment_installments WHERE installment_id = v_inst_other) <> 500 THEN
    RAISE EXCEPTION 'PER FAIL — sync_wo_payment_installments modifico una cuota de otro plan pese al rechazo';
  END IF;
  IF (SELECT amount FROM public.wo_payment_installments WHERE installment_id = v_inst_keep) <> 1000 THEN
    RAISE EXCEPTION 'PER FAIL — sync_wo_payment_installments no fue atomica ante el rechazo de ownership';
  END IF;
  RAISE NOTICE 'PASS — el rechazo de ownership no modifica ni la cuota ajena ni las del plan propio';

  RAISE NOTICE 'INSTALLMENT INSERT GUARD + SYNC RPC: ALL CHECKS PASSED (rolled back)';
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- MUST FIX 0722-156b review iteracion 6 #1 — migracion 20260908150000:
--   trg_wo_payment_plan_guard_exchange_rate solo corria BEFORE UPDATE -- una OT ya
--   Aprobada puede legitimamente no tener ningun plan todavia; sin este guard, un
--   INSERT directo podia crear uno con TC/modo arbitrario, sin pasar por ninguna
--   validacion.
-- Fixture propio (E8/WO8): OT Approved, SIN plan de pagos.
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000c8', 'c1000000-0000-4000-8000-0000000000c1', 'PER E8 (Approved WO, sin plan)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000c8', 'e0000000-0000-4000-8000-0000000000c8', 'USD', 'High', 'Approved');

DO $$
DECLARE
  denied boolean;
BEGIN
  denied := false;
  BEGIN
    INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, exchange_rate_mode)
    VALUES ('40000000-0000-4000-8000-0000000000c8', 6.96, 'fijo');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — un INSERT directo pudo crear un plan de pagos para una OT ya Aprobada';
  END IF;
  RAISE NOTICE 'PASS — INSERT directo de un plan de pagos para una OT ya Aprobada es rechazado (EXCHANGE_RATE_LOCKED)';

  IF EXISTS (SELECT 1 FROM public.wo_payment_plan WHERE wo_id = '40000000-0000-4000-8000-0000000000c8') THEN
    RAISE EXCEPTION 'PER FAIL — el plan rechazado igual quedo insertado';
  END IF;

  RAISE NOTICE 'PLAN INSERT GUARD: ALL CHECKS PASSED (rolled back)';
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- MUST FIX 0722-156b review iteracion 7 #1 — migracion 20260908150000:
--   wo_id no era inmutable en wo_payment_plan -- un UPDATE podia reasignar el plan de
--   una OT Aprobada hacia una OT Draft (cambiando el TC de paso) y despues devolverlo
--   sin tocar el TC, burlando el freeze en 2 pasos (el 2do paso se colaba por el
--   early-return que solo compara exchange_rate/exchange_rate_mode).
-- Fixture propio (E9/WO9): OT Draft, SIN plan de pagos -- destino de la reasignacion.
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000c9', 'c1000000-0000-4000-8000-0000000000c1', 'PER E9 (Draft WO, sin plan, destino reasignacion)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000c9', 'e0000000-0000-4000-8000-0000000000c9', 'USD', 'High', 'Draft');

DO $$
DECLARE
  v_plan_c2 uuid;
  denied boolean;
BEGIN
  SELECT plan_id INTO v_plan_c2 FROM public.wo_payment_plan WHERE wo_id = '40000000-0000-4000-8000-0000000000c2';

  -- Paso 1 del ataque: reasignar el plan de la OT Aprobada (c2) hacia la OT Draft (c9)
  -- EN EL MISMO UPDATE que cambia el TC -- sin el guard, esto pasaria (NEW.wo_id resuelve
  -- a una OT Draft, ya no Approved) dejando el plan "de paso" con un TC nuevo.
  denied := false;
  BEGIN
    UPDATE public.wo_payment_plan SET wo_id = '40000000-0000-4000-8000-0000000000c9', exchange_rate = 5.00
    WHERE plan_id = v_plan_c2;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'WO_ID_IMMUTABLE%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — se pudo reasignar el plan de una OT Aprobada hacia otra OT';
  END IF;
  RAISE NOTICE 'PASS — reasignar wo_id de un plan es rechazado (WO_ID_IMMUTABLE), incluso combinado con un cambio de TC';

  IF (SELECT wo_id FROM public.wo_payment_plan WHERE plan_id = v_plan_c2) <> '40000000-0000-4000-8000-0000000000c2' THEN
    RAISE EXCEPTION 'PER FAIL — el plan quedo reasignado pese al rechazo';
  END IF;
  IF (SELECT exchange_rate FROM public.wo_payment_plan WHERE plan_id = v_plan_c2) <> 6.90 THEN
    RAISE EXCEPTION 'PER FAIL — el TC del plan cambio pese al rechazo de la reasignacion';
  END IF;

  -- Paso 2 del ataque: reasignar SIN tocar el TC -- el paso que antes se colaba por el
  -- early-return (compara solo exchange_rate/exchange_rate_mode) tambien debe rechazarse.
  denied := false;
  BEGIN
    UPDATE public.wo_payment_plan SET wo_id = '40000000-0000-4000-8000-0000000000c9'
    WHERE plan_id = v_plan_c2;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'WO_ID_IMMUTABLE%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — se pudo reasignar el plan sin tocar el TC (el paso que antes usaba el early-return para colarse)';
  END IF;
  RAISE NOTICE 'PASS — reasignar wo_id sin tocar el TC tambien es rechazado (no se cuela por el early-return)';

  RAISE NOTICE 'PLAN WO_ID IMMUTABLE: ALL CHECKS PASSED (rolled back)';
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- MUST FIX 0722-156b review iteracion 8 #2 — migracion 20260908150000:
--   el guard de INSERT solo rechazaba 'Approved', pero isEditable (WorkOrderForm.tsx:549)
--   tambien excluye 'Pending_Approval' -- la pantalla nunca permite crear un plan
--   mientras la OT esta en revision, pero el guard dejaba pasar un INSERT directo en ese
--   estado.
-- Fixture propio (E10/WO10): OT Pending_Approval, SIN plan de pagos.
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000ca', 'c1000000-0000-4000-8000-0000000000c1', 'PER E10 (Pending_Approval WO, sin plan)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000ca', 'e0000000-0000-4000-8000-0000000000ca', 'USD', 'High', 'Pending_Approval');

DO $$
DECLARE
  denied boolean;
BEGIN
  denied := false;
  BEGIN
    INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, exchange_rate_mode)
    VALUES ('40000000-0000-4000-8000-0000000000ca', 6.96, 'fijo');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — un INSERT directo pudo crear un plan de pagos para una OT en Pending_Approval';
  END IF;
  RAISE NOTICE 'PASS — INSERT directo de un plan de pagos para una OT en Pending_Approval es rechazado (EXCHANGE_RATE_LOCKED)';

  IF EXISTS (SELECT 1 FROM public.wo_payment_plan WHERE wo_id = '40000000-0000-4000-8000-0000000000ca') THEN
    RAISE EXCEPTION 'PER FAIL — el plan rechazado igual quedo insertado';
  END IF;

  RAISE NOTICE 'PLAN INSERT GUARD (Pending_Approval): ALL CHECKS PASSED (rolled back)';
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- MUST FIX 0722-156b review iteracion 9 #3 — migracion 20260908150000 (consolidada
-- 2026-09-08, vivia en un archivo aparte 20260908160000 hasta la fusion):
--   sync_wo_payment_installments validaba que un installment_id EXISTENTE
--   perteneciera a p_plan_id, pero nunca que p_plan_id perteneciera realmente a
--   p_wo_id -- RLS autoriza por plan_id (via wo_payment_plan.wo_id real), nunca
--   por la columna wo_id de la fila que se esta escribiendo.
-- Reusa fixtures existentes: el plan de E1/c1 (Draft, Fijo) + la OT de E9/c9 (Draft,
-- sin plan propio) como el wo_id ajeno declarado en el payload.
-- ══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_plan_c1 uuid;
  denied boolean;
BEGIN
  SELECT plan_id INTO v_plan_c1 FROM public.wo_payment_plan WHERE wo_id = '40000000-0000-4000-8000-0000000000c1';

  denied := false;
  BEGIN
    PERFORM public.sync_wo_payment_installments(
      v_plan_c1,
      '40000000-0000-4000-8000-0000000000c9'::uuid,
      '[]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'PLAN_WO_MISMATCH%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — sync_wo_payment_installments acepto un plan_id/wo_id que no corresponden entre si';
  END IF;
  RAISE NOTICE 'PASS — sync_wo_payment_installments rechaza (PLAN_WO_MISMATCH) un plan_id que no pertenece al wo_id declarado';

  IF EXISTS (
    SELECT 1 FROM public.wo_payment_installments
    WHERE plan_id = v_plan_c1 AND wo_id <> '40000000-0000-4000-8000-0000000000c1'
  ) THEN
    RAISE EXCEPTION 'PER FAIL — quedaron cuotas del plan de c1 con un wo_id ajeno pese al rechazo';
  END IF;

  RAISE NOTICE 'SYNC RPC PLAN/WO OWNERSHIP GUARD: ALL CHECKS PASSED (rolled back)';
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- MUST FIX 0722-156b review iteracion 12 #1 — migracion 20260910090000:
--   en modo fijo, el chequeo de aprobacion solo se evaluaba en modo variable -- un
--   UPDATE directo podia poner cualquier valor en invoice_exchange_rate/
--   payment_exchange_rate de una cuota Pending en modo Fijo, sin pasar por ningun
--   chequeo, rompiendo la garantia de que toda cuota en Fijo refleja el TC del plan.
-- Fixture propio (E11/WO11): OT Draft, plan Fijo (TC 6.96), 1 cuota Pending ya
-- sincronizada con el TC del plan.
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000cb', 'c1000000-0000-4000-8000-0000000000c1', 'PER E11 (Fijo, UPDATE directo con TC distinto al del plan)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000cb', 'e0000000-0000-4000-8000-0000000000cb', 'USD', 'High', 'Draft');

DO $$
DECLARE
  v_plan_c11 uuid;
  v_inst_c11 uuid;
  denied boolean;
BEGIN
  INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, exchange_rate_mode)
  VALUES ('40000000-0000-4000-8000-0000000000cb', 6.96, 'fijo')
  RETURNING plan_id INTO v_plan_c11;

  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan_c11, '40000000-0000-4000-8000-0000000000cb', 1, 100, 1000, 'Pending', 6.96, 6.96)
  RETURNING installment_id INTO v_inst_c11;

  -- invoice_exchange_rate: un UPDATE directo a un valor distinto al del plan debe
  -- rechazarse, aunque la cuota siga Pending y la OT siga en Draft.
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET invoice_exchange_rate = 7.50 WHERE installment_id = v_inst_c11;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — en modo fijo, invoice_exchange_rate acepto un valor distinto al del plan';
  END IF;
  RAISE NOTICE 'PASS — en modo fijo, invoice_exchange_rate rechaza (EXCHANGE_RATE_LOCKED) un valor distinto al del plan';

  -- payment_exchange_rate: mismo criterio.
  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET payment_exchange_rate = 7.50 WHERE installment_id = v_inst_c11;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — en modo fijo, payment_exchange_rate acepto un valor distinto al del plan';
  END IF;
  RAISE NOTICE 'PASS — en modo fijo, payment_exchange_rate rechaza (EXCHANGE_RATE_LOCKED) un valor distinto al del plan';

  -- Camino feliz: reenviar el mismo valor que ya tiene (no-op) sigue permitido.
  UPDATE public.wo_payment_installments SET invoice_exchange_rate = 6.96 WHERE installment_id = v_inst_c11;
  RAISE NOTICE 'PASS — en modo fijo, reenviar el mismo TC del plan (no-op) sigue permitido';

  RAISE NOTICE 'FIXED MODE RATE GUARD: ALL CHECKS PASSED (rolled back)';
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- MUST FIX 0722-156b review iteracion 12 #2 — migracion 20260908150000:
--   wo_payment_installments_plan_id_fkey tiene ON DELETE CASCADE; el trigger de
--   wo_payment_plan solo corria en INSERT/UPDATE, y el guard de DELETE de cuotas solo
--   rechaza si ALGUNA cuota individual no esta 'Pending' -- con todas las cuotas
--   Pending (tipico recien aprobada la OT), un DELETE directo del plan borraba todo
--   en cascada sin ningun chequeo.
-- Fixture propio (E12/WO12): OT Approved, plan Fijo, 1 cuota Pending (sin facturar).
-- ══════════════════════════════════════════════════════════════════════

INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000cc', 'c1000000-0000-4000-8000-0000000000c1', 'PER E12 (Approved WO, DELETE directo del plan)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000cc', 'e0000000-0000-4000-8000-0000000000cc', 'USD', 'High', 'Draft');

DO $$
DECLARE
  v_plan_c12 uuid;
  denied boolean;
BEGIN
  -- Plan siempre se crea en Draft; la OT se aprueba despues (secuencia real, igual que
  -- el fixture de c2 en la seccion del guard de INSERT).
  INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, exchange_rate_mode)
  VALUES ('40000000-0000-4000-8000-0000000000cc', 6.96, 'fijo')
  RETURNING plan_id INTO v_plan_c12;

  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, amount, status, invoice_exchange_rate, payment_exchange_rate)
  VALUES (v_plan_c12, '40000000-0000-4000-8000-0000000000cc', 1, 100, 1000, 'Pending', 6.96, 6.96);

  UPDATE public.work_orders SET approval_status = 'Approved' WHERE wo_id = '40000000-0000-4000-8000-0000000000cc';

  denied := false;
  BEGIN
    DELETE FROM public.wo_payment_plan WHERE plan_id = v_plan_c12;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — se pudo borrar el plan de pagos de una OT ya Aprobada (con todas sus cuotas Pending)';
  END IF;
  RAISE NOTICE 'PASS — DELETE directo del plan de una OT Aprobada es rechazado (EXCHANGE_RATE_LOCKED)';

  IF NOT EXISTS (SELECT 1 FROM public.wo_payment_plan WHERE plan_id = v_plan_c12) THEN
    RAISE EXCEPTION 'PER FAIL — el plan quedo borrado pese al rechazo';
  END IF;
  IF (SELECT count(*) FROM public.wo_payment_installments WHERE plan_id = v_plan_c12) <> 1 THEN
    RAISE EXCEPTION 'PER FAIL — las cuotas del plan quedaron borradas en cascada pese al rechazo';
  END IF;

  RAISE NOTICE 'PLAN DELETE GUARD: ALL CHECKS PASSED (rolled back)';
END $$;

-- Camino feliz: un plan de una OT en Draft (nunca aprobada) SI se puede borrar --
-- confirma que el guard nuevo no rompe el flujo real de "quitar todas las cuotas ->
-- se borra el plan" (useDeletePaymentPlan, WorkOrderEdit.tsx) mientras la OT sigue
-- editable.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000cd', 'c1000000-0000-4000-8000-0000000000c1', 'PER E13 (Draft WO, DELETE directo del plan permitido)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000cd', 'e0000000-0000-4000-8000-0000000000cd', 'USD', 'High', 'Draft');

DO $$
DECLARE
  v_plan_c13 uuid;
BEGIN
  INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, exchange_rate_mode)
  VALUES ('40000000-0000-4000-8000-0000000000cd', 6.96, 'fijo')
  RETURNING plan_id INTO v_plan_c13;

  DELETE FROM public.wo_payment_plan WHERE plan_id = v_plan_c13;

  IF EXISTS (SELECT 1 FROM public.wo_payment_plan WHERE plan_id = v_plan_c13) THEN
    RAISE EXCEPTION 'PER FAIL — el plan de una OT Draft no se pudo borrar (regresion del flujo real)';
  END IF;
  RAISE NOTICE 'PASS — DELETE directo del plan de una OT Draft (nunca aprobada) sigue permitido';

  RAISE NOTICE 'PLAN DELETE GUARD (camino feliz Draft): ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
