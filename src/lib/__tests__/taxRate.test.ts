import { describe, expect, it } from "vitest";
import { grossCents } from "@/lib/paymentMath.mjs";
import { DEFAULT_TAX_RATE, isValidTaxRate, normalizeTaxRate } from "@/lib/taxRate";

// R403-10: grossCents lanza si el divisor (1 − tasa) no es positivo; la tasa se valida al guardar y se normaliza al leer.
describe("tasa de impuestos sobre honorarios", () => {
  it("el valor por defecto es el 16 % de D28", () => expect(DEFAULT_TAX_RATE).toBe(0.16));

  it("acepta tasas de 0 a menos de 100 % y rechaza el resto", () => {
    for (const ok of [0, 0.13, 0.16, 0.9999]) expect(isValidTaxRate(ok), String(ok)).toBe(true);
    for (const bad of [1, 1.2, -0.01, Number.NaN, Infinity]) expect(isValidTaxRate(bad), String(bad)).toBe(false);
  });

  it("normaliza: conserva lo válido (número o texto) y cae al valor por defecto o al indicado ante lo inválido", () => {
    expect(normalizeTaxRate(0.13)).toBe(0.13); expect(normalizeTaxRate("0.13")).toBe(0.13); expect(normalizeTaxRate(0)).toBe(0);
    for (const bad of [1, 2, -1, "abc", "", null, undefined, Number.NaN]) expect(normalizeTaxRate(bad), String(bad)).toBe(0.16);
    expect(normalizeTaxRate("abc", 0.13)).toBe(0.13);
  });

  it("con la tasa normalizada, grossCents ya no lanza; sin normalizar, sigue lanzando (la barrera es esta)", () => {
    expect(() => grossCents("1000.0000", Number(1).toFixed(4))).toThrow(/divisor inválido/);
    expect(() => grossCents("1000.0000", normalizeTaxRate(1).toFixed(4))).not.toThrow();
    expect(Number(grossCents("1000.0000", normalizeTaxRate(0.16).toFixed(4)))).toBe(119048); // 1000 / 0,84 hacia arriba, igual que antes
  });
});
