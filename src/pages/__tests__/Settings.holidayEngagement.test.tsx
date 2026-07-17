import React from "react";
import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * BUG 0526-122: the "Encargo de Feriados" selector in Settings warns (but does
 * NOT filter/hide options) when the selected engagement has
 * approval_required=false — the real safeguard is the dynamic per-date
 * validation in submit_timesheet_safe; this is UX feedback only.
 */

// Radix UI uses ResizeObserver and pointer events not supported by jsdom.
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

// Radix Select scrolls the selected item into view when opened; jsdom has no layout engine.
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
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const engagementNoApproval = {
  engagement_id: "eng-no-approval",
  engagement_code: "NA.01",
  engagement_name: "No Approval Engagement",
  approval_required: false,
};
const engagementWithApproval = {
  engagement_id: "eng-approval",
  engagement_code: "A.01",
  engagement_name: "Approval Required Engagement",
  approval_required: true,
};

const settingsRef = vi.hoisted(() => ({
  current: [] as { setting_key: string; setting_value: string }[],
}));

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [], isLoading: false }),
  useIndustries: () => ({ data: [], isLoading: false }),
  useGlobalSettings: () => ({ data: settingsRef.current, isLoading: false }),
  useActivityCodes: () => ({ data: [], isLoading: false }),
  useAllActivityCodes: () => ({ data: [], isLoading: false }),
  useExpenseTypes: () => ({ data: [], isLoading: false }),
  useSkills: () => ({ data: [], isLoading: false }),
  useTaxonomies: () => ({ data: [], isLoading: false }),
  useEngagements: () => ({ data: [engagementNoApproval, engagementWithApproval] }),
  useServices: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateGlobalSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMoveCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "en" }),
}));

vi.mock("@/hooks/useHolidays", () => ({
  useHolidayEngagementId: () => "eng-approval",
}));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: null }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/components/settings/UserRolesManager", () => ({
  UserRolesManager: () => <div>UserRolesManager</div>,
}));

vi.mock("@/components/settings/ChangePasswordCard", () => ({
  ChangePasswordCard: () => <div>ChangePasswordCard</div>,
}));

vi.mock("@/components/settings/HolidaysManager", () => ({
  HolidaysManager: () => <div>HolidaysManager</div>,
}));

vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => null,
}));

vi.mock("@/lib/fiscalYearDisplay", () => ({
  formatFiscalYearEnd: () => "",
  getFiscalYearOptions: () => [],
}));

import Settings from "@/pages/Settings";

async function openGlobalSettingsTab() {
  const user = userEvent.setup();
  render(<Settings />);
  await user.click(screen.getByRole("tab", { name: "settings.globalSettings" }));
  return user;
}

describe("Settings — holiday engagement approval warning (BUG 0526-122)", () => {
  it("shows a warning when the configured engagement has approval_required=false", async () => {
    settingsRef.current = [{ setting_key: "HOLIDAY_ENGAGEMENT_ID", setting_value: "eng-no-approval" }];
    await openGlobalSettingsTab();

    expect(screen.getByText("settings.holidayEngagementApprovalWarning")).toBeInTheDocument();
  });

  it("does NOT show the warning when the configured engagement has approval_required=true", async () => {
    settingsRef.current = [{ setting_key: "HOLIDAY_ENGAGEMENT_ID", setting_value: "eng-approval" }];
    await openGlobalSettingsTab();

    expect(screen.queryByText("settings.holidayEngagementApprovalWarning")).not.toBeInTheDocument();
  });

  it("does NOT filter/hide the approval_required=false engagement from the selector options", async () => {
    settingsRef.current = [{ setting_key: "HOLIDAY_ENGAGEMENT_ID", setting_value: "eng-approval" }];
    const user = await openGlobalSettingsTab();

    // The RPC is the real safeguard — Settings only warns, it never removes the option.
    const trigger = document.getElementById("holidayEngagement");
    await user.click(trigger!);
    const options = await screen.findAllByRole("option");
    expect(options.some((o) => o.textContent?.includes("NA.01"))).toBe(true);
  });
});
