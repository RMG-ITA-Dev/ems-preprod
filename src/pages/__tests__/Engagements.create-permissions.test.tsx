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

// FASE 5: crear encargo se gatea por can("engagement.create") (lista y CTA anidado);
// la creación por ruta (<PermissionRoute>). EngagementNew ya no redirige in-page.
let mockCan: (perm: string) => boolean = () => false;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: mockCan, roleKey: null }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useEngagements: () => ({ data: [], isLoading: false }),
  useStaff: () => ({ data: [] }),
}));
vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [], partners: [], managers: [] }),
}));
vi.mock("@/lib/timesheetUtils", () => ({ parseDateLocal: (d: string) => new Date(d) }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: ({ newButtonLabel }: any) =>
    newButtonLabel ? <button>{newButtonLabel}</button> : null,
}));
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "unblocked" as const }, allowNextNavigation: vi.fn() }),
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({ LeavePageDialog: () => null }));
vi.mock("@/components/forms/EngagementForm", () => ({
  EngagementForm: () => <div data-testid="engagement-form" />,
}));

import Engagements from "../Engagements";
import EngagementNew from "../EngagementNew";
import { ClientEngagementsTable } from "@/components/clients/ClientEngagementsTable";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Engagements — create permissions (FASE 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCan = () => false;
  });

  it("shows 'Nuevo Encargo' on list when user has engagement.create", () => {
    mockCan = (perm) => perm === "engagement.create";
    wrap(<Engagements />);
    expect(screen.getByText("engagement.newEngagement")).toBeInTheDocument();
  });

  it("hides 'Nuevo Encargo' on list when user lacks engagement.create", () => {
    mockCan = () => false;
    wrap(<Engagements />);
    expect(screen.queryByText("engagement.newEngagement")).not.toBeInTheDocument();
  });

  it("ClientEngagementsTable shows create button when user has engagement.create", () => {
    mockCan = (perm) => perm === "engagement.create";
    wrap(<ClientEngagementsTable clientId="client-1" />);
    expect(screen.getByText("engagement.newEngagement")).toBeInTheDocument();
  });

  it("ClientEngagementsTable hides create button when user lacks engagement.create", () => {
    mockCan = () => false;
    wrap(<ClientEngagementsTable clientId="client-1" />);
    expect(screen.queryByText("engagement.newEngagement")).not.toBeInTheDocument();
  });

  it("EngagementNew renders the form without in-page redirect (route guard handles access)", () => {
    wrap(<EngagementNew />);
    expect(screen.getByTestId("engagement-form")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith("/engagements", { replace: true });
  });
});
