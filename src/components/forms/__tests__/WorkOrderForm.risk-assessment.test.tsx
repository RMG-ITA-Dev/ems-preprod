import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    ceacCompletedAt?: string | null;
    ceacNotes?: string | null;
    sanCompletedAt?: string | null;
    sanNotes?: string | null;
    onRiskAssessmentChange?: (field: string, value: string | null) => void;
    onApprove?: () => void;
    onReject?: () => void;
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkOrderForm — Risk Assessment Section (feat/0306-78)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("WF1: Approve button is disabled when CEAC or SAN date is missing", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: true,
      onApprove: vi.fn(),
      onRiskAssessmentChange: vi.fn(),
      // No ceacCompletedAt / sanCompletedAt
    });
    const btn = screen.getByText("workOrders.approve").closest("button");
    expect(btn).toBeDisabled();
  });

  it("WF2: Approve button is enabled when both CEAC and SAN dates are present", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: true,
      onApprove: vi.fn(),
      onRiskAssessmentChange: vi.fn(),
      ceacCompletedAt: "2026-05-01",
      sanCompletedAt: "2026-04-15",
    });
    const btn = screen.getByText("workOrders.approve").closest("button");
    expect(btn).not.toBeDisabled();
  });

  it("WF3: Risk section is not rendered for non-approvers (canApprove=false)", () => {
    renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: false,
      onRiskAssessmentChange: vi.fn(),
    });
    expect(screen.queryByText("workOrders.riskAssessment")).not.toBeInTheDocument();
  });

  it("WF4: onRiskAssessmentChange is called with (ceacCompletedAt, value) on CEAC input change", () => {
    const handler = vi.fn();
    const container = renderForm({
      approvalStatus: "Pending_Approval",
      canApprove: true,
      onRiskAssessmentChange: handler,
    });
    const [ceacInput] = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(ceacInput, { target: { value: "2026-05-01" } });
    expect(handler).toHaveBeenCalledWith("ceacCompletedAt", "2026-05-01");
  });

  it("WF5: Risk section is visible as read-only when OT is Approved and has risk data", () => {
    const container = renderForm({
      approvalStatus: "Approved",
      ceacCompletedAt: "2026-05-01",
      sanCompletedAt: "2026-04-15",
    });
    expect(screen.getByText("workOrders.riskAssessment")).toBeInTheDocument();
    const dateInputs = container.querySelectorAll<HTMLInputElement>('input[type="date"]');
    dateInputs.forEach((input) => expect(input.readOnly).toBe(true));
  });

  it("WF6: Risk card is absent for Approved OT with no risk data (pre-feature records)", () => {
    renderForm({
      approvalStatus: "Approved",
      // No ceacCompletedAt / sanCompletedAt
    });
    expect(screen.queryByText("workOrders.riskAssessment")).not.toBeInTheDocument();
  });
});
