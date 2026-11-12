import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FingerprintIncompatibleError, SET_NAMES, assertComparableFingerprints, buildFingerprint, compareFingerprints, keyedHashes } from "../fase3-fingerprint.mjs";

const snapshot = (overrides: Record<string, unknown[]> = {}) => ({
  clients: [["c1", "h1"], ["c2", "h2"]], contacts: [["c1:general", "h3"]], staff: [["s1", "h4"], ["s2", "h5"]],
  engagements: [["2026.11.001", "h6"], ["2026.11.002", "h7"]], administrative: [["2027.11.001", "h8"]],
  hoursByStaff: [["s1", "h9"]], emailQueue: [["engagement.created|failed|ETL_F3_NO_DELIVERY", "h10"]], ...overrides,
});
const build = (overrides: Record<string, unknown[]> = {}, installationId = "f3-a") => buildFingerprint({ environment: "local", projectRef: "local", installationId, snapshot: snapshot(overrides), generatedAt: "2026-10-31T00:00:00Z" });

describe("ETL fase 3: huella L9 por clave natural", () => {
  it("no depende del orden en que la base devuelve las filas", () => {
    const a = build(); const b = build({ clients: [["c2", "h2"], ["c1", "h1"]], staff: [["s2", "h5"], ["s1", "h4"]] });
    expect(b.sets.clients.sha256).toBe(a.sets.clients.sha256);
    expect(compareFingerprints(a, b).ok).toBe(true);
  });
  it("numera las claves repetidas por hash ordenado (NIT compartido, varios roles) sin depender del orden", () => {
    expect(keyedHashes([["k", "b"], ["k", "a"], ["z", "c"]])).toEqual({ "k#1": "a", "k#2": "b", z: "c" });
    expect(keyedHashes([["k", "a"], ["k", "b"], ["z", "c"]])).toEqual(keyedHashes([["k", "b"], ["k", "a"], ["z", "c"]]));
  });
  it("cubre los siete conjuntos y exige que la consulta los devuelva todos", () => {
    expect(Object.keys(build().sets)).toEqual([...SET_NAMES]);
    expect(() => buildFingerprint({ environment: "local", projectRef: "local", installationId: "x", snapshot: { clients: [] } })).toThrow(/contacts/);
  });
  it("detecta una fila cambiada, una ausente y una sobrante, y dice cuál", () => {
    const base = build();
    const changed = compareFingerprints(base, build({ engagements: [["2026.11.001", "h6"], ["2026.11.002", "OTRO"]] }));
    expect(changed.ok).toBe(false);
    expect(changed.rows.find((row) => row.name === "engagements")).toMatchObject({ ok: false, changed: ["2026.11.002"], totals: { changed: 1, missingInA: 0, missingInB: 0 } });
    const missing = compareFingerprints(base, build({ staff: [["s1", "h4"]] }));
    expect(missing.rows.find((row) => row.name === "staff")).toMatchObject({ ok: false, missingInB: ["s2"] });
    const extra = compareFingerprints(base, build({ staff: [["s1", "h4"], ["s2", "h5"], ["s3", "h11"]] }));
    expect(extra.rows.find((row) => row.name === "staff")).toMatchObject({ ok: false, missingInA: ["s3"] });
    expect(extra.rows.filter((row) => !row.ok).map((row) => row.name)).toEqual(["staff"]);
  });
  it("identifica el ambiente de cada huella y rechaza una versión incompatible", () => {
    const result = compareFingerprints(build({}, "f3-local"), buildFingerprint({ environment: "test", projectRef: "slkqdcwwvmjtcbakajib", installationId: "f3-test", snapshot: snapshot() }));
    expect(result.ok).toBe(true);
    expect(result.a.installationId).toBe("f3-local"); expect(result.b.environment).toBe("test");
    expect(() => compareFingerprints({ ...build(), version: 99 }, build())).toThrow(/versión/);
  });
  // Revisión independiente (12/11/2026): una huella del ensayo v2 no debe compararse con una carga v3, ni omitirse la comparación en silencio.
  describe("compatibilidad del baseline (snapshot de origen)", () => {
    const withSource = (name: string | null, sha = "m1") => buildFingerprint({ environment: "local", projectRef: "local", installationId: "f3-x", snapshot: snapshot(), source: name ? { snapshot: name, manifestSha256: sha } : null });
    it("la huella declara el snapshot y el manifiesto de los que salió", () => {
      expect(withSource("TimeControlDB_20261106_1600").source).toEqual({ snapshot: "TimeControlDB_20261106_1600", manifestSha256: "m1" });
      expect(build().source).toBeNull(); // sin source (huellas anteriores): no es comparable
    });
    it("acepta dos huellas del mismo snapshot, aunque el manifiesto haya cambiado entre ellas (lo avisa)", () => {
      expect(assertComparableFingerprints(withSource("S1"), withSource("S1"))).toEqual({ snapshot: "S1", sameManifest: true });
      expect(assertComparableFingerprints(withSource("S1", "a"), withSource("S1", "b"))).toEqual({ snapshot: "S1", sameManifest: false });
    });
    it("rechaza con un error claro un baseline de otro snapshot o sin snapshot declarado (por ejemplo, el ensayo v2)", () => {
      expect(() => assertComparableFingerprints(withSource("S2"), withSource("S1"), { labelA: "baseline", labelB: "carga" })).toThrow(FingerprintIncompatibleError);
      expect(() => assertComparableFingerprints(withSource("S2"), withSource("S1"), { labelA: "baseline", labelB: "carga" })).toThrow(/snapshots distintos \(baseline=S2, carga=S1\)/);
      expect(() => assertComparableFingerprints(build(), withSource("S1"), { labelA: "baseline" })).toThrow(/la huella baseline no declara el snapshot/);
      expect(() => assertComparableFingerprints(withSource("S1"), build(), { labelB: "carga" })).toThrow(/la huella carga no declara el snapshot/);
      try { assertComparableFingerprints(build(), withSource("S1")); } catch (error) { expect((error as { code?: string }).code).toBe("BASELINE_INCOMPATIBLE"); }
    });
  });
  it("la huella no lleva datos personales: solo claves y hashes", () => {
    const text = JSON.stringify(build());
    expect(text).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
  });
  it("la consulta SQL excluye UUID y marcas de tiempo, y el TC BOB (DEFAULT del ambiente) solo se compara como positivo", () => {
    const sql = readFileSync(new URL("../fase3-db.mjs", import.meta.url), "utf8");
    const body = sql.slice(sql.indexOf("async fingerprintSnapshot"), sql.indexOf("async holidayCatalog"));
    expect(body).toContain("CASE WHEN wo.currency='USD' THEN pl.exchange_rate::text ELSE (pl.exchange_rate>0)::text END");
    expect(body).toContain("AT TIME ZONE 'UTC'");
    for (const forbidden of ["created_at", "updated_at", "email_id", "wo_id::text", "time_id"]) expect(body, forbidden).not.toContain(forbidden);
    expect(body).toContain("md5(lower(btrim(email)))");
  });
});
