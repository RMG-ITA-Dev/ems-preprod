import { describe, it, expect } from "vitest";
import { verificarDominioDeRegistro } from "../dominio-registro.ts";

/**
 * El borde del alta publica. `register-user` corre con `verify_jwt = false`, asi que lo llama
 * cualquiera desde internet y esta funcion es lo unico que decide quien puede crear cuenta.
 */
describe("verificarDominioDeRegistro", () => {
  it("acepta el dominio configurado", () => {
    expect(verificarDominioDeRegistro("persona@ruizmier.com", "ruizmier.com")).toEqual({ ok: true });
  });

  it("no le importan mayusculas ni espacios, ni en el correo ni en el ajuste", () => {
    expect(verificarDominioDeRegistro("  Persona@RuizMier.COM ", " RuizMier.com ")).toEqual({
      ok: true,
    });
  });

  it("rechaza otro dominio", () => {
    expect(verificarDominioDeRegistro("persona@gmail.com", "ruizmier.com")).toEqual({
      ok: false,
      code: "INVALID_DOMAIN",
    });
  });

  // LA REGRESION. El ajuste ausente o vacio caia en `if (dominio && ...)`, que simplemente no
  // evaluaba nada: el alta publica quedaba abierta a CUALQUIER dominio. Y en la misma funcion, un
  // error de lectura de ese mismo ajuste ya fallaba cerrado — el limite se trataba de dos formas
  // opuestas segun como fallara.
  it.each([
    ["null (la fila no existe)", null],
    ["undefined", undefined],
    ["vacio", ""],
    ["solo espacios", "   "],
  ])("sin dominio configurado (%s) NO abre el registro", (_caso, ajuste) => {
    expect(verificarDominioDeRegistro("persona@cualquiera.com", ajuste as string | null)).toEqual({
      ok: false,
      code: "DOMAIN_NOT_CONFIGURED",
    });
  });

  it("distingue el problema del servidor del error de quien se registra", () => {
    // Quien llama traduce DOMAIN_NOT_CONFIGURED a 500 y INVALID_DOMAIN a 400. Decirle "tu dominio
    // no vale" a alguien cuya direccion estaba bien lo manda a revisar lo que no falla.
    const sinConfigurar = verificarDominioDeRegistro("persona@ruizmier.com", null);
    const dominioAjeno = verificarDominioDeRegistro("persona@gmail.com", "ruizmier.com");

    expect(sinConfigurar).not.toEqual(dominioAjeno);
    expect(sinConfigurar.ok).toBe(false);
    expect(dominioAjeno.ok).toBe(false);
  });

  it("un subdominio no es el dominio", () => {
    // `endsWith("@" + dominio)` aceptaba "alguien@ruizmier.com" y rechazaba
    // "alguien@mail.ruizmier.com", pero por el "@" y no por la comparacion. Se afirma explicito:
    // un subdominio es otra organizacion.
    expect(verificarDominioDeRegistro("persona@mail.ruizmier.com", "ruizmier.com")).toEqual({
      ok: false,
      code: "INVALID_DOMAIN",
    });
  });

  it("un correo sin arroba no pasa por descarte", () => {
    expect(verificarDominioDeRegistro("persona", "ruizmier.com")).toEqual({
      ok: false,
      code: "INVALID_DOMAIN",
    });
  });
});
