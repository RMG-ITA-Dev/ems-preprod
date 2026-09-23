import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Stable spies ──────────────────────────────────────────────────────────────
const mockUpdateAsync = vi.hoisted(() => vi.fn());
const mockSaveStaffingAsync = vi.hoisted(() => vi.fn());
const mockSubmitAsync = vi.hoisted(() => vi.fn());
const mockUseWorkOrderStaffingRequirements = vi.hoisted(() => vi.fn());
const mockUseCategories = vi.hoisted(() => vi.fn());
const mockUseServices = vi.hoisted(() => vi.fn());
const mockUseActiveSkills = vi.hoisted(() => vi.fn());
const mockUsePageLeaveLock = vi.hoisted(() =>
  vi.fn(() => ({
    blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
    allowNextNavigation: vi.fn(),
  })),
);

// Capture the latest props WorkOrderEdit passes to WorkOrderForm.
let capturedFormProps: Record<string, any> = {};
vi.mock("@/components/forms/WorkOrderForm", () => ({
  WorkOrderForm: (props: any) => {
    capturedFormProps = props;
    return <div data-testid="work-order-form" />;
  },
  // 0819-181: stubs — WorkOrderEdit renders these directly in the merged "Encargo"
  // card; this suite only asserts on props passed to WorkOrderForm.
  WorkOrderStatusBadge: () => null,
  WorkOrderTrackStatus: () => null,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ id: "wo-1" }),
    // dash_socio: WorkOrderEdit.tsx ahora lee ?tab=payment vía useSearchParams (deep-link
    // desde el tablero de Socio, Bloque C) -- sin este mock, useSearchParams revienta con
    // "useLocation() may be used only in the context of a <Router>" porque este archivo
    // no envuelve WorkOrderEdit en un MemoryRouter.
    useSearchParams: () => [new URLSearchParams()],
  };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: (...args: unknown[]) => mockUsePageLeaveLock(...args),
}));

const SERVICE_AUDIT = {
  practica_id: "svc-audit",
  code: 100,
  name: "Audit",
  allows_rates_activities: true,
  is_active: true,
  created_at: "",
};
const CAT_AUDIT = { category_id: "cat-audit", category_name: "Auditor", practica_id: "svc-audit", display_order: 1 };
const CAT_TAX = { category_id: "cat-tax", category_name: "Tax", practica_id: "svc-tax", display_order: 1 };
const SKILL_IFRS = { skill_id: "skill-1", name: "IFRS", category: "Technical" };

const mockWorkOrder = {
  wo_id: "wo-1",
  engagement_id: "eng-1",
  currency: "BOB",
  season_mode: "High",
  tax_rate: 0.13,
  adjustment_amount: 0,
  approval_status: "Draft",
  approved_by: null,
  approved_at: null,
  budget_lines: [],
  expense_budget: [],
  engagement: {
    practica: 100,
    engagement_code: "E-001",
    engagement_name: "Auditoria",
    client: { client_legal_name: "Cliente Demo" },
  },
};

vi.mock("@/hooks/useEmsData", () => ({
  useWorkOrderById: () => ({ data: mockWorkOrder, isLoading: false }),
  useSetting: () => "0.13",
  useCategories: () => mockUseCategories(),
  useExpenseTypes: () => ({ data: [] }),
  useServices: () => mockUseServices(),
  useActiveSkills: () => mockUseActiveSkills(),
  useWorkOrderStaffingRequirements: (...args: unknown[]) => mockUseWorkOrderStaffingRequirements(...args),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1", category: { can_approve_wo: true } } }),
}));

// Merge con feat/roles-permisos (2026-08): WorkOrderEdit ya no usa useUserRole
// para el gate de escritura — usa useAuthorization (can/scope/roleKey), que a
// su vez llama useAuth() internamente. Sin este mock, useAuth() revienta por
// faltar el AuthProvider. admin: true equivalente a roleKey admin + can() true.
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ roleKey: "admin", can: () => true, scope: () => "firm" }),
}));

vi.mock("@/hooks/useWorksheetData", () => ({ useWorksheetByEngagementId: () => ({ data: undefined }) }));

vi.mock("@/hooks/useWorksheetMutations", () => ({
  useResyncWorksheetToWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateWorkOrder: () => ({ mutateAsync: mockUpdateAsync, isPending: false }),
  useCreateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSubmitWorkOrder: () => ({ mutateAsync: mockSubmitAsync, isPending: false }),
  useApproveWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveRisk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveEmergencyReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useApproveEmergencyPartner: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectRisk: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertSocioApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevertRiskApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompleteRiskAssessment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnsubmitWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpsertPaymentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBatchUpsertInstallments: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePaymentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveWorkOrderStaffing: () => ({ mutateAsync: mockSaveStaffingAsync, isPending: false }),
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
const EMPTY_ROWS: unknown[] = [];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <WorkOrderEdit />
    </QueryClientProvider>
  );
  const utils = render(tree);
  return { ...utils, rerenderPage: () => utils.rerender(tree) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkOrderEdit — Staffing Requirements (Fase 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedFormProps = {};
    mockUpdateAsync.mockResolvedValue({});
    mockSaveStaffingAsync.mockResolvedValue([]);
    mockSubmitAsync.mockResolvedValue({});
    mockUseCategories.mockReturnValue({ data: [CAT_AUDIT, CAT_TAX], isLoading: false, isError: false });
    mockUseServices.mockReturnValue({ data: [SERVICE_AUDIT], isLoading: false, isError: false });
    mockUseActiveSkills.mockReturnValue({ data: [SKILL_IFRS], isLoading: false, isError: false });
    mockUseWorkOrderStaffingRequirements.mockReturnValue({ data: EMPTY_ROWS, isLoading: false, isError: false });
    mockUsePageLeaveLock.mockReturnValue({
      blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
      allowNextNavigation: vi.fn(),
    });
  });

  it("WES1: hydrates persisted rows without dirty, scoping categories to the engagement's service", () => {
    mockUseWorkOrderStaffingRequirements.mockReturnValue({
      data: [{ id: "req-1", category_id: "cat-audit", staff_count: 3, requirement_skills: [] }],
      isLoading: false,
      isError: false,
    });
    renderPage();
    expect(capturedFormProps.isDirty).toBe(false);
    expect(capturedFormProps.staffingRequirements).toEqual([
      expect.objectContaining({ persistedId: "req-1", categoryId: "cat-audit", staffCount: 3 }),
    ]);
    // Tax category (different service) is excluded from the scoped options.
    expect(capturedFormProps.staffingCategories).toEqual([CAT_AUDIT]);
    expect(capturedFormProps.staffingServiceResolved).toBe(true);
  });

  it("WES2: editing staffing marks isDirty/hasNonRiskDirty true and is included in the leave-lock's isDirty", () => {
    renderPage();
    expect(capturedFormProps.isDirty).toBe(false);
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
      ]);
    });
    expect(capturedFormProps.isDirty).toBe(true);
    expect(capturedFormProps.hasNonRiskDirty).toBe(true);
    expect(mockUsePageLeaveLock).toHaveBeenLastCalledWith(
      expect.objectContaining({ isDirty: true }),
    );
  });

  it("WES3: a refetch mid-edit does not clobber the user's in-progress staffing changes", () => {
    const persisted = [{ id: "req-1", category_id: "cat-audit", staff_count: 3, requirement_skills: [] }];
    mockUseWorkOrderStaffingRequirements.mockReturnValue({ data: persisted, isLoading: false, isError: false });
    const { rerenderPage } = renderPage();

    const edited = [
      { clientKey: "req-1", persistedId: "req-1", categoryId: "cat-audit", staffCount: 9, skills: [] },
    ];
    act(() => {
      capturedFormProps.onStaffingRequirementsChange(edited);
    });
    expect(capturedFormProps.staffingRequirements[0].staffCount).toBe(9);

    // Simulate an unrelated refetch (e.g. a non-staffing save invalidated `work_order`) that
    // re-delivers the SAME persisted staffing rows as a new array reference.
    mockUseWorkOrderStaffingRequirements.mockReturnValue({
      data: [{ id: "req-1", category_id: "cat-audit", staff_count: 3, requirement_skills: [] }],
      isLoading: false,
      isError: false,
    });
    act(() => {
      rerenderPage();
    });

    expect(capturedFormProps.staffingRequirements[0].staffCount).toBe(9);
    expect(capturedFormProps.isDirty).toBe(true);
  });

  it("WES4: an invalid staffing state (duplicate category) blocks every mutation and shows the translated error", async () => {
    renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "r1", persistedId: null, categoryId: "cat-audit", staffCount: 3, skills: [] },
        { clientKey: "r2", persistedId: null, categoryId: "cat-audit", staffCount: 5, skills: [] },
      ]);
    });

    await act(async () => {
      await capturedFormProps.onSubmit();
    });

    expect(toast.error).toHaveBeenCalledWith("workOrders.staffingRequirements.errors.categoryDuplicate");
    expect(mockUpdateAsync).not.toHaveBeenCalled();
    expect(mockSaveStaffingAsync).not.toHaveBeenCalled();
    expect(capturedFormProps.staffingFocusSignal).toBe(1);
  });

  it("WES4b: a schema/read error blocks staffing save before every mutation", async () => {
    mockUseWorkOrderStaffingRequirements.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
      ]);
    });

    await act(async () => {
      await capturedFormProps.onSubmit();
    });

    expect(toast.error).toHaveBeenCalledWith("workOrders.staffingRequirements.errorLoading");
    expect(mockUpdateAsync).not.toHaveBeenCalled();
    expect(mockSaveStaffingAsync).not.toHaveBeenCalled();
  });

  it("WES4c: category, service or skill catalog loading/error is surfaced as a staffing gate", () => {
    mockUseCategories.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage();
    expect(capturedFormProps.staffingLoading).toBe(true);

    mockUseCategories.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    const { rerenderPage } = renderPage();
    act(() => rerenderPage());
    expect(capturedFormProps.staffingError).toBe(true);
  });

  it("WES5: the main Work Order mutation runs before the staffing RPC", async () => {
    const callOrder: string[] = [];
    mockUpdateAsync.mockImplementation(async () => {
      callOrder.push("update");
      return {};
    });
    mockSaveStaffingAsync.mockImplementation(async () => {
      callOrder.push("staffing");
      return [];
    });
    renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
      ]);
    });

    await act(async () => {
      await capturedFormProps.onSubmit();
    });

    expect(callOrder).toEqual(["update", "staffing"]);
  });

  it("WES6: staffing untouched (not dirty) never calls the staffing RPC, even though the main save still runs", async () => {
    mockUseWorkOrderStaffingRequirements.mockReturnValue({
      data: [{ id: "req-1", category_id: "cat-audit", staff_count: 3, requirement_skills: [] }],
      isLoading: false,
      isError: false,
    });
    renderPage();

    await act(async () => {
      await capturedFormProps.onSubmit();
    });

    expect(mockUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockSaveStaffingAsync).not.toHaveBeenCalled();
  });

  it("WES7: a successful save clears staffing dirty once the invalidated query re-hydrates the fresh state", async () => {
    const { rerenderPage } = renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
      ]);
    });
    expect(capturedFormProps.isDirty).toBe(true);

    const persisted = [{ id: "req-1", category_id: "cat-audit", staff_count: 2, requirement_skills: [] }];
    mockSaveStaffingAsync.mockImplementation(async () => {
      // Mirrors the real flow: onSuccess invalidates the query, which refetches and lands here.
      mockUseWorkOrderStaffingRequirements.mockReturnValue({ data: persisted, isLoading: false, isError: false });
      return persisted;
    });

    await act(async () => {
      await capturedFormProps.onSubmit();
    });
    act(() => {
      rerenderPage();
    });

    expect(capturedFormProps.isDirty).toBe(false);
    expect(toast.success).toHaveBeenCalled();
  });

  it("WES7b: a successful save clears dirty even if the refresh does not provide new rows", async () => {
    renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
      ]);
    });

    await act(async () => {
      await capturedFormProps.onSubmit();
    });

    expect(capturedFormProps.isDirty).toBe(false);
  });

  it("WES8: a failed staffing save keeps staffing dirty, keeps the form open, and never reports full success", async () => {
    renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
      ]);
    });
    mockSaveStaffingAsync.mockRejectedValueOnce(new Error("WOS_WO_LOCKED"));

    await act(async () => {
      await capturedFormProps.onSubmit();
    });

    expect(mockUpdateAsync).toHaveBeenCalledTimes(1);
    expect(mockSaveStaffingAsync).toHaveBeenCalledTimes(1);
    expect(capturedFormProps.isDirty).toBe(true);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("WES9: retrying after a failed staffing save resends the identical edited state (no client-side dedup needed — the RPC is transactional)", async () => {
    renderPage();
    const edited = [
      { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
    ];
    act(() => {
      capturedFormProps.onStaffingRequirementsChange(edited);
    });
    mockSaveStaffingAsync.mockRejectedValueOnce(new Error("boom"));

    await act(async () => {
      await capturedFormProps.onSubmit();
    });
    await act(async () => {
      await capturedFormProps.onSubmit();
    });

    expect(mockSaveStaffingAsync).toHaveBeenCalledTimes(2);
    const [firstCall] = mockSaveStaffingAsync.mock.calls[0] as [{ requirements: unknown }];
    const [secondCall] = mockSaveStaffingAsync.mock.calls[1] as [{ requirements: unknown }];
    expect(firstCall.requirements).toEqual(secondCall.requirements);
  });

  it("WES10: 'Enviar para Aprobación' with dirty staffing saves it first (single click), then submits", async () => {
    const callOrder: string[] = [];
    mockSaveStaffingAsync.mockImplementation(async () => {
      callOrder.push("staffing-save");
      return [];
    });
    mockSubmitAsync.mockImplementation(async () => {
      callOrder.push("submit");
      return {};
    });
    renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
      ]);
    });
    expect(capturedFormProps.isDirty).toBe(true);

    await act(async () => {
      await capturedFormProps.onSubmitForApproval();
    });

    // Staffing was persisted (no separate "Guardar" click needed) BEFORE the submit call.
    expect(mockSaveStaffingAsync).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["staffing-save", "submit"]);
    expect(mockSubmitAsync).toHaveBeenCalledTimes(1);
  });

  it("WES11: a failed auto-save during 'Enviar para Aprobación' aborts the submission entirely — nothing is sent", async () => {
    renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
      ]);
    });
    mockSaveStaffingAsync.mockRejectedValueOnce(new Error("WOS_WO_LOCKED"));

    await act(async () => {
      await capturedFormProps.onSubmitForApproval();
    });

    expect(mockSaveStaffingAsync).toHaveBeenCalledTimes(1);
    expect(mockSubmitAsync).not.toHaveBeenCalled();
    expect(capturedFormProps.isDirty).toBe(true);
  });

  it("WES11b: a submit failure after persistence leaves the saved Draft available for retry", async () => {
    const callOrder: string[] = [];
    mockSaveStaffingAsync.mockImplementation(async () => {
      callOrder.push("staffing-save");
      return [];
    });
    mockSubmitAsync.mockImplementation(async () => {
      callOrder.push("submit");
      throw new Error("submit failed");
    });
    renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "new-1", persistedId: null, categoryId: "cat-audit", staffCount: 2, skills: [] },
      ]);
    });

    await act(async () => {
      await expect(capturedFormProps.onSubmitForApproval()).rejects.toThrow("submit failed");
    });

    expect(callOrder).toEqual(["staffing-save", "submit"]);
    expect(mockSaveStaffingAsync).toHaveBeenCalledTimes(1);
    expect(mockSubmitAsync).toHaveBeenCalledTimes(1);
    expect(capturedFormProps.isDirty).toBe(false);
  });

  it("WES12: submitting with invalid dirty staffing (duplicate category) blocks the submit too, without ever calling the staffing RPC", async () => {
    renderPage();
    act(() => {
      capturedFormProps.onStaffingRequirementsChange([
        { clientKey: "r1", persistedId: null, categoryId: "cat-audit", staffCount: 3, skills: [] },
        { clientKey: "r2", persistedId: null, categoryId: "cat-audit", staffCount: 5, skills: [] },
      ]);
    });

    await act(async () => {
      await capturedFormProps.onSubmitForApproval();
    });

    expect(toast.error).toHaveBeenCalledWith("workOrders.staffingRequirements.errors.categoryDuplicate");
    expect(mockSaveStaffingAsync).not.toHaveBeenCalled();
    expect(mockSubmitAsync).not.toHaveBeenCalled();
  });

  it("WES13: a risk-only approval submission skips non-risk persistence", async () => {
    renderPage();
    act(() => {
      capturedFormProps.onRiskAssessmentChange("riskLevel", "Bajo");
    });

    await act(async () => {
      await capturedFormProps.onSubmitForApproval();
    });

    expect(mockUpdateAsync).not.toHaveBeenCalled();
  });
});
