import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [] }),
  useExpenseTypes: () => ({ data: [] }),
  useSetting: () => null,
}));

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "es" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

// Radix Select requires PointerEvent APIs not available in jsdom — replace with
// native elements so JSDOM can interact without polyfills.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectLabel: () => null,
  SelectScrollUpButton: () => null,
  SelectScrollDownButton: () => null,
  SelectSeparator: () => null,
}));

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  // Radix AlertDialog focus management uses these in some browsers.
  (Element.prototype as any).scrollIntoView = vi.fn();
});

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import { WorkOrderForm } from "../WorkOrderForm";

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeQC = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const baseProps = {
  currency: "BOB" as const,
  seasonMode: "High" as const,
  approvalStatus: "Draft" as const,
  adjustmentAmount: 0,
  taxRate: 0.13,
  budgetLines: [],
  expenseBudget: [],
  isNew: false,
  isDirty: false,
  onCurrencyChange: vi.fn(),
  onSeasonChange: vi.fn(),
  onAdjustmentChange: vi.fn(),
  onBudgetLinesChange: vi.fn(),
  onExpenseBudgetChange: vi.fn(),
  onSubmit: vi.fn(),
  isLocked: false,
  canApprove: false,
  isSubmitting: false,
};

type FormOverrides = Partial<
  typeof baseProps & {
    approvalStatus: "Draft" | "Pending_Approval" | "Approved" | "Rejected";
    approvedAt?: string | null;
    ceacCompletedAt?: string | null;
    ceacNotes?: string | null;
    sanCompletedAt?: string | null;
    sanNotes?: string | null;
    ceacNumber?: string | null;
    sanApprovalId?: string | null;
    riskLevel?: string | null;
    riskStatus?: string | null;
    emergencyDeadlineAt?: string | null;
    emergencyReviewAt?: string | null;
    emergencyPartnerAt?: string | null;
    hasNonRiskDirty?: boolean;
    onRiskAssessmentChange?: (field: string, value: string | null) => void;
    onApprove?: () => void;
    onReject?: () => void;
    onSubmitForApproval?: (emergencyJustification?: string) => void;
    canApproveRisk?: boolean;
    onApproveRisk?: () => void;
    onRejectRisk?: (notes: string | null) => void;
    onApproveEmergencyReview?: () => void;
    onApproveEmergencyPartner?: () => void;
    onCompleteRisk?: () => void;
    riskNote?: string | null;
    canRevert?: boolean;
    onRevertSocio?: () => void;
    onRevertRisk?: () => void;
  }
>;

function renderForm(overrides: FormOverrides = {}) {
  const props = { ...baseProps, ...overrides } as Parameters<typeof WorkOrderForm>[0];
  const { container } = render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderForm {...props} />
    </QueryClientProvider>
  );
  return container;
}

const fullRisk = {
  ceacCompletedAt: "2026-05-01",
  ceacNumber: "1234567890",
  sanCompletedAt: "2026-04-15",
  sanApprovalId: "12345-67890",
  riskLevel: "Bajo",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkOrderForm — Risk dual-track + emergency (feat/0306-78)", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Socio track ──────────────────────────────────────────────────────────────
  it("WF1: Socio Approve button is enabled even when risk data is missing", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: true,
      onApprove: vi.fn(),
    });
    const btn = screen.getByText("workOrders.approve").closest("button");
    expect(btn).not.toBeDisabled();
  });

  it("WF2: Socio Approve button is enabled when risk data is present too", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: true,
      onApprove: vi.fn(),
      ...fullRisk,
    });
    const btn = screen.getByText("workOrders.approve").closest("button");
    expect(btn).not.toBeDisabled();
  });

  // ── Risk section visibility ────────────────────────────────────────────────────
  it("WF3: Risk section is hidden for a pure Socio approver (no canApproveRisk, no data)", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: true,
      canApproveRisk: false,
    });
    expect(screen.queryByText("workOrders.riskAssessment")).not.toBeInTheDocument();
  });

  it("WF4: Risk section is visible read-only for the Riesgos approver in Pending", () => {
    const container = renderForm({
      approvalStatus: "Pending_Approval",
      canApproveRisk: true,
      ...fullRisk,
    });
    // Section is rendered for the risk approver...
    expect(screen.getByText("workOrders.riskAssessment")).toBeInTheDocument();
    // ...but read-only: dates render as text, not editable date inputs.
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs.length).toBe(0);
  });

  it("WF5: Risk fields are editable by the creator/Manager in Draft", () => {
    const handler = vi.fn();
    const container = renderForm({
      approvalStatus: "Draft",
      onRiskAssessmentChange: handler,
    });
    expect(screen.getByText("workOrders.riskAssessment")).toBeInTheDocument();
    const [ceacInput] = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(ceacInput.readOnly).toBe(false);
    fireEvent.change(ceacInput, { target: { value: "2026-05-01" } });
    expect(handler).toHaveBeenCalledWith("ceacCompletedAt", "2026-05-01");
  });

  it("WF6: Risk section visible read-only when Approved and has risk data", () => {
    const container = renderForm({
      approvalStatus: "Approved",
      ceacCompletedAt: "2026-05-01",
      sanCompletedAt: "2026-04-15",
    });
    expect(screen.getByText("workOrders.riskAssessment")).toBeInTheDocument();
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    dateInputs.forEach((input) => expect(input.readOnly).toBe(true));
  });

  it("WF7: Risk card absent for Approved OT with no risk data and not emergency", () => {
    renderForm({ approvalStatus: "Approved" });
    expect(screen.queryByText("workOrders.riskAssessment")).not.toBeInTheDocument();
  });

  // ── Risk action buttons ────────────────────────────────────────────────────────
  it("WF8: Riesgos approver with complete data sees single 'Aprobar Riesgo', no emergency steps", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApproveRisk: true,
      onApproveRisk: vi.fn(),
      onApproveEmergencyReview: vi.fn(),
      onApproveEmergencyPartner: vi.fn(),
      onRejectRisk: vi.fn(),
      ...fullRisk,
    });
    expect(screen.getByText("workOrders.approveRisk")).toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRiskAssistant")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRiskPartner")).not.toBeInTheDocument();
    expect(screen.getByText("workOrders.rejectRisk")).toBeInTheDocument();
  });

  it("WF9: emergency step 1 — empty risk shows 'Aprobar (Riesgo)', not normal/partner", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApproveRisk: true,
      onApproveRisk: vi.fn(),
      onApproveEmergencyReview: vi.fn(),
      onApproveEmergencyPartner: vi.fn(),
      onRejectRisk: vi.fn(),
      // no risk fields, no sign-offs yet
    });
    expect(screen.getByText("workOrders.approveRiskAssistant")).toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRiskPartner")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRisk")).not.toBeInTheDocument();
  });

  it("WF9d: Pending + partial risk data → no approval or rejection action (action box hidden when hasRiskAction=false)", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApproveRisk: true,
      onApproveRisk: vi.fn(),
      onApproveEmergencyReview: vi.fn(),
      onApproveEmergencyPartner: vi.fn(),
      onRejectRisk: vi.fn(),
      ceacCompletedAt: "2026-05-01", // one field filled → partial → neither normal nor emergency
    });
    // With partial data: riskApprovalReady=false AND riskAllEmpty=false → hasRiskAction=false.
    // The entire action box is gated on showRiskActions && hasRiskAction, so no buttons appear.
    expect(screen.queryByText("workOrders.approveRisk")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRiskAssistant")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRiskPartner")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.rejectRisk")).not.toBeInTheDocument();
  });

  it("WF9b: emergency step 2 — after the first sign-off shows 'Aprobar (Socio de Riesgos)'", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApproveRisk: true,
      onApproveEmergencyReview: vi.fn(),
      onApproveEmergencyPartner: vi.fn(),
      onRejectRisk: vi.fn(),
      emergencyReviewAt: "2026-06-19T10:00:00Z",
    });
    expect(screen.getByText("workOrders.approveRiskPartner")).toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRiskAssistant")).not.toBeInTheDocument();
  });

  it("WF9c: emergency button uses the orange (not warning) color", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApproveRisk: true,
      onApproveEmergencyReview: vi.fn(),
      onRejectRisk: vi.fn(),
    });
    const btn = screen.getByText("workOrders.approveRiskAssistant").closest("button")!;
    expect(btn.className).toContain("bg-orange-500");
  });

  it("WF10: Risk action buttons are not shown without canApproveRisk", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: true,
      canApproveRisk: false,
      onApproveRisk: vi.fn(),
      onApproveEmergencyReview: vi.fn(),
      ...fullRisk,
    });
    expect(screen.queryByText("workOrders.approveRisk")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRiskAssistant")).not.toBeInTheDocument();
  });

  it("WF11: submit-time emergency dialog requires a justification before onSubmitForApproval fires", () => {
    const onSubmitForApproval = vi.fn();
    renderForm({
      approvalStatus: "Draft",
      onSubmitForApproval,
      onRiskAssessmentChange: vi.fn(),
      hasNonRiskDirty: false,
      // empty risk => emergency submit path
    });

    // Clicking submit with empty risk opens the confirmation dialog (no direct submit).
    fireEvent.click(screen.getByText("workOrders.submitForApproval").closest("button")!);
    expect(onSubmitForApproval).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    const confirmBtn = within(dialog)
      .getByText("workOrders.submitForApproval")
      .closest("button")!;
    expect(confirmBtn).toBeDisabled();

    const textarea = dialog.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "Pedido por correo a Riesgos" } });

    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(onSubmitForApproval).toHaveBeenCalledWith("Pedido por correo a Riesgos");
  });

  it("WF11b: submit with complete risk data submits directly (no dialog)", () => {
    const onSubmitForApproval = vi.fn();
    renderForm({
      approvalStatus: "Draft",
      onSubmitForApproval,
      onRiskAssessmentChange: vi.fn(),
      hasNonRiskDirty: false,
      ...fullRisk,
    });
    fireEvent.click(screen.getByText("workOrders.submitForApproval").closest("button")!);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onSubmitForApproval).toHaveBeenCalledWith();
  });

  it("WF16: emergency-approved completion shows 'Agregar datos' then 'Enviar', never 'Aprobar Riesgo'", () => {
    renderForm({
      approvalStatus: "Approved",
      riskStatus: "Emergency_Approved",
      emergencyDeadlineAt: "2026-06-26",
      canApproveRisk: true,
      onApproveRisk: vi.fn(),
      onRejectRisk: vi.fn(),
      onCompleteRisk: vi.fn(),
      ...fullRisk,
    });
    // Before opting in: only "Agregar datos de Riesgo"; no risk-approval button.
    expect(screen.getByText("workOrders.addRiskData")).toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRisk")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.sendRiskForApproval")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("workOrders.addRiskData").closest("button")!);

    // After opting in: "Enviar a aprobación de Riesgos" shows, but still NOT "Aprobar Riesgo".
    expect(screen.getByText("workOrders.sendRiskForApproval")).toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRisk")).not.toBeInTheDocument();
  });

  it("WF17: once data has been sent (risk_status Pending, data present) 'Aprobar Riesgo' shows", () => {
    renderForm({
      approvalStatus: "Approved",
      riskStatus: "Pending",
      canApproveRisk: true,
      onApproveRisk: vi.fn(),
      onRejectRisk: vi.fn(),
      ...fullRisk,
    });
    expect(screen.getByText("workOrders.approveRisk")).toBeInTheDocument();
  });

  it("WF18: Socio buttons are hidden once the Socio approved; status shows 'Aprobado'", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: true,
      approvedAt: "2026-06-19T10:00:00Z",
      onApprove: vi.fn(),
      onReject: vi.fn(),
    });
    expect(screen.queryByText("workOrders.approve")).not.toBeInTheDocument();
    // Track status (header + bottom) reflects the Socio sign-off.
    expect(screen.getAllByText("workOrders.trackApproved").length).toBeGreaterThan(0);
  });

  it("WF19: track status shows the emergency badge for Riesgos when Emergency_Approved", () => {
    renderForm({
      approvalStatus: "Approved",
      riskStatus: "Emergency_Approved",
      emergencyDeadlineAt: "2026-06-26",
    });
    expect(screen.getAllByText("workOrders.trackEmergency").length).toBeGreaterThan(0);
  });

  it("WF20: Rejected by Riesgos keeps Socio 'Aprobado' visible and shows Riesgos 'Rechazado'", () => {
    renderForm({
      approvalStatus: "Rejected",
      approvedAt: "2026-06-19T10:00:00Z",
      riskStatus: "Rejected",
      rejectionNote: "Falta CEAC",
    });
    // Both tracks render (header + bottom): Socio Aprobado persists, Riesgos Rechazado.
    expect(screen.getAllByText("workOrders.trackApproved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("workOrders.trackRejected").length).toBeGreaterThan(0);
  });

  it("WF21: Riesgos rejected (OT still Pending) shows note + editable risk + 'Enviar a aprobar a Riesgos', no approve buttons", () => {
    const container = renderForm({
      approvalStatus: "Pending_Approval",
      approvedAt: "2026-06-19T10:00:00Z",
      riskStatus: "Rejected",
      riskNote: "Corrige el SAN",
      canApproveRisk: true,
      onApproveRisk: vi.fn(),
      onRejectRisk: vi.fn(),
      onCompleteRisk: vi.fn(),
      onRiskAssessmentChange: vi.fn(),
      ...fullRisk,
    });
    // Risk fields editable (a date input is rendered, not read-only text).
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThan(0);
    // Risk rejection note shown + re-send button; approve/reject risk hidden.
    expect(screen.getByText("Corrige el SAN")).toBeInTheDocument();
    expect(screen.getByText("workOrders.sendRiskForReapproval")).toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRisk")).not.toBeInTheDocument();
    // Socio approval persists in the track status.
    expect(screen.getAllByText("workOrders.trackApproved").length).toBeGreaterThan(0);
  });

  it("WF22: admin sees 'Deshacer' next to an approved track; non-admin does not", () => {
    const onRevertSocio = vi.fn();
    const { rerender } = render(
      <QueryClientProvider client={makeQC()}>
        <WorkOrderForm
          {...(baseProps as any)}
          approvalStatus="Pending_Approval"
          approvedAt="2026-06-19T10:00:00Z"
          canRevert={true}
          onRevertSocio={onRevertSocio}
        />
      </QueryClientProvider>
    );
    const undoBtns = screen.getAllByTitle("workOrders.revertApproval");
    expect(undoBtns.length).toBeGreaterThan(0);
    fireEvent.click(undoBtns[0]);
    expect(onRevertSocio).toHaveBeenCalled();

    // Non-admin (canRevert false) sees no undo control.
    rerender(
      <QueryClientProvider client={makeQC()}>
        <WorkOrderForm
          {...(baseProps as any)}
          approvalStatus="Pending_Approval"
          approvedAt="2026-06-19T10:00:00Z"
          canRevert={false}
          onRevertSocio={onRevertSocio}
        />
      </QueryClientProvider>
    );
    expect(screen.queryByTitle("workOrders.revertApproval")).not.toBeInTheDocument();
  });

  it("WF12: emergency banner is shown when riskStatus is Emergency_Approved", () => {
    renderForm({
      approvalStatus: "Approved",
      riskStatus: "Emergency_Approved",
      emergencyDeadlineAt: "2026-06-25",
    });
    expect(screen.getByText("workOrders.riskApprovedEmergency")).toBeInTheDocument();
    expect(screen.getByText("workOrders.emergencyDeadlineBanner")).toBeInTheDocument();
  });

  // ── Submit gate (all-or-nothing) ───────────────────────────────────────────────
  it("WF13: Submit is enabled with fully empty risk (emergency submit)", () => {
    renderForm({
      approvalStatus: "Draft",
      onSubmitForApproval: vi.fn(),
      onRiskAssessmentChange: vi.fn(),
      hasNonRiskDirty: false,
      // no risk fields
    });
    const btn = screen.getByText("workOrders.submitForApproval").closest("button");
    expect(btn).not.toBeDisabled();
  });

  it("WF14: Submit is disabled with partial risk data", () => {
    renderForm({
      approvalStatus: "Draft",
      onSubmitForApproval: vi.fn(),
      onRiskAssessmentChange: vi.fn(),
      hasNonRiskDirty: false,
      ceacCompletedAt: "2026-05-01", // partial only
    });
    const btn = screen.getByText("workOrders.submitForApproval").closest("button");
    expect(btn).toBeDisabled();
  });

  it("WF15: Submit is enabled with all 5 risk fields complete (normal submit)", () => {
    renderForm({
      approvalStatus: "Draft",
      onSubmitForApproval: vi.fn(),
      onRiskAssessmentChange: vi.fn(),
      hasNonRiskDirty: false,
      ...fullRisk,
    });
    const btn = screen.getByText("workOrders.submitForApproval").closest("button");
    expect(btn).not.toBeDisabled();
  });
});
