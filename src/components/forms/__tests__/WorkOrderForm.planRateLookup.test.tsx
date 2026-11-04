import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// 1028-214 (review de Codex): mientras el plan de pagos trae el TC del encabezado desde una
// fecha, Guardar y Enviar a aprobación esperan. Si no, se guardaba el TC anterior, o el plan
// quedaba bloqueado por la aprobación antes de que llegara el TC elegido.

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

// La sección real ya se prueba aparte (WorkOrderPaymentPlanSection.rateFromDate.test.tsx). Acá
// solo interesa el aviso que le manda al formulario.
const section = vi.hoisted(() => ({ onPlanRateLookupChange: undefined as ((p: boolean) => void) | undefined }));
vi.mock("../WorkOrderPaymentPlanSection", () => ({
  WorkOrderPaymentPlanSection: (props: { onPlanRateLookupChange?: (p: boolean) => void }) => {
    section.onPlanRateLookupChange = props.onPlanRateLookupChange;
    return <div data-testid="payment-plan-section" />;
  },
}));

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  (Element.prototype as any).scrollIntoView = vi.fn();
});

import { WorkOrderForm } from "../WorkOrderForm";

const makeQC = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

function renderDraft() {
  const props = {
    currency: "USD" as const,
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
    onSubmitForApproval: vi.fn(),
    onRiskAssessmentChange: vi.fn(),
    onPaymentPlanChange: vi.fn(),
    onPaymentInstallmentsChange: vi.fn(),
    paymentPlan: null,
    paymentInstallments: [],
    isLocked: false,
    canApprove: false,
    isSubmitting: false,
  } as unknown as Parameters<typeof WorkOrderForm>[0];
  render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderForm {...props} />
    </QueryClientProvider>,
  );
}

const saveButton = () => screen.getByText("common.save").closest("button")!;
const submitButton = () => screen.getByText("workOrders.submitForApproval").closest("button")!;

describe("WorkOrderForm — Guardar y Enviar esperan el TC del plan (1028-214)", () => {
  beforeEach(() => {
    section.onPlanRateLookupChange = undefined;
  });

  it("WFR1: con la consulta del TC del encabezado en curso, Guardar y Enviar a aprobación quedan deshabilitados", () => {
    renderDraft();
    expect(saveButton()).toBeEnabled();
    expect(submitButton()).toBeEnabled();

    act(() => section.onPlanRateLookupChange?.(true));

    expect(saveButton()).toBeDisabled();
    expect(submitButton()).toBeDisabled();
  });

  it("WFR2: al volver la consulta, se vuelven a habilitar", () => {
    renderDraft();
    act(() => section.onPlanRateLookupChange?.(true));
    act(() => section.onPlanRateLookupChange?.(false));

    expect(saveButton()).toBeEnabled();
    expect(submitButton()).toBeEnabled();
  });
});
