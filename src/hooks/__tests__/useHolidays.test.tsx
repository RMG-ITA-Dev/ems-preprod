import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHolidaysForWeek } from "../useHolidays";

/**
 * BUG 0526-122: useHolidaysForWeek filters by the current staff's office.
 * oficina=0 (Todas) always applies; oficina=1 (La Paz) / 2 (Santa Cruz) apply
 * only to staff in the matching city; staff without a city see only Todas.
 */

const staffRecordRef = vi.hoisted(() => ({
  current: undefined as { city: string | null } | null | undefined,
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: staffRecordRef.current }),
}));

const ROWS = [
  { holiday_date: "2026-01-01", holiday_name: "Año Nuevo", oficina: 0 },
  { holiday_date: "2026-07-16", holiday_name: "Aniversario de La Paz", oficina: 1 },
  { holiday_date: "2026-09-24", holiday_name: "Aniversario de Santa Cruz", oficina: 2 },
];

function mockHolidaysSelect(selectSpy: ReturnType<typeof vi.fn>) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table !== "holidays") return {} as any;
    return {
      select: selectSpy.mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: ROWS, error: null }),
        }),
      }),
    } as any;
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const WEEK_DATES = [new Date("2026-01-01T12:00:00"), new Date("2026-01-07T12:00:00")];

describe("useHolidaysForWeek — office scope (BUG 0526-122)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staffRecordRef.current = undefined;
  });

  it("La Paz staff sees Todas + La Paz, not Santa Cruz", async () => {
    const selectSpy = vi.fn();
    mockHolidaysSelect(selectSpy);
    staffRecordRef.current = { city: "La Paz" };

    const { result } = renderHook(() => useHolidaysForWeek(WEEK_DATES), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.size).toBeGreaterThan(0));

    expect(result.current.has("2026-01-01")).toBe(true);
    expect(result.current.has("2026-07-16")).toBe(true);
    expect(result.current.has("2026-09-24")).toBe(false);
  });

  it("Santa Cruz staff sees Todas + Santa Cruz, not La Paz", async () => {
    const selectSpy = vi.fn();
    mockHolidaysSelect(selectSpy);
    staffRecordRef.current = { city: "Santa Cruz" };

    const { result } = renderHook(() => useHolidaysForWeek(WEEK_DATES), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.size).toBeGreaterThan(0));

    expect(result.current.has("2026-01-01")).toBe(true);
    expect(result.current.has("2026-09-24")).toBe(true);
    expect(result.current.has("2026-07-16")).toBe(false);
  });

  it("staff with no city sees only Todas", async () => {
    const selectSpy = vi.fn();
    mockHolidaysSelect(selectSpy);
    staffRecordRef.current = { city: null };

    const { result } = renderHook(() => useHolidaysForWeek(WEEK_DATES), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.size).toBe(1));

    expect(result.current.has("2026-01-01")).toBe(true);
    expect(result.current.has("2026-07-16")).toBe(false);
    expect(result.current.has("2026-09-24")).toBe(false);
  });

  it("does not query until the staff record has resolved (even to null)", async () => {
    const selectSpy = vi.fn();
    mockHolidaysSelect(selectSpy);
    staffRecordRef.current = undefined; // still loading

    const { result } = renderHook(() => useHolidaysForWeek(WEEK_DATES), { wrapper: createWrapper() });

    // Give any pending microtasks a chance to run, then assert no query fired.
    await new Promise((r) => setTimeout(r, 10));
    expect(selectSpy).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });
});
