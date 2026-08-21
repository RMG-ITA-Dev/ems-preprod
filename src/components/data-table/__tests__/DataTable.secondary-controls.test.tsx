import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataTable, type Column } from "@/components/data-table/DataTable";

// Bug 0722-158 (extension a Encargos): `Column.secondary` permite apilar
// ordenamientos y filtros extra bajo el label, para fusionar columnas sin perder
// controles. Es aditivo: una columna sin `secondary` debe renderizarse igual que
// antes. Eso ultimo importa porque DataTable alimenta 10 pantallas.

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
  nombre: string;
  codigo: string;
  socio_id: string;
  socio: string;
};

const rows: Row[] = [
  { id: "1", nombre: "Zeta", codigo: "AAA-1", socio_id: "p1", socio: "Marcelo" },
  { id: "2", nombre: "Alfa", codigo: "ZZZ-9", socio_id: "p2", socio: "Neil" },
];

const columnsConSecondary: Column<Row>[] = [
  {
    key: "nombre",
    label: "Encargo",
    sortable: true,
    secondary: [
      { key: "codigo", label: "Codigo", sortable: true },
      { key: "socio", label: "Socio", sortable: true, filterKey: "socio_id" },
    ],
    render: (row) => <span>{String(row.nombre)}</span>,
  },
];

const columnsSinSecondary: Column<Row>[] = [
  { key: "nombre", label: "Encargo", sortable: true, render: (row) => <span>{String(row.nombre)}</span> },
];

const renderTable = (columns: Column<Row>[]) =>
  render(
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(row) => String(row.id)}
      filters={[
        { key: "socio_id", label: "Socio", options: [{ value: "p1", label: "Marcelo" }, { value: "p2", label: "Neil" }] },
      ]}
    />,
  );

const header = () => within(screen.getAllByRole("rowgroup")[0]).getAllByRole("columnheader")[0];
const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

describe("DataTable — Column.secondary (bug 0722-158)", () => {
  it("renderiza los labels secundarios bajo el principal", () => {
    renderTable(columnsConSecondary);
    expect(within(header()).getByText("Encargo")).toBeInTheDocument();
    expect(within(header()).getByText("Codigo")).toBeInTheDocument();
    expect(within(header()).getByText("Socio")).toBeInTheDocument();
  });

  it("un ordenamiento secundario ordena de verdad", async () => {
    const user = userEvent.setup();
    renderTable(columnsConSecondary);
    expect(bodyRows()[0]).toHaveTextContent("Zeta");

    await user.click(within(header()).getByText("Codigo"));

    // AAA-1 (Zeta) < ZZZ-9 (Alfa): ordenar por codigo asc deja Zeta primero...
    expect(bodyRows()[0]).toHaveTextContent("Zeta");
    await user.click(within(header()).getByText("Codigo")); // desc
    expect(bodyRows()[0]).toHaveTextContent("Alfa");
  });

  it("un filtro secundario filtra de verdad", async () => {
    const user = userEvent.setup();
    renderTable(columnsConSecondary);
    expect(bodyRows()).toHaveLength(2);

    await user.click(within(header()).getAllByRole("button")[0]);
    // El Select de "filas por pagina" tambien es un combobox: acotar al popover.
    const popover = await screen.findByRole("dialog");
    await user.click(within(popover).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Neil" }));

    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent("Alfa");
  });

  it("sin `secondary` la cabecera no gana controles: los 9 consumidores existentes no cambian", () => {
    renderTable(columnsSinSecondary);
    expect(within(header()).getByText("Encargo")).toBeInTheDocument();
    expect(within(header()).queryByText("Codigo")).toBeNull();
    expect(within(header()).queryAllByRole("button")).toHaveLength(0);
  });
});
