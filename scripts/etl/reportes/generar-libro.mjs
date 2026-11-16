#!/usr/bin/env node
// Genera el libro .xlsx de verificación Legacy ↔ EMS (solo OT de cliente) desde los CSV v3. Solo lee los CSV y escribe el archivo de salida.
// Uso: node scripts/etl/reportes/generar-libro.mjs --dir <carpeta con los CSV v3> [--out <archivo.xlsx>] [--manifest <snapshot.json>] [--vencida-al AAAA-MM-DD] [--corte-horas AAAA-MM-DD]
import { mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HOURS_CUTOFF, OVERDUE_REFERENCE, buildReportData } from "./reporte-datos.mjs";
import { loadReportSources } from "./reporte-entradas.mjs";
import { writeWorkbook } from "./reporte-libro.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_MANIFEST = resolve(root, "scripts/etl/snapshots/TimeControlDB_20261106_1600_d41_legacy_total_v1.json");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]; const value = argv[index + 1];
    if (!["--dir", "--out", "--manifest", "--vencida-al", "--corte-horas"].includes(name) || !value) throw new Error(`argumento no válido: ${name ?? ""}`);
    options[name.slice(2)] = value;
  }
  return options;
}
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dir) throw new Error("falta --dir (carpeta con los CSV v3)");
  const overdueReference = options["vencida-al"] ?? OVERDUE_REFERENCE; const hoursCutoff = options["corte-horas"] ?? HOURS_CUTOFF;
  if (!isDate(overdueReference) || !isDate(hoursCutoff)) throw new Error("las fechas deben tener formato AAAA-MM-DD");
  const { sources, files } = loadReportSources(resolve(options.dir), resolve(options.manifest ?? DEFAULT_MANIFEST));
  const data = buildReportData(sources, { overdueReference, hoursCutoff });
  const generatedAt = new Date().toISOString().slice(0, 10);
  const out = resolve(options.out ?? resolve(root, `bugs/ETL/reportes/salida/Verificacion_Legacy_EMS_${generatedAt.replaceAll("-", "")}.xlsx`));
  mkdirSync(dirname(out), { recursive: true });
  await writeWorkbook(data, { generatedAt, overdueReference, hoursCutoff, files: Object.values(files).map((file) => basename(file)) }, out);
  console.log(`Libro generado: ${out}`);
  console.log(`OT: ${data.ot.length} · filas de cuotas y notas: ${data.cuotas.length} · cuotas vencidas al ${overdueReference}: ${data.observaciones.vencidas.cuotas}`);
}

main().catch((error) => { console.error(`ERROR: ${error.message}`); process.exit(1); });
