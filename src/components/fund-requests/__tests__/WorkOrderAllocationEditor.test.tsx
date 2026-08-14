import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

// Radix Select requiere PointerEvent APIs que jsdom no tiene
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: { children?: React.ReactNode; value?: string }) => (
    <div data-testid="select" data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value?: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

// OTs devueltas por la vista `fund_request_selectable_work_orders`. Incluye las
// monedas que el módulo NO modela (USDT) para ejercer el filtro de 0722-164.
const woBob1 = {
  wo_id: "wo-1",
  currency: "BOB",
  approval_status: "Approved",
  engagement: {
    engagement_code: "ENG-001",
    engagement_name: "Encargo Uno",
    manager_id: "mgr-1",
    manager: { first_name: "Ana", last_name: "Perez", short_name: "A. Perez" },
  },
};
const woBob2 = {
  wo_id: "wo-2",
  currency: "BOB",
  approval_status: "Approved",
  engagement: {
    engagement_code: "ENG-002",
    engagement_name: "Encargo Dos",
    manager_id: "mgr-2",
    manager: { first_name: "Luis", last_name: "Gomez", short_name: "L. Gomez" },
  },
};
const woUsd = {
  wo_id: "wo-3",
  currency: "USD",
  approval_status: "Approved",
  engagement: {
    engagement_code: "ENG-003",
    engagement_name: "Encargo Tres",
    manager_id: "mgr-3",
    manager: { first_name: "Sofia", last_name: "Rojas", short_name: "S. Rojas" },
  },
};
const woUsdt = {
  wo_id: "wo-4",
  currency: "USDT",
  approval_status: "Approved",
  engagement: {
    engagement_code: "ENG-004",
    engagement_name: "Encargo Cuatro",
    manager_id: "mgr-4",
    manager: { first_name: "Mario", last_name: "Vega", short_name: "M. Vega" },
  },
};
const woUsdNoManager = {
  wo_id: "wo-5",
  currency: "USD",
  approval_status: "Approved",
  engagement: {
    engagement_code: "ENG-005",
    engagement_name: "Encargo Cinco",
    manager_id: null,
    manager: null,
  },
};

// Mutable: cada test define qué devuelve la vista antes de renderizar.
let selectableWorkOrders: unknown[] = [];

vi.mock("@/hooks/useFundRequests", () => ({
  useSelectableWorkOrders: () => ({ data: selectableWorkOrders }),
}));

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import { WorkOrderAllocationEditor } from "../WorkOrderAllocationEditor";
import type { AllocationInput } from "@/hooks/mutations/useFundRequestMutations";

// ── Helpers ───────────────────────────────────────────────────────────────────

// Por defecto la vista devuelve las dos OTs en BOB (escenario de los tests de
// decimales). Cada test de moneda sobreescribe `selectableWorkOrders`.
beforeEach(() => {
  selectableWorkOrders = [woBob1, woBob2];
});

function renderEditor(totalRequested: number, allocations: AllocationInput[]) {
  const onChange = vi.fn();
  const { container } = render(
    <WorkOrderAllocationEditor
      currency="BOB"
      totalRequested={totalRequested}
      allocations={allocations}
      onChange={onChange}
    />,
  );
  // Los unicos <input> del arbol son los NumericInput de monto (el Select esta mockeado)
  const amountInputs = Array.from(container.querySelectorAll("input")) as HTMLInputElement[];
  return { onChange, amountInputs };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WorkOrderAllocationEditor — montos decimales (0722-161)", () => {
  it("acepta centavos en el monto de una OT tecleados con coma", () => {
    const { onChange, amountInputs } = renderEditor(1250.75, [
      { wo_id: "wo-1", allocated_amount: 0 },
    ]);

    fireEvent.change(amountInputs[0], { target: { value: "1250,75" } });

    expect(onChange).toHaveBeenCalledWith([{ wo_id: "wo-1", allocated_amount: 1250.75 }]);
  });

  it("acepta centavos tecleados con punto", () => {
    const { onChange, amountInputs } = renderEditor(1250.75, [
      { wo_id: "wo-1", allocated_amount: 0 },
    ]);

    fireEvent.change(amountInputs[0], { target: { value: "1250.75" } });

    expect(onChange).toHaveBeenCalledWith([{ wo_id: "wo-1", allocated_amount: 1250.75 }]);
  });

  it("muestra el total asignado con sus decimales", () => {
    // Antes: Math.round + maximumFractionDigits 0 mostraba "100" para 100,01
    renderEditor(100.01, [{ wo_id: "wo-1", allocated_amount: 100.01 }]);

    expect(screen.getByText("100,01")).toBeInTheDocument();
  });

  it("marca descuadre cuando la suma difiere en un centavo", () => {
    // Guarda del commit de tolerancia: con `Math.abs(diff) > 0.01` este caso
    // pasaba en el cliente y la RPC lo rechazaba con un error crudo.
    renderEditor(100, [
      { wo_id: "wo-1", allocated_amount: 50 },
      { wo_id: "wo-2", allocated_amount: 50.01 },
    ]);

    expect(screen.getByText(/fundRequest.overAllocated/)).toBeInTheDocument();
  });

  it("prellena el resto por distribuir redondeado al centavo", () => {
    // 100,3 - 50,2 = 50.099999999999994 en IEEE-754. Sin redondear, el input de 2
    // decimales muestra el valor largo y despues ignora cada tecla (no matchea su
    // patron), y ese ruido se guardaria en el NUMERIC.
    const onChange = vi.fn();
    render(
      <WorkOrderAllocationEditor
        currency="BOB"
        totalRequested={100.3}
        allocations={[{ wo_id: "wo-1", allocated_amount: 50.2 }]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /fundRequest.addAllocation/ }));

    expect(onChange).toHaveBeenCalledWith([
      { wo_id: "wo-1", allocated_amount: 50.2 },
      { wo_id: "", allocated_amount: 50.1 },
    ]);
  });

  it("no marca descuadre cuando los centavos cuadran exacto", () => {
    renderEditor(100.5, [
      { wo_id: "wo-1", allocated_amount: 50.25 },
      { wo_id: "wo-2", allocated_amount: 50.25 },
    ]);

    expect(screen.queryByText(/fundRequest.overAllocated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fundRequest.missingToAllocate/)).not.toBeInTheDocument();
  });
});

describe("WorkOrderAllocationEditor — OTs en dólares (0722-164)", () => {
  it("lista las OTs aprobadas en USD junto a las BOB", () => {
    // La solicitud es BOB; la OT en USD debe poder elegirse igual, porque el
    // monto asignado es el efectivo (BOB) y no el contrato de la OT.
    selectableWorkOrders = [woBob1, woUsd];
    renderEditor(1000, [{ wo_id: "", allocated_amount: 1000 }]);

    expect(screen.getByText(/ENG-003/)).toBeInTheDocument();
    expect(screen.getByText(/ENG-001/)).toBeInTheDocument();
  });

  it("no muestra el aviso de 'sin OTs' cuando solo hay OTs en USD", () => {
    selectableWorkOrders = [woUsd];
    renderEditor(0, []);

    expect(screen.queryByText(/fundRequest.noApprovedWorkOrders/)).not.toBeInTheDocument();
    // El boton "Agregar OT" queda habilitado: hay al menos una OT usable.
    expect(screen.getByRole("button", { name: /fundRequest.addAllocation/ })).toBeEnabled();
  });

  it("muestra el codigo de moneda de la OT en la opcion", () => {
    // Evita leer el monto (que va en BOB) como si fuera de la moneda de la OT.
    selectableWorkOrders = [woUsd];
    renderEditor(1000, [{ wo_id: "wo-3", allocated_amount: 1000 }]);

    expect(screen.getByText(/ENG-003.*USD/)).toBeInTheDocument();
    // El encabezado del monto sigue anunciando la moneda de la SOLICITUD.
    expect(screen.getByText(/fundRequest\.amount \(BOB\)/)).toBeInTheDocument();
  });

  it("excluye las OTs en USDT (moneda no modelada por fondos)", () => {
    selectableWorkOrders = [woBob1, woUsdt];
    renderEditor(1000, [{ wo_id: "", allocated_amount: 1000 }]);

    expect(screen.queryByText(/ENG-004/)).not.toBeInTheDocument();
    expect(screen.getByText(/ENG-001/)).toBeInTheDocument();
  });

  it("sigue excluyendo las OTs sin gerente, sin importar la moneda", () => {
    // El aprobador se deriva del gerente del encargo: sin gerente la OT no sirve,
    // y quitar el filtro de moneda no debe arrastrar tambien este filtro.
    selectableWorkOrders = [woUsd, woUsdNoManager];
    renderEditor(1000, [{ wo_id: "", allocated_amount: 1000 }]);

    expect(screen.queryByText(/ENG-005/)).not.toBeInTheDocument();
    expect(screen.getByText(/ENG-003/)).toBeInTheDocument();
    expect(screen.getByText(/fundRequest.otsBlockedNoManager/)).toBeInTheDocument();
  });
});
