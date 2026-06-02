import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Static regression brake against accidental revert of the conditional
// reactivation guard introduced for BUG 0511-109 / 0511-110.
//
// The 0511 migration file is preserved as-is in the migrations folder
// (immutable history). BUG 0526-123 later superseded its function body
// via CREATE OR REPLACE in 20260528000000_lift_reactivation_block_keep_audit.sql.
// Both files are asserted here so each PR's intent is locked in.
describe("prevent_staff_reactivation guard migration (BUG 0511-109/110)", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260520000000_fix_0511_109_110_conditional_reactivation_guard.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("redefines public.prevent_staff_reactivation()", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.prevent_staff_reactivation\(\)/
    );
  });

  it("requires OLD.is_active = false in the guard", () => {
    expect(sql).toMatch(/OLD\.is_active\s*=\s*false/);
  });

  it("requires NEW.is_active = true in the guard", () => {
    expect(sql).toMatch(/NEW\.is_active\s*=\s*true/);
  });

  it("only raises when termination_date OR deleted_at is set (same IF block)", () => {
    // Capture the first IF ... THEN block (the guard).
    const ifMatch = sql.match(/IF[\s\S]*?THEN/);
    expect(ifMatch).not.toBeNull();
    const ifBlock = ifMatch![0];
    expect(ifBlock).toMatch(/OLD\.termination_date\s+IS\s+NOT\s+NULL/);
    expect(ifBlock).toMatch(/OLD\.deleted_at\s+IS\s+NOT\s+NULL/);
  });

  it("preserves the REACTIVATION_BLOCKED exception prefix", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'REACTIVATION_BLOCKED:/);
  });
});

// Locks in the new function body installed by BUG 0526-123: the
// REACTIVATION_BLOCKED branch is removed, but the audit-immutability
// guards added by BUG 0511-109/110 are preserved.
describe("prevent_staff_reactivation guard lift migration (BUG 0526-123)", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260528000000_lift_reactivation_block_keep_audit.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("redefines public.prevent_staff_reactivation()", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.prevent_staff_reactivation\(\)/
    );
  });

  it("does not retain the broad REACTIVATION_BLOCKED check (termination_date OR deleted_at)", () => {
    // Check only the function body — the header comment describes the OLD
    // behaviour and contains the pattern as historical context.
    const bodyMatch = sql.match(/BEGIN[\s\S]*?END;\s*\$\$/i);
    expect(bodyMatch).not.toBeNull();
    const body = bodyMatch![0];
    expect(body).not.toMatch(
      /OLD\.termination_date\s+IS\s+NOT\s+NULL\s+OR\s+OLD\.deleted_at\s+IS\s+NOT\s+NULL/
    );
  });

  it("raises REACTIVATION_BLOCKED for soft-deleted rows", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'REACTIVATION_BLOCKED:/);
  });

  it("preserves the TERMINATION_DATE_IMMUTABLE guard", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'TERMINATION_DATE_IMMUTABLE:/);
  });

  it("preserves the DELETED_AT_IMMUTABLE guard", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'DELETED_AT_IMMUTABLE:/);
  });

  it("does not DROP the trigger or function (in-place CREATE OR REPLACE)", () => {
    expect(sql).not.toMatch(/DROP\s+TRIGGER/i);
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
  });

  it("blocks clearing termination_date except on already-active rows (covers reactivation bypass)", () => {
    // The consolidated guard excludes only OLD.is_active=true AND NEW.is_active=true
    // (the TD-4 cleanup path for stray dates on active employees).
    // Reactivation (OLD=false, NEW=true) and inactive-staying-inactive both still raise.
    expect(sql).toMatch(
      /OLD\.termination_date\s+IS\s+NOT\s+NULL[\s\S]*?NEW\.termination_date\s+IS\s+NULL[\s\S]*?NOT\s*\(\s*OLD\.is_active\s*=\s*true\s+AND\s+NEW\.is_active\s*=\s*true\s*\)/i
    );
  });

  it("blocks clearing deleted_at unconditionally (soft-delete is one-way)", () => {
    // Target the DELETED_AT_IMMUTABLE block specifically (starts with
    // OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL), not the
    // preceding REACTIVATION_BLOCKED block which also starts with OLD.deleted_at.
    const deletedAtImmutableBlock = sql.match(
      /IF\s+OLD\.deleted_at\s+IS\s+NOT\s+NULL\s+AND\s+NEW\.deleted_at\s+IS\s+NULL[\s\S]*?END\s+IF;/i
    );
    expect(deletedAtImmutableBlock).not.toBeNull();
    expect(deletedAtImmutableBlock![0]).not.toMatch(/NEW\.is_active/i);
  });
});
