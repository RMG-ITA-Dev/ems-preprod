import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// dash_socio (plan_v2.md §9.1, casos PO1-PO5): hook delgado sobre el RPC
// partner_overview -- un round-trip, mismo patrón de mock que
// usePortfolioEngagements.test.tsx, con .abortSignal() encadenado.

const mockAbortSignal = vi.fn();
const mockRpc = vi.fn((..._args: any[]) => ({ abortSignal: mockAbortSignal }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { usePartnerOverview, usePartnerOverviewEngagements, emptyPartnerOverviewPayload } from "../usePartnerOverview";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
    qc,
  };
}

const PAYLOAD = { ...emptyPartnerOverviewPayload(), meta: { ...emptyPartnerOverviewPayload().meta, scope_count: 3 } };

describe("usePartnerOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAbortSignal.mockResolvedValue({ data: PAYLOAD, error: null });
  });

  it("PO1: llama a partner_overview con los parámetros exactos (null para filtros vacíos)", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(
      () => usePartnerOverview("2025-10-01", "2026-09-30", null, null, null, null, null),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith("partner_overview", {
      p_start: "2025-10-01",
      p_end: "2026-09-30",
      p_fiscal_year: null,
      p_client_id: null,
      p_manager_id: null,
      p_industry_id: null,
      p_society_id: null,
    });
  });

  it("PO1b: pasa los filtros no vacíos tal cual", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(
      () =>
        usePartnerOverview("2025-10-01", "2026-09-30", 2026, "client-1", "manager-1", "industry-1", "society-1"),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith("partner_overview", {
      p_start: "2025-10-01",
      p_end: "2026-09-30",
      p_fiscal_year: 2026,
      p_client_id: "client-1",
      p_manager_id: "manager-1",
      p_industry_id: "industry-1",
      p_society_id: "society-1",
    });
  });

  it("PO2: data null se normaliza al payload vacío seguro (no lanza)", async () => {
    mockAbortSignal.mockResolvedValue({ data: null, error: null });
    const { wrapper } = createWrapper();
    const view = renderHook(
      () => usePartnerOverview("2025-10-01", "2026-09-30", null, null, null, null, null),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(view.result.current.isError).toBe(false);
    expect(view.result.current.data).toEqual(emptyPartnerOverviewPayload());
  });

  it("PO3: un error del RPC se propaga como isError", async () => {
    mockAbortSignal.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { wrapper } = createWrapper();
    const view = renderHook(
      () => usePartnerOverview("2025-10-01", "2026-09-30", null, null, null, null, null),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isError).toBe(true));
  });

  it("PO4: la queryKey empieza con ['dashboard','socio']", async () => {
    const { wrapper, qc } = createWrapper();
    const view = renderHook(
      () => usePartnerOverview("2025-10-01", "2026-09-30", null, null, null, null, null),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    const queries = qc.getQueryCache().findAll({ queryKey: ["dashboard", "socio"] });
    expect(queries.length).toBeGreaterThan(0);
  });
});

describe("usePartnerOverviewEngagements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAbortSignal.mockResolvedValue({ data: { total: 3, items: [] }, error: null });
  });

  it("PO5: dispara al montar (2026-09-17: ya no es bajo demanda) y pasa sort/filtro/límite", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(
      () =>
        usePartnerOverviewEngagements({
          startDateStr: "2025-10-01",
          endDateStr: "2026-09-30",
          fiscalYear: null,
          clientId: null,
          managerId: null,
          industryId: null,
          societyId: null,
          sortKey: "end_date",
          overBudgetOnly: false,
          limit: 10,
        }),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith(
      "partner_overview_engagements",
      expect.objectContaining({ p_sort_key: "end_date", p_over_budget_only: false, p_limit: 10, p_offset: 0 }),
    );
  });

  it("PO5b: 'Ver todos' pasa un límite mayor y el filtro de sobregirados al RPC", async () => {
    const { wrapper } = createWrapper();
    const view = renderHook(
      () =>
        usePartnerOverviewEngagements({
          startDateStr: "2025-10-01",
          endDateStr: "2026-09-30",
          fiscalYear: null,
          clientId: null,
          managerId: null,
          industryId: null,
          societyId: null,
          sortKey: "progress",
          overBudgetOnly: true,
          limit: 200,
        }),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    expect(mockRpc).toHaveBeenCalledWith(
      "partner_overview_engagements",
      expect.objectContaining({ p_sort_key: "progress", p_over_budget_only: true, p_limit: 200, p_offset: 0 }),
    );
  });
});
