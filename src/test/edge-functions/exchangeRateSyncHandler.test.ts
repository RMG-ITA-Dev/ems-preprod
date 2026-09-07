// Handler tests for exchange-rate-sync (bug 0722-156, Fase 1 — plan_v2.md Tests to Add).
// Mirrors the scheduler-gaps/scheduler-data convention: handler.ts has no Deno-only imports,
// so it runs unmodified against an in-memory fake here. index.ts (CORS, JWT verification,
// the has_permission admin gate for test mode) is Deno-only glue and is NOT unit-tested —
// same split as resolveIdentity in scheduler-gaps/scheduler-data, verified instead by direct
// invocation after deploy (plan_v2.md Verification Step 9).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchProviderRate,
  handleSync,
  handleTest,
  validateAndMapRate,
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
                    return {
                      data: opts.settingUrl == null ? null : { setting_value: opts.settingUrl },
                      error: null,
                    };
                  }
                  return { data: opts.historyRow ?? null, error: null };
                },
              };
            },
          };
        },
        async upsert(row: Row, _conflict: { onConflict: string }) {
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
    ["canal invalid", { ...VALID_RESPONSE, canal: "bcb-fax" }],
    ["estado invalid", { ...VALID_RESPONSE, estado: "unknown" }],
    ["actualizadoEn missing", { ...VALID_RESPONSE, actualizadoEn: undefined }],
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
