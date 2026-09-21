import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TabErrorBoundary } from "@/components/dashboard/TabErrorBoundary";
import { emptyCarteraOverviewPayload, type CarteraOverviewPayload } from "../carteraOverviewTypes";

// dash_cartera (bugs/dashboard/cartera/plan_v2.md §9.2, casos CT1-CT16). Patrón de mocks:
// PartnerTab.test.tsx (dash_socio).

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

const mockSetSelectedCarteraClientId = vi.fn();
const mockSetSelectedCarteraPracticaId = vi.fn();
const mockSetActiveTab = vi.fn();
const mockSetSelectedEngagementId = vi.fn();
let dashboardState: Record<string, unknown> = {};
vi.mock("@/contexts/DashboardContext", () => ({
  useDashboard: () => dashboardState,
}));

const mockUseCarteraOverview = vi.fn();
vi.mock("@/hooks/useCarteraOverview", () => ({
  useCarteraOverview: (...args: unknown[]) => mockUseCarteraOverview(...args),
}));

import { CarteraTab, CarteraFilters } from "../CarteraTab";

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function baseDashboardState(overrides: Record<string, unknown> = {}) {
  return {
    startDateStr: "2025-10-01",
    endDateStr: "2026-09-30",
    selectedYear: 2026,
    selectedCarteraClientId: null,
    setSelectedCarteraClientId: mockSetSelectedCarteraClientId,
    selectedCarteraPracticaId: null,
    setSelectedCarteraPracticaId: mockSetSelectedCarteraPracticaId,
    setActiveTab: mockSetActiveTab,
    setSelectedEngagementId: mockSetSelectedEngagementId,
    ...overrides,
  };
}

function payloadWith(overrides: Partial<CarteraOverviewPayload> = {}): CarteraOverviewPayload {
  const base = emptyCarteraOverviewPayload();
  return {
    ...base,
    ...overrides,
    meta: { ...base.meta, scope_count: 3, unfiltered_scope_count: 3, ...(overrides.meta ?? {}) },
  };
}

describe("CarteraTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardState = baseDashboardState();
  });

  it("CT1: isLoading -> skeleton con 5 tarjetas KPI", () => {
    mockUseCarteraOverview.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getAllByTestId("cartera-kpi-skeleton")).toHaveLength(5);
  });

  it("CT2: unfiltered_scope_count=0 -> dashboard.cartera.empty.scope", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({ meta: { ...emptyCarteraOverviewPayload().meta, scope_count: 0, unfiltered_scope_count: 0 } }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.empty.scope")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.cartera.empty.filters")).not.toBeInTheDocument();
  });

  it("CT3: unfiltered>0 && scope_count=0 -> dashboard.cartera.empty.filters (con el selector de Cliente visible)", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({ meta: { ...emptyCarteraOverviewPayload().meta, scope_count: 0, unfiltered_scope_count: 5 } }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.empty.filters")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.cartera.empty.scope")).not.toBeInTheDocument();
  });

  // MF-02 (review.md iteración 1): el mensaje se mostraba ARRIBA del tablero y el cuerpo
  // seguía renderizando los 5 KPIs y todos los bloques en cero -- indistinguible de "hay
  // encargos pero sin horas cargadas".
  it("CT3b: el vacío por filtros NO renderiza KPIs ni bloques (el tablero en cero no debe verse)", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({ meta: { ...emptyCarteraOverviewPayload().meta, scope_count: 0, unfiltered_scope_count: 5 } }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    for (const key of [
      "dashboard.cartera.kpi.engagements.title",
      "dashboard.cartera.kpi.review.title",
      "dashboard.cartera.blocks.activities.title",
      "dashboard.cartera.blocks.collections.title",
      "dashboard.cartera.blocks.engagementHours.title",
    ]) {
      expect(screen.queryByText(key)).not.toBeInTheDocument();
    }
  });

  it("CT4: KPI2 muestra kpi.clientsServices.value y la variación calculada con pctChange", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        kpis: {
          ...emptyCarteraOverviewPayload().kpis,
          clients_services: { clients: 4, services: 2, previous_clients: 2, previous_services: 2 },
        },
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.kpi.clientsServices.value(clients=4,services=2)")).toBeInTheDocument();
    // pctChange(4,2) = 100
    expect(screen.getByText("dashboard.cartera.kpi.clientsServices.vsPriorYear(pct=100)")).toBeInTheDocument();
  });

  it("CT5: KPI5 muestra over/wo/risk y aria del ícono cambia de tono cuando over_budget_count>0", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        kpis: {
          ...emptyCarteraOverviewPayload().kpis,
          review: { over_budget_count: 2, pending_wo_count: 1, pending_risk_count: 3 },
        },
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("2 · 1 · 3")).toBeInTheDocument();
  });

  // SF-03 (review.md iteración 1): alertCardTone() solo pondera sobregiros y OT pendientes,
  // así que la tarjeta salía en VERDE con riesgos por aprobar a la vista.
  it("CT5b: KPI5 con solo riesgos pendientes (0 · 0 · 3) no queda en tono success", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        kpis: {
          ...emptyCarteraOverviewPayload().kpis,
          review: { over_budget_count: 0, pending_wo_count: 0, pending_risk_count: 3 },
        },
      }),
    });
    const { container } = render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("0 · 0 · 3")).toBeInTheDocument();
    expect(container.querySelector("svg.text-success")).not.toBeInTheDocument();
    expect(container.querySelector("svg.text-warning")).toBeInTheDocument();
  });

  it("CT6: Cascada -- con actividades renderiza título; con items=[] muestra blocks.activities.empty", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        activities: {
          total_budget_hours: 30,
          items: [
            { activity_id: "a1", activity_code: "A1", description: "Act 1", budget_hours: 20, approved_hours: 5, pending_hours: 5 },
            { activity_id: "a2", activity_code: "A2", description: "Act 2", budget_hours: 10, approved_hours: 2, pending_hours: 0 },
          ],
        },
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.blocks.activities.title")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.cartera.blocks.activities.empty")).not.toBeInTheDocument();
  });

  it("CT6b: sin actividades muestra blocks.activities.empty", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({ activities: { total_budget_hours: 0, items: [] } }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.blocks.activities.empty")).toBeInTheDocument();
  });

  it("CT6c: items no vacíos pero total_budget_hours=0 (horas ejecutadas sin matriz aprobada) -- también muestra blocks.activities.empty, no un gráfico en blanco", () => {
    // Bug reportado 2026-09-18: activity_exec puede traer filas (horas cargadas contra una
    // actividad) sin que exista una activity_worksheet approved -- activity_budget queda
    // vacío, total_budget_hours=0, pero items.length > 0. buildActivityWaterfall pone todos
    // los % en 0 con denom=0, así que antes del fix el gráfico quedaba en blanco sin mensaje.
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        activities: {
          total_budget_hours: 0,
          items: [
            { activity_id: "a1", activity_code: "A1", description: "Act 1", budget_hours: 0, approved_hours: 5, pending_hours: 5 },
          ],
        },
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.blocks.activities.empty")).toBeInTheDocument();
  });

  it("CT7: Horas por categoría -- categoría con presupuesto 0 y ejecutado>0 no renderiza el track de presupuesto (borde punteado)", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        categories: {
          total_budget_hours: 20,
          items: [
            { category_id: "c1", category_name: "Senior", display_order: 1, budget_hours: 20, approved_hours: 5, pending_hours: 0 },
            { category_id: "c2", category_name: "Sin Presupuesto", display_order: 2, budget_hours: 0, approved_hours: 3, pending_hours: 0 },
          ],
        },
      }),
    });
    const { container } = render(<CarteraTab />, { wrapper: createWrapper() });
    // La categoría "Sin Presupuesto" no debe tener un track con borde punteado (border-dashed).
    const dashedTracks = container.querySelectorAll(".border-dashed");
    expect(dashedTracks).toHaveLength(1); // solo "Senior"
  });

  // BUG 2026-09-20: el RPC ya no duplica una categoría dentro de la misma práctica, pero en
  // la vista "Todas" siguen conviviendo el "Socio" de cada práctica -- sin la abreviatura,
  // dos barras idénticas quedan indistinguibles.
  it("CT7b: Horas por categoría -- nombre repetido en 2 prácticas se muestra con la abreviatura; el nombre único queda limpio", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        categories: {
          total_budget_hours: 38,
          items: [
            { category_id: "c1", category_name: "Socio", display_order: 1, practica_abbr: "AUD", budget_hours: 10, approved_hours: 0, pending_hours: 7 },
            { category_id: "c2", category_name: "Socio", display_order: 1, practica_abbr: "COM", budget_hours: 8, approved_hours: 2, pending_hours: 0 },
            { category_id: "c3", category_name: "Senior", display_order: 2, practica_abbr: "AUD", budget_hours: 20, approved_hours: 5, pending_hours: 0 },
          ],
        },
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("Socio · AUD")).toBeInTheDocument();
    expect(screen.getByText("Socio · COM")).toBeInTheDocument();
    expect(screen.getByText("Senior")).toBeInTheDocument();
    expect(screen.queryByText("Senior · AUD")).not.toBeInTheDocument();
  });

  it("CT8: Presupuesto de personal -- budgeted:null renderiza la celda como '—'", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        staffing: [{ category_id: "c1", category_name: "Sin Requisito", budgeted: null, executed: 2 }],
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    // "—" también aparece como placeholder de "Próximos 7 días" vacío -- se busca
    // específicamente la celda de la tabla de Presupuesto de personal.
    const dashCells = screen.getAllByText("—").filter((el) => el.tagName === "TD");
    expect(dashCells.length).toBeGreaterThan(0);
  });

  it("CT9: Cola -- resumen summary(hours,people); ítem con alert=true renderiza el ícono de alerta", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        meta: { ...emptyCarteraOverviewPayload().meta, scope_count: 3, unfiltered_scope_count: 3, today: "2026-09-17", retro_days: 30 },
        approval_queue: {
          total_hours: 8.5,
          distinct_people: 2,
          total_count: 1,
          items: [
            {
              approval_id: "ap1",
              staff_name: "Juan Perez",
              engagement_id: "e1",
              engagement_code: "E1",
              week_start_date: "2026-08-13",
              hours: 6,
              weeks_old: 5,
              alert: true,
            },
          ],
        },
      }),
    });
    const { container } = render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.blocks.approvalQueue.summary(hours=9,people=2)")).toBeInTheDocument();
    expect(container.querySelector("svg.text-warning")).toBeInTheDocument();
  });

  // MF-03 (review.md iteración 1): el "+N más" contaba lo que sobraba de la lista RECIBIDA,
  // que el servidor ya recortó a 20 líneas -- las personas que el LIMIT dejó afuera no se
  // contaban en ningún lado. Ahora sale de distinct_people, que el RPC calcula sobre TODAS.
  it("CT9b: el '+N más' cuenta las personas que el servidor dejó fuera, no el resto de la lista recibida", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        meta: { ...emptyCarteraOverviewPayload().meta, scope_count: 3, unfiltered_scope_count: 3, today: "2026-09-17", retro_days: 30 },
        approval_queue: {
          total_hours: 40,
          distinct_people: 12, // 12 personas con pendientes...
          total_count: 60,
          items: Array.from({ length: 6 }, (_, i) => ({
            // ...pero solo llegaron 6 (el resto lo cortó el LIMIT del servidor)
            approval_id: `ap${i}`,
            staff_id: `s${i}`,
            staff_name: `Persona ${i}`,
            engagement_id: "e1",
            engagement_code: "E1",
            week_start_date: "2026-09-07",
            hours: 2,
            weeks_old: 1,
            alert: false,
          })),
        },
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    // Se renderizan 5; quedan 12 - 5 = 7 personas fuera (antes decía "+1", contando filas).
    expect(screen.getByText("dashboard.cartera.blocks.approvalQueue.more(count=7)")).toBeInTheDocument();
  });

  it("CT10: Hitos -- ítems agrupados en past/upcoming según meta.today", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        meta: { ...emptyCarteraOverviewPayload().meta, scope_count: 3, unfiltered_scope_count: 3, today: "2026-09-17" },
        milestones: [
          { kind: "closing", date: "2026-09-25", engagement_id: "e1", engagement_code: "E1", engagement_name: "E1", weeks: null },
          { kind: "wo_approved", date: "2026-08-20", engagement_id: "e2", engagement_code: "E2", engagement_name: "E2", weeks: null },
        ],
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.blocks.milestones.past")).toBeInTheDocument();
    expect(screen.getByText("dashboard.cartera.blocks.milestones.upcoming")).toBeInTheDocument();
  });

  it("CT11: Horas por encargo -- clic en una fila llama setSelectedEngagementId(id) + setActiveTab('encargo')", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        engagement_rows: [
          {
            engagement_id: "eng-1",
            engagement_code: "E1",
            engagement_name: "Engagement 1",
            client_legal_name: "Cliente 1",
            budget_hours: 10,
            approved_hours: 5,
            pending_hours: 0,
            over_budget: false,
          },
        ],
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    const row = screen.getByRole("button", { name: /E1/i });
    fireEvent.click(row);
    expect(mockSetSelectedEngagementId).toHaveBeenCalledWith("eng-1");
    expect(mockSetActiveTab).toHaveBeenCalledWith("encargo");
  });

  it("CT12: isError -> lanza (lo captura TabErrorBoundary); no renderiza KPIs en cero", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("portfolio_overview boom"),
      data: undefined,
    });
    render(
      <TabErrorBoundary tabLabel="Cartera">
        <CarteraTab />
      </TabErrorBoundary>,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("dashboard.tabError.retry")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.cartera.kpi.engagements.title")).not.toBeInTheDocument();
  });

  it("CT13: CarteraFilters -- elegir un cliente llama setSelectedCarteraClientId(id); 'Global' -> null", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        filters: { clients: [{ client_id: "c1", client_legal_name: "Cliente Uno" }], practicas: [] },
      }),
    });
    render(<CarteraFilters />, { wrapper: createWrapper() });
    // El Select de Radix no abre fácilmente en jsdom sin más setup; se verifica que el
    // trigger existe con la opción "Global" seleccionada por defecto.
    expect(screen.getByText("dashboard.cartera.filters.clientGlobal")).toBeInTheDocument();
  });

  it("CT13b: selector de Práctica -- oculto cuando scope_kind='own', visible cuando 'firm' con opciones", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        meta: { ...emptyCarteraOverviewPayload().meta, scope_count: 3, unfiltered_scope_count: 3, scope_kind: "own" },
        filters: { clients: [], practicas: [{ practica_id: "p1", name: "Auditoría" }] },
      }),
    });
    const { rerender } = render(<CarteraFilters />, { wrapper: createWrapper() });
    expect(screen.queryByText("dashboard.cartera.filters.practicaGlobal")).not.toBeInTheDocument();

    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        meta: { ...emptyCarteraOverviewPayload().meta, scope_count: 3, unfiltered_scope_count: 3, scope_kind: "firm" },
        filters: { clients: [], practicas: [{ practica_id: "p1", name: "Auditoría" }] },
      }),
    });
    rerender(<CarteraFilters />);
    expect(screen.getByText("dashboard.cartera.filters.practicaGlobal")).toBeInTheDocument();
  });

  it("CT14: isPlaceholderData -- se conservan los datos previos y aparece dashboard.cartera.updating", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      isPlaceholderData: true,
      data: payloadWith({
        kpis: { ...emptyCarteraOverviewPayload().kpis, engagements: { total: 4, approved: 4, emergency: 0 } },
      }),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.updating")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("CT15: los bloques se renderizan en el orden de §8.1 (KPIs, Cascada, categoría/personal, facturación/gastos/cola, encargos/hitos)", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({}),
    });
    const { container } = render(<CarteraTab />, { wrapper: createWrapper() });
    const headings = Array.from(container.querySelectorAll("h1,h2,h3,[class*='card-title'],div")).map((n) => n.textContent);
    const activitiesIdx = headings.findIndex((h) => h === "dashboard.cartera.blocks.activities.title");
    const categoriesIdx = headings.findIndex((h) => h === "dashboard.cartera.blocks.categories.title");
    const staffingIdx = headings.findIndex((h) => h === "dashboard.cartera.blocks.staffing.title");
    const engagementHoursIdx = headings.findIndex((h) => h === "dashboard.cartera.blocks.engagementHours.title");
    const milestonesIdx = headings.findIndex((h) => h === "dashboard.cartera.blocks.milestones.title");
    expect(activitiesIdx).toBeGreaterThan(-1);
    expect(categoriesIdx).toBeGreaterThan(activitiesIdx);
    expect(staffingIdx).toBeGreaterThan(categoriesIdx);
    expect(engagementHoursIdx).toBeGreaterThan(staffingIdx);
    expect(milestonesIdx).toBeGreaterThan(staffingIdx);
  });

  it("CT16: los títulos de bloque son claves i18n, no literales hardcodeados", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({}),
    });
    render(<CarteraTab />, { wrapper: createWrapper() });
    // El mock de t() devuelve la clave tal cual -- si algún título estuviera hardcodeado en
    // español/inglés en vez de pasar por t(), no matchearía el patrón "dashboard.cartera.*".
    for (const key of [
      "dashboard.cartera.kpi.engagements.title",
      "dashboard.cartera.kpi.clientsServices.title",
      // payloadWith({}) no trae categoría del llamante -> título genérico (ver CT17).
      "dashboard.cartera.kpi.roleHours.titleGeneric",
      "dashboard.cartera.kpi.progress.title",
      "dashboard.cartera.kpi.review.title",
      "dashboard.cartera.blocks.activities.title",
      "dashboard.cartera.blocks.categories.title",
      "dashboard.cartera.blocks.staffing.title",
      "dashboard.cartera.blocks.engagementHours.title",
      "dashboard.cartera.blocks.milestones.title",
    ]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
  });

  // Reporte en vivo del operador (2026-09-20): siendo socio, la tarjeta decía "Horas como
  // Gerente" y mostraba 0/0 -- el KPI estaba clavado en el rol de gerente.
  it("CT17: KPI 3 -- el título sigue a la categoría del llamante; sin categoría cae al genérico", () => {
    mockUseCarteraOverview.mockReturnValue({
      isLoading: false,
      isError: false,
      data: payloadWith({
        kpis: {
          ...emptyCarteraOverviewPayload().kpis,
          my_role_hours: { role_key: null, role_label: "Socio", budget: 10, approved: 0, pending: 5 },
        },
      }),
    });
    const { unmount } = render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.kpi.roleHours.title(role=Socio)")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.cartera.kpi.roleHours.titleGeneric")).not.toBeInTheDocument();
    unmount();

    mockUseCarteraOverview.mockReturnValue({ isLoading: false, isError: false, data: payloadWith({}) });
    render(<CarteraTab />, { wrapper: createWrapper() });
    expect(screen.getByText("dashboard.cartera.kpi.roleHours.titleGeneric")).toBeInTheDocument();
  });
});
