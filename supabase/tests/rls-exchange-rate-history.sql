-- RLS assertions for public.exchange_rate_history (bug 0722-156, Fase 1 — plan_v2.md
-- Proposed Fix §1, Tests to Add). Run via supabase/tests/local/run-rls-tests.sh against the
-- disposable scratch database, AFTER 20260905070913_0722-156_add_exchange_rate_history.sql has
-- been applied. Single transaction, ALWAYS rolls back.
--
-- Under test: authenticated can SELECT every row (policy "Authenticated users can read
-- exchange rates" is USING(true), no per-row scoping needed — this is a firmwide reference
-- rate, not tenant/staff-scoped data); authenticated cannot INSERT/UPDATE/DELETE (no write
-- policy exists for any browser-facing role — writes only ever happen via the
-- exchange-rate-sync edge function's service-role client, which bypasses RLS); anon (the table
-- grant is broad, matching the repo's existing per-table convention, but the SELECT policy is
-- scoped TO authenticated only) sees zero rows. Also asserts two distinct fecha_vigencia rows
-- coexist (the natural-key/history design, not a single-row "current value" table).
--
-- Success output: one NOTICE per passing check ending with
-- "EXCHANGE RATE HISTORY RLS: ALL CHECKS PASSED (rolled back)".

BEGIN;

-- ── Fixtures (as postgres; RLS does not bind the table owner) ─────────
INSERT INTO public.exchange_rate_history
  (id, fecha_vigencia, compra, venta, moneda, fuente, regimen, version_metodologia,
   canal, fecha_publicacion, actualizado_en, estado)
VALUES
  ('e1000000-0000-4000-8000-0000000000a1', '2026-08-25', 11.57, 11.67, 'USD/BOB',
   'Banco Central de Bolivia', 'flexible', 'RD BCB 88/2026', 'bcb-web',
   '2026-08-25', '2026-08-25T22:34:47.473-04:00', 'vigente'),
  ('e1000000-0000-4000-8000-0000000000a2', '2026-08-26', 11.58, 11.68, 'USD/BOB',
   'Banco Central de Bolivia', 'flexible', 'RD BCB 88/2026', 'bcb-web',
   '2026-08-26', '2026-08-26T22:31:10.000-04:00', 'vigente');

-- ── Impersonation helper (temp; vanishes with the session) ────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  )
$$;

-- ── Everything below (until the anon sub-block) runs as `authenticated` ──
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
  denied boolean;
BEGIN
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-0000000000e1');

  -- ── authenticated: reads both fixture rows (two fecha_vigencia coexist) ──
  SELECT count(*) INTO n FROM public.exchange_rate_history
   WHERE id IN ('e1000000-0000-4000-8000-0000000000a1', 'e1000000-0000-4000-8000-0000000000a2');
  IF n <> 2 THEN
    RAISE EXCEPTION 'EXCHANGE RATE RLS FAIL — authenticated: expected 2 fixture rows (distinct fecha_vigencia), got %', n;
  END IF;
  RAISE NOTICE 'PASS — authenticated reads both fixture rows; two fecha_vigencia coexist';

  -- ── authenticated: cannot UPDATE (no write policy -> 0 rows affected, no error) ──
  UPDATE public.exchange_rate_history SET compra = 99
   WHERE id = 'e1000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'EXCHANGE RATE RLS FAIL — authenticated could UPDATE exchange_rate_history (% rows)', n;
  END IF;
  RAISE NOTICE 'PASS — authenticated cannot UPDATE (0 rows affected)';

  -- ── authenticated: cannot DELETE (no write policy -> 0 rows affected, no error) ──
  DELETE FROM public.exchange_rate_history WHERE id = 'e1000000-0000-4000-8000-0000000000a2';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN
    RAISE EXCEPTION 'EXCHANGE RATE RLS FAIL — authenticated could DELETE from exchange_rate_history (% rows)', n;
  END IF;
  RAISE NOTICE 'PASS — authenticated cannot DELETE (0 rows affected)';

  -- ── authenticated: cannot INSERT (no WITH CHECK policy -> hard RLS violation) ──
  denied := false;
  BEGIN
    INSERT INTO public.exchange_rate_history
      (id, fecha_vigencia, compra, venta, fuente, canal, actualizado_en, estado)
    VALUES
      ('e1000000-0000-4000-8000-0000000000a9', '2026-08-27', 11.6, 11.7,
       'Banco Central de Bolivia', 'bcb-web', now(), 'vigente');
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'EXCHANGE RATE RLS FAIL — authenticated could INSERT into exchange_rate_history';
  END IF;
  RAISE NOTICE 'PASS — authenticated cannot INSERT (RLS violation raised)';

  -- ── anon: SELECT policy is scoped TO authenticated only -> zero rows ──
  IF to_regrole('anon') IS NULL THEN
    RAISE NOTICE 'SKIP — role anon not present in this environment';
  ELSE
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';

    SELECT count(*) INTO n FROM public.exchange_rate_history
     WHERE id IN ('e1000000-0000-4000-8000-0000000000a1', 'e1000000-0000-4000-8000-0000000000a2');
    IF n <> 0 THEN
      RAISE EXCEPTION 'EXCHANGE RATE RLS FAIL — anon can read exchange_rate_history (% rows)', n;
    END IF;
    RAISE NOTICE 'PASS — anon reads zero rows (SELECT policy scoped to authenticated)';

    EXECUTE 'RESET ROLE';
  END IF;

  RAISE NOTICE 'EXCHANGE RATE HISTORY RLS: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
