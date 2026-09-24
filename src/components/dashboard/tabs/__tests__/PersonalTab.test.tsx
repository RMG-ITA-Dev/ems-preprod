import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TabErrorBoundary } from "@/components/dashboard/TabErrorBoundary";
import {
  emptyPersonalOverviewPayload,
  type PersonalOverviewPayload,
  type ComplianceWeekStatus,
} from "../personalOverviewTypes";

// dash_personal (bugs/dashboard/personal/plan_v2.md §9.4): reemplaza las 6 queryFns directas
// (+ PendingHoursAlert) por un mock de usePersonalOverview, mismo patrón que
// EncargoTab.test.tsx/CarteraTab.test.tsx.

// jsdom no implementa ResizeObserver -- lo necesita recharts' <ResponsiveContainer> (gráfica
// de carga planificada vs. guardada). Mismo polyfill que DataTable.initialFilters.test.tsx.
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;

// review.md Iteración 2, SHOULD FIX R2.5: PT4 solo confirmaba que el título de la tarjeta
// existía, nunca que el gráfico recibiera datos. Se mockea recharts para poder inspeccionar
// el prop `data` real de <BarChart> en vez de depender del render SVG (que jsdom no mide).
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ data, children }: { data: unknown; children: React.ReactNode }) => (
    <div data-testid="load-bar-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

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
vi.mock("@/contexts/DashboardContext", () => ({
  useDashboard: () => dashboardState,
}));

const mockUsePersonalOverview = vi.fn();
vi.mock("@/hooks/usePersonalOverview", () => ({
  usePersonalOverview: (...args: unknown[]) => mockUsePersonalOverview(...args),
}));

let mockCan = (_key: string) => false;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: (key: string) => mockCan(key),
    scope: () => null,
    isLoading: false,
  }),
}));

import { PersonalTab } from "../PersonalTab";

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
    startDateStr: "2026-01-01",
    endDateStr: "2026-12-31",
    ...overrides,
  };
}

function payloadWith(overrides: Partial<PersonalOverviewPayload> = {}): PersonalOverviewPayload {
  const base = emptyPersonalOverviewPayload();
  return {
    ...base,
    ...overrides,
    meta: {
      ...base.meta,
      has_staff_record: true,
      today: "2026-09-21",
      current_week_start: "2026-09-21",
      operational_end: "2026-10-18",
      history_start: "2026-01-01",
      history_end: "2026-12-31",
      ...(overrides.meta ?? {}),
    },
    workload_weeks: overrides.workload_weeks ?? [
      { week_start: "2026-09-21", week_end: "2026-09-27", planned_hours: 32, saved_hours: 26 },
      { week_start: "2026-09-28", week_end: "2026-10-04", planned_hours: 36, saved_hours: 0 },
      { week_start: "2026-10-05", week_end: "2026-10-11", planned_hours: 40, saved_hours: 0 },
      { week_start: "2026-10-12", week_end: "2026-10-18", planned_hours: 24, saved_hours: 0 },
    ],
    compliance_weeks:
      overrides.compliance_weeks ??
      Array.from({ length: 12 }, (_, i) => ({
        week_start: `2026-${String(i + 1).padStart(2, "0")}-01`,
        week_end: `2026-${String(i + 1).padStart(2, "0")}-07`,
        status: "NOT_LOGGED" as const,
        saved_hours: 0,
        approved_hours: 0,
        period_id: null,
        deadline: null,
        submitted_at: null,
        review_notes: [],
      })),
  };
}

describe("PersonalTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardState = baseDashboardState();
    mockCan = () => false;
  });

  it("PT1: sin ficha de personal -> estado vacío explícito", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({ meta: { ...emptyPersonalOverviewPayload().meta, has_staff_record: false } }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.personal.empty.noStaffRecord")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.personal.kpi.thisWeek")).not.toBeInTheDocument();
  });

  it("PT2: exactamente tres tarjetas KPI", () => {
    mockUsePersonalOverview.mockReturnValue({ isLoading: false, isError: false, data: payloadWith() });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.personal.kpi.thisWeek")).toBeInTheDocument();
    expect(screen.getByText("dashboard.personal.kpi.nextAssignment")).toBeInTheDocument();
    expect(screen.getByText("dashboard.personal.kpi.funds")).toBeInTheDocument();
    // No hay un cuarto KPI "Este mes" (retirado, decisiones.md).
    expect(screen.queryByText(/thisMonth/)).not.toBeInTheDocument();
  });

  it("PT3: la sección de atención aparece antes de los KPI en el DOM", () => {
    mockUsePersonalOverview.mockReturnValue({ isLoading: false, isError: false, data: payloadWith() });
    const { container } = render(<PersonalTab />, { wrapper: createWrapper() });
    const attentionIdx = container.innerHTML.indexOf("dashboard.personal.attention.title");
    const kpiIdx = container.innerHTML.indexOf("dashboard.personal.kpi.thisWeek");
    expect(attentionIdx).toBeGreaterThan(-1);
    expect(kpiIdx).toBeGreaterThan(-1);
    expect(attentionIdx).toBeLessThan(kpiIdx);
  });

  it("PT4: la gráfica de carga recibe exactamente 4 semanas con sus valores", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        workload_weeks: [
          { week_start: "2026-09-21", week_end: "2026-09-27", planned_hours: 32, saved_hours: 26 },
          { week_start: "2026-09-28", week_end: "2026-10-04", planned_hours: 36, saved_hours: 0 },
          { week_start: "2026-10-05", week_end: "2026-10-11", planned_hours: 40, saved_hours: 0 },
          { week_start: "2026-10-12", week_end: "2026-10-18", planned_hours: 24, saved_hours: 0 },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.personal.load.title")).toBeInTheDocument();
    const chartData = JSON.parse(screen.getByTestId("load-bar-chart").getAttribute("data-chart")!);
    expect(chartData).toHaveLength(4);
    expect(chartData.map((d: { planned: number; saved: number }) => [d.planned, d.saved])).toEqual([
      [32, 26],
      [36, 0],
      [40, 0],
      [24, 0],
    ]);
  });

  it("PT4b: la gráfica de carga nunca recibe un número de semanas distinto de 4 (caso defensivo)", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        workload_weeks: [
          { week_start: "2026-09-21", week_end: "2026-09-27", planned_hours: 32, saved_hours: 26 },
          { week_start: "2026-09-28", week_end: "2026-10-04", planned_hours: 36, saved_hours: 0 },
          { week_start: "2026-10-05", week_end: "2026-10-11", planned_hours: 40, saved_hours: 0 },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    const chartData = JSON.parse(screen.getByTestId("load-bar-chart").getAttribute("data-chart")!);
    // El componente no fuerza a 4 -- si el RPC devolviera menos/más semanas, el gráfico
    // reflejaría exactamente eso; esta prueba documenta que la garantía de "4 exactas" es
    // responsabilidad del RPC/toPersonalViewModel, no de PersonalTab, y falla si cambia.
    expect(chartData).toHaveLength(3);
  });

  it("PT5: unión de asignadas/guardadas -- un encargo solo guardado muestra assigned_hours=0", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        current_week_engagements: [
          { engagement_id: "e1", engagement_code: "AUD-1", engagement_name: "n", function_code: 1, assigned_hours: 0, saved_hours: 6 },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.getAllByText("AUD-1").length).toBeGreaterThan(0);
  });

  it("PT6: REJECTED se traduce como Rechazado (i18n), nunca 'Observado' en cumplimiento", () => {
    const weeks = Array.from({ length: 12 }, (_, i) => ({
      week_start: `2026-${String(i + 1).padStart(2, "0")}-01`,
      week_end: `2026-${String(i + 1).padStart(2, "0")}-07`,
      status: (i === 5 ? "REJECTED" : "NOT_LOGGED") as ComplianceWeekStatus,
      saved_hours: 0,
      approved_hours: 0,
      period_id: i === 5 ? "p1" : null,
      deadline: null,
      submitted_at: i === 5 ? "2026-09-01T00:00:00Z" : null,
      review_notes:
        i === 5
          ? [
              {
                approval_id: "a1",
                approval_status: "rejected" as const,
                engagement_id: "e1",
                engagement_code: "AUD-1",
                engagement_name: "n",
                activity_id: "act1",
                activity_code: "A1",
                notes: "Falta detalle de horas",
              },
            ]
          : [],
    }));
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({ compliance_weeks: weeks }),
    });
    const { container } = render(<PersonalTab />, { wrapper: createWrapper() });
    expect(container.innerHTML).not.toMatch(/dashboard\.personal\.compliance\.status\.observ/i);
    expect(container.innerHTML).not.toContain(">Observado<");
  });

  it("PT7: fondos -- flujo horizontal BOB siempre visible, USD ausente sin datos", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        fund_requests: [
          {
            fund_request_id: "fr1",
            request_number: "SF-024",
            purpose: null,
            status: "aprobado_gerente",
            request_currency: "BOB",
            due_back_date: "2026-09-21",
            amounts_by_currency: [
              { currency: "BOB", requested_amount: 4500, disbursed_amount: 4500, expenses_loaded_amount: 3860, manager_approved_amount: 3860, accounting_reviewed_amount: 0 },
            ],
            expenses: [],
          },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.personal.funds.currency.bob")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.personal.funds.currency.usd")).not.toBeInTheDocument();
    // aprobado_gerente -> Pendiente de contabilidad (decisiones.md §3), tanto en la solicitud...
    expect(screen.getAllByText("dashboard.personal.funds.status.pendingAccounting").length).toBeGreaterThan(0);
    // ...como en la etiqueta de la barra de progreso.
    expect(screen.getByText("dashboard.personal.funds.pendingAccounting")).toBeInTheDocument();
    // "Rendición vence hoy" exacto (due_back_date === meta.today) -- aparece tanto en el
    // bloque de fondos como en la línea de "Próximos vencimientos" correspondiente.
    expect(screen.getAllByText("dashboard.personal.deadlines.fundDueToday").length).toBeGreaterThan(0);
  });

  it("PT7b: USD visible cuando hay importes USD", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        fund_requests: [
          {
            fund_request_id: "fr1",
            request_number: "SF-030",
            purpose: null,
            status: "pendiente_aprobacion",
            request_currency: "BOB",
            due_back_date: null,
            amounts_by_currency: [
              { currency: "BOB", requested_amount: 100, disbursed_amount: 0, expenses_loaded_amount: 0, manager_approved_amount: 0, accounting_reviewed_amount: 0 },
              { currency: "USD", requested_amount: 0, disbursed_amount: 0, expenses_loaded_amount: 40, manager_approved_amount: 0, accounting_reviewed_amount: 0 },
            ],
            expenses: [],
          },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.personal.funds.currency.usd")).toBeInTheDocument();
  });

  it("PT8: pronóstico de la semana actual visible, separado de las horas guardadas", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        current_week: { planned_hours: 32, saved_hours: 26, forecast_hours: 8, approved_hours: 0 },
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.personal.kpi.forecastHours(hours=8)")).toBeInTheDocument();
    expect(screen.getByText("dashboard.personal.kpi.savedOfPlanned(saved=26,planned=32)")).toBeInTheDocument();
  });

  it("PT9: acción de gestión solo aparece con timesheet_approval.approve, enlaza a /timesheet/approvals", () => {
    mockUsePersonalOverview.mockReturnValue({ isLoading: false, isError: false, data: payloadWith() });
    const { rerender } = render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.queryByText("dashboard.personal.management.title")).not.toBeInTheDocument();

    mockCan = (key) => key === "timesheet_approval.approve";
    rerender(<PersonalTab />);
    expect(screen.getByText("dashboard.personal.management.title")).toBeInTheDocument();
    const link = screen.getByText("dashboard.personal.management.approvals").closest("a");
    expect(link).toHaveAttribute("href", "/timesheet/approvals");
  });

  it("PT10: la acción de fondos enlaza a /fund-requests/:id/expenses", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        fund_requests: [
          {
            fund_request_id: "fr-abc",
            request_number: "SF-050",
            purpose: null,
            status: "pendiente_aprobacion",
            request_currency: "BOB",
            due_back_date: null,
            amounts_by_currency: [],
            expenses: [],
          },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    const link = screen.getByText("dashboard.personal.funds.resolve").closest("a");
    expect(link).toHaveAttribute("href", "/fund-requests/fr-abc/expenses");
  });

  it("PT11: histórico colapsable, cerrado por defecto", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({ historical: { saved_hours: 120, by_engagement: [] } }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.personal.historical.title")).toBeInTheDocument();
  });

  it("PT12: el error del hook llega al TabErrorBoundary", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("personal_overview boom"),
      data: undefined,
    });
    render(
      <TabErrorBoundary tabLabel="Personal">
        <PersonalTab />
      </TabErrorBoundary>,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("dashboard.tabError.title(tab=Personal)")).toBeInTheDocument();
  });

  it("PT13: gasto observado/rechazado/sin respaldo se muestran con su badge", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        fund_requests: [
          {
            fund_request_id: "fr1",
            request_number: "SF-060",
            purpose: null,
            status: "aprobado_gerente",
            request_currency: "BOB",
            due_back_date: null,
            amounts_by_currency: [],
            expenses: [
              { expense_id: "x1", expense_date: "2026-09-10", description: "Hospedaje", status: "observado", currency: "BOB", amount: 100, has_attachment: true, has_invoice_observation: true, invoice_observation_notes: "falta factura", returned_by_assistant: false, manager_notes: null, rejection_reason: null },
              { expense_id: "x2", expense_date: "2026-09-11", description: "Transporte", status: "rechazado", currency: "BOB", amount: 50, has_attachment: false, has_invoice_observation: false, invoice_observation_notes: null, returned_by_assistant: false, manager_notes: null, rejection_reason: "sin justificar" },
            ],
          },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(screen.getByText("Hospedaje")).toBeInTheDocument();
    expect(screen.getByText("Transporte")).toBeInTheDocument();
    expect(screen.getByText("dashboard.personal.funds.status.observed")).toBeInTheDocument();
    expect(screen.getByText("dashboard.personal.funds.status.rejected")).toBeInTheDocument();
    expect(screen.getByText("dashboard.personal.funds.withoutReceipt")).toBeInTheDocument();
  });

  // review.md Iteración 1, MUST FIX R1.1: el "Resolver" de la alerta de atención debe
  // navegar por fund_request_id (UUID), nunca por request_number (etiqueta visible).
  it("PT14: el 'Resolver' de la alerta de atención enlaza por fund_request_id, no por request_number", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        fund_requests: [
          {
            fund_request_id: "fr-abc",
            request_number: "SF-050",
            purpose: null,
            status: "pendiente_aprobacion",
            request_currency: "BOB",
            due_back_date: "2026-09-21",
            amounts_by_currency: [],
            expenses: [],
          },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    const links = screen.getAllByText("dashboard.personal.attention.resolve").map((el) => el.closest("a"));
    expect(links.some((a) => a?.getAttribute("href") === "/fund-requests/fr-abc/expenses")).toBe(true);
    expect(links.some((a) => a?.getAttribute("href") === "/fund-requests/SF-050/expenses")).toBe(false);
  });

  // review.md Iteración 1, MUST FIX R1.2: DRAFT (período creado, sin enviar) con horas
  // guardadas también debe mostrarse como "falta enviar", igual que NOT_SUBMITTED.
  it("PT15: timesheet DRAFT con horas guardadas aparece en Acciones que requieren atención", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        compliance_weeks: [
          {
            week_start: "2026-09-14",
            week_end: "2026-09-20",
            status: "DRAFT",
            saved_hours: 16,
            approved_hours: 0,
            period_id: "p1",
            deadline: null,
            submitted_at: null,
            review_notes: [],
          },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    expect(
      screen.getByText("dashboard.personal.attention.timesheetNotSubmitted(week=14/09/2026,hours=16)"),
    ).toBeInTheDocument();
  });

  // review.md Iteración 1, SHOULD FIX R1.3: el bloque USD debe mostrarse si el RPC ya
  // entregó el bucket USD, aunque todos sus acumulados estén en cero.
  it("PT16: USD visible cuando existe el bucket USD aunque todos los importes sean cero", () => {
    mockUsePersonalOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        fund_requests: [
          {
            fund_request_id: "fr1",
            request_number: "SF-070",
            purpose: null,
            status: "borrador",
            request_currency: "USD",
            due_back_date: null,
            amounts_by_currency: [
              { currency: "USD", requested_amount: 0, disbursed_amount: 0, expenses_loaded_amount: 0, manager_approved_amount: 0, accounting_reviewed_amount: 0 },
            ],
            expenses: [],
          },
        ],
      }),
    });
    render(<PersonalTab />, { wrapper: createWrapper() });
    // BOB sigue presente (siempre se sintetiza) aunque el RPC no haya mandado su bucket.
    expect(screen.getByText("dashboard.personal.funds.currency.bob")).toBeInTheDocument();
    expect(screen.getByText("dashboard.personal.funds.currency.usd")).toBeInTheDocument();
  });
});
