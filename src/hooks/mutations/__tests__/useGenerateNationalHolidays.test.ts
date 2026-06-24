import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useGenerateNationalHolidays } from "../useHolidayMutations";
import { getBoliviaNationalHolidays } from "@/lib/boliviaHolidays";

vi.mock("@/lib/logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const TARGET_YEAR = 2027;
const GENERATED = getBoliviaNationalHolidays(TARGET_YEAR);

describe("useGenerateNationalHolidays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GH1 — happy path: inserts full set when target year is empty", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "holidays") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert: insertMock,
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useGenerateNationalHolidays(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      created: GENERATED.length,
      skipped: 0,
      total: GENERATED.length,
      year: TARGET_YEAR,
    });

    const insertedRows: { holiday_date: string; holiday_name: string; created_by: string }[] =
      insertMock.mock.calls[0][0];
    expect(insertedRows).toHaveLength(GENERATED.length);
    // Every row must carry created_by
    expect(insertedRows.every((r) => r.created_by === "staff-1")).toBe(true);
    // Dates must match what the generator computed
    const insertedDates = insertedRows.map((r) => r.holiday_date).sort();
    const generatedDates = GENERATED.map((g) => g.date).sort();
    expect(insertedDates).toEqual(generatedDates);

    expect(toast.success).toHaveBeenCalled();
  });

  it("GH2 — all exist: throws allNationalAlreadyExist", async () => {
    const existingRows = GENERATED.map((g) => ({ holiday_date: g.date }));

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "holidays") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: existingRows, error: null }),
            }),
          }),
          insert: vi.fn(),
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useGenerateNationalHolidays(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toContain("holiday.allNationalAlreadyExist");
  });

  it("GH3 — partial: inserts missing, skips existing", async () => {
    // Pre-load 3 existing holidays
    const existingThree = GENERATED.slice(0, 3).map((g) => ({ holiday_date: g.date }));
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "holidays") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: existingThree, error: null }),
            }),
          }),
          insert: insertMock,
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useGenerateNationalHolidays(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      created: GENERATED.length - 3,
      skipped: 3,
      total: GENERATED.length,
      year: TARGET_YEAR,
    });
    const insertedRows: { holiday_date: string }[] = insertMock.mock.calls[0][0];
    expect(insertedRows).toHaveLength(GENERATED.length - 3);
  });

  it("GH4 — invalidates both query keys on success", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "holidays") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
          insert: insertMock,
        } as any;
      }
      return {} as any;
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper });

    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["holidays"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["holidays-week"] });
  });
});
