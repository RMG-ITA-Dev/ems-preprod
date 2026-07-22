import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCopyToCurrentWeek } from "../useTimesheetMutations";
import { getWeekMonday } from "@/lib/timesheetUtils";

/**
 * BUG 0526-122 (Iteracion 2, review #2): useCopyToCurrentWeek fetched
 * `holidays` by date only, ignoring `oficina`. A staff member copying a
 * week containing another office's departmental holiday would have their
 * real hours skipped and a holiday-engagement entry auto-inserted instead.
 * This suite pins the fix: only holidays applicable to the staff's city
 * (oficina=0, or oficina matching staffCity) are treated as holidays.
 */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Source week: Mon 2026-09-21 .. Fri 2026-09-25, includes 2026-09-24
// (Aniversario de Santa Cruz, oficina=2).
const SOURCE_WEEK_START = new Date("2026-09-21T12:00:00");
const SOURCE_ENTRY = {
  engagement_id: "eng-1",
  activity_id: "act-1",
  date_worked: "2026-09-24",
  hours_logged: 8,
};

function mockSupabaseFrom() {
  let timeEntriesCall = 0;

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === "timesheet_periods") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      } as any;
    }

    if (table === "time_entries") {
      timeEntriesCall += 1;
      if (timeEntriesCall === 1) {
        // Step 5: destination entries check -- must be empty
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          }),
        } as any;
      }
      if (timeEntriesCall === 2) {
        // Step 6: source entries
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [SOURCE_ENTRY], error: null }),
                }),
              }),
            }),
          }),
        } as any;
      }
      // Step 13: insert
      return { insert: vi.fn().mockResolvedValue({ error: null }) } as any;
    }

    if (table === "holidays") {
      return {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockResolvedValue({
              data: [
                { holiday_date: "2026-09-24", oficina: 2 }, // Santa Cruz only
              ],
              error: null,
            }),
          }),
        }),
      } as any;
    }

    if (table === "global_settings") {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              { setting_key: "HOLIDAY_ENGAGEMENT_ID", setting_value: "eng-holiday" },
              { setting_key: "ADM_ACTIVITY_ID", setting_value: "act-adm" },
              { setting_key: "DAILY_MIN", setting_value: "8" },
            ],
            error: null,
          }),
        }),
      } as any;
    }

    if (table === "engagements") {
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ engagement_id: "eng-1", start_date: null, end_date: null }],
            error: null,
          }),
        }),
      } as any;
    }

    throw new Error(`Unexpected table: ${table}`);
  });
}

describe("useCopyToCurrentWeek — office scope (BUG 0526-122)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // "Today" resolves destWeekStart to a Monday outside the source week,
    // so the copy isn't a same-week no-op. Only fake Date (not setTimeout),
    // so testing-library's waitFor polling still advances normally.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not treat another office's holiday as a holiday for this staff (La Paz staff, Santa Cruz-only date)", async () => {
    mockSupabaseFrom();
    const destWeekStart = getWeekMonday(new Date());
    expect(destWeekStart.getTime()).not.toBe(SOURCE_WEEK_START.getTime());

    const { result } = renderHook(() => useCopyToCurrentWeek(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      staffId: "staff-lp",
      staffCity: "La Paz",
      sourceWeekStart: SOURCE_WEEK_START,
      workDays: 5,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Rule 3/4 path (neither side treated as holiday): real hours copied
    // as-is, no holiday skip/auto-insert.
    expect(result.current.data?.copiedCount).toBe(1);
    expect(result.current.data?.holidaySkippedCount).toBe(0);
    expect(result.current.data?.holidayAutoCount).toBe(0);
  });

  it("still treats the date as a holiday for Santa Cruz staff (regression guard)", async () => {
    mockSupabaseFrom();

    const { result } = renderHook(() => useCopyToCurrentWeek(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      staffId: "staff-sc",
      staffCity: "Santa Cruz",
      sourceWeekStart: SOURCE_WEEK_START,
      workDays: 5,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Rule 1 path (source holiday, dest not): real hours skipped, no auto-insert.
    expect(result.current.data?.copiedCount).toBe(0);
    expect(result.current.data?.holidaySkippedCount).toBe(1);
    expect(result.current.data?.holidayAutoCount).toBe(0);
  });
});
