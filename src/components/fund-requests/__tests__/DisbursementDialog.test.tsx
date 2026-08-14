import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts && "amount" in opts ? `${k}:${opts.amount}` : k,
    i18n: { language: "es" },
  }),
}));

// Radix AlertDialog usa focus traps que jsdom no soporta.
// AlertDialogAction tiene que ser un <button> real: handleConfirm recibe un
// React.MouseEvent y llama e.preventDefault() para bloquear el cierre.
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div role="dialog">{children}</div> : null,
  AlertDialogContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
  }: {
    children?: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    disabled?: boolean;
  }) => (
    <button type="button" data-testid="confirm-disburse" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import { DisbursementDialog } from "../DisbursementDialog";

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderDialog(requestedAmount: number) {
  const onConfirm = vi.fn();
  const { container } = render(
    <DisbursementDialog
      open
      onOpenChange={vi.fn()}
      requestedAmount={requestedAmount}
      currency="BOB"
      onConfirm={onConfirm}
    />,
  );
  return {
    onConfirm,
    input: container.querySelector("#disbursed-amount") as HTMLInputElement,
    confirm: screen.getByTestId("confirm-disburse"),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DisbursementDialog — montos decimales (0722-161)", () => {
  it("entrega un monto con centavos tecleado con coma", () => {
    const { onConfirm, input, confirm } = renderDialog(2000);

    fireEvent.change(input, { target: { value: "1250,75" } });
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({ amount: 1250.75, notes: "" });
  });

  it("entrega un monto con centavos tecleado con punto", () => {
    const { onConfirm, input, confirm } = renderDialog(2000);

    fireEvent.change(input, { target: { value: "1250.75" } });
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({ amount: 1250.75, notes: "" });
  });

  it("sigue bloqueando un monto que excede lo solicitado, aun por centavos", () => {
    const { onConfirm, input, confirm } = renderDialog(1250.5);

    fireEvent.change(input, { target: { value: "1250,75" } });
    fireEvent.click(confirm);

    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText("fundRequest.errors.disbursedAmountExceedsRequested"),
    ).toBeInTheDocument();
  });

  it("acepta un monto igual al solicitado con centavos", () => {
    const { onConfirm, input, confirm } = renderDialog(1250.75);

    fireEvent.change(input, { target: { value: "1250,75" } });
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith({ amount: 1250.75, notes: "" });
  });

  it("muestra el hint de lo solicitado con decimales, no redondeado", () => {
    // Antes: Math.round(1250.75) -> "1.251", contradiciendo el tope que
    // handleConfirm si aplica (rechaza cualquier cosa por encima de 1250,75).
    renderDialog(1250.75);

    expect(screen.getByText("fundRequest.requestedHint:1.250,75")).toBeInTheDocument();
  });
});
