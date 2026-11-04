// Orquestador F3. El journal externo acredita intención y checkpoints; nunca reemplaza una relectura del destino.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, readdirSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Fase1Error, KNOWN_REFS, LOOPBACK_HOSTS, REPO_ROOT, connectionGuardProblems } from "./fase1-db.mjs";
import { acquireLock, sha256 } from "./fase1.mjs";
import { createFase3DbAdapter } from "./fase3-db.mjs";
import { isMigrableExecution, readInput, validateInputs } from "./fase3-input.mjs";
import { HEADERS as F2_HEADERS, parseCsv } from "./fase2-input.mjs";
import { buildMatrixArtifacts } from "./fase3-matrix.mjs";
import { compareLegacyControls, legacyExpectations } from "./fase3-reconcile.mjs";
import { buildFingerprint, compareFingerprints } from "./fase3-fingerprint.mjs";
import { boliviaHolidays, buildAdministrativeEngagementPayloads, buildClientEngagementPayloads, consolidateExecutions, consolidateResolvedHours, decimalUnits, expensePayload, feeWithTax, paymentArtifacts } from "./fase3-transform.mjs";

export const BLOCKS = Object.freeze(["client-engagements", "administrative-engagements", "matrices", "work-orders", "hours"]);
export const STATES = Object.freeze(["PENDIENTE", "VALIDADO", "PREFLIGHT_VALIDADO", "ENCARGOS_CLIENTE_ACEPTADOS", "ADMINISTRATIVOS_ACEPTADOS", "MATRICES_ACEPTADAS", "OTS_ACEPTADAS", "HORAS_VERIFICADAS", "ACEPTADO"]);
const INPUT_NAMES = ["clientEngagements", "planHours", "expenses", "payments", "administrativeEngagements", "executions"];
const stable = (value) => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}` : JSON.stringify(value);
const bad = (message) => { throw new Fase1Error("CONFIG", message); };

export function parseConfig(raw) {
  const allowed = new Set(["schemaVersion", "environment", "expectedProjectRef", "supabaseUrl", "installationId", "snapshot", "inputs", "technicalAdminId", "acceptances", "f2StateDir", "f2ServicesFile", "f2ClientsFile"]);
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((key) => !allowed.has(key))) bad("configuración F3 inválida o con claves desconocidas");
  if (raw.schemaVersion !== 1 || !["local", "test"].includes(raw.environment)) bad("F3 sólo admite schemaVersion=1 y environment=local|test (producción requiere su propia habilitación)");
  let url; try { url = new URL(raw.supabaseUrl); } catch { bad("supabaseUrl inválida"); }
  if (raw.environment === "local") {
    if (raw.expectedProjectRef !== "local") bad("environment=local exige expectedProjectRef=local");
    if (!LOOPBACK_HOSTS.has(url.hostname.replace(/^\[|\]$/g, ""))) bad("environment=local exige endpoint loopback");
  } else {
    // Test: el ref queda fijo en el código; ni la configuración ni una bandera pueden apuntar a otro proyecto.
    if (raw.expectedProjectRef !== KNOWN_REFS.test) bad(`environment=test exige el ref ${KNOWN_REFS.test}`);
    if (url.origin !== `https://${KNOWN_REFS.test}.supabase.co`) bad(`environment=test exige supabaseUrl https://${KNOWN_REFS.test}.supabase.co`);
  }
  if (!/^f3-[A-Za-z0-9._-]{5,61}$/.test(raw.installationId ?? "") || raw.snapshot !== "TimeControlDB_20261023_1200") bad("installationId o snapshot no aprobados");
  if (!raw.inputs || INPUT_NAMES.some((name) => typeof raw.inputs[name] !== "string" || !path.isAbsolute(raw.inputs[name]))) bad("F3 requiere las seis rutas absolutas de entrada");
  if (!raw.f2StateDir || !path.isAbsolute(raw.f2StateDir)) bad("F3 requiere f2StateDir absoluto con journal verificado");
  if (!raw.f2ServicesFile || !path.isAbsolute(raw.f2ServicesFile)) bad("F3 requiere f2ServicesFile absoluto con equivalencias verificadas");
  if (!raw.f2ClientsFile || !path.isAbsolute(raw.f2ClientsFile)) bad("F3 requiere f2ClientsFile absoluto con industrias verificadas");
  if (!raw.technicalAdminId || !/^[0-9a-f-]{36}$/i.test(raw.technicalAdminId)) bad("technicalAdminId debe ser UUID");
  return Object.freeze({ ...raw, supabaseUrl: url.toString().replace(/\/$/, ""), configHash: sha256(stable(raw)) });
}
export function loadF2Maps(f2StateDir) {
  const journalFile = readdirSync(f2StateDir).filter((name) => /^fase2-.*\.journal\.json$/.test(name)).sort().at(-1);
  if (!journalFile) throw new Fase1Error("BLOQUEADO", "no existe journal F2 para resolver identidades F3");
  const journal = readJson(path.join(f2StateDir, journalFile));
  if (journal.state !== "VERIFICADO") throw new Fase1Error("BLOQUEADO", "F3 requiere journal F2 en estado VERIFICADO");
  const clients = Object.fromEntries(Object.entries(journal.clients ?? {}).map(([key, value]) => [key, { id: value.clientId }]));
  const staff = Object.fromEntries(Object.entries(journal.staff ?? {}).map(([key, value]) => [key, value.staffId]));
  return { clients, staff, journalFile };
}
const nameKey = (value) => String(value ?? "").trim().toLocaleLowerCase("es");
const catalogByName = (rows, label) => {
  const map = new Map();
  for (const row of rows ?? []) {
    const key = nameKey(row.name);
    if (!key || map.has(key)) throw new Fase1Error("BLOQUEADO", `catálogo EMS ambiguo: ${label} ${row.name ?? "(vacío)"}`);
    map.set(key, row);
  }
  return map;
};

// Resuelve todos los identificadores contra el journal F2 verificado y el
// catálogo local vigente. No escribe ni infiere valores cuando falta un cruce.
export async function prepareEngagementPayloads(ctx, inputs) {
  const f2 = loadF2Maps(ctx.config.f2StateDir);
  const servicesSource = parseCsv(readFileSync(ctx.config.f2ServicesFile, "utf8"), F2_HEADERS.services, "equivalencias F2");
  const catalog = await ctx.db.engagementCatalog();
  const clientsCatalog = new Map((catalog.clients ?? []).map((row) => [row.id, row]));
  const clients = Object.fromEntries(Object.entries(f2.clients).map(([sourceRef, row]) => {
    const client = clientsCatalog.get(row.id);
    if (!client) throw new Fase1Error("BLOQUEADO", `cliente F2 inexistente o inactivo: ${sourceRef}`);
    return [sourceRef, client];
  }));
  const serviceCatalog = catalogByName(catalog.services, "servicio");
  const services = Object.fromEntries(servicesSource.map((row) => {
    const service = serviceCatalog.get(nameKey(row.ems_service_name));
    if (!service) throw new Fase1Error("BLOQUEADO", `servicio F2 sin catálogo EMS: ${row.legacy_service_id} (${row.ems_service_name})`);
    return [row.legacy_service_id, service];
  }));
  const societyCatalog = catalogByName(catalog.societies, "sociedad");
  const societies = {
    Pelaez: societyCatalog.get(nameKey("Ruizmier Pelaez S.R.L."))?.id,
    Jauregui: societyCatalog.get(nameKey("Ruizmier Jauregui S.R.L."))?.id,
  };
  if (!societies.Pelaez || !societies.Jauregui) throw new Fase1Error("BLOQUEADO", "catálogo EMS no contiene ambas sociedades Ruizmier");
  const staffById = new Map((catalog.staff ?? []).map((row) => [row.id, row]));
  const officeByStaffId = {};
  for (const [sourceRef, staffId] of Object.entries(f2.staff)) {
    const staff = staffById.get(staffId);
    if (!staff) throw new Fase1Error("BLOQUEADO", `personal F2 inexistente: ${sourceRef}`);
    const office = ({ "La Paz": 1, "Santa Cruz": 2 })[String(staff.city ?? "").trim()];
    if (!office) throw new Fase1Error("BLOQUEADO", `ciudad EMS no mapeable de ${sourceRef}: ${staff.city ?? "(vacía)"}`);
    officeByStaffId[staffId] = office;
  }
  const internalClientId = f2.clients["NEW-RP"]?.id;
  if (!internalClientId || !clients["NEW-RP"]) throw new Fase1Error("BLOQUEADO", "cliente interno NEW-RP no está activo en el catálogo EMS");
  const maps = { clients, services, staff: f2.staff, societies, internalClientId, officeByStaffId };
  return Object.freeze({
    maps,
    f2Journal: f2.journalFile,
    clientEngagements: buildClientEngagementPayloads(inputs.clientEngagements, maps),
    administrativeEngagements: buildAdministrativeEngagementPayloads(inputs.administrativeEngagements, maps),
  });
}
const MATRIX_PRACTICE = Object.freeze({ AUD: 1, COM: 2, TAX: 3 });
const mapUnique = (rows, keyOf, label) => {
  const result = new Map();
  for (const row of rows ?? []) { const key = keyOf(row); if (!key || result.has(key)) throw new Fase1Error("BLOQUEADO", `catálogo EMS ambiguo: ${label} ${key || "(vacío)"}`); result.set(key, row); }
  return result;
};
// Convierte las celdas lógicas a identificadores EMS, sin reservar ni escribir aún.
export async function prepareMatrixBlueprint(ctx, matrix) {
  const engagements = ctx.journal.units["client-engagements"]?.result?.engagements;
  if (!Array.isArray(engagements) || engagements.length !== 124) throw new Fase1Error("BLOQUEADO", "matrices requiere el mapa confirmado de 124 encargos cliente");
  const engagementByCot = new Map(engagements.map((row) => [row.sourceKey, row.engagementId]));
  const catalog = await ctx.db.matrixCatalog();
  const categories = mapUnique(catalog.categories, (row) => `${row.practice}|${nameKey(row.name)}`, "categoría");
  const activities = mapUnique(catalog.activities, (row) => row.code, "actividad");
  const byCot = new Map();
  for (const cell of matrix.cells) {
    const practice = MATRIX_PRACTICE[cell.practica_abbreviation]; const engagementId = engagementByCot.get(cell.legacy_cot);
    const category = categories.get(`${practice}|${nameKey(cell.target_category_name)}`); const activity = activities.get(cell.target_activity_code);
    if (!practice || !engagementId || !category || !activity || Number(activity.practice) !== practice) throw new Fase1Error("BLOQUEADO", `celda de matriz sin catálogo EMS: ${cell.legacy_cot}/${cell.target_category_name}/${cell.target_activity_code}`);
    const cells = byCot.get(cell.legacy_cot) ?? []; cells.push({ categoryId: category.id, activityId: activity.id, budgetHours: cell.budget_hours }); byCot.set(cell.legacy_cot, cells);
  }
  if (byCot.size !== 124) throw new Fase1Error("BLOQUEADO", `matrices incompletas: ${byCot.size} de 124 COT con celdas`);
  return [...byCot.entries()].map(([sourceKey, cells]) => ({ sourceKey, engagementId: engagementByCot.get(sourceKey), cells: cells.sort((a, b) => `${a.categoryId}|${a.activityId}`.localeCompare(`${b.categoryId}|${b.activityId}`)) })).sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}
const reserveMatrices = (blueprint) => blueprint.map((matrix) => ({ ...matrix, worksheetId: randomUUID(), cells: matrix.cells.map((cell) => ({ ...cell, cellId: randomUUID() })) }));
const seasonFromIndustry = (legacyIndustryRef, fiscalYearEnd) => {
  const legacyId = Number(String(legacyIndustryRef ?? "").match(/^(\d+):/)?.[1]); const season = [10, 12, 37].includes(legacyId) ? "Low" : "High";
  const expectedEnd = season === "Low" ? "March 31" : "December 31";
  if (fiscalYearEnd !== expectedEnd) throw new Fase1Error("BLOQUEADO", `industria EMS incompatible con temporada ${season}: ${legacyIndustryRef}`);
  return season;
};
// El estado inactive de una industria retirada sigue siendo válido si el cliente
// histórico ya la referencia; se valida su cierre fiscal, no se la reasigna.
export async function prepareWorkOrderBlueprint(ctx, inputs) {
  const matrixMaps = ctx.journal.units.matrices?.matrices;
  const engagementMaps = ctx.journal.units["client-engagements"]?.result?.engagements;
  if (!Array.isArray(matrixMaps) || matrixMaps.length !== 124 || !Array.isArray(engagementMaps) || engagementMaps.length !== 124) throw new Fase1Error("BLOQUEADO", "OTs requiere mapas confirmados de encargos y matrices");
  const f2 = loadF2Maps(ctx.config.f2StateDir); const clientRows = parseCsv(readFileSync(ctx.config.f2ClientsFile, "utf8"), F2_HEADERS.clients, "clientes F2");
  const f2Clients = new Map(clientRows.map((row) => [row.source_ref, row])); const catalog = await ctx.db.workOrderCatalog(); const clients = new Map((catalog.clients ?? []).map((row) => [row.id, row]));
  const worksheetByCot = new Map(matrixMaps.map((row) => [row.sourceKey, row])); const engagementByCot = new Map(engagementMaps.map((row) => [row.sourceKey, row.engagementId]));
  return inputs.clientEngagements.map((row) => {
    const sourceRef = `legacy:${row.legacy_client_id}`; const clientId = f2.clients[sourceRef]?.id; const f2Client = f2Clients.get(sourceRef); const client = clients.get(clientId); const worksheet = worksheetByCot.get(row.legacy_cot); const engagementId = engagementByCot.get(row.legacy_cot);
    if (!clientId || !f2Client || !client?.industryEnd || !worksheet || worksheet.engagementId !== engagementId) throw new Fase1Error("BLOQUEADO", `OT sin cruce cliente/matriz: ${row.legacy_cot}`);
    const seasonMode = seasonFromIndustry(f2Client.industry_ref, client.industryEnd); const currency = ({ 0: "BOB", 1: "USD" })[Number(row.legacy_currency_raw)];
    if (!currency) throw new Fase1Error("BLOQUEADO", `moneda legacy inválida: ${row.legacy_cot}`);
    return { sourceKey: row.legacy_cot, engagementId, worksheetId: worksheet.worksheetId, currency, seasonMode, taxRate: "0.13", adjustmentAmount: "0" };
  }).sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}
const reserveWorkOrders = (blueprint) => blueprint.map((row) => ({ ...row, woId: randomUUID(), state: "PENDIENTE" }));
export async function prepareExpenseBlueprint(ctx, inputs) {
  const workOrders = ctx.journal.units["work-orders"]?.workOrders;
  if (!Array.isArray(workOrders) || workOrders.length !== 124 || workOrders.some((row) => row.state !== "CONFIRMADA" || row.syncState !== "CONFIRMADA")) throw new Fase1Error("BLOQUEADO", "gastos requiere las 124 OTs sincronizadas");
  const catalog = await ctx.db.expenseCatalog(); const expenseTypes = catalogByName(catalog.expenseTypes, "tipo de gasto"); const workOrderByCot = new Map(workOrders.map((row) => [row.sourceKey, row]));
  const positive = inputs.expenses.filter((row) => row.disposition === "migrable"); const zero = inputs.expenses.filter((row) => row.disposition === "omitida_cero");
  const sourceTotal = inputs.expenses.reduce((sum, row) => sum + decimalUnits(row.legacy_amount_usd), 0n);
  if (positive.length !== 75 || zero.length !== 545 || sourceTotal !== 9207900n) throw new Fase1Error("BLOQUEADO", `gastos fuente incompatible: positivos=${positive.length} ceros=${zero.length} total=${sourceTotal}`);
  const expenses = positive.map((row) => {
    const transformed = expensePayload(row); const workOrder = workOrderByCot.get(row.legacy_cot); const expenseType = expenseTypes.get(nameKey(transformed.expense_type));
    if (!workOrder || !expenseType || transformed.currency !== workOrder.currency) throw new Fase1Error("BLOQUEADO", `gasto sin cruce OT/catálogo/moneda: ${row.legacy_expense_budget_id}`);
    return { sourceKey: row.legacy_expense_budget_id, cot: row.legacy_cot, woId: workOrder.woId, expenseTypeId: expenseType.id, amount: transformed.amount, currency: transformed.currency };
  }).sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
  return { expenses, zeroDispositions: zero.map((row) => row.legacy_expense_budget_id).sort(), sourceTotal: "92079" };
}
const paymentRowsByCot = (rows) => {
  const groups = new Map();
  for (const row of rows) groups.set(row.legacy_cot, [...(groups.get(row.legacy_cot) ?? []), row]);
  return groups;
};
const money = (value) => formatMoney(decimalUnits(value));
const formatMoney = (units) => {
  const sign = units < 0n ? "-" : ""; const absolute = units < 0n ? -units : units; const whole = absolute / 100n; const fraction = String(absolute % 100n).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
};
// Sólo se prepara tras las OTs sincronizadas. La cabecera legacy contiene el
// honorario antes de IVA, mientras PlanPago contiene su equivalente con IVA.
export async function preparePaymentBlueprint(ctx, inputs) {
  const workOrders = ctx.journal.units["work-orders"]?.workOrders;
  if (!Array.isArray(workOrders) || workOrders.length !== 124 || workOrders.some((row) => row.state !== "CONFIRMADA" || row.syncState !== "CONFIRMADA")) throw new Fase1Error("BLOQUEADO", "pagos requiere las 124 OTs sincronizadas");
  const sourceByCot = new Map(inputs.clientEngagements.map((row) => [row.legacy_cot, row])); const groups = paymentRowsByCot(inputs.payments);
  const billable = inputs.payments.filter((row) => !["nota_plan_confirmada", "plan_note"].includes(String(row.proposed_disposition).trim()));
  const notes = inputs.payments.filter((row) => ["nota_plan_confirmada", "plan_note"].includes(String(row.proposed_disposition).trim()));
  if (groups.size !== 124 || inputs.payments.length !== 281 || billable.length !== 277 || notes.length !== 4) throw new Fase1Error("BLOQUEADO", `pagos fuente incompatible: planes=${groups.size}, cuotas=${billable.length}, notas=${notes.length}`);
  const financials = await ctx.db.paymentFinancials({ workOrders: workOrders.map(({ sourceKey, woId }) => ({ sourceKey, woId })) }); const financialByCot = new Map((financials.financials ?? []).map((row) => [row.sourceKey, row]));
  const holidays = boliviaHolidays([2025, 2026, 2027, 2028]); const blueprint = [];
  for (const workOrder of workOrders) {
    const source = sourceByCot.get(workOrder.sourceKey); const rows = groups.get(workOrder.sourceKey); const finance = financialByCot.get(workOrder.sourceKey);
    if (!source || !rows || !finance || finance.woId !== workOrder.woId || finance.currency !== workOrder.currency) throw new Fase1Error("BLOQUEADO", `pagos sin cruce financiero: ${workOrder.sourceKey}`);
    const legacyBudget = money(source.legacy_fee_with_tax); const standard = money(finance.standardFee); const adjustment = formatMoney(decimalUnits(legacyBudget) - decimalUnits(standard));
    const previousAdjustment = money(finance.adjustmentAmount); const expectedFeeWithTax = money(feeWithTax(legacyBudget)); const sourceFees = new Set(rows.map((row) => money(row.legacy_fee_with_tax)));
    if (sourceFees.size !== 1 || !sourceFees.has(expectedFeeWithTax)) throw new Fase1Error("BLOQUEADO", `honorario c/IVA legacy incompatible: ${workOrder.sourceKey}`);
    if (decimalUnits(standard) + decimalUnits(adjustment) !== decimalUnits(legacyBudget)) throw new Fase1Error("BLOQUEADO", `ajuste financiero no concilia: ${workOrder.sourceKey}`);
    const artifact = paymentArtifacts(rows, expectedFeeWithTax, holidays); const rawCurrency = String(rows[0].legacy_currency_raw).trim(); const exchangeRate = rawCurrency === "1" ? money(rows[0].legacy_exchange_rate) : null;
    if (!['0', '1'].includes(rawCurrency) || (rawCurrency === '1' && (decimalUnits(exchangeRate) <= 0n || rows.some((row) => money(row.legacy_exchange_rate) !== exchangeRate)))) throw new Fase1Error("BLOQUEADO", `TC de plan incompatible: ${workOrder.sourceKey}`);
    blueprint.push({ sourceKey: workOrder.sourceKey, woId: workOrder.woId, previousAdjustmentAmount: previousAdjustment, adjustmentAmount: adjustment, legacyBudget, feeWithTax: expectedFeeWithTax, exchangeRate, exchangeRateMode: rawCurrency === "1" ? "fijo" : null,
      installments: artifact.installments.map((row) => ({ sourceKey: row.legacy_plan_payment_id, installmentNumber: Number(row.legacy_installment_number), agreedInvoiceDate: row.legacy_invoice_date, agreedPaymentDate: row.payment_due_date, percentage: row.percentage, amount: row.amount, currency: workOrder.currency, invoiceExchangeRate: exchangeRate, paymentExchangeRate: exchangeRate })),
      notes: artifact.notes.map((row) => ({ sourceKey: row.legacy_plan_payment_id, woId: workOrder.woId, body: row.body })),
    });
  }
  return blueprint.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
}
const reservePayments = (blueprint) => blueprint.map((row) => ({ ...row, planId: randomUUID(), installments: row.installments.map((installment) => ({ ...installment, installmentId: randomUUID() })), state: "PENDIENTE" }));
const reserveExpenses = (blueprint) => blueprint.expenses.map((row) => ({ ...row, expenseId: randomUUID(), state: "PENDIENTE" }));
export function resolveStateDir(env = process.env, repoRoot = REPO_ROOT) {
  if (!env.ETL_F3_STATE_DIR || !path.isAbsolute(env.ETL_F3_STATE_DIR)) bad("ETL_F3_STATE_DIR debe ser absoluto y externo al repositorio");
  mkdirSync(env.ETL_F3_STATE_DIR, { recursive: true }); const state = realpathSync(env.ETL_F3_STATE_DIR); const root = realpathSync(repoRoot); const relative = path.relative(root, state);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative))) bad("ETL_F3_STATE_DIR no puede estar dentro del repositorio");
  return state;
}
export const journalPathFor = (dir, id) => path.join(dir, `fase3-${id}.journal.json`);
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const replaceJournal = (tmp, file) => {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try { renameSync(tmp, file); return; } catch (error) {
      lastError = error;
      if (!["EPERM", "EACCES", "EBUSY"].includes(error?.code) || attempt === 7) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
  throw lastError;
};
// Windows puede retener brevemente un journal recién leído por antivirus/Explorer.
// Escribimos a temporal y reintentamos el reemplazo atómico, igual que F1/F2.
const writeJson = (file, value) => {
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`; const body = `${JSON.stringify(value, null, 2)}\n`;
  const fd = openSync(tmp, "w", 0o600);
  try { writeSync(fd, body, undefined, "utf8"); fsyncSync(fd); } finally { closeSync(fd); }
  replaceJournal(tmp, file);
  try { const dir = openSync(path.dirname(file), "r"); try { fsyncSync(dir); } finally { closeSync(dir); } } catch { /* Windows no permite fsync de directorio. */ }
};
const initialJournal = (config) => ({ version: 1, installationId: config.installationId, projectRef: config.expectedProjectRef, configHash: config.configHash, state: "PENDIENTE", blocks: {}, units: {}, createdAt: new Date().toISOString() });
export function createContext({ config, env = process.env, stateDir, db } = {}) {
  const journalFile = journalPathFor(stateDir, config.installationId); const existing = existsSync(journalFile) ? readJson(journalFile) : null;
  // Un journal pertenece a un único proyecto: reutilizarlo contra otro ref sería promover estado ajeno.
  if (existing && (existing.installationId !== config.installationId || existing.projectRef !== config.expectedProjectRef)) throw new Fase1Error("BLOQUEADO", "journal F3 de otra instalación o proyecto");
  // Misma instalación pero otra configuración (rutas de CSV, administrador técnico, F2, equivalencias…): reanudar mezclaría
  // unidades confirmadas con una configuración que no las produjo. Una instalación nueva exige un installationId nuevo.
  if (existing && existing.configHash !== config.configHash) throw new Fase1Error("BLOQUEADO", "el journal F3 se creó con otra configuración (configHash): use un installationId nuevo");
  return { config, env, stateDir, journalFile, journal: existing ?? initialJournal(config), db: db ?? createFase3DbAdapter({ env }) };
}
// Guarda de entorno para toda orden que toque la base: conexión coherente con el ref y, fuera de local, ventana exclusiva confirmada.
export function assertTarget(config, env) {
  const problems = connectionGuardProblems(config, env); if (problems.length) throw new Fase1Error("BLOQUEADO", problems.join("; "));
  if (config.environment !== "local" && !env.ETL_F3_WINDOW_CONFIRMED) throw new Fase1Error("CONFIG", "falta ETL_F3_WINDOW_CONFIRMED (ventana exclusiva)");
}
const checkpoint = (ctx, patch) => { ctx.journal = { ...ctx.journal, ...patch, updatedAt: new Date().toISOString() }; writeJson(ctx.journalFile, ctx.journal); return ctx.journal; };
const requireState = (ctx, state) => { if (STATES.indexOf(ctx.journal.state) > STATES.indexOf(state)) return; checkpoint(ctx, { state }); };
const inputsFor = (config) => Object.fromEntries(INPUT_NAMES.map((name) => [name, readInput(config.inputs[name], name)]));

// Con progreso (unidades o bloques ya escritos) los CSV no pueden cambiar: las unidades confirmadas y sus UUID salieron de
// los insumos anteriores. Antes de cargar nada sí se puede corregir un CSV y revalidar.
export function assertInputsUnchangedSinceProgress(journal, fingerprints) {
  const progressed = Object.keys(journal.units ?? {}).length > 0 || Object.keys(journal.blocks ?? {}).length > 0;
  if (progressed && journal.inputs && stable(journal.inputs) !== stable(fingerprints)) throw new Fase1Error("BLOQUEADO", "cambió la huella de los CSV de F3 desde que empezó la carga: use un installationId nuevo");
}

export async function validate(ctx) {
  const inputs = validateInputs(inputsFor(ctx.config), { enforceExpected: true }); const matrix = buildMatrixArtifacts({ engagements: inputs.clientEngagements, planRows: inputs.planHours }); const executions = consolidateExecutions(inputs.executions.filter(isMigrableExecution));
  const evidence = { R1: { inputs: inputs.fingerprints, clients: inputs.clientEngagements.length, administrative: inputs.administrativeEngagements.length, matrixHours: matrix.cellTotal, executedCells: executions.length }, R3: { zeroPlanHours: matrix.dispositions.filter((row) => row.disposition === "omitida_cero").length, zeroExpenses: inputs.expenses.filter((row) => row.disposition === "omitida_cero").length, excludedExecutions: inputs.executions.filter((row) => !isMigrableExecution(row)).length }, R4: { matrixSourceTotal: matrix.sourceTotal, noteCount: inputs.payments.filter((row) => ["nota_plan_confirmada", "plan_note"].includes(row.proposed_disposition)).length } };
  assertInputsUnchangedSinceProgress(ctx.journal, inputs.fingerprints);
  requireState(ctx, "VALIDADO"); checkpoint(ctx, { inputs: inputs.fingerprints, evidence }); ctx.inputs = inputs; return { ok: true, inputs, matrix, executions, evidence };
}
export async function preflight(ctx) { const result = await validate(ctx); const target = await ctx.db.preflight(ctx.config); if (!target.engagement_rpc || !target.sync_rpc || !target.note_rpc) throw new Fase1Error("BLOQUEADO", "contrato RPC F3 incompleto"); if (target.technical_admin_ok !== true) throw new Fase1Error("BLOQUEADO", "technicalAdminId no es el administrador bootstrap (ficha enlazada con rol admin/admin)"); const inventory = await ctx.db.inventory(); requireState(ctx, "PREFLIGHT_VALIDADO"); checkpoint(ctx, { inventory }); return { ...result, target, inventory }; }
const previousBlock = (block) => ({ "client-engagements": null, "administrative-engagements": "client-engagements", matrices: "administrative-engagements", "work-orders": "matrices", hours: "work-orders" })[block];
export function acceptBlock(ctx, block, evidenceHash) {
  if (!BLOCKS.includes(block) || !/^[a-f0-9]{64}$/i.test(evidenceHash ?? "")) throw new Fase1Error("BLOQUEADO", "acta de aceptación F3 inválida");
  if (ctx.journal.units[block]?.state !== "CONFIRMADA") throw new Fase1Error("BLOQUEADO", `no se puede aceptar ${block} sin unidad confirmada`);
  checkpoint(ctx, { blocks: { ...ctx.journal.blocks, [block]: { ...(ctx.journal.blocks[block] ?? {}), acceptedAt: new Date().toISOString(), evidenceHash } } });
}
const engagementPayloadsFor = (block, prepared) => block === "client-engagements" ? prepared.engagementPayloads.clientEngagements : block === "administrative-engagements" ? prepared.engagementPayloads.administrativeEngagements : null;
const normalizeEngagementMatches = (recheck, sourceKeys) => {
  if (!recheck?.actorStaffId) throw new Fase1Error("BLOQUEADO", "el administrador técnico F3 no tiene ficha de personal enlazada");
  const matches = new Map((recheck.matches ?? []).map((row) => [row.sourceKey, row.engagements ?? []]));
  const missing = sourceKeys.filter((key) => !matches.has(key) || matches.get(key).length === 0);
  const ambiguous = sourceKeys.filter((key) => (matches.get(key) ?? []).length > 1);
  const found = sourceKeys.filter((key) => (matches.get(key) ?? []).length === 1).map((key) => ({ sourceKey: key, ...matches.get(key)[0] }));
  return { missing, ambiguous, found };
};
const requireAllEngagements = (check, block) => {
  if (check.ambiguous.length) throw new Fase1Error("RECONCILIACION_REQUERIDA", `${block}: coincidencias múltiples para ${check.ambiguous.join(", ")}`);
  if (check.missing.length) throw new Fase1Error("RECONCILIACION_REQUERIDA", `${block}: faltan ${check.missing.length} encargos tras la escritura`);
  return check.found;
};
const normalizeMatrixMatches = (recheck, sourceKeys) => {
  if (!recheck?.actorStaffId) throw new Fase1Error("BLOQUEADO", "el administrador técnico F3 no tiene ficha de personal enlazada");
  const matches = new Map((recheck.matches ?? []).map((row) => [row.sourceKey, row]));
  const complete = sourceKeys.filter((key) => { const row = matches.get(key); return row?.worksheetMatches === 1 && row.engagementWorksheets === 1 && row.actualCells === row.expectedCells && row.matchingCells === row.expectedCells; });
  const any = sourceKeys.filter((key) => { const row = matches.get(key); return (row?.engagementWorksheets ?? 0) > 0 || (row?.actualCells ?? 0) > 0; });
  return { complete, any, incomplete: sourceKeys.filter((key) => !complete.includes(key)) };
};
async function loadMatrices(ctx, blueprint, unit) {
  const matrixHash = sha256(stable(blueprint));
  if (unit && unit.matrixHash !== matrixHash) throw new Fase1Error("BLOQUEADO", "matrices: cambió el contenido respecto de la intención durable");
  if (!unit) {
    const matrices = reserveMatrices(blueprint); const before = normalizeMatrixMatches(await ctx.db.findMatrixMatches({ technicalAdminId: ctx.config.technicalAdminId, matrices }), matrices.map((row) => row.sourceKey));
    if (before.any.length) throw new Fase1Error("RECONCILIACION_REQUERIDA", `matrices: existen hojas previas para ${before.any.join(", ")}`);
    unit = { id: randomUUID(), state: "INTENCION_DURABLE", matrixHash, matrices, intendedAt: new Date().toISOString() };
    checkpoint(ctx, { units: { ...ctx.journal.units, matrices: unit } });
  }
  const recheck = async () => normalizeMatrixMatches(await ctx.db.findMatrixMatches({ technicalAdminId: ctx.config.technicalAdminId, matrices: unit.matrices }), unit.matrices.map((row) => row.sourceKey));
  let status = await recheck();
  if (unit.state === "CONFIRMADA") {
    if (status.incomplete.length) throw new Fase1Error("RECONCILIACION_REQUERIDA", `matrices: falta o cambió evidencia persistida (${status.incomplete.length})`);
    return { recovered: true, worksheets: unit.matrices.length, cells: unit.matrices.reduce((sum, row) => sum + row.cells.length, 0) };
  }
  if (status.any.length && status.incomplete.length) {
    await ctx.db.repairMatrixCreators({ technicalAdminId: ctx.config.technicalAdminId, matrices: unit.matrices }); status = await recheck();
    if (status.complete.length === unit.matrices.length) return { recovered: true, worksheets: unit.matrices.length, cells: unit.matrices.reduce((sum, row) => sum + row.cells.length, 0) };
    throw new Fase1Error("RECONCILIACION_REQUERIDA", `matrices: recuperación parcial (${status.complete.length} completas de ${unit.matrices.length})`);
  }
  if (status.complete.length === unit.matrices.length) return { recovered: true, worksheets: unit.matrices.length, cells: unit.matrices.reduce((sum, row) => sum + row.cells.length, 0) };
  const created = await ctx.db.createMatrices({ technicalAdminId: ctx.config.technicalAdminId, matrices: unit.matrices });
  status = await recheck();
  const cells = unit.matrices.reduce((sum, row) => sum + row.cells.length, 0);
  if (status.incomplete.length || Number(created?.worksheets) !== unit.matrices.length || Number(created?.cells) !== cells) throw new Fase1Error("RECONCILIACION_REQUERIDA", "matrices: respuesta o relectura no conciliable");
  return { recovered: false, worksheets: unit.matrices.length, cells };
}
async function loadWorkOrders(ctx, blueprint, unit) {
  const workOrderHash = sha256(stable(blueprint));
  if (unit && unit.workOrderHash !== workOrderHash) throw new Fase1Error("BLOQUEADO", "OTs: cambió el contenido respecto de la intención durable");
  if (!unit) {
    const workOrders = reserveWorkOrders(blueprint);
    for (const workOrder of workOrders) {
      const before = await ctx.db.findWorkOrder({ workOrder });
      if (Number(before.forEngagement) !== 0) throw new Fase1Error("RECONCILIACION_REQUERIDA", `OT existente para ${workOrder.sourceKey}`);
    }
    unit = { id: randomUUID(), state: "INTENCION_DURABLE", workOrderHash, workOrders, intendedAt: new Date().toISOString() };
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": unit } });
  }
  for (const workOrder of unit.workOrders) {
    const found = await ctx.db.findWorkOrder({ workOrder });
    if (Number(found.exact) === 1 && Number(found.forEngagement) === 1) { workOrder.state = "CONFIRMADA"; continue; }
    if (Number(found.forEngagement) !== 0) throw new Fase1Error("RECONCILIACION_REQUERIDA", `OT ambigua para ${workOrder.sourceKey}`);
    if (workOrder.state === "CONFIRMADA") throw new Fase1Error("RECONCILIACION_REQUERIDA", `OT confirmada ausente para ${workOrder.sourceKey}`);
    const created = await ctx.db.createWorkOrder({ technicalAdminId: ctx.config.technicalAdminId, workOrder });
    const after = await ctx.db.findWorkOrder({ workOrder });
    if (created?.woId !== workOrder.woId || created?.engagementId !== workOrder.engagementId || Number(after.exact) !== 1 || Number(after.forEngagement) !== 1) throw new Fase1Error("RECONCILIACION_REQUERIDA", `OT no conciliable para ${workOrder.sourceKey}`);
    workOrder.state = "CONFIRMADA";
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, workOrders: unit.workOrders } } });
  }
  if (unit.workOrders.some((row) => row.state !== "CONFIRMADA")) throw new Fase1Error("RECONCILIACION_REQUERIDA", "OTs sin confirmación completa");
  return { recovered: unit.state === "CONFIRMADA", workOrders: unit.workOrders.length, currencies: unit.workOrders.reduce((acc, row) => ({ ...acc, [row.currency]: (acc[row.currency] ?? 0) + 1 }), {}) };
}
// `numeric` llega desde psql como texto o como número JSON según la versión
// local. Las diferencias se comparan de forma exacta en SQL; aquí sólo se
// comprueba que ambos agregados sean positivos y que no haya diferencias.
const syncIsExact = (result) => Number(result?.linked) === 1 && Number(result?.matrixCategories) > 0 && Number(result?.budgetCategories) > 0 && Number(result?.matrixCategories) === Number(result?.budgetCategories) && Number(result?.matrixHours) > 0 && Number(result?.budgetHours) > 0 && Number(result?.differences) === 0;
async function syncWorkOrders(ctx, unit) {
  if (unit?.state !== "CONFIRMADA" || !Array.isArray(unit.workOrders) || unit.workOrders.length !== 124) throw new Fase1Error("BLOQUEADO", "sincronización requiere las 124 OTs confirmadas");
  const syncHash = sha256(stable(unit.workOrders.map(({ sourceKey, worksheetId, woId }) => ({ sourceKey, worksheetId, woId }))));
  if (unit.syncHash && unit.syncHash !== syncHash) throw new Fase1Error("BLOQUEADO", "sincronización: cambió el mapa OT/matriz");
  if (!unit.syncHash) { unit.syncHash = syncHash; unit.syncIntentAt = new Date().toISOString(); checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": unit } }); }
  let budgetLines = 0; let matrixHours = 0; let budgetHours = 0;
  for (const workOrder of unit.workOrders) {
    let verification = await ctx.db.findWorkOrderSync({ worksheetId: workOrder.worksheetId, woId: workOrder.woId });
    if (syncIsExact(verification)) { workOrder.syncState = "CONFIRMADA"; } else {
      const before = verification;
    if (Number(before.linked) || Number(before.budgetCategories) || Number(before.budgetHours)) throw new Fase1Error("RECONCILIACION_REQUERIDA", `sincronización parcial o divergente: ${workOrder.sourceKey}`);
    if (workOrder.syncState === "CONFIRMADA") throw new Fase1Error("RECONCILIACION_REQUERIDA", `sincronización confirmada ausente: ${workOrder.sourceKey}`);
    await ctx.db.syncWorksheetToWorkOrder({ technicalAdminId: ctx.config.technicalAdminId, worksheetId: workOrder.worksheetId, woId: workOrder.woId });
    const after = await ctx.db.findWorkOrderSync({ worksheetId: workOrder.worksheetId, woId: workOrder.woId });
    if (!syncIsExact(after)) throw new Fase1Error("RECONCILIACION_REQUERIDA", `sincronización no conciliable: ${workOrder.sourceKey}`);
      verification = after;
    workOrder.syncState = "CONFIRMADA";
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, workOrders: unit.workOrders } } });
    }
    budgetLines += Number(verification.budgetCategories);
    matrixHours += Number(verification.matrixHours);
    budgetHours += Number(verification.budgetHours);
  }
  if (unit.workOrders.some((row) => row.syncState !== "CONFIRMADA")) throw new Fase1Error("RECONCILIACION_REQUERIDA", "sincronización incompleta");
  return { recovered: Boolean(unit.syncCompletedAt), workOrders: unit.workOrders.length, budgetLines, matrixHours, budgetHours };
}
const expenseStatus = (result, expenses) => {
  const matches = new Map((result?.matches ?? []).map((row) => [row.sourceKey, row]));
  const expectedPerWorkOrder = new Map(); for (const row of expenses) expectedPerWorkOrder.set(row.woId, (expectedPerWorkOrder.get(row.woId) ?? 0) + 1);
  const exact = expenses.every((row) => { const found = matches.get(row.sourceKey); return Number(found?.idMatches) === 1 && Number(found?.exactMatches) === 1 && Number(found?.workOrderExpenses) === expectedPerWorkOrder.get(row.woId); });
  const empty = expenses.every((row) => { const found = matches.get(row.sourceKey); return Number(found?.idMatches) === 0 && Number(found?.exactMatches) === 0 && Number(found?.workOrderExpenses) === 0; });
  return { exact, empty };
};
const expenseGroups = (expenses) => {
  const groups = new Map();
  for (const expense of expenses) groups.set(expense.cot, [...(groups.get(expense.cot) ?? []), expense]);
  return [...groups.values()];
};
async function loadExpenses(ctx, blueprint, unit) {
  const expenseHash = sha256(stable(blueprint));
  if (unit?.expenseHash && unit.expenseHash !== expenseHash) throw new Fase1Error("BLOQUEADO", "gastos: cambió el contenido respecto de la intención durable");
  if (!unit?.expenseHash) {
    const expenses = reserveExpenses(blueprint);
    for (const rows of expenseGroups(expenses)) {
      const before = expenseStatus(await ctx.db.findExpenseMatches({ expenses: rows }), rows);
      if (!before.empty) throw new Fase1Error("RECONCILIACION_REQUERIDA", `gastos: destino no vacío para ${rows[0].cot}`);
    }
    Object.assign(unit, { expenseHash, expenses, zeroDispositions: blueprint.zeroDispositions, sourceTotal: blueprint.sourceTotal, expensesIntendedAt: new Date().toISOString() });
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": unit } });
  }
  for (const rows of expenseGroups(unit.expenses)) {
    const before = expenseStatus(await ctx.db.findExpenseMatches({ expenses: rows }), rows);
    if (before.exact) { rows.forEach((row) => { row.state = "CONFIRMADA"; }); continue; }
    if (!before.empty || rows.some((row) => row.state === "CONFIRMADA")) throw new Fase1Error("RECONCILIACION_REQUERIDA", `gastos: recuperación parcial o divergente para ${rows[0].cot}`);
    const created = await ctx.db.createExpenses({ technicalAdminId: ctx.config.technicalAdminId, expenses: rows }); const after = expenseStatus(await ctx.db.findExpenseMatches({ expenses: rows }), rows);
    if (Number(created?.inserted) !== rows.length || !after.exact) throw new Fase1Error("RECONCILIACION_REQUERIDA", `gastos: escritura no conciliable para ${rows[0].cot}`);
    rows.forEach((row) => { row.state = "CONFIRMADA"; });
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, expenses: unit.expenses } } });
  }
  if (unit.expenses.some((row) => row.state !== "CONFIRMADA")) throw new Fase1Error("RECONCILIACION_REQUERIDA", "gastos sin confirmación completa");
  return { recovered: Boolean(unit.expensesCompletedAt), positiveExpenses: unit.expenses.length, zeroDispositions: unit.zeroDispositions.length, sourceTotal: unit.sourceTotal };
}
const paymentStatus = (result, payment) => {
  const installments = new Map((result?.installmentMatches ?? []).map((row) => [row.sourceKey, row]));
  const notes = new Map((result?.noteMatches ?? []).map((row) => [row.sourceKey, row]));
  const expectedNoteCount = payment.notes.length;
  const installmentsExact = payment.installments.every((row) => Number(installments.get(row.sourceKey)?.idMatches) === 1 && Number(installments.get(row.sourceKey)?.exactMatches) === 1);
  const notesExact = payment.notes.every((row) => Number(notes.get(row.sourceKey)?.matches) === 1);
  const children = Number(result?.plansForWorkOrder) + Number(result?.installmentsForWorkOrder) + Number(result?.notesForWorkOrder);
  const exact = Number(result?.workOrderCount) === 1 && Number(result?.adjustmentExact) === 1 && Number(result?.planIdMatches) === 1 && Number(result?.planExact) === 1 && Number(result?.plansForWorkOrder) === 1 && Number(result?.installmentsForWorkOrder) === payment.installments.length && Number(result?.notesForWorkOrder) === expectedNoteCount && installmentsExact && notesExact;
  // Si el ajuste ya se movió sin todos sus hijos, se considera una unidad parcial:
  // nunca se adopta ni se completa automáticamente.
  const empty = Number(result?.workOrderCount) === 1 && Number(result?.adjustmentExact) === 0 && children === 0;
  return { exact, empty, installmentMatches: installments, noteMatches: notes };
};
const decimalEqual = (left, right) => {
  if (left == null || right == null) return false;
  const scale = Math.max((String(left).split(".")[1] ?? "").length, (String(right).split(".")[1] ?? "").length);
  return decimalUnits(String(left), scale) === decimalUnits(String(right), scale);
};
const paymentStatusesFromSnapshot = (snapshot, payments) => {
  const workOrders = new Map((snapshot.workOrders ?? []).map((row) => [row.woId, row])); const plans = snapshot.plans ?? []; const installments = snapshot.installments ?? []; const notes = snapshot.notes ?? [];
  return payments.map((payment) => {
    const ownPlans = plans.filter((row) => row.woId === payment.woId); const ownInstallments = installments.filter((row) => row.woId === payment.woId); const ownNotes = notes.filter((row) => row.woId === payment.woId); const workOrder = workOrders.get(payment.woId);
    const plan = ownPlans.find((row) => row.planId === payment.planId);
    const planExact = plan && plan.paymentDays === 30 && plan.exchangeRateMode === (payment.exchangeRateMode ?? "fijo") && plan.exchangeRate != null && decimalUnits(String(plan.exchangeRate)) > 0n && (payment.exchangeRate == null || decimalEqual(plan.exchangeRate, payment.exchangeRate));
    const installmentExact = payment.installments.every((expected) => { const actual = ownInstallments.find((row) => row.installmentId === expected.installmentId); return actual && actual.planId === payment.planId && actual.installmentNumber === expected.installmentNumber && actual.agreedInvoiceDate === expected.agreedInvoiceDate && actual.agreedPaymentDate === expected.agreedPaymentDate && decimalEqual(actual.percentage, expected.percentage) && decimalEqual(actual.amount, expected.amount) && actual.status === "Pending" && actual.installmentType === "fee" && actual.currency === expected.currency && decimalEqual(actual.invoiceExchangeRate, expected.invoiceExchangeRate ?? plan.exchangeRate) && decimalEqual(actual.paymentExchangeRate, expected.paymentExchangeRate ?? plan.exchangeRate); });
    const noteMatches = new Map(payment.notes.map((expected) => [expected.sourceKey, ownNotes.filter((row) => row.installmentId == null && row.body === expected.body)])); const notesExact = [...noteMatches.values()].every((rows) => rows.length === 1);
    const exact = Boolean(workOrder) && decimalEqual(workOrder.adjustmentAmount, payment.adjustmentAmount) && ownPlans.length === 1 && Boolean(planExact) && ownInstallments.length === payment.installments.length && installmentExact && ownNotes.length === payment.notes.length && notesExact;
    const empty = Boolean(workOrder) && !decimalEqual(workOrder.adjustmentAmount, payment.adjustmentAmount) && ownPlans.length === 0 && ownInstallments.length === 0 && ownNotes.length === 0;
    return [payment, { exact, empty, noteMatches }];
  });
};
const paymentHash = (blueprint) => sha256(stable(blueprint.map(({ previousAdjustmentAmount, ...row }) => row)));
async function loadPayments(ctx, blueprint, unit) {
  const hash = paymentHash(blueprint);
  if (unit?.paymentHash && unit.paymentHash !== hash) throw new Fase1Error("BLOQUEADO", "pagos: cambió el payload respecto de la intención durable");
  // Una versión anterior registró por error el honorario ajustado como
  // precondición del UPDATE. Sin efecto persistido, se corrige solamente ese
  // dato de control, preservando todos los UUID ya reservados.
  if (unit?.payments && !unit.paymentIntentRepairAt && unit.payments.some((row) => row.previousAdjustmentAmount !== blueprint.find((next) => next.sourceKey === row.sourceKey)?.previousAdjustmentAmount)) {
    const status = paymentStatusesFromSnapshot(await ctx.db.paymentSnapshotBatch({ payments: unit.payments }), unit.payments);
    if (!status.every(([, item]) => item.empty) || unit.payments.some((row) => row.state === "CONFIRMADA")) throw new Fase1Error("RECONCILIACION_REQUERIDA", "pagos: no es seguro reparar la precondición de ajuste");
    const currentByCot = new Map(blueprint.map((row) => [row.sourceKey, row.previousAdjustmentAmount]));
    for (const payment of unit.payments) payment.previousAdjustmentAmount = currentByCot.get(payment.sourceKey);
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, payments: unit.payments, paymentIntentRepairAt: new Date().toISOString() } } });
  }
  if (!unit?.paymentHash) {
    const payments = reservePayments(blueprint);
    const initial = paymentStatusesFromSnapshot(await ctx.db.paymentSnapshotBatch({ payments }), payments);
    for (const [payment, before] of initial) {
      if (!before.empty) throw new Fase1Error("RECONCILIACION_REQUERIDA", `pagos: destino no vacío o ajuste parcial para ${payment.sourceKey}`);
    }
    Object.assign(unit, { paymentHash: hash, payments, paymentsIntendedAt: new Date().toISOString() });
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": unit } });
  }
  let statuses = paymentStatusesFromSnapshot(await ctx.db.paymentSnapshotBatch({ payments: unit.payments }), unit.payments);
  if (statuses.every(([, status]) => status.exact)) {
    for (const [payment, status] of statuses) { payment.state = "CONFIRMADA"; for (const note of payment.notes) note.noteId = status.noteMatches.get(note.sourceKey)?.[0]?.noteId ?? note.noteId; }
  } else {
    const partial = statuses.find(([, status]) => !status.empty);
    if (partial || unit.payments.some((row) => row.state === "CONFIRMADA")) throw new Fase1Error("RECONCILIACION_REQUERIDA", `pagos: recuperación parcial o divergente para ${partial?.[0]?.sourceKey ?? "lote"}`);
    const created = await ctx.db.createPaymentsBatch({ technicalAdminId: ctx.config.technicalAdminId, payments: unit.payments });
    if (Number(created?.adjusted) !== unit.payments.length || Number(created?.plans) !== unit.payments.length || Number(created?.installments) !== unit.payments.reduce((sum, row) => sum + row.installments.length, 0) || Number(created?.notes) !== unit.payments.reduce((sum, row) => sum + row.notes.length, 0)) throw new Fase1Error("RECONCILIACION_REQUERIDA", "pagos: respuesta de lote no conciliable");
    statuses = paymentStatusesFromSnapshot(await ctx.db.paymentSnapshotBatch({ payments: unit.payments }), unit.payments);
    for (const [payment, status] of statuses) { if (!status.exact) throw new Fase1Error("RECONCILIACION_REQUERIDA", `pagos: escritura no conciliable para ${payment.sourceKey}`); payment.state = "CONFIRMADA"; for (const note of payment.notes) note.noteId = status.noteMatches.get(note.sourceKey)?.[0]?.noteId; }
  }
  checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, payments: unit.payments } } });
  if (unit.payments.some((row) => row.state !== "CONFIRMADA")) throw new Fase1Error("RECONCILIACION_REQUERIDA", "pagos sin confirmación completa");
  // P-02 (plan_v2 §3): el TC de un plan BOB es el DEFAULT efectivo del esquema, no un TC legacy; se registra en R4.
  const finalSnapshot = await ctx.db.paymentSnapshotBatch({ payments: unit.payments }); const defaultedPlans = new Set(unit.payments.filter((row) => row.exchangeRate == null).map((row) => row.planId));
  const bobDefaultRates = [...new Set((finalSnapshot.plans ?? []).filter((row) => defaultedPlans.has(row.planId)).map((row) => String(row.exchangeRate)))].sort();
  return { recovered: Boolean(unit.paymentsCompletedAt), bobDefaultPlans: defaultedPlans.size, bobDefaultRates, plans: unit.payments.length, installments: unit.payments.reduce((sum, row) => sum + row.installments.length, 0), notes: unit.payments.reduce((sum, row) => sum + row.notes.length, 0) };
}
const riskHash = (risks) => sha256(stable(risks));
async function loadRisks(ctx, inputs, unit) {
  const workOrders = unit?.workOrders; if (!Array.isArray(workOrders) || workOrders.length !== 124 || !unit.paymentsCompletedAt) throw new Fase1Error("BLOQUEADO", "riesgos requiere pagos confirmados para las 124 OTs");
  const risks = inputs.clientEngagements.map((source) => { const workOrder = workOrders.find((row) => row.sourceKey === source.legacy_cot); if (!workOrder) throw new Fase1Error("BLOQUEADO", `riesgo sin OT: ${source.legacy_cot}`); return { sourceKey: source.legacy_cot, woId: workOrder.woId, riskNotes: `Código de riesgo legacy: ${source.legacy_risk_code}`, ceacNumber: source.legacy_ceac_number, ceacCompletedAt: source.legacy_ceac_approved_date, sanApprovalId: source.legacy_san_request_id, sanCompletedAt: source.legacy_san_approved_date, approvedAt: `${source.legacy_approved_date}T00:00:00-04:00` }; }).sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
  const hash = riskHash(risks); if (unit.riskHash && unit.riskHash !== hash) throw new Fase1Error("BLOQUEADO", "riesgos: cambió el payload respecto de la intención durable");
  if (!unit.riskHash) { unit.riskHash = hash; unit.risks = risks; unit.risksIntendedAt = new Date().toISOString(); checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": unit } }); }
  const status = new Map((await ctx.db.findRiskMatches({ risks: unit.risks })).matches.map((row) => [row.sourceKey, row]));
  if (unit.risks.every((row) => Number(status.get(row.sourceKey)?.exact) === 1 && Number(status.get(row.sourceKey)?.forWorkOrder) === 1)) return { recovered: true, risks: unit.risks.length };
  if (status.size !== unit.risks.length || [...status.values()].some((row) => Number(row.forWorkOrder) !== 1 || Number(row.exact) !== 0)) throw new Fase1Error("RECONCILIACION_REQUERIDA", "riesgos: destino parcial o divergente");
  const created = await ctx.db.createRisks({ technicalAdminId: ctx.config.technicalAdminId, risks: unit.risks }); const after = new Map((await ctx.db.findRiskMatches({ risks: unit.risks })).matches.map((row) => [row.sourceKey, row]));
  if (Number(created?.updated) !== 124 || unit.risks.some((row) => Number(after.get(row.sourceKey)?.exact) !== 1)) throw new Fase1Error("RECONCILIACION_REQUERIDA", "riesgos: escritura no conciliable");
  return { recovered: false, risks: unit.risks.length };
}
async function loadHours(ctx, inputs, unit) {
  if (!unit?.risksCompletedAt) throw new Fase1Error("BLOQUEADO", "horas requiere riesgos y aprobaciones confirmados");
  const f2 = loadF2Maps(ctx.config.f2StateDir); const engagementRows = ctx.journal.units["client-engagements"]?.result?.engagements; if (!Array.isArray(engagementRows) || engagementRows.length !== 124) throw new Fase1Error("BLOQUEADO", "horas requiere el mapa confirmado de encargos cliente"); const engagements = new Map(engagementRows.map((row) => [row.sourceKey, row.engagementId])); const [catalog, staffCatalog, holidayCatalog] = await Promise.all([ctx.db.matrixCatalog(), ctx.db.engagementCatalog(), ctx.db.holidayCatalog()]); const activities = new Map(catalog.activities.map((row) => [row.code, row.id]));
  const officeByStaffId = new Map((staffCatalog.staff ?? []).map((row) => [row.id, ({ "La Paz": 1, "Santa Cruz": 2 })[String(row.city ?? "").trim()]])); const holidaysByDate = new Map();
  for (const holiday of holidayCatalog.holidays ?? []) { const date = String(holiday.date).slice(0, 10); holidaysByDate.set(date, [...(holidaysByDate.get(date) ?? []), Number(holiday.office)]); }
  // Decisión del operador (03/11/2026): las horas trabajadas en feriado aplicable SE CARGAN. El legacy permitía trabajar esos días;
  // el trigger enforce_holiday_blocking las admite solo en este INSERT histórico (createHours fija la marca). Se registran como evidencia.
  const included = []; const holidayKept = [];
  for (const row of inputs.executions.filter(isMigrableExecution)) { const staffId = f2.staff[`legacy:${row.legacy_profile_id}`]; const workedDate = String(row.legacy_worked_at).slice(0, 10); const offices = holidaysByDate.get(workedDate) ?? []; if (offices.includes(0) || (staffId && offices.includes(officeByStaffId.get(staffId)))) holidayKept.push(row); included.push(row); }
  const blueprint = consolidateResolvedHours(consolidateExecutions(included).map((row) => ({ sourceKey: `${row.legacy_execution_id}:${row.activity_code}:${row.split_index}`, timeId: randomUUID(), dateWorked: row.date_worked, hours: row.hours, staffId: f2.staff[`legacy:${row.legacy_profile_id}`], engagementId: engagements.get(row.legacy_cot), activityId: activities.get(row.activity_code), periodId: null, isForecast: false, sourceAllocations: row.source_allocations })));
  if (!blueprint.length || blueprint.some((row) => !row.staffId || !row.engagementId || !row.activityId || decimalUnits(row.hours) > 9999n)) throw new Fase1Error("BLOQUEADO", "horas: cruce o límite diario inválido");
  const hash = sha256(stable(blueprint.map(({ timeId, ...row }) => row))); let hours = unit.hours;
  const holidayKeptEvidence = { rule: "horas en feriado aplicable por oficina del staff: se cargan como carga histórica exceptuada", sourceRows: holidayKept.length, sourceHours: formatMoney(holidayKept.reduce((sum, row) => sum + decimalUnits(row.legacy_hours), 0n)), dates: [...new Set(holidayKept.map((row) => String(row.legacy_worked_at).slice(0, 10)))].sort() };
  if (unit.hourHash && unit.hourHash !== hash) {
    const previous = await ctx.db.hourSnapshot({ entries: hours });
    if (previous.entries?.length) throw new Fase1Error("RECONCILIACION_REQUERIDA", "horas: el intento previo tiene efectos y cambió el conjunto permitido");
    const priorIds = new Map(hours.map((row) => [row.sourceKey, row.timeId]));
    const preservesAllIds = blueprint.every((row) => priorIds.has(row.sourceKey));
    hours = blueprint.map((row) => ({ ...row, timeId: preservesAllIds ? priorIds.get(row.sourceKey) : randomUUID() }));
    Object.assign(unit, { hours, hourHash: hash, hourHolidayKept: holidayKeptEvidence, hourHolidayRepairAt: new Date().toISOString(), ...(preservesAllIds ? {} : { hourIdentityRepairAt: new Date().toISOString() }) });
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": unit } });
  }
  if (!hours) { hours = blueprint; Object.assign(unit, { hourHash: hash, hours, hourHolidayKept: holidayKeptEvidence, hoursIntendedAt: new Date().toISOString() }); checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": unit } }); }
  const snapshot = await ctx.db.hourSnapshot({ entries: hours }); const actual = new Map((snapshot.entries ?? []).map((row) => [row.timeId, row]));
  const exact = hours.every((row) => { const a = actual.get(row.timeId); return a && a.dateWorked === row.dateWorked && decimalEqual(a.hours, row.hours) && a.staffId === row.staffId && a.engagementId === row.engagementId && a.activityId === row.activityId && Number(a.etlSplitIndex) === Number(row.etlSplitIndex) && a.periodId == null && a.isForecast === false; });
  if (exact) return { recovered: true, entries: hours.length, hours: hours.reduce((sum, row) => sum + decimalUnits(row.hours), 0n).toString() };
  if (actual.size) throw new Fase1Error("RECONCILIACION_REQUERIDA", "horas: recuperación parcial o divergente");
  const created = await ctx.db.createHours({ technicalAdminId: ctx.config.technicalAdminId, entries: hours }); const after = await ctx.db.hourSnapshot({ entries: hours });
  if (Number(created?.inserted) !== hours.length || after.entries?.length !== hours.length) throw new Fase1Error("RECONCILIACION_REQUERIDA", "horas: escritura no conciliable");
  return { recovered: false, entries: hours.length, hours: hours.reduce((sum, row) => sum + decimalUnits(row.hours), 0n).toString() };
}
async function containOwnEmails(ctx, unit) {
  const client = ctx.journal.units["client-engagements"]?.result?.engagements ?? []; const administrative = ctx.journal.units["administrative-engagements"]?.result?.engagements ?? [];
  const engagementIds = [...client, ...administrative].map((row) => row.engagementId).sort();
  if (engagementIds.length !== 134 || new Set(engagementIds).size !== 134) throw new Fase1Error("BLOQUEADO", "contención de correos: mapa de encargos F3 incompleto");
  const result = await ctx.db.containOwnEmails({ engagementIds });
  if (Number(result.remaining) !== 0 || Number(result.sent) !== 0) throw new Fase1Error("RECONCILIACION_REQUERIDA", "contención de correos F3 no conciliable");
  checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, emailContainmentResult: result, emailsContainedAt: new Date().toISOString() } } });
  return result;
}
async function loadEngagementBlock(ctx, block, prepared, unit) {
  const engagements = engagementPayloadsFor(block, prepared); const sourceKeys = engagements.map((row) => row.sourceKey);
  const expectedHash = sha256(stable(engagements));
  const recheck = async () => normalizeEngagementMatches(await ctx.db.findEngagementMatches({ technicalAdminId: ctx.config.technicalAdminId, engagements }), sourceKeys);
  if (unit && unit.expectedHash !== expectedHash) throw new Fase1Error("BLOQUEADO", `${block}: cambió el payload respecto de la intención durable`);
  if (unit?.state === "CONFIRMADA") {
    const found = requireAllEngagements(await recheck(), block);
    return { recovered: true, engagements: found };
  }
  if (!unit) {
    const before = await recheck();
    if (before.found.length || before.ambiguous.length) throw new Fase1Error("RECONCILIACION_REQUERIDA", `${block}: el destino ya contiene candidatos antes de la intención durable`);
    unit = { id: randomUUID(), state: "INTENCION_DURABLE", inputHash: sha256(stable(prepared.inputs.fingerprints)), expectedHash, sourceKeys, intendedAt: new Date().toISOString() };
    checkpoint(ctx, { units: { ...ctx.journal.units, [block]: unit } });
  } else {
    const before = await recheck();
    if (before.ambiguous.length || (before.found.length && before.missing.length)) {
      throw new Fase1Error("RECONCILIACION_REQUERIDA", `${block}: recuperación ambigua (${before.found.length} encontrados, ${before.missing.length} ausentes)`);
    }
    if (!before.missing.length) return { recovered: true, engagements: before.found };
  }
  const created = await ctx.db.createEngagements({ technicalAdminId: ctx.config.technicalAdminId, engagements });
  const found = requireAllEngagements(await recheck(), block);
  const bySource = new Map((created ?? []).map((row) => [row.sourceKey, row]));
  if (found.some((row) => bySource.get(row.sourceKey)?.engagementId !== row.engagementId || bySource.get(row.sourceKey)?.engagementCode !== row.engagementCode)) {
    throw new Fase1Error("RECONCILIACION_REQUERIDA", `${block}: la respuesta de creación no coincide con la relectura`);
  }
  return { recovered: false, engagements: found };
}
// Cada comando que escribe el journal toma el bloqueo de instalación durante toda su ejecución (como F1 y F2): dos
// `load` simultáneos podrían ver ambos «sin encargos», reservar intenciones distintas y crear dos lotes.
const LOCKED_COMMANDS = ["preflight", "load", "verify", "accept", "reconcile"];
export function lockInstallation(ctx, command) {
  if (!LOCKED_COMMANDS.includes(command)) return () => {};
  const unlock = acquireLock(ctx.stateDir, ctx.config.installationId, { prefix: "fase3" });
  const onSignal = () => { unlock(); process.exit(1); };
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  return () => { process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal); unlock(); };
}
export async function load(ctx, block, operation = "create") {
  if (!BLOCKS.includes(block)) bad("bloque F3 inválido"); const prior = previousBlock(block); if (prior && !ctx.journal.blocks[prior]?.acceptedAt) throw new Fase1Error("BLOQUEADO", `falta acta aceptada de ${prior}`);
  if (operation === "sync-work-orders") {
    if (block !== "work-orders") bad("sync-work-orders sólo admite el bloque work-orders");
    const unit = ctx.journal.units["work-orders"]; const result = await syncWorkOrders(ctx, unit);
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, syncResult: result, syncCompletedAt: new Date().toISOString() } } });
    return result;
  }
  if (operation === "expenses") {
    if (block !== "work-orders") bad("expenses sólo admite el bloque work-orders");
    const validated = await validate(ctx); const unit = ctx.journal.units["work-orders"];
    const result = await loadExpenses(ctx, await prepareExpenseBlueprint(ctx, validated.inputs), unit);
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, expenseResult: result, expensesCompletedAt: new Date().toISOString() } } });
    return result;
  }
  if (operation === "payments") {
    if (block !== "work-orders") bad("payments sólo admite el bloque work-orders");
    const validated = await validate(ctx); const unit = ctx.journal.units["work-orders"];
    const result = await loadPayments(ctx, await preparePaymentBlueprint(ctx, validated.inputs), unit);
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, paymentResult: result, paymentsCompletedAt: new Date().toISOString() } } });
    return result;
  }
  if (operation === "risks") {
    if (block !== "work-orders") bad("risks sólo admite el bloque work-orders");
    const validated = await validate(ctx); const unit = ctx.journal.units["work-orders"]; const result = await loadRisks(ctx, validated.inputs, unit);
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, riskResult: result, risksCompletedAt: new Date().toISOString() } } }); return result;
  }
  if (operation === "hours") {
    if (block !== "hours") bad("hours sólo admite el bloque hours"); const validated = await validate(ctx); const unit = ctx.journal.units["work-orders"]; const result = await loadHours(ctx, validated.inputs, unit);
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...unit, hourResult: result, hoursCompletedAt: new Date().toISOString() }, hours: { state: "CONFIRMADA", result, confirmedAt: new Date().toISOString() } } }); return result;
  }
  if (operation === "contain-emails") {
    if (block !== "work-orders") bad("contain-emails sólo admite el bloque work-orders");
    return containOwnEmails(ctx, ctx.journal.units["work-orders"]);
  }
  if (operation !== "create") bad(`operación F3 inválida: ${operation}`);
  if (block === "hours") bad("el bloque hours se carga con --operation hours: la operación create no inserta horas");
  const validated = ctx.inputs ? { inputs: ctx.inputs, matrix: buildMatrixArtifacts({ engagements: ctx.inputs.clientEngagements, planRows: ctx.inputs.planHours }) } : await validate(ctx);
  const prepared = { ...validated, engagementPayloads: await prepareEngagementPayloads(ctx, validated.inputs) };
  const unit = ctx.journal.units[block];
  if (engagementPayloadsFor(block, prepared)) {
    const result = await loadEngagementBlock(ctx, block, prepared, unit);
    checkpoint(ctx, { units: { ...ctx.journal.units, [block]: { ...(ctx.journal.units[block] ?? unit), state: "CONFIRMADA", result, confirmedAt: new Date().toISOString() } } });
    return result;
  }
  if (block === "matrices") {
    const result = await loadMatrices(ctx, await prepareMatrixBlueprint(ctx, prepared.matrix), unit);
    checkpoint(ctx, { units: { ...ctx.journal.units, matrices: { ...(ctx.journal.units.matrices ?? unit), state: "CONFIRMADA", result, confirmedAt: new Date().toISOString() } } });
    return result;
  }
  if (block === "work-orders") {
    const result = await loadWorkOrders(ctx, await prepareWorkOrderBlueprint(ctx, validated.inputs), unit);
    checkpoint(ctx, { units: { ...ctx.journal.units, "work-orders": { ...(ctx.journal.units["work-orders"] ?? unit), state: "CONFIRMADA", result, confirmedAt: new Date().toISOString() } } });
    return result;
  }
  // Todo bloque tiene su cargador arriba; este camino ya no puede marcar un bloque como confirmado sin escribir nada.
  bad(`bloque sin cargador: ${block}`);
}
export async function verify(ctx, block) { if (block && !ctx.journal.units[block]?.state?.startsWith("CONFIRMADA")) throw new Fase1Error("BLOQUEADO", `bloque no confirmado: ${block}`); const inventory = await ctx.db.inventory(); const state = block === "hours" ? "HORAS_VERIFICADAS" : ctx.journal.state; requireState(ctx, state); checkpoint(ctx, { inventoryAfter: inventory }); return { ok: true, inventory }; }
export function reconcile(ctx, resolution) { if (!resolution || !resolution.identity || !resolution.justification || !resolution.evidenceHash) throw new Fase1Error("BLOQUEADO", "resolución manual insuficiente"); checkpoint(ctx, { resolutions: [...(ctx.journal.resolutions ?? []), { ...resolution, reconciledAt: new Date().toISOString() }] }); return { ok: true }; }
export function report(ctx) { const report = { installationId: ctx.journal.installationId, state: ctx.journal.state, R1: ctx.journal.evidence?.R1, R2: ctx.journal.resolutions ?? [], R3: ctx.journal.evidence?.R3, R4: { ...ctx.journal.evidence?.R4, bobDefaultExchangeRate: { plans: ctx.journal.units?.["work-orders"]?.paymentResult?.bobDefaultPlans ?? null, rates: ctx.journal.units?.["work-orders"]?.paymentResult?.bobDefaultRates ?? null, nature: "DEFAULT efectivo del esquema (P-02), no TC legacy" } }, R5: ctx.journal.inventoryAfter ?? "PENDIENTE", R6: { environment: ctx.config.environment, projectRef: ctx.config.expectedProjectRef, configHash: ctx.journal.configHash } }; const file = path.join(ctx.stateDir, `fase3-${ctx.config.installationId}.report.json`); writeJson(file, report); return { ok: true, file, report }; }
// Fase 4 §7 (L1–L8): concilia lo cargado contra los CSV legacy. Solo lectura; escribe únicamente el reporte externo
// (conteos y sumas, sin PII). Cualquier diferencia termina en BLOQUEADO: no se corrige a mano ni se cambia una regla para cuadrar.
export async function reconcileLegacy(ctx) {
  const inputs = validateInputs(inputsFor(ctx.config), { enforceExpected: true }); const f2 = loadF2Maps(ctx.config.f2StateDir); const units = ctx.journal.units ?? {};
  const clients = units["client-engagements"]?.result?.engagements; const admins = units["administrative-engagements"]?.result?.engagements; const matrices = units.matrices?.matrices; const workOrders = units["work-orders"]?.workOrders;
  if (![[clients, 124], [admins, 10], [matrices, 124], [workOrders, 124]].every(([rows, size]) => Array.isArray(rows) && rows.length === size)) throw new Fase1Error("BLOQUEADO", "conciliación legacy requiere encargos, matrices y OTs confirmados en el journal");
  const staffByLegacyProfile = new Map(Object.entries(f2.staff).filter(([key]) => key.startsWith("legacy:")).map(([key, id]) => [key.slice("legacy:".length), id]));
  const staffCatalog = await ctx.db.engagementCatalog(); const officeByStaffId = new Map((staffCatalog.staff ?? []).map((row) => [row.id, ({ "La Paz": 1, "Santa Cruz": 2 })[String(row.city ?? "").trim()]]));
  const holidaysByDate = new Map(); for (const holiday of (await ctx.db.holidayCatalog()).holidays ?? []) { const date = String(holiday.date).slice(0, 10); holidaysByDate.set(date, [...(holidaysByDate.get(date) ?? []), Number(holiday.office)]); }
  const expected = legacyExpectations({ inputs, staffByLegacyProfile, officeByStaffId, holidaysByDate });
  const actual = await ctx.db.legacySnapshot({ engagementIds: clients.map((row) => row.engagementId), adminEngagementIds: admins.map((row) => row.engagementId), worksheetIds: matrices.map((row) => row.worksheetId), woIds: workOrders.map((row) => row.woId) });
  actual.cotByWo = Object.fromEntries(workOrders.map((row) => [row.woId, row.sourceKey])); actual.cotByEngagement = Object.fromEntries(clients.map((row) => [row.engagementId, row.sourceKey]));
  const result = compareLegacyControls(expected, actual);
  const file = path.join(ctx.stateDir, `fase3-${ctx.config.installationId}.legacy-reconciliation.json`);
  writeJson(file, { installationId: ctx.config.installationId, environment: ctx.config.environment, projectRef: ctx.config.expectedProjectRef, generatedAt: new Date().toISOString(), inputs: inputs.fingerprints, ok: result.ok, controls: result.rows });
  for (const row of result.rows) console.log(`${row.ok ? "OK  " : "DIFF"} ${row.id} ${row.label}: esperado=${row.expected} real=${row.actual}${row.note ? ` (${row.note})` : ""}`);
  if (!result.ok) throw new Fase1Error("BLOQUEADO", `conciliación legacy con diferencias (${result.rows.filter((row) => !row.ok).map((row) => row.id).join(", ")}); ver ${file}`);
  return { ok: true, file, controls: result.rows.length };
}
// L9 (Fase 4 §7): huella por clave natural de lo cargado, para comparar ambientes. Solo lectura; escribe el archivo
// fase3-<installationId>.fingerprint.json en el directorio de estado (sin datos personales: claves y hashes).
export async function fingerprintCommand(ctx) {
  const units = ctx.journal.units ?? {};
  const client = units["client-engagements"]?.result?.engagements; const administrative = units["administrative-engagements"]?.result?.engagements;
  if (!Array.isArray(client) || client.length !== 124 || !Array.isArray(administrative) || administrative.length !== 10) throw new Fase1Error("BLOQUEADO", "huella L9 requiere los 134 encargos confirmados en el journal");
  const engagements = [...client.map((row) => ({ sourceKey: row.sourceKey, engagementId: row.engagementId, kind: "client" })), ...administrative.map((row) => ({ sourceKey: row.sourceKey, engagementId: row.engagementId, kind: "administrative" }))];
  const snapshot = await ctx.db.fingerprintSnapshot({ engagements });
  const fingerprint = buildFingerprint({ environment: ctx.config.environment, projectRef: ctx.config.expectedProjectRef, installationId: ctx.config.installationId, snapshot });
  const file = path.join(ctx.stateDir, `fase3-${ctx.config.installationId}.fingerprint.json`); writeJson(file, fingerprint);
  for (const [name, set] of Object.entries(fingerprint.sets)) console.log(`${name.padEnd(15)} ${String(set.count).padStart(6)} claves  sha256=${set.sha256.slice(0, 16)}…`);
  console.log(`huella escrita en ${file}`);
  return { ok: true, file, sets: Object.fromEntries(Object.entries(fingerprint.sets).map(([name, set]) => [name, { count: set.count, sha256: set.sha256 }])) };
}
// L9: compara dos huellas (por ejemplo Test frente al ensayo local). Offline; exit 0 si son idénticas, 2 si no.
export function compareFingerprintFiles({ a, b }) {
  if (!a || !b) bad("uso: fase3 compare-fingerprints --a <huella> --b <huella>");
  const result = compareFingerprints(readJson(a), readJson(b));
  console.log(`A: ${result.a.environment}/${result.a.installationId}   B: ${result.b.environment}/${result.b.installationId}`);
  for (const row of result.rows) {
    console.log(`${row.ok ? "OK  " : "DIFF"} ${row.name.padEnd(15)} A=${row.countA} B=${row.countB}${row.note ? ` (${row.note})` : ""}`);
    if (!row.ok) { if (row.totals) console.log(`       faltan en B: ${row.totals.missingInB} · faltan en A: ${row.totals.missingInA} · distintas: ${row.totals.changed}`); for (const key of row.changed) console.log(`       distinta: ${key}`); for (const key of row.missingInB) console.log(`       solo en A: ${key}`); for (const key of row.missingInA) console.log(`       solo en B: ${key}`); }
  }
  if (!result.ok) { console.error("ERROR [BLOQUEADO]: las huellas difieren; cada diferencia se explica o se corrige, no se acepta por defecto"); return 2; }
  console.log("PASS — huellas idénticas"); return 0;
}
export function rollbackPlan(ctx) { return { ok: true, eligible: Object.entries(ctx.journal.units).filter(([, unit]) => unit.state === "CONFIRMADA").map(([block, unit]) => ({ block, unitId: unit.id, action: "revisión manual; no borrar automáticamente" })) }; }
function args(argv) { const [command, ...tail] = argv; const flags = {}; for (let i = 0; i < tail.length; i += 1) { if (tail[i] === "--config") flags.config = tail[++i]; else if (tail[i] === "--block") flags.block = tail[++i]; else if (tail[i] === "--resolution") flags.resolution = tail[++i]; else if (tail[i] === "--evidence-hash") flags.evidenceHash = tail[++i]; else if (tail[i] === "--operation") flags.operation = tail[++i]; else if (tail[i] === "--a") flags.a = tail[++i]; else if (tail[i] === "--b") flags.b = tail[++i]; else bad(`argumento desconocido: ${tail[i]}`); } return { command, ...flags }; }
export async function main(argv = process.argv.slice(2), env = process.env) { try { const parsed = args(argv); if (parsed.command === "compare-fingerprints") return compareFingerprintFiles(parsed); if (!parsed.config || !["validate", "preflight", "load", "verify", "accept", "report", "rollback-plan", "reconcile", "reconcile-legacy", "fingerprint"].includes(parsed.command)) bad("uso: fase3 <validate|preflight|load|verify|accept|report|rollback-plan|reconcile|reconcile-legacy|fingerprint> --config <archivo>  |  fase3 compare-fingerprints --a <huella> --b <huella>"); const ctx = createContext({ config: parseConfig(readJson(parsed.config)), env, stateDir: resolveStateDir(env) }); if (["preflight", "load", "verify", "reconcile", "reconcile-legacy", "fingerprint"].includes(parsed.command)) assertTarget(ctx.config, env); const release = lockInstallation(ctx, parsed.command); try { if (parsed.command === "validate") await validate(ctx); else if (parsed.command === "reconcile-legacy") await reconcileLegacy(ctx); else if (parsed.command === "fingerprint") await fingerprintCommand(ctx); else if (parsed.command === "preflight") await preflight(ctx); else if (parsed.command === "load") await load(ctx, parsed.block, parsed.operation); else if (parsed.command === "verify") await verify(ctx, parsed.block); else if (parsed.command === "accept") acceptBlock(ctx, parsed.block, parsed.evidenceHash); else if (parsed.command === "report") report(ctx); else if (parsed.command === "rollback-plan") rollbackPlan(ctx); else reconcile(ctx, readJson(parsed.resolution)); } finally { release(); } return 0; } catch (error) { console.error(`ERROR [${error.code ?? "ERROR"}]: ${error.message}`); return error.code === "BLOQUEADO" ? 2 : 1; } }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
