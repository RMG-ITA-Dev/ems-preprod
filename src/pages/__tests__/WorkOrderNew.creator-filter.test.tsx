import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * BUG 0828-186 (Punto D): the "Nueva Orden de Trabajo" engagement selector must only offer
 * engagements CREATED BY the current user ("creado por mí", not the responsable directo)
 * that are active and don't already have a work order. The `?engagement=` query param must
 * be validated against that same filtered list -- an id belonging to someone else, an
 * inactive engagement, or one that already has a work order must never preselect (URL
 * bypass hardening).
 */

// Radix UI Select needs these in jsdom.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const mockNavigate = vi.fn();
let mockSearchParams = new URLSearchParams();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, vi.fn()],
    Link: ({ children }: any) => <span>{children}</span>,
  };
});

const CURRENT_STAFF_ID = "staff-me";
const OTHER_STAFF_ID = "staff-other";

const engagementsRef = vi.hoisted(() => ({ current: [] as any[] }));
const workOrdersRef = vi.hoisted(() => ({ current: [] as any[] }));
// Stable reference: useCategories is a useEffect dep in WorkOrderNew.tsx -- returning a new
// [] on every render causes an infinite re-render loop (same pitfall the existing
// WorkOrderNew.focus-cancel.test.tsx guards against).
const stableCategories: never[] = [];

vi.mock("@/hooks/useEmsData", () => ({
  useEngagements: () => ({ data: engagementsRef.current, isLoading: false }),
  useWorkOrders: () => ({ data: workOrdersRef.current }),
  useCategories: () => ({ data: stableCategories }),
  useSetting: () => "0.13",
}));

vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetByEngagementId: () => ({ data: undefined }),
}));

// Once an engagement is selected, WorkOrderNew mounts the real WorkOrderForm -- a heavy
// component (useLanguage, useExpenseTypes, WorkOrderPaymentPlanSection, ...) unrelated to
// what this suite covers (the creator filter + ?engagement= hardening). Stub it out so the
// preselection test doesn't need to satisfy that whole dependency chain.
vi.mock("@/components/forms/WorkOrderForm", () => ({
  WorkOrderForm: () => <div data-testid="work-order-form" />,
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: CURRENT_STAFF_ID }, isLoading: false }),
}));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
    allowNextNavigation: vi.fn(),
  }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpsertPaymentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBatchUpsertInstallments: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => <div data-testid="leave-page-dialog" />,
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false, isPartner: false, isDirector: false, isManager: true, isLoading: false }),
}));

const authRef = vi.hoisted(() => ({ roleKey: "manager" as string }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: () => true,
    scope: () => "assigned_engagements",
    roleKey: authRef.roleKey,
    isLoading: false,
  }),
}));

import WorkOrderNew from "../WorkOrderNew";

function makeEngagement(overrides: Partial<any> = {}) {
  return {
    engagement_id: overrides.engagement_id || crypto.randomUUID(),
    status: "active",
    engagement_code: "E-001",
    engagement_name: "Auditoria",
    client: { client_legal_name: "Cliente Demo" },
    created_by_staff_id: CURRENT_STAFF_ID,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkOrderNew />
    </QueryClientProvider>
  );
}

async function openEngagementSelect() {
  const user = userEvent.setup();
  renderPage();
  const trigger = screen.getByRole("combobox");
  await user.click(trigger);
  return user;
}

describe("WorkOrderNew — creator filter (BUG 0828-186 Punto D)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    engagementsRef.current = [];
    workOrdersRef.current = [];
    authRef.roleKey = "manager";
  });

  it("includes an active engagement created by the current user with no existing work order", async () => {
    engagementsRef.current = [makeEngagement({ engagement_id: "eng-own", engagement_code: "OWN.01" })];
    await openEngagementSelect();

    const options = await screen.findAllByRole("option");
    expect(options.some((o) => o.textContent?.includes("OWN.01"))).toBe(true);
  });

  // These 3 cases leave availableEngagements empty (each fixture is the only engagement, and
  // it's excluded), so WorkOrderNew renders the empty-state Alert instead of a <Select> --
  // there's no combobox to open. Assert on the excluded code being absent and the alert.
  it("excludes an active engagement created by someone else", () => {
    engagementsRef.current = [
      makeEngagement({ engagement_id: "eng-other", engagement_code: "OTH.01", created_by_staff_id: OTHER_STAFF_ID }),
    ];
    renderPage();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("OTH.01")).not.toBeInTheDocument();
  });

  it("excludes an inactive engagement created by the current user", () => {
    engagementsRef.current = [
      makeEngagement({ engagement_id: "eng-inactive", engagement_code: "INA.01", status: "completed" }),
    ];
    renderPage();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("INA.01")).not.toBeInTheDocument();
  });

  it("excludes the user's own engagement if it already has a work order", () => {
    engagementsRef.current = [makeEngagement({ engagement_id: "eng-has-wo", engagement_code: "HWO.01" })];
    workOrdersRef.current = [{ engagement_id: "eng-has-wo" }];
    renderPage();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("HWO.01")).not.toBeInTheDocument();
  });

  it("preselects a valid ?engagement= belonging to the current user", async () => {
    engagementsRef.current = [makeEngagement({ engagement_id: "eng-own", engagement_code: "OWN.01" })];
    mockSearchParams = new URLSearchParams("?engagement=eng-own");
    renderPage();

    expect(await screen.findByText(/E-001|OWN.01/)).toBeInTheDocument();
  });

  it("rejects a ?engagement= id belonging to another user (URL bypass hardening)", async () => {
    engagementsRef.current = [
      makeEngagement({ engagement_id: "eng-other", engagement_code: "OTH.01", created_by_staff_id: OTHER_STAFF_ID }),
    ];
    mockSearchParams = new URLSearchParams("?engagement=eng-other");
    renderPage();

    // Still on the "select an engagement" step -- the WorkOrderForm never mounted.
    expect(await screen.findByText("workOrders.selectEngagement")).toBeInTheDocument();
    expect(screen.queryByText("OTH.01")).not.toBeInTheDocument();
  });

  it("admin sees an engagement created by someone else (no creator filter)", async () => {
    authRef.roleKey = "admin";
    engagementsRef.current = [
      makeEngagement({ engagement_id: "eng-other", engagement_code: "OTH.01", created_by_staff_id: OTHER_STAFF_ID }),
    ];
    await openEngagementSelect();

    const options = await screen.findAllByRole("option");
    expect(options.some((o) => o.textContent?.includes("OTH.01"))).toBe(true);
  });
});
