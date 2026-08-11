import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockBlocker = { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() };
let capturedLockArgs: any = {};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: (args: any) => { capturedLockArgs = args; return { blocker: mockBlocker, allowNextNavigation: vi.fn(), isDirty: false }; },
}));

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [], isLoading: false }),
  useIndustries: () => ({ data: [], isLoading: false }),
  useGlobalSettings: () => ({ data: [
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
  ], isLoading: false }),
  useActivityCodes:    () => ({ data: [], isLoading: false }),
  useAllActivityCodes: () => ({ data: [], isLoading: false }),
  useExpenseTypes:     () => ({ data: [], isLoading: false }),
  useSkills: () => ({ data: [], isLoading: false }),
  useEngagements: () => ({ data: [] }),
  useServices: () => ({ data: [], isLoading: false }),
  useTaxonomies: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/mutations", () => ({ useUpdateGlobalSetting: () => ({ mutateAsync: vi.fn(), isPending: false }), useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }), useMoveCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }), useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useAuthorization", () => ({ useAuthorization: () => ({ can: () => true, roleKey: "admin" }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: any) => <div data-testid="app-layout" data-focus-mode={focusMode}>{children}</div>,
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: ({ isDirty }: any) => <div data-testid="leave-page-dialog" data-is-dirty={isDirty} />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));
vi.mock("@/components/settings/UserRolesManager", () => ({ UserRolesManager: () => <div /> }));
vi.mock("@/components/settings/ChangePasswordCard", () => ({ ChangePasswordCard: () => <div /> }));
vi.mock("@/components/settings/HolidaysManager", () => ({ HolidaysManager: () => <div /> }));

import Settings from "../Settings";

describe("Settings global-focus-cancel", () => {
  let queryClient: QueryClient;
  beforeEach(() => {
    vi.clearAllMocks();
    capturedLockArgs = {};
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  });

  const renderSettings = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <Settings />
      </QueryClientProvider>
    );

  it("TS1: focusMode active only on global tab", async () => {
    renderSettings();
    // Account tab - no focus mode
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("false");

    const user = userEvent.setup();
    await user.click(screen.getByText("settings.globalSettings"));
    expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
  });

  it("TS2: lock is not active on account tab", () => {
    renderSettings();
    expect(capturedLockArgs.locked).toBe(false);
  });

  it("TS3: lock activates on global tab", async () => {
    renderSettings();
    const user = userEvent.setup();
    await user.click(screen.getByText("settings.globalSettings"));
    expect(capturedLockArgs.locked).toBe(true);
  });

  it("TS4: Cancel button present on global tab", async () => {
    renderSettings();
    const user = userEvent.setup();
    await user.click(screen.getByText("settings.globalSettings"));
    expect(screen.getByText("common.cancel")).toBeInTheDocument();
  });

  it("TS5: LeavePageDialog renders", () => {
    renderSettings();
    expect(screen.getByTestId("leave-page-dialog")).toBeInTheDocument();
  });
});
