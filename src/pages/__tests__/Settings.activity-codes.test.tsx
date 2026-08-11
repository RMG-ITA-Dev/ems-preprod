import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

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

const mockActivityCodes = [
  { activity_id: "a1", activity_code: "AUD-01", description: "Planificación de auditoría", is_active: true, service_id: AUD, entity_type: "A", service: audService },
  { activity_id: "a2", activity_code: "AUD-02", description: "Trabajo de campo", is_active: true, service_id: AUD, entity_type: "A", service: audService },
  { activity_id: "c1", activity_code: "CON-01", description: "Diagnóstico inicial", is_active: true, service_id: CON, entity_type: "A", service: conService },
  { activity_id: "g1", activity_code: "001", description: "Reunión interna", is_active: true, service_id: null, entity_type: "A" },
  { activity_id: "g2", activity_code: "002", description: "Capacitación", is_active: true, service_id: null, entity_type: "A" },
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
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMoveCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCreateActivityCode: () => ({ mutateAsync: createActivityMutateAsync, isPending: false }),
  useUpdateActivityCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteActivityCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
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
// pre-selection, Global labels) mounts.

import Settings from "../Settings";

describe("Settings activity-codes (0723-169)", () => {
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

  const goToActivities = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByText("settings.activityCodes"));
  };

  it("Práctica selector renders one option per eligible service plus Global", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);

    await user.click(screen.getByTestId("activity-service-filter"));
    expect(await screen.findByRole("option", { name: "Auditoría" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Consultoría" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "activity.global" })).toBeInTheDocument();
  });

  it("defaults to the first active práctica (Auditoría), not Global", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);

    await waitFor(() => expect(screen.getByText("Planificación de auditoría")).toBeInTheDocument());
    expect(screen.getByText("Trabajo de campo")).toBeInTheDocument();
    expect(screen.queryByText("Diagnóstico inicial")).not.toBeInTheDocument();
    expect(screen.queryByText("Reunión interna")).not.toBeInTheDocument();
  });

  it("selecting a práctica shows only that práctica's activity codes", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);
    await waitFor(() => expect(screen.getByText("Planificación de auditoría")).toBeInTheDocument());

    await user.click(screen.getByTestId("activity-service-filter"));
    const conOption = await screen.findByRole("option", { name: "Consultoría" });
    await user.click(conOption);

    await waitFor(() => expect(screen.getByText("Diagnóstico inicial")).toBeInTheDocument());
    expect(screen.queryByText("Planificación de auditoría")).not.toBeInTheDocument();
    expect(screen.queryByText("Trabajo de campo")).not.toBeInTheDocument();
    expect(screen.queryByText("Reunión interna")).not.toBeInTheDocument();
  });

  it("selecting Global shows only unlinked codes and labels them 'Global' in the Service column", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);
    await waitFor(() => expect(screen.getByText("Planificación de auditoría")).toBeInTheDocument());

    await user.click(screen.getByTestId("activity-service-filter"));
    const globalOption = await screen.findByRole("option", { name: "activity.global" });
    await user.click(globalOption);

    await waitFor(() => expect(screen.getByText("Reunión interna")).toBeInTheDocument());
    expect(screen.getByText("Capacitación")).toBeInTheDocument();
    expect(screen.queryByText("Planificación de auditoría")).not.toBeInTheDocument();
    expect(screen.queryByText("Diagnóstico inicial")).not.toBeInTheDocument();
    // The Service column renders the "Global" label (i18n key, mocked as literal) for these rows.
    expect(screen.getAllByText("activity.global").length).toBeGreaterThan(0);
  });

  it("renders zero rows (never the full unfiltered list) while the default-selection effect hasn't fired yet", async () => {
    mockServicesData = undefined;
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);

    expect(screen.queryByText("Planificación de auditoría")).not.toBeInTheDocument();
    expect(screen.queryByText("Diagnóstico inicial")).not.toBeInTheDocument();
    expect(screen.queryByText("Reunión interna")).not.toBeInTheDocument();
  });

  it("'+ Nueva' while a práctica is selected opens the form with that práctica pre-selected", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);
    await waitFor(() => expect(screen.getByText("Planificación de auditoría")).toBeInTheDocument());

    await user.click(screen.getByText("activity.newActivity"));

    // Pre-selection means the form already treats this as service-linked:
    // the code field renders read-only with an auto-generated preview,
    // without the user having to touch the form's own selector.
    await waitFor(() => expect(screen.getByTestId("activity-code-readonly")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("activity.descriptionPlaceholder"), "Nueva actividad");
    await user.click(screen.getByRole("button", { name: "activity.createActivity" }));

    await waitFor(() =>
      expect(createActivityMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ service_id: AUD, entity_type: "A", description: "Nueva actividad" })
      )
    );
  });

  it("'+ Nueva' while 'Global' is selected opens the form defaulting to Global (legacy/manual-code path)", async () => {
    renderSettings();
    const user = userEvent.setup();
    await goToActivities(user);
    await waitFor(() => expect(screen.getByText("Planificación de auditoría")).toBeInTheDocument());

    await user.click(screen.getByTestId("activity-service-filter"));
    const globalOption = await screen.findByRole("option", { name: "activity.global" });
    await user.click(globalOption);
    await waitFor(() => expect(screen.getByText("Reunión interna")).toBeInTheDocument());

    await user.click(screen.getByText("activity.newActivity"));

    // No práctica pre-selected: code stays manual/editable, not auto-generated.
    expect(screen.queryByTestId("activity-code-readonly")).not.toBeInTheDocument();
  });
});
