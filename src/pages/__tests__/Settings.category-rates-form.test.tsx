import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;

  if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  // Radix Select calls scrollIntoView on open; jsdom lacks it.
  if (typeof Element !== "undefined") {
    Element.prototype.scrollIntoView = vi.fn();
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
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const },
    allowNextNavigation: vi.fn(),
    isDirty: false,
  }),
}));

const AUD = "svc-aud";
const TAX = "svc-tax";

const mkCat = (over: Record<string, unknown>) => ({
  rate_high_bob: 200,
  rate_low_bob: 150,
  rate_high_usd: 30,
  rate_low_usd: 25,
  can_approve_wo: true,
  can_approve_timesheets: true,
  default_app_role: null,
  ...over,
});

const catsByService: Record<string, any[]> = {
  [AUD]: [
    mkCat({ category_id: "a1", category_name: "Socio", service_id: AUD, display_order: 1 }),
    mkCat({ category_id: "a2", category_name: "Gerente", service_id: AUD, display_order: 2 }),
  ],
  [TAX]: [
    mkCat({ category_id: "t1", category_name: "TaxSenior", service_id: TAX, display_order: 1 }),
  ],
};

const mockServices = [
  { service_id: AUD, name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "", abbreviation: "AUD" },
  { service_id: TAX, name: "Tax", code: 3, allows_rates_activities: true, is_active: true, created_at: "", abbreviation: "TAX" },
];

// Mutable so a test can simulate useServices() resolving AFTER useCategories()
// already has warm cache data — the race window behind review finding #5.
let mockServicesData: typeof mockServices | undefined = mockServices;

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: (serviceId?: string) => ({
    data: serviceId ? (catsByService[serviceId] ?? []) : Object.values(catsByService).flat(),
    isLoading: false,
  }),
  useIndustries: () => ({ data: [], isLoading: false }),
  useGlobalSettings: () => ({
    data: [
      { setting_key: "LANGUAGE", setting_value: "en" },
      { setting_key: "ALLOW_WEEKEND_TRACKING", setting_value: "false" },
      { setting_key: "COMPACT_FONT", setting_value: "false" },
      { setting_key: "ALLOWED_EMAIL_DOMAIN", setting_value: "" },
      { setting_key: "TAX_RATE", setting_value: "0.13" },
      { setting_key: "REALIZATION_LIMIT", setting_value: "75" },
      { setting_key: "DAILY_MIN", setting_value: "8" },
      { setting_key: "DAILY_MAX", setting_value: "8" },
      { setting_key: "WEEKLY_MIN", setting_value: "40" },
      { setting_key: "WEEKLY_MAX", setting_value: "40" },
    ],
    isLoading: false,
  }),
  useActivityCodes:    () => ({ data: [], isLoading: false }),
  useAllActivityCodes: () => ({ data: [], isLoading: false }),
  useExpenseTypes:     () => ({ data: [], isLoading: false }),
  useSkills: () => ({ data: [], isLoading: false }),
  useEngagements: () => ({ data: [], isLoading: false }),
  useServices: () => ({ data: mockServicesData, isLoading: !mockServicesData }),
  useTaxonomies: () => ({ data: [], isLoading: false }),
}));

const moveCategoryMutate = vi.fn();
const copyCategoriesMutateAsync = vi.fn().mockResolvedValue(1);

vi.mock("@/hooks/mutations", () => ({
  useUpdateGlobalSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // 0817-177: ServiceForm now mounts inside the unified Prácticas tab.
  useCreateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMoveCategory: () => ({ mutate: moveCategoryMutate, mutateAsync: vi.fn(), isPending: false }),
  useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: copyCategoriesMutateAsync, isPending: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useAuthorization", () => ({ useAuthorization: () => ({ can: () => true, roleKey: "admin" }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => <div data-testid="leave-page-dialog" />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));
vi.mock("@/components/settings/UserRolesManager", () => ({ UserRolesManager: () => <div /> }));
vi.mock("@/components/settings/ChangePasswordCard", () => ({ ChangePasswordCard: () => <div /> }));
vi.mock("@/components/settings/HolidaysManager", () => ({ HolidaysManager: () => <div /> }));

// CategoryForm is intentionally NOT mocked so the real form (service read-only
// on edit) mounts.

import Settings from "../Settings";

describe("Settings category-rates (0702-152 / BUG 0306-73)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServicesData = mockServices;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  const renderSettings = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <Settings />
      </QueryClientProvider>
    );

  // 0817-177: Categorías is now a sub-tab under the unified "settings.services"
  // (Prácticas) tab, not a top-level tab. It defaults to selected since both
  // permissions are granted in this suite's mocks.
  const goToRates = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("tab", { name: "settings.services" }));
  };

  it("Test 5: 'New Category' opens the create form without crashing", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToRates(user);
    await user.click(screen.getByText("category.newCategory"));
    expect(screen.getByText("category.createCategory")).toBeInTheDocument();
    expect(screen.queryByText("Unexpected Application Error!")).not.toBeInTheDocument();
  });

  it("Test 6: Clicking a category row opens the edit sheet with the service read-only", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToRates(user);
    await user.click(screen.getByText("Socio"));
    expect(screen.getByText("category.editCategory")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Socio")).toBeInTheDocument();
    // Service is immutable on edit: a read-only input, not a selector.
    expect(screen.getByTestId("category-service-readonly")).toBeInTheDocument();
    expect(screen.queryByTestId("category-service-select")).not.toBeInTheDocument();
  });

  it("defaults the rates tab to Auditoría categories only", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToRates(user);
    expect(screen.getByText("Socio")).toBeInTheDocument();
    expect(screen.getByText("Gerente")).toBeInTheDocument();
    expect(screen.queryByText("TaxSenior")).not.toBeInTheDocument();
  });

  it("switching the service filter to Tax swaps the visible categories", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToRates(user);

    // Open the Radix Select and pick Tax from the listbox.
    await user.click(screen.getByTestId("practice-selector"));
    const taxOption = await screen.findByRole("option", { name: "Tax" });
    await user.click(taxOption);

    await waitFor(() => expect(screen.getByText("TaxSenior")).toBeInTheDocument());
    expect(screen.queryByText("Socio")).not.toBeInTheDocument();
  });

  it("reorder arrows are disabled at the bounds", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToRates(user);

    const upButtons = screen.getAllByLabelText("category.moveUp");
    const downButtons = screen.getAllByLabelText("category.moveDown");
    // First row (position 1) cannot move up; last row cannot move down.
    expect(upButtons[0]).toBeDisabled();
    expect(downButtons[downButtons.length - 1]).toBeDisabled();
    // Middle boundaries are enabled.
    expect(downButtons[0]).not.toBeDisabled();
    expect(upButtons[upButtons.length - 1]).not.toBeDisabled();
  });

  it("clicking a reorder arrow calls move_category with the next position", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToRates(user);

    const downButtons = screen.getAllByLabelText("category.moveDown");
    await user.click(downButtons[0]); // Socio (pos 1) → down to 2
    expect(moveCategoryMutate).toHaveBeenCalledWith({ categoryId: "a1", newPosition: 2 });
  });

  it("hides reorder arrows while services haven't loaded yet (review fix #5)", async () => {
    // Simulate the race: useCategories() already has warm cache data for ALL
    // services (ratesServiceId is still "" at this point), while useServices()
    // hasn't resolved. Before the fix, total was computed from every service's
    // categories while pos was per-service, mis-enabling the down arrow.
    mockServicesData = undefined;
    renderSettings();
    const user = userEvent.setup();
    await goToRates(user);

    expect(screen.getByText("Socio")).toBeInTheDocument();
    expect(screen.queryAllByLabelText("category.moveUp")).toHaveLength(0);
    expect(screen.queryAllByLabelText("category.moveDown")).toHaveLength(0);
  });

  it("copy button opens the copy dialog with a target selector", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToRates(user);
    await user.click(screen.getByTestId("copy-categories-button"));
    expect(screen.getByTestId("copy-target-select")).toBeInTheDocument();
  });
});
