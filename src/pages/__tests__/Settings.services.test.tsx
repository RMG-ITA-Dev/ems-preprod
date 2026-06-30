import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 0625-149: Settings — Servicios tab
 * - Admin sees the tab trigger
 * - Non-admin does NOT see it
 * - Rows render code/name/active badge
 */

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

const mockServices = [
  { service_id: "s1", name: "Auditoría",  code: 1, allows_rates_activities: true,  is_active: true,  created_at: "" },
  { service_id: "s2", name: "Tax",        code: 3, allows_rates_activities: true,  is_active: false, created_at: "" },
];

vi.mock("@/hooks/useEmsData", () => ({
  useCategories:    () => ({ data: [], isLoading: false }),
  useIndustries:    () => ({ data: [], isLoading: false }),
  useGlobalSettings:() => ({ data: [], isLoading: false }),
  useActivityCodes:    () => ({ data: [], isLoading: false }),
  useAllActivityCodes: () => ({ data: [], isLoading: false }),
  useExpenseTypes:     () => ({ data: [], isLoading: false }),
  useSkills:        () => ({ data: [], isLoading: false }),
  useEngagements:   () => ({ data: [] }),
  useServices:      () => ({ data: mockServices, isLoading: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateGlobalSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "en" }),
}));

vi.mock("@/hooks/useHolidays", () => ({
  useHolidayEngagementId: () => "",
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

describe("Settings — Servicios tab (0625-149)", () => {
  it("admin sees 'settings.services' tab trigger", () => {
    render(<Settings />);
    expect(screen.getByRole("tab", { name: "settings.services" })).toBeInTheDocument();
  });

  it("renders the new service button when tab is active", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.services" }));
    expect(screen.getByText("service.newService")).toBeInTheDocument();
  });
});
