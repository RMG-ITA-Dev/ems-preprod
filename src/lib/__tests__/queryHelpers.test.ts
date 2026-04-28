import { describe, it, expect } from 'vitest';
import { safeNumber, hasItems } from '../queryHelpers';

describe('safeNumber', () => {
  it('returns the value for a valid finite number', () => {
    expect(safeNumber(5)).toBe(5);
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(-3.14)).toBe(-3.14);
  });

  it('parses numeric strings', () => {
    expect(safeNumber('5.5')).toBe(5.5);
    expect(safeNumber('0')).toBe(0);
    expect(safeNumber('-7')).toBe(-7);
  });

  it('returns 0 for null', () => {
    expect(safeNumber(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(safeNumber(undefined)).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(safeNumber(Number.NaN)).toBe(0);
  });

  it('returns 0 for Infinity and -Infinity', () => {
    expect(safeNumber(Number.POSITIVE_INFINITY)).toBe(0);
    expect(safeNumber(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it('returns 0 for non-numeric strings', () => {
    expect(safeNumber('abc')).toBe(0);
    expect(safeNumber('')).toBe(0);
    expect(safeNumber('5abc')).toBe(0);
  });

  it('returns 0 for objects, arrays, and other non-numeric values', () => {
    expect(safeNumber({})).toBe(0);
    expect(safeNumber([1, 2])).toBe(0);
    expect(safeNumber(true)).toBe(1);
    expect(safeNumber(false)).toBe(0);
  });
});

describe('hasItems', () => {
  it('returns false for an empty array', () => {
    expect(hasItems([])).toBe(false);
  });

  it('returns false for null', () => {
    expect(hasItems(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(hasItems(undefined)).toBe(false);
  });

  it('returns true for a single-element array', () => {
    expect(hasItems([1])).toBe(true);
  });

  it('returns true for a multi-element array', () => {
    expect(hasItems([1, 2, 3])).toBe(true);
    expect(hasItems(['a', 'b'])).toBe(true);
  });

  it('narrows the type after a positive check', () => {
    const maybe: number[] | null = [1, 2, 3] as number[] | null;
    if (hasItems(maybe)) {
      // Type-only assertion: maybe is narrowed to readonly number[].
      // .length and indexing must be accessible without a null check.
      const len: number = maybe.length;
      const first: number = maybe[0];
      expect(len).toBe(3);
      expect(first).toBe(1);
    }
  });
});
