import { describe, it, expect } from "vitest";
import { accountDisplayName, accountInitials } from "../userDisplay";

describe("accountDisplayName", () => {
  it("cuenta con contraseña: first_name + last_name", () => {
    expect(accountDisplayName({ first_name: "Ana", last_name: "Pérez" })).toBe("Ana Pérez");
    expect(accountDisplayName({ first_name: "Ana" })).toBe("Ana");
  });

  it("cuenta de Microsoft: full_name, o name si no hay full_name", () => {
    expect(accountDisplayName({ full_name: "Ana Pérez", name: "Otro" })).toBe("Ana Pérez");
    expect(accountDisplayName({ name: "Ana Pérez" })).toBe("Ana Pérez");
  });

  it("sin nombre devuelve null", () => {
    expect(accountDisplayName({})).toBeNull();
    expect(accountDisplayName(undefined)).toBeNull();
    expect(accountDisplayName({ full_name: "   " })).toBeNull();
  });
});

describe("accountInitials", () => {
  it("cuenta con contraseña", () => {
    expect(accountInitials({ first_name: "ana", last_name: "pérez" }, "x@y.com")).toBe("AP");
  });

  it("cuenta de Microsoft: primeras letras de las dos primeras palabras", () => {
    expect(accountInitials({ full_name: "Ana María Pérez" }, "x@y.com")).toBe("AM");
    expect(accountInitials({ name: "Neil" }, "x@y.com")).toBe("NE");
  });

  it("sin nombre cae al correo, y sin correo a U", () => {
    expect(accountInitials({}, "neil@ruizmier.com")).toBe("NE");
    expect(accountInitials(undefined, undefined)).toBe("U");
  });
});
