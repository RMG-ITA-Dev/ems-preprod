import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

// Login con Microsoft (docs/plan-entra-id-consolidado.md, Entrega 1): selector AUTH_MODE en
// Configuración. Mismo andamiaje de mocks que Settings.exchangeRateUrl.test.tsx.

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
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const settingsRef = vi.hoisted(() => ({
  current: [] as { setting_key: string; setting_value: string }[],
}));
const roleRef = vi.hoisted(() => ({ current: "admin" }));
const capturedLock = vi.hoisted(() => ({ current: {} as any }));

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [], isLoading: false }),
  useIndustries: () => ({ data: [], isLoading: false }),
  useGlobalSettings: () => ({ data: settingsRef.current, isLoading: false }),
  useActivityCodes: () => ({ data: [], isLoading: false }),
  useAllActivityCodes: () => ({ data: [], isLoading: false }),
  useExpenseTypes: () => ({ data: [], isLoading: false }),
  useSkills: () => ({ data: [], isLoading: false }),
  useTaxonomies: () => ({ data: [], isLoading: false }),
  useEngagements: () => ({ data: [] }),
  useServices: () => ({ data: [], isLoading: false }),
}));

const updateSettingMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateGlobalSetting: () => ({ mutateAsync: updateSettingMutateAsync, isPending: false }),
  useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMoveCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: roleRef.current === "admin" }) }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: roleRef.current }),
}));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
vi.mock("@/hooks/useHolidays", () => ({ useHolidayEngagementId: () => "" }));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: (args: any) => {
    capturedLock.current = args;
    return { blocker: { state: "unblocked", reset: vi.fn(), proceed: vi.fn() } };
  },
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/components/settings/UserRolesManager", () => ({ UserRolesManager: () => <div /> }));
vi.mock("@/components/settings/ChangePasswordCard", () => ({ ChangePasswordCard: () => <div /> }));
vi.mock("@/components/settings/HolidaysManager", () => ({ HolidaysManager: () => <div /> }));
vi.mock("@/components/ui/leave-page-dialog", () => ({ LeavePageDialog: () => null }));
vi.mock("@/lib/fiscalYearDisplay", () => ({ formatFiscalYearEnd: () => "", getFiscalYearOptions: () => [] }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() }, rpc: vi.fn() },
}));

import Settings from "@/pages/Settings";

async function openGlobalSettingsTab() {
  const user = userEvent.setup();
  render(<Settings />);
  await user.click(screen.getByRole("tab", { name: "settings.globalSettings" }));
  return user;
}

async function chooseEntra(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("auth-mode-select"));
  await user.click(await screen.findByRole("option", { name: "settings.authModeEntra" }));
}

const authModeCalls = () =>
  updateSettingMutateAsync.mock.calls.filter(([arg]) => arg?.key === "AUTH_MODE");

describe("Settings — AUTH_MODE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleRef.current = "admin";
    settingsRef.current = [{ setting_key: "AUTH_MODE", setting_value: "password" }];
    capturedLock.current = {};
  });

  it("muestra el modo guardado", async () => {
    settingsRef.current = [{ setting_key: "AUTH_MODE", setting_value: "entra" }];
    await openGlobalSettingsTab();
    expect(screen.getByTestId("auth-mode-select")).toHaveTextContent("settings.authModeEntra");
    expect(screen.getByText("settings.authModeEntraWarning")).toBeInTheDocument();
  });

  it("sin la fila arranca en password", async () => {
    settingsRef.current = [];
    await openGlobalSettingsTab();
    expect(screen.getByTestId("auth-mode-select")).toHaveTextContent("settings.authModePassword");
  });

  it("cambiar a entra marca sucio, advierte y guarda la clave exacta", async () => {
    const user = await openGlobalSettingsTab();
    await chooseEntra(user);
    expect(screen.getByText("settings.authModeEntraWarning")).toBeInTheDocument();
    await waitFor(() => expect(capturedLock.current.isDirty).toBe(true));

    await user.click(screen.getByText("common.saveChanges"));
    await waitFor(() =>
      expect(updateSettingMutateAsync).toHaveBeenCalledWith({ key: "AUTH_MODE", value: "entra" }),
    );
  });

  it("no escribe AUTH_MODE si no cambió (la mutación es update-only)", async () => {
    settingsRef.current = [];
    const user = await openGlobalSettingsTab();
    await user.click(screen.getByText("common.saveChanges"));
    await waitFor(() => expect(updateSettingMutateAsync).toHaveBeenCalled());
    expect(authModeCalls()).toHaveLength(0);
  });

  it("un no-admin no ve el selector", async () => {
    roleRef.current = "manager";
    await openGlobalSettingsTab();
    expect(screen.queryByTestId("auth-mode-select")).toBeNull();
  });
});
