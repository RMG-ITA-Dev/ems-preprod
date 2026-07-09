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
  isManager: false, isSQR: false, isLoading: false,
};
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => mockRole }));

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

describe("Engagements — create permissions (0306-75)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // --- Engagements list page ---
  it.each([
    ["admin",    { isAdmin: true,  isPartner: false, isDirector: false, isManager: false, isSQR: false, isLoading: false }],
    ["partner",  { isAdmin: false, isPartner: true,  isDirector: false, isManager: false, isSQR: false, isLoading: false }],
    ["director", { isAdmin: false, isPartner: false, isDirector: true,  isManager: false, isSQR: false, isLoading: false }],
    ["manager",  { isAdmin: false, isPartner: false, isDirector: false, isManager: true,  isSQR: false, isLoading: false }],
    ["sqr",      { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: true,  isLoading: false }],
  ])("shows 'Nuevo Encargo' button on list for %s", (_name, role) => {
    mockRole = role;
    wrap(<Engagements />);
    expect(screen.getByText("engagement.newEngagement")).toBeInTheDocument();
  });

  it.each([
    ["senior",     { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: false, isLoading: false }],
    ["semisenior", { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: false, isLoading: false }],
    ["staff",      { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: false, isLoading: false }],
  ])("hides 'Nuevo Encargo' button on list for %s", (_name, role) => {
    mockRole = role;
    wrap(<Engagements />);
    expect(screen.queryByText("engagement.newEngagement")).not.toBeInTheDocument();
  });

  // --- ClientEngagementsTable nested CTA ---
  it.each([
    ["admin",   { isAdmin: true,  isPartner: false, isDirector: false, isManager: false, isSQR: false, isLoading: false }],
    ["manager", { isAdmin: false, isPartner: false, isDirector: false, isManager: true,  isSQR: false, isLoading: false }],
    ["sqr",     { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: true,  isLoading: false }],
  ])("ClientEngagementsTable shows create button for %s", (_name, role) => {
    mockRole = role;
    wrap(<ClientEngagementsTable clientId="client-1" />);
    expect(screen.getByText("engagement.newEngagement")).toBeInTheDocument();
  });

  it.each([
    ["senior", { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: false, isLoading: false }],
    ["staff",  { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: false, isLoading: false }],
  ])("ClientEngagementsTable hides create button for %s", (_name, role) => {
    mockRole = role;
    wrap(<ClientEngagementsTable clientId="client-1" />);
    expect(screen.queryByText("engagement.newEngagement")).not.toBeInTheDocument();
  });

  // --- EngagementNew redirect ---
  it("redirects staff away from /engagements/new after role loads", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: false, isLoading: false };
    wrap(<EngagementNew />);
    expect(mockNavigate).toHaveBeenCalledWith("/engagements", { replace: true });
  });

  it.each([
    ["partner", { isAdmin: false, isPartner: true,  isDirector: false, isManager: false, isSQR: false, isLoading: false }],
    ["manager", { isAdmin: false, isPartner: false, isDirector: false, isManager: true,  isSQR: false, isLoading: false }],
    ["sqr",     { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: true,  isLoading: false }],
  ])("does not redirect %s away from /engagements/new", (_name, role) => {
    mockRole = role;
    wrap(<EngagementNew />);
    expect(mockNavigate).not.toHaveBeenCalledWith("/engagements", { replace: true });
  });

  it("does not redirect while role is still loading", () => {
    mockRole = { isAdmin: false, isPartner: false, isDirector: false, isManager: false, isSQR: false, isLoading: true };
    wrap(<EngagementNew />);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
