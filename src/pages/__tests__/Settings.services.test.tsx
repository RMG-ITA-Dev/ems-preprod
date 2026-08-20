import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 0817-177: Settings — unified "Prácticas" tab.
 * Replaces the old three independent tabs (Prácticas / Tarifas por Categoría /
 * Códigos de Actividad) with a single tab: a shared práctica selector, admin
 * ABM actions (Nueva/Editar Práctica), and permission-gated sub-tabs.
 */

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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockServices = [
  { service_id: "s1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "", abbreviation: "AUD" },
  { service_id: "s2", name: "Tax", code: 3, allows_rates_activities: true, is_active: false, created_at: "", abbreviation: "TAX" },
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
  useTaxonomies:    () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

// Configurable per test: role_key + which permissions `can()` grants.
const authMock = vi.hoisted(() => ({
  roleKey: "admin" as string,
  permissions: new Set<string>(["category_rate.read", "activity_code.read"]),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: (key: string) => authMock.permissions.has(key),
    roleKey: authMock.roleKey,
  }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateGlobalSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMoveCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  // 0817-177: CategoryForm/ActivityCodeForm now mount inside the unified tab.
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateActivityCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateActivityCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeactivateServiceActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReactivateServiceActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

describe("Settings — unified Prácticas tab (0817-177)", () => {
  beforeEach(() => {
    authMock.roleKey = "admin";
    authMock.permissions = new Set(["category_rate.read", "activity_code.read"]);
  });

  it("admin sees the single 'settings.services' tab trigger (no separate rates/activities tabs)", () => {
    render(<Settings />);
    expect(screen.getByRole("tab", { name: "settings.services" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "settings.categoryRates" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "settings.activityCodes" })).not.toBeInTheDocument();
  });

  it("a non-admin without either read permission does NOT see the tab trigger", () => {
    authMock.roleKey = "staff";
    authMock.permissions = new Set();
    render(<Settings />);
    expect(screen.queryByRole("tab", { name: "settings.services" })).not.toBeInTheDocument();
  });

  it("a non-admin with only activity_code.read still sees the unified tab", () => {
    authMock.roleKey = "staff";
    authMock.permissions = new Set(["activity_code.read"]);
    render(<Settings />);
    expect(screen.getByRole("tab", { name: "settings.services" })).toBeInTheDocument();
  });

  it("shows the shared práctica selector and, for admin, Nueva/Editar Práctica actions", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.services" }));

    expect(screen.getByTestId("practice-selector")).toBeInTheDocument();
    expect(screen.getByTestId("new-practice-button")).toBeInTheDocument();
    expect(screen.getByTestId("edit-practice-button")).toBeInTheDocument();
  });

  it("a non-admin never sees the Nueva/Editar Práctica actions", async () => {
    authMock.roleKey = "staff";
    authMock.permissions = new Set(["category_rate.read"]);
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.services" }));

    expect(screen.queryByTestId("new-practice-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("edit-practice-button")).not.toBeInTheDocument();
  });

  it("admin can select an inactive práctica from the selector (marked inactive)", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.services" }));

    await user.click(screen.getByTestId("practice-selector"));
    expect(await screen.findByRole("option", { name: /Tax.*status\.inactive/ })).toBeInTheDocument();
  });

  it("selecting an inactive práctica disables 'Copiar categorías' (its source would fail server-side)", async () => {
    authMock.permissions = new Set(["category_rate.read", "category_rate.create", "activity_code.read"]);
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.services" }));

    await user.click(screen.getByTestId("practice-selector"));
    await user.click(await screen.findByRole("option", { name: /Tax.*status\.inactive/ }));

    expect(await screen.findByTestId("copy-categories-button")).toBeDisabled();
  });

  it("sub-tabs are gated by their own read permission: only Categorías with category_rate.read only", async () => {
    authMock.roleKey = "staff";
    authMock.permissions = new Set(["category_rate.read"]);
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.services" }));

    expect(screen.getByRole("tab", { name: "settings.categoryRates" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "settings.activityCodes" })).not.toBeInTheDocument();
  });
});
