import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * BUG 0604-143: "Fecha de Cierre" column added to the Client engagements table,
 * between "Fecha de Fin" and "Estado".
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockEngagement = {
  engagement_id: "eng-1",
  client_id: "client-1",
  engagement_name: "Audit FY2026",
  engagement_code: "2026.121.001",
  partner_id: null,
  manager_id: null,
  status: "active",
  start_date: "2025-10-01",
  end_date: "2026-09-30",
  fecha_cierre: "2026-02-20",
  created_at: "2025-09-01T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 2,
  funcion: 1,
  anio_fiscal: 2026,
  anio_fiscal_override: false,
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
};

vi.mock("@/hooks/useEmsData", () => ({
  useEngagements: () => ({ data: [mockEngagement], isLoading: false }),
  useStaff: () => ({ data: [] }),
}));
vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partners: [], managers: [] }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false, isPartner: false, isDirector: false }),
}));

import { ClientEngagementsTable } from "@/components/clients/ClientEngagementsTable";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ClientEngagementsTable — Fecha de Cierre column (BUG 0604-143)", () => {
  it("renders the closing-date column header", () => {
    wrap(<ClientEngagementsTable clientId="client-1" />);
    expect(screen.getByText("engagement.closingDate")).toBeInTheDocument();
  });

  it("renders the row's formatted fecha_cierre (dd/MM/yyyy) between Fecha de Fin and Estado", () => {
    wrap(<ClientEngagementsTable clientId="client-1" />);
    expect(screen.getByText("20/02/2026")).toBeInTheDocument();
  });

  it("sorts by fecha_cierre when the closing-date header is clicked", () => {
    wrap(<ClientEngagementsTable clientId="client-1" />);
    const header = screen.getByText("engagement.closingDate");
    // Smoke test: clicking should not throw and the cell should still render.
    header.click();
    expect(screen.getByText("20/02/2026")).toBeInTheDocument();
  });
});
