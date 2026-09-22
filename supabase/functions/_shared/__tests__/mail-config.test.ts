import { describe, it, expect, afterEach, vi } from "vitest";
import { correoHabilitado } from "../mail-config.ts";

/**
 * `MAIL_ENABLED` decide si un correo sale de verdad o se simula, y simular devuelve éxito. Un
 * valor que no se entiende no puede resolverse a "simular": el alta crearía la cuenta y mandaría
 * al usuario a revisar una casilla vacía, y el drenaje cerraría la fila en `sent`. Nada en los
 * logs lo distinguiría de un envío real.
 */
function conMailEnabled(valor: string | undefined) {
  // El módulo lee el entorno con `Deno.env.get`, que en vitest no existe. Se monta el mínimo.
  (globalThis as { Deno?: unknown }).Deno = {
    env: { get: (clave: string) => (clave === "MAIL_ENABLED" ? valor : undefined) },
  };
}

afterEach(() => {
  delete (globalThis as { Deno?: unknown }).Deno;
  vi.restoreAllMocks();
});

describe("correoHabilitado", () => {
  it('"true" envia y "false" simula', () => {
    conMailEnabled("true");
    expect(correoHabilitado()).toBe(true);

    conMailEnabled("false");
    expect(correoHabilitado()).toBe(false);
  });

  it("acepta espacios y mayusculas, que no cambian la decision", () => {
    conMailEnabled("  TRUE ");
    expect(correoHabilitado()).toBe(true);

    conMailEnabled(" False");
    expect(correoHabilitado()).toBe(false);
  });

  it("sin valor lanza en vez de asumir que se simula", () => {
    conMailEnabled(undefined);
    expect(() => correoHabilitado()).toThrow(/Falta el secreto MAIL_ENABLED/);

    conMailEnabled("   ");
    expect(() => correoHabilitado()).toThrow(/Falta el secreto MAIL_ENABLED/);
  });

  it("un valor mal escrito lanza, y no cae en simular", () => {
    // El caso que motiva la guarda: `tru` resolvia a false, o sea a simular y reportar exito.
    for (const basura of ["tru", "1", "yes", "si", "on", "TRUE!", "falso"]) {
      conMailEnabled(basura);
      expect(() => correoHabilitado(), `MAIL_ENABLED=${basura}`).toThrow(
        /no se entiende/,
      );
    }
  });

  it("el error dice que valor llego, para no tener que adivinar el typo", () => {
    conMailEnabled("tru");
    expect(() => correoHabilitado()).toThrow(/"tru"/);
  });
});
