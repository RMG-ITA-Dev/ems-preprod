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

// Un control sin declarar (null/undefined) en el manifiesto no se aplica aquí: parseConfig ya bloquea los null fuera de local.
const off = (expected, actual) => expected !== null && expected !== undefined && expected !== actual;
// Valores del snapshot 23/10 (regresión y pruebas); la fuente de verdad por snapshot es scripts/etl/snapshots/<base>.json.
export const EXPECTED = Object.freeze({ clients: 268, contacts: 111, staff: 153, users: 153, rates: 15, services: 46, activeStaff: 145, inactiveStaff: 8, schedulableStaff: 145 });
export const EXCLUDED_CLIENT_REFS = Object.freeze(["legacy:1", "legacy:2", "legacy:3", "legacy:65", "legacy:199"]);
export const REQUIRED_CLIENT_REFS = Object.freeze(["legacy:89", "NEW-CAINCO", "NEW-AEV", "NEW-RP", "NEW-RJ"]);
const CLIENT_TYPES = new Set(["entidad", "sucursal", "proyecto", "fideicomiso"]);
const PARENT_RELATIONSHIPS = new Set(["proyecto_de", "sucursal_de", "administrado_por"]);

export const APPROVED_ROLE_OVERRIDES = Object.freeze({
  "legacy:3": Object.freeze({ roleKey: "collections_analyst", legacyRole: "senior", categoryName: "Asistente" }),
  "legacy:4": Object.freeze({ roleKey: "it_security_manager", legacyRole: "manager", categoryName: "Gerente" }),
  "legacy:7": Object.freeze({ roleKey: "accounting_analyst", legacyRole: "senior", categoryName: "Asistente" }),
  "legacy:9": Object.freeze({ roleKey: "accounting_manager", legacyRole: "manager", categoryName: "Gerente" }),
  "legacy:16": Object.freeze({ roleKey: "risk_partner", legacyRole: "partner", categoryName: "Socio" }),
  "legacy:94": Object.freeze({ roleKey: "hr_manager", legacyRole: "manager", categoryName: "Gerente" }),
  "legacy:112": Object.freeze({ roleKey: "risk_supervisor", legacyRole: "manager", categoryName: "Asistente" }),
  "legacy:176": Object.freeze({ roleKey: "hr_analyst", legacyRole: "senior", categoryName: "Asistente" }),
  "legacy:270": Object.freeze({ roleKey: "hr_analyst", legacyRole: "senior", categoryName: "Asistente" }),
});

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
// Doble codificación UTF-8 (UTF-8 leído como Windows-1252): «Ã‘», «Ã©», «Â°». Un archivo así se rechaza completo:
// se cargaría tal cual en nombres y notas (hallazgo del 03/11/2026 en 02_clientes.csv).
const DOUBLE_ENCODED = /[ÃÂ][\u0080-¿‘’‚“”…†‡ˆ‰Š‹ŒŽ•–—˜™š›œžŸ]/;

export function parseCsv(text, expectedHeaders, label = "CSV") {
  const encodingLines = String(text).split("\n").map((line, index) => (DOUBLE_ENCODED.test(line) ? index + 1 : 0)).filter(Boolean);
  if (encodingLines.length) throw new Fase2InputError(`${label}: texto con doble codificación UTF-8 en ${encodingLines.length} línea(s) (primera: ${encodingLines[0]}); regenere el archivo desde el origen en UTF-8`);
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
  if (enforceExpected && off(expected.clients, rows.length)) throw new Fase2InputError(`clientes: se esperaban ${expected.clients}, llegaron ${rows.length}`);
  return topoOrder(rows);
}

// Nombre del contacto «línea corporativa» (D23, 10/11/2026): lleva el teléfono (y el correo, si existiera) de la organización cuando el
// legacy no lo guarda como persona. Un cliente sin teléfono ni correo no tiene este contacto.
export const CORPORATE_LINE_NAME = "Línea corporativa";

/**
 * Identidad de un contacto dentro de un cliente (D23, criterio por confirmar con Marcelo): el nombre normalizado
 * (minúsculas, sin acentos, sin signos y con espacios colapsados). Dos filas del mismo cliente con la misma clave son el mismo contacto.
 * Se aísla aquí para poder cambiar el criterio (por correo, o nombre + correo) sin tocar el validador ni el cargador.
 */
export function contactIdentityKey(fullName) {
  return String(fullName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Criterios de «contacto distinto» dentro de un cliente (D23). Aislados aquí para cambiarlos sin tocar el validador:
 *   "name"        (anterior: 238 contactos al 06/11) → la misma persona = el mismo nombre normalizado.
 *   "email-first" (226 contactos)                    → primero por correo válido; sin correo, por nombre normalizado, salvo que ese nombre
 *                                                      ya esté en un contacto CON correo del mismo cliente (entonces es el mismo contacto).
 *   "channel"     (VIGENTE, cerrado por Marcelo el 11/11/2026; 226 contactos: 208 + 3 + 15) → el contacto es el CANAL: la clave es el correo
 *                 válido; si no hay, el teléfono válido; si no hay ninguno, el nombre. Un correo con varios nombres es UN contacto (nombre
 *                 más largo); un nombre con varios correos o teléfonos son varios contactos con el mismo nombre. Un teléfono que ya viaja
 *                 en un contacto con correo del mismo cliente no genera otro contacto, y una fila solo con nombre no genera contacto si ese
 *                 nombre ya está en un contacto con correo o teléfono del mismo cliente.
 * Devuelve las filas repetidas ({ clientRef, reason }) para que el validador las rechace: el CSV debe llegar ya deduplicado.
 */
export const CONTACT_CRITERIA = Object.freeze(["name", "email-first", "channel"]);
export const DEFAULT_CONTACT_CRITERION = "channel";
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneDigits = (value) => { const digits = String(value ?? "").replace(/\D+/g, ""); return digits.length >= 7 ? digits : ""; };
export function duplicateContacts(rows, criterion = DEFAULT_CONTACT_CRITERION) {
  if (!CONTACT_CRITERIA.includes(criterion)) throw new Fase2InputError(`contactos: criterio de contacto distinto desconocido (${criterion})`);
  const duplicates = []; const byClient = new Map();
  for (const row of rows) byClient.set(row.client_source_ref, [...(byClient.get(row.client_source_ref) ?? []), row]);
  for (const [clientRef, contacts] of byClient) {
    const seen = new Set(); const emailNames = new Set(); const emailPhones = new Set(); const channelNames = new Set();
    for (const row of contacts) {
      const hasEmail = VALID_EMAIL.test(String(row.email ?? "").trim()); const digits = phoneDigits(row.phone);
      if (criterion === "email-first" && hasEmail) emailNames.add(contactIdentityKey(row.full_name));
      if (criterion === "channel") { if (hasEmail && digits) emailPhones.add(digits); if (hasEmail || digits) channelNames.add(contactIdentityKey(row.full_name)); }
    }
    for (const row of contacts) {
      const name = contactIdentityKey(row.full_name); const email = String(row.email ?? "").trim().toLowerCase(); const hasEmail = VALID_EMAIL.test(email); const digits = phoneDigits(row.phone);
      let key; let covered = false;
      if (criterion === "name") key = `name:${name}`;
      else if (hasEmail) key = `email:${email}`;
      else if (criterion === "channel" && digits) { key = `phone:${digits}`; covered = emailPhones.has(digits); }
      else { key = `name:${name}`; covered = criterion === "email-first" ? emailNames.has(name) : channelNames.has(name); }
      if (covered || seen.has(key)) duplicates.push({ clientRef, reason: covered ? `${name || digits} ya está en un contacto con correo o teléfono` : key.replace(/^(name|email|phone):/, "") });
      seen.add(key);
    }
  }
  return duplicates;
}

// Reglas D23/D25 (10/11/2026): un cliente puede tener VARIOS contactos distintos; solo el nombre es obligatorio; una celda vacía es dato
// ausente (NULL, nunca ''); el cargo del contacto no se carga (client_contacts no tiene columna de cargo).
export function validateContacts(rows, clients, { expected = EXPECTED, enforceExpected = true, contactCriterion = DEFAULT_CONTACT_CRITERION } = {}) {
  const refs = new Set(clients.map((row) => row.client_source_ref ?? row.source_ref));
  for (const row of rows) {
    if (!refs.has(row.client_source_ref)) throw new Fase2InputError(`contactos: cliente huérfano ${row.client_source_ref}`);
    if (row.contact_type !== "general" || bool(row.is_active, `contactos ${row.client_source_ref}.is_active`) !== true) throw new Fase2InputError(`contactos: fila inválida para ${row.client_source_ref}`);
    const name = String(row.full_name ?? ""); const identity = contactIdentityKey(name);
    if (!name.trim() || !identity) throw new Fase2InputError(`contactos: el nombre es obligatorio (${row.client_source_ref})`);
    if (name !== name.trim()) throw new Fase2InputError(`contactos: nombre con espacios sobrantes (${row.client_source_ref})`);
    for (const field of ["email", "phone"]) if (row[field] !== "" && row[field] !== row[field].trim()) throw new Fase2InputError(`contactos: ${field} con espacios sobrantes o vacío escrito (${row.client_source_ref}); una celda vacía debe quedar sin texto`);
    // «Línea corporativa» existe solo para llevar el teléfono o el correo de la organización: sin ninguno de los dos no se crea (D23).
    if (identity === contactIdentityKey(CORPORATE_LINE_NAME) && !row.email && !row.phone) throw new Fase2InputError(`contactos: «${CORPORATE_LINE_NAME}» sin teléfono ni correo (${row.client_source_ref})`);
  }
  const repeated = duplicateContacts(rows, contactCriterion);
  if (repeated.length) throw new Fase2InputError(`contactos: contacto repetido en ${repeated[0].clientRef} (${repeated[0].reason}; criterio ${contactCriterion}; ${repeated.length} repetido(s))`);
  if (enforceExpected && off(expected.contacts, rows.length)) throw new Fase2InputError(`contactos: se esperaban ${expected.contacts}, llegaron ${rows.length}`);
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
  if (enforceExpected && (off(expected.staff, rows.length) || off(expected.activeStaff, active) || off(expected.inactiveStaff, inactive) || off(expected.schedulableStaff, schedulable))) throw new Fase2InputError("staff: conteos aprobados no coinciden");
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
  if (seen.size !== staffByRef.size || (enforceExpected && off(expected.users, rows.length))) throw new Fase2InputError("usuarios: cobertura o conteo inválido");
  return rows;
}

const RATE_FIELDS = ["rate_high_usd", "rate_low_usd", "rate_high_bob", "rate_low_bob"];
export function validateRates(rows, { expected = EXPECTED, enforceExpected = true } = {}) {
  const seen = new Set();
  for (const row of rows) {
    const key = `${String(row.practica_abbreviation ?? "").trim()}|${String(row.category_name ?? "").trim()}`;
    if (key.startsWith("|") || key.endsWith("|")) throw new Fase2InputError("tarifas: práctica o categoría vacía");
    if (seen.has(key)) throw new Fase2InputError(`tarifas: fila duplicada ${key}`);
    for (const field of RATE_FIELDS) if (!/^\d+(\.\d+)?$/.test(String(row[field] ?? "").trim())) throw new Fase2InputError(`tarifas: ${field} no numérico en ${key}`);
    seen.add(key);
  }
  if (enforceExpected && off(expected.rates, rows.length)) throw new Fase2InputError(`tarifas: se esperaban ${expected.rates} filas y hay ${rows.length}`);
  return rows;
}

export function validateServices(rows, { expected = EXPECTED, enforceExpected = true } = {}) {
  const seen = new Set();
  for (const row of rows) {
    const id = String(row.legacy_service_id ?? "").trim();
    if (!id || !String(row.ems_service_name ?? "").trim()) throw new Fase2InputError("servicios: código legacy o servicio EMS vacío");
    if (seen.has(id)) throw new Fase2InputError(`servicios: código legacy duplicado ${id}`);
    seen.add(id);
  }
  if (enforceExpected && off(expected.services, rows.length)) throw new Fase2InputError(`servicios: se esperaban ${expected.services} filas y hay ${rows.length}`);
  return rows;
}

export function validateRoleAssignment(staff, user, categoryDefaultRoleKey) {
  const override = APPROVED_ROLE_OVERRIDES[staff.staff_source_ref];
  if (override) {
    if (staff.category_name !== override.categoryName || user.expected_role_key !== override.roleKey || user.expected_legacy_role !== override.legacyRole) {
      throw new Fase2InputError(`rol especial no coincide con la enmienda aprobada (${staff.staff_source_ref})`);
    }
    return;
  }
  if (user.expected_role_key !== categoryDefaultRoleKey || user.expected_legacy_role === "admin") {
    throw new Fase2InputError(`rol esperado no coincide con la categoría (${staff.staff_source_ref})`);
  }
}

// El rol legacy que el sistema aplica a una cuenta sale de authorization_roles.legacy_app_role del rol esperado (no de la categoría:
// los gerentes especialistas tienen default_app_role specialist_* y rol efectivo manager). Si el CSV trae otro par, la carga crearía
// la ficha y la cuenta de Auth y recién después fallaría la comparación; se rechaza antes de escribir.
export function assertLegacyRoleMirror(users, roles) {
  if (!Array.isArray(roles) || !roles.length) throw new Fase2InputError("catálogo de roles no disponible para validar el rol legacy");
  const mirror = new Map(roles.map((role) => [role.role_key, role.legacy_app_role]));
  for (const user of users) {
    const expected = mirror.get(user.expected_role_key);
    if (expected === undefined || expected === null) throw new Fase2InputError(`rol sin espejo legacy en el catálogo (${user.staff_source_ref})`);
    if (expected !== user.expected_legacy_role) throw new Fase2InputError(`rol legacy no coincide con el espejo del rol ${user.expected_role_key} (${user.staff_source_ref})`);
  }
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
  validateRates(parsed.rates, options); validateServices(parsed.services, options);
  return { ...parsed, clients, fingerprints: Object.fromEntries(names.map((name) => [name, { sha256: sha256File(inputs[name]), rows: parsed[name].length }])) };
}
