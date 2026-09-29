import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * FEAT 0714-155: Engagements list — "Sociedad" column + filter.
 * DataTable is stubbed (same convention as Engagements.create-permissions.test.tsx) to
 * capture the columns/filters props actually passed in, without driving DataTable's own
 * rendering/sorting internals.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "admin" }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [] }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

const mockSocieties = [
  { society_id: "soc-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "" },
  { society_id: "soc-2", name: "Ruizmier Jauregui S.R.L.", is_active: true, created_at: "" },
];

const mockEngagements = [
  {
    engagement_id: "eng-1",
    engagement_code: "2027.121.001",
    engagement_name: "Audit FY2027",
    client: { client_legal_name: "Acme Corp" },
    society: { society_id: "soc-1", name: "Ruizmier Pelaez S.R.L." },
    work_order: null,
  },
  {
    engagement_id: "eng-2",
    engagement_code: "2027.121.002",
    engagement_name: "Legacy Engagement",
    client: { client_legal_name: "Legacy Client" },
    society: undefined, // historical row: no society backfilled
    work_order: null,
  },
  {
    engagement_id: "eng-3",
    engagement_code: "2027.121.003",
    engagement_name: "Old Firm Engagement",
    client: { client_legal_name: "Old Firm Client" },
    // REVIEW FIX: society deactivated after this engagement was created — useSocieties()
    // (active-only) would never surface it, so it must come from the engagement embed.
    society: { society_id: "soc-inactive", name: "Old Society S.R.L." },
    work_order: null,
  },
  {
    engagement_id: "eng-admin",
    engagement_code: "2027.110.001",
    engagement_name: "Administrativo que no pertenece a Encargos",
    funcion: 0,
    client: { client_legal_name: "Ruizmier Pelaez S.R.L." },
    society: { society_id: "soc-1", name: "Ruizmier Pelaez S.R.L." },
    work_order: null,
  },
];

vi.mock("@/hooks/useEmsData", () => ({
  useSocieties: () => ({ data: mockSocieties }),
}));
// BUG 0828-185: Engagements.tsx pasó de useEngagements() a usePortfolioEngagements().
vi.mock("@/hooks/usePortfolioEngagements", () => ({
  usePortfolioEngagements: () => ({ data: mockEngagements, isLoading: false }),
}));

let capturedProps: any = null;
vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: (props: any) => {
    capturedProps = props;
    return <div data-testid="data-table-stub" />;
  },
}));

import Engagements from "../Engagements";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Engagements — Sociedad column and filter (FEAT 0714-155)", () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it("renders the list without crashing", () => {
    wrap(<Engagements />);
    expect(screen.getByTestId("data-table-stub")).toBeInTheDocument();
  });

  it("excluye los encargos administrativos de la vista general", () => {
    wrap(<Engagements />);
    expect(capturedProps.data.map((row: { engagement_id: string }) => row.engagement_id))
      .not.toContain("eng-admin");
  });

  // Bug 0722-158 (extension a Encargos): Sociedad dejo de ser columna propia y
  // vive dentro de «Cliente» — como chip en la celda y como control `secondary`
  // en la cabecera. La CAPACIDAD es la misma: se muestra y se filtra por
  // society_id; solo cambio de sitio. Estos tests siguen su intencion original.
  const clienteColumn = () =>
    capturedProps.columns.find((c: any) => c.key === "client.client_legal_name");

  it("expone 'society.name' ordenable y filtrado por society_id dentro de «Cliente»", () => {
    wrap(<Engagements />);
    const society = clienteColumn().secondary.find((sec: any) => sec.key === "society.name");
    expect(society).toBeDefined();
    expect(society.sortable).toBe(true);
    expect(society.filterKey).toBe("society_id");
  });

  it("la celda de «Cliente» muestra el nombre de la sociedad cuando existe", () => {
    wrap(<Engagements />);
    const { container } = render(<>{clienteColumn().render(capturedProps.data[0])}</>);
    expect(container.textContent).toContain("Ruizmier Pelaez S.R.L.");
  });

  it("la celda cae a '-' para un encargo historico sin sociedad", () => {
    wrap(<Engagements />);
    const { container } = render(<>{clienteColumn().render(capturedProps.data[1])}</>);
    // El chip de sociedad queda en "-", pero el cliente se sigue mostrando.
    expect(container.querySelector("[title]")?.getAttribute("title")).toContain("-");
  });

  it("exposes a society_id filter with the 2 catalog options", () => {
    wrap(<Engagements />);
    const filter = capturedProps.filters.find((f: any) => f.key === "society_id");
    expect(filter).toBeDefined();
    expect(filter.options).toEqual(
      expect.arrayContaining([
        { value: "soc-1", label: "Ruizmier Pelaez S.R.L." },
        { value: "soc-2", label: "Ruizmier Jauregui S.R.L." },
      ])
    );
  });

  it("REVIEW FIX: merges in a historical (now-inactive) society from the engagement embed", () => {
    wrap(<Engagements />);
    const filter = capturedProps.filters.find((f: any) => f.key === "society_id");
    expect(filter.options).toEqual(
      expect.arrayContaining([{ value: "soc-inactive", label: "Old Society S.R.L." }])
    );
    // Still exactly 3: the 2 active + the 1 distinct inactive one — not duplicated.
    expect(filter.options).toHaveLength(3);
  });

  // review.md dash_socio iteración 10, G-02: el clic de un segmento del KPI 1 del tablero
  // Socio llega acá con ?society=<id> cuando el filtro de Sociedad estaba activo.
  it("preserva ?society= de la URL como initialFilters.society_id (review.md iteración 10, G-02)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/engagements?society=soc-1"]}>
          <Engagements />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(capturedProps.initialFilters.society_id).toBe("soc-1");
  });
});
