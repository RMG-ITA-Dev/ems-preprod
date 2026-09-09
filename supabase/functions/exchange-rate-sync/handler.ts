// exchange-rate-sync — handler. Bug 0722-156 (Fase 1): consume the TC Ruizmier
// microservice (USD/BOB oficial BCB), persist a daily history row, and back the Settings
// "Probar → modal → Guardar" flow. See bugs/0722-156/plan_v2.md Proposed Fix §3.
//
// Two modes, one handler each:
//   - handleSync: no caller auth required (today invoked by the "Guardar" button after
//     saving the URL; later, an external Railway cron will hit the same endpoint the same
//     way — see plan_v2.md Amendment 2026-09-04 parte 2). Reads EXCHANGE_RATE_API_URL from
//     global_settings (never a client-supplied URL), fetches, validates, and upserts by
//     fecha_vigencia ONLY if the payload actually changed (no-op otherwise, including
//     fetched_at — repeated clicks on "Probar → Guardar" over the same day's data must not
//     generate churn).
//   - handleTest: admin-gated by the caller (index.ts checks has_permission before calling
//     this). Dry-run against a caller-supplied URL (possibly unsaved) — never writes.

export interface ExchangeRateDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>;
      };
    };
    upsert(
      row: Record<string, unknown>,
      opts: { onConflict: string },
    ): Promise<{ error: { message: string } | null }>;
  };
}

interface RawRateResponse {
  fuente?: unknown;
  regimen?: unknown;
  versionMetodologia?: unknown;
  moneda?: unknown;
  compra?: unknown;
  venta?: unknown;
  fechaVigencia?: unknown;
  fechaPublicacion?: unknown;
  canal?: unknown;
  actualizadoEn?: unknown;
  estado?: unknown;
}

export interface ExchangeRateRow {
  fecha_vigencia: string;
  compra: number;
  venta: number;
  moneda: string;
  fuente: string;
  regimen: string | null;
  version_metodologia: string | null;
  canal: "bcb-web" | "bcb-soap";
  fecha_publicacion: string | null;
  actualizado_en: string;
  estado: "vigente" | "stale";
}

export interface HandlerResult {
  status: number;
  payload: Record<string, unknown>;
}

/** Minimal shape of the Supabase client needed to authorize a test-mode request —
 * deliberately NOT the full supabase-js client type, so a fake can implement it in
 * Vitest without any Deno-only import. */
export interface AuthClient {
  auth: {
    getUser(token: string): Promise<{ data: { user: unknown } | null; error: unknown }>;
  };
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

/** MUST FIX review iteracion 1 #6: this authorization check (missing/invalid JWT,
 * missing global_settings.update permission) previously lived inline in index.ts,
 * which imports Deno-only modules and could not be unit-tested directly — the SSRF
 * gate (handleTest fetches a caller-supplied URL) was covered only by manual
 * post-deploy verification. Extracted here, with no Deno-only imports, so it can be
 * exercised the same way as validateAndMapRate/fetchProviderRate above. */
export async function authorizeTestMode(
  client: AuthClient,
  authHeader: string | null,
): Promise<HandlerResult | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { status: 401, payload: { error: { code: "unauthorized", message: "Missing Authorization header" } } };
  }
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData?.user) {
    return { status: 401, payload: { error: { code: "unauthorized", message: "Invalid token" } } };
  }

  // Admin gate: this mode fetches a caller-supplied URL (SSRF surface), so an
  // authenticated-but-unprivileged caller must not be able to use it as an open proxy.
  const { data: allowed, error: permError } = await client.rpc("has_permission", {
    p_permission_key: "global_settings.update",
  });
  if (permError || allowed !== true) {
    return { status: 403, payload: { error: { code: "forbidden", message: "Requires global_settings.update" } } };
  }

  return null; // authorized — caller proceeds to handleTest
}

// Deliberately NOT a discriminated union (`{ok:true;row}|{ok:false;error}`): this repo's
// tsconfig.app.json runs with strictNullChecks:false, under which TypeScript 5.8's control-flow
// narrowing on an `if (!x.ok)` check does not narrow such a union — every call site would then
// fail to compile with "Property 'error'/'row' does not exist on type '...|...'" even though the
// runtime logic is correct. A single shape with optional fields sidesteps that entirely.
export interface ValidateResult {
  ok: boolean;
  row?: ExchangeRateRow;
  error?: string;
}

export interface FetchResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isBlockedIpv4(a: number, b: number): boolean {
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  return false;
}

// MUST FIX review iteracion 2 #8 (defensa en profundidad, complementaria al gate de
// permiso global_settings.update que ya exige authorizeTestMode): rechaza loopback/
// link-local (incl. 169.254.169.254, el endpoint de metadata de nube)/rangos privados
// antes de hacer fetch, para que el modo test no pueda usarse para sondear la red
// interna del servidor.
//
// MUST FIX review iteracion 6 #2: el chequeo de IPv6 solo miraba prefijos de texto
// literales, dejando pasar 2 formas reales de escribir un host privado: (a) IPv4
// mapeado a IPv6 (`::ffff:127.0.0.1` o su forma hex `::ffff:7f00:1`, ambas equivalentes
// a 127.0.0.1) -- se desenvuelven a IPv4 y se re-chequean con isBlockedIpv4; (b)
// `fe80::/10` (link-local) es un rango de 64 valores posibles en el primer grupo
// (fe80-febf), no solo el literal "fe80:" -- ningun valor en ese rango admite menos de
// 4 digitos hex (siempre >= 0x1000), asi que comparar el primer grupo completo cubre
// el rango entero sin falsos positivos.
//
// MUST FIX review iteracion 8 #1: la forma "IPv4-compatible" (`::a.b.c.d`, legacy, SIN el
// prefijo `ffff:`) canonicaliza al mismo patron de 2 hextets que la forma mapeada de
// arriba pero sin ese prefijo -- ej. `new URL("https://[::127.0.0.1]/").hostname` da
// `[::7f00:1]`, que no matcheaba `mappedHex` (exige "ffff:" literal) ni ningun otro
// chequeo, dejandolo pasar. Como ambas formas son bit-a-bit identicas para dos hextets
// finales, se decodifican igual (los 2 octetos altos se re-chequean con isBlockedIpv4).
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "0.0.0.0" || host === "::1") return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (ipv4) return isBlockedIpv4(Number(ipv4[1]), Number(ipv4[2]));

  const mappedDotted = host.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (mappedDotted) return isBlockedIpv4(Number(mappedDotted[1]), Number(mappedDotted[2]));

  const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    return isBlockedIpv4((hi >> 8) & 0xff, hi & 0xff);
  }

  const compatHex = host.match(/^::([0-9a-f]{1,4}):[0-9a-f]{1,4}$/);
  if (compatHex) {
    const hi = parseInt(compatHex[1], 16);
    return isBlockedIpv4((hi >> 8) & 0xff, hi & 0xff);
  }

  const firstHextet = host.split(":")[0];
  if (/^fe[89ab][0-9a-f]$/.test(firstHextet)) return true; // IPv6 link-local (fe80::/10)
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // IPv6 unique-local
  return false;
}

// MUST FIX review iteracion 7 #2: ISO_DATE solo valida el FORMATO (YYYY-MM-DD), no que la
// fecha exista en el calendario -- "2026-02-31" pasaba el regex. fecha_vigencia/fecha_
// publicacion son columnas `date` en Postgres, que si rechazan una fecha de calendario
// invalida -- pero eso dejaba el modo test (handleTest, sin escritura) reportando exito
// con un valor que el guardado real (handleSync/upsert) rechazaria despues, confundiendo
// al admin ("la prueba de conexion dijo que andaba bien"). Se valida aca, antes de
// aceptar el payload, para que el error aparezca en la prueba misma.
function isValidCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// MUST FIX review iteracion 9 #4: actualizadoEn (timestamptz, no `date`) solo se
// validaba como string no-vacio -- un valor no parseable (ej. "not-a-date") pasaba el
// modo test como exitoso, pero el guardado real fallaria despues al intentar insertarlo
// en la columna timestamptz -- mismo problema que isValidCalendarDate ya corrigio para
// fechaVigencia/fechaPublicacion (Iteracion 7 #2), aplicado aca al campo que quedo afuera.
function isValidTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/** Validates and maps the microservice's camelCase response to our snake_case row shape.
 * Rates/currency/channel/status are checked strictly (they drive CHECK constraints and
 * comparison logic); metadata fields (fuente/regimen/versionMetodologia) stay permissive —
 * see plan_v2.md Regression Risks. */
export function validateAndMapRate(raw: unknown): ValidateResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Respuesta del microservicio no es un objeto JSON" };
  }
  const r = raw as RawRateResponse;

  if (typeof r.compra !== "number" || !(r.compra > 0)) {
    return { ok: false, error: "Campo 'compra' inválido o ausente" };
  }
  if (typeof r.venta !== "number" || !(r.venta > 0)) {
    return { ok: false, error: "Campo 'venta' inválido o ausente" };
  }
  if (typeof r.fuente !== "string" || r.fuente.trim() === "") {
    return { ok: false, error: "Campo 'fuente' inválido o ausente" };
  }
  if (typeof r.fechaVigencia !== "string" || !isValidCalendarDate(r.fechaVigencia)) {
    return { ok: false, error: "Campo 'fechaVigencia' inválido o ausente (se espera YYYY-MM-DD, fecha de calendario real)" };
  }
  if (r.canal !== "bcb-web" && r.canal !== "bcb-soap") {
    return { ok: false, error: "Campo 'canal' inválido (se espera 'bcb-web' o 'bcb-soap')" };
  }
  if (r.estado !== "vigente" && r.estado !== "stale") {
    return { ok: false, error: "Campo 'estado' inválido (se espera 'vigente' o 'stale')" };
  }
  if (typeof r.actualizadoEn !== "string" || r.actualizadoEn.trim() === "" || !isValidTimestamp(r.actualizadoEn)) {
    return { ok: false, error: "Campo 'actualizadoEn' inválido o ausente (se espera una fecha/hora real)" };
  }
  if (
    r.fechaPublicacion !== undefined &&
    r.fechaPublicacion !== null &&
    (typeof r.fechaPublicacion !== "string" || !isValidCalendarDate(r.fechaPublicacion))
  ) {
    return { ok: false, error: "Campo 'fechaPublicacion' inválido (se espera YYYY-MM-DD, fecha de calendario real)" };
  }

  return {
    ok: true,
    row: {
      fecha_vigencia: r.fechaVigencia,
      compra: r.compra,
      venta: r.venta,
      moneda: typeof r.moneda === "string" && r.moneda.trim() !== "" ? r.moneda : "USD/BOB",
      fuente: r.fuente,
      regimen: typeof r.regimen === "string" ? r.regimen : null,
      version_metodologia: typeof r.versionMetodologia === "string" ? r.versionMetodologia : null,
      canal: r.canal,
      fecha_publicacion: (r.fechaPublicacion as string | null) ?? null,
      actualizado_en: r.actualizadoEn,
      estado: r.estado,
    },
  };
}

/** Fetches the provider URL; never throws — every failure mode (network, non-2xx, invalid
 * JSON) becomes a controlled { ok:false } so the caller can log and return without a partial
 * write. Per the JSON packet, "500" is the only expected failure mode (high-availability
 * service), but network/parse failures are guarded defensively regardless. */
export async function fetchProviderRate(url: string): Promise<FetchResult> {
  if (typeof url !== "string" || url.trim() === "") {
    return { ok: false, error: "URL del microservicio no configurada" };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "URL del microservicio inválida" };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "URL del microservicio debe ser HTTPS" };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, error: "URL del microservicio apunta a un host no permitido" };
  }

  // MUST FIX review iteracion 3 #2/#5: isBlockedHost solo mira el hostname literal de la
  // URL; un fetch normal sigue redirects por defecto, así que un host público permitido
  // podía redirigir hacia loopback/privado/metadata de nube sin que este chequeo lo viera.
  // `redirect: "error"` hace que fetch() rechace en cuanto el proveedor responda un 3xx, en
  // vez de seguirlo — cierra ese bypass sin necesitar resolución de DNS (que requeriría una
  // API Deno-only, incompatible con que este archivo corra sin cambios bajo Vitest). Un
  // hostname público que resuelve directamente a una IP privada (DNS rebinding) queda fuera
  // de esta defensa — mitigado por el gate de permiso `global_settings.update` que ya exige
  // authorizeTestMode para modo test, y por el hecho de que la URL en modo sync es siempre
  // la guardada por un admin, nunca la de un llamador anónimo.
  let response: Response;
  try {
    response = await fetch(parsed.toString(), { redirect: "error" });
  } catch (e) {
    return { ok: false, error: `Error de red consultando el microservicio: ${String(e)}` };
  }
  if (!response.ok) {
    return { ok: false, error: `El microservicio respondió ${response.status}` };
  }
  try {
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, error: "Respuesta del microservicio no es JSON válido" };
  }
}

const COMPARE_FIELDS: (keyof ExchangeRateRow)[] = [
  "compra", "venta", "moneda", "fuente", "regimen", "version_metodologia",
  "canal", "fecha_publicacion", "actualizado_en", "estado",
];

// MUST FIX review iteracion 7 #3: actualizado_en es `timestamptz` en Postgres -- PostgREST
// normaliza su representacion al leerlo de vuelta (offset distinto al que el proveedor
// mando originalmente), asi que comparar como string exacto casi nunca matchea aunque sea
// el mismo instante, rompiendo el no-op documentado abajo (operator decision 2026-09-04)
// en la practica: cada sync terminaba en un UPSERT innecesario. Se compara como instante
// parseado solo para este campo; el resto de COMPARE_FIELDS son texto/numericos sin
// ambiguedad de formato, se quedan con la comparacion exacta.
function valuesEqual(field: keyof ExchangeRateRow, existingValue: unknown, fetchedValue: unknown): boolean {
  const existingNormalized = existingValue ?? null;
  const fetchedNormalized = fetchedValue ?? null;
  if (field === "actualizado_en" && typeof existingNormalized === "string" && typeof fetchedNormalized === "string") {
    const existingMs = new Date(existingNormalized).getTime();
    const fetchedMs = new Date(fetchedNormalized).getTime();
    if (!Number.isNaN(existingMs) && !Number.isNaN(fetchedMs)) {
      return existingMs === fetchedMs;
    }
  }
  return existingNormalized === fetchedNormalized;
}

function rowsEqual(a: ExchangeRateRow, existing: Record<string, unknown>): boolean {
  return COMPARE_FIELDS.every((field) => valuesEqual(field, existing[field], a[field]));
}

/** Sync mode: reads the saved URL, fetches, and upserts by fecha_vigencia — but ONLY if the
 * payload changed from what's already stored (operator decision 2026-09-04): a re-fetch of
 * identical data is a total no-op, not even touching fetched_at. Never trusts a
 * client-supplied rate payload — the caller (index.ts) passes no body-derived data in here. */
export async function handleSync(db: ExchangeRateDb): Promise<HandlerResult> {
  const settingRes = await db
    .from("global_settings")
    .select("setting_value")
    .eq("setting_key", "EXCHANGE_RATE_API_URL")
    .maybeSingle();
  if (settingRes.error) {
    // MUST FIX review iteracion 2 #6: settingRes.error.message es un mensaje crudo de
    // Postgres/PostgREST -- se loguea completo server-side (arriba) pero NUNCA viaja al
    // caller, porque esta funcion corre en modo sync sin autenticacion (verify_jwt=false,
    // sin chequeo en el handler) y es alcanzable por cualquiera en internet.
    console.error("exchange-rate-sync: could not read EXCHANGE_RATE_API_URL", settingRes.error);
    return { status: 500, payload: { error: { code: "settings_read_failed" } } };
  }
  const url = (settingRes.data as { setting_value?: string } | null)?.setting_value ?? "";

  const fetched = await fetchProviderRate(url);
  if (!fetched.ok) {
    console.error("exchange-rate-sync: provider fetch failed", { error: fetched.error });
    return { status: 502, payload: { error: { code: "provider_error", message: fetched.error } } };
  }

  const mapped = validateAndMapRate(fetched.data);
  if (!mapped.ok) {
    console.error("exchange-rate-sync: invalid provider payload", { error: mapped.error });
    return { status: 400, payload: { error: { code: "invalid_payload", message: mapped.error } } };
  }

  const existingRes = await db
    .from("exchange_rate_history")
    .select("compra,venta,moneda,fuente,regimen,version_metodologia,canal,fecha_publicacion,actualizado_en,estado")
    .eq("fecha_vigencia", mapped.row.fecha_vigencia)
    .maybeSingle();
  if (existingRes.error) {
    console.error("exchange-rate-sync: could not read existing row", existingRes.error);
    return { status: 500, payload: { error: { code: "history_read_failed" } } };
  }

  if (existingRes.data && rowsEqual(mapped.row, existingRes.data as Record<string, unknown>)) {
    return { status: 200, payload: { ...mapped.row, written: false } };
  }

  const upsertRes = await db
    .from("exchange_rate_history")
    .upsert(mapped.row as unknown as Record<string, unknown>, { onConflict: "fecha_vigencia" });
  if (upsertRes.error) {
    console.error("exchange-rate-sync: upsert failed", upsertRes.error);
    return { status: 500, payload: { error: { code: "upsert_failed" } } };
  }

  return { status: 200, payload: { ...mapped.row, written: true } };
}

/** Test/dry-run mode: fetches the CALLER-SUPPLIED url (the value currently typed in
 * Settings, possibly unsaved) and returns the parsed rate without writing anything. The
 * caller (index.ts) is responsible for the admin gate — this function assumes it has
 * already been authorized, since it will fetch whatever URL it is given (SSRF surface). */
export async function handleTest(url: unknown): Promise<HandlerResult> {
  if (typeof url !== "string" || url.trim() === "") {
    return { status: 400, payload: { error: { code: "missing_url", message: "URL requerida para la prueba" } } };
  }

  const fetched = await fetchProviderRate(url);
  if (!fetched.ok) {
    return { status: 502, payload: { error: { code: "provider_error", message: fetched.error } } };
  }

  const mapped = validateAndMapRate(fetched.data);
  if (!mapped.ok) {
    return { status: 400, payload: { error: { code: "invalid_payload", message: mapped.error } } };
  }

  return { status: 200, payload: { ...mapped.row, written: false } };
}
