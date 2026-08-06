import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render as customRender } from "@/test/utils";
import { screen, fireEvent } from "@testing-library/react";
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
  const actual = await importOriginal() as Record<string, unknown>;
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
    data: [{ category_id: "cat-1", category_name: "Category 1", service_id: "svc-1", display_order: 1 }],
    isLoading: false,
  }),
  useActivityCodes: () => ({
    data: [{ activity_id: "act-1", activity_code: "AUD-A1", description: "Activity 1", is_active: true, service: { code: 1 } }],
    isLoading: false,
  }),
  useAllActivityCodes: () => ({
    data: [{ activity_id: "act-1", activity_code: "AUD-A1", description: "Activity 1", is_active: true, service_id: "svc-1" }],
    isLoading: false,
  }),
  useSetting: () => "0.13",
  useServices: () => ({
    data: [{ service_id: "svc-1", name: "Auditoría", code: 1, is_active: true, allows_rates_activities: true, created_at: "" }],
    isLoading: false,
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
// WorksheetEdit usa useCurrentStaff para resolver "soy Socio/Gerente de este
// encargo". useCurrentStaff llama a useAuth por dentro, asi que sin mock el render
// falla con "useAuth must be used within an AuthProvider".
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1" }, isLoading: false }),
}));


vi.mock("@/components/worksheet/WorksheetGrid", () => ({
  WorksheetGrid: ({
    readOnly,
    onChange,
  }: {
    readOnly?: boolean;
    onChange?: (catId: string, actId: string, hours: number) => void;
  }) => (
    <div data-testid="worksheet-grid" data-readonly={String(readOnly)}>
      {onChange && (
        <button data-testid="grid-cell-trigger" onClick={() => onChange("cat-1", "act-1", 8)}>
          simulate change
        </button>
      )}
    </div>
  ),
}));

vi.mock("@/components/worksheet/CopyFromEngagementDialog", () => ({
  CopyFromEngagementDialog: ({ open }: { open: boolean }) => (
    open ? <div data-testid="copy-dialog">Copy Dialog</div> : null
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
    cells: [],
    ...overrides,
  };
}

import WorksheetEdit from "../WorksheetEdit";

describe("WorksheetEdit — Work Order Lock Behavior", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe("Draft WO — no lock", () => {
    beforeEach(() => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Draft" },
        }),
        isLoading: false,
      });
    });

    it("does not render the lock banner", () => {
      customRender(<WorksheetEdit />);
      expect(screen.queryByText("workMatrix.lockedByWorkOrderTitle")).not.toBeInTheDocument();
    });

    it("renders WorksheetGrid with readOnly=false", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getByTestId("worksheet-grid")).toHaveAttribute("data-readonly", "false");
    });

    it("Save button is enabled after a cell change", () => {
      customRender(<WorksheetEdit />);
      fireEvent.click(screen.getByTestId("grid-cell-trigger"));
      expect(screen.getByRole("button", { name: /common\.save/ })).toBeEnabled();
    });
  });

  describe("No linked WO", () => {
    beforeEach(() => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({ wo_id: null, work_order: null }),
        isLoading: false,
      });
    });

    it("does not render the lock banner", () => {
      customRender(<WorksheetEdit />);
      expect(screen.queryByText("workMatrix.lockedByWorkOrderTitle")).not.toBeInTheDocument();
    });

    it("shows common.no in the linked WO cell", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getByText("common.no")).toBeInTheDocument();
    });

    it("Save button is enabled after a cell change", () => {
      customRender(<WorksheetEdit />);
      fireEvent.click(screen.getByTestId("grid-cell-trigger"));
      expect(screen.getByRole("button", { name: /common\.save/ })).toBeEnabled();
    });
  });

  describe("Pending WO — banner", () => {
    beforeEach(() => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Pending_Approval" },
        }),
        isLoading: false,
      });
    });

    it("renders the lock banner", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getByText("workMatrix.lockedByWorkOrderTitle")).toBeInTheDocument();
    });

    it("AlertTitle contains workOrders.status.pending badge", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getAllByText("workOrders.status.pending").length).toBeGreaterThanOrEqual(1);
    });

    it("renders lockedByWorkOrderPending message", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getByText("workMatrix.lockedByWorkOrderPending")).toBeInTheDocument();
    });

    it("Save button is disabled", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getByRole("button", { name: /common\.save/ })).toBeDisabled();
    });

    it("lockedByWorkOrderPending copy references goToWorkOrder and withdraw text", () => {
      const pendingMessage = enJson.workMatrix.lockedByWorkOrderPending;
      expect(pendingMessage).toMatch(/Go to Work Order/i);
      expect(pendingMessage).toMatch(/Withdraw from Approval/i);
    });
  });

  describe("Pending WO — grid", () => {
    it("WorksheetGrid receives readOnly=true", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Pending_Approval" },
        }),
        isLoading: false,
      });
      customRender(<WorksheetEdit />);
      expect(screen.getByTestId("worksheet-grid")).toHaveAttribute("data-readonly", "true");
    });
  });

  describe("Pending WO — navigation", () => {
    it("clicking goToWorkOrder navigates to the work order", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Pending_Approval" },
        }),
        isLoading: false,
      });
      customRender(<WorksheetEdit />);
      const buttons = screen.getAllByText("workMatrix.goToWorkOrder");
      fireEvent.click(buttons[0]);
      expect(mockNavigate).toHaveBeenCalledWith("/work-orders/wo-1");
    });
  });

  describe("Approved WO — banner", () => {
    beforeEach(() => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Approved" },
        }),
        isLoading: false,
      });
    });

    it("renders the lock banner", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getByText("workMatrix.lockedByWorkOrderTitle")).toBeInTheDocument();
    });

    it("AlertTitle contains workOrders.status.approved badge", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getAllByText("workOrders.status.approved").length).toBeGreaterThanOrEqual(1);
    });

    it("renders lockedByWorkOrderApproved message", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getByText("workMatrix.lockedByWorkOrderApproved")).toBeInTheDocument();
    });

    it("Save button is disabled", () => {
      customRender(<WorksheetEdit />);
      expect(screen.getByRole("button", { name: /common\.save/ })).toBeDisabled();
    });
  });

  describe("Approved WO — grid", () => {
    it("WorksheetGrid receives readOnly=true", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Approved" },
        }),
        isLoading: false,
      });
      customRender(<WorksheetEdit />);
      expect(screen.getByTestId("worksheet-grid")).toHaveAttribute("data-readonly", "true");
    });
  });

  describe("WO status in engagement info card", () => {
    it("shows workOrders.status.pending when WO is Pending_Approval", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Pending_Approval" },
        }),
        isLoading: false,
      });
      customRender(<WorksheetEdit />);
      const woLink = screen.getByRole("button", { name: /common\.yes/ });
      expect(woLink).toHaveTextContent("workOrders.status.pending");
    });

    it("shows workOrders.status.approved when WO is Approved", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Approved" },
        }),
        isLoading: false,
      });
      customRender(<WorksheetEdit />);
      const woLink = screen.getByRole("button", { name: /common\.yes/ });
      expect(woLink).toHaveTextContent("workOrders.status.approved");
    });

    it("shows workOrders.status.draft when WO is Draft", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({
          wo_id: "wo-1",
          work_order: { wo_id: "wo-1", approval_status: "Draft" },
        }),
        isLoading: false,
      });
      customRender(<WorksheetEdit />);
      const woLink = screen.getByRole("button", { name: /common\.yes/ });
      expect(woLink).toHaveTextContent("workOrders.status.draft");
    });
  });

  describe("Copy Button Visibility", () => {
    it("Copy button is hidden when worksheet locked by pending work order", () => {
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

    it("Copy button is hidden when worksheet locked by approved work order", () => {
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

    it("Copy button is visible for draft worksheet with no work order", () => {
      mockUseWorksheetById.mockReturnValue({
        data: makeWorksheet({ wo_id: null, work_order: null }),
        isLoading: false,
      });
      customRender(<WorksheetEdit />);
      const copyButton = screen.getByRole("button", { name: /workMatrix.copyFromEngagement/ });
      expect(copyButton).toBeInTheDocument();
    });
  });
});
