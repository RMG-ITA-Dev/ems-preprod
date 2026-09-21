import React from "react";
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TabErrorBoundary } from "@/components/dashboard/TabErrorBoundary";
import { EncargoTab } from "../tabs/EncargoTab";
import { emptyEngagementOverviewPayload, type EngagementOverviewPayload } from "../tabs/encargoOverviewTypes";

// dash_encargo (bugs/dashboard/encargo/plan_v2.md §9.3): reemplaza el mock legacy de
// supabase.from(...).select()... por mocks de los hooks propios de la pestaña
// (useDashboardEngagements/useEncargoOverview), mismo patrón que CarteraTab.test.tsx
// (mockUseCarteraOverview). Solo se mantiene un mock mínimo de supabase.from() para
// StaffHoursDetailDialog, que queda intacto (decisiones.md §4.7 / plan_v2.md §5.6).

// Polyfills for Radix UI primitives not implemented in jsdom
if (typeof window !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && Object.keys(opts).length > 0) {
        const pairs = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(",");
        return `${key}(${pairs})`;
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

let dashboardState: Record<string, unknown> = {};
const mockSetSelectedEngagementId = vi.fn((id: string | null) => {
  dashboardState = { ...dashboardState, selectedEngagementId: id };
});
vi.mock("@/contexts/DashboardContext", () => ({
  useDashboard: () => dashboardState,
}));

const mockUseDashboardEngagements = vi.fn();
vi.mock("@/hooks/useDashboardEngagements", () => ({
  useDashboardEngagements: () => mockUseDashboardEngagements(),
}));

const mockUseEncargoOverview = vi.fn();
vi.mock("@/hooks/useEncargoOverview", () => ({
  useEncargoOverview: (...args: unknown[]) => mockUseEncargoOverview(...args),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    }),
  },
}));

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
    selectedEngagementId: "eng-001",
    setSelectedEngagementId: mockSetSelectedEngagementId,
    startDateStr: "2026-01-01",
    endDateStr: "2026-12-31",
    ...overrides,
  };
}

function payloadWith(detail: EngagementOverviewPayload["detail"], metaOverrides: Partial<EngagementOverviewPayload["meta"]> = {}): EngagementOverviewPayload {
  const base = emptyEngagementOverviewPayload();
  return { meta: { ...base.meta, engagement_id: "eng-001", selected_accessible: true, ...metaOverrides }, detail };
}

const FULL_DETAIL: EngagementOverviewPayload["detail"] = {
  kpis: {
    staffing: { current: { logged: 3, assigned: 5 }, previous: { logged: 4, assigned: 5 } },
    pending_approval: { last_week_hours: 7, aged_hours: 4 },
    last_time_entry: { date: "2026-09-21", days: 0 },
    last_approval: { date: "2026-09-20", days: 1 },
  },
  budget: { budget_hours: 53, actual_hours: 40, consumed_percent: 75.5 },
  breakdown: [
    {
      category_id: "cat-1",
      category_name: "Senior",
      category_display_order: 1,
      activity_id: "act-1",
      activity_code: "ACT1",
      activity_description: "Planificacion",
      budget_hours: 8,
      actual_hours: 6,
      variance_hours: 2,
    },
  ],
  team: {
    partner: { staff_id: "s1", display_name: "Juan Socio" },
    manager: { staff_id: "s2", display_name: "Ana Gerente" },
    encargado: { staff_id: "s3", display_name: "Luis Encargado" },
    specialist_it: { staff_id: "s4", display_name: "Eva IT" },
    specialist_tax: null,
    sqr: { staff_id: "s5", display_name: "Pedro SQR" },
  },
  staffing: {
    people: [{ staff_id: "s6", display_name: "Worker A", category_name: "Senior", assigned_hours: 120, zero_week_alert: false }],
    weeks: [
      { offset: 0, week_start: "2026-09-15", week_end: "2026-09-21", week_number: 38, rows: [{ staff_id: "s6", logged_hours: 38, used_hours: 90 }] },
    ],
  },
  expenses: {
    budget_bob: 6960,
    executed_bob: 300,
    executed_percent: 4.3,
    approved: [{ fre_id: "fre-1", expense_date: "2026-09-16", description: "Viaticos", amount: 300, currency: "BOB", amount_bob: 300, status: "revisado_asistente" }],
    pending: [{ fre_id: "fre-2", expense_date: "2026-09-17", description: "Combustible", amount: 100, currency: "BOB", amount_bob: 100, status: "aprobado_gerente" }],
    requests: [
      { fr_wo_id: "frwo-1", fund_request_id: "fr-1", request_number: "FR-1", allocated_amount: 500, currency: "BOB", allocated_amount_bob: 500, display_status: "desembolsado", decided_at: "2026-09-01", submitted_at: "2026-08-30" },
    ],
  },
  approval_queue: {
    total_hours: 18,
    distinct_people: 2,
    items: [
      { staff_id: "s7", staff_name: "Worker Alert1", hours: 7, weeks_old: 3, alert: true },
      { staff_id: "s8", staff_name: "Worker Alert2", hours: 11, weeks_old: 6, alert: true },
    ],
  },
};

const EMPTY_DETAIL: EngagementOverviewPayload["detail"] = {
  kpis: {
    staffing: { current: { logged: 0, assigned: 0 }, previous: { logged: 0, assigned: 0 } },
    pending_approval: { last_week_hours: 0, aged_hours: 0 },
    last_time_entry: { date: null, days: null },
    last_approval: { date: null, days: null },
  },
  budget: { budget_hours: 0, actual_hours: 0, consumed_percent: 0 },
  breakdown: [],
  team: { partner: null, manager: null, encargado: null, specialist_it: null, specialist_tax: null, sqr: null },
  staffing: { people: [], weeks: [] },
  expenses: { budget_bob: 0, executed_bob: 0, executed_percent: 0, approved: [], pending: [], requests: [] },
  approval_queue: { total_hours: 0, distinct_people: 0, items: [] },
};

const ENGAGEMENTS = [{ engagement_id: "eng-001", engagement_code: "E-001", engagement_name: "Encargo Uno", client_legal_name: "Cliente Uno", end_date: null }];

const originalConsoleError = console.error.bind(console);
beforeAll(() => {
  vi.spyOn(console, "error").mockImplementation((msg: unknown, ...rest: unknown[]) => {
    const s = typeof msg === "string" ? msg : "";
    if (s.includes("not wrapped in act") || s.includes("aria-describedby") || s.includes("boom")) return;
    originalConsoleError(msg, ...rest);
  });
});
afterAll(() => {
  vi.mocked(console.error).mockRestore();
});

describe("EncargoTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardState = baseDashboardState();
    mockUseDashboardEngagements.mockReturnValue({ data: ENGAGEMENTS, isLoading: false });
    mockUseEncargoOverview.mockReturnValue({ data: payloadWith(FULL_DETAIL), isLoading: false, isError: false, error: null });
  });

  it("(a) sin selectedEngagementId -> placeholder noSelection", async () => {
    dashboardState = baseDashboardState({ selectedEngagementId: null });
    render(<EncargoTab />, { wrapper: createWrapper() });
    await screen.findByText("dashboard.encargo.noSelection");
  });

  it("(b) payload accesible pero vacío (sin desglose/staffing/gastos) -> renderiza sin romper", async () => {
    mockUseEncargoOverview.mockReturnValue({ data: payloadWith(EMPTY_DETAIL), isLoading: false, isError: false, error: null });
    render(<EncargoTab />, { wrapper: createWrapper() });
    await screen.findByText("dashboard.encargo.kpis.staffing");
    expect(screen.getByText("dashboard.encargo.noData")).toBeInTheDocument();
    expect(screen.getAllByText("dashboard.encargo.kpis.never").length).toBe(2);
    expect(screen.getByText("dashboard.encargo.approvalQueue.empty")).toBeInTheDocument();
  });

  it("(c) payload completo -> 4 KPI, consumo, desglose, equipo, staffing, gastos, cola de aprobación", async () => {
    render(<EncargoTab />, { wrapper: createWrapper() });
    await screen.findByText("dashboard.encargo.kpis.staffing");
    expect(screen.getByText("dashboard.encargo.kpis.pendingApproval")).toBeInTheDocument();
    expect(screen.getByText("dashboard.encargo.kpis.lastTimeEntry")).toBeInTheDocument();
    expect(screen.getByText("dashboard.encargo.kpis.lastApproval")).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument(); // Math.round(75.5)
    expect(screen.getByText("Planificacion")).toBeInTheDocument();
    expect(screen.getByText("Juan Socio")).toBeInTheDocument();
    expect(screen.getByText("Worker A")).toBeInTheDocument();
    expect(screen.getByText("dashboard.encargo.expenses.approvedRecent")).toBeInTheDocument();
    expect(screen.getByText("dashboard.encargo.expenses.requests")).toBeInTheDocument();
    expect(screen.getByText("dashboard.encargo.expenses.pendingExpenses")).toBeInTheDocument();
    expect(screen.getByText("dashboard.encargo.approvalQueue.title")).toBeInTheDocument();
    expect(screen.getByText(/Worker Alert1/)).toBeInTheDocument();
    expect(screen.getByText(/Worker Alert2/)).toBeInTheDocument();
  });

  it("(j) Cola de Aprobación: severidad critical = item.alert del backend (review.md iteración 1, MF-05, sin escalón 2x) y '+N más' por persona", async () => {
    // Orden descendente por weeks_old, igual que ya lo entrega el backend (ORDER BY
    // weeks_old DESC) -- el frontend no reordena, solo corta a 5.
    const manyItems = [
      { staff_id: "p1", staff_name: "Persona 1 Critica", hours: 5, weeks_old: 6, alert: true },
      { staff_id: "p2", staff_name: "Persona 2 Critica", hours: 5, weeks_old: 5, alert: true },
      { staff_id: "p3", staff_name: "Persona 3 Critica", hours: 5, weeks_old: 4, alert: true },
      { staff_id: "p4", staff_name: "Persona 4 Critica", hours: 5, weeks_old: 3, alert: true },
      { staff_id: "p5", staff_name: "Persona 5", hours: 5, weeks_old: 2, alert: false },
      { staff_id: "p6", staff_name: "Persona 6 Oculta", hours: 5, weeks_old: 1, alert: false },
    ];
    mockUseEncargoOverview.mockReturnValue({
      data: payloadWith({
        ...FULL_DETAIL,
        approval_queue: { total_hours: 30, distinct_people: manyItems.length, items: manyItems },
      }),
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<EncargoTab />, { wrapper: createWrapper() });
    await screen.findByText("dashboard.encargo.approvalQueue.title");

    // Sin escalón intermedio (MF-05): TODAS las filas con alert=true llevan el badge rojo
    // con aria-label "critical", sin importar cuántas semanas de antigüedad tengan -- p1..p4
    // son las 4 primeras (orden por weeks_old DESC, ya lo entrega así el backend).
    expect(screen.getAllByLabelText("dashboard.encargo.approvalQueue.critical")).toHaveLength(4);
    expect(screen.getByText(/Persona 1 Critica/)).toBeInTheDocument();
    expect(screen.getByText(/Persona 4 Critica/)).toBeInTheDocument();
    // Persona 5 (alert=false) no lleva badge crítico.
    expect(screen.getByText(/Persona 5/)).toBeInTheDocument();

    // Se muestran las primeras 5 -- "Persona 6 Oculta" queda en la 6ta posición y no se
    // renderiza, pero sí se cuenta en el "+1 más".
    expect(screen.queryByText(/Persona 6 Oculta/)).not.toBeInTheDocument();
    expect(screen.getByText("dashboard.encargo.approvalQueue.more(count=1)")).toBeInTheDocument();
  });

  it("(d) no aparece ningún rótulo de honorario ni de realización", async () => {
    render(<EncargoTab />, { wrapper: createWrapper() });
    await screen.findByText("dashboard.encargo.kpis.staffing");
    expect(screen.queryByText(/honorario/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/realiz/i)).not.toBeInTheDocument();
    expect(screen.queryByText("dashboard.encargo.agreedFee")).not.toBeInTheDocument();
    expect(screen.queryByText("dashboard.encargo.realization")).not.toBeInTheDocument();
  });

  it("(e) 'Ver detalle de horas' sigue abriendo StaffHoursDetailDialog", async () => {
    const user = userEvent.setup();
    render(<EncargoTab />, { wrapper: createWrapper() });
    const button = await screen.findByRole("button", { name: /dashboard\.encargo\.viewHoursDetail/i });
    await user.click(button);
    await screen.findByText("dashboard.encargo.hoursDetail.title");
  });

  it("(f) selected_accessible:false -> limpia la selección y muestra accessChanged, sin romper la lista", async () => {
    mockUseEncargoOverview.mockReturnValue({
      data: { meta: { ...emptyEngagementOverviewPayload().meta, engagement_id: "eng-001", selected_accessible: false }, detail: null },
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<EncargoTab />, { wrapper: createWrapper() });
    await screen.findByText("dashboard.encargo.accessChanged");
    expect(mockSetSelectedEngagementId).toHaveBeenCalledWith(null);
  });

  it("(h) autoselección: sin selección y engagements cargados -> elige el de end_date mínimo no nulo (incluye vencidos, NULL al final)", async () => {
    dashboardState = baseDashboardState({ selectedEngagementId: null });
    mockUseDashboardEngagements.mockReturnValue({
      data: [
        { engagement_id: "eng-future", engagement_code: "E-FUT", engagement_name: "Futuro", client_legal_name: "Cliente", end_date: "2026-12-01" },
        { engagement_id: "eng-overdue", engagement_code: "E-OVD", engagement_name: "Vencido", client_legal_name: "Cliente", end_date: "2026-08-01" },
        { engagement_id: "eng-null", engagement_code: "E-NUL", engagement_name: "SinFecha", client_legal_name: "Cliente", end_date: null },
      ],
      isLoading: false,
    });

    render(<EncargoTab />, { wrapper: createWrapper() });

    // eng-overdue (2026-08-01, vencido respecto a hoy) es el mínimo no nulo -- gana sobre
    // eng-future (más lejano) y se ignora eng-null (sin fecha, nunca se autoselecciona).
    await waitFor(() => expect(mockSetSelectedEngagementId).toHaveBeenCalledWith("eng-overdue"));
    expect(mockSetSelectedEngagementId).toHaveBeenCalledTimes(1);
  });

  it("(i) autoselección corre una sola vez por montaje: no pelea con una deselección manual posterior", async () => {
    dashboardState = baseDashboardState({ selectedEngagementId: null });
    mockUseDashboardEngagements.mockReturnValue({
      data: [
        { engagement_id: "eng-future", engagement_code: "E-FUT", engagement_name: "Futuro", client_legal_name: "Cliente", end_date: "2026-12-01" },
        { engagement_id: "eng-overdue", engagement_code: "E-OVD", engagement_name: "Vencido", client_legal_name: "Cliente", end_date: "2026-08-01" },
      ],
      isLoading: false,
    });

    const { rerender } = render(<EncargoTab />, { wrapper: createWrapper() });
    await waitFor(() => expect(mockSetSelectedEngagementId).toHaveBeenCalledWith("eng-overdue"));
    expect(mockSetSelectedEngagementId).toHaveBeenCalledTimes(1);

    // mockSetSelectedEngagementId ya reflejó "eng-overdue" en dashboardState (mismo efecto
    // que el context real) -- re-renderizar con ese valor cambia la dependencia del efecto,
    // pero el guard (autoSelectedRef) ya está en true: no debe volver a llamar.
    rerender(<EncargoTab />);
    expect(mockSetSelectedEngagementId).toHaveBeenCalledTimes(1);

    // El usuario deselecciona a mano -- mismo cambio de estado que produce
    // handleSelectEngagement(null) desde la UI. Otro cambio de dependencia (eng-overdue ->
    // null); el guard sigue en true y no debe disparar una segunda autoselección.
    dashboardState = baseDashboardState({ selectedEngagementId: null });
    rerender(<EncargoTab />);
    expect(mockSetSelectedEngagementId).toHaveBeenCalledTimes(1);
  });

  it("(g) isError -> lanza (lo captura TabErrorBoundary); no pinta KPIs en cero", () => {
    mockUseEncargoOverview.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("engagement_overview boom"),
    });
    render(
      <TabErrorBoundary tabLabel="Encargo">
        <EncargoTab />
      </TabErrorBoundary>,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("dashboard.tabError.retry")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.encargo.kpis.staffing")).not.toBeInTheDocument();
  });

  it("(i) el texto de horas envejecidas usa meta.alert_weeks, no un 3 hardcodeado (review.md iteración 1, MF-02)", async () => {
    mockUseEncargoOverview.mockReturnValue({
      data: payloadWith(FULL_DETAIL, { alert_weeks: 5 }),
      isLoading: false,
      isError: false,
      error: null,
    });
    render(<EncargoTab />, { wrapper: createWrapper() });
    await screen.findByText("dashboard.encargo.kpis.staffing");
    expect(screen.getByText("dashboard.encargo.kpis.agedPending(hours=4,weeks=5)")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.encargo.kpis.agedPending(hours=4,weeks=3)")).not.toBeInTheDocument();
  });

  it("(h) error de list_dashboard_engagements también lanza -- no se degrada a 'sin encargos' (review.md iteración 1, MF-03)", () => {
    mockUseDashboardEngagements.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("list_dashboard_engagements boom"),
    });
    render(
      <TabErrorBoundary tabLabel="Encargo">
        <EncargoTab />
      </TabErrorBoundary>,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("dashboard.tabError.retry")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.encargo.noEngagements")).not.toBeInTheDocument();
  });
});
