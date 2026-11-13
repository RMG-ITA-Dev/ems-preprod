import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compareFingerprintFiles } from "../fase3.mjs";
import { buildFingerprint } from "../fase3-fingerprint.mjs";

// Revisión independiente (12/11/2026): `compare-fingerprints` (la comparación L9 del paso 50) termina con 0 si son idénticas, 2 si difieren y 4 si el baseline es
// incompatible (otro snapshot o sin snapshot declarado). Nunca se compara contra el baseline equivocado ni se omite en silencio.
const rows = (extra: unknown[] = []) => ({
  clients: [["c1", "h1"]], contacts: [["c1:general", "h2"]], staff: [["s1", "h3"]], engagements: [["2026.11.001", "h4"], ...extra], administrative: [["2027.10.001", "h5"]], periods: [], lines: [],
  hoursByStaff: [["s1", "h6"]], emailQueue: [["engagement.created|failed|ETL_F3_NO_DELIVERY", "h7"]],
});

// Ejecuta el script real con una biblioteca de ensayo: las lecturas SQL y la generación de la
// huella se sustituyen por fixtures. La comparación usa la CLI real y nunca conecta a una base.
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const hasBash = spawnSync(bash, ["-c", "true"], { stdio: "ignore" }).status === 0;

describe.skipIf(!hasBash)("L9: guardas del script Bash en un entorno aislado", () => {
  let dir: string;
  const source = { snapshot: "TimeControlDB_20261106_1600", manifestSha256: "m" };
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "l9-script-"));
    mkdirSync(path.join(dir, "scripts/etl/runbook"), { recursive: true });
    mkdirSync(path.join(dir, "state/f3"), { recursive: true });
    writeFileSync(path.join(dir, "scripts/etl/runbook/50-reconcile.sh"), readFileSync(path.resolve(__dirname, "../runbook/50-reconcile.sh")));
    writeFileSync(path.join(dir, "scripts/etl/fase3.mjs"), `import { main } from ${JSON.stringify(pathToFileURL(path.resolve(__dirname, "../fase3.mjs")).href)}; process.exitCode = await main();\n`);
    writeFileSync(path.join(dir, "config.json"), "{}");
    writeFileSync(path.join(dir, "current.json"), JSON.stringify(fingerprint(source)));
    writeFileSync(path.join(dir, "scripts/etl/runbook/lib.sh"), `set -euo pipefail
REPO_ROOT="$(pwd)"
STATE_BASE_POSIX="$REPO_ROOT/state"
ENV_NAME=local
RUN_ID=smoke
RB_EXTRA_ARGS=("$@")
rb_init() { :; }
rb_confirm_window() { :; }
rb_config_path() { printf '%s/config.json' "$REPO_ROOT"; }
rb_die() { echo "FATAL: $*" >&2; exit 1; }
rb_info() { echo "$*" >&2; }
rb_pass() { echo "PASS: $*" >&2; }
rb_warn() { echo "AVISO: $*" >&2; }
rb_win_path() { if command -v cygpath >/dev/null; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
rb_etl() { echo "$*" >> calls.txt; if [[ "$2" == fingerprint ]]; then cp current.json "$STATE_BASE_POSIX/f3/fase3-f3-local-smoke.fingerprint.json"; fi; }
rb_counts() { :; }
rb_psql() { :; }
`);
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const run = (args: string[] = [], baseline?: string) => {
    const env = { ...process.env };
    delete env.ETL_BASELINE_FINGERPRINT;
    if (baseline !== undefined) env.ETL_BASELINE_FINGERPRINT = baseline;
    return spawnSync(bash, ["scripts/etl/runbook/50-reconcile.sh", "--skip-second-pass", ...args], { cwd: dir, env, encoding: "utf8", timeout: 20000 });
  };
  it("rechaza registrar sin ruta explícita antes de conciliar", () => {
    const result = run(["--record-fingerprint-baseline"]);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("exige una ruta explícita");
    expect(existsSync(path.join(dir, "calls.txt"))).toBe(false);
  });
  it("rechaza un destino existente sin alterar su contenido ni conciliar", () => {
    writeFileSync(path.join(dir, "baseline.json"), "conservar exactamente");
    const result = run(["--record-fingerprint-baseline"], "baseline.json");
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("destino ya existe");
    expect(readFileSync(path.join(dir, "baseline.json"), "utf8")).toBe("conservar exactamente");
    expect(existsSync(path.join(dir, "calls.txt"))).toBe(false);
  });
  it.each([null, { snapshot: "TimeControlDB_20261023_1200", manifestSha256: "m" }])("detiene el script ante un baseline incompatible: %j", (oldSource) => {
    const previous = JSON.stringify(fingerprint(oldSource));
    writeFileSync(path.join(dir, "baseline.json"), previous);
    const result = run([], "baseline.json");
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("baseline INCOMPATIBLE");
    expect(readFileSync(path.join(dir, "baseline.json"), "utf8")).toBe(previous);
    expect(readFileSync(path.join(dir, "calls.txt"), "utf8")).toContain("3 reconcile-legacy");
  });
  it("informa que L9 queda pendiente cuando falta el baseline local", () => {
    const result = run([], "nuevo.json");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("L9 NO SE COMPARÓ");
    expect(existsSync(path.join(dir, "nuevo.json"))).toBe(false);
  });
  it("compara normalmente un baseline compatible e idéntico", () => {
    writeFileSync(path.join(dir, "baseline.json"), JSON.stringify(fingerprint(source)));
    const result = run([], "baseline.json");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain("L9: huella idéntica al baseline");
  });
});
const fingerprint = (source: { snapshot: string; manifestSha256: string } | null, extra: unknown[] = []) => buildFingerprint({ environment: "local", projectRef: "local", installationId: "f3-x", snapshot: rows(extra), source, generatedAt: "2026-11-12T00:00:00.000Z" });

describe("L9: compare-fingerprints protege contra un baseline incompatible", () => {
  let dir: string;
  const write = (name: string, value: unknown) => { const file = path.join(dir, name); writeFileSync(file, JSON.stringify(value), "utf8"); return file; };
  beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "l9-")); vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

  const v3 = { snapshot: "TimeControlDB_20261106_1600", manifestSha256: "m" };
  it("0 si las huellas son del mismo snapshot e idénticas", () => {
    expect(compareFingerprintFiles({ a: write("a.json", fingerprint(v3)), b: write("b.json", fingerprint(v3)) })).toBe(0);
  });
  it("2 si son del mismo snapshot y difieren", () => {
    expect(compareFingerprintFiles({ a: write("a.json", fingerprint(v3)), b: write("b.json", fingerprint(v3, [["2026.11.002", "h8"]])) })).toBe(2);
  });
  it("4 y un mensaje claro si el baseline no declara su snapshot (huella del ensayo v2)", () => {
    const code = compareFingerprintFiles({ a: write("a.json", fingerprint(null)), b: write("b.json", fingerprint(v3)) });
    expect(code).toBe(4);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toMatch(/BASELINE_INCOMPATIBLE.*no declara el snapshot/);
  });
  it("4 si el baseline es de otro snapshot, aunque el contenido sea idéntico", () => {
    const code = compareFingerprintFiles({ a: write("a.json", fingerprint({ snapshot: "TimeControlDB_20261023_1200", manifestSha256: "m" })), b: write("b.json", fingerprint(v3)) });
    expect(code).toBe(4);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toMatch(/snapshots distintos/);
  });
});
