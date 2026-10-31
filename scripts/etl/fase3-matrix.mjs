// Construye artefactos lógicos de matriz F3; no abre conexiones ni muta Supabase.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "./fase2-input.mjs";

export const ENGAGEMENT_HEADERS = ["legacy_cot", "gestion", "correlativo", "legacy_client_id", "legacy_city_id", "legacy_department_id", "legacy_service_id", "legacy_partner_profile_id", "legacy_manager_profile_id", "legacy_manager_in_charge_profile_id", "legacy_sqr_profile_id", "legacy_it_specialist_profile_id", "legacy_tax_specialist_profile_id", "legacy_creator_profile_id", "legacy_created_date", "legacy_closing_date", "ems_start_date", "ems_end_date", "ems_fecha_cierre", "legacy_approval_status", "legacy_approved_date", "legacy_currency_raw", "legacy_exchange_rate", "legacy_budget_hours_header", "legacy_fee_with_tax", "legacy_fee_usd", "legacy_fee_bob", "legacy_tax_amount", "legacy_risk_code", "legacy_ceac_number", "legacy_ceac_approved_date", "legacy_san_request_id", "legacy_san_approved_date", "legacy_sentinel_number", "legacy_emergency_number", "legacy_is_emergency", "legacy_sqr_hours", "legacy_comments", "legacy_observations"];
export const PLAN_HEADERS = ["legacy_plan_hours_id", "legacy_cot", "legacy_category_id", "legacy_specialty_id", "legacy_budget_hours", "legacy_budget_rate", "legacy_adjusted_rate"];
export const CONTRIBUTION_HEADERS = ["legacy_plan_hours_id", "legacy_cot", "practica_abbreviation", "legacy_category_id", "legacy_specialty_id", "target_category_name", "target_activity_code", "allocation_percent", "allocated_budget_hours"];
export const CELL_HEADERS = ["legacy_cot", "practica_abbreviation", "target_category_name", "target_activity_code", "budget_hours", "source_contribution_count"];
export const DISPOSITION_HEADERS = ["legacy_plan_hours_id", "legacy_cot", "legacy_budget_hours", "disposition"];

const PRACTICE_BY_DEPARTMENT = Object.freeze({ 1: "AUD", 2: "COM", 3: "TAX" });
const BASE_CATEGORY = Object.freeze({ 1: "Socio", 2: "Director", 3: "Gerente", 4: "Gerente", 5: "Senior", 9: "Asistente", 13: "Supervisor", 16: "Semi Senior" });
const SPECIALIST_CATEGORY = Object.freeze({
  irm: Object.freeze({ 3: "Gerente - Especialista ITA", 4: "Gerente - Especialista ITA", 5: "Senior - Especialista ITA", 9: "Asistente - Especialista ITA", 13: "Gerente - Especialista ITA", 16: "Senior - Especialista ITA" }),
  tax: Object.freeze({ 3: "Gerente - Especialista Tax", 4: "Gerente - Especialista Tax", 5: "Senior - Especialista Tax", 9: "Asistente - Especialista Tax", 16: "Senior - Especialista Tax" }),
});

const asNumber = (value, label) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} no es numérico`);
  return parsed;
};
const present = (value) => String(value ?? "").trim() !== "";
const exactUnits = (value, label, scale = 4) => {
  const source = String(value ?? "").trim(); const match = source.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match || (match[2] ?? "").length > scale) throw new Error(`${label} tiene precisión incompatible`);
  return BigInt(match[1]) * (10n ** BigInt(scale)) + BigInt((match[2] ?? "").padEnd(scale, "0"));
};
const exactText = (units, scale = 4) => { const base = 10n ** BigInt(scale); const decimals = String(units % base).padStart(scale, "0").replace(/0+$/, ""); return `${units / base}${decimals ? `.${decimals}` : ""}`; };
const numberText = (value) => Number(value.toFixed(4)).toString();
const activity = (practice, phase) => ({ AUD: { plan: "AUD-A2", execution: "AUD-A3", report: "AUD-A4" }, COM: { plan: "COM-A1", execution: "COM-A2", report: "COM-A3" }, TAX: { plan: "TAX-A1", execution: "TAX-A2", report: "TAX-A3" } })[practice]?.[phase];
const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function destination(row, engagement) {
  const practice = PRACTICE_BY_DEPARTMENT[Number(engagement.legacy_department_id)];
  const categoryId = Number(row.legacy_category_id);
  const specialtyId = Number(row.legacy_specialty_id);
  if (!practice || !BASE_CATEGORY[categoryId]) throw new Error(`categoría o práctica no resuelta (${row.legacy_plan_hours_id})`);
  const hasIt = present(engagement.legacy_it_specialist_profile_id);
  const hasTax = present(engagement.legacy_tax_specialist_profile_id);
  const specialist = practice === "AUD" && specialtyId === 1 && hasIt ? { kind: "irm", activity: "AUD-A5" } : practice === "AUD" && specialtyId === 3 && hasTax ? { kind: "tax", activity: "AUD-A6" } : null;
  const specialistCategory = specialist ? SPECIALIST_CATEGORY[specialist.kind][categoryId] : null;
  if (specialistCategory) return [{ category: specialistCategory, activity: specialist.activity, percent: 100 }];
  const category = categoryId === 16 && practice === "AUD" ? "Semi-Senior" : BASE_CATEGORY[categoryId];
  if (category === "Socio" || category === "Director") return [{ category, activity: activity(practice, "plan"), percent: 50 }, { category, activity: activity(practice, "report"), percent: 50 }];
  if (category === "Gerente" || category === "Supervisor") return [{ category, activity: activity(practice, "plan"), percent: 25 }, { category, activity: activity(practice, "execution"), percent: 50 }, { category, activity: activity(practice, "report"), percent: 25 }];
  return [{ category, activity: activity(practice, "execution"), percent: 100 }];
}

function legacyBuildMatrixArtifacts({ engagements, planRows }) {
  const engagementByCot = new Map(engagements.map((row) => [row.legacy_cot, row]));
  const contributions = []; const dispositions = [];
  for (const row of planRows) {
    const engagement = engagementByCot.get(row.legacy_cot);
    if (!engagement) throw new Error(`COT sin encargo de alcance (${row.legacy_cot})`);
    const hours = asNumber(row.legacy_budget_hours, `horas ${row.legacy_plan_hours_id}`);
    if (hours < 0) throw new Error(`horas negativas (${row.legacy_plan_hours_id})`);
    if (hours === 0) { dispositions.push({ legacy_plan_hours_id: row.legacy_plan_hours_id, legacy_cot: row.legacy_cot, legacy_budget_hours: numberText(hours), disposition: "omitida_cero" }); continue; }
    dispositions.push({ legacy_plan_hours_id: row.legacy_plan_hours_id, legacy_cot: row.legacy_cot, legacy_budget_hours: numberText(hours), disposition: "migrable" });
    const practice = PRACTICE_BY_DEPARTMENT[Number(engagement.legacy_department_id)];
    for (const target of destination(row, engagement)) contributions.push({ legacy_plan_hours_id: row.legacy_plan_hours_id, legacy_cot: row.legacy_cot, practica_abbreviation: practice, legacy_category_id: row.legacy_category_id, legacy_specialty_id: row.legacy_specialty_id, target_category_name: target.category, target_activity_code: target.activity, allocation_percent: numberText(target.percent), allocated_budget_hours: numberText(hours * target.percent / 100) });
  }
  const cellsByKey = new Map();
  for (const row of contributions) {
    const key = [row.legacy_cot, row.target_category_name, row.target_activity_code].join("|");
    const found = cellsByKey.get(key) ?? { legacy_cot: row.legacy_cot, practica_abbreviation: row.practica_abbreviation, target_category_name: row.target_category_name, target_activity_code: row.target_activity_code, budget_hours: 0, source_contribution_count: 0 };
    found.budget_hours += asNumber(row.allocated_budget_hours, `aporte ${row.legacy_plan_hours_id}`); found.source_contribution_count += 1; cellsByKey.set(key, found);
  }
  const cells = [...cellsByKey.values()].map((row) => ({ ...row, budget_hours: numberText(row.budget_hours), source_contribution_count: String(row.source_contribution_count) })).sort((a, b) => `${a.legacy_cot}|${a.target_category_name}|${a.target_activity_code}`.localeCompare(`${b.legacy_cot}|${b.target_category_name}|${b.target_activity_code}`));
  const sourceTotal = planRows.reduce((sum, row) => sum + asNumber(row.legacy_budget_hours, `horas ${row.legacy_plan_hours_id}`), 0);
  const cellTotal = cells.reduce((sum, row) => sum + asNumber(row.budget_hours, "celda"), 0);
  if (Number((sourceTotal - cellTotal).toFixed(4)) !== 0) throw new Error(`delta de matriz ${numberText(sourceTotal - cellTotal)}`);
  return { contributions, cells, dispositions, sourceTotal: numberText(sourceTotal), cellTotal: numberText(cellTotal) };
}

export function buildMatrixArtifacts({ engagements, planRows }) {
  const byCot = new Map();
  for (const engagement of engagements) {
    if (!present(engagement.legacy_cot) || byCot.has(engagement.legacy_cot)) throw new Error(`COT duplicado o vacío (${engagement.legacy_cot || "(vacío)"})`);
    byCot.set(engagement.legacy_cot, engagement);
  }
  const sourceIds = new Set(); const contributions = []; const dispositions = [];
  for (const row of planRows) {
    if (!present(row.legacy_plan_hours_id) || sourceIds.has(row.legacy_plan_hours_id)) throw new Error(`PK planificación duplicada o vacía (${row.legacy_plan_hours_id || "(vacía)"})`);
    sourceIds.add(row.legacy_plan_hours_id);
    const engagement = byCot.get(row.legacy_cot); if (!engagement) throw new Error(`COT sin encargo de alcance (${row.legacy_cot})`);
    const hours = exactUnits(row.legacy_budget_hours, `horas ${row.legacy_plan_hours_id}`);
    if (hours === 0n) { dispositions.push({ legacy_plan_hours_id: row.legacy_plan_hours_id, legacy_cot: row.legacy_cot, legacy_budget_hours: exactText(hours), disposition: "omitida_cero" }); continue; }
    dispositions.push({ legacy_plan_hours_id: row.legacy_plan_hours_id, legacy_cot: row.legacy_cot, legacy_budget_hours: exactText(hours), disposition: "migrable" });
    const practice = PRACTICE_BY_DEPARTMENT[Number(engagement.legacy_department_id)];
    for (const target of destination(row, engagement)) {
      const numerator = hours * BigInt(target.percent); if (numerator % 100n !== 0n) throw new Error(`fracción presupuestaria incompatible (${row.legacy_plan_hours_id})`);
      contributions.push({ legacy_plan_hours_id: row.legacy_plan_hours_id, legacy_cot: row.legacy_cot, practica_abbreviation: practice, legacy_category_id: row.legacy_category_id, legacy_specialty_id: row.legacy_specialty_id, target_category_name: target.category, target_activity_code: target.activity, allocation_percent: String(target.percent), allocated_budget_hours: exactText(numerator / 100n) });
    }
  }
  const grouped = new Map();
  for (const row of contributions) {
    const sourceKey = [row.legacy_cot, row.target_category_name, row.target_activity_code].join("|"); const current = grouped.get(sourceKey) ?? { legacy_cot: row.legacy_cot, practica_abbreviation: row.practica_abbreviation, target_category_name: row.target_category_name, target_activity_code: row.target_activity_code, units: 0n, source_contribution_count: 0 };
    current.units += exactUnits(row.allocated_budget_hours, `aporte ${row.legacy_plan_hours_id}`); current.source_contribution_count += 1; grouped.set(sourceKey, current);
  }
  const cells = [...grouped.values()].map(({ units, ...row }) => ({ ...row, budget_hours: exactText(units), source_contribution_count: String(row.source_contribution_count) })).sort((a, b) => `${a.legacy_cot}|${a.target_category_name}|${a.target_activity_code}`.localeCompare(`${b.legacy_cot}|${b.target_category_name}|${b.target_activity_code}`));
  const sourceTotal = planRows.reduce((sum, row) => sum + exactUnits(row.legacy_budget_hours, `horas ${row.legacy_plan_hours_id}`), 0n); const cellTotal = cells.reduce((sum, row) => sum + exactUnits(row.budget_hours, "celda"), 0n);
  if (sourceTotal !== cellTotal) throw new Error(`delta de matriz ${exactText(sourceTotal - cellTotal)}`);
  return { contributions, cells, dispositions, sourceTotal: exactText(sourceTotal), cellTotal: exactText(cellTotal) };
}

export function writeCsv(file, headers, rows) { writeFileSync(file, `${headers.join(",")}\n${rows.map((row) => headers.map((header) => escape(row[header])).join(",")).join("\n")}\n`, "utf8"); }

function arg(name, args) { const index = args.indexOf(name); if (index < 0 || !args[index + 1]) throw new Error(`falta ${name}`); return args[index + 1]; }
export function runCli(args = process.argv.slice(2)) {
  const engagements = parseCsv(readFileSync(arg("--engagements", args), "utf8"), ENGAGEMENT_HEADERS, "encargos F3");
  const planRows = parseCsv(readFileSync(arg("--plan-hours", args), "utf8"), PLAN_HEADERS, "planificación F3");
  const outputDir = arg("--out-dir", args); mkdirSync(outputDir, { recursive: true }); const result = buildMatrixArtifacts({ engagements, planRows });
  writeCsv(path.join(outputDir, "f3_08_matriz_contribuciones.csv"), CONTRIBUTION_HEADERS, result.contributions);
  writeCsv(path.join(outputDir, "f3_08_matriz_celdas.csv"), CELL_HEADERS, result.cells);
  writeCsv(path.join(outputDir, "f3_08_matriz_disposiciones.csv"), DISPOSITION_HEADERS, result.dispositions);
  return { ...result, outputDir };
}

if (process.argv[1] && import.meta.url === new URL(`file:${process.argv[1]}`).href) {
  const { contributions, cells, dispositions, ...summary } = runCli();
  console.log(JSON.stringify({
    ...summary,
    contributions: contributions.length,
    cells: cells.length,
    dispositions: dispositions.length,
  }, null, 2));
}
