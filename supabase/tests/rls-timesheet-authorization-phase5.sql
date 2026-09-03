-- Phase 5 timesheet-authorization RPC tests (get_staff_assignment_segments).
-- Plan: docs/plans/scheduler-phase-5-timesheet-authorization.md §2.2.
--
-- HARNESS-ONLY (convention delta 2 vs the D5 suite): run EXCLUSIVELY via
-- supabase/tests/local/run-rls-tests.sh against the disposable scratch
-- database. Unlike rls-engagement-assignments-d5.sql this suite is NOT
-- runnable against the live DB / SQL editor: its fixtures INSERT into the
-- harness shim's minimal time_entries (5 columns) — live time_entries has
-- activity_id uuid NOT NULL plus five BEFORE triggers (engagement-date hard
-- block, holiday, termination, WO-approved, activity-default), so the same
-- INSERTs are invalid SQL there. The BEGIN/ROLLBACK wrapper is kept anyway
-- as defense in depth.
--
-- Convention delta 1 vs the D5 suite: D5 denial probes catch
-- insufficient_privilege (RLS/ACL); this RPC's denials are procedural RAISEs,
-- so probes use nested BEGIN … EXCEPTION WHEN raise_exception blocks
-- asserting SQLERRM = 'EA_SEGMENTS_DENIED' (resp. 'EA_SEGMENTS_INVALID_RANGE').
--
-- Fixture world (all ids carry recognizable prefixes; time_entries use the
-- new d0… prefix). Probe weeks are Monday-aligned with a FRIDAY p_week_end
-- (5 rendered days), so the approver-arm guards are each exercised:
--   W1 = 2026-07-06 (Mon) … p_week_end 2026-07-10 (Fri); Sat = 2026-07-11
--   W2 = 2026-10-05 (Mon) … p_week_end 2026-10-09 (Fri)
--   W3 = 2026-08-03 (Mon) — the target logs NOTHING in [W3, +7d)
--
-- Persona P-A ("Pola"): structural manager_id of E1/E3/E4/E5 (NOT E2/E6),
-- category Manager-tier can_approve_timesheets = true with display_order 20
-- (below the submitter's 50), but user_roles.role = 'staff' — the persona the
-- D5 direct read strands and the approver arm heals (D5-3).
-- Target ("Tania", semisenior) assignments and W1 entries:
--   E1 led by P-A; positive Mon-Fri entries; assignment Jan 1 – Sep 30
--      (wide, exercises clamping)                       -> RETURNED (clamped)
--   E2 NOT led by P-A; overlapping assignment AND a positive Monday entry —
--      every conjunct except leadership passes           -> ZERO (leadership)
--   E3 led; overlapping assignment; NO entries anywhere  -> ZERO (evidence)
--   E4 led; overlapping assignment; positive entry ONLY Saturday — inside
--      [Mon,+7d) eligibility but outside [Mon,Fri]       -> ZERO (p_week_end)
--   E5 led; overlapping assignment; Mon-Fri entry with hours_logged = 0
--                                                        -> ZERO (hours > 0)
--   E6 led by disqualified Lidia (manager role, display_order 20 but
--      can_approve_timesheets = false); target has positive Monday entry AND
--      overlapping assignment — check 12's denial is attributable to the
--      disqualification, not "no entry" (rev.4 non-vacuity)
--   E7 soft-deleted-only assignment                      -> never returned
--   E8 assignment fully outside every probed week        -> never returned
--
-- Success output: one NOTICE per passing check ending with
-- "P5 TIMESHEET AUTHZ: ALL CHECKS PASSED (rolled back)".

BEGIN;

-- ── Fixtures (as postgres; SECURITY DEFINER owner is RLS-exempt) ──────
-- Andamiaje agregado por la migración cero: practica/sociedad/actividad/rol RBAC
-- dummy y las FKs a auth.users, todos NOT NULL/FK reales en el esquema consolidado que
-- el viejo shim minimalista (contra el que corría esta suite) no tenía en absoluto.
INSERT INTO public.practicas (practica_id, name, code, abbreviation)
VALUES ('5e000000-0000-4000-8000-000000000101', 'P5 Test Practice', 8, 'PFV');

INSERT INTO public.society (society_id, name)
VALUES ('50c00000-0000-4000-8000-000000000101', 'P5 Test Society');

-- ON CONFLICT DO NOTHING: run-rls-tests.sh ya sembró el catálogo RBAC real completo
-- (40-fixture-rbac-catalog.sql, 23 roles + 84 permisos + 737 concesiones) antes de esta
-- transacción. NO existe un role_key 'staff' en ese catálogo real — el enum legacy
-- `role = 'staff'` mapea a role_key 'assistant' (ver el backfill de
-- 20260724010000_authz_fase2_seed.sql) — así que no se siembra acá.
INSERT INTO public.authorization_roles (role_key, label_key) VALUES
  ('semisenior', 'authz.role.semisenior'),
  ('partner', 'authz.role.partner'),
  ('manager', 'authz.role.manager')
ON CONFLICT (role_key) DO NOTHING;

-- get_timesheet_approvers() ya NO lee categories.can_approve_timesheets (el diseño que
-- este fixture asumía originalmente) — resuelve la aprobación vía el catálogo RBAC real:
-- authorization_role_permissions ya trae ('manager','timesheet_approval.approve',
-- 'assigned_engagements') de fábrica (sembrado arriba). Pola (check 5) prueba
-- exactamente la brecha entre el enum legacy y el RBAC nuevo: su user_roles.role queda
-- 'staff' (la strandea de los chequeos legacy has_role()), pero su role_key es 'manager'
-- (la concesión real de aprobación cuelga de ahí) — el "heal" ya no pasa por
-- categories.can_approve_timesheets (huérfano para esta RPC, aunque la columna sigue
-- existiendo en categories para otros usos), pasa por la distinción role vs. role_key.

INSERT INTO auth.users (id) VALUES
  ('a0000000-0000-4000-8000-000000000101'),
  ('a0000000-0000-4000-8000-000000000102'),
  ('a0000000-0000-4000-8000-000000000103'),
  ('a0000000-0000-4000-8000-000000000104'),
  ('a0000000-0000-4000-8000-000000000105'),
  ('a0000000-0000-4000-8000-000000000106');

INSERT INTO public.activity_codes (activity_id, activity_code, description, practica_id) VALUES
  ('ac000000-0000-4000-8000-000000000101', 'PFV-A1', 'P5 Test Activity', '5e000000-0000-4000-8000-000000000101');

INSERT INTO public.categories (category_id, category_name, display_order, can_approve_timesheets, practica_id) VALUES
  ('c0000000-0000-4000-8000-000000000121', 'P5 Approver Managers',  20, true, '5e000000-0000-4000-8000-000000000101'),
  ('c0000000-0000-4000-8000-000000000122', 'P5 Submitters',         50, false, '5e000000-0000-4000-8000-000000000101'),
  ('c0000000-0000-4000-8000-000000000123', 'P5 Leads (no approve)', 20, false, '5e000000-0000-4000-8000-000000000101');
-- display_order set EXPLICITLY on both tiers: the shim column defaults to 0,
-- and implicit defaults would make approver.display_order < submitter's
-- unsatisfiable (check 5 would fail mysteriously).

INSERT INTO public.clients (client_id, client_legal_name, unique_tax_id)
VALUES ('c1000000-0000-4000-8000-000000000101', 'P5 Test Client', 'P5-TAX-001');

INSERT INTO public.staff (staff_id, auth_user_id, first_name, last_name, category_id, practica_id, society_id) VALUES
  ('50000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000101', 'Tania', 'Target',        'c0000000-0000-4000-8000-000000000122', '5e000000-0000-4000-8000-000000000101', '50c00000-0000-4000-8000-000000000101'),
  ('50000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000102', 'Pola',  'Approver',      'c0000000-0000-4000-8000-000000000121', '5e000000-0000-4000-8000-000000000101', '50c00000-0000-4000-8000-000000000101'),
  ('50000000-0000-4000-8000-000000000103', 'a0000000-0000-4000-8000-000000000103', 'Fede',  'Firmwide',      'c0000000-0000-4000-8000-000000000121', '5e000000-0000-4000-8000-000000000101', '50c00000-0000-4000-8000-000000000101'),
  ('50000000-0000-4000-8000-000000000104', 'a0000000-0000-4000-8000-000000000104', 'Selma', 'Staffrole',     'c0000000-0000-4000-8000-000000000122', '5e000000-0000-4000-8000-000000000101', '50c00000-0000-4000-8000-000000000101'),
  ('50000000-0000-4000-8000-000000000105', 'a0000000-0000-4000-8000-000000000105', 'Mara',  'Managernotlead','c0000000-0000-4000-8000-000000000122', '5e000000-0000-4000-8000-000000000101', '50c00000-0000-4000-8000-000000000101'),
  ('50000000-0000-4000-8000-000000000106', 'a0000000-0000-4000-8000-000000000106', 'Lidia', 'Leadnoapprove', 'c0000000-0000-4000-8000-000000000123', '5e000000-0000-4000-8000-000000000101', '50c00000-0000-4000-8000-000000000101'),
  ('50000000-0000-4000-8000-000000000107', NULL,                                   'Olga',  'Otherlead',     'c0000000-0000-4000-8000-000000000122', '5e000000-0000-4000-8000-000000000101', '50c00000-0000-4000-8000-000000000101');

-- Pola (102): role legacy 'staff' (strandea has_role()/checks legacy), role_key 'manager'
-- (de ahí cuelga la concesión real timesheet_approval.approve — ver nota de arriba).
-- Selma (104): role_key 'assistant' — mapeo real del backfill para role legacy 'staff'
-- (20260724010000); su check 2 solo depende de v_is_self, no de permisos de aprobador.
INSERT INTO public.user_roles (user_id, role, role_key) VALUES
  ('a0000000-0000-4000-8000-000000000101', 'semisenior', 'semisenior'),
  ('a0000000-0000-4000-8000-000000000102', 'staff', 'manager'),
  ('a0000000-0000-4000-8000-000000000103', 'partner', 'partner'),
  ('a0000000-0000-4000-8000-000000000104', 'staff', 'assistant'),
  ('a0000000-0000-4000-8000-000000000105', 'manager', 'manager');

-- Lidia (106): role_key NULL a propósito. El catálogo RBAC real concede
-- timesheet_approval.approve a TODO role_key='manager' sin distinción de categoría — ya
-- no hay forma de ser "role manager pero descalificado" vía role_key (la nuance vivía en
-- categories.can_approve_timesheets, huérfana para esta RPC). role_key NULL preserva la
-- intención original del check 12 (líder estructural que NO debe aprobar) y es un estado
-- real y contemplado: el propio backfill de 20260724010000 deja NULL a quien no matchea
-- ningún role legacy conocido — el JOIN de get_timesheet_approvers() con
-- authorization_role_permissions nunca matchea NULL, así que queda excluida sin más.
INSERT INTO public.user_roles (user_id, role, role_key)
VALUES ('a0000000-0000-4000-8000-000000000106', 'manager', NULL);

-- fecha_cierre NOT NULL y work_order_required default TRUE son reales en el esquema
-- consolidado (invisibles para el viejo shim). work_order_required=false explícito:
-- esta suite prueba get_staff_assignment_segments(), no el gate de aprobación de OT —
-- con el default TRUE, trg_check_wo_approved rechazaría cada INSERT de time_entries de
-- abajo por falta de una Work Order aprobada, algo ajeno a lo que se está probando aquí.
INSERT INTO public.engagements (engagement_id, client_id, engagement_name, manager_id, fecha_cierre, work_order_required, society_id) VALUES
  ('e0000000-0000-4000-8000-000000000101', 'c1000000-0000-4000-8000-000000000101', 'P5 E1', '50000000-0000-4000-8000-000000000102', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0000000-0000-4000-8000-000000000102', 'c1000000-0000-4000-8000-000000000101', 'P5 E2', '50000000-0000-4000-8000-000000000107', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0000000-0000-4000-8000-000000000103', 'c1000000-0000-4000-8000-000000000101', 'P5 E3', '50000000-0000-4000-8000-000000000102', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0000000-0000-4000-8000-000000000104', 'c1000000-0000-4000-8000-000000000101', 'P5 E4', '50000000-0000-4000-8000-000000000102', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0000000-0000-4000-8000-000000000105', 'c1000000-0000-4000-8000-000000000101', 'P5 E5', '50000000-0000-4000-8000-000000000102', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0000000-0000-4000-8000-000000000106', 'c1000000-0000-4000-8000-000000000101', 'P5 E6', '50000000-0000-4000-8000-000000000106', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0000000-0000-4000-8000-000000000107', 'c1000000-0000-4000-8000-000000000101', 'P5 E7', '50000000-0000-4000-8000-000000000107', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0000000-0000-4000-8000-000000000108', 'c1000000-0000-4000-8000-000000000101', 'P5 E8', '50000000-0000-4000-8000-000000000107', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  -- E9/E10: led by P-A, for the PR #224 forecast + orphan-period controls
  ('e0000000-0000-4000-8000-000000000109', 'c1000000-0000-4000-8000-000000000101', 'P5 E9', '50000000-0000-4000-8000-000000000102', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1)),
  ('e0000000-0000-4000-8000-000000000110', 'c1000000-0000-4000-8000-000000000101', 'P5 E10', '50000000-0000-4000-8000-000000000102', '2026-12-31', false, (SELECT society_id FROM public.society ORDER BY name LIMIT 1));

-- timesheet_periods for the target: W1 (the probed week), W2, and a DECOY
-- period for a different week (used by the E10 orphan-period control — an
-- in-week actual entry whose period_id is NOT the viewed week's period).
INSERT INTO public.timesheet_periods (period_id, staff_id, week_start_date, week_number, year) VALUES
  ('b0000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000101', '2026-07-06', 28, 2026),  -- W1 canonical
  ('b0000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000101', '2026-10-05', 41, 2026),  -- W2 canonical
  ('b0000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101', '2026-06-29', 27, 2026);  -- DECOY (wrong week)

INSERT INTO public.engagement_assignments
  (assignment_id, engagement_id, staff_id, category_id, start_date, end_date, deleted_at) VALUES
  -- Tania (the probed target)
  ('aa000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-01-01', '2026-09-30', NULL),
  ('aa000000-0000-4000-8000-000000000102', 'e0000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', NULL),
  ('aa000000-0000-4000-8000-000000000103', 'e0000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', NULL),
  ('aa000000-0000-4000-8000-000000000104', 'e0000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', NULL),
  ('aa000000-0000-4000-8000-000000000105', 'e0000000-0000-4000-8000-000000000105', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', NULL),
  ('aa000000-0000-4000-8000-000000000106', 'e0000000-0000-4000-8000-000000000106', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', NULL),
  ('aa000000-0000-4000-8000-000000000107', 'e0000000-0000-4000-8000-000000000107', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', now()),
  ('aa000000-0000-4000-8000-000000000108', 'e0000000-0000-4000-8000-000000000108', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-11-01', '2026-12-31', NULL),
  -- Selma (staff-role self-call, check 2) and Mara (manager-not-lead, check 3)
  ('aa000000-0000-4000-8000-000000000110', 'e0000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000104', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', NULL),
  ('aa000000-0000-4000-8000-000000000111', 'e0000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000105', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', NULL),
  -- Target E9/E10 assignments, overlapping W1 (PR #224 forecast + orphan controls)
  ('aa000000-0000-4000-8000-000000000109', 'e0000000-0000-4000-8000-000000000109', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', NULL),
  ('aa000000-0000-4000-8000-000000000112', 'e0000000-0000-4000-8000-000000000110', '50000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000122', '2026-06-01', '2026-08-31', NULL);

-- Every ACTUAL positive entry carries period_id = the canonical period for its
-- week and is_forecast = false, so the approver-arm evidence guard admits them
-- (PR #224 P1-01). The forecast and orphan-period rows below differ ONLY in the
-- guarded dimension, so their controls are non-vacuous.
-- activity_id NOT NULL con FK real a activity_codes (invisible para el shim viejo): todas
-- las filas usan la actividad dummy sembrada arriba, irrelevante para lo que se prueba.
INSERT INTO public.time_entries (time_id, staff_id, engagement_id, date_worked, hours_logged, period_id, is_forecast, activity_id) VALUES
  -- W1: E1 positive Mon + Wed (led by P-A -> returned)
  ('d0000000-0000-4000-8000-000000000101', '50000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000101', '2026-07-06', 8, 'b0000000-0000-4000-8000-000000000101', false, 'ac000000-0000-4000-8000-000000000101'),
  ('d0000000-0000-4000-8000-000000000102', '50000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000101', '2026-07-08', 8, 'b0000000-0000-4000-8000-000000000101', false, 'ac000000-0000-4000-8000-000000000101'),
  -- W1: E2 positive Monday (unled -> only the leadership conjunct zeroes it)
  ('d0000000-0000-4000-8000-000000000103', '50000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000102', '2026-07-06', 4, 'b0000000-0000-4000-8000-000000000101', false, 'ac000000-0000-4000-8000-000000000101'),
  -- W1: E3 — deliberately NO entries anywhere (entry-existence control)
  -- W1: E4 positive SATURDAY only (inside [Mon,+7d), outside [Mon,Fri])
  ('d0000000-0000-4000-8000-000000000104', '50000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000104', '2026-07-11', 4, 'b0000000-0000-4000-8000-000000000101', false, 'ac000000-0000-4000-8000-000000000101'),
  -- W1: E5 zero-hour Tuesday (hours_logged > 0 control)
  ('d0000000-0000-4000-8000-000000000105', '50000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000105', '2026-07-07', 0, 'b0000000-0000-4000-8000-000000000101', false, 'ac000000-0000-4000-8000-000000000101'),
  -- W1: E6 positive Monday on the disqualified lead's engagement (check 12)
  ('d0000000-0000-4000-8000-000000000106', '50000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000106', '2026-07-06', 4, 'b0000000-0000-4000-8000-000000000101', false, 'ac000000-0000-4000-8000-000000000101'),
  -- W2: E1 positive Tuesday — admits P-A for W2 while the E1 segment
  -- (ending Sep 30) does not cover W2 (approver success+empty, check 9)
  ('d0000000-0000-4000-8000-000000000107', '50000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000101', '2026-10-06', 8, 'b0000000-0000-4000-8000-000000000102', false, 'ac000000-0000-4000-8000-000000000101'),
  -- W1: E9 positive Monday but is_forecast = TRUE (forecast-evidence control,
  -- PR #224 P1-01): every other conjunct passes (led, overlapping assignment,
  -- in-interval, hours>0, correct period) — only is_forecast zeroes it.
  ('d0000000-0000-4000-8000-000000000109', '50000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000109', '2026-07-06', 6, 'b0000000-0000-4000-8000-000000000101', true, 'ac000000-0000-4000-8000-000000000101'),
  -- W1: E10 positive Monday ACTUAL, but period_id = the DECOY period, not W1's
  -- (orphan-period control, PR #224 P1-01): only the period_id bind zeroes it.
  ('d0000000-0000-4000-8000-000000000110', '50000000-0000-4000-8000-000000000101', 'e0000000-0000-4000-8000-000000000110', '2026-07-06', 5, 'b0000000-0000-4000-8000-000000000103', false, 'ac000000-0000-4000-8000-000000000101');

-- ── Impersonation helper (temp; vanishes with the session) ────────────
CREATE FUNCTION pg_temp.impersonate(p_sub text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'role', 'authenticated')::text,
    true
  )
$$;

-- ── Everything below runs as `authenticated` ──────────────────────────
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  n int;
  v_start date;
  v_end date;
  v_shape text;
  denied boolean;
  errmsg text;
BEGIN
  -- All row-count assertions are scoped to the eight fixture engagements.

  -- 1. Semisenior self-call — THE headline fix for the persona D5 broke.
  --    Own segments returned; endpoints clamped to the probe week
  --    (self-arm clamp, sql-security minor a: the E1 segment is Jan-Sep).
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000101');
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id IN ('e0000000-0000-4000-8000-000000000101','e0000000-0000-4000-8000-000000000102','e0000000-0000-4000-8000-000000000103','e0000000-0000-4000-8000-000000000104','e0000000-0000-4000-8000-000000000105','e0000000-0000-4000-8000-000000000106','e0000000-0000-4000-8000-000000000107','e0000000-0000-4000-8000-000000000108');
  IF n <> 6 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — semisenior self-call: expected 6 active W1 segments (E1-E6), got %', n; END IF;
  SELECT s.start_date, s.end_date INTO v_start, v_end
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000101';
  IF v_start <> '2026-07-06' OR v_end <> '2026-07-10' THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — self-arm clamp: E1 Jan-Sep segment returned [%..%], expected [2026-07-06..2026-07-10]', v_start, v_end;
  END IF;
  RAISE NOTICE 'PASS — check 1: semisenior self-call returns own segments (6), endpoints clamped to the probed week';

  -- 2. staff-app_role self-call.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000104');
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000104', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000101';
  IF n < 1 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — staff-role self-call: expected own E1 segment, got % rows', n; END IF;
  RAISE NOTICE 'PASS — check 2: staff-app_role self-call returns own segments';

  -- 3. Manager-not-lead SELF call: rows via RPC despite 0 direct-SELECT rows.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000105');
  SELECT count(*) INTO n FROM public.engagement_assignments
   WHERE staff_id = '50000000-0000-4000-8000-000000000105'
     AND engagement_id = 'e0000000-0000-4000-8000-000000000101';
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — manager-not-lead direct SELECT: expected 0 rows under D5, got %', n; END IF;
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000105', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000101';
  IF n < 1 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — manager-not-lead self-call: expected own E1 segment via RPC, got % rows', n; END IF;
  RAISE NOTICE 'PASS — check 3: manager-not-lead self-call returns rows via RPC despite 0 direct-SELECT rows';

  -- 4. Firmwide partner probing an arbitrary staff: exact fixture count.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000103');
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id IN ('e0000000-0000-4000-8000-000000000101','e0000000-0000-4000-8000-000000000102','e0000000-0000-4000-8000-000000000103','e0000000-0000-4000-8000-000000000104','e0000000-0000-4000-8000-000000000105','e0000000-0000-4000-8000-000000000106','e0000000-0000-4000-8000-000000000107','e0000000-0000-4000-8000-000000000108');
  IF n <> 6 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — firmwide partner: expected exactly 6 fixture segments, got %', n; END IF;
  RAISE NOTICE 'PASS — check 4: firmwide partner gets the exact fixture segment count (6)';

  -- 5. P-A structural approver ('staff' app_role) probing W1: approver arm healed.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000102');
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id IN ('e0000000-0000-4000-8000-000000000101','e0000000-0000-4000-8000-000000000102','e0000000-0000-4000-8000-000000000103','e0000000-0000-4000-8000-000000000104','e0000000-0000-4000-8000-000000000105','e0000000-0000-4000-8000-000000000106','e0000000-0000-4000-8000-000000000107','e0000000-0000-4000-8000-000000000108');
  IF n < 1 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — P-A approver probing W1: expected rows (D5-3 heal), got 0'; END IF;
  RAISE NOTICE 'PASS — check 5: structural approver with ''staff'' app_role gets rows (D5-3 heal)';

  -- 6. Approver-arm negative controls (five sub-assertions, each non-vacuous).
  -- (a) E1 returned — led, positive Mon-Fri entry.
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000101';
  IF n <> 1 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 6(a): led, positive-entry E1 not returned to approver (got % rows)', n; END IF;
  -- (b) E2 zero. E2 independently satisfies EVERY other conjunct (overlapping
  --     assignment + positive Monday entry); only the missing
  --     is_engagement_team_member conjunct can zero it — removing that
  --     conjunct from the RETURN flips this assertion to non-zero.
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000102';
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 6(b): unled E2 leaked — leadership scope missing (% rows)', n; END IF;
  -- (c) E3 zero — led but no entry anywhere (rev.2 entry-existence residual).
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000103';
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 6(c): entry-less led E3 leaked — entry-existence conjunct missing (% rows)', n; END IF;
  -- (d) E4 zero — led, assignment overlaps Mon-Fri, but the only entry is
  --     Saturday: inside [Mon,+7d) eligibility yet outside the requested
  --     [Mon,Fri] (rev.3 P1-01 partial-week escape).
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000104';
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 6(d): Sat-entry E4 leaked a Mon-Fri window — evidence not bounded by p_week_end (% rows)', n; END IF;
  -- (e) E5 zero — led, Mon-Fri entry but hours_logged = 0 (rev.3 P2-03).
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000105';
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 6(e): zero-hour E5 leaked — hours_logged > 0 bound missing (% rows)', n; END IF;
  RAISE NOTICE 'PASS — check 6: approver return scoped to led + positive in-interval engagements (E1 in; E2/E3/E4/E5 out)';

  -- 6bis. Non-vacuity: a FIRMWIDE caller (no evidence conjunct) DOES receive E9
  --       and E10 — proving their assignments overlap W1, so the approver-arm
  --       zeros below are attributable to the is_forecast / period_id evidence
  --       guards, not a missing segment (PR #224 P1-01).
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000103'); -- firmwide
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id IN ('e0000000-0000-4000-8000-000000000109','e0000000-0000-4000-8000-000000000110');
  IF n <> 2 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 6bis: firmwide should see both E9 and E10 segments (non-vacuity), got %', n; END IF;

  -- 6(f)/(g): the P-A approver gets ZERO for E9 (forecast-only evidence) and
  --           E10 (wrong-period evidence). Each fixture satisfies every OTHER
  --           conjunct (led, overlapping assignment, positive Mon-Fri entry,
  --           correct interval), so dropping the named guard flips the result.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000102'); -- P-A approver
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000109';
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 6(f): forecast-only E9 leaked a segment — is_forecast = false evidence bound missing (% rows)', n; END IF;
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000110';
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 6(g): orphan-period E10 leaked a segment — period_id evidence bound missing (% rows)', n; END IF;
  RAISE NOTICE 'PASS — check 6(f)/(g): forecast-only and wrong-period entries disclose no segment (actuals-in-period evidence bound)';

  -- 7. Endpoint clamp — approver arm (wide Jan-Sep E1 segment).
  SELECT s.start_date, s.end_date INTO v_start, v_end
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000101';
  IF v_start <> '2026-07-06' OR v_end <> '2026-07-10' THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 7: approver clamp broken: E1 returned [%..%], expected [2026-07-06..2026-07-10]', v_start, v_end;
  END IF;
  RAISE NOTICE 'PASS — check 7: approver-arm endpoints clamped to the probed week';

  -- 8. Endpoint clamp — firmwide arm (same wide segment).
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000103');
  SELECT s.start_date, s.end_date INTO v_start, v_end
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000101';
  IF v_start <> '2026-07-06' OR v_end <> '2026-07-10' THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 8: firmwide clamp broken: E1 returned [%..%], expected [2026-07-06..2026-07-10]', v_start, v_end;
  END IF;
  RAISE NOTICE 'PASS — check 8: firmwide-arm endpoints clamped to the probed week';

  -- 9. Approver success+empty on a led-but-unassigned week (I-P5-6 approver
  --    arm; sql-security F1). P-A is admitted for W2 via Tania's Oct 6 E1
  --    entry, leads E1, but the E1 segment (ending Sep 30) does not cover
  --    W2. Must return WITHOUT exception and with ZERO rows — never regress
  --    to EA_SEGMENTS_DENIED; distinct from check 6's scoped-out zero and
  --    checks 10-12's denials.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000102');
  denied := false;
  BEGIN
    SELECT count(*) INTO n
      FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-10-05', '2026-10-09') s
     WHERE s.engagement_id IN ('e0000000-0000-4000-8000-000000000101','e0000000-0000-4000-8000-000000000102','e0000000-0000-4000-8000-000000000103','e0000000-0000-4000-8000-000000000104','e0000000-0000-4000-8000-000000000105','e0000000-0000-4000-8000-000000000106','e0000000-0000-4000-8000-000000000107','e0000000-0000-4000-8000-000000000108');
  EXCEPTION WHEN raise_exception THEN
    denied := true;
  END;
  IF denied THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 9: admitted approver on led-but-unassigned W2 got an exception instead of success+empty'; END IF;
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 9: expected authoritative empty for W2, got % rows', n; END IF;
  RAISE NOTICE 'PASS — check 9: admitted approver gets success+empty on a led-but-unassigned week';

  -- 10. Unrelated authenticated staff probing another staff: denied, never
  --     a silent empty.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000104');
  denied := false; errmsg := NULL;
  BEGIN
    SELECT count(*) INTO n
      FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10');
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'EA_SEGMENTS_DENIED' THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 10: unrelated staff probe not denied with EA_SEGMENTS_DENIED (denied=%, err=%)', denied, errmsg;
  END IF;
  RAISE NOTICE 'PASS — check 10: unrelated staff denied with EA_SEGMENTS_DENIED';

  -- 11. Approver probing a Monday with NO submitter entries in [Monday,+7d):
  --     the arm is week-scoped. Fixture geometry keeps W1 (Jul 6-11) and W2
  --     (Oct 6) entries OUT of [2026-08-03, 2026-08-10).
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000102');
  denied := false; errmsg := NULL;
  BEGIN
    SELECT count(*) INTO n
      FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-08-03', '2026-08-07');
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'EA_SEGMENTS_DENIED' THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 11: entry-less week probe not denied (approver arm not week-scoped; denied=%, err=%)', denied, errmsg;
  END IF;
  RAISE NOTICE 'PASS — check 11: approver arm is week-scoped (entry-less W3 denied)';

  -- 12. Disqualified structural lead (Lidia: manager role, leads E6, D5
  --     direct SELECT would show her the E6 rows, but her category has
  --     can_approve_timesheets = false). Non-vacuity (rev.4 P1-01): the
  --     target has a positive Monday entry AND an overlapping assignment on
  --     E6, so a QUALIFIED lead would be admitted and receive the window —
  --     the denial is attributable to the disqualification, not "no entry".
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000106');
  denied := false; errmsg := NULL;
  BEGIN
    SELECT count(*) INTO n
      FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10');
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'EA_SEGMENTS_DENIED' THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 12: disqualified structural lead not denied (denied=%, err=%)', denied, errmsg;
  END IF;
  RAISE NOTICE 'PASS — check 12: disqualified structural lead of a shared, entry-bearing engagement is denied entirely';

  -- 13. 8-day span rejected.
  PERFORM pg_temp.impersonate('a0000000-0000-4000-8000-000000000101');
  denied := false; errmsg := NULL;
  BEGIN
    SELECT count(*) INTO n
      FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-14');
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'EA_SEGMENTS_INVALID_RANGE' THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 13: 8-day span not rejected with EA_SEGMENTS_INVALID_RANGE (denied=%, err=%)', denied, errmsg;
  END IF;
  RAISE NOTICE 'PASS — check 13: 8-day span rejected (EA_SEGMENTS_INVALID_RANGE)';

  -- 14. Non-Monday p_week_start rejected (D5-2 halo gate).
  denied := false; errmsg := NULL;
  BEGIN
    SELECT count(*) INTO n
      FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-08', '2026-07-10');
  EXCEPTION WHEN raise_exception THEN
    denied := true; errmsg := SQLERRM;
  END;
  IF NOT denied OR errmsg <> 'EA_SEGMENTS_INVALID_RANGE' THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 14: non-Monday start not rejected (denied=%, err=%)', denied, errmsg;
  END IF;
  RAISE NOTICE 'PASS — check 14: non-Monday p_week_start rejected (EA_SEGMENTS_INVALID_RANGE)';

  -- 15. Soft-deleted-only assignment: success, zero rows for E7 (client
  --     would warn).
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000107';
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 15: soft-deleted E7 assignment returned (% rows)', n; END IF;
  RAISE NOTICE 'PASS — check 15: soft-deleted-only assignment returns zero rows (would warn)';

  -- 16. Assignment fully outside the probed week is not returned.
  SELECT count(*) INTO n
    FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10') s
   WHERE s.engagement_id = 'e0000000-0000-4000-8000-000000000108';
  IF n <> 0 THEN RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 16: out-of-week E8 assignment returned (% rows)', n; END IF;
  RAISE NOTICE 'PASS — check 16: assignment fully outside the probed week not returned';

  -- 17. ACL — runtime AND static (mirrors the D5 suite's dual check).
  IF to_regrole('anon') IS NULL THEN
    RAISE NOTICE 'SKIP — role anon not present in this environment';
  ELSE
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    denied := false;
    BEGIN
      SELECT count(*) INTO n
        FROM public.get_staff_assignment_segments('50000000-0000-4000-8000-000000000101', '2026-07-06', '2026-07-10');
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 17: anon can invoke get_staff_assignment_segments at runtime';
    END IF;
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
    RAISE NOTICE 'PASS — check 17a: anon runtime invocation rejected';
  END IF;
  IF to_regrole('anon') IS NOT NULL
     AND has_function_privilege('anon', 'public.get_staff_assignment_segments(uuid,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 17: anon retains EXECUTE on get_staff_assignment_segments';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_staff_assignment_segments(uuid,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 17: authenticated lost EXECUTE on get_staff_assignment_segments';
  END IF;
  IF to_regrole('service_role') IS NOT NULL
     AND has_function_privilege('service_role', 'public.get_staff_assignment_segments(uuid,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 17: service_role retains EXECUTE (least-privilege: authenticated only)';
  END IF;
  RAISE NOTICE 'PASS — check 17b: ACL static: anon=false authenticated=true service_role=false';

  -- 18. Return-shape pin — CI-guards the D5-1 privacy narrowing (no
  --     allocation/notes/status can be added silently).
  SELECT pg_get_function_result('public.get_staff_assignment_segments(uuid,date,date)'::regprocedure)
    INTO v_shape;
  IF v_shape <> 'TABLE(engagement_id uuid, start_date date, end_date date)' THEN
    RAISE EXCEPTION 'P5 TIMESHEET AUTHZ FAIL — check 18: return shape changed: %', v_shape;
  END IF;
  RAISE NOTICE 'PASS — check 18: return shape pinned to (engagement_id, start_date, end_date)';

  -- 19. Idempotency is proven by the runner's double apply (§2.3), not here.

  RAISE NOTICE 'P5 TIMESHEET AUTHZ: ALL CHECKS PASSED (rolled back)';
END $$;

ROLLBACK;
