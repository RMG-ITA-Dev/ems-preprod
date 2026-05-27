import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Static regression brake for the BUG 0514-115 lockout migration.
describe("account lockout policy migration (BUG 0514-115)", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260521000000_add_account_lockout_policy.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("creates the auth_login_attempts table with the expected columns", () => {
    expect(sql).toMatch(/CREATE TABLE[^;]*public\.auth_login_attempts/);
    expect(sql).toMatch(/email_normalized\s+text/);
    expect(sql).toMatch(/attempts_count\s+integer/);
    expect(sql).toMatch(/last_attempt_at\s+timestamptz/);
    expect(sql).toMatch(/locked_until\s+timestamptz/);
  });

  it("enables row level security on the table", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.auth_login_attempts ENABLE ROW LEVEL SECURITY/
    );
  });

  it("defines the three SECURITY DEFINER RPCs", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.check_login_allowed\(p_email text\)/
    );
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.record_failed_login\(p_email text\)/
    );
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.reset_login_attempts\(p_email text\)/
    );
    // SECURITY DEFINER appears for each RPC body.
    const secdef = sql.match(/SECURITY DEFINER/g) || [];
    expect(secdef.length).toBeGreaterThanOrEqual(3);
    const sp = sql.match(/SET search_path TO 'public'/g) || [];
    expect(sp.length).toBeGreaterThanOrEqual(3);
  });

  it("uses the agreed policy constants (5 attempts, 15 min lockout, 15 min reset)", () => {
    expect(sql).toMatch(/v_max\s+integer\s*:=\s*5/);
    expect(sql).toMatch(/v_lockout\s+interval\s*:=\s*interval\s*'15 minutes'/);
    expect(sql).toMatch(/v_reset\s+interval\s*:=\s*interval\s*'15 minutes'/);
  });

  it("normalizes the email input with lower(trim(p_email)) in each RPC", () => {
    const matches = sql.match(/lower\(trim\(p_email\)\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("returns the remaining_seconds field the frontend reads", () => {
    expect(sql).toMatch(/remaining_seconds/);
  });

  it("grants EXECUTE on the pre/record RPCs to anon and authenticated", () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.check_login_allowed\(text\)\s+TO anon, authenticated/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.record_failed_login\(text\)\s+TO anon, authenticated/
    );
  });

  it("restricts reset_login_attempts EXECUTE to authenticated only (no anon)", () => {
    // anon must not be able to wipe a lockout row mid-attack.
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.reset_login_attempts\(text\)\s+FROM public, anon/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.reset_login_attempts\(text\)\s+TO authenticated\b/
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.reset_login_attempts\(text\)\s+TO[^;]*\banon\b/
    );
  });

  it("guards reset_login_attempts so an authenticated user can only reset their own counter", () => {
    // Defense in depth: even authenticated callers must match auth.jwt() email.
    expect(sql).toMatch(/auth\.jwt\(\)\s*->>\s*'email'/);
    expect(sql).toMatch(/RESET_FORBIDDEN/);
  });

  it("uses INSERT ... ON CONFLICT for the first-failure path (no PK-violation race)", () => {
    // Plan v2 required atomic upsert; SELECT-then-INSERT would race on PK
    // for two parallel first failures of the same email.
    expect(sql).toMatch(
      /INSERT INTO public\.auth_login_attempts[\s\S]*?ON CONFLICT \(email_normalized\) DO NOTHING/
    );
  });

  it("revokes all privileges on the table from anon/authenticated/public", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON public\.auth_login_attempts FROM anon, authenticated, public/
    );
  });
});

// Static regression brake for the BUG 0514-115 follow-up migration that moved
// the lockout enforcement behind the `secure-signin` edge function (Codex P1).
describe("account lockout edge-function migration (BUG 0514-115 follow-up)", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260527000000_lockout_move_behind_edge_function.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("revokes EXECUTE on check_login_allowed from anon and authenticated", () => {
    // The edge function (service role) is the only caller now; a direct
    // `curl /rest/v1/rpc/check_login_allowed` from anon must fail with
    // `permission denied`.
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.check_login_allowed\(text\)\s+FROM anon, authenticated/
    );
  });

  it("revokes EXECUTE on record_failed_login from anon and authenticated", () => {
    // Same as above; this is the RPC Codex flagged as the DoS vector.
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.record_failed_login\(text\)\s+FROM anon, authenticated/
    );
  });

  it("re-asserts the reset_login_attempts revoke for anon (defense in depth)", () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.reset_login_attempts\(text\)\s+FROM public, anon/
    );
  });

  it("does NOT grant EXECUTE back to anon for any of the three RPCs", () => {
    // If a future change re-adds these grants, this test trips loudly so the
    // DoS vector cannot silently come back. Service role is implicit and
    // never appears in GRANT statements, so no GRANT line should mention anon.
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.(check_login_allowed|record_failed_login|reset_login_attempts)\([^)]*\)\s+TO[^;]*\banon\b/
    );
  });
});
