import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
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

// BUG 0828-186 (Punto C): el encargo de Feriados debe ser administrativo/interno de la
// firma -- ambos fixtures son is_internal=true porque estas pruebas (0526-122) cubren un
// eje ortogonal (approval_required); el filtro is_internal se cubre en el describe de abajo.
const engagementNoApproval = {
  engagement_id: "eng-no-approval",
  engagement_code: "NA.01",
  engagement_name: "No Approval Engagement",
  approval_required: false,
  is_internal: true,
};
const engagementWithApproval = {
  engagement_id: "eng-approval",
  engagement_code: "A.01",
  engagement_name: "Approval Required Engagement",
  approval_required: true,
  is_internal: true,
};

const settingsRef = vi.hoisted(() => ({
  current: [] as { setting_key: string; setting_value: string }[],
}));

const engagementsRef = vi.hoisted(() => ({
  current: [] as { engagement_id: string; engagement_code: string; engagement_name: string; approval_required: boolean; is_internal: boolean }[],
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
  useEngagements: () => ({ data: engagementsRef.current }),
  useServices: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "admin" }),
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
  beforeEach(() => {
    engagementsRef.current = [engagementNoApproval, engagementWithApproval];
  });

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

/**
 * BUG 0828-186 (Punto C): el selector de Feriados solo debe ofrecer encargos administrativos
 * (is_internal=true) como candidatos -- un cliente de la firma no debería poder marcarse como
 * el "encargo de Feriados". Distinto del eje approval_required cubierto arriba (0526-122).
 */
const engagementInternal = {
  engagement_id: "eng-internal",
  engagement_code: "INT.01",
  engagement_name: "Feriados y Licencias",
  approval_required: true,
  is_internal: true,
};
const engagementExternal = {
  engagement_id: "eng-external",
  engagement_code: "EXT.01",
  engagement_name: "Auditoria Cliente X",
  approval_required: true,
  is_internal: false,
};

describe("Settings — holiday engagement is_internal filter (BUG 0828-186)", () => {
  beforeEach(() => {
    engagementsRef.current = [engagementInternal, engagementExternal];
  });

  it("only offers is_internal=true engagements as holiday selector options", async () => {
    const user = await openGlobalSettingsTab();

    const trigger = document.getElementById("holidayEngagement");
    await user.click(trigger!);
    const options = await screen.findAllByRole("option");

    expect(options.some((o) => o.textContent?.includes("INT.01"))).toBe(true);
    expect(options.some((o) => o.textContent?.includes("EXT.01"))).toBe(false);
  });
});
