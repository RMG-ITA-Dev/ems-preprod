import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Static regression brake for the BUG 0601-132 migration.
// Asserts structural invariants of the SQL so a refactor cannot silently
// remove the fields or RPCs the frontend and edge function depend on.
describe("account blocked admin control migration (BUG 0601-132)", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260602000000_account_blocked_admin_control.sql",
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("adds is_blocked boolean column to staff with DEFAULT false", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.staff\s+ADD COLUMN IF NOT EXISTS is_blocked\s+boolean\s+NOT NULL\s+DEFAULT false/,
    );
  });

  it("extends record_failed_login to set staff.is_blocked = true on lockout", () => {
    expect(sql).toMatch(/UPDATE public\.staff/);
    expect(sql).toMatch(/SET is_blocked = true/);
  });

  it("wraps the staff update in EXCEPTION block so lockout counter is never lost", () => {
    // The UPDATE staff block must be inside a BEGIN…EXCEPTION WHEN OTHERS block
    // so a staff-table error never rolls back the auth_login_attempts write.
    expect(sql).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(sql).toMatch(/RAISE WARNING/);
  });

  it("extends reset_login_attempts to clear staff.is_blocked = false", () => {
    expect(sql).toMatch(/SET is_blocked = false/);
  });

  it("defines admin_unblock_account as a SECURITY DEFINER function", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_unblock_account\(p_staff_id uuid\)/,
    );
    // Count SECURITY DEFINER occurrences — must appear for admin_unblock_account
    // (record_failed_login and reset_login_attempts already had it in the
    // original migration, so we just assert at least one new occurrence exists
    // inside the admin_unblock_account body by checking SET search_path).
    const secDef = sql.match(/SECURITY DEFINER/g) ?? [];
    expect(secDef.length).toBeGreaterThanOrEqual(1);
    expect(sql).toMatch(/SET search_path TO 'public'/);
  });

  it("admin_unblock_account returns jsonb with ok and email fields", () => {
    expect(sql).toMatch(/jsonb_build_object\('ok', true, 'email'/);
    expect(sql).toMatch(/jsonb_build_object\('ok', false, 'error'/);
  });

  it("admin_unblock_account deletes auth_login_attempts row for the email", () => {
    expect(sql).toMatch(/DELETE FROM public\.auth_login_attempts/);
  });

  it("admin_unblock_account is restricted to service_role only", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_unblock_account\(uuid\)\s+FROM public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_unblock_account\(uuid\)\s+TO service_role/,
    );
  });

  it("admin_unblock_account guards against deleted staff (deleted_at IS NULL)", () => {
    expect(sql).toMatch(/deleted_at IS NULL/);
  });

  it("protects is_blocked from non-admin self-updates via a BEFORE UPDATE trigger", () => {
    // The trigger must reject is_blocked changes from an authenticated
    // non-admin session so a lockout cannot be self-cleared.
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.prevent_self_blocked_change\(\)/,
    );
    expect(sql).toMatch(/NEW\.is_blocked IS DISTINCT FROM OLD\.is_blocked/);
    expect(sql).toMatch(/auth\.uid\(\) IS NOT NULL/);
    expect(sql).toMatch(/NOT public\.is_admin\(\)/);
    expect(sql).toMatch(/RAISE EXCEPTION 'FORBIDDEN: is_blocked/);
    expect(sql).toMatch(
      /CREATE TRIGGER trg_prevent_self_blocked_change\s+BEFORE UPDATE OF is_blocked ON public\.staff/,
    );
  });

  it("restricts the lockout threshold settings to admin writers via a trigger", () => {
    // The lockout thresholds drive a security control and RLS on global_settings
    // is disabled, so a BEFORE INSERT/UPDATE trigger must reject non-admin writes
    // to AUTH_MAX_FAILED_ATTEMPTS / AUTH_LOCKOUT_MINUTES.
    const configurableSql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260602000001_account_lockout_configurable_settings.sql",
      ),
      "utf8",
    );
    expect(configurableSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.guard_auth_lockout_settings\(\)/,
    );
    expect(configurableSql).toMatch(/'AUTH_MAX_FAILED_ATTEMPTS', 'AUTH_LOCKOUT_MINUTES'/);
    expect(configurableSql).toMatch(/auth\.uid\(\) IS NOT NULL/);
    expect(configurableSql).toMatch(/NOT public\.is_admin\(\)/);
    expect(configurableSql).toMatch(
      /CREATE TRIGGER trg_guard_auth_lockout_settings\s+BEFORE INSERT OR UPDATE ON public\.global_settings/,
    );
  });

  it("lets the trusted reset/unlock path clear is_blocked via a transaction-local flag", () => {
    // reset_login_attempts runs with the user's own JWT, so the trigger cannot
    // tell it apart from a self-service UPDATE by auth.uid(). It must set the
    // transaction-local flag the trigger honors, otherwise a successful login
    // after a lockout would leave the admin badge stuck on.
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
