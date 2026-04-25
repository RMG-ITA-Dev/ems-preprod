/**
 * Coerce any input to a finite number. Returns 0 for null, undefined, NaN,
 * non-numeric strings, ±Infinity, or any other non-finite value.
 */
export function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Type guard that returns true iff `arr` is a non-empty array.
 * After a successful check, TypeScript narrows the value to `readonly T[]`.
 */
export function hasItems<T>(
  arr: readonly T[] | null | undefined,
): arr is readonly T[] {
  return Array.isArray(arr) && arr.length > 0;
}
