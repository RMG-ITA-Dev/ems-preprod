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

let mockRole = {
  isAdmin: false, isPartner: false, isDirector: false,
  isManager: false, isLoading: false,
};
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => mockRole }));

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

describe("Clients — create permissions (0306-75)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it.each([
    ["admin",    { isAdmin: true,  isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["partner",  { isAdmin: false, isPartner: true,  isDirector: false, isManager: false, isLoading: false }],
    ["director", { isAdmin: false, isPartner: false, isDirector: true,  isManager: false, isLoading: false }],
  ])("shows 'Nuevo Cliente' button for %s", (_name, role) => {
    mockRole = role;
    wrap(<Clients />);
    expect(screen.getByText("client.newClient")).toBeInTheDocument();
  });

  it.each([
    ["manager",     { isAdmin: false, isPartner: false, isDirector: false, isManager: true,  isLoading: false }],
    ["senior",      { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["semisenior",  { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["staff",       { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
    ["viewer",      { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false }],
  ])("hides 'Nuevo Cliente' button for %s", (_name, role) => {
    mockRole = role;
    wrap(<Clients />);
    expect(screen.queryByText("client.newClient")).not.toBeInTheDocument();
  });

  it("redirects staff away from /clients/new after role loads", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: false };
    wrap(<ClientNew />);
    expect(mockNavigate).toHaveBeenCalledWith("/clients", { replace: true });
  });

  it("does not redirect admin away from /clients/new", () => {
    mockRole = { isAdmin: true, isPartner: false, isDirector: false, isManager: false, isLoading: false };
    wrap(<ClientNew />);
    expect(mockNavigate).not.toHaveBeenCalledWith("/clients", { replace: true });
  });

  it("does not redirect while role is still loading", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isLoading: true };
    wrap(<ClientNew />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
