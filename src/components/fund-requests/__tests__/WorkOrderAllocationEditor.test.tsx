import React from "react";
import { describe, it, expect, vi } from "vitest";
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

vi.mock("@/hooks/useFundRequests", () => ({
  useSelectableWorkOrders: () => ({
    data: [
      {
        wo_id: "wo-1",
        currency: "BOB",
        approval_status: "Approved",
        engagement: {
          engagement_code: "ENG-001",
          engagement_name: "Encargo Uno",
          manager_id: "mgr-1",
          manager: { first_name: "Ana", last_name: "Perez", short_name: "A. Perez" },
        },
      },
      {
        wo_id: "wo-2",
        currency: "BOB",
        approval_status: "Approved",
        engagement: {
          engagement_code: "ENG-002",
          engagement_name: "Encargo Dos",
          manager_id: "mgr-2",
          manager: { first_name: "Luis", last_name: "Gomez", short_name: "L. Gomez" },
        },
      },
    ],
  }),
}));

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import { WorkOrderAllocationEditor } from "../WorkOrderAllocationEditor";
import type { AllocationInput } from "@/hooks/mutations/useFundRequestMutations";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

  it("no marca descuadre cuando los centavos cuadran exacto", () => {
    renderEditor(100.5, [
      { wo_id: "wo-1", allocated_amount: 50.25 },
      { wo_id: "wo-2", allocated_amount: 50.25 },
    ]);

    expect(screen.queryByText(/fundRequest.overAllocated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fundRequest.missingToAllocate/)).not.toBeInTheDocument();
  });
});
