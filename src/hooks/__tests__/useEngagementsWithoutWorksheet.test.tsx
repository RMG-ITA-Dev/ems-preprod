import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * BUG 0828-186 (Punto D): "Nueva Hoja de Trabajo" must only offer engagements CREATED BY the
 * current user ("creado por mí"), still excluding ones that already have a worksheet and
 * terminal/frozen overrides. The query must wait for the current staff to resolve (it's part
 * of the WHERE clause) and key its cache by staff so switching users doesn't leak state.
 */

const mockFrom = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: any[]) => mockFrom(...args) },
}));

const staffRef = vi.hoisted(() => ({
  staffId: undefined as string | undefined,
  isLoading: false,
}));
vi.mock("../useCurrentStaff", () => ({
  useCurrentStaff: () => ({
    staffRecord: staffRef.staffId ? { staff_id: staffRef.staffId } : undefined,
    isLoading: staffRef.isLoading,
  }),
}));

import { useEngagementsWithoutWorksheet } from "../useWorksheetData";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function chainBuilder(data: any[] | null, error: any = null) {
  const obj: any = {};
  const methods = ["select", "eq", "order"];
  for (const m of methods) obj[m] = vi.fn().mockReturnValue(obj);
  obj.then = (resolve: any) => resolve({ data, error });
  return obj;
}

function setupMocks(engagements: any[], worksheets: { engagement_id: string }[] = []) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "engagements") return chainBuilder(engagements);
    if (table === "activity_worksheets") return chainBuilder(worksheets);
    return chainBuilder([]);
  });
}

function makeEngagement(overrides: Partial<any> = {}) {
  return {
    engagement_id: overrides.engagement_id || crypto.randomUUID(),
    engagement_name: "Test",
    engagement_code: "T-01",
    status: "active",
    engagement_state_override: null,
    created_by_staff_id: "s1",
    client: null,
    partner: null,
    manager: null,
    ...overrides,
  };
}

describe("useEngagementsWithoutWorksheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staffRef.staffId = "s1";
    staffRef.isLoading = false;
  });

  it("does not query before the current staff resolves", () => {
    staffRef.staffId = undefined;
    staffRef.isLoading = true;
    setupMocks([]);

    renderHook(() => useEngagementsWithoutWorksheet(), { wrapper: createWrapper() });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("filters engagements by created_by_staff_id for the current staff", async () => {
    setupMocks([makeEngagement({ engagement_id: "eng-1" })]);

    const { result } = renderHook(() => useEngagementsWithoutWorksheet(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const engagementsCall = mockFrom.mock.results.find(
      (r, i) => mockFrom.mock.calls[i][0] === "engagements"
    )!.value;
    expect(engagementsCall.eq).toHaveBeenCalledWith("created_by_staff_id", "s1");
    expect(result.current.data).toHaveLength(1);
  });

  it("excludes engagements that already have a worksheet", async () => {
    setupMocks(
      [makeEngagement({ engagement_id: "eng-has-ws" }), makeEngagement({ engagement_id: "eng-no-ws" })],
      [{ engagement_id: "eng-has-ws" }]
    );

    const { result } = renderHook(() => useEngagementsWithoutWorksheet(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].engagement_id).toBe("eng-no-ws");
  });

  it("excludes engagements with a terminal/frozen override (6/7/9)", async () => {
    setupMocks([makeEngagement({ engagement_id: "eng-frozen", engagement_state_override: 9 })]);

    const { result } = renderHook(() => useEngagementsWithoutWorksheet(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });
});
