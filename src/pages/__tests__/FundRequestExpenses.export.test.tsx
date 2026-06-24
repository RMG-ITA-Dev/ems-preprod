import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn(), useParams: () => ({ id: "fr-1" }) };
});

const STAFF_ID = "staff-1";
let mockStaff: { staff_id: string } | null = { staff_id: STAFF_ID };
let mockIsAdmin = false;
let mockFr: unknown = null;
let mockExpenses: unknown[] = [];

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: mockStaff }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: mockIsAdmin }),
}));
vi.mock("@/hooks/useFundRequests", () => ({
  useFundRequestById: () => ({ data: mockFr, isLoading: false }),
}));
vi.mock("@/hooks/useFundRequestExpenses", () => ({
  useFundRequestExpenses: () => ({ data: mockExpenses, isLoading: false }),
}));
vi.mock("@/hooks/mutations/useFundRequestExpenseMutations", () => ({
  useSubmitAllFundRequestExpenses: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDecideAllFundRequestExpenses: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/fundRequestExpenseReportExport", () => ({
  downloadExpenseReportXlsx: vi.fn().mockResolvedValue(undefined),
  reportFilename: (n: string) => `gastos_${n}.xlsx`,
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/data-table/DataTable", () => ({ DataTable: () => null }));
vi.mock("@/components/fund-requests/FundRequestExpenseDialog", () => ({
  FundRequestExpenseDialog: () => null,
}));
vi.mock("@/components/fund-requests/ApprovalDecisionDialog", () => ({
  ApprovalDecisionDialog: () => null,
}));

import FundRequestExpenses from "../FundRequestExpenses";
import { downloadExpenseReportXlsx } from "@/lib/fundRequestExpenseReportExport";
import { toast } from "sonner";

const EXPORT_LABEL = "fundRequestExpense.report.exportButton";

function makeFr(over: Record<string, unknown> = {}) {
  return {
    fund_request_id: "fr-1",
    request_number: "FR-2026-0026",
    requester_staff_id: "other",
    currency: "BOB",
    status: "fondos_entregados",
    total_disbursed_amount: 40,
    fund_request_work_orders: [{ wo_id: "wo-1", manager_staff_id: "other-mgr" }],
    ...over,
  };
}

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FundRequestExpenses />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FundRequestExpenses — export report (0319-91)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStaff = { staff_id: STAFF_ID };
    mockIsAdmin = false;
    // Por defecto hay un gasto (el botón requiere al menos uno).
    mockExpenses = [
      { fre_id: "e1", amount: 40, currency: "BOB", iva_penalty_amount: 0, status: "revisado_asistente" },
    ];
  });

  it("shows the export button to the requester", () => {
    mockFr = makeFr({ requester_staff_id: STAFF_ID });
    wrap();
    expect(screen.getByText(EXPORT_LABEL)).toBeInTheDocument();
  });

  it("shows the export button to an OT manager", () => {
    mockFr = makeFr({ fund_request_work_orders: [{ wo_id: "wo-1", manager_staff_id: STAFF_ID }] });
    wrap();
    expect(screen.getByText(EXPORT_LABEL)).toBeInTheDocument();
  });

  it("shows the export button to admin (accounting)", () => {
    mockIsAdmin = true;
    mockFr = makeFr();
    wrap();
    expect(screen.getByText(EXPORT_LABEL)).toBeInTheDocument();
  });

  it("hides the export button from a non-actor", () => {
    mockFr = makeFr(); // requester=other, manager=other-mgr, not admin
    wrap();
    expect(screen.queryByText(EXPORT_LABEL)).not.toBeInTheDocument();
  });

  it("hides the export button when there are no expenses to report", () => {
    mockFr = makeFr({ requester_staff_id: STAFF_ID });
    mockExpenses = [];
    wrap();
    expect(screen.queryByText(EXPORT_LABEL)).not.toBeInTheDocument();
  });

  it("calls the export helper with the request and expenses on click", async () => {
    mockFr = makeFr({ requester_staff_id: STAFF_ID });
    mockExpenses = [{ fre_id: "e1", amount: 40, currency: "BOB", iva_penalty_amount: 0, status: "revisado_asistente" }];
    wrap();
    fireEvent.click(screen.getByText(EXPORT_LABEL));
    await waitFor(() => expect(downloadExpenseReportXlsx).toHaveBeenCalledTimes(1));
    const [input, , filename] = vi.mocked(downloadExpenseReportXlsx).mock.calls[0];
    expect(input.expenses).toHaveLength(1);
    expect(input.fr.request_number).toBe("FR-2026-0026");
    expect(filename).toBe("gastos_FR-2026-0026.xlsx");
  });

  it("shows a toast on export failure", async () => {
    vi.mocked(downloadExpenseReportXlsx).mockRejectedValueOnce(new Error("boom"));
    mockFr = makeFr({ requester_staff_id: STAFF_ID });
    wrap();
    fireEvent.click(screen.getByText(EXPORT_LABEL));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
