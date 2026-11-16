import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

// R403-10: la tasa de impuestos (TAX_RATE) se valida en [0, 100) % antes de guardar.
// Mismo esquema de mocks que Settings.exchangeRateUrl.test.tsx.

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
  useTranslation: () => ({ t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}::${JSON.stringify(opts)}` : k), i18n: { language: "en" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const settingsRef = vi.hoisted(() => ({
  current: [] as { setting_key: string; setting_value: string }[],
}));

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

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useAuthorization", () => ({ useAuthorization: () => ({ can: () => true, roleKey: "admin" }) }));
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

const functionsInvoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: functionsInvoke },
    rpc: vi.fn(),
  },
}));

import Settings from "@/pages/Settings";

async function openGlobalSettingsTab() {
  const user = userEvent.setup();
  render(<Settings />);
  await user.click(screen.getByRole("tab", { name: "settings.globalSettings" }));
  return user;
}

const taxInput = () => document.getElementById("taxRate") as HTMLInputElement;
// NumericInput no se vacía con user.clear (conserva el valor previo): se reemplaza el valor completo con un cambio directo.
const setTax = (value: string) => fireEvent.change(taxInput(), { target: { value } });
const savedTaxRate = () => updateSettingMutateAsync.mock.calls.find(([arg]) => arg?.key === "TAX_RATE")?.[0];

describe("Settings — TAX_RATE entre 0 % y 100 % (R403-10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsRef.current = [{ setting_key: "TAX_RATE", setting_value: "0.16" }];
    capturedLock.current = {};
  });

  it("hydrates the persisted rate as a percentage", async () => {
    await openGlobalSettingsTab();
    expect(Number(taxInput().value.replace(",", "."))).toBe(16);
  });

  for (const bad of ["100", "150"]) {
    it(`rejects ${bad} % on Save and never reaches the mutation`, async () => {
      const user = await openGlobalSettingsTab();
      setTax(bad);
      await user.click(screen.getByText("common.saveChanges"));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("settings.taxRateRangeError"));
      expect(savedTaxRate()).toBeUndefined();
    });
  }

  it("saves a valid rate as a fraction", async () => {
    const user = await openGlobalSettingsTab();
    setTax("13");
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() => expect(savedTaxRate()).toEqual({ key: "TAX_RATE", value: "0.13" }));
    expect(toast.error).not.toHaveBeenCalledWith("settings.taxRateRangeError");
  });
});
