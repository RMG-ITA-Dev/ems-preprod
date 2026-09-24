import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// dash_personal (bugs/dashboard/personal/plan_v2.md §9.2): hook delgado sobre el RPC
// personal_overview -- un round-trip, mismo patrón de mock que useEncargoOverview.test.tsx,
// con .abortSignal() encadenado. El RPC deriva staff_id de la sesión: este hook NUNCA envía
// staff_id ni p_as_of, solo los 2 parámetros de rango histórico.

const mockAbortSignal = vi.fn();
const mockRpc = vi.fn((..._args: any[]) => ({ abortSignal: mockAbortSignal }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { usePersonalOverview } from "../usePersonalOverview";
import { emptyPersonalOverviewPayload } from "@/components/dashboard/tabs/personalOverviewTypes";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
    qc,
  };
}

const PAYLOAD = {
  ...emptyPersonalOverviewPayload(),
  meta: { ...emptyPersonalOverviewPayload().meta, has_staff_record: true },
};

describe("usePersonalOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAbortSignal.mockResolvedValue({ data: PAYLOAD, error: null });
  });

  it("(a) llama exactamente a personal_overview con .abortSignal(signal)", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(() => usePersonalOverview("2026-01-01", "2026-12-31"), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith("personal_overview", {
      p_history_start: "2026-01-01",
      p_history_end: "2026-12-31",
    });
    expect(mockAbortSignal).toHaveBeenCalledWith(expect.anything());
  });

  it("(b) envía únicamente p_history_start/p_history_end -- nunca staff_id ni p_as_of", async () => {
    const { wrapper } = createWrapper();
    renderHook(() => usePersonalOverview("2026-01-01", "2026-12-31"), { wrapper });
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    const [, params] = mockRpc.mock.calls[0];
    expect(Object.keys(params).sort()).toEqual(["p_history_end", "p_history_start"]);
    expect(params).not.toHaveProperty("staff_id");
    expect(params).not.toHaveProperty("p_staff_id");
    expect(params).not.toHaveProperty("p_as_of");
  });

  it("(c) la queryKey contiene ambos parámetros de rango", async () => {
    const { wrapper, qc } = createWrapper();
    renderHook(() => usePersonalOverview("2026-01-01", "2026-12-31"), { wrapper });
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    const queries = qc.getQueryCache().findAll({ queryKey: ["dashboard", "personal", "overview"] });
    expect(
      queries.some((q) => q.queryKey.includes("2026-01-01") && q.queryKey.includes("2026-12-31")),
    ).toBe(true);
  });

  it("(d) data nulo -> payload vacío del factory", async () => {
    mockAbortSignal.mockResolvedValue({ data: null, error: null });
    const { wrapper } = createWrapper();
    const view = renderHook(() => usePersonalOverview("2026-01-01", "2026-12-31"), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.data).toEqual(emptyPersonalOverviewPayload());
  });

  it("(e) el error del RPC se propaga, no se degrada a un payload vacío", async () => {
    mockAbortSignal.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { wrapper } = createWrapper();
    const view = renderHook(() => usePersonalOverview("2026-01-01", "2026-12-31"), { wrapper });
    await waitFor(() => expect(view.result.current.isError).toBe(true));
    expect(view.result.current.data).toBeUndefined();
  });

  it("(f) enabled:false con fechas vacías -- no llama al RPC", async () => {
    const { wrapper } = createWrapper();
    renderHook(() => usePersonalOverview("", ""), { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
