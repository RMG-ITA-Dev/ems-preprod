import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// REGRESION 2026-09-16 — ClientEdit no tenia rama de "no encontrado".
//
// `const client = clients?.find(c => c.client_id === id)` devuelve `undefined` para cualquier
// id que no este en la lista, y ClientForm lee `isEdit = !!client`. Sin guard, /clients/:id se
// volvia un formulario de ALTA: `canSave` es `!isEdit || can("client.update")`, o sea `true`
// cuando no hay cliente, y el submit caia en `createMutation`. Eso creaba un cliente desde una
// ruta que solo exige `client.read`, salteando el `client.create` que si gatea /clients/new.
//
// Se llega tecleando cualquier uuid, y tambien desde un aviso de `client.updated` /
// `client.deactivated` cuando la policy "clients read" no reconoce la fila.
//
// La rama es la misma que EngagementEdit.tsx tiene desde el BUG 0828-185.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: mockId }) };
});

let mockId = "no-existe";
let mockClients: Array<{ client_id: string }> | undefined = [];
let mockLoading = false;
vi.mock("@/hooks/useEmsData", () => ({
  useClientsFull: () => ({ data: mockClients, isLoading: mockLoading }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const },
    allowNextNavigation: vi.fn(),
  }),
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({ LeavePageDialog: () => null }));
vi.mock("@/components/clients/ClientEngagementsTable", () => ({
  ClientEngagementsTable: () => <div data-testid="engagements-table" />,
}));

// El doble del formulario expone lo unico que importa aca: si lo recibio o no, y en que modo
// habria quedado. Montar el ClientForm real arrastraria supabase y los catalogos.
vi.mock("@/components/forms/ClientForm", () => ({
  ClientForm: ({ client }: any) => (
    <div data-testid="client-form" data-mode={client ? "edit" : "create"} />
  ),
}));

import ClientEdit from "../ClientEdit";

function wrap() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ClientEdit />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ClientEdit — un id fuera de la lista no es un alta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockId = "no-existe";
    mockClients = [];
    mockLoading = false;
  });

  it("muestra el aviso y NO monta el formulario cuando el cliente no esta en la lista", () => {
    wrap();
    expect(screen.getByText("client.unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("client-form")).not.toBeInTheDocument();
  });

  it("nunca monta el formulario en modo creacion sobre /clients/:id", () => {
    // El corazon de la regresion: sin el guard, este mismo render daba
    // data-mode="create" y con boton de guardar habilitado.
    wrap();
    expect(screen.queryByTestId("client-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("engagements-table")).not.toBeInTheDocument();
  });

  it("ofrece volver al listado en vez de dejar la pantalla sin salida", () => {
    wrap();
    screen.getByText("common.cancel").click();
    expect(mockNavigate).toHaveBeenCalledWith("/clients");
  });

  it("con el cliente en la lista monta el formulario en modo edicion, como siempre", () => {
    mockId = "cli-1";
    mockClients = [{ client_id: "cli-1" }];
    wrap();
    expect(screen.getByTestId("client-form")).toHaveAttribute("data-mode", "edit");
    expect(screen.queryByText("client.unavailable")).not.toBeInTheDocument();
  });

  it("mientras carga no decide nada: ni aviso ni formulario", () => {
    // La lista todavia no llego, asi que `client` es undefined por una razon distinta.
    // Declararlo "no disponible" ahi seria un parpadeo rojo en cada navegacion.
    mockClients = undefined;
    mockLoading = true;
    wrap();
    expect(screen.queryByText("client.unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("client-form")).not.toBeInTheDocument();
  });
});
