import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockNavigate = vi.fn();
const mockAllowNextNavigation = vi.fn();
let mockSearchParams = new URLSearchParams();

const activeEngagement = {
  engagement_id: "eng-1",
  status: "active",
  engagement_code: "E-001",
  engagement_name: "Auditoria",
  client: { client_legal_name: "Cliente Demo" },
};

// Stable references are required: useCategories/useWorkOrders are useEffect deps in WorkOrderNew;
// returning a new [] on every render causes an infinite re-render loop.
const stableCategories: never[] = [];
const stableWorkOrders: never[] = [];

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, vi.fn()],
    Link: ({ children }: any) => <span>{children}</span>,
  };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() },
    allowNextNavigation: mockAllowNextNavigation,
  }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useEngagements: () => ({ data: [activeEngagement] }),
  useWorkOrders: () => ({ data: stableWorkOrders }),
  useCategories: () => ({ data: stableCategories }),
  useSetting: () => "0.13",
}));

vi.mock("@/hooks/useWorksheetData", () => ({
  useWorksheetByEngagementId: () => ({ data: undefined }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // Payment-plan feature: WorkOrderNew now also consumes these mutations.
  useUpsertPaymentPlan: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBatchUpsertInstallments: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: any) => (
    <div data-testid="app-layout" data-focus-mode={focusMode}>{children}</div>
  ),
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => <div data-testid="leave-page-dialog" />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false, isPartner: false, isDirector: false, isManager: true, isLoading: false }),
}));

// WorkOrderNew usa useAuthorization para `isStatusEditable` del plan de pagos y
// para el estado vacío del selector de encargo. useAuthorization llama a useAuth
// por dentro, así que sin este mock el render falla con
// "useAuth must be used within an AuthProvider".
// roleKey "manager" mantiene isAdmin en false, igual que el mock de arriba.
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: () => true,
    scope: () => "assigned_engagements",
    roleKey: "manager",
    isLoading: false,
  }),
}));

import WorkOrderNew from "../WorkOrderNew";

describe("WorkOrderNew focus-cancel (BUG 0319-86)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  const renderPage = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <WorkOrderNew />
      </QueryClientProvider>
    );

  it("TW1: page is rendered in focusMode", () => {
    renderPage();
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
  });

  it("TW2: Cancel button is present before any engagement is selected", () => {
    renderPage();
    expect(screen.getByText("entities.engagement")).toBeInTheDocument();
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });

  it("TW3: clicking Cancel calls allowNextNavigation and navigates to /work-orders", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByText("common.cancel"));
    expect(mockAllowNextNavigation).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/work-orders");
  });

});
