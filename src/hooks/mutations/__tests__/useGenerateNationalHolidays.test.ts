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

// Helper: build a mock supabase chain that returns existingRows for the select query
// and resolves deleteMock / insertMock for delete / insert operations.
function mockHolidaysTable(
  existingRows: { holiday_id: string; holiday_date: string; holiday_name: string; oficina?: number }[],
  deleteMock: ReturnType<typeof vi.fn>,
  insertMock: ReturnType<typeof vi.fn>,
) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table !== "holidays") return {} as any;
    return {
      select: vi.fn().mockReturnValue({
        gte: vi.fn().mockReturnValue({
          lte: vi.fn().mockResolvedValue({ data: existingRows, error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        in: deleteMock,
      }),
      insert: insertMock,
    } as any;
  });
}

describe("useGenerateNationalHolidays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GH1 — happy path: empty target year → inserts all holidays (nationals + departmentals)", async () => {
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockHolidaysTable([], deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper: createWrapper() });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      created: GENERATED.length,
      replaced: 0,
      skipped: 0,
      total: GENERATED.length,
      year: TARGET_YEAR,
    });
    const rows: { holiday_date: string; created_by: string; oficina: number }[] = insertMock.mock.calls[0][0];
    expect(rows).toHaveLength(GENERATED.length);
    expect(rows.every((r) => r.created_by === "staff-1")).toBe(true);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("GH1b — BUG 0526-122: inserted rows propagate oficina from the generated list", async () => {
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockHolidaysTable([], deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper: createWrapper() });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const rows: { holiday_date: string; oficina: number }[] = insertMock.mock.calls[0][0];
    const rowByDate = Object.fromEntries(rows.map((r) => [r.holiday_date, r.oficina]));
    GENERATED.forEach((g) => {
      expect(rowByDate[g.date]).toBe(g.oficina);
    });
    // Sanity: the departmental holidays are actually present with their office code.
    const laPaz = GENERATED.find((g) => g.name.includes("La Paz"));
    const santaCruz = GENERATED.find((g) => g.name.includes("Santa Cruz"));
    expect(rowByDate[laPaz!.date]).toBe(1);
    expect(rowByDate[santaCruz!.date]).toBe(2);
  });

  it("GH9 — BUG 0526-122: stale/replace detection never touches departmental rows", async () => {
    const laPaz = GENERATED.find((g) => g.oficina === 1)!;
    // A departmental row that exists at the WRONG date (would look "stale" by
    // name if departmental names were included in NATIONAL_HOLIDAY_NAMES).
    const existingRows = [
      { holiday_id: "dep-wrong-date", holiday_date: "2027-01-10", holiday_name: laPaz.name, oficina: 1 },
    ];
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockHolidaysTable(existingRows, deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper: createWrapper() });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Never deleted/replaced — departmental rows are out of scope for dedup.
    expect(deleteMock).not.toHaveBeenCalled();
    expect(result.current.data?.replaced).toBe(0);
    // The correct La Paz date is still free (old row occupies a different
    // date), so it IS inserted as a new row alongside the nationals.
    const rows: { holiday_date: string }[] = insertMock.mock.calls[0][0];
    expect(rows.some((r) => r.holiday_date === laPaz.date)).toBe(true);
  });

  it("GH2 — all exact matches: throws allNationalAlreadyExist", async () => {
    const existingRows = GENERATED.map((g, i) => ({
      holiday_id: `h${i}`,
      holiday_date: g.date,
      holiday_name: g.name,
    }));
    const deleteMock = vi.fn();
    const insertMock = vi.fn();
    mockHolidaysTable(existingRows, deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper: createWrapper() });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect((result.current.error as Error).message).toContain("holiday.allNationalAlreadyExist");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("GH3 — partial exact: 3 of N dates exist → inserts the rest", async () => {
    const existingRows = GENERATED.slice(0, 3).map((g, i) => ({
      holiday_id: `h${i}`,
      holiday_date: g.date,
      holiday_name: g.name,
    }));
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockHolidaysTable(existingRows, deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper: createWrapper() });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const expectedCreated = GENERATED.length - 3;
    expect(result.current.data).toMatchObject({ created: expectedCreated, replaced: 0, skipped: 3 });
    const rows: { holiday_date: string }[] = insertMock.mock.calls[0][0];
    expect(rows).toHaveLength(expectedCreated);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("GH4 — stale by name: wrong-date national holidays are deleted + re-inserted correctly", async () => {
    // Simulate old "Replicar" artifacts: Viernes Santo and Corpus Christi at wrong 2027 dates
    const staleRows = [
      { holiday_id: "stale-vs", holiday_date: "2027-04-03", holiday_name: "Viernes Santo" },
      { holiday_id: "stale-cc", holiday_date: "2027-06-04", holiday_name: "Corpus Christi" },
    ];
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockHolidaysTable(staleRows, deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper: createWrapper() });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.replaced).toBe(2);
    // Stale IDs passed to delete
    expect(deleteMock).toHaveBeenCalledWith("holiday_id", ["stale-vs", "stale-cc"]);
    // All 11 holidays inserted (none were at correct dates)
    expect(result.current.data?.created).toBe(GENERATED.length);
  });

  it("GH5 — custom preserved: non-national name is NOT deleted", async () => {
    const customRows = [
      { holiday_id: "custom-1", holiday_date: "2027-02-26", holiday_name: "Feriado en Honor al Vicepresidente" },
    ];
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockHolidaysTable(customRows, deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper: createWrapper() });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.replaced).toBe(0);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("GH6 — 'Feriado - ' prefix: old-format name normalizes and is detected as stale", async () => {
    const staleRows = [
      { holiday_id: "stale-fcc", holiday_date: "2027-06-04", holiday_name: "Feriado - Corpus Christi" },
    ];
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockHolidaysTable(staleRows, deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper: createWrapper() });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.replaced).toBe(1);
    expect(deleteMock).toHaveBeenCalledWith("holiday_id", ["stale-fcc"]);
  });

  it("GH7 — '(Adicional)' suffix: custom extension is NOT deleted", async () => {
    const adicionalRows = [
      { holiday_id: "adicional-1", holiday_date: "2027-06-05", holiday_name: "Feriado - Corpus Christi (Adicional)" },
    ];
    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockHolidaysTable(adicionalRows, deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper: createWrapper() });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.replaced).toBe(0);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("GH8 — invalidates both query keys on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);

    const deleteMock = vi.fn().mockResolvedValue({ error: null });
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockHolidaysTable([], deleteMock, insertMock);

    const { result } = renderHook(() => useGenerateNationalHolidays(), { wrapper });
    result.current.mutate({ created_by: "staff-1", year: TARGET_YEAR });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["holidays"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["holidays-week"] });
  });
});
