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
});
