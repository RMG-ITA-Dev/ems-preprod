// 1028-211 Fase 2: botón para activar o desactivar un cliente. Solo con client.activate (Cobranzas,
// Gerente de Contabilidad y admin); pide confirmación y llama a la RPC set_client_active.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

let canActivate = true;
let roleKey = "admin";
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: (perm: string) => perm === "client.activate" && canActivate, roleKey }),
}));

const mutate = vi.fn();
vi.mock("@/hooks/mutations", () => ({
  useSetClientActive: () => ({ mutate, isPending: false }),
}));

import { ClientActivationButton } from "@/components/clients/ClientActivationButton";

beforeEach(() => {
  vi.clearAllMocks();
  canActivate = true;
  roleKey = "admin";
});

describe("ClientActivationButton (1028-211)", () => {
  it("sin client.activate no se muestra", () => {
    canActivate = false;
    const { container } = render(<ClientActivationButton clientId="c-1" isActive={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("activa un cliente inactivo después de confirmar", async () => {
    const user = userEvent.setup();
    render(<ClientActivationButton clientId="c-1" isActive={false} />);
    await user.click(screen.getByRole("button", { name: "client.activate" }));
    expect(screen.getByText("client.activateConfirmTitle")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole("button", { name: "client.activate" }).at(-1)!);
    expect(mutate).toHaveBeenCalledWith({ clientId: "c-1", active: true });
  });

  it("Cobranzas y Contabilidad activan, pero no ven Desactivar (solo admin)", () => {
    for (const role of ["collections_analyst", "accounting_manager"]) {
      roleKey = role;
      const { container, unmount } = render(<ClientActivationButton clientId="c-1" isActive />);
      expect(container).toBeEmptyDOMElement();
      unmount();
      render(<ClientActivationButton clientId="c-1" isActive={false} />);
      expect(screen.getByRole("button", { name: "client.activate" })).toBeInTheDocument();
      cleanup();
    }
  });

  it("en la ficha, admin desactiva un cliente activo después de confirmar", async () => {
    const user = userEvent.setup();
    render(<ClientActivationButton clientId="c-1" isActive />);
    await user.click(screen.getByRole("button", { name: "client.deactivate" }));
    expect(screen.getByText("client.deactivateConfirmDescription")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "client.deactivate" }).at(-1)!);
    expect(mutate).toHaveBeenCalledWith({ clientId: "c-1", active: false });
  });

  it("en la fila de la lista solo ofrece activar", () => {
    const { container, rerender } = render(<ClientActivationButton clientId="c-1" isActive variant="compact" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ClientActivationButton clientId="c-1" isActive={false} variant="compact" />);
    expect(screen.getByRole("button", { name: "client.activateShort" })).toBeInTheDocument();
  });

  it("el clic en la fila no navega a la ficha", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <ClientActivationButton clientId="c-1" isActive={false} variant="compact" />
      </div>,
    );
    await user.click(screen.getByRole("button", { name: "client.activateShort" }));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
