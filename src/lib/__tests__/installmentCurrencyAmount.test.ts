// Cobranzas Fase 6 — el monto de una cuota que se cobra en otra moneda.
//
// Decisión del operador (2026-10-20): el cliente paga **el mismo valor convertido**, no un
// monto distinto. Si esto se rompe, el síntoma es silencioso y caro: la cuota queda con el
// número de dólares y la etiqueta de bolivianos al lado, y se le factura al cliente la décima
// parte de lo que debía.

import { describe, it, expect } from "vitest";
import { computeAmount, computeAmountInCurrency, convertAmount } from "@/lib/workOrderPaymentPlan";

const FEE_USD = 3154.03; // honorario con IVA de una OT en USD
const RATE = 11.7; // bolivianos por dólar

describe("computeAmountInCurrency", () => {
  it("en la moneda de la OT no convierte nada", () => {
    expect(computeAmountInCurrency(30, FEE_USD, "USD", "USD", RATE)).toBe(computeAmount(30, FEE_USD));
  });

  it("una cuota en Bs de una OT en USD se multiplica por el TC del plan", () => {
    // 30% de 3154,03 = 946,21 USD → 946,21 × 11,70 = 11.070,66 Bs.
    expect(computeAmountInCurrency(30, FEE_USD, "BOB", "USD", RATE)).toBe(11070.66);
  });

  it("el porcentaje sigue significando lo mismo: las partes suman el honorario entero", () => {
    // 40 + 30 + 30 convertidos a Bs tienen que dar el honorario convertido a Bs. Si no, el
    // plan dejaría de repartir el 100% en cuanto una cuota cambia de moneda.
    const total =
      computeAmountInCurrency(40, FEE_USD, "BOB", "USD", RATE) +
      computeAmountInCurrency(30, FEE_USD, "BOB", "USD", RATE) +
      computeAmountInCurrency(30, FEE_USD, "BOB", "USD", RATE);
    expect(total).toBeCloseTo(FEE_USD * RATE, 1);
  });

  it("convierte en el otro sentido cuando la OT va en Bs", () => {
    // Caso defensivo: la pantalla no lo ofrece, pero la función no puede devolver un número
    // en la moneda equivocada si alguna vez llega por otra vía.
    expect(computeAmountInCurrency(100, 1170, "USD", "BOB", RATE)).toBe(100);
  });

  it("sin tipo de cambio devuelve el monto sin tocar, en vez de inventar una conversión", () => {
    // Un TC nulo o cero daría Infinity o 0: las dos cosas peores que no convertir.
    expect(computeAmountInCurrency(30, FEE_USD, "BOB", "USD", null)).toBe(computeAmount(30, FEE_USD));
    expect(computeAmountInCurrency(30, FEE_USD, "BOB", "USD", 0)).toBe(computeAmount(30, FEE_USD));
    expect(computeAmountInCurrency(30, FEE_USD, "BOB", "USD", undefined)).toBe(computeAmount(30, FEE_USD));
  });

  it("redondea a dos decimales, que es lo que se factura", () => {
    const v = computeAmountInCurrency(33.33, FEE_USD, "BOB", "USD", RATE);
    expect(v).toBe(parseFloat(v.toFixed(2)));
  });
});

describe("convertAmount — la fila de gastos que cambia de moneda", () => {
  // Hallazgo de la revisión previa al PR (2026-10-22): cambiar la moneda de la fila de gastos
  // sólo cambiaba la etiqueta, así que Bs 574,71 pasaban a ser USD 574,71 — unas siete veces lo
  // gastado. Ahora el monto viaja convertido en la misma sentencia que la moneda.

  it("de Bs a la moneda de la OT divide por el TC", () => {
    expect(convertAmount(696, "BOB", "USD", 6.96)).toBe(100);
  });

  it("de la moneda de la OT a Bs multiplica por el TC", () => {
    expect(convertAmount(100, "USD", "BOB", 6.96)).toBe(696);
  });

  it("misma moneda, mismo monto", () => {
    expect(convertAmount(574.71, "BOB", "BOB", 6.96)).toBe(574.71);
  });

  it("sin TC devuelve null en vez de guardar el mismo número con otra etiqueta", () => {
    // Es justamente el error que esto evita: preferible rechazar el cambio que mentir.
    expect(convertAmount(574.71, "BOB", "USD", null)).toBeNull();
    expect(convertAmount(574.71, "BOB", "USD", 0)).toBeNull();
  });

  it("entre dos monedas extranjeras no hay TC del plan que sirva", () => {
    expect(convertAmount(100, "USD", "USDT", 6.96)).toBeNull();
  });
});
