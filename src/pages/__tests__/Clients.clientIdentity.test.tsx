import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * 1028-211 — clientes homónimos en la lista /clients.
 *
 * La lista ya muestra el NIT en su propia columna: dos clientes con el mismo nombre y NIT distinto
 * ya se distinguen. El chip con el número de homónimo solo aparece cuando coinciden nombre Y NIT,
 * que es cuando las filas serían idénticas. El número viene del directorio (global), no se
 * recalcula sobre las filas visibles.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => null, roleKey: null }),
}));

vi.mock("@/hooks/useCanSeeAllEngagements", () => ({ useCanSeeAllEngagements: () => true }));

const ID_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ID_B = "bbbbbbbb-2222-4222-8222-222222222222";
const ID_C = "cccccccc-3333-4333-8333-333333333333";
const ID_D = "dddddddd-4444-4444-8444-444444444444";
const row = (client_id: string, client_legal_name: string, tax_id: string) => ({
  client_id,
  client_legal_name,
  tax_id,
  industry_id: null,
  industry: null,
  contacts: [],
  is_active: true,
});
const stableClients = [
  row(ID_A, "Fideicomiso X", "99001"),
  row(ID_B, "fideicomiso x", "99001"),
  row(ID_C, "Fideicomiso X", "12345"),
  row(ID_D, "Empresa Única", "77777"),
];
const stableIndustries = [
  { industry_id: "ind-a", industry_name: "Industria A", status: "active" },
  { industry_id: "ind-b", industry_name: "Industria B", status: "inactive" },
];
// Números globales del directorio: C (mismo nombre, otro NIT) es el #2, así que la lista muestra #1 y #3.
const stableDirectory = [
  { client_id: ID_A, client_legal_name: "Fideicomiso X", is_active: true, homonym_seq: 1 },
  { client_id: ID_C, client_legal_name: "Fideicomiso X", is_active: true, homonym_seq: 2 },
  { client_id: ID_B, client_legal_name: "fideicomiso x", is_active: true, homonym_seq: 3 },
  { client_id: ID_D, client_legal_name: "Empresa Única", is_active: true, homonym_seq: null },
];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients, isLoading: false }),
  useClientDirectory: () => ({ data: stableDirectory, isLoading: false }),
  useEngagements: () => ({ data: [], isLoading: false }),
  useIndustries: () => ({ data: stableIndustries, isLoading: false }),
}));
vi.mock("@/lib/fiscalYearDisplay", () => ({ formatFiscalYearEnd: () => "-" }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

// DataTable de prueba: pinta la columna nombre con su `render` real (el mismo que usa la tarjeta
// móvil, por `mobilePriority: 'primary'`) y expone las opciones del filtro de industria.
vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: ({ data, columns, onRowClick, filters }: any) => {
    const nameColumn = columns.find((c: any) => c.key === "client_legal_name");
    return (
      <div>
        {data.map((r: any) => (
          <div key={r.client_id} data-testid={`row-${r.client_id}`} onClick={() => onRowClick(r)}>
            {nameColumn.render(r)}
          </div>
        ))}
        <ul data-testid="industry-filter">
          {filters[0].options.map((o: any) => (
            <li key={o.value}>{o.label}</li>
          ))}
        </ul>
      </div>
    );
  },
}));

import Clients from "../Clients";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Clients />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Clients — homónimos (1028-211)", () => {
  it("el chip aparece solo con nombre y NIT iguales, con el número global del directorio", () => {
    wrap();
    expect(screen.getByTestId(`row-${ID_A}`)).toHaveTextContent(/^Fideicomiso X1$/);
    expect(screen.getByTestId(`row-${ID_B}`)).toHaveTextContent(/^fideicomiso x3$/);
    // Mismo nombre, otro NIT: la columna NIT ya lo distingue.
    expect(screen.getByTestId(`row-${ID_C}`)).toHaveTextContent(/^Fideicomiso X$/);
    expect(screen.getByTestId(`row-${ID_D}`)).toHaveTextContent(/^Empresa Única$/);
  });

  it("entre nombres iguales, las filas van por número (#1 antes que #3)", () => {
    wrap();
    const order = screen.getAllByTestId(/^row-/).map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual([`row-${ID_A}`, `row-${ID_C}`, `row-${ID_B}`, `row-${ID_D}`]);
  });

  it("al hacer clic navega por UUID", () => {
    wrap();
    screen.getByTestId(`row-${ID_B}`).click();
    expect(mockNavigate).toHaveBeenCalledWith(`/clients/${ID_B}`);
  });

  it("el filtro de industria sigue ofreciendo las inactivas", () => {
    wrap();
    const filter = screen.getByTestId("industry-filter");
    expect(filter).toHaveTextContent("Industria A");
    expect(filter).toHaveTextContent("Industria B");
  });
});
