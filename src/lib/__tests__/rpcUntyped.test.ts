// `rpcUntyped` tiene que llamar a `supabase.rpc` COMO MÉTODO, no desprendido del cliente.
//
// Esto no es un detalle de estilo. `rpc` es un método del prototipo de SupabaseClient y por
// dentro hace `this.rest.rpc(...)`. Guardarlo en una constante —`const rpc = supabase.rpc`—
// lo desprende del cliente, así que al invocarlo `this` queda `undefined` y **toda** llamada
// revienta con `can't access property "rest", this is undefined`.
//
// Pasó de verdad: el puente de cobranzas nació así en la Fase 1 y se copió a otros dos hooks.
// La forma inline —`await (supabase.rpc as unknown as F)(...)`— sí funcionaba: paréntesis
// sobre un acceso a propiedad conserva el receptor. La que rompía era guardarlo en una
// constante, y por eso convivieron las dos sin que se notara.
//
// Ninguna prueba lo vio, porque todas mockean el cliente o el hook que lo usa, y recién
// apareció en la prueba manual contra la base real, con las nueve fases ya escritas. Este test
// mira exactamente eso: que el receptor sobreviva.

import { describe, it, expect, vi, beforeEach } from "vitest";

// La fábrica de vi.mock se iza al tope del archivo, así que no puede leer variables de
// afuera: todo lo que necesita vive adentro.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rest: { marker: "rest-real" },
    // Igual que el cliente real: depende de `this`. Si llega desprendido, tira.
    rpc(this: { rest: { marker: string } }, fn: string, args: Record<string, unknown>) {
      return Promise.resolve({ data: { fn, args, via: this.rest.marker }, error: null });
    },
  },
}));

import { rpcUntyped } from "@/lib/rpcUntyped";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rpcUntyped", () => {
  it("conserva el receptor: la llamada llega con `this` apuntando al cliente", async () => {
    const { data } = await rpcUntyped<{ via: string }>("mi_rpc", { p_id: "1" });
    expect(data.via).toBe("rest-real");
  });

  it("pasa el nombre de la función y los argumentos tal cual", async () => {
    const { data } = await rpcUntyped<{ fn: string; args: Record<string, unknown> }>(
      "add_installment_note",
      { p_wo_id: "wo1", p_body: "hola" },
    );
    expect(data.fn).toBe("add_installment_note");
    expect(data.args).toEqual({ p_wo_id: "wo1", p_body: "hola" });
  });

  it("sin argumentos manda un objeto vacío, no undefined", async () => {
    // `collections_filter_options()` no recibe nada; PostgREST espera un cuerpo igual.
    const { data } = await rpcUntyped<{ args: Record<string, unknown> }>("collections_filter_options");
    expect(data.args).toEqual({});
  });
});
