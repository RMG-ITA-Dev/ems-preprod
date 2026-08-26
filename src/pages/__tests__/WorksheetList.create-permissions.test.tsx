import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// FASE 5: crear Matriz -> can("worksheet.create"); crear OT desde la matriz ->
// can("work_order.create"). WorksheetNew ya no redirige in-page (route guard).
let mockCan: (perm: string) => boolean = () => false;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: mockCan, roleKey: null }),
}));

vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheets: () => ({ data: [], isLoading: false }),
  useWorksheetById: () => ({ data: mockWorksheet, isLoading: false }),
  useEngagementsWithoutWorksheet: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useWorksheetMutations", () => ({
  useBatchUpsertCells: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateWorkOrderFromWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateWorksheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// 0825-183: canCreateWorkOrder also requires the engagement's practica code
// to resolve to a real practicas/services row — mockWorksheet.engagement.practica
// is 1, so useServices must return a matching code, or engagementServiceId stays
// undefined and the button is (correctly) hidden regardless of permissions.
vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [], isLoading: false }),
  useActivityCodes: () => ({ data: [], isLoading: false }),
  useAllActivityCodes: () => ({ data: [], isLoading: false }),
  useServices: () => ({
    data: [{ practica_id: "svc-1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true }],
    isLoading: false,
  }),
  useSetting: () => "0.13",
}));
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { staff_id: "s1" } }),
}));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, title }: any) => (
    <div>
      {title && <span data-testid="page-title">{title}</span>}
      {children}
    </div>
  ),
}));
vi.mock("@/components/worksheet/WorksheetGrid", () => ({
  WorksheetGrid: () => <div data-testid="worksheet-grid" />,
}));
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "unblocked" as const }, allowNextNavigation: vi.fn(), isDirty: false }),
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({ LeavePageDialog: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/timesheetUtils", () => ({ parseDateLocal: (d: string) => new Date(d) }));

// Worksheet in draft state, no linked work order — máxima oportunidad de mostrar Crear OT
const mockWorksheet = {
  id: "ws-1",
  engagement_id: "eng-1",
  status: "draft" as const,
  wo_id: null,
  notes: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  cells: [],
  work_order: null,
  engagement: {
    engagement_id: "eng-1",
    engagement_name: "Test Engagement",
    engagement_code: "ENG-001",
    practica: 1,
    client: { client_legal_name: "Test Client", industry: null },
    partner: null,
    manager: null,
  },
};

import WorksheetList from "../WorksheetList";
import WorksheetEdit from "../WorksheetEdit";
import WorksheetNew from "../WorksheetNew";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/worksheets/ws-1"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("WorksheetList — create permissions (FASE 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCan = () => false;
  });

  it("shows 'Nueva Matriz' when user has worksheet.create", () => {
    mockCan = (perm) => perm === "worksheet.create";
    wrap(<WorksheetList />);
    expect(screen.getByText("workMatrix.newWorksheet")).toBeInTheDocument();
  });

  it("hides 'Nueva Matriz' when user lacks worksheet.create", () => {
    mockCan = () => false;
    wrap(<WorksheetList />);
    expect(screen.queryByText("workMatrix.newWorksheet")).not.toBeInTheDocument();
  });

  it("WorksheetEdit shows Create Work Order button when user has work_order.create (draft worksheet)", () => {
    mockCan = (perm) => perm === "work_order.create";
    wrap(<WorksheetEdit />);
    expect(screen.getByText("workMatrix.createWorkOrder")).toBeInTheDocument();
  });

  it("WorksheetEdit hides Create Work Order button when user lacks work_order.create", () => {
    mockCan = () => false;
    wrap(<WorksheetEdit />);
    expect(screen.queryByText("workMatrix.createWorkOrder")).not.toBeInTheDocument();
  });

  it("WorksheetNew renders without in-page redirect (route guard handles access)", () => {
    wrap(<WorksheetNew />);
    expect(mockNavigate).not.toHaveBeenCalledWith("/worksheets", { replace: true });
  });

  it("passes workMatrix.title as the page title (0525-125)", () => {
    wrap(<WorksheetList />);
    expect(screen.getByTestId("page-title")).toHaveTextContent("workMatrix.title");
  });
});
