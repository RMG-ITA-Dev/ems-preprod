import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWN_REFS } from "../fase1-db.mjs";

const dir = path.resolve(__dirname, "../runbook");
const scripts = readdirSync(dir).filter((name) => name.endsWith(".sh")).sort();
const read = (name: string) => readFileSync(path.join(dir, name), "utf8");
const hasBash = (() => { try { execFileSync("bash", ["-c", "true"], { stdio: "ignore" }); return true; } catch { return false; } })();

describe("runbook ETL F1→F3: guardas estáticas", () => {
  it("existen los pasos 00–50, la biblioteca y el orquestador", () => {
    expect(scripts).toEqual(["00-preflight.sh", "10-reset.sh", "11-recover-reset.sh", "20-f1.sh", "30-f2.sh", "35-bajas.sh", "40-f3.sh", "50-reconcile.sh", "lib.sh", "run.sh"]);
  });
  it.skipIf(!hasBash)("todos los scripts pasan bash -n", () => {
    for (const name of scripts) expect(() => execFileSync("bash", ["-n", path.join(dir, name)], { stdio: "pipe" }), name).not.toThrow();
  });
  it("el ref de Test del runbook es el de la consola y producción/Lovable están vetados", () => {
    const lib = read("lib.sh");
    expect(lib).toContain(`TEST_REF="${KNOWN_REFS.test}"`);
    expect(lib).toContain(`"${KNOWN_REFS.production}"`);
    expect(lib).toContain("ugqxfnrxvksiltwxzist");
    expect(lib).toMatch(/--env debe ser local o test/);
    for (const name of scripts.filter((s) => s !== "lib.sh")) expect(read(name), name).not.toContain(KNOWN_REFS.production);
  });
  it("ninguna credencial se imprime ni se pasa por argv; no hay trazas ni bypass", () => {
    for (const name of scripts) {
      const text = read(name);
      expect(text, name).not.toMatch(/set -[a-z]*x/);
      expect(text, name).not.toMatch(/(echo|printf)[^\n]*\$\{?(PGPASSWORD|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|ADMIN_TEMP_PASSWORD)/);
      expect(text, name).not.toMatch(/--force|--no-verify/);
      expect(text, name).not.toMatch(/(-p|--password)[ =]\$/);
    }
  });
  it("en Test las confirmaciones humanas no se pueden saltar y las bajas/reset exigen frase", () => {
    const lib = read("lib.sh");
    expect(lib).toMatch(/--yes-local solo existe para el ensayo local/);
    expect(lib).toMatch(/\[\[ "\$ENV_NAME" == "local" && "\$ASSUME_LOCAL_YES" == "1" \]\]/);
    expect(read("35-bajas.sh")).toContain('rb_confirm "APLICAR 8 BAJAS"');
    expect(read("11-recover-reset.sh")).toContain('rb_confirm "DROP fund_request_number_seq"');
    expect(read("40-f3.sh")).toContain('rb_confirm "ACEPTO ${block}"');
    expect(read("lib.sh")).toContain('rb_confirm "VENTANA ${PROJECT_REF}"');
  });
  it("F3 corre después de las bajas y los bloques respetan el orden de dependencias", () => {
    const f3 = read("40-f3.sh");
    expect(f3).toContain('"$inactive" == "8"');
    const order = ["engagement_block client-engagements", "engagement_block administrative-engagements", "engagement_block matrices", "load --block work-orders", "--operation sync-work-orders", "--operation expenses", "--operation payments", "--operation risks", "--operation contain-emails", "--operation hours"].map((token) => f3.indexOf(token));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order]).toEqual([...order].sort((a, b) => a - b));
  });
  // Hallazgo de E1 (31/10): repetir la creación de OT, matrices o pagos con la carga avanzada falla cerrado («OT ambigua»,
  // «falta o cambió evidencia», «precondición de ajuste») porque la consola exige el estado Draft. El runbook debe
  // reanudar por marcas del journal y la segunda pasada solo repetir lo medido como no-op.
  it("la reanudación omite lo ya completado por marcas del journal, y la segunda pasada no repite matrices, OT ni pagos", () => {
    const f3 = read("40-f3.sh");
    for (const mark of ["wo.state === 'CONFIRMADA'", "wo.syncCompletedAt", "wo.expensesCompletedAt", "wo.paymentsCompletedAt", "wo.risksCompletedAt", "wo.emailsContainedAt"]) expect(f3, mark).toContain(mark);
    expect(f3).toContain("acceptedAt");
    const second = read("50-reconcile.sh").split('rb_info "2. Segunda pasada de F3')[1] ?? "";
    for (const op of ["sync-work-orders expenses risks contain-emails", "--operation hours", "client-engagements", "administrative-engagements"]) expect(second, op).toContain(op);
    expect(second).not.toMatch(/--block matrices/);
    expect(second).not.toMatch(/--operation payments/);
    expect(second).not.toMatch(/load --block work-orders\s*$/m);
    expect(second).toContain('[[ "$before" == "$after" ]]');
  });
  // Hallazgo de E3 (01/11): por el Session pooler `current_user` es `postgres` (no `postgres.<ref>`); el ref se comprueba en PGUSER.
  it("el pre-vuelo valida PGUSER con el ref y acepta postgres como rol efectivo del pooler", () => {
    const pre = read("00-preflight.sh");
    expect(pre).toContain('"${PGUSER:-}" == "postgres.${TEST_REF}" && "$who" == "postgres"');
    expect(pre).not.toContain('"$who" == "postgres.${TEST_REF}"');
  });
  // Hallazgo de E4 (01/11): `text || "char"` es ambiguo en Postgres; relkind debe convertirse a text en el diagnóstico del §6.1.
  it("el diagnóstico de la recuperación §6.1 convierte relkind a text antes de concatenar", () => {
    const recover = read("11-recover-reset.sh");
    expect(recover).toContain("c.relname || ':' || c.relkind::text");
    expect(recover).not.toMatch(/c\.relkind(?!::text|\s+in)/);
  });
  // Observación de revisión (01/11): el baseline L9 es la referencia del ensayo local; Test no puede reemplazarlo ni compararse contra uno que no lo sea.
  it("el baseline L9 solo se registra con --env local y solo se compara contra uno de un ensayo local", () => {
    const reconcile = read("50-reconcile.sh");
    expect(reconcile).toContain('[[ "$RECORD_FP" != "1" || "$ENV_NAME" == "local" ]] || rb_die');
    expect(reconcile.indexOf('"$RECORD_FP" != "1" || "$ENV_NAME" == "local"')).toBeLessThan(reconcile.indexOf("rb_etl 3 fingerprint"));
    expect(reconcile).toContain('[[ "$base_env" == "local" ]] || rb_die');
  });
  it("el pre-vuelo exige 61 migraciones y no crea archivos de migración", () => {
    expect(read("lib.sh")).toContain("EXPECTED_MIGRATIONS=61");
    for (const name of scripts) expect(read(name), name).not.toMatch(/supabase\/migrations\/[^\s"']*\.sql["']?\s*>/);
  });
});
