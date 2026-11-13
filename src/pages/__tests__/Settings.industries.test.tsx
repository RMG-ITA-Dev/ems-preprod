import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 1028-218: Settings › Industrias muestra y filtra `industries.status`.
 * - Columna Estado con badge activo/inactivo (también en la card móvil, sin expandir).
 * - Embudo de la columna Estado en escritorio (requiere `filterKey`).
 * - En móvil, un Select en la cabecera que comparte el mismo estado del filtro.
 * - Abre en "Todos" y el filtro no depende del permiso de escritura.
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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const mobileMock = vi.hoisted(() => ({ isMobile: false }));
vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => mobileMock.isMobile,
}));

const mockIndustries = [
  { industry_id: "i1", industry_name: "Banking", fiscal_year_end: "December 31", status: "active" },
  { industry_id: "i2", industry_name: "(RETIRADO) Chemicals", fiscal_year_end: "March 31", status: "inactive" },
  { industry_id: "i3", industry_name: "Retail", fiscal_year_end: "December 31", status: "active" },
];

vi.mock("@/hooks/useEmsData", () => ({
  useCategories:       () => ({ data: [], isLoading: false }),
  useIndustries:       () => ({ data: mockIndustries, isLoading: false }),
  useGlobalSettings:   () => ({ data: [], isLoading: false }),
  useActivityCodes:    () => ({ data: [], isLoading: false }),
  useAllActivityCodes: () => ({ data: [], isLoading: false }),
  useExpenseTypes:     () => ({ data: [], isLoading: false }),
  useSkills:           () => ({ data: [], isLoading: false }),
  useEngagements:      () => ({ data: [] }),
  useServices:         () => ({ data: [], isLoading: false }),
  useTaxonomies:       () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

const authMock = vi.hoisted(() => ({
  roleKey: "admin" as string,
  permissions: new Set<string>(["industry.read", "industry.create"]),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: (key: string) => authMock.permissions.has(key),
    roleKey: authMock.roleKey,
  }),
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

vi.mock("@/components/forms/IndustryForm", () => ({ IndustryForm: () => null }));

vi.mock("@/lib/fiscalYearDisplay", () => ({
  formatFiscalYearEnd: (v: string) => v,
  getFiscalYearOptions: () => [],
}));

import Settings from "@/pages/Settings";

async function openIndustries() {
  const user = userEvent.setup();
  render(<Settings />);
  await user.click(screen.getByRole("tab", { name: "settings.industries" }));
  return user;
}

/** Abre el embudo de la columna Estado y elige una opción. */
async function pickHeaderFilter(user: ReturnType<typeof userEvent.setup>, option: string) {
  const header = screen.getByRole("columnheader", { name: /common\.status/ });
  await user.click(header.querySelector("button")!);
  // Acotar al popover: la paginación tiene su propio combobox (filas por página).
  await user.click(within(await screen.findByRole("dialog")).getByRole("combobox"));
  await user.click(await screen.findByRole("option", { name: option }));
}

const visibleNames = () =>
  mockIndustries.map((i) => i.industry_name).filter((name) => screen.queryByText(name) !== null);

describe("Settings › Industrias — estado activo/inactivo (1028-218)", () => {
  beforeEach(() => {
    mobileMock.isMobile = false;
    authMock.roleKey = "admin";
    authMock.permissions = new Set(["industry.read", "industry.create"]);
  });

  it("opens on 'All' and shows a status badge per row", async () => {
    await openIndustries();

    expect(visibleNames()).toEqual(["Banking", "(RETIRADO) Chemicals", "Retail"]);
    const inactiveRow = screen.getByText("(RETIRADO) Chemicals").closest("tr")!;
    expect(within(inactiveRow).getByText("status.inactive")).toBeInTheDocument();
    const activeRow = screen.getByText("Banking").closest("tr")!;
    expect(within(activeRow).getByText("status.active")).toBeInTheDocument();
  });

  it("the Estado column header filter narrows to inactive, active, and back to all", async () => {
    const user = await openIndustries();

    await pickHeaderFilter(user, "status.inactive");
    expect(visibleNames()).toEqual(["(RETIRADO) Chemicals"]);

    await pickHeaderFilter(user, "status.active");
    expect(visibleNames()).toEqual(["Banking", "Retail"]);

    await pickHeaderFilter(user, "common.all");
    expect(visibleNames()).toEqual(["Banking", "(RETIRADO) Chemicals", "Retail"]);
  });

  it("the status filter composes with the name search", async () => {
    const user = await openIndustries();

    await pickHeaderFilter(user, "status.active");
    await user.type(screen.getByPlaceholderText("common.search"), "ret");

    // "Retail" pasa los dos filtros; "(RETIRADO) Chemicals" coincide con la búsqueda pero es inactiva.
    expect(visibleNames()).toEqual(["Retail"]);
  });

  it("works for a reader without write permission (no New button)", async () => {
    authMock.roleKey = "manager";
    authMock.permissions = new Set(["industry.read"]);
    const user = await openIndustries();

    expect(screen.queryByText("industry.newIndustry")).not.toBeInTheDocument();
    await pickHeaderFilter(user, "status.inactive");
    expect(visibleNames()).toEqual(["(RETIRADO) Chemicals"]);
  });

  it("on mobile, a header Select filters the cards and the badge shows without expanding", async () => {
    mobileMock.isMobile = true;
    const user = await openIndustries();

    // Sin expandir ninguna card, el badge (mobilePriority primary) ya se ve.
    expect(screen.getAllByText("status.active")).toHaveLength(2);
    expect(screen.getByText("status.inactive")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "common.status" }));
    await user.click(await screen.findByRole("option", { name: "status.inactive" }));

    expect(visibleNames()).toEqual(["(RETIRADO) Chemicals"]);
    expect(screen.getByRole("combobox", { name: "common.status" })).toHaveTextContent("status.inactive");
  });
});
