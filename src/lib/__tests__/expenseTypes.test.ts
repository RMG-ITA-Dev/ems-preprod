import { describe, it, expect } from "vitest";
import { selectableExpenseTypes } from "@/lib/expenseTypes";
import type { ExpenseType } from "@/hooks/useEmsData";

const types: ExpenseType[] = [
  { expense_type_id: "t1", expense_name: "Pasajes", default_unit_cost: 0, is_active: true },
  { expense_type_id: "t2", expense_name: "Taxis", default_unit_cost: 0, is_active: false },
];

describe("selectableExpenseTypes (Fase 1.7)", () => {
  it("ofrece solo los tipos activos para un registro nuevo", () => {
    expect(selectableExpenseTypes(types).map((t) => t.expense_type_id)).toEqual(["t1"]);
  });

  it("conserva el tipo desactivado que ya tiene el registro", () => {
    expect(selectableExpenseTypes(types, "t2").map((t) => t.expense_type_id)).toEqual(["t1", "t2"]);
  });

  it("tolera la lista sin cargar", () => {
    expect(selectableExpenseTypes(undefined)).toEqual([]);
  });
});
