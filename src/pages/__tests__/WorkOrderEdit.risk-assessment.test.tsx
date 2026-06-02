import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Stable spy for approve mutation ───────────────────────────────────────────
const mockApproveAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

// Capture the latest props WorkOrderEdit passes to WorkOrderForm.
// The mock is hoisted so it runs before any import of WorkOrderEdit.
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

// ── Data hooks ────────────────────────────────────────────────────────────────
const mockWorkOrder = {
  wo_id: "wo-1",
  engagement_id: "eng-1",
  currency: "BOB",
  season_mode: "High",
  tax_rate: 0.13,
  adjustment_amount: 0,
  approval_status: "Pending_Approval",
  approved_by: null,
  approved_at: null,
  ceac_completed_at: "2026-05-01",
  ceac_notes: "CEAC ok",
  san_completed_at: "2026-04-15",
  san_notes: null,
  budget_lines: [],
  expense_budget: [],
  engagement: {
    engagement_code: "E-001",
    engagement_name: "Auditoria",
    client: { client_legal_name: "Cliente Demo" },
  },
};

vi.mock("@/hooks/useEmsData", () => ({
  useWorkOrderById: () => ({ data: mockWorkOrder, isLoading: false }),
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
  useUpdateWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveWorkOrder: () => ({ mutateAsync: mockApproveAsync, isPending: false }),
  useRejectWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnsubmitWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
import { toast } from "sonner";

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

describe("WorkOrderEdit — Risk Assessment (feat/0306-78)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFormProps = {};
  });

  it("WE1: hydrates CEAC/SAN state from workOrder and passes correct values to WorkOrderForm", () => {
    renderPage();
    expect(capturedFormProps.ceacCompletedAt).toBe("2026-05-01");
    expect(capturedFormProps.ceacNotes).toBe("CEAC ok");
    expect(capturedFormProps.sanCompletedAt).toBe("2026-04-15");
    expect(capturedFormProps.sanNotes).toBeNull();
  });

  it("WE2: handleApprove calls mutateAsync without risk fields (validation moved to submit time)", async () => {
    renderPage();

    await act(async () => {
      await capturedFormProps.onApprove();
    });

    expect(toast.error).not.toHaveBeenCalled();
    expect(mockApproveAsync).toHaveBeenCalledWith({
      woId: "wo-1",
      staffId: "staff-1",
    });
  });

  it("WE3: handleEmergencyApprove calls mutateAsync with only woId and staffId", async () => {
    renderPage();

    await act(async () => {
      await capturedFormProps.onEmergencyApprove();
    });

    expect(mockApproveAsync).toHaveBeenCalledWith({
      woId: "wo-1",
      staffId: "staff-1",
    });
  });

  it("WE4: isDirty becomes true after onRiskAssessmentChange modifies CEAC date", async () => {
    renderPage();
    // Initially isDirty should be false (loaded values equal original values)
    expect(capturedFormProps.isDirty).toBe(false);

    await act(async () => {
      capturedFormProps.onRiskAssessmentChange("ceacCompletedAt", "2026-06-01");
    });

    // After re-render, capturedFormProps reflects updated props
    expect(capturedFormProps.isDirty).toBe(true);
  });
});
