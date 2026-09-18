import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TabErrorBoundary } from "@/components/dashboard/TabErrorBoundary";
import { emptyPartnerOverviewPayload, type PartnerOverviewPayload } from "@/hooks/usePartnerOverview";

// dash_socio (plan_v2.md §9.1, casos PT1-PT7). Patrón de mocks: PendingHoursAlert.test.tsx.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && Object.keys(opts).length > 0) {
        const pairs = Object.entries(opts)
          .map(([k, v]) => `${k}=${v}`)
          .join(",");
        return `${key}(${pairs})`;
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockSetSelectedIndustryId = vi.fn();
const mockSetSelectedClientId = vi.fn();
const mockSetSelectedSocietyId = vi.fn();
let dashboardState: Record<string, unknown> = {};
vi.mock("@/contexts/DashboardContext", () => ({
  useDashboard: () => dashboardState,
}));

const mockUsePartnerOverview = vi.fn();
const mockUsePartnerOverviewEngagements = vi.fn();
vi.mock("@/hooks/usePartnerOverview", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/usePartnerOverview")>(
    "@/hooks/usePartnerOverview",
  );
  return {
    ...actual,
    usePartnerOverview: (...args: unknown[]) => mockUsePartnerOverview(...args),
    usePartnerOverviewEngagements: (...args: unknown[]) => mockUsePartnerOverviewEngagements(...args),
  };
});

import { PartnerTab, PartnerFilters } from "../PartnerTab";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function baseDashboardState(overrides: Record<string, unknown> = {}) {
  return {
    startDateStr: "2025-10-01",
    endDateStr: "2026-09-30",
    periodType: "tax_bolivia",
    selectedQuarter: "ytd",
    selectedYear: 2026,
    selectedClientId: null,
    setSelectedClientId: mockSetSelectedClientId,
    selectedIndustryId: null,
    setSelectedIndustryId: mockSetSelectedIndustryId,
    selectedSocietyId: null,
    setSelectedSocietyId: mockSetSelectedSocietyId,
    ...overrides,
  };
}

function payloadWith(overrides: Partial<PartnerOverviewPayload> = {}): PartnerOverviewPayload {
  const base = emptyPartnerOverviewPayload();
  return {
    ...base,
    ...overrides,
    meta: { ...base.meta, scope_count: 3, unfiltered_scope_count: 3, ...(overrides.meta ?? {}) },
  };
}

describe("PartnerTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardState = baseDashboardState();
    mockUsePartnerOverviewEngagements.mockReturnValue({
      data: { total: 0, items: [] },
      refetch: vi.fn(),
    });
  });

  it("PT1: isLoading -> skeleton con 5 tarjetas KPI", () => {
    mockUsePartnerOverview.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    render(<PartnerTab />, { wrapper: createWrapper() });

    expect(screen.getAllByTestId("partner-kpi-skeleton")).toHaveLength(5);
  });

  it("PT2: vacío por alcance muestra dashboard.socio.empty.scope", () => {
    mockUsePartnerOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({ meta: { ...emptyPartnerOverviewPayload().meta, scope_count: 0, unfiltered_scope_count: 0 } }),
    });
    render(<PartnerTab />, { wrapper: createWrapper() });

    expect(screen.getByText("dashboard.socio.empty.scope")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.socio.empty.filters")).not.toBeInTheDocument();
  });

  it("PT3: vacío por filtros muestra dashboard.socio.empty.filters (distinto del de alcance)", () => {
    mockUsePartnerOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({ meta: { ...emptyPartnerOverviewPayload().meta, scope_count: 0, unfiltered_scope_count: 5 } }),
    });
    render(<PartnerTab />, { wrapper: createWrapper() });

    expect(screen.getByText("dashboard.socio.empty.filters")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.socio.empty.scope")).not.toBeInTheDocument();
  });

  it("PT4: un error del RPC se propaga (throw) y lo captura TabErrorBoundary", () => {
    mockUsePartnerOverview.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("partner_overview boom"),
      data: undefined,
    });

    render(
      <TabErrorBoundary tabLabel="Socio">
        <PartnerTab />
      </TabErrorBoundary>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText("dashboard.tabError.title(tab=Socio)")).toBeInTheDocument();
  });

  it("PT5: con payload mock renderiza los 5 títulos de KPI", () => {
    mockUsePartnerOverview.mockReturnValue({ isLoading: false, isError: false, data: payloadWith() });
    render(<PartnerTab />, { wrapper: createWrapper() });

    expect(screen.getByText("dashboard.socio.kpi.engagements.title")).toBeInTheDocument();
    expect(screen.getByText("dashboard.socio.kpi.fees.title")).toBeInTheDocument();
    expect(screen.getByText("dashboard.socio.kpi.partnerHours.title")).toBeInTheDocument();
    expect(screen.getByText("dashboard.socio.kpi.sqrHours.title")).toBeInTheDocument();
    expect(screen.getByText("dashboard.socio.kpi.alerts.title")).toBeInTheDocument();
  });

  it("PT6: chip de sector visible cuando selectedIndustryId no es null; clic llama setSelectedIndustryId(null)", () => {
    dashboardState = baseDashboardState({ selectedIndustryId: "ind-1" });
    mockUsePartnerOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        filters: { clients: [], managers: [], industries: [{ industry_id: "ind-1", industry_name: "Finanzas" }], societies: [] },
      }),
    });

    render(<PartnerFilters />, { wrapper: createWrapper() });

    const chip = screen.getByText("dashboard.socio.filters.sectorChip(name=Finanzas)");
    expect(chip).toBeInTheDocument();
    fireEvent.click(chip);
    expect(mockSetSelectedIndustryId).toHaveBeenCalledWith(null);
  });

  it("PT8: KPI 1 segmenta el ancho real por proporción y cada segmento navega a su propio estado (MF-04)", () => {
    mockUsePartnerOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        kpis: {
          ...emptyPartnerOverviewPayload().kpis,
          engagements: { total: 10, approved: 6, emergency: 2, finalized_in_period: 2 },
        },
      }),
    });
    render(<PartnerTab />, { wrapper: createWrapper() });

    const approvedSegment = screen.getByTitle("dashboard.socio.kpi.engagements.segmentApproved(count=6)");
    const emergencySegment = screen.getByTitle("dashboard.socio.kpi.engagements.segmentEmergency(count=2)");
    const finalizedSegment = screen.getByTitle("dashboard.socio.kpi.engagements.segmentFinalized(count=2)");

    expect(approvedSegment.style.width).toBe("60%");
    expect(emergencySegment.style.width).toBe("20%");
    expect(finalizedSegment.style.width).toBe("20%");

    fireEvent.click(approvedSegment);
    expect(mockNavigate).toHaveBeenCalledWith("/engagements?state=4");
    fireEvent.click(emergencySegment);
    expect(mockNavigate).toHaveBeenCalledWith("/engagements?state=5");
    fireEvent.click(finalizedSegment);
    expect(mockNavigate).toHaveBeenCalledWith("/engagements?state=7");
  });

  it("PT9: error de partner_overview_engagements muestra estado de error con reintentar, no una tabla vacía (MF-06)", () => {
    const mockRefetch = vi.fn();
    mockUsePartnerOverview.mockReturnValue({ isLoading: false, isError: false, data: payloadWith() });
    mockUsePartnerOverviewEngagements.mockReturnValue({
      data: undefined,
      isError: true,
      refetch: mockRefetch,
    });

    render(<PartnerTab />, { wrapper: createWrapper() });

    expect(screen.getByText("dashboard.socio.blocks.engagementHours.error")).toBeInTheDocument();
    fireEvent.click(screen.getByText("dashboard.tabError.retry"));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("PT7: clic en una cuota de los próximos 7 días navega a /work-orders/<wo>?tab=payment", () => {
    const today = emptyPartnerOverviewPayload().meta.today;
    mockUsePartnerOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        collections: {
          ...emptyPartnerOverviewPayload().collections,
          next_7_days: [
            {
              installment_id: "inst-1",
              wo_id: "wo-1",
              engagement_id: "e1",
              client_legal_name: "Banco Sol",
              kind: "collect",
              date: today,
              amount_bob: 1000,
            },
          ],
        },
      }),
    });

    render(<PartnerTab />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText(/Banco Sol/));
    expect(mockNavigate).toHaveBeenCalledWith("/work-orders/wo-1?tab=payment");
  });
});
