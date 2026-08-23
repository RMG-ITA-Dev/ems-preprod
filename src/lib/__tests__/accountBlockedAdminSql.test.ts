import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * BUG 0601-132 (retargeted por la migración cero, plan §2.5.d): assertions estructurales sobre
 * el flag `staff.is_blocked`, sus 4 escritores de confianza y el guard anti-autoedición, ahora
 * contra el estado final consolidado. `record_failed_login`/`reset_login_attempts` ya incluyen
 * en el mismo archivo el follow-up que movió los umbrales de lockout a `global_settings`
 * (AUTH_MAX_FAILED_ATTEMPTS/AUTH_LOCKOUT_MINUTES con fallback), así que las aserciones de
 * constante fija de accountLockoutPolicySql.test.ts no aplican aquí — se verifica el fallback.
 */

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000002_cero_02_functions_tables_views.sql"),
  "utf-8",
);
const grantsSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000006_cero_06_grants.sql"),
  "utf-8",
);
const triggersSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000004_cero_04_triggers_fks.sql"),
  "utf-8",
);

describe("staff.is_blocked (migración cero, consolidado)", () => {
  it("staff table has is_blocked boolean NOT NULL DEFAULT false", () => {
    expect(sql).toMatch(/is_blocked boolean DEFAULT false NOT NULL,/);
  });

  it("record_failed_login sets staff.is_blocked = true on lockout, inside an EXCEPTION guard", () => {
    expect(sql).toMatch(/SET is_blocked = true/);
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(sql).toMatch(/RAISE WARNING '\[0601-132\] record_failed_login: could not set staff\.is_blocked/);
  });

  it("reset_login_attempts clears staff.is_blocked = false", () => {
    expect(sql).toMatch(/SET is_blocked = false/);
    expect(sql).toMatch(/RAISE WARNING '\[0601-132\] reset_login_attempts: could not clear staff\.is_blocked/);
  });

  it("defines admin_unblock_account as a SECURITY DEFINER function", () => {
    expect(sql).toMatch(
      /CREATE FUNCTION public\.admin_unblock_account\(p_staff_id uuid\) RETURNS jsonb/,
    );
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path TO 'public'/);
  });

  it("admin_unblock_account returns jsonb with ok and email fields", () => {
    expect(sql).toMatch(/jsonb_build_object\('ok', true, 'email'/);
    expect(sql).toMatch(/jsonb_build_object\('ok', false, 'error'/);
  });

  it("admin_unblock_account deletes the auth_login_attempts row for the email", () => {
    expect(sql).toMatch(/DELETE FROM public\.auth_login_attempts/);
  });

  it("admin_unblock_account is restricted to service_role only", () => {
    expect(grantsSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_unblock_account\(p_staff_id uuid\) FROM PUBLIC;/,
    );
    expect(grantsSql).toMatch(
      /GRANT ALL ON FUNCTION public\.admin_unblock_account\(p_staff_id uuid\) TO service_role;/,
    );
    expect(grantsSql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.admin_unblock_account\(p_staff_id uuid\) FROM anon, authenticated;/,
    );
  });

  it("admin_unblock_account guards against deleted staff (deleted_at IS NULL)", () => {
    expect(sql).toMatch(/deleted_at IS NULL/);
  });

  it("protects is_blocked from non-admin self-updates via a BEFORE UPDATE trigger", () => {
    expect(sql).toMatch(
      /CREATE FUNCTION public\.prevent_self_blocked_change\(\) RETURNS trigger/,
    );
    expect(sql).toMatch(/NEW\.is_blocked IS DISTINCT FROM OLD\.is_blocked/);
    expect(sql).toMatch(/auth\.uid\(\) IS NOT NULL/);
    expect(sql).toMatch(/NOT public\.is_admin\(\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'FORBIDDEN: is_blocked/);
    expect(triggersSql).toMatch(
      /CREATE TRIGGER trg_prevent_self_blocked_change BEFORE UPDATE OF is_blocked ON public\.staff/,
    );
  });

  it("restricts the lockout threshold settings to admin writers via a trigger", () => {
    expect(sql).toMatch(
      /CREATE FUNCTION public\.guard_auth_lockout_settings\(\) RETURNS trigger/,
    );
    expect(sql).toMatch(/'AUTH_MAX_FAILED_ATTEMPTS', 'AUTH_LOCKOUT_MINUTES'/);
    expect(sql).toMatch(/auth\.uid\(\) IS NOT NULL/);
    expect(sql).toMatch(/NOT public\.is_admin\(\)/);
    expect(triggersSql).toMatch(
      /CREATE TRIGGER trg_guard_auth_lockout_settings BEFORE INSERT OR UPDATE ON public\.global_settings/,
    );
  });

  it("lets the trusted reset/unlock path clear is_blocked via a transaction-local flag", () => {
    expect(sql).toMatch(
      /current_setting\('app\.allow_blocked_change', true\) IS DISTINCT FROM 'on'/,
    );
    expect(sql).toMatch(
      /set_config\('app\.allow_blocked_change', 'on', true\)/,
    );
    // The flag must be set in every trusted writer: record_failed_login,
    // reset_login_attempts, and admin_unblock_account.
    const setFlag = sql.match(/set_config\('app\.allow_blocked_change', 'on', true\)/g) ?? [];
    expect(setFlag.length).toBeGreaterThanOrEqual(3);
  });
});
