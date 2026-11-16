import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { containEngagementEmailsEarly, load } from "../fase3.mjs";

// Contención anticipada de los correos de los encargos (12/11/2026): se ejecuta antes de matrices, relee SIEMPRE la base, deja su evidencia fuera de `units`
// y no crea `units["work-orders"]` (si se creara sin workOrderHash, loadWorkOrders bloquearía con «cambió el contenido respecto de la intención durable»).
type Result = { contained: number; remaining: number; sent: number };
const engagements = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ sourceKey: `${prefix}${i}`, engagementId: `${prefix}-id-${String(i).padStart(2, "0")}` }));

describe("F3: contención anticipada de correos de los encargos", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "f3-early-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const makeCtx = (results: Result[] | ((ids: string[]) => Result), overrides: Record<string, unknown> = {}) => {
    const queue = Array.isArray(results) ? [...results] : null;
    const containOwnEmails = vi.fn(async ({ engagementIds }: { engagementIds: string[]; expectedCount: number | null }) => (queue ? (queue.shift() ?? { contained: 0, remaining: 0, sent: 0 }) : (results as (ids: string[]) => Result)(engagementIds)));
    const ctx: Record<string, any> = {
      config: { environment: "local", manifest: { f3: { engagementsTotal: 5 } } },
      journalFile: path.join(dir, "journal.json"),
      journal: {
        blocks: { "client-engagements": { acceptedAt: "2026-11-12T00:00:00Z" }, "administrative-engagements": { acceptedAt: "2026-11-12T00:00:00Z" } },
        units: { "client-engagements": { state: "CONFIRMADA", result: { engagements: engagements("c", 3) } }, "administrative-engagements": { state: "CONFIRMADA", result: { engagements: engagements("a", 2) } } },
        evidence: { R1: "intacto" },
      },
      db: { containOwnEmails },
      ...overrides,
    };
    return { ctx, containOwnEmails };
  };
  const earlyOp = (ctx: Record<string, any>) => load(ctx, "administrative-engagements", "contain-engagement-emails");
  const onDisk = (): Record<string, any> => JSON.parse(readFileSync(path.join(dir, "journal.json"), "utf8"));

  it("contiene exactamente los encargos del journal, deja la evidencia en `evidence` y NO crea units[\"work-orders\"]", async () => {
    const { ctx, containOwnEmails } = makeCtx([{ contained: 901, remaining: 0, sent: 0 }]);
    const unitsBefore = JSON.stringify(ctx.journal.units);
    await expect(earlyOp(ctx)).resolves.toMatchObject({ contained: 901, remaining: 0, sent: 0 });
    expect(containOwnEmails).toHaveBeenCalledTimes(1);
    expect(containOwnEmails.mock.calls[0][0]).toEqual({ engagementIds: ["a-id-00", "a-id-01", "c-id-00", "c-id-01", "c-id-02"], expectedCount: 5 });
    expect(ctx.journal.earlyEmailContainment).toMatchObject({ contained: 901, remaining: 0, sent: 0, totalContained: 901, runs: 1 });
    expect(ctx.journal.evidence.R1).toBe("intacto"); // conserva la evidencia existente
    expect(Object.hasOwn(ctx.journal.units, "work-orders")).toBe(false);
    expect(JSON.stringify(ctx.journal.units)).toBe(unitsBefore); // `units` no se toca
    expect(Object.hasOwn(onDisk().units, "work-orders")).toBe(false); // ni en el journal persistido
    expect(onDisk().earlyEmailContainment.runs).toBe(1);
  });

  it("repetición: vuelve a leer la base cada vez, acumula y conserva el primer instante", async () => {
    const { ctx, containOwnEmails } = makeCtx([{ contained: 901, remaining: 0, sent: 0 }, { contained: 0, remaining: 0, sent: 0 }, { contained: 4, remaining: 0, sent: 0 }]);
    await earlyOp(ctx); const first = ctx.journal.earlyEmailContainment.firstAt;
    await earlyOp(ctx); await earlyOp(ctx);
    expect(containOwnEmails).toHaveBeenCalledTimes(3); // no hay cortocircuito por la marca
    expect(ctx.journal.earlyEmailContainment).toMatchObject({ contained: 4, totalContained: 905, runs: 3, firstAt: first });
    expect(Object.hasOwn(ctx.journal.units, "work-orders")).toBe(false);
  });

  it("reanudación: con la marca ya registrada, igual consulta la base y contiene los pendientes nuevos", async () => {
    const { ctx, containOwnEmails } = makeCtx([{ contained: 7, remaining: 0, sent: 0 }]);
    ctx.journal.earlyEmailContainment = { contained: 901, remaining: 0, sent: 0, totalContained: 901, runs: 1, firstAt: "2026-11-12T20:00:00.000Z", lastAt: "2026-11-12T20:00:00.000Z" };
    await earlyOp(ctx);
    expect(containOwnEmails).toHaveBeenCalledTimes(1);
    expect(ctx.journal.earlyEmailContainment).toMatchObject({ contained: 7, totalContained: 908, runs: 2, firstAt: "2026-11-12T20:00:00.000Z" });
  });

  it("falla cerrado y sin evidencia si queda algo pendiente, en envío o enviado", async () => {
    for (const bad of [{ contained: 3, remaining: 2, sent: 0 }, { contained: 0, remaining: 0, sent: 1 }]) {
      const { ctx } = makeCtx([bad]);
      await expect(earlyOp(ctx)).rejects.toMatchObject({ code: "RECONCILIACION_REQUERIDA" });
      expect(ctx.journal.earlyEmailContainment).toBeUndefined();
    }
  });

  it("conserva las guardas: bloques de encargos confirmados, acta del bloque cliente y mapa completo", async () => {
    const pending = makeCtx([{ contained: 1, remaining: 0, sent: 0 }]);
    pending.ctx.journal.units["administrative-engagements"].state = "INTENCION_DURABLE";
    await expect(earlyOp(pending.ctx)).rejects.toMatchObject({ code: "BLOQUEADO" });
    expect(pending.containOwnEmails).not.toHaveBeenCalled();

    const noActa = makeCtx([{ contained: 1, remaining: 0, sent: 0 }]);
    delete noActa.ctx.journal.blocks["client-engagements"].acceptedAt;
    await expect(earlyOp(noActa.ctx)).rejects.toThrow(/falta acta aceptada de client-engagements/);
    expect(noActa.containOwnEmails).not.toHaveBeenCalled();

    const incomplete = makeCtx([{ contained: 1, remaining: 0, sent: 0 }]);
    incomplete.ctx.journal.units["client-engagements"].result.engagements.pop();
    await expect(earlyOp(incomplete.ctx)).rejects.toMatchObject({ code: "BLOQUEADO" });
    expect(incomplete.containOwnEmails).not.toHaveBeenCalled();
  });

  it("solo se admite en el bloque administrative-engagements y la operación de work-orders conserva su acta y su comportamiento", async () => {
    const { ctx, containOwnEmails } = makeCtx([{ contained: 0, remaining: 0, sent: 0 }]);
    await expect(load(ctx, "matrices", "contain-engagement-emails")).rejects.toThrow();
    await expect(load(ctx, "administrative-engagements", "contain-emails")).rejects.toThrow(/sólo admite el bloque work-orders/);
    // work-orders sigue exigiendo el acta de matrices
    await expect(load(ctx, "work-orders", "contain-emails")).rejects.toThrow(/falta acta aceptada de matrices/);
    expect(containOwnEmails).not.toHaveBeenCalled();
    // con el acta de matrices, la operación original sigue escribiendo su resultado en la unidad work-orders (comportamiento sin cambios)
    ctx.journal.blocks.matrices = { acceptedAt: "2026-11-12T00:00:00Z" };
    await expect(load(ctx, "work-orders", "contain-emails")).resolves.toMatchObject({ remaining: 0 });
    expect(ctx.journal.units["work-orders"]).toMatchObject({ emailsContainedAt: expect.any(String), emailContainmentResult: { remaining: 0 } });
    expect(ctx.journal.earlyEmailContainment).toBeUndefined();
  });

  // Hallazgo del ensayo: validate() reemplaza `journal.evidence` entero (checkpoint(ctx, { inputs, evidence })) y load/preflight lo invocan; una evidencia guardada ahí se perdía al cargar matrices.
  it("la evidencia es durable: no vive en `evidence` y sobrevive a que validate() reemplace `evidence` entero", async () => {
    const { ctx } = makeCtx([{ contained: 901, remaining: 0, sent: 0 }, { contained: 0, remaining: 0, sent: 0 }]);
    await earlyOp(ctx);
    expect(Object.hasOwn(ctx.journal.evidence ?? {}, "earlyEmailContainment")).toBe(false);
    ctx.journal = { ...ctx.journal, evidence: { R1: "nuevo", R3: "nuevo", R4: "nuevo" } }; // lo que hace validate()
    expect(ctx.journal.earlyEmailContainment).toMatchObject({ totalContained: 901, runs: 1 });
    await earlyOp(ctx);
    expect(ctx.journal.earlyEmailContainment).toMatchObject({ totalContained: 901, runs: 2 });
    // el código de validate() sigue reemplazando `evidence` y la contención no escribe en él
    const source = readFileSync(path.resolve(__dirname, "../fase3.mjs"), "utf8");
    expect(source).toMatch(/checkpoint\(ctx, \{ inputs: inputs\.fingerprints, evidence \}\)/);
    expect(source).toMatch(/checkpoint\(ctx, \{ earlyEmailContainment: \{/);
    expect(source).not.toMatch(/evidence: \{ \.\.\.ctx\.journal\.evidence, earlyEmailContainment/);
  });

  it("si algo creara la unidad work-orders durante la contención anticipada, se detiene", async () => {
    const { ctx } = makeCtx((ids) => { ctx.journal.units["work-orders"] = {}; return { contained: ids.length, remaining: 0, sent: 0 }; });
    await expect(containEngagementEmailsEarly(ctx)).rejects.toThrow(/no puede crear la unidad work-orders/);
  });
});
