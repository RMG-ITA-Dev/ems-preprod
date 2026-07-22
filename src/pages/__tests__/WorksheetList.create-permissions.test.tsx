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

let mockRole = {
  isAdmin: false, isPartner: false, isDirector: false,
  isManager: false, isLoading: false,
};
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => mockRole }));

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
vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [], isLoading: false }),
  useActivityCodes: () => ({ data: [], isLoading: false }),
  useAllActivityCodes: () => ({ data: [], isLoading: false }),
  useServices: () => ({ data: [], isLoading: false }),
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

// Worksheet in draft state, no linked work order — maximum opportunity to show the Create WO button
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

describe("WorksheetList — create permissions (0306-75)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // --- WorksheetList page ---
  it.each([
    ["admin",    { isAdmin: true,  isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["partner",  { isAdmin: false, isPartner: true,  isDirector: false, isManager: false, isLoading: false }],
    ["director", { isAdmin: false, isPartner: false, isDirector: true,  isManager: false, isLoading: false }],
    ["manager",  { isAdmin: false, isPartner: false, isDirector: false, isManager: true,  isLoading: false }],
  ])("shows 'Nueva Matriz' button for %s", (_name, role) => {
    mockRole = role;
    wrap(<WorksheetList />);
    expect(screen.getByText("workMatrix.newWorksheet")).toBeInTheDocument();
  });

  it.each([
    ["senior",     { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["semisenior", { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["staff",      { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["viewer",     { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
  ])("hides 'Nueva Matriz' button for %s", (_name, role) => {
    mockRole = role;
    wrap(<WorksheetList />);
    expect(screen.queryByText("workMatrix.newWorksheet")).not.toBeInTheDocument();
  });

  // --- WorksheetEdit: canCreateWorkOrder hidden for low-rank roles ---
  it.each([
    ["senior", { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["staff",  { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
  ])("WorksheetEdit hides Create Work Order button for %s on draft worksheet", (_name, role) => {
    mockRole = role;
    wrap(<WorksheetEdit />);
    expect(screen.queryByText("workMatrix.createWorkOrder")).not.toBeInTheDocument();
  });

  it("WorksheetEdit shows Create Work Order button for manager on draft worksheet", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: true, isLoading: false };
    wrap(<WorksheetEdit />);
    expect(screen.getByText("workMatrix.createWorkOrder")).toBeInTheDocument();
  });

  // --- WorksheetNew redirect ---
  it("redirects staff away from /worksheets/new after role loads", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false };
    wrap(<WorksheetNew />);
    expect(mockNavigate).toHaveBeenCalledWith("/worksheets", { replace: true });
  });

  it("does not redirect manager away from /worksheets/new", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: true, isLoading: false };
    wrap(<WorksheetNew />);
    expect(mockNavigate).not.toHaveBeenCalledWith("/worksheets", { replace: true });
  });

  it("does not redirect while role is still loading", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: true };
    wrap(<WorksheetNew />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("passes workMatrix.title as the page title (0525-125)", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false };
    wrap(<WorksheetList />);
    expect(screen.getByTestId("page-title")).toHaveTextContent("workMatrix.title");
  });
});
