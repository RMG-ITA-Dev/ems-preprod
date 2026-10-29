// Lógica pura para la consola ETL fase 2. No abre conexiones ni interpreta números
// identificadores: las claves de legacy, NIT, CI y códigos se mantienen como texto.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const HEADERS = Object.freeze({
  clients: ["source_ref", "client_legal_name", "operating_name", "tax_id", "client_type", "parent_ref", "parent_relationship", "client_origin", "billing_tax_treatment", "industry_ref", "address", "is_active", "note"],
  contacts: ["client_source_ref", "contact_type", "full_name", "email", "phone", "is_active", "source_cot", "source_created_at"],
  staff: ["staff_source_ref", "legacy_profile_ids", "legacy_user_codes", "first_name", "last_name", "id_number", "email", "short_name", "initials", "hire_date", "termination_date", "city", "practica_abbreviation", "category_name", "society_name", "is_active", "is_schedulable", "is_blocked", "source_note"],
  users: ["staff_source_ref", "email", "expected_role_key", "expected_legacy_role", "email_confirm", "password_strategy", "activation_method", "source_note"],
  rates: ["practica_abbreviation", "category_name", "rate_high_usd", "rate_low_usd", "rate_high_bob", "rate_low_bob", "source_rule"],
  services: ["legacy_service_id", "ems_service_name", "equivalence_basis"],
});

export const EXPECTED = Object.freeze({ clients: 268, contacts: 111, staff: 138, users: 138, rates: 15, services: 46, activeStaff: 130, inactiveStaff: 8, schedulableStaff: 136 });
export const EXCLUDED_CLIENT_REFS = Object.freeze(["legacy:1", "legacy:2", "legacy:3", "legacy:65", "legacy:199"]);
export const REQUIRED_CLIENT_REFS = Object.freeze(["legacy:89", "NEW-CAINCO", "NEW-AEV", "NEW-RP", "NEW-RJ"]);
const CLIENT_TYPES = new Set(["entidad", "sucursal", "proyecto", "fideicomiso"]);
const PARENT_RELATIONSHIPS = new Set(["proyecto_de", "sucursal_de", "administrado_por"]);

export class Fase2InputError extends Error {
  constructor(message, code = "BLOQUEADO") { super(message); this.name = "Fase2InputError"; this.code = code; }
}

export const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();
export const rowSourceHash = (row) => createHash("sha256").update(JSON.stringify(Object.keys(row).sort().map((key) => [key, row[key]]))).digest("hex");
export const sha256File = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

function bool(value, label) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Fase2InputError(`${label} debe ser true o false`);
}

/** Parser RFC 4180 pequeño: soporta BOM, CRLF, comillas y saltos dentro de una celda. */
export function parseCsv(text, expectedHeaders, label = "CSV") {
  const source = String(text).replace(/^\uFEFF/, "");
  const rows = []; let row = []; let field = ""; let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') {
      if (field) throw new Fase2InputError(`${label}: comilla no válida`);
      quoted = true;
    } else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (quoted) throw new Fase2InputError(`${label}: comilla sin cierre`);
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  if (!rows.length) throw new Fase2InputError(`${label}: vacío`);
  const headers = rows.shift();
  if (headers.length !== expectedHeaders.length || headers.some((header, index) => header !== expectedHeaders[index]) || new Set(headers).size !== headers.length) {
    throw new Fase2InputError(`${label}: encabezados distintos de los aprobados`);
  }
  return rows.filter((r) => r.some((cell) => cell !== "")).map((values, index) => {
    if (values.length !== headers.length) throw new Fase2InputError(`${label}: fila ${index + 2} tiene ${values.length} columnas, se esperaban ${headers.length}`);
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

export function detectCycles(clients) {
  const byRef = new Map(clients.map((row) => [row.source_ref, row]));
  const visiting = new Set(); const visited = new Set();
  const visit = (ref, trail = []) => {
    if (visited.has(ref)) return;
    if (visiting.has(ref)) throw new Fase2InputError(`clientes: ciclo detectado ${[...trail, ref].join(" -> ")}`);
    visiting.add(ref);
    const parent = byRef.get(ref)?.parent_ref;
    if (parent) visit(parent, [...trail, ref]);
    visiting.delete(ref); visited.add(ref);
  };
  for (const ref of byRef.keys()) visit(ref);
}

export function topoOrder(clients) {
  const byRef = new Map(clients.map((row) => [row.source_ref, row]));
  const order = []; const done = new Set();
  const visit = (row) => {
    if (done.has(row.source_ref)) return;
    if (row.parent_ref) visit(byRef.get(row.parent_ref));
    done.add(row.source_ref); order.push(row);
  };
  detectCycles(clients);
  for (const row of clients) visit(row);
  return order;
}

export function validateClients(rows, { expected = EXPECTED, enforceExpected = true } = {}) {
  const refs = new Set();
  for (const row of rows) {
    if (!row.source_ref || refs.has(row.source_ref)) throw new Fase2InputError("clientes: source_ref vacío o repetido");
    refs.add(row.source_ref);
    if (EXCLUDED_CLIENT_REFS.includes(row.source_ref)) throw new Fase2InputError(`clientes: referencia excluida ${row.source_ref}`);
    bool(row.is_active, `clientes ${row.source_ref}.is_active`);
    if (row.parent_ref === row.source_ref) throw new Fase2InputError(`clientes: autopadre ${row.source_ref}`);
    if (row.parent_ref && !refs.has(row.parent_ref) && !rows.some((candidate) => candidate.source_ref === row.parent_ref)) throw new Fase2InputError(`clientes: padre inexistente ${row.parent_ref}`);
    if (Boolean(row.parent_ref) !== Boolean(row.parent_relationship)) throw new Fase2InputError(`clientes: parent_ref y parent_relationship deben aparecer juntos (${row.source_ref})`);
    if (!row.client_legal_name || !row.tax_id || !row.client_type || !row.client_origin || !row.billing_tax_treatment) throw new Fase2InputError(`clientes: atributos obligatorios incompletos (${row.source_ref})`);
    if (!CLIENT_TYPES.has(row.client_type) || (row.parent_relationship && !PARENT_RELATIONSHIPS.has(row.parent_relationship)) || (row.client_type === "fideicomiso" && row.parent_relationship === "sucursal_de")) throw new Fase2InputError(`clientes: tipo o relación no permitidos (${row.source_ref})`);
  }
  for (const ref of REQUIRED_CLIENT_REFS) if (!refs.has(ref)) throw new Fase2InputError(`clientes: falta ${ref}`);
  if (enforceExpected && rows.length !== expected.clients) throw new Fase2InputError(`clientes: se esperaban ${expected.clients}, llegaron ${rows.length}`);
  return topoOrder(rows);
}

export function validateContacts(rows, clients, { expected = EXPECTED, enforceExpected = true } = {}) {
  const refs = new Set(clients.map((row) => row.source_ref)); const found = new Set();
  for (const row of rows) {
    if (!refs.has(row.client_source_ref)) throw new Fase2InputError(`contactos: cliente huérfano ${row.client_source_ref}`);
    if (found.has(row.client_source_ref)) throw new Fase2InputError(`contactos: duplicado ${row.client_source_ref}`);
    found.add(row.client_source_ref);
    if (row.contact_type !== "general" || !row.full_name || !row.email || !row.phone || bool(row.is_active, `contactos ${row.client_source_ref}.is_active`) !== true) throw new Fase2InputError(`contactos: fila inválida para ${row.client_source_ref}`);
  }
  if (enforceExpected && rows.length !== expected.contacts) throw new Fase2InputError(`contactos: se esperaban ${expected.contacts}, llegaron ${rows.length}`);
  return rows;
}

function validDate(value) { return !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))); }

export function validateStaff(rows, { expected = EXPECTED, enforceExpected = true } = {}) {
  const refs = new Set(); const emails = new Set(); const ids = new Set(); let active = 0; let inactive = 0; let schedulable = 0;
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (!row.staff_source_ref || refs.has(row.staff_source_ref) || !row.legacy_profile_ids) throw new Fase2InputError("staff: referencia o perfil repetido/vacío");
    if (row.legacy_profile_ids.split(",").map((x) => x.trim()).includes("89")) throw new Fase2InputError("staff: perfil 89 fuera de alcance");
    refs.add(row.staff_source_ref);
    if (emails.has(email) || ids.has(row.id_number)) throw new Fase2InputError(`staff: correo o CI duplicado (${row.staff_source_ref})`);
    emails.add(email); ids.add(row.id_number);
    const isActive = bool(row.is_active, `staff ${row.staff_source_ref}.is_active`);
    const isSchedulable = bool(row.is_schedulable, `staff ${row.staff_source_ref}.is_schedulable`);
    if (bool(row.is_blocked, `staff ${row.staff_source_ref}.is_blocked`)) throw new Fase2InputError("staff: is_blocked debe ser false");
    if (!validDate(row.hire_date) || !validDate(row.termination_date) || (row.termination_date && row.termination_date < row.hire_date)) throw new Fase2InputError(`staff: fechas inválidas ${row.staff_source_ref}`);
    if (!isActive && !row.termination_date) throw new Fase2InputError(`staff: inactivo sin baja ${row.staff_source_ref}`);
    active += isActive ? 1 : 0; inactive += isActive ? 0 : 1; schedulable += isSchedulable ? 1 : 0;
  }
  if (![...rows].some((row) => row.legacy_profile_ids.split(",").map((x) => x.trim()).includes("62"))) throw new Fase2InputError("staff: falta perfil 62");
  if (enforceExpected && (rows.length !== expected.staff || active !== expected.activeStaff || inactive !== expected.inactiveStaff || schedulable !== expected.schedulableStaff)) throw new Fase2InputError("staff: conteos aprobados no coinciden");
  return rows;
}

export function validateUsers(rows, staff, { expected = EXPECTED, allowedDomain = "ruizmier.com", enforceExpected = true } = {}) {
  const staffByRef = new Map(staff.map((row) => [row.staff_source_ref, row])); const seen = new Set();
  for (const row of rows) {
    const staffRow = staffByRef.get(row.staff_source_ref); const email = normalizeEmail(row.email);
    if (!staffRow || seen.has(row.staff_source_ref) || email !== normalizeEmail(staffRow.email)) throw new Fase2InputError(`usuarios: correspondencia inválida ${row.staff_source_ref}`);
    if (!email.endsWith(`@${allowedDomain}`) || row.expected_role_key === "admin" || !row.expected_role_key || !row.expected_legacy_role || row.email_confirm !== "true" || row.password_strategy !== "random_ephemeral" || row.activation_method !== "password_reset_after_production") throw new Fase2InputError(`usuarios: atributos inválidos ${row.staff_source_ref}`);
    seen.add(row.staff_source_ref);
  }
  if (seen.size !== staffByRef.size || (enforceExpected && rows.length !== expected.users)) throw new Fase2InputError("usuarios: cobertura o conteo inválido");
  return rows;
}

export function resolveIndustryRef(ref, industries) {
  const source = String(ref ?? "").trim();
  const numbered = source.match(/^(\d+)\s*:\s*(.+)$/);
  const key = source === "28" || numbered?.[1] === "28" ? "Misceláneo" : numbered?.[2] ?? source;
  const matches = industries.filter((industry) => industry.industry_ref === key || industry.industry_name === key || String(industry.legacy_ref ?? "") === key);
  if (matches.length !== 1) throw new Fase2InputError(`industria: referencia no resuelta o ambigua ${ref}`);
  return matches[0];
}

export function loadInputs(inputs, options = {}) {
  const names = ["clients", "contacts", "staff", "users", "rates", "services"];
  for (const name of names) if (!inputs?.[name]) throw new Fase2InputError(`falta ruta de ${name}`);
  const parsed = Object.fromEntries(names.map((name) => [name, parseCsv(readFileSync(inputs[name], "utf8"), HEADERS[name], name)]));
  const clients = validateClients(parsed.clients, options); validateContacts(parsed.contacts, clients, options); validateStaff(parsed.staff, options); validateUsers(parsed.users, parsed.staff, options);
  return { ...parsed, clients, fingerprints: Object.fromEntries(names.map((name) => [name, { sha256: sha256File(inputs[name]), rows: parsed[name].length }])) };
}
