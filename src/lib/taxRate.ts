// R403-10: la tasa de impuestos sobre honorarios (TAX_RATE, 16 % = IVA 13 % + IT 3 %, D28) alimenta divisiones exactas en centavos
// (`grossCents`, `1 − tasa`). Una tasa fuera de [0, 1) o no numérica no tiene resultado válido: se valida al guardar y, al leer,
// se cae al valor por defecto en lugar de romper el renderizado de las OT.
export const DEFAULT_TAX_RATE = 0.16;

export const isValidTaxRate = (rate: number): boolean => Number.isFinite(rate) && rate >= 0 && rate < 1;

export function normalizeTaxRate(value: unknown, fallback: number = DEFAULT_TAX_RATE): number {
  const rate = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return isValidTaxRate(rate) ? rate : fallback;
}
