import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * BUG 0514-115 + follow-ups (retargeted por la migración cero, plan §2.5.d): assertions
 * estructurales sobre `auth_login_attempts` y sus 3 RPCs, ahora contra el estado final
 * consolidado. El historial original tenía 4 migraciones separadas (creación, edge-function
 * move, service-role grants); el set consolidado las funde en un único cuerpo por función —
 * las aserciones sobre umbrales fijos (v_max/v_lockout como constantes) se retiran: el archivo
 * consolidado ya incluye el follow-up que las hizo configurables vía `global_settings`
 * (`AUTH_MAX_FAILED_ATTEMPTS`/`AUTH_LOCKOUT_MINUTES`), con el mismo valor como fallback.
 */

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000002_cero_02_functions_tables_views.sql"),
  "utf-8",
);
const policiesSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000005_cero_05_rls_policies.sql"),
  "utf-8",
);
const grantsSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000006_cero_06_grants.sql"),
  "utf-8",
);

describe("account lockout policy (migración cero, consolidado)", () => {
  it("creates the auth_login_attempts table with the expected columns", () => {
    expect(sql).toMatch(/CREATE TABLE public\.auth_login_attempts/);
    expect(sql).toMatch(/email_normalized text NOT NULL/);
    expect(sql).toMatch(/attempts_count integer DEFAULT 0 NOT NULL/);
    expect(sql).toMatch(/last_attempt_at timestamp with time zone DEFAULT now\(\) NOT NULL/);
    expect(sql).toMatch(/locked_until timestamp with time zone/);
  });

  it("enables row level security on the table", () => {
    expect(policiesSql).toMatch(
      /ALTER TABLE public\.auth_login_attempts ENABLE ROW LEVEL SECURITY/,
    );
  });

  it("defines the three SECURITY DEFINER RPCs", () => {
    expect(sql).toMatch(
      /CREATE FUNCTION public\.check_login_allowed\(p_email text\) RETURNS jsonb/,
    );
    expect(sql).toMatch(
      /CREATE FUNCTION public\.record_failed_login\(p_email text\) RETURNS jsonb/,
    );
    expect(sql).toMatch(
      /CREATE FUNCTION public\.reset_login_attempts\(p_email text\) RETURNS void/,
    );
  });

  it("reads AUTH_MAX_FAILED_ATTEMPTS / AUTH_LOCKOUT_MINUTES with a 5-attempts / 15-minute fallback", () => {
    // Follow-up que hizo configurables los umbrales (plan §2.2, estado final consolidado):
    // v_max/v_lockout ya no son constantes fijas, se leen de global_settings con fallback.
    expect(sql).toMatch(/WHERE setting_key = 'AUTH_MAX_FAILED_ATTEMPTS'/);
    expect(sql).toMatch(/WHERE setting_key = 'AUTH_LOCKOUT_MINUTES'/);
    expect(sql).toMatch(/v_max := 5;/);
    expect(sql).toMatch(/v_lockout := interval '15 minutes';/);
  });

  it("normalizes the email input with lower(trim(...)) in each RPC", () => {
    const matches = sql.match(/lower\(trim\(p_email\)\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("returns the remaining_seconds field the frontend reads", () => {
    expect(sql).toMatch(/remaining_seconds/);
  });

  it("uses INSERT ... ON CONFLICT for the first-failure path (no PK-violation race)", () => {
    expect(sql).toMatch(
      /INSERT INTO public\.auth_login_attempts \(email_normalized, attempts_count, last_attempt_at\)[\s\S]*?ON CONFLICT \(email_normalized\) DO NOTHING/,
    );
  });

  it("guards reset_login_attempts so an authenticated user can only reset their own counter", () => {
    expect(sql).toMatch(/auth\.jwt\(\)\s*->>\s*'email'/);
    expect(sql).toMatch(/RESET_FORBIDDEN/);
  });

  it("restricts EXECUTE on check_login_allowed/record_failed_login to service_role only", () => {
    // El diseño final (BUG 0514-115 follow-up) movió el enforcement detrás de la edge
    // function secure-signin: anon/authenticated pierden EXECUTE, service_role lo retiene.
    expect(grantsSql).toMatch(
      /GRANT ALL ON FUNCTION public\.check_login_allowed\(p_email text\) TO service_role;/,
    );
    expect(grantsSql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.check_login_allowed\(p_email text\) FROM anon, authenticated;/,
    );
    expect(grantsSql).toMatch(
      /GRANT ALL ON FUNCTION public\.record_failed_login\(p_email text\) TO service_role;/,
    );
    expect(grantsSql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.record_failed_login\(p_email text\) FROM anon, authenticated;/,
    );
  });

  it("restricts reset_login_attempts EXECUTE to authenticated only (no anon)", () => {
    // anon must not be able to wipe a lockout row mid-attack.
    expect(grantsSql).toMatch(
      /GRANT ALL ON FUNCTION public\.reset_login_attempts\(p_email text\) TO authenticated;/,
    );
    expect(grantsSql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.reset_login_attempts\(p_email text\) FROM anon;/,
    );
  });

  it("does NOT grant EXECUTE back to anon for any of the three RPCs", () => {
    // If a future change re-adds these grants, this test trips loudly so the
    // DoS vector cannot silently come back.
    expect(grantsSql).not.toMatch(
      /GRANT (ALL|EXECUTE) ON FUNCTION public\.(check_login_allowed|record_failed_login|reset_login_attempts)\(p_email text\)\s+TO[^;]*\banon\b/,
    );
  });

  it("revokes table-level privileges on auth_login_attempts from anon and authenticated", () => {
    expect(grantsSql).toMatch(
      /REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public\.auth_login_attempts FROM anon;/,
    );
    expect(grantsSql).toMatch(
      /REVOKE DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public\.auth_login_attempts FROM authenticated;/,
    );
  });
});

// El edge function no forma parte del rename/consolidación de esquema; sigue vigente sin
// cambios (verificado 2026-08-23) — se conserva la aserción tal cual.
describe("secure-signin edge function (BUG 0514-115 follow-up)", () => {
  const functionPath = resolve(
    process.cwd(),
    "supabase/functions/secure-signin/index.ts"
  );
  const source = readFileSync(functionPath, "utf8");

  it("resets lockout state with the authenticated user's JWT", () => {
    expect(source).toMatch(/Authorization:\s*`Bearer \$\{access_token\}`/);
    expect(source).toMatch(/const supabaseUser = createClient/);
    expect(source).toMatch(/await supabaseUser\.rpc\("reset_login_attempts"/);
    expect(source).not.toMatch(/await supabaseAdmin\.rpc\("reset_login_attempts"/);
  });
});
