// Handler tests for exchange-rate-sync (bug 0722-156, Fase 1 — plan_v2.md Tests to Add).
// Mirrors the scheduler-gaps/scheduler-data convention: handler.ts has no Deno-only imports,
// so it runs unmodified against an in-memory fake here. index.ts's request routing/CORS glue
// stays Deno-only and NOT unit-tested — verified instead by direct invocation after deploy
// (plan_v2.md Verification Step 9) — but the admin/SSRF gate for test mode (authorizeTestMode)
// was extracted into handler.ts specifically so it CAN run here (review iteracion 1 MUST
// FIX #6: this gate previously lived inline in index.ts, untested).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeTestMode,
  fetchProviderRate,
  handleSync,
  handleTest,
  validateAndMapRate,
  type AuthClient,
  type ExchangeRateDb,
  type ExchangeRateRow,
} from "../../../supabase/functions/exchange-rate-sync/handler.ts";

const VALID_RESPONSE = {
  fuente: "Banco Central de Bolivia",
  regimen: "flexible",
  versionMetodologia: "RD BCB 88/2026",
  moneda: "USD/BOB",
  compra: 11.57,
  venta: 11.67,
  fechaVigencia: "2026-08-26",
  fechaPublicacion: "2026-08-25",
  canal: "bcb-web",
  actualizadoEn: "2026-08-25T22:34:47.473-04:00",
  estado: "vigente",
};

type Row = Record<string, unknown>;

/** Minimal fake satisfying ExchangeRateDb: global_settings (single row keyed by
 * setting_key) + exchange_rate_history (single row keyed by fecha_vigencia). */
function createFakeDb(opts: {
  settingUrl?: string | null;
  historyRow?: Row | null;
  settingReadError?: { message: string };
  historyReadError?: { message: string };
  upsertError?: { message: string };
}): ExchangeRateDb & { upsertCalls: Row[] } {
  const upsertCalls: Row[] = [];
  return {
    upsertCalls,
    from(table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: string) {
              return {
                async maybeSingle() {
                  if (table === "global_settings") {
                    if (opts.settingReadError) return { data: null, error: opts.settingReadError };
                    return {
                      data: opts.settingUrl == null ? null : { setting_value: opts.settingUrl },
                      error: null,
                    };
                  }
                  if (opts.historyReadError) return { data: null, error: opts.historyReadError };
                  return { data: opts.historyRow ?? null, error: null };
                },
              };
            },
          };
        },
        async upsert(row: Row, _conflict: { onConflict: string }) {
          if (opts.upsertError) return { error: opts.upsertError };
          upsertCalls.push(row);
          return { error: null };
        },
      };
    },
  };
}

describe("validateAndMapRate", () => {
  it("maps a valid payload's every field to the snake_case row shape", () => {
    const result = validateAndMapRate(VALID_RESPONSE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toEqual<ExchangeRateRow>({
      fecha_vigencia: "2026-08-26",
      compra: 11.57,
      venta: 11.67,
      moneda: "USD/BOB",
      fuente: "Banco Central de Bolivia",
      regimen: "flexible",
      version_metodologia: "RD BCB 88/2026",
      canal: "bcb-web",
      fecha_publicacion: "2026-08-25",
      actualizado_en: "2026-08-25T22:34:47.473-04:00",
      estado: "vigente",
    });
  });

  it("defaults optional metadata fields and moneda when absent", () => {
    const { regimen, versionMetodologia, fechaPublicacion, moneda, ...rest } = VALID_RESPONSE;
    const result = validateAndMapRate(rest);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row.moneda).toBe("USD/BOB");
    expect(result.row.regimen).toBeNull();
    expect(result.row.version_metodologia).toBeNull();
    expect(result.row.fecha_publicacion).toBeNull();
  });

  it.each([
    ["compra <= 0", { ...VALID_RESPONSE, compra: 0 }],
    ["venta missing", { ...VALID_RESPONSE, venta: undefined }],
    ["fuente empty", { ...VALID_RESPONSE, fuente: "  " }],
    ["fechaVigencia not ISO", { ...VALID_RESPONSE, fechaVigencia: "26/08/2026" }],
    // MUST FIX review iteracion 7 #2: el regex de formato aceptaba una fecha que no
    // existe en el calendario (el mes solo tiene 28/29 dias).
    ["fechaVigencia not a real calendar date", { ...VALID_RESPONSE, fechaVigencia: "2026-02-31" }],
    ["fechaPublicacion not a real calendar date", { ...VALID_RESPONSE, fechaPublicacion: "2026-02-31" }],
    ["canal invalid", { ...VALID_RESPONSE, canal: "bcb-fax" }],
    ["estado invalid", { ...VALID_RESPONSE, estado: "unknown" }],
    ["actualizadoEn missing", { ...VALID_RESPONSE, actualizadoEn: undefined }],
    // MUST FIX review iteracion 9 #4: actualizadoEn solo se validaba como string
    // no-vacio, no como timestamp real -- un valor no parseable pasaba el modo test
    // como exitoso, pero el guardado real fallaria al insertar en la columna timestamptz.
    ["actualizadoEn not a real timestamp", { ...VALID_RESPONSE, actualizadoEn: "not-a-date" }],
  ])("rejects: %s", (_label, payload) => {
    const result = validateAndMapRate(payload);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(validateAndMapRate(null).ok).toBe(false);
    expect(validateAndMapRate("oops").ok).toBe(false);
  });
});

describe("fetchProviderRate", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fails before calling fetch when the URL is missing/empty", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await fetchProviderRate("");
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-HTTPS URL before calling fetch", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await fetchProviderRate("http://tc.example.com/oficial");
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // MUST FIX review iteracion 2 #8: defensa en profundidad contra SSRF en modo test —
  // rechaza hosts internos/loopback/metadata de nube antes de hacer fetch.
  it.each([
    ["loopback IPv4", "https://127.0.0.1/oficial"],
    ["loopback name", "https://localhost/oficial"],
    ["cloud metadata endpoint", "https://169.254.169.254/latest/meta-data/"],
    ["private 10.x", "https://10.0.0.5/oficial"],
    ["private 172.16-31.x", "https://172.20.0.5/oficial"],
    ["private 192.168.x", "https://192.168.1.5/oficial"],
    ["IPv6 loopback", "https://[::1]/oficial"],
    ["IPv6 link-local", "https://[fe80::1]/oficial"],
    // MUST FIX review iteracion 6 #2: fe80::/10 es un rango de 64 valores en el primer
    // grupo (fe80-febf), no solo el literal "fe80:" -- fe90/feb0 caian fuera del chequeo
    // original.
    ["IPv6 link-local outside literal fe80 prefix", "https://[fe90::1]/oficial"],
    ["IPv6 link-local outside literal fe80 prefix (febf)", "https://[feb0::1]/oficial"],
    // MUST FIX review iteracion 6 #2: IPv4 mapeado a IPv6 (equivalente a 127.0.0.1) no
    // matcheaba ni el regex de IPv4 ni los prefijos de texto de IPv6.
    ["IPv4-mapped loopback (dotted)", "https://[::ffff:127.0.0.1]/oficial"],
    ["IPv4-mapped loopback (hex)", "https://[::ffff:7f00:1]/oficial"],
    // MUST FIX review iteracion 8 #1: forma "IPv4-compatible" (::a.b.c.d, legacy, sin el
    // prefijo "ffff:") canonicaliza al mismo patron de 2 hextets que la forma mapeada de
    // arriba pero sin ese prefijo -- new URL("https://[::127.0.0.1]/").hostname da
    // "[::7f00:1]", que no matcheaba ningun chequeo existente.
    ["IPv4-compatible loopback (legacy, no ffff prefix)", "https://[::127.0.0.1]/oficial"],
    ["IPv4-compatible cloud metadata (legacy, no ffff prefix)", "https://[::169.254.169.254]/latest/meta-data/"],
  ])("rejects %s before calling fetch", async (_label, url) => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await fetchProviderRate(url);
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("still allows a normal public HTTPS host", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(VALID_RESPONSE),
    }) as unknown as typeof fetch;
    const result = await fetchProviderRate("https://tc-ruizmier-production.up.railway.app/oficial");
    expect(result.ok).toBe(true);
  });

  // MUST FIX review iteracion 3 #2/#5: un host público permitido que redirige hacia
  // adentro (loopback/privado/metadata de nube) no debe seguirse silenciosamente.
  it("passes redirect:\"error\" to fetch, so a redirect response fails instead of being followed", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(VALID_RESPONSE),
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await fetchProviderRate("https://tc.example.com/oficial");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://tc.example.com/oficial",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it("returns a controlled error when the provider responds with a redirect (fetch rejects under redirect:\"error\")", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(
      new TypeError("Failed to fetch"),
    ) as unknown as typeof fetch;
    const result = await fetchProviderRate("https://tc.example.com/oficial");
    expect(result.ok).toBe(false);
  });

  it("returns a controlled error on a non-2xx response (e.g. 500)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const result = await fetchProviderRate("https://tc.example.com/oficial");
    expect(result.ok).toBe(false);
  });

  it("returns a controlled error on invalid JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error("not json")),
    }) as unknown as typeof fetch;
    const result = await fetchProviderRate("https://tc.example.com/oficial");
    expect(result.ok).toBe(false);
  });

  it("returns a controlled error on a network failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
    const result = await fetchProviderRate("https://tc.example.com/oficial");
    expect(result.ok).toBe(false);
  });

  it("returns the parsed body on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(VALID_RESPONSE),
    }) as unknown as typeof fetch;
    const result = await fetchProviderRate("https://tc.example.com/oficial");
    expect(result).toEqual({ ok: true, data: VALID_RESPONSE });
  });
});

describe("handleSync", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(VALID_RESPONSE),
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fails before calling the provider when EXCHANGE_RATE_API_URL is missing", async () => {
    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const db = createFakeDb({ settingUrl: null });
    const result = await handleSync(db);
    expect(result.status).not.toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.upsertCalls).toHaveLength(0);
  });

  it("upserts a brand-new fecha_vigencia (no existing row)", async () => {
    const db = createFakeDb({ settingUrl: "https://tc.example.com/oficial", historyRow: null });
    const result = await handleSync(db);
    expect(result.status).toBe(200);
    expect(result.payload.written).toBe(true);
    expect(db.upsertCalls).toHaveLength(1);
    expect(db.upsertCalls[0].fecha_vigencia).toBe("2026-08-26");
  });

  it("is a total no-op when the existing row for that fecha_vigencia is identical", async () => {
    const identicalRow: Row = {
      compra: 11.57, venta: 11.67, moneda: "USD/BOB", fuente: "Banco Central de Bolivia",
      regimen: "flexible", version_metodologia: "RD BCB 88/2026", canal: "bcb-web",
      fecha_publicacion: "2026-08-25", actualizado_en: "2026-08-25T22:34:47.473-04:00",
      estado: "vigente",
    };
    const db = createFakeDb({ settingUrl: "https://tc.example.com/oficial", historyRow: identicalRow });
    const result = await handleSync(db);
    expect(result.status).toBe(200);
    expect(result.payload.written).toBe(false);
    expect(db.upsertCalls).toHaveLength(0);
  });

  // MUST FIX review iteracion 7 #3: actualizado_en es timestamptz -- PostgREST normaliza
  // su representacion al leerlo de vuelta (mismo instante, offset distinto al que mandó
  // el proveedor). Antes, la comparación de string exacto nunca matcheaba en este caso,
  // así que TODO sync terminaba en un UPSERT innecesario pese a no haber cambiado nada.
  it("is still a no-op when actualizado_en represents the same instant with a different offset (PostgREST normalization)", async () => {
    const normalizedRow: Row = {
      compra: 11.57, venta: 11.67, moneda: "USD/BOB", fuente: "Banco Central de Bolivia",
      regimen: "flexible", version_metodologia: "RD BCB 88/2026", canal: "bcb-web",
      fecha_publicacion: "2026-08-25",
      // Mismo instante que "2026-08-25T22:34:47.473-04:00" (VALID_RESPONSE), normalizado a UTC.
      actualizado_en: "2026-08-26T02:34:47.473+00:00",
      estado: "vigente",
    };
    const db = createFakeDb({ settingUrl: "https://tc.example.com/oficial", historyRow: normalizedRow });
    const result = await handleSync(db);
    expect(result.status).toBe(200);
    expect(result.payload.written).toBe(false);
    expect(db.upsertCalls).toHaveLength(0);
  });

  it("updates the row when at least one field changed for the same fecha_vigencia", async () => {
    const staleRow: Row = {
      compra: 11.5 /* changed */, venta: 11.67, moneda: "USD/BOB", fuente: "Banco Central de Bolivia",
      regimen: "flexible", version_metodologia: "RD BCB 88/2026", canal: "bcb-web",
      fecha_publicacion: "2026-08-25", actualizado_en: "2026-08-25T22:34:47.473-04:00",
      estado: "vigente",
    };
    const db = createFakeDb({ settingUrl: "https://tc.example.com/oficial", historyRow: staleRow });
    const result = await handleSync(db);
    expect(result.status).toBe(200);
    expect(result.payload.written).toBe(true);
    expect(db.upsertCalls).toHaveLength(1);
  });

  it("writes nothing and returns 502 when the provider returns 500", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const db = createFakeDb({ settingUrl: "https://tc.example.com/oficial", historyRow: null });
    const result = await handleSync(db);
    expect(result.status).toBe(502);
    expect(db.upsertCalls).toHaveLength(0);
  });

  it("writes nothing and returns 400 on an invalid payload", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve({ ...VALID_RESPONSE, compra: -1 }),
    }) as unknown as typeof fetch;
    const db = createFakeDb({ settingUrl: "https://tc.example.com/oficial", historyRow: null });
    const result = await handleSync(db);
    expect(result.status).toBe(400);
    expect(db.upsertCalls).toHaveLength(0);
  });

  // MUST FIX review iteracion 2 #6: los 3 errores de base de datos nunca deben exponer
  // el mensaje crudo de Postgres/PostgREST al caller (esta funcion no requiere auth).
  it("returns only the error code, never the raw Postgres message, when reading the setting fails", async () => {
    const db = createFakeDb({ settingReadError: { message: "relation \"global_settings\" does not exist" } });
    const result = await handleSync(db);
    expect(result.status).toBe(500);
    expect(result.payload).toEqual({ error: { code: "settings_read_failed" } });
  });

  it("returns only the error code, never the raw Postgres message, when reading the existing row fails", async () => {
    const db = createFakeDb({ settingUrl: "https://tc.example.com/oficial", historyReadError: { message: "connection reset by peer" } });
    const result = await handleSync(db);
    expect(result.status).toBe(500);
    expect(result.payload).toEqual({ error: { code: "history_read_failed" } });
  });

  it("returns only the error code, never the raw Postgres message, when the upsert fails", async () => {
    const db = createFakeDb({ settingUrl: "https://tc.example.com/oficial", historyRow: null, upsertError: { message: "duplicate key value violates unique constraint" } });
    const result = await handleSync(db);
    expect(result.status).toBe(500);
    expect(result.payload).toEqual({ error: { code: "upsert_failed" } });
  });
});

describe("handleTest", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the parsed rate without any DB write on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: () => Promise.resolve(VALID_RESPONSE),
    }) as unknown as typeof fetch;
    const result = await handleTest("https://tc.example.com/oficial");
    expect(result.status).toBe(200);
    expect(result.payload.written).toBe(false);
    expect(result.payload.fecha_vigencia).toBe("2026-08-26");
  });

  it("returns a controlled error payload on a provider failure, never throws", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
    const result = await handleTest("https://tc.example.com/oficial");
    expect(result.status).toBe(502);
    expect(result.payload.error).toBeTruthy();
  });

  it("rejects a missing URL with 400 before fetching", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const result = await handleTest(undefined);
    expect(result.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// MUST FIX review iteracion 1 #6: the SSRF/admin boundary for test mode, extracted from
// index.ts so it can run here instead of being covered only by manual post-deploy checks.
describe("authorizeTestMode", () => {
  function fakeAuthClient(opts: {
    getUserResult?: { data: { user: unknown } | null; error: unknown };
    hasPermission?: boolean;
    rpcError?: unknown;
  }): AuthClient {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue(
          opts.getUserResult ?? { data: { user: { id: "admin-1" } }, error: null },
        ),
      },
      rpc: vi.fn().mockResolvedValue({ data: opts.hasPermission ?? true, error: opts.rpcError ?? null }),
    };
  }

  it("rejects with 401 when the Authorization header is missing, without calling the client", async () => {
    const client = fakeAuthClient({});
    const result = await authorizeTestMode(client, null);
    expect(result?.status).toBe(401);
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the Authorization header does not carry a Bearer token", async () => {
    const client = fakeAuthClient({});
    const result = await authorizeTestMode(client, "Basic sometoken");
    expect(result?.status).toBe(401);
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("rejects with 401 when the token is invalid, without checking permissions", async () => {
    const client = fakeAuthClient({ getUserResult: { data: null, error: { message: "invalid" } } });
    const result = await authorizeTestMode(client, "Bearer bad-token");
    expect(result?.status).toBe(401);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects with 403 when the authenticated caller lacks global_settings.update — the SSRF guard for an arbitrary caller-supplied URL", async () => {
    const client = fakeAuthClient({ hasPermission: false });
    const result = await authorizeTestMode(client, "Bearer valid-token");
    expect(result?.status).toBe(403);
    expect(result?.payload).toEqual({ error: { code: "forbidden", message: "Requires global_settings.update" } });
  });

  it("rejects with 403 when the permission RPC itself errors (fail closed, never fail open)", async () => {
    const client = fakeAuthClient({ hasPermission: undefined, rpcError: { message: "rpc failed" } });
    const result = await authorizeTestMode(client, "Bearer valid-token");
    expect(result?.status).toBe(403);
  });

  it("returns null (authorized) for a valid admin JWT with the required permission", async () => {
    const client = fakeAuthClient({ hasPermission: true });
    const result = await authorizeTestMode(client, "Bearer valid-token");
    expect(result).toBeNull();
  });
});
