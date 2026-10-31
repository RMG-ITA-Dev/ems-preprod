import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 1028-215: Configuración loads each tab's catalog only while that tab (or
 * Prácticas sub-tab) is active. The data hooks are spies that record the
 * `enabled` option of their latest call; the hooks' own suite proves that
 * `enabled: false` issues no request.
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

const hooks = vi.hoisted(() => {
  const services = [
    { practica_id: "s1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "", abbreviation: "AUD" },
  ];
  const state = { servicesLoading: false };
  const spy = (data: unknown[]) => vi.fn((_options?: { enabled?: boolean }) => ({ data, isLoading: false }));
  return {
    state,
    services,
    useIndustries: spy([]),
    useAllActivityCodes: spy([]),
    useExpenseTypes: spy([]),
    useSkills: spy([]),
    useTaxonomies: vi.fn((_options?: { enabled?: boolean }) => ({
      data: [{ taxonomy_id: "t1", code: "10", name: "Revisión", practica_id: "s1", is_active: true, created_at: "" }],
      isLoading: false,
    })),
    useEngagements: spy([]),
    useServices: vi.fn((_options?: { enabled?: boolean }) => ({
      data: state.servicesLoading ? undefined : services,
      isLoading: state.servicesLoading,
    })),
    useCategories: vi.fn((_serviceId?: string, _options?: { enabled?: boolean }) => ({ data: [], isLoading: false })),
  };
});

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: hooks.useCategories,
  useIndustries: hooks.useIndustries,
  useGlobalSettings: () => ({ data: [], isLoading: false }),
  useAllActivityCodes: hooks.useAllActivityCodes,
  useExpenseTypes: hooks.useExpenseTypes,
  useSkills: hooks.useSkills,
  useEngagements: hooks.useEngagements,
  useServices: hooks.useServices,
  useTaxonomies: hooks.useTaxonomies,
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "admin" }),
}));

vi.mock("@/hooks/mutations", () => ({
  useUpdateGlobalSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMoveCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
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

// Forms and managers have their own suites; stubbing them keeps their hooks out of this one.
vi.mock("@/components/forms/IndustryForm", () => ({ IndustryForm: () => null }));
vi.mock("@/components/forms/CategoryForm", () => ({ CategoryForm: () => null }));
vi.mock("@/components/forms/ActivityCodeForm", () => ({ ActivityCodeForm: () => null }));
vi.mock("@/components/forms/ExpenseTypeForm", () => ({ ExpenseTypeForm: () => null }));
vi.mock("@/components/forms/SkillForm", () => ({ SkillForm: () => null }));
vi.mock("@/components/forms/ServiceForm", () => ({ ServiceForm: () => null }));
vi.mock("@/components/forms/TaxonomyForm", () => ({ TaxonomyForm: () => null }));
vi.mock("@/components/settings/UserRolesManager", () => ({ UserRolesManager: () => null }));
vi.mock("@/components/settings/ChangePasswordCard", () => ({ ChangePasswordCard: () => null }));
vi.mock("@/components/settings/HolidaysManager", () => ({ HolidaysManager: () => null }));
vi.mock("@/components/ui/leave-page-dialog", () => ({ LeavePageDialog: () => null }));

vi.mock("@/lib/fiscalYearDisplay", () => ({
  formatFiscalYearEnd: () => "",
  getFiscalYearOptions: () => [],
}));

import Settings from "@/pages/Settings";

type Gated = "industries" | "skills" | "expenseTypes" | "services" | "activities" | "categories" | "taxonomies" | "engagements";

const lastEnabled = (mock: { mock: { calls: unknown[][] } }, argIndex = 0) => {
  const calls = mock.mock.calls;
  const options = calls[calls.length - 1]?.[argIndex] as { enabled?: boolean } | undefined;
  return options?.enabled;
};

const enabledState = (): Record<Gated, boolean | undefined> => ({
  industries: lastEnabled(hooks.useIndustries),
  skills: lastEnabled(hooks.useSkills),
  expenseTypes: lastEnabled(hooks.useExpenseTypes),
  services: lastEnabled(hooks.useServices),
  activities: lastEnabled(hooks.useAllActivityCodes),
  categories: lastEnabled(hooks.useCategories, 1),
  taxonomies: lastEnabled(hooks.useTaxonomies),
  engagements: lastEnabled(hooks.useEngagements),
});

const onlyEnabled = (...keys: Gated[]) => {
  const all: Gated[] = ["industries", "skills", "expenseTypes", "services", "activities", "categories", "taxonomies", "engagements"];
  return Object.fromEntries(all.map((k) => [k, keys.includes(k)]));
};

describe("Settings — lazy loading per tab (1028-215)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.state.servicesLoading = false;
  });

  it("on entry (Cuenta active) no catalog query is enabled", () => {
    render(<Settings />);
    expect(enabledState()).toEqual(onlyEnabled());
  });

  it.each([
    ["settings.industries", "industries"],
    ["settings.skills", "skills"],
    ["settings.expenseTypes", "expenseTypes"],
  ] as const)("visiting %s enables only its own catalog", async (tabName, key) => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: tabName }));
    expect(enabledState()).toEqual(onlyEnabled(key));
  });

  it("Prácticas opens on Categorías: prácticas + categories, not activities", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.services" }));
    expect(enabledState()).toEqual(onlyEnabled("services", "categories"));
  });

  it("switching to the Actividades sub-tab enables activities and disables categories", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.services" }));
    await user.click(screen.getByRole("tab", { name: "settings.activityCodes" }));
    expect(enabledState()).toEqual(onlyEnabled("services", "activities"));
  });

  it("Servicios enables taxonomies and prácticas (its column shows the práctica name)", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.taxonomies" }));
    expect(enabledState()).toEqual(onlyEnabled("taxonomies", "services"));
    expect(screen.getAllByText("Auditoría").length).toBeGreaterThan(0);
  });

  it("Servicios keeps its loader while prácticas load instead of showing the 'global' fallback", async () => {
    hooks.state.servicesLoading = true;
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.taxonomies" }));
    expect(screen.queryByText("Revisión")).not.toBeInTheDocument();
    expect(screen.queryByText("taxonomy.global")).not.toBeInTheDocument();
  });

  it("Configuración Global enables engagements only", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByRole("tab", { name: "settings.globalSettings" }));
    expect(enabledState()).toEqual(onlyEnabled("engagements"));
  });
});
