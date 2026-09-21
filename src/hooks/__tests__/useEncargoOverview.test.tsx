import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// dash_encargo (bugs/dashboard/encargo/plan_v2.md §9.2): hook delgado sobre el RPC
// engagement_overview -- un round-trip, mismo patrón de mock que useCarteraOverview.test.tsx,
// con .abortSignal() encadenado. A diferencia de Cartera, SIN keepPreviousData (plan_v2.md
// §3.4: mostrar el detalle del encargo anterior bajo el nombre del nuevo sería desinformación).

const mockAbortSignal = vi.fn();
const mockRpc = vi.fn((..._args: any[]) => ({ abortSignal: mockAbortSignal }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { useEncargoOverview } from "../useEncargoOverview";
import { emptyEngagementOverviewPayload } from "@/components/dashboard/tabs/encargoOverviewTypes";

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
  ...emptyEngagementOverviewPayload(),
  meta: { ...emptyEngagementOverviewPayload().meta, engagement_id: "e1", selected_accessible: true },
};

describe("useEncargoOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAbortSignal.mockResolvedValue({ data: PAYLOAD, error: null });
  });

  it("(a) llama a engagement_overview con los 3 parámetros exactos y con .abortSignal(signal)", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(() => useEncargoOverview("e1", "2026-08-01", "2026-08-31"), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith("engagement_overview", {
      p_engagement_id: "e1",
      p_start: "2026-08-01",
      p_end: "2026-08-31",
    });
    expect(mockAbortSignal).toHaveBeenCalledWith(expect.anything());
  });

  it("(b) enabled:false con engagementId nulo -- no llama al RPC", async () => {
    const { wrapper } = createWrapper();
    renderHook(() => useEncargoOverview(null, "2026-08-01", "2026-08-31"), { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("(c) data nulo -> payload vacío del factory", async () => {
    mockAbortSignal.mockResolvedValue({ data: null, error: null });
    const { wrapper } = createWrapper();
    const view = renderHook(() => useEncargoOverview("e1", "2026-08-01", "2026-08-31"), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.data).toEqual(emptyEngagementOverviewPayload());
  });

  it("(d) el error del RPC se propaga, no se degrada a ceros", async () => {
    mockAbortSignal.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { wrapper } = createWrapper();
    const view = renderHook(() => useEncargoOverview("e1", "2026-08-01", "2026-08-31"), { wrapper });
    await waitFor(() => expect(view.result.current.isError).toBe(true));
    expect(view.result.current.data).toBeUndefined();
  });

  it("(e) la queryKey contiene los 3 parámetros y cambia con cada uno", async () => {
    const { wrapper, qc } = createWrapper();
    renderHook(() => useEncargoOverview("e1", "2026-08-01", "2026-08-31"), { wrapper });
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    const queries = qc.getQueryCache().findAll({ queryKey: ["dashboard", "encargo", "overview"] });
    expect(queries.some((q) => q.queryKey.includes("e1") && q.queryKey.includes("2026-08-01") && q.queryKey.includes("2026-08-31"))).toBe(true);
  });

  it("(f) al cambiar de engagementId no se conserva el detalle anterior (sin keepPreviousData)", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(
      (props: { id: string | null }) => useEncargoOverview(props.id, "2026-08-01", "2026-08-31"),
      { wrapper, initialProps: { id: "e1" as string | null } },
    );
    await waitFor(() => expect(view.result.current.data?.meta.engagement_id).toBe("e1"));

    mockAbortSignal.mockImplementation(() => new Promise(() => {})); // nunca resuelve
    view.rerender({ id: "e2" });
    await waitFor(() => expect(view.result.current.isLoading).toBe(true));
    // Sin keepPreviousData: mientras carga el nuevo encargo, no debe seguir mostrando "e1".
    expect(view.result.current.data).toBeUndefined();
    expect(view.result.current.isPlaceholderData).toBe(false);
  });
});
