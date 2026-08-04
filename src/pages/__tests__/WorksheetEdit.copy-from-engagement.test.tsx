import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as customRender } from "@/test/utils";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import enJson from "@/locales/en.json";

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

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
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
const mockUseWorksheets = vi.fn();
vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetById: (...args: unknown[]) => mockUseWorksheetById(...args),
  useWorksheets: (...args: unknown[]) => mockUseWorksheets(...args),
}));

function makeSourceWorksheets(overrides: object[] = []) {
  return [
    {
      id: "ws-2",
      created_by_staff_id: "staff-123",
      engagement: {
        engagement_code: "ENG-002",
        engagement_name: "Source Engagement",
        practica: 1,
        client: { client_legal_name: "Source Client" },
        status: "draft",
      },
    },
    ...overrides,
  ];
}

const mockBatchUpsertCells = vi.fn();
const mockUpdateWorksheet = vi.fn();
const mockCreateWOFromWorksheet = vi.fn();

vi.mock("@/hooks/useWorksheetMutations", () => ({
  useBatchUpsertCells: () => ({ mutateAsync: mockBatchUpsertCells, isPending: false }),
  useUpdateWorksheet: () => ({ mutateAsync: mockUpdateWorksheet, isPending: false }),
  useCreateWorkOrderFromWorksheet: () => ({ mutateAsync: mockCreateWOFromWorksheet, isPending: false }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({
    data: [
      { category_id: "cat-1", category_name: "Category 1", service_id: "svc-1", display_order: 1 },
      { category_id: "cat-2", category_name: "Category 2", service_id: "svc-1", display_order: 2 },
    ],
    isLoading: false,
  }),
  useActivityCodes: () => ({
    data: [
      { activity_id: "act-1", activity_code: "ACT-1", description: "Activity 1", is_active: true, service: { code: 1 } },
      { activity_id: "act-2", activity_code: "ACT-2", description: "Activity 2", is_active: true, service: { code: 1 } },
    ],
    isLoading: false,
  }),
  useAllActivityCodes: () => ({
    data: [
      { activity_id: "act-1", activity_code: "ACT-1", description: "Activity 1", is_active: true, service_id: "svc-1" },
      { activity_id: "act-2", activity_code: "ACT-2", description: "Activity 2", is_active: true, service_id: "svc-1" },
    ],
    isLoading: false,
  }),
  useSetting: () => "0.13",
  useServices: () => ({
    data: [{ service_id: "svc-1", name: "Auditoría", code: 1, is_active: true, allows_rates_activities: true, created_at: "" }],
  }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false, isPartner: false, isDirector: false, isManager: false }),
}));
// Fase 5 migró canCreateWorkOrder de (isAdmin||isPartner||isDirector||isManager)
// a can("work_order.create"). useAuthorization llama a useAuth por dentro, así que
// sin este mock el render falla con "useAuth must be used within an AuthProvider".
// Con los cuatro flags en false el gate anterior daba false: can() => false lo replica.
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    // WorksheetEdit ahora exige poder ESCRIBIR la matriz para habilitar el grid:
    // roleKey admin o ser Socio/Gerente del encargo (espejo de is_admin() OR
    // is_engagement_team_member() del backend). Los fixtures de estos tests traen
    // partner/manager en null, asi que se usa la rama admin. `can()` se deja como
    // lo tenia cada test, que gatea otra cosa (crear OT desde la matriz).
    roleKey: "admin",
    can: () => false,
    scope: () => null,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({
    data: { staff_id: "staff-123" },
    staffRecord: { staff_id: "staff-123" },
    isLoading: false,
  }),
}));

vi.mock("@/components/worksheet/WorksheetGrid", () => ({
  WorksheetGrid: ({ readOnly }: { readOnly?: boolean }) => (
    <div data-testid="worksheet-grid" data-readonly={String(readOnly)}>
      Grid Content
    </div>
  ),
}));

function makeWorksheet(overrides: object = {}) {
  return {
    id: "ws-1",
    status: "draft",
    wo_id: null as string | null,
    notes: "",
    work_order: null as { wo_id: string; approval_status: string } | null,
    engagement_id: "eng-1",
    engagement: {
      engagement_code: "TST-001",
      engagement_name: "Test Engagement",
      practica: 1,
      client: { client_legal_name: "Test Client", industry: null },
      partner: null,
      manager: null,
    },
    cells: [
      {
        id: "cell-1",
        worksheet_id: "ws-1",
        category_id: "cat-1",
        activity_id: "act-1",
        budget_hours: 8,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    ...overrides,
  };
}

import WorksheetEdit from "../WorksheetEdit";

describe("WorksheetEdit — Copy from Engagement Flow", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockUseWorksheetById.mockClear();
    mockUseWorksheets.mockClear();
    mockBatchUpsertCells.mockClear();
    mockUpdateWorksheet.mockClear();
    mockCreateWOFromWorksheet.mockClear();
    mockUseWorksheets.mockReturnValue({ data: makeSourceWorksheets(), isLoading: false });
  });

  describe("Copy Button Visibility", () => {
    it("shows Copy button only when !isReadOnly (draft worksheet)", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({ status: "draft" }),
        isLoading: false,
      });

      customRender(<WorksheetEdit />);

      const copyButton = screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ });
      expect(copyButton).toBeInTheDocument();
    });

    it("hides Copy button for approved worksheet", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({ status: "approved" }),
        isLoading: false,
      });

      customRender(<WorksheetEdit />);

      const copyButton = screen.queryByRole("button", { name: /workMatrix.copyFromEngagement/ });
      expect(copyButton).not.toBeInTheDocument();
    });

    it("hides Copy button for archived worksheet", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({ status: "archived" }),
        isLoading: false,
      });

      customRender(<WorksheetEdit />);

      const copyButton = screen.queryByRole("button", { name: /workMatrix.copyFromEngagement/ });
      expect(copyButton).not.toBeInTheDocument();
    });

    it("hides Copy button when worksheet locked by work order", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Approved" },
        }),
        isLoading: false,
      });

      customRender(<WorksheetEdit />);

      const copyButton = screen.queryByRole("button", { name: /workMatrix.copyFromEngagement/ });
      expect(copyButton).not.toBeInTheDocument();
    });
  });

  describe("Dialog Interaction", () => {
    beforeEach(() => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({ status: "draft" }),
        isLoading: false,
      });
    });

    it("opens copy dialog when Copy button clicked", async () => {
      customRender(<WorksheetEdit />);

      const copyButton = screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText(/workMatrix.copyDialogTitle/)).toBeInTheDocument();
      });
    });

    it("closes dialog on cancel", async () => {
      customRender(<WorksheetEdit />);

      fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ }));

      await waitFor(() => {
        expect(screen.getByText(/workMatrix.copyDialogTitle/)).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole("button", { name: /common.cancel/ });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText(/workMatrix.copyDialogTitle/)).not.toBeInTheDocument();
      });
    });
  });

  describe("Cell Merge & State Management", () => {
    beforeEach(() => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({ status: "draft" }),
        isLoading: false,
      });
    });

    it("merges copied cells into localCells map", async () => {
      const { container } = customRender(<WorksheetEdit />);

      fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ }));

      await waitFor(() => {
        expect(screen.getByText(/workMatrix.copyDialogTitle/)).toBeInTheDocument();
      });

      // Simulate selecting a source worksheet and confirming copy
      const sourceWorksheet = screen.getByText(/Source Engagement/);
      fireEvent.click(sourceWorksheet);

      await waitFor(() => {
        const copyConfirmButton = screen.getByRole("button", { name: /workMatrix.copyConfirmButton/ });
        expect(copyConfirmButton).toBeEnabled();
        fireEvent.click(copyConfirmButton);
      });

      // After copy, dialog should close and unsaved indicator should appear
      await waitFor(() => {
        expect(screen.getByText(/common.unsavedChanges/)).toBeInTheDocument();
      });
    });

    it("sets hasUnsavedChanges flag after copy", async () => {
      customRender(<WorksheetEdit />);

      fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ }));

      await waitFor(() => {
        expect(screen.getByText(/workMatrix.copyDialogTitle/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Source Engagement/));

      await waitFor(() => {
        const copyConfirmButton = screen.getByRole("button", { name: /workMatrix.copyConfirmButton/ });
        expect(copyConfirmButton).toBeEnabled();
        fireEvent.click(copyConfirmButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/common.unsavedChanges/)).toBeInTheDocument();
      });
    });

    it("Save button is enabled after copy", async () => {
      customRender(<WorksheetEdit />);

      fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ }));

      await waitFor(() => {
        expect(screen.getByText(/workMatrix.copyDialogTitle/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Source Engagement/));

      await waitFor(() => {
        fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyConfirmButton/ }));
      });

      await waitFor(() => {
        const saveButton = screen.getByRole("button", { name: /common.save/ });
        expect(saveButton).toBeEnabled();
      });
    });
  });

  describe("Save Behavior", () => {
    beforeEach(() => {
      mockBatchUpsertCells.mockResolvedValue({});
    });

    it("saves copied cells to database on Save button click", async () => {
      mockUseWorksheetById.mockImplementation((id: string | undefined) => {
        if (id === "ws-1") {
          return {
            data: makeWorksheet({
              status: "draft",
              cells: [
                {
                  id: "cell-1",
                  worksheet_id: "ws-1",
                  category_id: "cat-1",
                  activity_id: "act-1",
                  budget_hours: 8,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            }),
            isLoading: false,
          };
        }
        if (id === "ws-2") {
          return {
            data: {
              id: "ws-2",
              cells: [
                {
                  id: "cell-2",
                  worksheet_id: "ws-2",
                  category_id: "cat-2",
                  activity_id: "act-2",
                  budget_hours: 12,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            },
            isLoading: false,
          };
        }
        return { data: null, isLoading: false };
      });

      customRender(<WorksheetEdit />);

      fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ }));

      await waitFor(() => {
        fireEvent.click(screen.getByText(/Source Engagement/));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyConfirmButton/ }));
      });

      await waitFor(() => {
        const saveButton = screen.getByRole("button", { name: /common.save/ });
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(mockBatchUpsertCells).toHaveBeenCalled();

        const callArgs = mockBatchUpsertCells.mock.calls[0];
        expect(callArgs).toBeDefined();

        const payload = callArgs[0];
        expect(payload).toBeDefined();
        expect(Array.isArray(payload.cells)).toBe(true);

        const copiedCell = payload.cells.find((c: any) => c.category_id === "cat-2" && c.activity_id === "act-2");
        expect(copiedCell).toBeDefined();
        expect(copiedCell.budget_hours).toBe(12);

        const zeroed = payload.cells.find((c: any) => c.category_id === "cat-1" && c.activity_id === "act-1");
        expect(zeroed).toBeDefined();
        expect(zeroed.budget_hours).toBe(0);
      });
    });
  });

  describe("Copy Source Filtering (0714-154)", () => {
    it("only lists source worksheets from the same service as the current engagement", async () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({ status: "draft" }),
        isLoading: false,
      });
      mockUseWorksheets.mockReturnValue({
        data: makeSourceWorksheets([
          {
            id: "ws-3",
            created_by_staff_id: "staff-123",
            engagement: {
              engagement_code: "ENG-003",
              engagement_name: "Other Service Engagement",
              practica: 3,
              client: { client_legal_name: "Other Client" },
              status: "draft",
            },
          },
        ]),
        isLoading: false,
      });

      customRender(<WorksheetEdit />);

      fireEvent.click(screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ }));

      await waitFor(() => {
        expect(screen.getByText(/Source Engagement/)).toBeInTheDocument();
      });
      expect(screen.queryByText(/Other Service Engagement/)).not.toBeInTheDocument();
    });
  });

  describe("Permission Checks", () => {
    it("Copy button not present when locked by approved work order", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Approved" },
        }),
        isLoading: false,
      });

      customRender(<WorksheetEdit />);

      const copyButton = screen.queryByRole("button", { name: /workMatrix.copyFromEngagement/ });
      expect(copyButton).not.toBeInTheDocument();
    });

    it("Copy button not present when locked by pending work order", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Pending_Approval" },
        }),
        isLoading: false,
      });

      customRender(<WorksheetEdit />);

      const copyButton = screen.queryByRole("button", { name: /workMatrix.copyFromEngagement/ });
      expect(copyButton).not.toBeInTheDocument();
    });
  });
});
