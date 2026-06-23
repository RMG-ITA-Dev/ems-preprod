import { describe, it, expect } from "vitest";
import {
  computeExpenseDays,
  computeSettlement,
  expensePhase,
} from "@/lib/fundRequest";

describe("computeExpenseDays", () => {
  it("returns null when there is no start date", () => {
    expect(computeExpenseDays("", "")).toBeNull();
    expect(computeExpenseDays("", "2026-06-10")).toBeNull();
  });

  it("returns 1 for a single date (no end)", () => {
    expect(computeExpenseDays("2026-06-10", "")).toBe(1);
  });

  it("counts the range inclusively", () => {
    expect(computeExpenseDays("2026-06-10", "2026-06-10")).toBe(1);
    expect(computeExpenseDays("2026-06-10", "2026-06-11")).toBe(2);
    expect(computeExpenseDays("2026-06-01", "2026-06-15")).toBe(15);
  });

  it("returns null for an invalid range (end before start)", () => {
    expect(computeExpenseDays("2026-06-15", "2026-06-10")).toBeNull();
  });
});

describe("computeSettlement", () => {
  it("flags balance in favor of the firm when money is left over", () => {
    const r = computeSettlement(50, 40);
    expect(r.balance).toBe(10);
    expect(r.favorsFirm).toBe(true);
    expect(r.favorsRequester).toBe(false);
    expect(r.noBalance).toBe(false);
  });

  it("flags balance in favor of the requester when overspent", () => {
    const r = computeSettlement(40, 65);
    expect(r.balance).toBe(-25);
    expect(r.favorsRequester).toBe(true);
    expect(r.favorsFirm).toBe(false);
    expect(r.noBalance).toBe(false);
  });

  it("reports no balance when exactly spent", () => {
    const r = computeSettlement(40, 40);
    expect(r.balance).toBe(0);
    expect(r.noBalance).toBe(true);
    expect(r.favorsFirm).toBe(false);
    expect(r.favorsRequester).toBe(false);
  });

  it("rounds to 2 decimals and ignores sub-cent noise", () => {
    const r = computeSettlement(40.004, 40);
    expect(r.balance).toBe(0);
    expect(r.noBalance).toBe(true);
  });
});

describe("expensePhase", () => {
  it("is 'review' when there are manager-approved expenses awaiting accounting", () => {
    expect(expensePhase({ total: 3, aprobado_gerente: 2, revisado_asistente: 1 })).toBe("review");
  });

  it("is 'ready' when all expenses are validated (none in flight, none to review)", () => {
    expect(expensePhase({ total: 2, revisado_asistente: 2 })).toBe("ready");
  });

  it("is 'delivered' (not ready) when a rejected expense remains — it's still correctable", () => {
    expect(expensePhase({ total: 2, revisado_asistente: 1, rechazado: 1 })).toBe("delivered");
  });

  it("is 'delivered' when there are no expenses yet", () => {
    expect(expensePhase({ total: 0 })).toBe("delivered");
    expect(expensePhase(undefined)).toBe("delivered");
  });

  it("is 'delivered' when expenses are still in flight (requester/manager)", () => {
    expect(expensePhase({ total: 2, borrador: 1, pendiente_aprobacion: 1 })).toBe("delivered");
    expect(expensePhase({ total: 1, observado: 1 })).toBe("delivered");
  });

  it("prioritizes 'review' over in-flight expenses", () => {
    expect(expensePhase({ total: 2, aprobado_gerente: 1, borrador: 1 })).toBe("review");
  });
});
