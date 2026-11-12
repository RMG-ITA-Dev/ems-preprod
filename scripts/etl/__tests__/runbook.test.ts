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
    expect(scripts).toEqual(["00-preflight.sh", "10-reset.sh", "11-recover-reset.sh", "15-crones.sh", "20-f1.sh", "30-f2.sh", "35-bajas.sh", "40-f3.sh", "50-reconcile.sh", "lib.sh", "run.sh"]);
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
    expect(read("35-bajas.sh")).toContain('rb_confirm "APLICAR ${N_INACTIVE} BAJAS"');
    expect(read("15-crones.sh")).toContain('rb_confirm "PAUSAR CRONES"');
    expect(read("11-recover-reset.sh")).toContain('rb_confirm "DROP fund_request_number_seq"');
    expect(read("40-f3.sh")).toContain('rb_confirm "ACEPTO ${block}"');
    expect(read("lib.sh")).toContain('rb_confirm "VENTANA ${PROJECT_REF}"');
  });
  it("F3 corre después de las bajas y los bloques respetan el orden de dependencias", () => {
    const f3 = read("40-f3.sh");
    expect(f3).toContain('"$inactive" == "$N_INACTIVE"');
    const order = ["engagement_block client-engagements", "engagement_block administrative-engagements", "engagement_block matrices", "load --block work-orders", "--operation sync-work-orders", "--operation expenses", "--operation payments", "--operation risks", "--operation invoices", "--operation contain-emails", "--operation hours"].map((token) => f3.indexOf(token));
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
    for (const op of ["sync-work-orders expenses risks invoices contain-emails", "--operation hours", "client-engagements", "administrative-engagements"]) expect(second, op).toContain(op);
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
  // Las cifras del runbook salen del manifiesto del snapshot, no de constantes (8 bajas, 145 activas, 124 OT, 15/11…).
  it("el runbook toma corte, bajas, conteos y fecha límite del manifiesto del snapshot", () => {
    const lib = read("lib.sh");
    expect(lib).toContain("rb_manifest()"); expect(lib).toContain("rb_manifest_required()"); expect(lib).toContain("scripts/etl/snapshots/");
    const bajas = read("35-bajas.sh");
    for (const key of ["dates.staffCut", "f2.inactiveStaff", "f2.activeStaff", "f2.schedulableStaff"]) expect(bajas, key).toContain(key);
    expect(bajas).not.toMatch(/145\|8\|8\|145|CUT="2026-10-23"|== "8"/);
    const f3 = read("40-f3.sh");
    for (const key of ["f2.inactiveStaff", "f3.clientEngagements", "f3.workOrders", "f3.payments.billable", "invoicedInstallments"]) expect(f3, key).toContain(key);
    expect(f3).not.toMatch(/124 OT|75 presupuestos|277 cuotas|horas \(25\.226/);
    const pre = read("00-preflight.sh");
    expect(pre).toContain("preflight.executionDeadline"); expect(pre).not.toContain("<= 15/11/2026");
    expect(read("30-f2.sh")).not.toMatch(/268 clientes|153 fichas|las 8 bajas/);
  });
  // D24 (10/11/2026): los crones de notificaciones quedan pausados (y verificados) antes de cargar; los correos salen por Railway después de la migración.
  it("el paso 15 pausa y verifica los crones notif-% sin reactivarlos, y F3 puede fijar TS_TRACKING_START_DATE al lunes de arranque", () => {
    const crones = read("15-crones.sh");
    expect(crones).toContain("jobname like 'notif-%'"); expect(crones).toContain("cron.alter_job(jobid, active := false)"); expect(crones).not.toMatch(/active := true/);
    expect(crones).toContain("quedan ${still} crones notif-% activos");
    const f3 = read("40-f3.sh");
    expect(f3).toContain("--tracking-start"); expect(f3).toContain("TS_TRACKING_START_DATE"); expect(f3).toMatch(/PENDIENTE \(D24\)/); expect(f3).toMatch(/debe ser un lunes/);
    expect(read("00-preflight.sh")).toContain("Crones de notificaciones pausados (paso 15)");
  });
  // A-03 (12/11/2026): `run.sh` no encadenaba la pausa de crones; tras el reset (10) los `notif-%` vuelven a nacer activos.
  it("run.sh encadena la pausa de crones (15) después del reset (10) y antes de F1 (20)", () => {
    const steps = /steps=\(([^)]*)\)/.exec(read("run.sh"))?.[1].trim().split(/\s+/) ?? [];
    expect(steps).toEqual(["00-preflight", "10-reset", "15-crones", "20-f1", "30-f2", "35-bajas", "40-f3", "50-reconcile"]);
    for (const step of steps) expect(scripts, step).toContain(`${step}.sh`);
  });
  // Paso 4 con CSV v3: las huellas se calculan sobre las configuraciones base y el baseline que se indiquen (por defecto, los de v2).
  it("el pre-vuelo toma configuraciones base y baseline de huellas por variable de entorno, con los valores v2 por defecto", () => {
    const pre = read("00-preflight.sh");
    expect(pre).toContain('BASELINE="${INPUTS_BASELINE:-$REPO_ROOT/bugs/ETL/carga/fase4/inputs.sha256}"');
    expect(pre).toContain('PF_F2="${BASE_F2_CONFIG:-scripts/etl/fase2.local.config.json}"');
    expect(pre).toContain('PF_F3="${BASE_F3_CONFIG:-scripts/etl/fase3.local.config.json}"');
    expect(pre).toContain("[process.env.PF_F2, process.env.PF_F3]");
    expect(pre).not.toContain('for (const f of ["scripts/etl/fase2.local.config.json"');
  });
  // Revisión independiente (12/11/2026): L9 no puede sobrescribir el baseline por defecto (v2) ni compararse contra una huella incompatible, ni omitirse en silencio.
  it("50-reconcile protege L9: registrar exige ruta explícita y nueva, un baseline incompatible detiene el paso y la ausencia se avisa", () => {
    const rec = read("50-reconcile.sh");
    // la protección de registro corre antes de cualquier trabajo (antes de la conciliación y de la huella)
    const guard = rec.search(/if \[\[ "\$RECORD_FP" == "1" \]\]; then\s+\[\[ -n "\$\{ETL_BASELINE_FINGERPRINT:-\}" \]\]/);
    expect(guard).toBeGreaterThan(0); expect(guard).toBeLessThan(rec.indexOf("rb_etl 3 reconcile-legacy"));
    expect(rec).toContain('exige una ruta explícita en ETL_BASELINE_FINGERPRINT');
    expect(rec).toContain('[[ "$ETL_BASELINE_FINGERPRINT" != "$FP_DEFAULT" ]]');
    expect(rec).toContain('[[ ! -e "$ETL_BASELINE_FINGERPRINT" ]] || rb_die "el baseline L9 destino ya existe');
    expect(rec).toContain('cp -n "$FP_NOW" "$FP_BASE"');
    expect(rec).not.toMatch(/cp "\$FP_NOW" "\$FP_BASE"/); // nunca un cp que pise
    // el código de salida 4 de compare-fingerprints es «baseline incompatible» y detiene el paso con un mensaje distinto del de «difiere»
    expect(rec).toMatch(/4\) rb_die "L9: baseline INCOMPATIBLE/);
    expect(rec).toMatch(/\*\) rb_die "L9: la huella de \$\{ENV_NAME\} difiere/);
    // sin baseline: Test bloquea y local avisa que L9 NO se comparó (pendiente, no aprobada)
    expect(rec).toContain("L9 NO SE COMPARÓ");
    expect(rec).toContain('rb_die "L9 es requisito de E7');
    expect(rec).toContain("environment=${base_env}");
  });
  it("el pre-vuelo exige 61 migraciones y no crea archivos de migración", () => {
    expect(read("lib.sh")).toContain("EXPECTED_MIGRATIONS=61");
    for (const name of scripts) expect(read(name), name).not.toMatch(/supabase\/migrations\/[^\s"']*\.sql["']?\s*>/);
  });
});
