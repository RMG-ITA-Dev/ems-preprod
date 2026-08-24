import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * BUG 0511-109/110 + BUG 0526-123 (retargeted por la migración cero, plan §2.5.d): assertions
 * estructurales sobre `prevent_staff_reactivation()`, ahora contra el estado final consolidado.
 * El historial original tenía dos migraciones (guard original de 0511, luego reemplazado por
 * `CREATE OR REPLACE` en 0526-123 para levantar el bloqueo de reactivación conservando los
 * guards de inmutabilidad de auditoría); el set consolidado solo puede expresar el resultado
 * neto de ese `CREATE OR REPLACE` — un único `CREATE FUNCTION`, no dos migraciones separadas.
 * Se conservan las aserciones sobre el comportamiento final (post 0526-123); las que pineaban
 * el cuerpo intermedio de 0511 (previo al REPLACE) no tienen equivalente en el estado final y
 * se retiran.
 */

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000002_cero_02_functions_tables_views.sql"),
  "utf-8",
);
const triggersSql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20251204000004_cero_04_triggers_fks.sql"),
  "utf-8",
);

describe("prevent_staff_reactivation guard (migración cero, consolidado, post BUG 0526-123)", () => {
  it("defines public.prevent_staff_reactivation()", () => {
    expect(sql).toMatch(
      /CREATE FUNCTION public\.prevent_staff_reactivation\(\) RETURNS trigger/,
    );
  });

  it("is wired as a BEFORE UPDATE trigger on staff", () => {
    expect(triggersSql).toMatch(
      /CREATE TRIGGER trg_prevent_staff_reactivation BEFORE UPDATE ON public\.staff FOR EACH ROW EXECUTE FUNCTION public\.prevent_staff_reactivation\(\);/,
    );
  });

  it("does not retain the broad REACTIVATION_BLOCKED check (termination_date OR deleted_at)", () => {
    const bodyMatch = sql.match(
      /CREATE FUNCTION public\.prevent_staff_reactivation\(\)[\s\S]*?BEGIN[\s\S]*?END;\s*\$\$;/,
    );
    expect(bodyMatch).not.toBeNull();
    const body = bodyMatch![0];
    expect(body).not.toMatch(
      /OLD\.termination_date\s+IS\s+NOT\s+NULL\s+OR\s+OLD\.deleted_at\s+IS\s+NOT\s+NULL/,
    );
  });

  it("raises REACTIVATION_BLOCKED for soft-deleted rows", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'REACTIVATION_BLOCKED:/);
    expect(sql).toMatch(/OLD\.deleted_at IS NOT NULL/);
    expect(sql).toMatch(/OLD\.is_active = false/);
  });

  it("preserves the TERMINATION_DATE_IMMUTABLE guard", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'TERMINATION_DATE_IMMUTABLE:/);
  });

  it("preserves the DELETED_AT_IMMUTABLE guard", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'DELETED_AT_IMMUTABLE:/);
  });

  it("does not DROP the trigger or function (state is a plain CREATE)", () => {
    const bodyMatch = sql.match(
      /CREATE FUNCTION public\.prevent_staff_reactivation\(\)[\s\S]*?BEGIN[\s\S]*?END;\s*\$\$;/,
    );
    expect(bodyMatch![0]).not.toMatch(/DROP\s+TRIGGER/i);
    expect(bodyMatch![0]).not.toMatch(/DROP\s+FUNCTION/i);
  });

  it("blocks clearing termination_date except on already-active rows (covers reactivation bypass)", () => {
    // Reactivation (OLD=false, NEW=true) and inactive-staying-inactive both still raise;
    // only the TD-4 cleanup path (already active, stays active) is exempt.
    expect(sql).toMatch(
      /OLD\.termination_date\s+IS\s+NOT\s+NULL[\s\S]*?NEW\.termination_date\s+IS\s+NULL[\s\S]*?NOT\s*\(\s*OLD\.is_active\s*=\s*true\s+AND\s+NEW\.is_active\s*=\s*true\s*\)/i,
    );
  });

  it("blocks clearing deleted_at unconditionally (soft-delete is one-way)", () => {
    // Target the DELETED_AT_IMMUTABLE block specifically (starts with
    // OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL), not the
    // preceding REACTIVATION_BLOCKED block which also starts with OLD.deleted_at.
    const deletedAtImmutableBlock = sql.match(
      /IF\s+OLD\.deleted_at\s+IS\s+NOT\s+NULL\s+AND\s+NEW\.deleted_at\s+IS\s+NULL[\s\S]*?END\s+IF;/i,
    );
    expect(deletedAtImmutableBlock).not.toBeNull();
    expect(deletedAtImmutableBlock![0]).not.toMatch(/NEW\.is_active/i);
  });
});
