import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// dash_cartera (bugs/dashboard/cartera/plan_v2.md §9.4, casos CO1-CO6): hook delgado sobre
// el RPC portfolio_overview -- un round-trip, mismo patrón de mock que
// usePartnerOverview.test.tsx, con .abortSignal() encadenado.

const mockAbortSignal = vi.fn();
const mockRpc = vi.fn((..._args: any[]) => ({ abortSignal: mockAbortSignal }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { useCarteraOverview } from "../useCarteraOverview";
import { emptyCarteraOverviewPayload } from "@/components/dashboard/tabs/carteraOverviewTypes";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
    qc,
  };
}

const PAYLOAD = { ...emptyCarteraOverviewPayload(), meta: { ...emptyCarteraOverviewPayload().meta, scope_count: 3 } };

describe("useCarteraOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAbortSignal.mockResolvedValue({ data: PAYLOAD, error: null });
  });

  it("CO1: llama a portfolio_overview con los 7 parámetros exactos (p_client_id/p_practica_id: null sin filtro)", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(
      () => useCarteraOverview("2025-10-01", "2026-09-30", 2026, "2025-10-01", "2026-09-30", null, null),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith("portfolio_overview", {
      p_start: "2025-10-01",
      p_end: "2026-09-30",
      p_fiscal_year: 2026,
      p_fy_start: "2025-10-01",
      p_fy_end: "2026-09-30",
      p_client_id: null,
      p_practica_id: null,
    });
  });

  it("CO2: con clientId no nulo, lo pasa como p_client_id; la queryKey cambia", async () => {
    const { wrapper, qc } = createWrapper();
    renderHook(
      () => useCarteraOverview("2025-10-01", "2026-09-30", 2026, "2025-10-01", "2026-09-30", "client-1", null),
      { wrapper },
    );
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    expect(mockRpc).toHaveBeenCalledWith(
      "portfolio_overview",
      expect.objectContaining({ p_client_id: "client-1" }),
    );
    const queries = qc.getQueryCache().findAll({ queryKey: ["dashboard", "cartera", "overview"] });
    expect(queries.some((q) => q.queryKey.includes("client-1"))).toBe(true);
  });

  it("CO2b: con practicaId no nulo, lo pasa como p_practica_id; la queryKey cambia", async () => {
    const { wrapper, qc } = createWrapper();
    renderHook(
      () => useCarteraOverview("2025-10-01", "2026-09-30", 2026, "2025-10-01", "2026-09-30", null, "practica-1"),
      { wrapper },
    );
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    expect(mockRpc).toHaveBeenCalledWith(
      "portfolio_overview",
      expect.objectContaining({ p_practica_id: "practica-1" }),
    );
    const queries = qc.getQueryCache().findAll({ queryKey: ["dashboard", "cartera", "overview"] });
    expect(queries.some((q) => q.queryKey.includes("practica-1"))).toBe(true);
  });

  it("CO3: los 7 parámetros forman parte de la queryKey (cambiar cualquiera dispara refetch)", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(
      (props: { fiscalYear: number }) =>
        useCarteraOverview("2025-10-01", "2026-09-30", props.fiscalYear, "2025-10-01", "2026-09-30", null, null),
      { wrapper, initialProps: { fiscalYear: 2026 } },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    view.rerender({ fiscalYear: 2025 });
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2));

    expect(mockRpc).toHaveBeenNthCalledWith(1, "portfolio_overview", expect.objectContaining({ p_fiscal_year: 2026 }));
    expect(mockRpc).toHaveBeenNthCalledWith(2, "portfolio_overview", expect.objectContaining({ p_fiscal_year: 2025 }));
  });

  it("CO4: error del RPC -> isError; no devuelve payload vacío", async () => {
    mockAbortSignal.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { wrapper } = createWrapper();
    const view = renderHook(
      () => useCarteraOverview("2025-10-01", "2026-09-30", 2026, "2025-10-01", "2026-09-30", null, null),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isError).toBe(true));
    expect(view.result.current.data).toBeUndefined();
  });

  it("CO5: data === null -> emptyCarteraOverviewPayload()", async () => {
    mockAbortSignal.mockResolvedValue({ data: null, error: null });
    const { wrapper } = createWrapper();
    const view = renderHook(
      () => useCarteraOverview("2025-10-01", "2026-09-30", 2026, "2025-10-01", "2026-09-30", null, null),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.isError).toBe(false);
    expect(view.result.current.data).toEqual(emptyCarteraOverviewPayload());
  });

  it("CO6: .abortSignal(signal) encadenado; keepPreviousData conserva el resultado anterior durante el refetch", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(
      (props: { clientId: string | null }) =>
        useCarteraOverview("2025-10-01", "2026-09-30", 2026, "2025-10-01", "2026-09-30", props.clientId, null),
      { wrapper, initialProps: { clientId: null as string | null } },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(mockAbortSignal).toHaveBeenCalledWith(expect.anything());
    expect(view.result.current.data?.meta.scope_count).toBe(3);

    // Refetch en curso (nuevo clientId): keepPreviousData conserva el payload anterior
    // mientras isPlaceholderData es true, en vez de mostrar un hueco vacío.
    mockAbortSignal.mockImplementation(() => new Promise(() => {})); // nunca resuelve
    view.rerender({ clientId: "client-2" });
    await waitFor(() => expect(view.result.current.isPlaceholderData).toBe(true));
    expect(view.result.current.data?.meta.scope_count).toBe(3);
  });
});
