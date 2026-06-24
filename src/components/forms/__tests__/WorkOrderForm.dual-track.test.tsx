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
  (Element.prototype as any).scrollIntoView = vi.fn();
});

import { WorkOrderForm } from "../WorkOrderForm";

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

type FormOverrides = Partial<Parameters<typeof WorkOrderForm>[0]>;

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

// Proxies for editability:
// - gastos/ajuste editable  → "Agregar gasto" button is rendered (workOrders.addExpense)
// - risk fields editable     → CEAC/SAN render as editable date inputs (type="date")
const gastosEditable = () =>
  screen.queryByText("workOrders.addExpense") !== null;
const dateInputs = (c: HTMLElement) =>
  c.querySelectorAll<HTMLInputElement>('input[type="date"]');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkOrderForm — dual-track withdraw/edit (bug 0306-78)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DT1: Socio aprobado + Riesgos rechazado → gastos bloqueados, riesgos editable, Socio 'Aprobado' visible, reenviar a Riesgos", () => {
    const container = renderForm({
      approvalStatus: "Pending_Approval", // Socio aprobó mientras Riesgos seguía pendiente
      approvedAt: "2026-06-01T00:00:00Z",
      riskStatus: "Rejected",
      onRiskAssessmentChange: vi.fn(),
      onCompleteRisk: vi.fn(),
      onUnsubmit: vi.fn(),
      ...fullRisk,
    });
    // gastos/ajuste bloqueados (pista Socio aprobada)
    expect(gastosEditable()).toBe(false);
    // riesgos editable (pista rechazada en corrección)
    const dates = dateInputs(container);
    expect(dates.length).toBeGreaterThan(0);
    dates.forEach((d) => expect(d.readOnly).toBe(false));
    // Socio sigue mostrando "Aprobado"
    expect(screen.getAllByText("workOrders.trackApproved").length).toBeGreaterThan(0);
    // reenviar SOLO a Riesgos
    expect(screen.getByText("workOrders.sendRiskForReapproval")).toBeInTheDocument();
    // no se muestra el unsubmit de la pista Socio (ya aprobada)
    expect(screen.queryByText("workOrders.unsubmit")).not.toBeInTheDocument();
  });

  it("DT2: Riesgos aprobado + Socio rechazado → gastos editable, riesgos bloqueado, sin 'Retirar', reenvío del Socio", () => {
    const container = renderForm({
      approvalStatus: "Rejected",
      approvedAt: null,
      riskStatus: "Approved",
      onRiskAssessmentChange: vi.fn(),
      onSubmitForApproval: vi.fn(),
      onUnsubmit: vi.fn(),
      ...fullRisk,
    });
    // gastos/ajuste editables (corrección de la pista Socio)
    expect(gastosEditable()).toBe(true);
    // riesgos bloqueado (pista aprobada) → datos como texto, sin date inputs
    expect(dateInputs(container).length).toBe(0);
    // Riesgos sigue mostrando "Aprobado"
    expect(screen.getAllByText("workOrders.trackApproved").length).toBeGreaterThan(0);
    // sin "Retirar" (no hay pista pendiente: Socio rechazado + Riesgos aprobado)
    expect(screen.queryByText("workOrders.unsubmit")).not.toBeInTheDocument();
    // reenvío de la pista Socio con etiqueta dedicada
    expect(screen.getByText("workOrders.sendForPartnerApproval")).toBeInTheDocument();
  });

  it("DT3: doble rechazo (Socio y Riesgos) → ambos 'Rechazado', sin 'Retirar', dos reenvíos por pista", () => {
    renderForm({
      approvalStatus: "Rejected",
      approvedAt: null,
      riskStatus: "Rejected",
      onRiskAssessmentChange: vi.fn(),
      onSubmitForApproval: vi.fn(),
      onCompleteRisk: vi.fn(),
      onUnsubmit: vi.fn(),
      ...fullRisk,
    });
    // Ambas pistas en "Rechazado"; el Socio NO debe caer a "Pendiente".
    expect(screen.getAllByText("workOrders.trackRejected").length).toBeGreaterThan(0);
    expect(screen.queryByText("workOrders.trackPending")).not.toBeInTheDocument();
    // sin "Retirar" cuando ambas están rechazadas
    expect(screen.queryByText("workOrders.unsubmit")).not.toBeInTheDocument();
    // dos reenvíos independientes: Socio (abajo) y Riesgos (arriba)
    expect(screen.getByText("workOrders.sendForPartnerApproval")).toBeInTheDocument();
    expect(screen.getByText("workOrders.sendRiskForReapproval")).toBeInTheDocument();
  });

  it("DT4: OT cerrada (Socio aprobado + Riesgos aprobado) → todo bloqueado y sin 'Retirar'", () => {
    const container = renderForm({
      approvalStatus: "Approved",
      approvedAt: "2026-06-01T00:00:00Z",
      riskStatus: "Approved",
      onUnsubmit: vi.fn(),
      ...fullRisk,
    });
    expect(gastosEditable()).toBe(false);
    expect(dateInputs(container).length).toBe(0);
    expect(screen.queryByText("workOrders.unsubmit")).not.toBeInTheDocument();
  });

  it("DT5: Draft de autoría → sin fila de estado; gastos y riesgos editables", () => {
    const container = renderForm({
      approvalStatus: "Draft",
      onRiskAssessmentChange: vi.fn(),
      onSubmitForApproval: vi.fn(),
    });
    // nada decidido → sin indicadores de pista
    expect(screen.queryByText("workOrders.trackApproved")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.trackPending")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.trackRejected")).not.toBeInTheDocument();
    // editables
    expect(gastosEditable()).toBe(true);
    const dates = dateInputs(container);
    expect(dates.length).toBeGreaterThan(0);
    dates.forEach((d) => expect(d.readOnly).toBe(false));
  });

  it("DT6: regresión emergencia → 'Agregar datos de Riesgo' desbloquea los campos (sin guard !riskApproved)", () => {
    const container = renderForm({
      approvalStatus: "Approved",
      riskStatus: "Emergency_Approved",
      approvedAt: "2026-06-01T00:00:00Z",
      onCompleteRisk: vi.fn(),
      onRiskAssessmentChange: vi.fn(),
    });
    // antes de pulsar: campos de riesgo de solo lectura
    expect(dateInputs(container).length).toBe(0);
    // pulsar "Agregar datos de Riesgo" desbloquea (addingRiskData)
    fireEvent.click(screen.getByText("workOrders.addRiskData"));
    const dates = dateInputs(container);
    expect(dates.length).toBeGreaterThan(0);
    dates.forEach((d) => expect(d.readOnly).toBe(false));
  });

  it("DT7: Socio Pendiente + Riesgos Aprobado (pantalla 1) → 'Retirar' visible y riesgos read-only", () => {
    const container = renderForm({
      approvalStatus: "Pending_Approval",
      approvedAt: null, // Socio aún sin decidir
      riskStatus: "Approved",
      canApprove: true,
      onApprove: vi.fn(),
      onReject: vi.fn(),
      onUnsubmit: vi.fn(),
      onRiskAssessmentChange: vi.fn(),
      ...fullRisk,
    });
    // hay pista pendiente (Socio) → "Retirar" visible
    expect(screen.getByText("workOrders.unsubmit")).toBeInTheDocument();
    // Riesgos aprobado → campos de riesgo read-only (sin date inputs)
    expect(dateInputs(container).length).toBe(0);
  });

  it("DT8: Draft tras retirar con Riesgos Aprobado → riesgos bloqueado, gastos editables", () => {
    const container = renderForm({
      approvalStatus: "Draft",
      approvedAt: null,
      riskStatus: "Approved",
      onRiskAssessmentChange: vi.fn(),
      ...fullRisk,
    });
    // solo se corrige lo no aprobado: gastos editables, riesgo bloqueado
    expect(gastosEditable()).toBe(true);
    expect(dateInputs(container).length).toBe(0);
  });

  it("DT9: el formulario ya no renderiza 'Notas CEAC' ni 'Notas SAN'", () => {
    renderForm({
      approvalStatus: "Draft",
      onRiskAssessmentChange: vi.fn(),
    });
    expect(screen.queryByText("workOrders.ceacNotes")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.sanNotes")).not.toBeInTheDocument();
  });

  // ── Iteración 3: reenvío de Riesgos por emergencia ────────────────────────────

  it("DT10: Riesgos rechazado + 5 campos vacíos → botón reenviar habilitado (todo-o-nada)", () => {
    // Draft + risk=Rejected: estado típico tras "Retirar" cuando Riesgos rechazó.
    renderForm({
      approvalStatus: "Draft",
      riskStatus: "Rejected",
      onRiskAssessmentChange: vi.fn(),
      onCompleteRisk: vi.fn(),
      // Sin datos de riesgo → riskAllEmpty=true → botón habilitado
    });
    const btn = screen.getByText("workOrders.sendRiskForReapproval");
    expect(btn.closest("button")).not.toBeDisabled();
  });

  it("DT11: Riesgos rechazado + 5 campos completos → botón reenviar habilitado", () => {
    renderForm({
      approvalStatus: "Draft",
      riskStatus: "Rejected",
      onRiskAssessmentChange: vi.fn(),
      onCompleteRisk: vi.fn(),
      ...fullRisk,
    });
    const btn = screen.getByText("workOrders.sendRiskForReapproval");
    expect(btn.closest("button")).not.toBeDisabled();
  });

  it("DT12: Riesgos rechazado + datos parciales → botón reenviar deshabilitado", () => {
    renderForm({
      approvalStatus: "Draft",
      riskStatus: "Rejected",
      onRiskAssessmentChange: vi.fn(),
      onCompleteRisk: vi.fn(),
      ceacCompletedAt: "2026-05-01", // solo un campo → parcial
    });
    const btn = screen.getByText("workOrders.sendRiskForReapproval");
    expect(btn.closest("button")).toBeDisabled();
  });

  it("DT13: Riesgos rechazado → botón 'Limpiar datos de Riesgos' presente y llama onClearRiskData", () => {
    const onClearRiskData = vi.fn();
    renderForm({
      approvalStatus: "Draft",
      riskStatus: "Rejected",
      onRiskAssessmentChange: vi.fn(),
      onCompleteRisk: vi.fn(),
      onClearRiskData,
      ...fullRisk, // tiene datos → Limpiar habilitado
    });
    const btn = screen.getByText("workOrders.clearRiskData");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClearRiskData).toHaveBeenCalledTimes(1);
  });

  it("DT14: Riesgos rechazado + campos vacíos → botón 'Limpiar' deshabilitado (ya vacío)", () => {
    renderForm({
      approvalStatus: "Draft",
      riskStatus: "Rejected",
      onRiskAssessmentChange: vi.fn(),
      onCompleteRisk: vi.fn(),
      onClearRiskData: vi.fn(),
      // Sin datos → riskAllEmpty=true → Limpiar disabled
    });
    const btn = screen.getByText("workOrders.clearRiskData");
    expect(btn.closest("button")).toBeDisabled();
  });
});
