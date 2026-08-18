import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;

  if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  // Radix Select calls scrollIntoView on open; jsdom lacks it.
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
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({
    blocker: { state: "unblocked" as const },
    allowNextNavigation: vi.fn(),
    isDirty: false,
  }),
}));

const AUD = "svc-aud";
const CON = "svc-con";

const mockServices = [
  { service_id: AUD, name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "", abbreviation: "AUD" },
  { service_id: CON, name: "Consultoría", code: 2, allows_rates_activities: true, is_active: true, created_at: "", abbreviation: "CON" },
];

const audService = mockServices[0];
const conService = mockServices[1];

// 0817-177: activity_codes.service_id is NOT NULL — every row is
// práctica-linked, there is no more "Global" bucket to test.
const mockActivityCodes = [
  { activity_id: "a1", activity_code: "AUD-01", description: "Planificación de auditoría", is_active: true, service_id: AUD, entity_type: "A", service: audService },
  { activity_id: "a2", activity_code: "AUD-02", description: "Trabajo de campo", is_active: true, service_id: AUD, entity_type: "A", service: audService },
  { activity_id: "c1", activity_code: "CON-01", description: "Diagnóstico inicial", is_active: true, service_id: CON, entity_type: "A", service: conService },
];

// Mutable so a test can simulate useServices() not having resolved yet.
let mockServicesData: typeof mockServices | undefined = mockServices;

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [], isLoading: false }),
  useIndustries: () => ({ data: [], isLoading: false }),
  useGlobalSettings: () => ({
    data: [
      { setting_key: "LANGUAGE", setting_value: "en" },
      { setting_key: "ALLOW_WEEKEND_TRACKING", setting_value: "false" },
      { setting_key: "COMPACT_FONT", setting_value: "false" },
      { setting_key: "ALLOWED_EMAIL_DOMAIN", setting_value: "" },
      { setting_key: "TAX_RATE", setting_value: "0.13" },
      { setting_key: "REALIZATION_LIMIT", setting_value: "75" },
      { setting_key: "DAILY_MIN", setting_value: "8" },
      { setting_key: "DAILY_MAX", setting_value: "8" },
      { setting_key: "WEEKLY_MIN", setting_value: "40" },
      { setting_key: "WEEKLY_MAX", setting_value: "40" },
    ],
    isLoading: false,
  }),
  useActivityCodes:    () => ({ data: mockActivityCodes, isLoading: false }),
  useAllActivityCodes: () => ({ data: mockActivityCodes, isLoading: false }),
  useExpenseTypes:     () => ({ data: [], isLoading: false }),
  useSkills: () => ({ data: [], isLoading: false }),
  useEngagements: () => ({ data: [], isLoading: false }),
  useServices: () => ({ data: mockServicesData, isLoading: !mockServicesData }),
  useTaxonomies: () => ({ data: [], isLoading: false }),
}));

const createActivityMutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/hooks/mutations", () => ({
  useUpdateGlobalSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMoveCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCreateActivityCode: () => ({ mutateAsync: createActivityMutateAsync, isPending: false }),
  useUpdateActivityCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeactivateServiceActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReactivateServiceActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useAuthorization", () => ({ useAuthorization: () => ({ can: () => true, roleKey: "admin" }) }));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: () => <div data-testid="leave-page-dialog" />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));
vi.mock("@/components/settings/UserRolesManager", () => ({ UserRolesManager: () => <div /> }));
vi.mock("@/components/settings/ChangePasswordCard", () => ({ ChangePasswordCard: () => <div /> }));
vi.mock("@/components/settings/HolidaysManager", () => ({ HolidaysManager: () => <div /> }));

// ActivityCodeForm is intentionally NOT mocked so the real form (práctica
// locked/pre-selected) mounts.

import Settings from "../Settings";

describe("Settings activity-codes (0723-169 / 0817-177)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    createActivityMutateAsync.mockResolvedValue({});
    mockServicesData = mockServices;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  const renderSettings = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <Settings />
      </QueryClientProvider>
    );

  // 0817-177: Actividades is now a sub-tab under the unified "settings.services"
  // (Prácticas) tab. This suite grants both category_rate.read and
  // activity_code.read, so Categorías is the default sub-tab — switch explicitly.
  const goToActivities = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("tab", { name: "settings.services" }));
    await user.click(screen.getByRole("tab", { name: "settings.activityCodes" }));
  };

  it("shared práctica selector has one option per eligible service, no 'Global'", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);

    await user.click(screen.getByTestId("practice-selector"));
    expect(await screen.findByRole("option", { name: "Auditoría" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Consultoría" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "activity.global" })).not.toBeInTheDocument();
  });

  it("defaults to the first eligible práctica (Auditoría)", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);

    await waitFor(() => expect(screen.getByText("Planificación de auditoría")).toBeInTheDocument());
    expect(screen.getByText("Trabajo de campo")).toBeInTheDocument();
    expect(screen.queryByText("Diagnóstico inicial")).not.toBeInTheDocument();
  });

  it("selecting a práctica shows only that práctica's activity codes (shared with Categorías)", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);
    await waitFor(() => expect(screen.getByText("Planificación de auditoría")).toBeInTheDocument());

    await user.click(screen.getByTestId("practice-selector"));
    const conOption = await screen.findByRole("option", { name: "Consultoría" });
    await user.click(conOption);

    await waitFor(() => expect(screen.getByText("Diagnóstico inicial")).toBeInTheDocument());
    expect(screen.queryByText("Planificación de auditoría")).not.toBeInTheDocument();
    expect(screen.queryByText("Trabajo de campo")).not.toBeInTheDocument();
  });

  it("renders zero activity rows while the default-selection effect hasn't fired yet", async () => {
    mockServicesData = undefined;
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);

    expect(screen.queryByText("Planificación de auditoría")).not.toBeInTheDocument();
    expect(screen.queryByText("Diagnóstico inicial")).not.toBeInTheDocument();
  });

  it("'+ Nueva' opens the form with the selected práctica locked/pre-selected", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);
    await waitFor(() => expect(screen.getByText("Planificación de auditoría")).toBeInTheDocument());

    await user.click(screen.getByText("activity.newActivity"));

    // Práctica pre-selected and locked: the code field is already read-only
    // with an auto-generated preview, and there is no práctica selector.
    await waitFor(() => expect(screen.getByTestId("activity-code-readonly")).toBeInTheDocument());
    expect(screen.queryByTestId("activity-service-select")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("activity.descriptionPlaceholder"), "Nueva actividad");
    await user.click(screen.getByRole("button", { name: "activity.createActivity" }));

    await waitFor(() =>
      expect(createActivityMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ service_id: AUD, entity_type: "A", description: "Nueva actividad" })
      )
    );
  });

  it("switching to a práctica without an abbreviation disables creation and shows a notice", async () => {
    const NO_ABBR = "svc-no-abbr";
    mockServicesData = [
      ...mockServices,
      { service_id: NO_ABBR, name: "SinAbrev", code: 4, allows_rates_activities: true, is_active: true, created_at: "", abbreviation: null },
    ];
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);
    await waitFor(() => expect(screen.getByText("Planificación de auditoría")).toBeInTheDocument());

    await user.click(screen.getByTestId("practice-selector"));
    const option = await screen.findByRole("option", { name: "SinAbrev" });
    await user.click(option);

    expect(await screen.findByTestId("activity-abbreviation-missing-notice")).toBeInTheDocument();
    expect(screen.queryByText("activity.newActivity")).not.toBeInTheDocument();
  });
});
