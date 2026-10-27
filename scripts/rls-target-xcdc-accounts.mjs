#!/usr/bin/env node
// Cuentas controladas para la regresión RLS del proyecto xcdcxtduotwgwmhxvsiz.
//
// Uso:
//   node scripts/rls-target-xcdc-accounts.mjs crear
//   # ejecutar scripts/rls-target-xcdc-promote-admin.sql con psql
//   node scripts/rls-target-xcdc-accounts.mjs roles
//
// Requiere variables locales (no se imprimen): RLS_TARGET_URL, RLS_TARGET_ANON_KEY,
// RLS_TARGET_SERVICE_KEY y RLS_TARGET_CONFIRM_REF=xcdcxtduotwgwmhxvsiz.
// Las credenciales generadas se guardan solo en *.local, ignorado por Git.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const REF = "xcdcxtduotwgwmhxvsiz";
const URL = `https://${REF}.supabase.co`;
const STATE_FILE = ".rls-target-xcdc-accounts.local";
const CREDENTIALS_FILE = ".env.rls-target-xcdc-cuentas.local";
const OPTIONS = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

const ACCOUNTS = {
  ADMIN: "admin",
  ASISTENTE: "assistant",
  SEMISENIOR: "semisenior",
  SENIOR: "senior",
  GERENTE: "manager",
  GERENTE_CONTA: "accounting_manager",
  SOCIO: "partner",
  ANALISTA_COB: "collections_analyst",
  ANALISTA_CONT: "accounting_analyst",
  ANALISTA_RIESGOS: "risk_supervisor",
  SOCIO_RIESGOS: "risk_partner",
  SENIOR_PARTNER: "senior_partner",
  DIRECTOR: "director",
  SQR: "sqr",
  HR_MANAGER: "hr_manager",
  HR_ANALYST: "hr_analyst",
  IT_SECURITY: "it_security_manager",
};

const EMAILS = {
  ADMIN: "rls-xcdc-20261016-admin@ruizmier.com",
  ASISTENTE: "rls-xcdc-20261016-assistant@ruizmier.com",
  SEMISENIOR: "rls-xcdc-20261016-semisenior@ruizmier.com",
  SENIOR: "rls-xcdc-20261016-senior@ruizmier.com",
  GERENTE: "rls-xcdc-20261016-manager@ruizmier.com",
  GERENTE_CONTA: "rls-xcdc-20261016-accounting-manager@ruizmier.com",
  SOCIO: "rls-xcdc-20261016-partner@ruizmier.com",
  ANALISTA_COB: "rls-xcdc-20261016-collections@ruizmier.com",
  ANALISTA_CONT: "rls-xcdc-20261016-accounting@ruizmier.com",
  ANALISTA_RIESGOS: "rls-xcdc-20261016-risk-supervisor@ruizmier.com",
  SOCIO_RIESGOS: "rls-xcdc-20261016-risk-partner@ruizmier.com",
  SENIOR_PARTNER: "rls-xcdc-20261016-senior-partner@ruizmier.com",
  DIRECTOR: "rls-xcdc-20261016-director@ruizmier.com",
  SQR: "rls-xcdc-20261016-sqr@ruizmier.com",
  HR_MANAGER: "rls-xcdc-20261016-hr-manager@ruizmier.com",
  HR_ANALYST: "rls-xcdc-20261016-hr-analyst@ruizmier.com",
  IT_SECURITY: "rls-xcdc-20261016-it-security@ruizmier.com",
};

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

function requireConfig() {
  if (process.env.RLS_TARGET_URL !== URL) fail(`RLS_TARGET_URL debe ser exactamente ${URL}`);
  if (process.env.RLS_TARGET_CONFIRM_REF !== REF) fail("falta RLS_TARGET_CONFIRM_REF con el ref exacto");
  if (!process.env.RLS_TARGET_ANON_KEY) fail("falta RLS_TARGET_ANON_KEY");
  if (!process.env.RLS_TARGET_SERVICE_KEY) fail("falta RLS_TARGET_SERVICE_KEY");
  return {
    admin: createClient(URL, process.env.RLS_TARGET_SERVICE_KEY, OPTIONS),
    anonKey: process.env.RLS_TARGET_ANON_KEY,
  };
}

function readState() {
  if (!existsSync(STATE_FILE)) {
    const state = { password: randomBytes(24).toString("base64url"), users: {} };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    return state;
  }
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  if (!state.password || typeof state.users !== "object") fail(`${STATE_FILE} es inválido`);
  return state;
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
}

async function listExistingUsers(admin) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) fail(`listUsers: ${error.message}`);
  return new Map((data.users ?? []).map((user) => [user.email?.toLowerCase(), user]));
}

async function assertStaffFixture(admin, existing) {
  const emails = Object.values(EMAILS);
  const { data, error } = await admin.from("staff").select("email,auth_user_id").in("email", emails);
  if (error) fail(`preflight staff: ${error.message}`);
  if ((data ?? []).length !== emails.length) fail("faltan fichas staff sintéticas; ejecute primero rls-target-xcdc-fixture-staff.sql");
  for (const row of data ?? []) {
    if (row.auth_user_id === null) continue;
    const user = existing.get(row.email?.toLowerCase());
    if (!user || user.id !== row.auth_user_id) {
      fail(`la ficha ${row.email} ya está enlazada a un usuario distinto; no se reasigna automáticamente`);
    }
  }
}

function writeCredentials(state, anonKey) {
  if (existsSync(CREDENTIALS_FILE)) fail(`${CREDENTIALS_FILE} ya existe: no se sobreescriben credenciales`);
  const lines = [
    "# Generado localmente. Ignorado por Git. Elimínelo al cerrar las pruebas RLS.",
    `RLS_REG_URL=${URL}`,
    `RLS_REG_ANON_KEY=${anonKey}`,
    `RLS_REG_CUENTAS=${Object.keys(ACCOUNTS).join(",")}`,
  ];
  for (const label of Object.keys(ACCOUNTS)) {
    lines.push(`RLS_REG_${label}_EMAIL=${EMAILS[label]}`, `RLS_REG_${label}_PASSWORD=${state.password}`);
  }
  writeFileSync(CREDENTIALS_FILE, lines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
}

async function createAccounts() {
  const { admin, anonKey } = requireConfig();
  const existing = await listExistingUsers(admin);
  await assertStaffFixture(admin, existing);
  const state = readState();

  for (const label of Object.keys(ACCOUNTS)) {
    const email = EMAILS[label];
    let user = existing.get(email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({ email, password: state.password, email_confirm: true });
      if (error) fail(`createUser ${label}: ${error.message}`);
      user = data.user;
      console.log(`  ${label}: creado`);
    } else {
      // Un usuario existente conserva la contraseña con que se creó. Si el estado local no lo
      // conoce (archivo borrado o corrida en otra máquina), readState() generó una contraseña
      // nueva que NO le corresponde y las credenciales exportadas fallarían al iniciar sesión.
      if (state.users[label] !== user.id) {
        fail(
          `${label}: la cuenta ya existe en Auth pero el estado local no la reconoce; ` +
            "su contraseña no es recuperable. Restaure el archivo de estado original o " +
            "restablezca la contraseña de esa cuenta de forma explícita antes de reanudar"
        );
      }
      console.log(`  ${label}: ya existía; se reanuda sin modificarlo`);
    }
    state.users[label] = user.id;
    saveState(state);
  }

  writeCredentials(state, anonKey);
  console.log(`PASS: ${Object.keys(ACCOUNTS).length} cuentas controladas y sus credenciales locales quedaron listas.`);
}

async function assignRoles() {
  const { anonKey } = requireConfig();
  if (!existsSync(STATE_FILE) || !existsSync(CREDENTIALS_FILE)) {
    fail("faltan los archivos locales de crear; ejecute primero el modo crear");
  }
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  if (!state.users?.ADMIN) fail("no está el id local de ADMIN");

  const client = createClient(URL, anonKey, OPTIONS);
  const { error: loginError } = await client.auth.signInWithPassword({ email: EMAILS.ADMIN, password: state.password });
  if (loginError) fail(`login ADMIN: ${loginError.message}; ejecute primero rls-target-xcdc-promote-admin.sql`);

  for (const [label, roleKey] of Object.entries(ACCOUNTS)) {
    if (label === "ADMIN") continue;
    const { data, error } = await client.rpc("admin_set_user_role_key", {
      p_target_user_id: state.users[label],
      p_new_role_key: roleKey,
      p_reason: "Cuenta sintética para regresión RLS xcdc 2026-10-16",
    });
    if (error || !data?.success) fail(`rol ${label}: ${error?.message ?? data?.code ?? "sin éxito"}`);
    console.log(`  ${label}: ${roleKey}`);
  }
  await client.auth.signOut();
  console.log("PASS: roles asignados mediante admin_set_user_role_key.");
}

const mode = process.argv[2];
if (mode === "crear") await createAccounts();
else if (mode === "roles") await assignRoles();
else fail("uso: crear | roles");
