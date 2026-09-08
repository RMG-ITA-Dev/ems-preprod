import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

// BUG 0722-156 (Fase 1): EXCHANGE_RATE_API_URL field + "Probar → modal → Guardar" flow.
// Mirrors Settings.holidayEngagement.test.tsx's mocking convention.

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

const SAVED_URL = "https://tc-ruizmier-production.up.railway.app/api/v1/ruizmier-tc/tipo-cambio/oficial";

async function openGlobalSettingsTab() {
  const user = userEvent.setup();
  render(<Settings />);
  await user.click(screen.getByRole("tab", { name: "settings.globalSettings" }));
  return user;
}

function getUrlInput(): HTMLInputElement {
  return document.getElementById("exchangeRateApiUrl") as HTMLInputElement;
}

describe("Settings — EXCHANGE_RATE_API_URL field (BUG 0722-156, Fase 1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsRef.current = [{ setting_key: "EXCHANGE_RATE_API_URL", setting_value: SAVED_URL }];
    capturedLock.current = {};
  });

  it("hydrates the persisted URL", async () => {
    await openGlobalSettingsTab();
    expect(getUrlInput().value).toBe(SAVED_URL);
  });

  it("marks the global tab dirty on edit", async () => {
    const user = await openGlobalSettingsTab();
    await user.clear(getUrlInput());
    await user.type(getUrlInput(), "https://new.example.com/api");
    await waitFor(() => expect(capturedLock.current.isDirty).toBe(true));
  });

  it("restores the persisted URL on Cancel", async () => {
    const user = await openGlobalSettingsTab();
    await user.clear(getUrlInput());
    await user.type(getUrlInput(), "https://new.example.com/api");
    await user.click(screen.getByText("common.cancel"));

    // Cancel navigates back to the account tab (handleCancelGlobal) — return to Global to
    // read the restored value back out of state.
    await user.click(screen.getByRole("tab", { name: "settings.globalSettings" }));
    expect(getUrlInput().value).toBe(SAVED_URL);
  });

  it("rejects a malformed URL on Save (never reaches the mutation)", async () => {
    const user = await openGlobalSettingsTab();
    await user.clear(getUrlInput());
    await user.type(getUrlInput(), "not a url");
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("settings.exchangeRateApiUrlInvalid"));
    expect(updateSettingMutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "EXCHANGE_RATE_API_URL" }),
    );
  });

  it("rejects a non-HTTPS URL on Save (never reaches the mutation)", async () => {
    const user = await openGlobalSettingsTab();
    await user.clear(getUrlInput());
    await user.type(getUrlInput(), "http://tc.example.com/oficial");
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("settings.exchangeRateApiUrlHttpsRequired"));
    expect(updateSettingMutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "EXCHANGE_RATE_API_URL" }),
    );
  });

  it("saves the exact key EXCHANGE_RATE_API_URL on a valid HTTPS URL", async () => {
    const user = await openGlobalSettingsTab();
    await user.clear(getUrlInput());
    await user.type(getUrlInput(), "https://new.example.com/api");
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() =>
      expect(updateSettingMutateAsync).toHaveBeenCalledWith({
        key: "EXCHANGE_RATE_API_URL",
        value: "https://new.example.com/api",
      }),
    );
  });

  // MUST FIX review iteracion 3 #3: clearing the field and saving must persist "" (disable
  // the configured provider), not silently skip the mutation and leave the old URL active.
  it("persists an empty value when the field is cleared and saved", async () => {
    const user = await openGlobalSettingsTab();
    await user.clear(getUrlInput());
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() =>
      expect(updateSettingMutateAsync).toHaveBeenCalledWith({
        key: "EXCHANGE_RATE_API_URL",
        value: "",
      }),
    );
  });

  it("does not re-save the URL when it is untouched (unrelated field change only)", async () => {
    const user = await openGlobalSettingsTab();
    // Touch an unrelated field so the tab is dirty and Save proceeds, without editing the URL.
    const allowedDomainInput = screen.getByLabelText("settings.allowedEmailDomain");
    await user.clear(allowedDomainInput);
    await user.type(allowedDomainInput, "ruizmier.com");
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() =>
      expect(updateSettingMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ key: "ALLOWED_EMAIL_DOMAIN" }),
      ),
    );
    expect(updateSettingMutateAsync).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: "EXCHANGE_RATE_API_URL" }),
    );
  });

  describe("'Probar' -> modal -> 'Guardar'", () => {
    it("invokes exchange-rate-sync in test mode with the currently-typed URL and shows the parsed result", async () => {
      functionsInvoke.mockResolvedValueOnce({
        data: { compra: 11.57, venta: 11.67, fecha_vigencia: "2026-08-26", estado: "vigente", canal: "bcb-web" },
        error: null,
      });
      const user = await openGlobalSettingsTab();
      await user.clear(getUrlInput());
      await user.type(getUrlInput(), "https://new.example.com/api");
      await user.click(screen.getByText("settings.testConnection"));

      await waitFor(() => expect(functionsInvoke).toHaveBeenCalledWith("exchange-rate-sync", {
        body: { mode: "test", url: "https://new.example.com/api" },
      }));
      await waitFor(() => expect(screen.getByText("settings.exchangeRateTestModalTitle")).toBeInTheDocument());
      expect(screen.getByText(/settings\.exchangeRateTestCompra/)).toBeInTheDocument();
      // MUST FIX review iteracion 1 #8: fecha_vigencia ("2026-08-26") se muestra en
      // DD/MM/YYYY como el resto de la app, nunca el YYYY-MM-DD crudo del microservicio.
      expect(screen.getByText(/26\/08\/2026/)).toBeInTheDocument();
      expect(screen.queryByText(/2026-08-26/)).not.toBeInTheDocument();
    });

    it("renders a translated generic error in the modal when the failure carries no error code (MUST FIX review iteracion 1 #10: never the raw Spanish server message)", async () => {
      functionsInvoke.mockResolvedValueOnce({
        data: null,
        error: { message: "El microservicio respondió 500" },
      });
      const user = await openGlobalSettingsTab();
      await user.clear(getUrlInput());
      await user.type(getUrlInput(), "https://new.example.com/api");
      await user.click(screen.getByText("settings.testConnection"));

      await waitFor(() => expect(screen.getByText("settings.exchangeRateError.generic")).toBeInTheDocument());
      expect(screen.queryByText(/El microservicio respondió/)).not.toBeInTheDocument();
    });

    it("renders the specific translated error for a known error code (e.g. provider_error), not the raw message", async () => {
      functionsInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          message: "El microservicio respondió 500",
          context: { json: () => Promise.resolve({ error: { code: "provider_error", message: "El microservicio respondió 500" } }) },
        },
      });
      const user = await openGlobalSettingsTab();
      await user.clear(getUrlInput());
      await user.type(getUrlInput(), "https://new.example.com/api");
      await user.click(screen.getByText("settings.testConnection"));

      await waitFor(() => expect(screen.getByText("settings.exchangeRateError.provider_error")).toBeInTheDocument());
    });

    it("the test flow works without saving first (no mutation call before clicking Probar)", async () => {
      functionsInvoke.mockResolvedValueOnce({
        data: { compra: 11.57, venta: 11.67, fecha_vigencia: "2026-08-26", estado: "vigente", canal: "bcb-web" },
        error: null,
      });
      const user = await openGlobalSettingsTab();
      await user.clear(getUrlInput());
      await user.type(getUrlInput(), "https://new.example.com/api");
      await user.click(screen.getByText("settings.testConnection"));

      await waitFor(() => expect(functionsInvoke).toHaveBeenCalled());
      expect(updateSettingMutateAsync).not.toHaveBeenCalled();
    });

    it("'Guardar' in the modal saves the URL AND invokes sync mode to seed the rate", async () => {
      functionsInvoke
        .mockResolvedValueOnce({
          data: { compra: 11.57, venta: 11.67, fecha_vigencia: "2026-08-26", estado: "vigente", canal: "bcb-web" },
          error: null,
        })
        .mockResolvedValueOnce({ data: { written: true }, error: null });

      const user = await openGlobalSettingsTab();
      await user.clear(getUrlInput());
      await user.type(getUrlInput(), "https://new.example.com/api");
      await user.click(screen.getByText("settings.testConnection"));
      await waitFor(() => expect(screen.getByText("settings.exchangeRateTestModalTitle")).toBeInTheDocument());

      await user.click(screen.getByText("settings.exchangeRateSaveAndSeed"));

      await waitFor(() =>
        expect(updateSettingMutateAsync).toHaveBeenCalledWith({
          key: "EXCHANGE_RATE_API_URL",
          value: "https://new.example.com/api",
        }),
      );
      expect(functionsInvoke).toHaveBeenLastCalledWith("exchange-rate-sync", { body: {} });
    });

    it("Cancel/close after Probar persists nothing", async () => {
      functionsInvoke.mockResolvedValueOnce({
        data: { compra: 11.57, venta: 11.67, fecha_vigencia: "2026-08-26", estado: "vigente", canal: "bcb-web" },
        error: null,
      });
      const user = await openGlobalSettingsTab();
      await user.clear(getUrlInput());
      await user.type(getUrlInput(), "https://new.example.com/api");
      await user.click(screen.getByText("settings.testConnection"));
      await waitFor(() => expect(screen.getByText("settings.exchangeRateTestModalTitle")).toBeInTheDocument());

      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByText("common.cancel"));

      expect(updateSettingMutateAsync).not.toHaveBeenCalled();
      expect(functionsInvoke).toHaveBeenCalledTimes(1);
    });
  });
});
