import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

// FASE 5: el botón "Nuevo" se gatea por permiso (useAuthorization.can), y la
// creación por ruta (<PermissionRoute permission="client.create">). Ya no hay
// redirect in-page en ClientNew.
let mockCan: (perm: string) => boolean = () => false;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: mockCan, roleKey: null }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: [], isLoading: false }),
  useEngagements: () => ({ data: [], isLoading: false }),
  useIndustries: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/lib/fiscalYearDisplay", () => ({ formatFiscalYearEnd: () => "-" }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: ({ newButtonLabel }: any) =>
    newButtonLabel ? <button>{newButtonLabel}</button> : null,
}));
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "unblocked" as const }, allowNextNavigation: vi.fn() }),
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({ LeavePageDialog: () => null }));
vi.mock("@/components/forms/ClientForm", () => ({
  ClientForm: () => <div data-testid="client-form" />,
}));

import Clients from "../Clients";
import ClientNew from "../ClientNew";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Clients — create permissions (FASE 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCan = () => false;
  });

  it("shows 'Nuevo Cliente' button when user has client.create", () => {
    mockCan = (perm) => perm === "client.create";
    wrap(<Clients />);
    expect(screen.getByText("client.newClient")).toBeInTheDocument();
  });

  it("hides 'Nuevo Cliente' button when user lacks client.create", () => {
    mockCan = () => false;
    wrap(<Clients />);
    expect(screen.queryByText("client.newClient")).not.toBeInTheDocument();
  });

  it("ClientNew renders the form without in-page redirect (route guard handles access)", () => {
    wrap(<ClientNew />);
    expect(screen.getByTestId("client-form")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith("/clients", { replace: true });
  });
});
