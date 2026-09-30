import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimesheetReversalDialog } from "../TimesheetReversalDialog";

// Identity translation: t("some.key") renders literally as "some.key" (same convention as
// TimesheetApprovals.reversal.test.tsx).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// Review iteración 1, hallazgo #8: un cierre por ÉXITO cambia `open` directo desde el padre
// (onSuccess: closeDialog), sin pasar por onOpenChange -- antes eso dejaba la razón anterior
// pre-cargada, y el botón ya habilitado, la próxima vez que se abría el diálogo para OTRA fila.
describe("TimesheetReversalDialog", () => {
  it("clears the reason when the parent closes it directly (success path), not just via onOpenChange", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <TimesheetReversalDialog
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        isPending={false}
      />
    );

    const textarea = screen.getByPlaceholderText("approval.notesPlaceholder");
    await user.type(textarea, "motivo de la primera boleta");
    expect(screen.getByRole("button", { name: /requestReversal/ })).not.toBeDisabled();

    // El padre cierra por éxito cambiando `open` a false DIRECTO (no dispara onOpenChange).
    rerender(
      <TimesheetReversalDialog
        open={false}
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        isPending={false}
      />
    );

    // Se reabre para OTRA fila.
    rerender(
      <TimesheetReversalDialog
        open
        onOpenChange={() => {}}
        onConfirm={onConfirm}
        isPending={false}
      />
    );

    expect(screen.getByPlaceholderText("approval.notesPlaceholder")).toHaveValue("");
    expect(screen.getByRole("button", { name: /requestReversal/ })).toBeDisabled();
  });

  it("disables confirm until a non-blank reason is typed, and trims it on confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <TimesheetReversalDialog open onOpenChange={() => {}} onConfirm={onConfirm} isPending={false} />
    );

    const confirmButton = screen.getByRole("button", { name: /requestReversal/ });
    expect(confirmButton).toBeDisabled();

    const textarea = screen.getByPlaceholderText("approval.notesPlaceholder");
    await user.type(textarea, "   ");
    expect(confirmButton).toBeDisabled();

    await user.type(textarea, "razón real");
    expect(confirmButton).not.toBeDisabled();

    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledWith("razón real");
  });
});
