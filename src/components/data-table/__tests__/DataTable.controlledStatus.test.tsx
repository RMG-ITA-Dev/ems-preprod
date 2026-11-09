import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useState } from "react";

import { DataTable, type Column } from "@/components/data-table/DataTable";

// 1105-219 (review Codex): modo controlado opcional del filtro de estado
// (`statusFilterValue` + `onStatusFilterChange`). Una página puede ofrecer el mismo filtro
// fuera de la cabecera (Select móvil) sin un segundo estado, y la tabla vuelve a la página 1
// cuando el valor cambia desde afuera, igual que con su embudo.

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  Element.prototype.scrollIntoView = vi.fn();
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

type Row = Record<string, unknown> & { id: string; name: string; effective_state: string };

// 25 filas en estado 4 (dos páginas de 20) + 2 en estado 7.
const rows: Row[] = [
  ...Array.from({ length: 25 }, (_, i) => ({ id: `a${i}`, name: `Aprobado ${i}`, effective_state: "4" })),
  { id: "f1", name: "Finalizado 1", effective_state: "7" },
  { id: "f2", name: "Finalizado 2", effective_state: "7" },
];

const columns: Column<Row>[] = [
  { key: "name", label: "Encargo", filterKey: "effective_state", render: (row) => <span>{row.name}</span> },
];

const statusFilter = {
  key: "effective_state",
  options: [
    { value: "4", label: "Aprobado" },
    { value: "7", label: "Finalizado" },
  ],
};

function Controlled({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("all");
  return (
    <>
      {/* Simula el Select móvil de la página: cambia el valor desde fuera de la tabla. */}
      <button type="button" onClick={() => setValue("7")}>externo-finalizado</button>
      <span data-testid="valor">{value}</span>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        statusFilter={statusFilter}
        statusFilterValue={value}
        onStatusFilterChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    </>
  );
}

const nextPageButton = () => {
  const buttons = screen.getAllByRole("button");
  return buttons[buttons.length - 1];
};

describe("DataTable — filtro de estado controlado (1105-219)", () => {
  it("usa el valor controlado para filtrar", () => {
    render(<Controlled />);
    expect(screen.getByText("Aprobado 0")).toBeInTheDocument();
    fireEvent.click(screen.getByText("externo-finalizado"));
    expect(screen.getByText("Finalizado 1")).toBeInTheDocument();
    expect(screen.queryByText("Aprobado 0")).toBeNull();
  });

  it("un cambio externo vuelve a la página 1 (no queda «sin resultados» en la página 2)", () => {
    render(<Controlled />);
    fireEvent.click(nextPageButton());
    expect(screen.getByText("Aprobado 20")).toBeInTheDocument();

    fireEvent.click(screen.getByText("externo-finalizado"));

    expect(screen.getByText("Finalizado 1")).toBeInTheDocument();
    expect(screen.getByText("Finalizado 2")).toBeInTheDocument();
    expect(screen.queryByText("common.noResults")).toBeNull();
  });

  it("sin las props nuevas sigue funcionando con su estado interno", () => {
    render(<DataTable data={rows} columns={columns} getRowId={(r) => r.id} statusFilter={statusFilter} />);
    // Página 1 de 2 sin filtro: las 20 primeras, sin las finalizadas.
    expect(screen.getByText("Aprobado 0")).toBeInTheDocument();
    expect(screen.queryByText("Finalizado 1")).toBeNull();
    fireEvent.click(nextPageButton());
    expect(screen.getByText("Finalizado 1")).toBeInTheDocument();
  });

  it("el embudo de la cabecera avisa el cambio a la página (mismo estado)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled onChange={onChange} />);
    // El embudo es el botón dentro de la cabecera de la columna.
    const header = screen.getByRole("columnheader");
    await user.click(header.querySelector("button")!);
    // Acotar al popover: la paginación tiene su propio combobox (filas por página).
    await user.click(within(await screen.findByRole("dialog")).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Finalizado" }));
    expect(onChange).toHaveBeenCalledWith("7");
    expect(screen.getByTestId("valor")).toHaveTextContent("7");
  });
});
