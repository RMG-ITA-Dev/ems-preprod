#!/usr/bin/env node
// Regresión de lectura por rol (Carril B de RLS, etapa B0).
//
// Inicia sesión con una cuenta por rol y mide, por la Data API real, qué recibe cada una de las
// tablas sin RLS de la lista de excepciones del CI, de `global_settings` y de las 5 vistas del
// barrido. Corre una vez ANTES de cada cambio del Carril B y otra DESPUÉS: la diferencia entre las
// dos matrices es el efecto del cambio, incluidos los fallos silenciosos de RLS (una lectura que
// pasa de N filas a 0 sin error).
//
// Solo lee. No escribe en la base, no imprime correos ni contraseñas y no guarda valores de filas:
// por objeto y rol registra el código HTTP, el código de error de Postgres, el conteo de filas y,
// en las tablas que lo tienen, cuántas personas distintas aparecen.
//
// Uso (PowerShell, desde la raíz del repo):
//   $env:RLS_REG_URL      = 'https://oapgycqovzqsucliwbpu.supabase.co'
//   $env:RLS_REG_ANON_KEY = '<clave publishable de Dev 2.0>'
//   $env:RLS_REG_CUENTAS  = 'ASISTENTE,SENIOR,GERENTE'          # etiquetas libres
//   $env:RLS_REG_ASISTENTE_EMAIL = '...' ; $env:RLS_REG_ASISTENTE_PASSWORD = '...'   # una pareja por etiqueta
//   $env:RLS_REG_ETIQUETA = 'antes'                              # antes | despues | lo que sirva para comparar
//   node scripts/rls-regresion-por-rol.mjs
//
// Variables opcionales: RLS_REG_OUT (carpeta de salida; por defecto Documentos/EMS-RLS-Evidencias/carril-b),
// RLS_REG_MAX_FILAS (tope por objeto al contar personas distintas; por defecto 50000).

import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Guarda: solo Dev 2.0. Test está congelado por la campaña k6 y producción no se toca.
const REFS_PERMITIDOS = ["oapgycqovzqsucliwbpu"];

// Objetos a medir. `sonda` es una columna que authenticated puede leer (la clave primaria): con
// select=* una tabla con permisos por columna, como `staff`, responde 403 aunque la fila sea
// legible. `persona` es la columna de staff/usuario para contar personas distintas.
const OBJETOS = [
  // Grupo A — identidad y logs
  { nombre: "user_roles", sonda: "id", persona: "user_id" },
  { nombre: "user_roles_backup_0220_56_20260224", sonda: "*" },
  { nombre: "migration_run_log", sonda: "id" },
  // Grupo B — núcleo de negocio
  { nombre: "staff", sonda: "staff_id" },
  { nombre: "clients", sonda: "client_id" },
  { nombre: "engagements", sonda: "engagement_id" },
  { nombre: "time_entries", sonda: "time_id", persona: "staff_id" },
  { nombre: "timer_entries", sonda: "timer_id", persona: "staff_id" },
  { nombre: "timesheet_line_approvals", sonda: "approval_id" },
  { nombre: "timesheet_periods", sonda: "period_id", persona: "staff_id" },
  // Grupo C — presupuestos y gastos
  { nombre: "activity_worksheet_cells", sonda: "id" },
  { nombre: "wo_budget_lines", sonda: "wo_line_id" },
  { nombre: "wo_expense_budget", sonda: "wo_exp_id" },
  // Grupo D — configuración y catálogos
  { nombre: "activity_codes", sonda: "activity_id" },
  { nombre: "categories", sonda: "category_id" },
  { nombre: "expense_types", sonda: "expense_type_id" },
  { nombre: "industries", sonda: "industry_id" },
  { nombre: "global_settings", sonda: "setting_key" },
  // Vistas del barrido (BAR-010)
  { nombre: "clients_directory", sonda: "*" },
  { nombre: "staff_directory", sonda: "*" },
  { nombre: "engagement_wo_state", sonda: "*" },
  { nombre: "fund_request_selectable_work_orders", sonda: "*" },
  { nombre: "work_order_summary", sonda: "*" },
];

function fallar(mensaje) {
  console.error(`ERROR: ${mensaje}`);
  process.exit(2);
}

function leerConfig() {
  const url = process.env.RLS_REG_URL ?? "";
  const anonKey = process.env.RLS_REG_ANON_KEY ?? "";
  if (!url || !anonKey) fallar("faltan RLS_REG_URL o RLS_REG_ANON_KEY");

  let ref;
  try {
    ref = new URL(url).hostname.split(".")[0];
  } catch {
    fallar("RLS_REG_URL no es una URL válida");
  }
  if (!REFS_PERMITIDOS.includes(ref)) {
    fallar(`la URL apunta a '${ref}', que no está en la lista permitida (${REFS_PERMITIDOS.join(", ")})`);
  }

  const etiquetas = (process.env.RLS_REG_CUENTAS ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (etiquetas.length === 0) fallar("RLS_REG_CUENTAS está vacía");

  const cuentas = etiquetas.map((etiqueta) => {
    const email = process.env[`RLS_REG_${etiqueta}_EMAIL`];
    const password = process.env[`RLS_REG_${etiqueta}_PASSWORD`];
    if (!email || !password) fallar(`faltan RLS_REG_${etiqueta}_EMAIL o RLS_REG_${etiqueta}_PASSWORD`);
    return { etiqueta, email, password };
  });

  const salida =
    process.env.RLS_REG_OUT ?? join(homedir(), "Documents", "EMS-RLS-Evidencias", "carril-b");
  const maxFilas = Number(process.env.RLS_REG_MAX_FILAS ?? 50000);
  const etiquetaCorrida = (process.env.RLS_REG_ETIQUETA ?? "corrida").replace(/[^a-z0-9_-]/gi, "");

  return { url, anonKey, ref, cuentas, salida, maxFilas, etiquetaCorrida };
}

function nuevoCliente(url, anonKey) {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// Conteo exacto sin traer filas (HEAD con Prefer: count=exact).
async function contar(cliente, obj) {
  const { count, error, status } = await cliente
    .from(obj.nombre)
    .select(obj.sonda, { count: "exact", head: true });
  return {
    http: status,
    pg: error?.code ?? "",
    filas: error ? null : count ?? 0,
  };
}

// Personas distintas: pagina solo la columna de persona, con tope.
async function personasDistintas(cliente, obj, maxFilas) {
  const distintas = new Set();
  const pagina = 1000;
  for (let desde = 0; desde < maxFilas; desde += pagina) {
    const { data, error } = await cliente
      .from(obj.nombre)
      .select(obj.persona)
      .order(obj.sonda, { ascending: true })
      .range(desde, desde + pagina - 1);
    if (error) return { personas: null, truncado: false };
    for (const fila of data) distintas.add(fila[obj.persona]);
    if (data.length < pagina) return { personas: distintas.size, truncado: false };
  }
  return { personas: distintas.size, truncado: true };
}

async function medir(cliente, maxFilas) {
  const resultados = {};
  for (const obj of OBJETOS) {
    const r = await contar(cliente, obj);
    if (obj.persona && r.filas) {
      Object.assign(r, await personasDistintas(cliente, obj, maxFilas));
    }
    resultados[obj.nombre] = r;
  }
  return resultados;
}

async function rolPropio(cliente, userId) {
  const { data, error } = await cliente
    .from("user_roles")
    .select("role_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return `(error ${error.code ?? "?"})`;
  return data?.role_key ?? "(sin rol)";
}

function celda(r) {
  if (!r) return "—";
  if (r.filas === null) return `${r.http}${r.pg ? ` ${r.pg}` : ""}`;
  let txt = `${r.filas}`;
  if (r.personas !== undefined && r.personas !== null) {
    txt += ` (${r.personas}${r.truncado ? "+" : ""} pers.)`;
  }
  return txt;
}

function escribirSalidas(config, columnas, sello) {
  mkdirSync(config.salida, { recursive: true });
  const base = join(config.salida, `regresion_${config.ref}_${config.etiquetaCorrida}_${sello}`);

  const csv = ["columna,rol,objeto,http,pg,filas,personas,truncado"];
  for (const col of columnas) {
    for (const obj of OBJETOS) {
      const r = col.resultados?.[obj.nombre];
      csv.push(
        [
          col.etiqueta,
          col.rol,
          obj.nombre,
          r?.http ?? "",
          r?.pg ?? "",
          r?.filas ?? "",
          r?.personas ?? "",
          r?.truncado ? "si" : "",
        ].join(","),
      );
    }
  }
  writeFileSync(`${base}.csv`, csv.join("\n") + "\n", "utf8");

  const md = [];
  md.push(`# Regresión de lectura por rol — ${config.etiquetaCorrida}`);
  md.push("");
  md.push(`Proyecto \`${config.ref}\` · ${sello} (UTC) · solo lectura · sin valores de filas.`);
  md.push("Celda: filas recibidas (personas distintas) o `HTTP código-postgres` si la lectura falló. `+` = tope de filas alcanzado.");
  md.push("");
  md.push(`| Objeto | ${columnas.map((c) => `${c.etiqueta} (${c.rol})`).join(" | ")} |`);
  md.push(`|---|${columnas.map(() => "---").join("|")}|`);
  for (const obj of OBJETOS) {
    md.push(`| \`${obj.nombre}\` | ${columnas.map((c) => celda(c.resultados?.[obj.nombre])).join(" | ")} |`);
  }
  const errores = columnas.filter((c) => c.errorLogin);
  if (errores.length) {
    md.push("");
    md.push("## Cuentas que no pudieron iniciar sesión");
    for (const c of errores) md.push(`- ${c.etiqueta}: ${c.errorLogin}`);
  }
  writeFileSync(`${base}.md`, md.join("\n") + "\n", "utf8");

  return base;
}

async function main() {
  const config = leerConfig();
  const sello = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const columnas = [];

  console.log(`Proyecto ${config.ref}: ${OBJETOS.length} objetos × (${config.cuentas.length} cuentas + anon)`);

  // anon: control de que el Carril A sigue en pie.
  {
    const cliente = nuevoCliente(config.url, config.anonKey);
    columnas.push({ etiqueta: "ANON", rol: "anon", resultados: await medir(cliente, config.maxFilas) });
    console.log("  ANON listo");
  }

  for (const cuenta of config.cuentas) {
    const cliente = nuevoCliente(config.url, config.anonKey);
    const { data, error } = await cliente.auth.signInWithPassword({
      email: cuenta.email,
      password: cuenta.password,
    });
    if (error || !data?.user) {
      const motivo = error?.message ?? "sin sesión";
      columnas.push({ etiqueta: cuenta.etiqueta, rol: "?", resultados: null, errorLogin: motivo });
      console.log(`  ${cuenta.etiqueta}: no pudo iniciar sesión (${motivo})`);
      continue;
    }
    const rol = await rolPropio(cliente, data.user.id);
    const resultados = await medir(cliente, config.maxFilas);
    await cliente.auth.signOut();
    columnas.push({ etiqueta: cuenta.etiqueta, rol, resultados });
    console.log(`  ${cuenta.etiqueta} (${rol}) listo`);
  }

  const base = escribirSalidas(config, columnas, sello);
  console.log(`Salida: ${base}.md y ${base}.csv`);
}

main().catch((e) => fallar(e?.message ?? String(e)));
