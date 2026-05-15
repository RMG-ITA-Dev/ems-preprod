import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useReplicateHolidaysToNextYear } from "../useHolidayMutations";

// Silence logger.error so expected-error test cases don't pollute stdout.
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

describe("useReplicateHolidaysToNextYear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("RH1 — happy path: replicates all holidays to next year", async () => {
    const sourceHolidays = [
      { holiday_date: "2026-01-01", holiday_name: "Año Nuevo" },
      { holiday_date: "2026-05-01", holiday_name: "Día del Trabajo" },
    ];
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "holidays") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn()
                .mockResolvedValueOnce({ data: sourceHolidays, error: null })
                .mockResolvedValueOnce({ data: [], error: null }),
            }),
          }),
          insert: insertMock,
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useReplicateHolidaysToNextYear(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ created_by: "staff-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      created: 2,
      skipped: 0,
      invalidDates: [],
      targetYear: 2027,
    });
    expect(insertMock).toHaveBeenCalledWith([
      { holiday_date: "2027-01-01", holiday_name: "Año Nuevo", created_by: "staff-1" },
      { holiday_date: "2027-05-01", holiday_name: "Día del Trabajo", created_by: "staff-1" },
    ]);
    expect(toast.success).toHaveBeenCalled();
  });

  it("RH2 — all duplicates: throws allDatesAlreadyExist", async () => {
    const sourceHolidays = [
      { holiday_date: "2026-01-01", holiday_name: "Año Nuevo" },
      { holiday_date: "2026-05-01", holiday_name: "Día del Trabajo" },
    ];
    const existingNext = [
      { holiday_date: "2027-01-01" },
      { holiday_date: "2027-05-01" },
    ];

    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: sourceHolidays, error: null }),
          }),
        }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: existingNext, error: null }),
          }),
        }),
      } as any);

    const { result } = renderHook(() => useReplicateHolidaysToNextYear(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ created_by: "staff-1" });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toContain("holiday.allDatesAlreadyExist");
  });

  it("RH3 — skips Feb 29 on non-leap target year and does not call insert", async () => {
    vi.setSystemTime(new Date("2024-06-01T12:00:00"));

    const sourceHolidays = [{ holiday_date: "2024-02-29", holiday_name: "Bisiesto" }];
    const insertMock = vi.fn();

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "holidays") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn()
                .mockResolvedValueOnce({ data: sourceHolidays, error: null })
                .mockResolvedValueOnce({ data: [], error: null }),
            }),
          }),
          insert: insertMock,
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useReplicateHolidaysToNextYear(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ created_by: "staff-1" });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toContain("holiday.allDatesLeapDay");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("RH4 — regular holiday replicates correctly into a leap target year (2027→2028)", async () => {
    // 2027 is not a leap year; 2028 IS a leap year.
    // Verifies the isLeapYear(targetYear)=true branch does not block normal holidays.
    vi.setSystemTime(new Date("2027-06-01T12:00:00"));

    const sourceHolidays = [{ holiday_date: "2027-08-06", holiday_name: "Independencia" }];
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "holidays") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn()
                .mockResolvedValueOnce({ data: sourceHolidays, error: null })
                .mockResolvedValueOnce({ data: [], error: null }),
            }),
          }),
          insert: insertMock,
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useReplicateHolidaysToNextYear(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ created_by: "staff-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(insertMock).toHaveBeenCalledWith([
      { holiday_date: "2028-08-06", holiday_name: "Independencia", created_by: "staff-1" },
    ]);
    expect(result.current.data?.invalidDates).toEqual([]);
  });

  it("RH5 — no source holidays: throws noSourceHolidays", async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "holidays") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockResolvedValueOnce({ data: [], error: null }),
            }),
          }),
          insert: vi.fn(),
        } as any;
      }
      return {} as any;
    });

    const { result } = renderHook(() => useReplicateHolidaysToNextYear(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ created_by: "staff-1" });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toContain("holiday.noSourceHolidays");
  });

  it("RH6 — partial skip: inserts new, skips existing", async () => {
    const sourceHolidays = [
      { holiday_date: "2026-01-01", holiday_name: "Año Nuevo" },
      { holiday_date: "2026-05-01", holiday_name: "Día del Trabajo" },
      { holiday_date: "2026-08-06", holiday_name: "Independencia" },
    ];
    const existingNext = [{ holiday_date: "2027-05-01" }];
    const insertMock = vi.fn().mockResolvedValue({ error: null });

    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: sourceHolidays, error: null }),
          }),
        }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({ data: existingNext, error: null }),
          }),
        }),
      } as any)
      .mockReturnValueOnce({
        insert: insertMock,
      } as any);

    const { result } = renderHook(() => useReplicateHolidaysToNextYear(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ created_by: "staff-1" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      created: 2,
      skipped: 1,
      invalidDates: [],
      targetYear: 2027,
    });
    expect(insertMock).toHaveBeenCalledWith([
      { holiday_date: "2027-01-01", holiday_name: "Año Nuevo", created_by: "staff-1" },
      { holiday_date: "2027-08-06", holiday_name: "Independencia", created_by: "staff-1" },
    ]);
  });
});
