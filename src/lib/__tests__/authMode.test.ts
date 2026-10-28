import { describe, it, expect } from "vitest";
import { readOAuthReturnError, resolveAuthMode } from "../authMode";

describe("readOAuthReturnError", () => {
  it("lee el error de la query", () => {
    expect(readOAuthReturnError("?error=access_denied&error_description=cancelled", "")).toEqual({
      code: "access_denied",
      description: "cancelled",
    });
  });

  it("lee el error del fragmento", () => {
    expect(readOAuthReturnError("", "#error=server_error&error_description=AADSTS65001")).toEqual({
      code: "server_error",
      description: "AADSTS65001",
    });
  });

  it("sin error devuelve null (incluido el regreso exitoso con tokens)", () => {
    expect(readOAuthReturnError("", "")).toBeNull();
    expect(readOAuthReturnError("", "#access_token=x&refresh_token=y")).toBeNull();
  });
});

const row = (setting_value: string | null) => [{ setting_key: "AUTH_MODE", setting_value }];

describe("resolveAuthMode", () => {
  it("clave ausente = password (pantalla de siempre)", () => {
    expect(resolveAuthMode([{ setting_key: "LANGUAGE", setting_value: "es" }])).toBe("password");
  });

  it("devuelve el modo guardado cuando es válido", () => {
    expect(resolveAuthMode(row("password"))).toBe("password");
    expect(resolveAuthMode(row("entra"))).toBe("entra");
  });

  it("un valor inválido no se interpreta como password", () => {
    expect(resolveAuthMode(row("both"))).toBe("invalid");
    expect(resolveAuthMode(row("ENTRA"))).toBe("invalid");
    expect(resolveAuthMode(row(""))).toBe("invalid");
    expect(resolveAuthMode(row(null))).toBe("invalid");
  });

  it("un error de lectura no se interpreta como password", () => {
    expect(resolveAuthMode(undefined, { isError: true })).toBe("error");
    expect(resolveAuthMode(row("password"), { isError: true })).toBe("error");
  });

  it("mientras carga no decide", () => {
    expect(resolveAuthMode(undefined)).toBe("loading");
    expect(resolveAuthMode(undefined, { isLoading: true })).toBe("loading");
  });
});
