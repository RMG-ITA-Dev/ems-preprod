// Cobranzas Fase 9 — la suma de los ajustes de una cuota, en el cliente.
//
// Es el espejo de `public.installment_adjustments_total()`. Si los dos divergen, el síntoma es
// una cuota que en la OT dice que quedan X y en Cobranzas dice que quedan Y, que es la clase de
// desacuerdo que nadie sabe cómo resolver. Estas aserciones fijan las dos reglas que importan:
// los retirados no suman, y nunca se mezclan monedas.

import { describe, it, expect } from "vitest";
import {
  adjustmentsForInstallment,
  adjustmentsTotal,
  type InstallmentAdjustment,
} from "@/hooks/useInstallmentAdjustments";

const adj = (over: Partial<InstallmentAdjustment>): InstallmentAdjustment => ({
  adjustment_id: Math.random().toString(36).slice(2),
  installment_id: "i1",
  wo_id: "wo1",
  adjustment_type: "descuento",
  amount: -100,
  currency: "BOB",
  reason: "acuerdo comercial",
  created_by_staff_id: "s1",
  created_at: "2026-06-01T00:00:00Z",
  deleted_at: null,
  ...over,
});

describe("adjustmentsTotal", () => {
  it("suma los descuentos vigentes de la cuota", () => {
    const list = [adj({ amount: -100 }), adj({ amount: -50 })];
    expect(adjustmentsTotal(list, "i1", "BOB")).toBe(-150);
  });

  it("un ajuste retirado deja de sumar, pero la fila sigue estando", () => {
    // Retirar no borra: la fila queda para explicar por qué la cuota cambió de monto a cobrar
    // entre dos momentos. Lo que no hace es seguir restando.
    const list = [adj({ amount: -100 }), adj({ amount: -50, deleted_at: "2026-06-02T00:00:00Z" })];
    expect(adjustmentsTotal(list, "i1", "BOB")).toBe(-100);
    expect(adjustmentsForInstallment(list, "i1")).toHaveLength(2);
  });

  it("NO mezcla monedas: una diferencia de cambio en Bs no toca una cuota en USD", () => {
    // Es la regla de todo el módulo. Un descuento va en la moneda de la cuota; la diferencia
    // entre dos TC es un monto en bolivianos. Sumarlos daría un número sin significado.
    const list = [
      adj({ amount: -100, currency: "USD" }),
      adj({ adjustment_type: "diferencia_cambio", amount: 45, currency: "BOB" }),
    ];
    expect(adjustmentsTotal(list, "i1", "USD")).toBe(-100);
    expect(adjustmentsTotal(list, "i1", "BOB")).toBe(45);
  });

  it("no toma los ajustes de otra cuota", () => {
    const list = [adj({ amount: -100 }), adj({ installment_id: "i2", amount: -999 })];
    expect(adjustmentsTotal(list, "i1", "BOB")).toBe(-100);
  });

  it("sin ajustes, sin cuota o sin datos todavía, el total es 0", () => {
    // La pantalla pinta antes de que llegue la consulta: cero significa "no hay ajustes", y
    // tiene que verse igual que "todavía no sé", nunca NaN.
    expect(adjustmentsTotal([], "i1", "BOB")).toBe(0);
    expect(adjustmentsTotal(undefined, "i1", "BOB")).toBe(0);
    expect(adjustmentsTotal([adj({})], null, "BOB")).toBe(0);
    expect(adjustmentsTotal([adj({})], undefined, "BOB")).toBe(0);
  });
});

describe("adjustmentsForInstallment", () => {
  it("devuelve los de esa cuota, retirados incluidos", () => {
    const list = [
      adj({ amount: -100 }),
      adj({ amount: -50, deleted_at: "2026-06-02T00:00:00Z" }),
      adj({ installment_id: "i2" }),
    ];
    expect(adjustmentsForInstallment(list, "i1")).toHaveLength(2);
  });

  it("sin cuota devuelve una lista vacía, no todos", () => {
    expect(adjustmentsForInstallment([adj({})], null)).toEqual([]);
  });
});
