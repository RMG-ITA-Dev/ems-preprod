import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Stable spy ────────────────────────────────────────────────────────────────
const mockRejectAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

// Capture latest props passed to WorkOrderForm
let capturedFormProps: Record<string, any> = {};
vi.mock("@/components/forms/WorkOrderForm", () => ({
  WorkOrderForm: (props: any) => {
    capturedFormProps = props;
    return <div data-testid="work-order-form" />;
  },
}));

// ── Routing ───────────────────────────────────────────────────────────────────
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: "wo-1" }) };
});

// ── Page-leave lock ───────────────────────────────────────────────────────────
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
    allowNextNavigation: vi.fn(),
  }),
}));

// ── Data ──────────────────────────────────────────────────────────────────────
const pendingWorkOrder = {
  wo_id: "wo-1",
  engagement_id: "eng-1",
  currency: "BOB",
  season_mode: "High",
  tax_rate: 0.13,
  adjustment_amount: 0,
  approval_status: "Pending_Approval",
  approved_by: null,
  approved_at: null,
  notes: null,
  budget_lines: [],
  expense_budget: [],
  engagement: {
    engagement_code: "E-001",
    engagement_name: "Auditoria",
    client: { client_legal_name: "Cliente Demo" },
  },
};

const draftWithNote = { ...pendingWorkOrder, approval_status: "Draft", notes: "Falta CEAC" };
const draftNoNote   = { ...pendingWorkOrder, approval_status: "Draft", notes: null };

let mockWorkOrderData: typeof pendingWorkOrder = pendingWorkOrder;

vi.mock("@/hooks/useEmsData", () => ({
  useWorkOrderById: () => ({ data: mockWorkOrderData, isLoading: false }),
  useSetting: () => "0.13",
  useCategories: () => ({ data: [] }),
  useExpenseTypes: () => ({ data: [] }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({
    staffRecord: { staff_id: "staff-1", category: { can_approve_wo: true } },
  }),
}));

vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetByEngagementId: () => ({ data: undefined }),
}));

vi.mock("@/hooks/useWorksheetMutations", () => ({
  useResyncWorksheetToWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateWorkOrder:     () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBudgetLine:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudgetLine:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBudgetLine:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitWorkOrder:     () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveWorkOrder:    () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectWorkOrder:     () => ({ mutateAsync: mockRejectAsync, isPending: false }),
  useUnsubmitWorkOrder:   () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

vi.mock("sonner", async () => {
  const actual = await vi.importActual("sonner");
  return { ...actual, toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } };
});

// ── Import under test ─────────────────────────────────────────────────────────
import WorkOrderEdit from "../WorkOrderEdit";

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderEdit />
    </QueryClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("WorkOrderEdit — Rejection Note (feat/0527-126)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFormProps = {};
    mockWorkOrderData = pendingWorkOrder;
  });

  it("RN1: dialog opens when onReject is called", async () => {
    renderPage();

    await act(async () => { capturedFormProps.onReject(); });

    expect(screen.getByText("workOrders.rejectDialogTitle")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("workOrders.rejectNotePlaceholder")).toBeInTheDocument();
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
    expect(screen.getByText("workOrders.rejectDialogConfirm")).toBeInTheDocument();
  });

  it("RN2: cancel closes dialog without calling mutateAsync", async () => {
    renderPage();

    await act(async () => { capturedFormProps.onReject(); });

    const cancelBtn = screen.getByText("common.cancel");
    await act(async () => { fireEvent.click(cancelBtn); });

    expect(mockRejectAsync).not.toHaveBeenCalled();
  });

  it("RN3: confirm with note calls mutateAsync with { woId, notes }", async () => {
    renderPage();

    await act(async () => { capturedFormProps.onReject(); });

    fireEvent.change(
      screen.getByPlaceholderText("workOrders.rejectNotePlaceholder"),
      { target: { value: "Falta CEAC" } }
    );

    await act(async () => {
      fireEvent.click(screen.getByText("workOrders.rejectDialogConfirm"));
    });

    await waitFor(() => {
      expect(mockRejectAsync).toHaveBeenCalledWith({ woId: "wo-1", notes: "Falta CEAC" });
    });
  });

  it("RN4: Draft WO with existing note passes rejectionNote to WorkOrderForm", () => {
    mockWorkOrderData = draftWithNote;
    renderPage();
    expect(capturedFormProps.rejectionNote).toBe("Falta CEAC");
  });

  it("RN5: Draft WO with null note passes null rejectionNote to WorkOrderForm", () => {
    mockWorkOrderData = draftNoNote;
    renderPage();
    expect(capturedFormProps.rejectionNote).toBeNull();
  });
});
