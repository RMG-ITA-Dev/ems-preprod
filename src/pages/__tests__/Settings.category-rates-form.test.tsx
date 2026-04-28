import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = MockResizeObserver;

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

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({
    data: [
      {
        category_id: "cat-1",
        category_name: "Socio",
        display_order: 1,
        rate_high_bob: 200,
        rate_low_bob: 150,
        rate_high_usd: 30,
        rate_low_usd: 25,
        can_approve_wo: true,
        can_approve_timesheets: true,
        default_app_role: null,
      },
    ],
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
  useActivityCodes: () => ({ data: [], isLoading: false }),
  useExpenseTypes: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateGlobalSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true }) }));
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

// CategoryForm is intentionally NOT mocked so the real Radix SelectItem path
// mounts and exercises the bug-fix path (NO_DEFAULT_ROLE sentinel).

import Settings from "../Settings";

describe("Settings category-rates-form (BUG 0306-73)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("Test 5: Clicking 'Nueva Categoría' opens the form sheet without crashing", async () => {
    renderSettings();
    const user = userEvent.setup();
    await user.click(screen.getByText("settings.categoryRates"));
    await user.click(screen.getByText("category.newCategory"));
    // Submit button is unique to the create-mode form — proves real form mounted
    expect(screen.getByText("category.createCategory")).toBeInTheDocument();
    expect(screen.queryByText("Unexpected Application Error!")).not.toBeInTheDocument();
  });

  it("Test 6: Clicking an existing category row opens the edit sheet with the category pre-loaded", async () => {
    renderSettings();
    const user = userEvent.setup();
    await user.click(screen.getByText("settings.categoryRates"));
    await user.click(screen.getByText("Socio"));
    // SheetTitle shows edit label; input is pre-filled with the category name
    expect(screen.getByText("category.editCategory")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Socio")).toBeInTheDocument();
    expect(screen.queryByText("Unexpected Application Error!")).not.toBeInTheDocument();
  });
});
