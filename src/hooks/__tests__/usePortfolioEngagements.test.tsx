import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * BUG 0828-185 — hook delgado sobre el RPC dedicado list_portfolio_engagements(). El filtro de
 * negocio (firm/own_society/own_management/creator) vive en la BD (SECURITY DEFINER); acá se
 * cubre el contrato del hook: nombre de RPC, query key compartida con la invalidación existente,
 * y que un error se propague en vez de silenciarse.
 */

const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { usePortfolioEngagements } from "../usePortfolioEngagements";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
    qc,
  };
}

const ENGAGEMENT_ROW = { engagement_id: "e1", engagement_name: "Auditoría Acme 2026" };

describe("usePortfolioEngagements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("llama al RPC list_portfolio_engagements una sola vez, por nombre", async () => {
    mockRpc.mockResolvedValue({ data: [ENGAGEMENT_ROW], error: null });
    const { wrapper } = createWrapper();
    const view = renderHook(() => usePortfolioEngagements(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("list_portfolio_engagements");
  });

  it("devuelve las filas del RPC tal cual (mismo shape que Engagement)", async () => {
    mockRpc.mockResolvedValue({ data: [ENGAGEMENT_ROW], error: null });
    const { wrapper } = createWrapper();
    const view = renderHook(() => usePortfolioEngagements(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(view.result.current.data).toEqual([ENGAGEMENT_ROW]);
  });

  it("data nula (RPC sin filas / sin permiso) se normaliza a arreglo vacío", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const { wrapper } = createWrapper();
    const view = renderHook(() => usePortfolioEngagements(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(view.result.current.data).toEqual([]);
  });

  it("un error del RPC se propaga como isError, no se silencia", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { wrapper } = createWrapper();
    const view = renderHook(() => usePortfolioEngagements(), { wrapper });
    await waitFor(() => expect(view.result.current.isError).toBe(true));
  });

  it("usa la query key [\"engagements\",\"portfolio\"] -- prefijo compartido con [\"engagements\"] para las invalidaciones existentes", async () => {
    mockRpc.mockResolvedValue({ data: [ENGAGEMENT_ROW], error: null });
    const { wrapper, qc } = createWrapper();
    const view = renderHook(() => usePortfolioEngagements(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    // Invalidar por el prefijo ["engagements"] (lo que ya hace useEngagementMutations.ts) debe
    // marcar esta query como stale sin ningún cambio en el sitio de invalidación.
    const query = qc.getQueryCache().find({ queryKey: ["engagements", "portfolio"] });
    expect(query).toBeDefined();
    expect(qc.getQueryState(["engagements", "portfolio"])?.isInvalidated).toBe(false);
    qc.invalidateQueries({ queryKey: ["engagements"] });
    expect(qc.getQueryState(["engagements", "portfolio"])?.isInvalidated).toBe(true);
  });
});
