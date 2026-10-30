import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

// 1028-215: guardar Configuración Global escribe una clave por llamada a useUpdateGlobalSetting.
// Con el hook REAL (no mockeado) el guardado debe mostrar un solo toast de éxito, no uno por clave.
// Mismo andamiaje de mocks que Settings.authMode.test.tsx.

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

vi.mock("@/hooks/mutations", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/mutations")>("@/hooks/mutations");
  return {
    useUpdateGlobalSetting: actual.useUpdateGlobalSetting,
    useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useMoveCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  };
});

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock, Toaster: () => null }));

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

const upsertMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
    from: vi.fn(() => ({ upsert: upsertMock })),
  },
}));

import Settings from "@/pages/Settings";

describe("Settings — Global save shows a single success toast (1028-215)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    roleRef.current = "admin";
    settingsRef.current = [];
    upsertMock.mockImplementation((row: { setting_key: string; setting_value: string }) => ({
      select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }),
    }));
  });

  it("saving several keys toasts 'settingsSaved' exactly once", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.globalSettings" }));
    await user.click(screen.getByText("common.saveChanges"));

    // LANGUAGE (admin), ALLOW_WEEKEND_TRACKING and COMPACT_FONT are always written.
    await waitFor(() => expect(upsertMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith("messages.settingsSaved"));
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });
});
