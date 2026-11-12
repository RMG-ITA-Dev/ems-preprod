import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFase2DbAdapter } from "../fase2-db.mjs";
import { containEmails } from "../fase2.mjs";

// D40 (12/11/2026, A-03): los correos auth.role.changed que encolan los disparadores al asignar roles en F2 se contienen (ETL_F2_NO_DELIVERY), como hace F3 con los de sus encargos.
const entry = (n: number, extra: object = {}) => ({ state: "enlace_rol_confirmado", staffId: `staff-${n}`, authUserId: `auth-${n}`, ...extra });
const newCtx = (staff: Record<string, object>, result: object, expectedStaff = Object.keys(staff).length) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "etl-f2-contain-")); const calls: any[] = [];
  const ctx: any = { stateDir: dir, journalFile: path.join(dir, "fase2-f2-contener.journal.json"), config: { expectations: { staff: expectedStaff } }, env: {}, log: () => {},
    journal: { installationId: "f2-contener", state: "VERIFICADO", staff, probes: {} }, db: { containRoleEmails: async (args: any) => { calls.push(args); return result; } } };
  return { ctx, calls };
};

describe("contención de correos auth.role.changed de F2", () => {
  it("contiene las fichas y cuentas del journal (sin repetidos, ordenadas) y lo deja anotado en el journal", async () => {
    const { ctx, calls } = newCtx({ "legacy:2": entry(2), "legacy:1": entry(1) }, { contained: 3, remaining: 0, sent: 0 });
    await expect(containEmails(ctx)).resolves.toMatchObject({ contained: 3, remaining: 0, sent: 0 });
    expect(calls).toHaveLength(1); expect(calls[0].entityIds).toEqual(["auth-1", "auth-2", "staff-1", "staff-2"]); expect(calls[0].expectedCount).toBe(4);
    expect(ctx.journal.emailContainment.contained).toBe(3);
  });

  it("es idempotente: una segunda llamada sin pendientes contiene 0 y no falla", async () => {
    const { ctx } = newCtx({ "legacy:1": entry(1) }, { contained: 0, remaining: 0, sent: 0 });
    await expect(containEmails(ctx)).resolves.toMatchObject({ contained: 0 });
  });

  it("se bloquea si el journal no confirma todas las fichas y cuentas, o si falta alguna", async () => {
    await expect(containEmails(newCtx({ "legacy:1": entry(1), "legacy:2": entry(2, { state: "auth_confirmado" }) }, {}).ctx)).rejects.toThrow(/no confirma las 2 fichas y cuentas/);
    await expect(containEmails(newCtx({ "legacy:1": entry(1), "legacy:2": entry(2, { authUserId: undefined }) }, {}).ctx)).rejects.toThrow(/no confirma/);
    await expect(containEmails(newCtx({ "legacy:1": entry(1) }, {}, 2).ctx)).rejects.toThrow(/no confirma las 2 fichas y cuentas/);
    await expect(containEmails(newCtx({}, {}, 0).ctx)).rejects.toThrow(/no confirma/);
  });

  it("no es conciliable si quedan pendientes o ya hay enviados, y entonces no anota la contención", async () => {
    for (const result of [{ contained: 1, remaining: 1, sent: 0 }, { contained: 1, remaining: 0, sent: 2 }]) {
      const { ctx } = newCtx({ "legacy:1": entry(1) }, result);
      await expect(containEmails(ctx)).rejects.toThrow(/no conciliable/);
      expect(ctx.journal.emailContainment).toBeUndefined();
    }
  });

  it("el adaptador SQL exige identificadores propios exactos, sin repetidos", async () => {
    const db = createFase2DbAdapter({ env: {} });
    await expect(db.containRoleEmails({ entityIds: [] })).rejects.toThrow(/contención F2 requiere/);
    await expect(db.containRoleEmails({ entityIds: ["a", "a"] })).rejects.toThrow(/contención F2 requiere/);
    await expect(db.containRoleEmails({ entityIds: ["a", "b"], expectedCount: 3 })).rejects.toThrow(/requiere exactamente 3/);
  });

  it("el SQL solo toca los pendientes auth.role.changed de esos identificadores y descuenta lo que él mismo contiene", () => {
    const source = readFileSync(new URL("../fase2-db.mjs", import.meta.url), "utf8");
    const sql = source.slice(source.indexOf("async containRoleEmails"), source.indexOf("async readClientsByIds"));
    expect(sql).toContain("UPDATE public.notification_emails");
    expect(sql).toContain("WHERE n.status='pending' AND n.type_key='auth.role.changed' AND n.entity_id IN (SELECT entity_id FROM ids)");
    expect(sql).toContain("last_error='ETL_F2_NO_DELIVERY'");
    expect(sql).toContain("n.status <> 'failed' AND n.email_id NOT IN (SELECT email_id FROM updated)");
    expect(sql).not.toMatch(/DELETE|TRUNCATE|status='sent'/);
  });

  it("el runbook contiene los correos después de la carga de F2, verifica que no quede ninguno pendiente y lo hace antes de verify", () => {
    const script = readFileSync(new URL("../runbook/30-f2.sh", import.meta.url), "utf8");
    const load = script.indexOf("rb_etl_mut 2 load"), contain = script.indexOf("rb_etl_mut 2 contain-emails"), verify = script.indexOf("rb_etl 2 verify");
    expect(load).toBeGreaterThan(-1); expect(contain).toBeGreaterThan(load); expect(verify).toBeGreaterThan(contain);
    expect(script).toContain("type_key = 'auth.role.changed' and status = 'pending'");
  });
});
