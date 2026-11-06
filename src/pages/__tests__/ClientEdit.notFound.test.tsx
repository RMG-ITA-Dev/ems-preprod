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
let mockClients: Array<Record<string, unknown>> | undefined = [];
let mockLoading = false;
let mockError = false;
const mockRefetch = vi.fn();
vi.mock("@/hooks/useEmsData", () => ({
  useClientsFull: () => ({
    data: mockClients,
    isLoading: mockLoading,
    isError: mockError,
    refetch: mockRefetch,
  }),
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
// 1028-211: el botón de activación tiene sus propios tests (ClientActivationButton.test.tsx).
vi.mock("@/components/clients/ClientActivationButton", () => ({
  ClientActivationButton: () => null,
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
    mockError = false;
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

  it("1028-211: muestra quién activó el cliente y cuándo", () => {
    mockId = "cli-1";
    mockClients = [{
      client_id: "cli-1",
      is_active: true,
      activated_at: "2026-11-06T15:00:00Z",
      activated_by: { first_name: "Ana", last_name: "Pérez" },
    }];
    render(<ClientEdit />);
    expect(screen.getByText("client.activatedBy")).toBeInTheDocument();
    expect(screen.queryByText("client.pendingActivation")).not.toBeInTheDocument();
  });

  it("1028-211: pendiente (nunca activado) vs. inactivo (desactivado después)", () => {
    mockId = "cli-1";
    mockClients = [{ client_id: "cli-1", is_active: false }];
    const { unmount } = render(<ClientEdit />);
    expect(screen.getByText("client.pendingActivation")).toBeInTheDocument();
    unmount();
    mockClients = [{ client_id: "cli-1", is_active: false, deactivated_at: "2026-11-06T15:00:00Z", deactivated_by: null }];
    render(<ClientEdit />);
    expect(screen.getByText("status.inactive")).toBeInTheDocument();
    expect(screen.getByText("client.deactivatedOn")).toBeInTheDocument();
  });

  it("un error de carga NO es un cliente inexistente: avisa y ofrece reintentar", () => {
    // `useClientsFull()` hace `throw error`, asi que react-query deja `data` en undefined con
    // `isLoading` ya en false: identico a un id que no existe. Decirle "no esta disponible para
    // usted" seria una respuesta falsa sobre un cliente que existe.
    mockClients = undefined;
    mockError = true;
    mockId = "cli-1";
    wrap();
    expect(screen.getByText("client.loadError")).toBeInTheDocument();
    expect(screen.queryByText("client.unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("client-form")).not.toBeInTheDocument();

    screen.getByText("client.retry").click();
    expect(mockRefetch).toHaveBeenCalled();
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
