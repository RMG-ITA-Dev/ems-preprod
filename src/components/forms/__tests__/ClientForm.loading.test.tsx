// ClientForm en edición: la ficha se carga UNA vez, con el cliente y sus contactos.
//
// Los contactos llegan en otra consulta, casi siempre después del cliente. Primero el formulario
// se reseteaba dos veces y el segundo reset borraba lo tecleado entre medio; el arreglo de eso
// (no pisar un formulario con cambios) abrió el caso contrario: si se tecleaba antes de la
// primera carga, la ficha guardada no aparecía nunca (revisión de Greptile, 2026-10-22). Ahora
// los campos están deshabilitados hasta esa primera carga.

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useIndustries: () => ({ data: [] }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateClient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateClient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteClient: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveClientContacts: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveClientWithContacts: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true }),
}));

let contactsState: { data: unknown[] | undefined; isFetched: boolean } = { data: undefined, isFetched: false };
vi.mock("@/hooks/useClientContacts", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useClientContacts")>();
  return { ...real, useClientContacts: () => contactsState };
});

import { ClientForm } from "@/components/forms/ClientForm";
import type { ClientFull } from "@/hooks/useEmsData";

const client = {
  client_id: "c-1",
  client_legal_name: "Cliente Uno",
  unique_tax_id: "123456",
  industry_id: null,
  address: "Calle 1",
  is_active: true,
} as unknown as ClientFull;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const tree = () => (
  <QueryClientProvider client={qc}>
    <MemoryRouter>
      <ClientForm client={client} />
    </MemoryRouter>
  </QueryClientProvider>
);
const renderForm = () => render(tree());

// El Switch de Radix mide su tamaño con ResizeObserver, que jsdom no trae.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

beforeEach(() => {
  contactsState = { data: undefined, isFetched: false };
});

describe("ClientForm — carga de la ficha en edición", () => {
  it("mientras los contactos no llegaron, los campos no se pueden editar", () => {
    renderForm();
    const nombre = document.querySelector('input[name="client_legal_name"]') as HTMLInputElement;
    expect(nombre).toBeTruthy();
    expect(nombre).toBeDisabled();
  });

  it("cuando llegan, la ficha aparece completa y se puede editar", () => {
    const { rerender } = renderForm();
    contactsState = {
      isFetched: true,
      data: [
        { contact_id: "g", client_id: "c-1", contact_type: "general", full_name: "Ana", email: "ana@x.com", phone: null, is_active: true },
        { contact_id: "k", client_id: "c-1", contact_type: "cobranza", full_name: "Luis", email: "luis@x.com", phone: null, is_active: true },
      ],
    };
    rerender(tree());
    const nombre = document.querySelector('input[name="client_legal_name"]') as HTMLInputElement;
    expect(nombre).not.toBeDisabled();
    expect(nombre.value).toBe("Cliente Uno");
    expect(screen.getByDisplayValue("luis@x.com")).toBeInTheDocument();
  });
});
