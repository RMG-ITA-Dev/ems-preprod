// Lectura de los CSV v3 para los reportes de verificación (solo lectura). Reutiliza los lectores y encabezados aprobados del ETL:
// un archivo con encabezados distintos o doble codificación UTF-8 se rechaza completo, igual que en la carga.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readInput } from "../fase3-input.mjs";
import { HEADERS, parseCsv } from "../fase2-input.mjs";

const FILES = Object.freeze({
  clientEngagements: /^alcance_.*OT_clientes\.csv$/,
  planHours: /OT_planificacion_horas\.csv$/,
  expenses: /OT_planificacion_gastos\.csv$/,
  payments: /OT_plan_pagos\.csv$/,
  executions: /horas_ejecutadas\.csv$/,
});

function findFile(dir, pattern, label) {
  const matches = readdirSync(dir).filter((name) => pattern.test(name));
  if (matches.length !== 1) throw new Error(`${label}: se esperaba un único archivo en ${dir} y hay ${matches.length}`);
  return join(dir, matches[0]);
}

/** Lee los CSV v3 de `dir` y los COT con tolerancia aprobada del manifiesto del snapshot (D18). */
export function loadReportSources(dir, manifestPath) {
  const sources = {};
  const names = {};
  for (const [name, pattern] of Object.entries(FILES)) {
    const file = findFile(dir, pattern, name);
    names[name] = file;
    sources[name] = readInput(file, name);
  }
  for (const [name, file, headers] of [["clients", "02_clientes.csv", HEADERS.clients], ["staff", "03_staff.csv", HEADERS.staff], ["services", "06_servicios_equivalencias.csv", HEADERS.services]]) {
    names[name] = join(dir, file);
    sources[name] = parseCsv(readFileSync(names[name], "utf8"), headers, file);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  sources.toleranceCots = manifest.toleranceCots ?? [];
  return { sources, files: names, manifest: { path: manifestPath, id: manifest.snapshot ?? manifest.id ?? null } };
}
