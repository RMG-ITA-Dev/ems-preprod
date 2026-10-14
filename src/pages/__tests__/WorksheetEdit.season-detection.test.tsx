import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as customRender } from "@/test/utils";
import { screen, fireEvent } from "@testing-library/react";
import enJson from "@/locales/en.json";
import esJson from "@/locales/es.json";

// Carril B / B3c (revisión del PR): con la RLS de `clients`, un rol sin client.read (hr_manager) recibe el embed
// `client` nulo en la hoja de trabajo y la temporada de la OT no se puede autodetectar. El diálogo «Crear OT» tiene que
// avisarlo en lugar de dejar «Alta temporada» como si fuera una detección.

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: "ws-1" }),
    useLocation: () => ({ pathname: "/worksheets/ws-1" }),
  };
});

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "idle" }, allowNextNavigation: vi.fn() }),
}));

const mockUseWorksheetById = vi.fn();
vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetById: (...args: unknown[]) => mockUseWorksheetById(...args),
}));

vi.mock("@/hooks/useWorksheetMutations", () => ({
  useBatchUpsertCells: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateWorkOrderFromWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({
    data: [{ category_id: "cat-1", category_name: "Category 1", practica_id: "svc-1", display_order: 1 }],
    isLoading: false,
  }),
  useActivityCodes: () => ({ data: [], isLoading: false }),
  useAllActivityCodes: () => ({ data: [], isLoading: false }),
  useSetting: () => "0.13",
  useServices: () => ({
    data: [{ practica_id: "svc-1", name: "Auditoría", code: 1, is_active: true, allows_rates_activities: true, created_at: "" }],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false, isPartner: false, isDirector: false, isManager: false }),
}));

// can("work_order.create") habilita el botón «Crear OT»; el resto de permisos queda en falso.
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    roleKey: "admin",
    can: (permission: string) => permission === "work_order.create",
    scope: () => null,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1" }, isLoading: false }),
}));

vi.mock("@/components/worksheet/WorksheetGrid", () => ({
  WorksheetGrid: () => <div data-testid="worksheet-grid" />,
}));

vi.mock("@/components/worksheet/CopyFromEngagementDialog", () => ({
  CopyFromEngagementDialog: () => null,
}));

function makeWorksheet(industry: { fiscal_year_end: string } | null) {
  return {
    id: "ws-1",
    status: "draft",
    wo_id: null as string | null,
    notes: "",
    work_order: null,
    engagement_id: "eng-1",
    engagement: {
      engagement_code: "TST-001",
      engagement_name: "Test Engagement",
      practica: 1,
      client: { client_legal_name: "Test Client", industry },
      partner: null,
      manager: null,
    },
    cells: [],
  };
}

import WorksheetEdit from "../WorksheetEdit";

function openCreateWorkOrderDialog() {
  customRender(<WorksheetEdit />);
  fireEvent.click(screen.getByRole("button", { name: /workMatrix\.createWorkOrder/ }));
}

describe("WorksheetEdit — detección de la temporada al crear la OT", () => {
  beforeEach(() => {
    mockUseWorksheetById.mockReset();
  });

  it("avisa cuando no hay industria del cliente (cliente sin industria o rol sin client.read)", () => {
    mockUseWorksheetById.mockReturnValue({ data: makeWorksheet(null), isLoading: false });
    openCreateWorkOrderDialog();
    const aviso = screen.getByTestId("season-not-detected");
    expect(aviso).toHaveTextContent("workOrders.seasonNotDetected");
    expect(screen.queryByText(/workOrders\.autoDetected/)).not.toBeInTheDocument();
  });

  it("no avisa y muestra el cierre fiscal cuando la industria sí llega", () => {
    mockUseWorksheetById.mockReturnValue({
      data: makeWorksheet({ fiscal_year_end: "31 de diciembre" }),
      isLoading: false,
    });
    openCreateWorkOrderDialog();
    expect(screen.queryByTestId("season-not-detected")).not.toBeInTheDocument();
    expect(screen.getByText(/workOrders\.autoDetected/)).toHaveTextContent("31 de diciembre");
  });

  it("el aviso existe en inglés y en español y pide confirmar la temporada", () => {
    expect(enJson.workOrders.seasonNotDetected).toMatch(/could not be detected/i);
    expect(esJson.workOrders.seasonNotDetected).toMatch(/No se pudo detectar/);
    expect(enJson.workOrders.seasonNotDetected).toMatch(/Check/);
    expect(esJson.workOrders.seasonNotDetected).toMatch(/Verifique/);
  });
});
