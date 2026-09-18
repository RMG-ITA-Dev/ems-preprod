import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

import { DataTable, type Column } from "@/components/data-table/DataTable";

// dash_socio (plan_v2.md §5.4): `initialFilters` es una prop aditiva y opcional en
// DataTable que siembra el estado inicial de statusValue/filterValues a partir de
// query params (deep-links desde PartnerTab: /engagements?state=4, ?manager=<id>).
// Sin la prop, el comportamiento debe ser idéntico al de hoy ("all" / {}).

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;

  if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (typeof Element !== "undefined") Element.prototype.scrollIntoView = vi.fn();

  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

type Row = Record<string, unknown> & {
  id: string;
  name: string;
  effective_state: string;
  manager_id: string;
};

const rows: Row[] = [
  { id: "1", name: "Encargo Norte", effective_state: "4", manager_id: "m1" },
  { id: "2", name: "Encargo Sur", effective_state: "5", manager_id: "m2" },
  { id: "3", name: "Encargo Este", effective_state: "4", manager_id: "m2" },
];

const columns: Column<Row>[] = [
  { key: "name", label: "Encargo", render: (row) => <span>{row.name}</span> },
];

const statusFilter = {
  key: "effective_state",
  options: [
    { value: "4", label: "Aprobado" },
    { value: "5", label: "Aprobado en emergencia" },
  ],
};

const filters = [
  {
    key: "manager_id",
    label: "Gerente",
    options: [
      { value: "m1", label: "Gerente 1" },
      { value: "m2", label: "Gerente 2" },
    ],
  },
];

const renderTable = (initialFilters?: Record<string, string>) =>
  render(
    <DataTable
      data={rows}
      columns={columns}
      statusFilter={statusFilter}
      filters={filters}
      getRowId={(row) => row.id}
      initialFilters={initialFilters}
    />,
  );

describe("DataTable initialFilters (dash_socio)", () => {
  it("DT1: without initialFilters, initial state is 'all' / {} -- all rows render", () => {
    renderTable(undefined);

    expect(screen.getByText("Encargo Norte")).toBeInTheDocument();
    expect(screen.getByText("Encargo Sur")).toBeInTheDocument();
    expect(screen.getByText("Encargo Este")).toBeInTheDocument();
  });

  it("DT2: initialFilters seeds statusValue and filterValues -- only the matching row renders", () => {
    renderTable({ effective_state: "4", manager_id: "m1" });

    // effective_state=4 AND manager_id=m1 matches only "Encargo Norte".
    expect(screen.getByText("Encargo Norte")).toBeInTheDocument();
    expect(screen.queryByText("Encargo Sur")).not.toBeInTheDocument();
    expect(screen.queryByText("Encargo Este")).not.toBeInTheDocument();
  });

  it("DT3: empty values in initialFilters are ignored -- behaves like no filter applied", () => {
    renderTable({ effective_state: "", manager_id: "" });

    expect(screen.getByText("Encargo Norte")).toBeInTheDocument();
    expect(screen.getByText("Encargo Sur")).toBeInTheDocument();
    expect(screen.getByText("Encargo Este")).toBeInTheDocument();
  });
});
