import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Bug 0722-158 (extension a Encargos): 9 columnas -> 7. La regla de la sesion es
// que fusionar NO puede costar capacidades, asi que estos tests inventarian los
// 9 ordenamientos y los 4 filtros originales y verifican que TODOS siguen
// alcanzables, ya sea como columna o como control `secondary`.

const capturedProps: any = {};

vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: (props: any) => {
    Object.assign(capturedProps, props);
    return <div data-testid="data-table-stub" />;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => null, isLoading: false }),
}));

const { engagementRows } = vi.hoisted(() => ({
  engagementRows: [
    {
      engagement_id: "e1",
      engagement_code: "2027.111.027",
      engagement_name: "Prueba Encargo Reunion",
      start_date: "2026-08-18",
      end_date: "2026-08-31",
      is_internal: false,
      client: { client_id: "c1", client_legal_name: "Banco FIE S.A." },
      society: { society_id: "s1", name: "Ruizmier Pelaez S.R.L." },
      society_id: "s1",
      partner_id: "p1",
      manager_id: "m1",
      partner: { staff_id: "p1", short_name: "Marcelo", first_name: "Marcelo", last_name: "Ovando" },
      manager: { staff_id: "m1", short_name: "Ronaldo C", first_name: "Ronaldo", last_name: "Chura" },
      work_order: null,
    },
  ],
}));

vi.mock("@/hooks/useEmsData", () => ({
  useSocieties: () => ({ data: [{ society_id: "s1", name: "Ruizmier Pelaez S.R.L." }] }),
}));
// BUG 0828-185: Engagements.tsx pasó de useEngagements() a usePortfolioEngagements().
vi.mock("@/hooks/usePortfolioEngagements", () => ({
  usePortfolioEngagements: () => ({ data: engagementRows, isLoading: false }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partnerOptions: [{ value: "p1", label: "Marcelo" }],
    managerOptions: [{ value: "m1", label: "Ronaldo C" }],
  }),
}));

import Engagements from "@/pages/Engagements";

const wrap = () =>
  render(
    <MemoryRouter>
      <Engagements />
    </MemoryRouter>,
  );

/** Todo `key` alcanzable para ordenar: columnas + sus controles secundarios. */
const sortableKeys = (): string[] => {
  const out: string[] = [];
  for (const col of capturedProps.columns) {
    if (col.sortable) out.push(col.key);
    for (const sec of col.secondary ?? []) if (sec.sortable) out.push(sec.key);
  }
  return out;
};

/** Todo `filterKey` alcanzable desde alguna cabecera. */
const filterKeys = (): string[] => {
  const out: string[] = [];
  for (const col of capturedProps.columns) {
    if (col.filterKey) out.push(col.filterKey);
    for (const sec of col.secondary ?? []) if (sec.filterKey) out.push(sec.filterKey);
  }
  return out;
};

beforeEach(() => {
  for (const k of Object.keys(capturedProps)) delete capturedProps[k];
});

describe("Engagements — columnas agrupadas (bug 0722-158)", () => {
  it("pasa de 9 columnas a 7", () => {
    wrap();
    expect(capturedProps.columns).toHaveLength(7);
  });

  it("conserva los 9 ordenamientos originales", () => {
    wrap();
    expect(sortableKeys().sort()).toEqual(
      [
        "client.client_legal_name",
        "effective_state",
        "end_date",
        "engagement_code",
        "engagement_name",
        "manager.last_name",
        "partner.last_name",
        "society.name",
        "start_date",
      ].sort(),
    );
  });

  it("conserva los 4 filtros originales", () => {
    wrap();
    expect(filterKeys().sort()).toEqual(
      ["effective_state", "manager_id", "partner_id", "society_id"].sort(),
    );
  });

  it("Socio y Gerente siguen siendo columnas propias, cada una con su filtro", () => {
    wrap();
    const socio = capturedProps.columns.find((c: any) => c.key === "partner.last_name");
    const gerente = capturedProps.columns.find((c: any) => c.key === "manager.last_name");
    expect(socio.filterKey).toBe("partner_id");
    expect(gerente.filterKey).toBe("manager_id");
    // Con cabecera propia el nombre suelto basta: nada de chip etiquetado aqui.
    expect(socio.secondary).toBeUndefined();
    expect(gerente.secondary).toBeUndefined();
  });

  it("«Cliente» usa `secondary` para no perder el orden ni el filtro de Sociedad", () => {
    // Esta es la fusion que justifica haber extendido DataTable: sin `secondary`,
    // Sociedad habria perdido su filtro al entrar en la columna de Cliente.
    wrap();
    const cliente = capturedProps.columns.find((c: any) => c.key === "client.client_legal_name");
    const sociedad = cliente.secondary.find((sec: any) => sec.key === "society.name");
    expect(sociedad.sortable).toBe(true);
    expect(sociedad.filterKey).toBe("society_id");
  });

  it("«Encargo» muestra nombre y codigo en la misma celda", () => {
    wrap();
    const encargo = capturedProps.columns.find((c: any) => c.key === "engagement_name");
    const { container } = render(<>{encargo.render(engagementRows[0])}</>);
    expect(container.textContent).toContain("Prueba Encargo Reunion");
    expect(container.textContent).toContain("2027.111.027");
  });

  it("Inicio y Fin siguen siendo columnas propias, cada una con su formato", () => {
    wrap();
    const inicio = capturedProps.columns.find((c: any) => c.key === "start_date");
    const fin = capturedProps.columns.find((c: any) => c.key === "end_date");
    expect(inicio.render(engagementRows[0])).toBe("18/08/2026");
    expect(fin.render(engagementRows[0])).toBe("31/08/2026");
    expect(inicio.render({ ...engagementRows[0], start_date: null })).toBe("-");
  });

  it("Socio y Gerente muestran el nombre corto, con fallback a nombre + apellido", () => {
    wrap();
    const socio = capturedProps.columns.find((c: any) => c.key === "partner.last_name");
    const gerente = capturedProps.columns.find((c: any) => c.key === "manager.last_name");
    expect(socio.render(engagementRows[0])).toBe("Marcelo");
    expect(gerente.render(engagementRows[0])).toBe("Ronaldo C");
    expect(socio.render({ ...engagementRows[0], partner: null })).toBe("-");
  });
});
