import type { ExpenseType } from "@/hooks/useEmsData";

/**
 * Tipos de gasto que se ofrecen en un selector (Fase 1.7 de docs/plan-contabilidad-gastos.md):
 * solo los activos, MÁS el que ya tiene el registro aunque esté desactivado — si no, al abrir un
 * gasto o un presupuesto viejo el selector quedaría en blanco y se perdería el dato al guardar.
 * La base rechaza igual usar un tipo desactivado en un registro nuevo
 * (trigger validate_expense_type_active).
 */
export function selectableExpenseTypes(
  types: ExpenseType[] | undefined,
  currentId?: string | null,
): ExpenseType[] {
  return (types ?? []).filter((t) => t.is_active !== false || t.expense_type_id === currentId);
}
