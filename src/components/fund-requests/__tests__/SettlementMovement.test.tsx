import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) =>
      opts && "amount" in opts ? `${k}|${opts.amount}|${opts.name}` : k,
    i18n: { language: "es" },
  }),
}));

// Radix AlertDialog usa focus traps que jsdom no soporta (mismo mock que DisbursementDialog).
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
    <button type="button" data-testid="confirm-movement" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

// ── Imports under test (after all vi.mock hoists) ──────────────────────────────
import { ConfirmSettlementDialog } from "../ConfirmSettlementDialog";
import { SettlementMovementCard } from "../SettlementMovementCard";
import { FundRequestProgress } from "../FundRequestProgress";

describe("ConfirmSettlementDialog — doble confirmación (N6)", () => {
  it("no confirma hasta marcar el acuse, y entrega la referencia", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmSettlementDialog
        open
        onOpenChange={vi.fn()}
        kind="reimbursement"
        amount={350}
        currency="BOB"
        employeeName="Ana P"
        onConfirm={onConfirm}
      />,
    );

    const confirm = screen.getByTestId("confirm-movement");
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText("fundRequest.movement.reference"), {
      target: { value: "CH-123" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm).not.toBeDisabled();

    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith({ reference: "CH-123", notes: "" });
  });
});

describe("SettlementMovementCard", () => {
  const pending = { kind: "reimbursement" as const, amount: 350, pending: true, confirmedAt: null };

  it("Contabilidad ve el pendiente y el botón para confirmar", () => {
    const onConfirmClick = vi.fn();
    render(
      <SettlementMovementCard
        movement={pending}
        currency="BOB"
        employeeName="Ana P"
        isRequester={false}
        canConfirm
        onConfirmClick={onConfirmClick}
      />,
    );

    expect(screen.getByText("fundRequest.movement.pendingBadge.reimbursement")).toBeInTheDocument();
    expect(screen.getByText(/fundRequest\.movement\.pendingText\.staff\.reimbursement/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("fundRequest.movement.confirmAction.reimbursement"));
    expect(onConfirmClick).toHaveBeenCalled();
  });

  it("el solicitante ve el pendiente redactado para él y sin botón", () => {
    render(
      <SettlementMovementCard
        movement={pending}
        currency="BOB"
        employeeName="Ana P"
        isRequester
        canConfirm={false}
        onConfirmClick={vi.fn()}
      />,
    );

    expect(screen.getByText(/fundRequest\.movement\.pendingText\.requester\.reimbursement/)).toBeInTheDocument();
    expect(screen.queryByText("fundRequest.movement.confirmAction.reimbursement")).toBeNull();
  });

  it("confirmado: muestra fecha, hora, quién y la referencia", () => {
    render(
      <SettlementMovementCard
        movement={{ kind: "return", amount: 120, pending: false, confirmedAt: new Date(2026, 9, 8, 14, 32).toISOString() }}
        currency="BOB"
        employeeName="Ana P"
        confirmedByName="Luis C"
        reference="REC-9"
        isRequester={false}
        canConfirm
        onConfirmClick={vi.fn()}
      />,
    );

    expect(screen.getByText("fundRequest.movement.doneBadge.return")).toBeInTheDocument();
    expect(screen.getByText(/08\/10\/2026 14:32/)).toHaveTextContent("REC-9");
    expect(screen.queryByText("fundRequest.movement.confirmAction.return")).toBeNull();
  });
});

describe("FundRequestProgress", () => {
  it("marca como hechos los pasos anteriores y resalta el actual", () => {
    render(<FundRequestProgress status="fondos_entregados" />);
    expect(screen.getByText("fundRequest.progress.steps.disbursed").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("no se muestra para borradores ni canceladas", () => {
    const { container, rerender } = render(<FundRequestProgress status="borrador" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<FundRequestProgress status="cancelado" />);
    expect(container).toBeEmptyDOMElement();
  });
});
