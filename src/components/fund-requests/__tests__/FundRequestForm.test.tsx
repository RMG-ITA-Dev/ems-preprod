import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import { FundRequestForm } from "../FundRequestForm";
import type { FundRequestFormValues } from "../FundRequestForm";

// ── Helpers ───────────────────────────────────────────────────────────────────

const baseValues: FundRequestFormValues = {
  total_requested_amount: 0,
  currency: "BOB",
  purpose: "",
  due_back_date: "",
  allocations: [],
};

// `hideAllocations` evita montar WorkOrderAllocationEditor (que consulta las OTs
// seleccionables). El espejo "total -> unica asignacion" vive en el onChange de
// ESTE componente, asi que se sigue ejerciendo igual. NumericInput NO se mockea:
// el punto del test es el comportamiento real del input.
function renderForm(values: Partial<FundRequestFormValues> = {}) {
  const onChange = vi.fn();
  const { container } = render(
    <FundRequestForm
      values={{ ...baseValues, ...values }}
      onChange={onChange}
      hideAllocations
    />,
  );
  const input = container.querySelector("#fr-amount") as HTMLInputElement;
  return { onChange, input };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FundRequestForm — montos decimales (0722-161)", () => {
  it("acepta un monto con decimales tecleado con coma", () => {
    const { onChange, input } = renderForm();

    fireEvent.change(input, { target: { value: "1250,75" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ total_requested_amount: 1250.75 }),
    );
  });

  it("acepta un monto con decimales tecleado con punto", () => {
    const { onChange, input } = renderForm();

    fireEvent.change(input, { target: { value: "1250.75" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ total_requested_amount: 1250.75 }),
    );
  });

  it("con una sola OT, refleja los centavos en su asignacion", () => {
    const { onChange, input } = renderForm({
      allocations: [{ wo_id: "wo-1", allocated_amount: 0 }],
    });

    fireEvent.change(input, { target: { value: "1250,75" } });

    expect(onChange).toHaveBeenCalledWith({
      total_requested_amount: 1250.75,
      allocations: [{ wo_id: "wo-1", allocated_amount: 1250.75 }],
    });
  });

  it("no toca las asignaciones cuando hay mas de una OT", () => {
    const { onChange, input } = renderForm({
      allocations: [
        { wo_id: "wo-1", allocated_amount: 100 },
        { wo_id: "wo-2", allocated_amount: 200 },
      ],
    });

    fireEvent.change(input, { target: { value: "1250,75" } });

    expect(onChange).toHaveBeenCalledWith({ total_requested_amount: 1250.75 });
  });

  it("muestra el valor precargado con el separador del idioma activo", () => {
    const { input } = renderForm({ total_requested_amount: 1250.75 });

    // locale es -> coma
    expect(input.value).toBe("1250,75");
  });

  it("mantiene el campo editable cuando el valor precargado ya trae centavos", () => {
    // Regresion del sintoma original: con decimals={0} el patron era /^-?\d*$/,
    // asi que un valor con centavos hacia fallar TODA tecla y el campo quedaba
    // muerto (ni Backspace funcionaba).
    const { onChange, input } = renderForm({ total_requested_amount: 1234.56 });

    fireEvent.change(input, { target: { value: "1234,5" } });

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ total_requested_amount: 1234.5 }),
    );
  });
});
