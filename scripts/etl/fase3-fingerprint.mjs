// L9 (Fase 4 §7): huella de lo cargado por clave natural, comparable entre ambientes. Los UUID y las marcas de tiempo
// cambian en cada instalación; los valores de negocio no. Cada conjunto es una lista de pares [clave, hash de la fila]
// calculados en SQL; aquí solo se canonicalizan, se resumen y se comparan. La huella no contiene datos personales:
// las claves son COT, NIT/razón social o el hash del correo, y los valores son hashes.
import { createHash } from "node:crypto";

export const FINGERPRINT_VERSION = 1;
// `periods` y `lines` (D41 Parte I): períodos cerrados de horas históricas y sus líneas aprobadas, por clave natural. Vacíos con el contrato anterior (períodos NULL).
export const SET_NAMES = Object.freeze(["clients", "contacts", "staff", "engagements", "administrative", "periods", "lines", "hoursByStaff", "emailQueue"]);
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// Una clave puede repetirse (NIT compartido, varios roles): se numera por hash ordenado, de modo que el resultado no
// dependa del orden en que la base devuelva las filas.
export function keyedHashes(pairs) {
  const groups = new Map();
  for (const [key, hash] of pairs ?? []) groups.set(String(key), [...(groups.get(String(key)) ?? []), String(hash)]);
  const out = {};
  for (const [key, hashes] of [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    hashes.sort();
    hashes.forEach((hash, index) => { out[hashes.length === 1 ? key : `${key}#${index + 1}`] = hash; });
  }
  return out;
}

// `source` identifica el respaldo legacy del que salió la carga ({ snapshot, manifestSha256 }). Sin él, una huella de otra versión de los datos (por ejemplo, el ensayo v2 del 23/10)
// no se distingue de una v3 y se compararía contra la equivocada: assertComparableFingerprints lo rechaza.
export function buildFingerprint({ environment, projectRef, installationId, snapshot, source = null, generatedAt = new Date().toISOString() }) {
  const sets = {};
  for (const name of SET_NAMES) {
    if (!Array.isArray(snapshot?.[name])) throw new Error(`la consulta de huellas no devolvió el conjunto ${name}`);
    const keys = keyedHashes(snapshot[name]);
    sets[name] = { count: Object.keys(keys).length, sha256: sha256(JSON.stringify(Object.entries(keys))), keys };
  }
  return { version: FINGERPRINT_VERSION, generatedAt, environment, projectRef, installationId, source, sets };
}

export class FingerprintIncompatibleError extends Error {
  constructor(message) { super(message); this.name = "FingerprintIncompatibleError"; this.code = "BASELINE_INCOMPATIBLE"; }
}

// L9 solo tiene sentido entre cargas del MISMO respaldo legacy. Se exige que las dos huellas declaren su snapshot y que coincidan; nunca se omite la comparación en silencio.
export function assertComparableFingerprints(a, b, { labelA = "A", labelB = "B" } = {}) {
  const snapshotOf = (fingerprint, label) => {
    const name = fingerprint?.source?.snapshot;
    if (typeof name !== "string" || !name) throw new FingerprintIncompatibleError(`la huella ${label} no declara el snapshot del que salió (es anterior a esta versión de la consola, por ejemplo el ensayo v2 del 23/10): no se compara contra ella; registre una huella nueva del ensayo local`);
    return name;
  };
  const left = snapshotOf(a, labelA); const right = snapshotOf(b, labelB);
  // D41 Parte I: además del identificador del manifiesto se comparan el RESPALDO de origen y el CONTRATO de las horas. Una huella anterior a D41 (períodos NULL) no se compara contra
  // una carga D41 (períodos cerrados con líneas aprobadas) aunque el respaldo legacy sea el mismo: la semántica es otra, y avisar solo por el SHA del manifiesto no basta.
  const contractOf = (fingerprint) => fingerprint.source.contract ?? "legacy"; const originOf = (fingerprint) => fingerprint.source.origin ?? fingerprint.source.snapshot;
  if ((a.source.financialContract ?? "fee-only") !== (b.source.financialContract ?? "fee-only")) throw new FingerprintIncompatibleError("las huellas tienen contratos financieros distintos");
  if (contractOf(a) !== contractOf(b)) throw new FingerprintIncompatibleError(`las huellas son de contratos distintos (${labelA}=${contractOf(a)}, ${labelB}=${contractOf(b)}): períodos NULL (anterior) y horas aprobadas dentro de EMS (D41) no se comparan; registre una huella del contrato vigente`);
  if (left !== right) throw new FingerprintIncompatibleError(`las huellas son de snapshots distintos (${labelA}=${left}, ${labelB}=${right}): una huella v2 no puede compararse con una carga v3`);
  if (originOf(a) !== originOf(b)) throw new FingerprintIncompatibleError(`las huellas son de respaldos legacy distintos (${labelA}=${originOf(a)}, ${labelB}=${originOf(b)})`);
  return { snapshot: left, origin: originOf(a), contract: contractOf(a), sameManifest: a.source.manifestSha256 === b.source.manifestSha256 };
}

// Compara dos huellas conjunto por conjunto y señala qué claves faltan o cambiaron (máximo `limit` por categoría).
export function compareFingerprints(a, b, { limit = 8 } = {}) {
  if (a?.version !== FINGERPRINT_VERSION || b?.version !== FINGERPRINT_VERSION) throw new Error("versión de huella incompatible");
  const rows = SET_NAMES.map((name) => {
    const left = a.sets?.[name], right = b.sets?.[name];
    if (!left || !right) return { name, ok: false, countA: left?.count ?? null, countB: right?.count ?? null, missingInB: [], missingInA: [], changed: [], note: "conjunto ausente" };
    const missingInB = Object.keys(left.keys).filter((key) => !(key in right.keys));
    const missingInA = Object.keys(right.keys).filter((key) => !(key in left.keys));
    const changed = Object.keys(left.keys).filter((key) => key in right.keys && left.keys[key] !== right.keys[key]);
    const ok = left.count === right.count && left.sha256 === right.sha256 && !missingInA.length && !missingInB.length && !changed.length;
    return { name, ok, countA: left.count, countB: right.count, missingInB: missingInB.slice(0, limit), missingInA: missingInA.slice(0, limit), changed: changed.slice(0, limit), totals: { missingInB: missingInB.length, missingInA: missingInA.length, changed: changed.length }, note: "" };
  });
  return { ok: rows.every((row) => row.ok), rows, a: { environment: a.environment, projectRef: a.projectRef, installationId: a.installationId }, b: { environment: b.environment, projectRef: b.projectRef, installationId: b.installationId } };
}
