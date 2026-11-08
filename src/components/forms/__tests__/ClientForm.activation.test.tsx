// 1028-211 Fase 2: el estado inicial del alta depende de quién crea. Sin client.activate (gerentes,
// socios…) el switch "Activo" queda deshabilitado y apagado, con el aviso de que el cliente quedará
// pendiente; con el permiso (admin) queda habilitado y encendido. El backend lo fuerza igual
// (trg_clients_enforce_activation): esto es solo lo que ve el usuario.

import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

const stableIndustries: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useIndustries: () => ({ data: stableIndustries }),
}));

const mutateAsync = vi.fn();
vi.mock("@/hooks/mutations", () => ({
  useDeleteClient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveClientWithContacts: () => ({ mutateAsync, isPending: false }),
}));

let canActivate = false;
let canUpdate = true;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: (perm: string) => (perm === "client.activate" ? canActivate : perm === "client.update" ? canUpdate : true),
  }),
}));

const stableContacts = { data: [], isFetched: true };
vi.mock("@/hooks/useClientContacts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useClientContacts")>();
  return { ...real, useClientContacts: () => stableContacts };
});

import { ClientForm } from "@/components/forms/ClientForm";
import type { ClientFull } from "@/hooks/useEmsData";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  vi.clearAllMocks();
  canUpdate = true;
  mutateAsync.mockResolvedValue(undefined);
});

const renderNew = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ClientForm onSaveSuccess={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const input = (name: string) => document.querySelector(`[name="${name}"]`) as HTMLInputElement;

async function fillAndSave(user: ReturnType<typeof userEvent.setup>) {
  await user.type(input("client_legal_name"), "Cliente Nuevo");
  await user.type(input("tax_id"), "99001");
  await user.type(input("contact_general_name"), "Ana");
  await user.type(input("contact_general_email"), "ana@x.com");
  await user.type(input("contact_cobranza_name"), "Luis");
  await user.type(input("contact_cobranza_email"), "luis@x.com");
  await user.click(screen.getByRole("button", { name: "client.createClient" }));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
}

describe("ClientForm — estado inicial del alta (1028-211)", () => {
  it("sin client.activate: switch apagado y deshabilitado, aviso de pendiente y alta inactiva", async () => {
    canActivate = false;
    const user = userEvent.setup();
    renderNew();
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("client.pendingActivationHint")).toBeInTheDocument();

    await fillAndSave(user);
    expect(mutateAsync.mock.calls[0][0].client.is_active).toBe(false);
  });

  it("con client.activate: switch encendido y habilitado, alta activa", async () => {
    canActivate = true;
    const user = userEvent.setup();
    renderNew();
    const toggle = screen.getByRole("switch");
    expect(toggle).not.toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText("client.pendingActivationHint")).not.toBeInTheDocument();

    await fillAndSave(user);
    expect(mutateAsync.mock.calls[0][0].client.is_active).toBe(true);
  });
});

describe("ClientForm — ficha de solo lectura sin client.update (1028-211)", () => {
  const client = {
    client_id: "c-1",
    client_legal_name: "Cliente Pendiente",
    tax_id: "2346789",
    industry_id: null,
    address: "Calle 1",
    is_active: false,
  } as unknown as ClientFull;
  const renderEdit = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ClientForm client={client} compact onSaveSuccess={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it("Cobranzas/Contabilidad: campos y switch deshabilitados, aviso, sin Guardar y con Cancelar", () => {
    canUpdate = false;
    canActivate = true;
    renderEdit();
    expect(input("client_legal_name")).toBeDisabled();
    expect(input("address")).toBeDisabled();
    // El estado se cambia con el botón de la cabecera, no con un switch en la ficha.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("client.readOnlyNotice client.readOnlyActivateHint")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "common.saveChanges" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.cancel" })).not.toBeDisabled();
  });

  it("admin (client.update): la ficha se edita y no hay aviso", () => {
    canUpdate = true;
    canActivate = true;
    renderEdit();
    expect(input("client_legal_name")).not.toBeDisabled();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText(/client.readOnlyNotice/)).not.toBeInTheDocument();
  });
});
