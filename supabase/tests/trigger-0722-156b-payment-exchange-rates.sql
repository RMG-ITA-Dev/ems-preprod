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
--   - wo_payment_installments freeze (Amendment 2026-09-07): invoice_exchange_rate /
--     payment_exchange_rate can ONLY change while the owning work order is Approved, in
--     ADDITION to the pre-existing status-based freeze (invoice_exchange_rate editable
--     only while status = 'Pending'; payment_exchange_rate editable while status <>
--     'Completed'). Re-sending an already-frozen value unchanged is a no-op (not
--     rejected); changing status + the still-editable rate in the SAME UPDATE succeeds
--     atomically; a column-unrelated UPDATE (e.g. collection_invoice_date) on an
--     otherwise-frozen row is never rejected.
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

-- E1/WO1: Draft (plan/mode still editable, TC de cuota bloqueado pese a status=Pending).
-- E2/WO2: Approved (plan/mode frozen; TC de cuota recien se habilita aca).
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, practica, fecha_cierre, society_id) VALUES
  ('e0000000-0000-4000-8000-0000000000c1', 'c1000000-0000-4000-8000-0000000000c1', 'PER E1 (Draft WO)',    1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1')),
  ('e0000000-0000-4000-8000-0000000000c2', 'c1000000-0000-4000-8000-0000000000c1', 'PER E2 (Approved WO)', 1, '2026-09-30', (SELECT society_id FROM public.society WHERE society_id = '50c00000-0000-4000-8000-0000000000c1'));

INSERT INTO public.work_orders (wo_id, engagement_id, currency, season_mode, approval_status) VALUES
  ('40000000-0000-4000-8000-0000000000c1', 'e0000000-0000-4000-8000-0000000000c1', 'USD', 'High', 'Draft'),
  ('40000000-0000-4000-8000-0000000000c2', 'e0000000-0000-4000-8000-0000000000c2', 'USD', 'High', 'Approved');

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

  INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, payment_days)
  VALUES ('40000000-0000-4000-8000-0000000000c2', 6.90, 30)
  RETURNING plan_id INTO v_plan_approved;

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
  -- Draft bloquea la captura de TC por cuota, AUNQUE status = 'Pending' (Amendment
  -- 2026-09-07): sin esto, una transicion de estado prematura en una OT sin aprobar
  -- (ej. un admin saltandose la UI) congelaria el TC en NULL para siempre.
  -- ══════════════════════════════════════════════════════════════════

  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, status)
  VALUES (v_plan_draft, '40000000-0000-4000-8000-0000000000c1', 1, 100, 'Pending')
  RETURNING installment_id INTO v_inst_pending;

  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET invoice_exchange_rate = 6.96 WHERE installment_id = v_inst_pending;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — invoice_exchange_rate se pudo capturar en una cuota Pending de una OT todavia Draft';
  END IF;
  RAISE NOTICE 'PASS — invoice_exchange_rate rechaza captura mientras la OT dueña sigue Draft (EXCHANGE_RATE_LOCKED), pese a status = Pending';

  denied := false;
  BEGIN
    UPDATE public.wo_payment_installments SET payment_exchange_rate = 6.96 WHERE installment_id = v_inst_pending;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'EXCHANGE_RATE_LOCKED%' THEN
      denied := true;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'PER FAIL — payment_exchange_rate se pudo capturar en una cuota de una OT todavia Draft';
  END IF;
  RAISE NOTICE 'PASS — payment_exchange_rate rechaza captura mientras la OT dueña sigue Draft (EXCHANGE_RATE_LOCKED)';

  -- ══════════════════════════════════════════════════════════════════
  -- Backfill statement (re-run verbatim from the migration against fixtures made to
  -- look pre-migration: columns forced back to NULL after insert). Corre sobre el plan
  -- Approved (v_plan_approved/c2): desde el Amendment 2026-09-07 el freeze tambien
  -- exige OT Approved, y este re-run es un UPDATE real que pasa por ese mismo trigger.
  -- ══════════════════════════════════════════════════════════════════

  INSERT INTO public.wo_payment_installments
    (plan_id, wo_id, installment_number, percentage, status)
  VALUES (v_plan_approved, '40000000-0000-4000-8000-0000000000c2', 1, 100, 'Pending')
  RETURNING installment_id INTO v_inst_pending;

  -- A second plan with NO exchange_rate at all, to assert NULL is preserved, not invented.
  DECLARE
    v_plan_null_rate uuid;
    v_inst_null_rate uuid;
  BEGIN
    INSERT INTO public.wo_payment_plan (wo_id, exchange_rate, payment_days)
    VALUES ('40000000-0000-4000-8000-0000000000c2', NULL, 30)
    RETURNING plan_id INTO v_plan_null_rate;

    INSERT INTO public.wo_payment_installments
      (plan_id, wo_id, installment_number, percentage, status)
    VALUES (v_plan_null_rate, '40000000-0000-4000-8000-0000000000c2', 2, 100, 'Pending')
    RETURNING installment_id INTO v_inst_null_rate;

    -- The migration's backfill statement, re-run verbatim against this transaction's own fixtures.
    UPDATE public.wo_payment_installments i
    SET invoice_exchange_rate = p.exchange_rate,
        payment_exchange_rate = p.exchange_rate
    FROM public.wo_payment_plan p
    WHERE i.plan_id = p.plan_id
      AND i.installment_id IN (v_inst_pending, v_inst_null_rate);

    IF (SELECT invoice_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_pending) IS DISTINCT FROM 6.90
       OR (SELECT payment_exchange_rate FROM public.wo_payment_installments WHERE installment_id = v_inst_pending) IS DISTINCT FROM 6.90 THEN
      RAISE EXCEPTION 'PER FAIL — backfill no copio el TC del plan (6.90) a la cuota existente';
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

  -- Pending + OT Approved: editable (this is also the "synced Fijo-mode write" the app performs).
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
  -- wo_payment_installments freeze — payment_exchange_rate (OT ya Approved)
  -- ══════════════════════════════════════════════════════════════════

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

  denied := false;
  BEGIN
    UPDATE public.wo_payment_plan SET exchange_rate_mode = 'variable' WHERE plan_id = v_plan_approved;
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

  RAISE NOTICE 'PAYMENT EXCHANGE RATES TRIGGERS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
