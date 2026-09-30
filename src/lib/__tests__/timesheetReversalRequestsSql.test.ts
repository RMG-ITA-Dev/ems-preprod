import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * BUG 0923-209: aserciones de texto sobre la migración de reversión de boletas aprobadas.
 * Corre sin base de datos (patrón de staffReactivationGuardSql.test.ts). El comportamiento
 * real (RPC + RLS + notificaciones) lo cubre supabase/tests/rpc-0923-209-timesheet-reversal.sql
 * vía run-rls-tests.sh.
 */

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260929160000_0923-209_timesheet_reversal_requests.sql",
  ),
  "utf-8",
);

describe("0923-209 timesheet_reversal_requests migration", () => {
  it("creates the table with its 5 CHECK constraints", () => {
    expect(sql).toMatch(/CREATE TABLE public\.timesheet_reversal_requests/);
    expect(sql).toMatch(/CONSTRAINT trr_scope_check\s+CHECK \(scope\s+IN \('engagement','week'\)\)/);
    expect(sql).toMatch(/CONSTRAINT trr_status_check CHECK \(status IN \('pending','executed','rejected'\)\)/);
    expect(sql).toMatch(/CONSTRAINT trr_scope_engagement_coherence CHECK \(/);
    expect(sql).toMatch(/CONSTRAINT trr_reason_not_empty CHECK \(btrim\(reason\) <> ''\)/);
    expect(sql).toMatch(/CONSTRAINT trr_reject_needs_notes CHECK \(/);
    expect(sql).toMatch(/CONSTRAINT trr_direct_is_executed CHECK \(NOT is_direct OR status = 'executed'\)/);
  });

  it("has both partial unique indexes scoped to status = 'pending'", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX uq_trr_open_week ON public\.timesheet_reversal_requests \(period_id\)\s+WHERE status = 'pending' AND scope = 'week';/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX uq_trr_open_engagement\s+ON public\.timesheet_reversal_requests \(period_id, engagement_id\)\s+WHERE status = 'pending' AND scope = 'engagement';/,
    );
  });

  it("enables RLS with a SELECT-only policy (no INSERT/UPDATE/DELETE grant to authenticated)", () => {
    expect(sql).toMatch(/ALTER TABLE public\.timesheet_reversal_requests ENABLE ROW LEVEL SECURITY;/);
    expect(sql).toMatch(/CREATE POLICY trr_select_visible ON public\.timesheet_reversal_requests\s+FOR SELECT/);
    expect(sql).toMatch(/GRANT SELECT ON public\.timesheet_reversal_requests TO authenticated;/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON public\.timesheet_reversal_requests/);
  });

  // El bootstrap de la plataforma fija `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO
  // anon, authenticated, service_role, postgres` (cero_06_grants.sql:1801-1814): toda tabla
  // nueva nace con ALL para anon/authenticated. Sin el REVOKE explícito de acá (mismo patrón
  // que cero_06 aplica tabla por tabla), ambos roles conservarían INSERT/UPDATE/DELETE/SELECT
  // crudos sobre las 14 columnas -- gap real encontrado al re-aceptar el fixture de
  // consolidated-replay (catalog_grants/catalog_column_grants divergían en 224 filas: 14
  // columnas x 4 roles x 4 privilegios). El REVOKE debe preceder al GRANT SELECT angosto.
  it("revokes the default-privileges ALL grant from anon and authenticated before narrowing", () => {
    const revokeAnonIndex = sql.indexOf(
      "REVOKE ALL ON TABLE public.timesheet_reversal_requests FROM anon;",
    );
    const revokeAuthenticatedIndex = sql.indexOf(
      "REVOKE ALL ON TABLE public.timesheet_reversal_requests FROM authenticated;",
    );
    const grantSelectIndex = sql.indexOf(
      "GRANT SELECT ON public.timesheet_reversal_requests TO authenticated;",
    );
    expect(revokeAnonIndex).toBeGreaterThan(-1);
    expect(revokeAuthenticatedIndex).toBeGreaterThan(-1);
    expect(revokeAuthenticatedIndex).toBeLessThan(grantSelectIndex);
  });

  // `service_role` ya bypassea RLS y ya tiene ALL sobre esta tabla vía el default privileges de
  // arriba (nunca se le hace REVOKE, a propósito) -- este GRANT es redundante en la práctica,
  // pero se re-afirma explícito para que la intención quede clara en el archivo, mismo patrón
  // que cero_06_grants.sql y exchange_rate_history.sql.
  it("grants service_role full access to the table (consistent with every other table in the schema)", () => {
    expect(sql).toMatch(/GRANT ALL ON TABLE public\.timesheet_reversal_requests TO service_role;/);
  });

  it("execute_timesheet_reversal gates on is_admin() and does not replicate the owner/role/window guards", () => {
    const body = sql.match(
      /CREATE FUNCTION public\.execute_timesheet_reversal\([\s\S]*?\$\$;/,
    );
    expect(body).not.toBeNull();
    expect(body![0]).toMatch(/IF NOT public\.is_admin\(\) THEN/);
    expect(body![0]).not.toMatch(/APPROVED_WEEK_RECALL_WINDOW_CLOSED/);
    expect(body![0]).not.toMatch(/UNSUBMIT_NOT_OWNER/);
  });

  it("does not redefine unsubmit_timesheet_safe or notif_permiso_de_ruta", () => {
    expect(sql).not.toMatch(/FUNCTION public\.unsubmit_timesheet_safe/);
    expect(sql).not.toMatch(/FUNCTION public\.notif_permiso_de_ruta/);
  });

  it("revokes the 3 RPCs from PUBLIC/anon and grants them only to authenticated/service_role", () => {
    for (const fn of [
      "request_timesheet_reversal(uuid, text, uuid, text)",
      "execute_timesheet_reversal(uuid, text, uuid, text, uuid)",
      "reject_timesheet_reversal(uuid, text)",
    ]) {
      const escaped = fn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${escaped} FROM PUBLIC, anon;`));
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${escaped} TO authenticated, service_role;`),
      );
    }
  });

  it("seeds the 3 approval.reversal_* types as email_enabled = false with at least one role grant each", () => {
    for (const typeKey of [
      "approval.reversal_requested",
      "approval.reversal_executed",
      "approval.reversal_rejected",
    ]) {
      const escaped = typeKey.replace(/\./g, "\\.");
      const typeRow = new RegExp(
        `'${escaped}',\\s+'timesheet_approval',\\s+'[^']+',\\s+'event',\\s+\\d+,\\s+true,\\s+false`,
      );
      expect(sql).toMatch(typeRow);
      const roleGrant = new RegExp(`'[a-z_]+',\\s+'${escaped}',\\s+'(firm|assigned|own)'`);
      expect(sql).toMatch(roleGrant);
    }
  });

  // review iteración 8, hallazgo #3: roles de solo consulta con alcance assigned_engagements
  // (partner/director/sqr/risk_partner) necesitan leer las líneas y el período de sus encargos.
  it("adds scoped read policies for assigned_engagements readers without opening write access", () => {
    expect(sql).toMatch(
      /CREATE POLICY "Assigned read line approvals" ON public\.timesheet_line_approvals\s+FOR SELECT TO authenticated USING \(/,
    );
    expect(sql).toMatch(/CREATE POLICY "Assigned read periods" ON public\.timesheet_periods\s+FOR SELECT TO authenticated/);
    expect(sql).toMatch(/permission_scope\('timesheet_approval\.read'\) = 'assigned_engagements'/);
    expect(sql).toMatch(/public\.is_assigned_to_engagement\(engagement_id\)/);
  });

  it("reads periods through a SECURITY DEFINER helper to avoid an RLS cycle with timesheet_line_approvals", () => {
    expect(sql).toMatch(
      /CREATE FUNCTION public\.can_read_assigned_timesheet_period\(p_period_id uuid\) RETURNS boolean\s+LANGUAGE sql STABLE SECURITY DEFINER\s+SET search_path TO 'public'/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.can_read_assigned_timesheet_period\(uuid\) FROM PUBLIC, anon;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.can_read_assigned_timesheet_period\(uuid\) TO authenticated, service_role;/,
    );
  });
});
