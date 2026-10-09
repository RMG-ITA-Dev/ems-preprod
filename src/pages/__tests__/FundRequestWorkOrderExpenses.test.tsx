import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts && "count" in opts ? `${k}|${opts.count}|${opts.spent}|${opts.inProcess}` : k,
    i18n: { language: "es" },
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ woId: "wo-1" }) };
});

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// DataTable real no hace falta: se pinta una fila por registro con su id.
vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: ({ data, getRowId }: { data: unknown[]; getRowId: (r: unknown) => string }) => (
    <ul data-testid="datatable">
      {data.map((r) => (
        <li key={getRowId(r)}>{getRowId(r)}</li>
      ))}
    </ul>
  ),
}));

const detail = {
  work_order: { wo_id: "wo-1", engagement_code: "7F01", engagement_name: "Auditoría", client_name: "Cliente SA" },
  totals: { assigned: 1000, spent: 620, in_process: 80, budget: 3500 },
  requests: [],
  budget_by_type: [],
  expenses: [
    { fre_id: "e1", fund_request_id: "fr1", request_number: "SF-1", requester_staff_id: "s1", requester_name: "Ana P", expense_date: "2026-09-10", expense_date_end: null, amount: 500, currency: "BOB", status: "revisado_asistente", expense_type_id: "t1", expense_type_name: "Pasajes", description: null, document_number: null, supplier_name: null, iva_penalty_amount: 0, manager_auto_approved: false, review_auto_approved: false },
    { fre_id: "e2", fund_request_id: "fr2", request_number: "SF-2", requester_staff_id: "s1", requester_name: "Ana P", expense_date: "2026-10-05", expense_date_end: null, amount: 50, currency: "BOB", status: "pendiente_aprobacion", expense_type_id: "t1", expense_type_name: "Pasajes", description: null, document_number: null, supplier_name: null, iva_penalty_amount: 0, manager_auto_approved: false, review_auto_approved: false },
  ],
};

vi.mock("@/hooks/useWorkOrderExpenses", () => ({
  useWorkOrderExpenseDetail: () => ({ data: detail, isLoading: false }),
}));

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import FundRequestWorkOrderExpenses from "../FundRequestWorkOrderExpenses";

describe("FundRequestWorkOrderExpenses — detalle de gastos por OT (Fase 5)", () => {
  it("muestra la OT, los totales y la lista plana de gastos", () => {
    render(<FundRequestWorkOrderExpenses />);
    expect(screen.getByText("Cliente SA")).toBeInTheDocument();
    expect(screen.getByText("380,00 BOB")).toBeInTheDocument(); // diferencia asignado − gastado
    expect(screen.getByText("workOrderExpenses.filteredSummary|2|500,00|50,00")).toBeInTheDocument();
    const tables = screen.getAllByTestId("datatable");
    expect(tables[tables.length - 1]).toHaveTextContent("e1e2");
  });

  it("filtra por período y recalcula el resumen", () => {
    render(<FundRequestWorkOrderExpenses />);
    fireEvent.change(screen.getByLabelText("workOrderExpenses.filters.from"), {
      target: { value: "2026-10-01" },
    });
    expect(screen.getByText("workOrderExpenses.filteredSummary|1|0,00|50,00")).toBeInTheDocument();
  });

  it("agrupa por solicitud", () => {
    render(<FundRequestWorkOrderExpenses />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("SF-1")).toBeInTheDocument();
    expect(screen.getByText("SF-2")).toBeInTheDocument();
  });
});
