import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { format } from "date-fns";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  (Element.prototype as any).scrollIntoView = vi.fn();
});

import { RateFromDatePicker } from "../RateFromDatePicker";

// El día `n` del mes en curso, tal como lo pinta el calendario (un botón por día).
const dayButton = (n: number) =>
  screen.getAllByRole("gridcell").find((el) => el.textContent === String(n) && !el.className.includes("day-outside"))!;

describe("RateFromDatePicker (1028-214)", () => {
  it("RDP1: sin fecha dice 'Elegir fecha'; con fecha la muestra; compacto es solo el ícono con etiqueta", () => {
    const { rerender } = render(<RateFromDatePicker value={null} onPick={vi.fn()} testId="p" />);
    expect(screen.getByTestId("p")).toHaveTextContent("workOrders.paymentPlan.rateFromDatePick");
    expect(screen.getByTestId("p")).toHaveAttribute("aria-label", "workOrders.paymentPlan.rateFromDateAria");

    rerender(<RateFromDatePicker value="2026-10-09" onPick={vi.fn()} testId="p" />);
    expect(screen.getByTestId("p")).toHaveTextContent("09/10/2026");

    rerender(<RateFromDatePicker value="2026-10-09" onPick={vi.fn()} testId="p" compact />);
    expect(screen.getByTestId("p")).toHaveTextContent("");
    expect(screen.getByTestId("p")).toHaveAttribute("title", "workOrders.paymentPlan.rateFromDateAria");
  });

  it("RDP2: elegir un día devuelve yyyy-MM-dd en hora local y cierra el calendario", () => {
    const onPick = vi.fn();
    render(<RateFromDatePicker value={null} onPick={onPick} testId="p" />);
    fireEvent.click(screen.getByTestId("p"));

    fireEvent.click(dayButton(1));

    const now = new Date();
    expect(onPick).toHaveBeenCalledWith(format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd"));
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("RDP3: deshabilitado no abre, y los días futuros no se pueden elegir", () => {
    const { rerender } = render(<RateFromDatePicker value={null} onPick={vi.fn()} testId="p" disabled />);
    expect(screen.getByTestId("p")).toBeDisabled();

    const onPick = vi.fn();
    rerender(<RateFromDatePicker value={null} onPick={onPick} testId="p" />);
    fireEvent.click(screen.getByTestId("p"));
    // Pasar al mes siguiente: todos sus días son futuros.
    fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("name") === "next-month")!);
    fireEvent.click(dayButton(15));
    expect(onPick).not.toHaveBeenCalled();
  });
});
