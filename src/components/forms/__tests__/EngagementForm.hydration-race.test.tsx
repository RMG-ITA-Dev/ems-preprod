import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * BUG #0819-181: EngagementForm — hydration race in edit mode.
 *
 * On a cold cache, useClients() resolves AFTER the form mounts. The fiscal-year
 * derivation effect used to fire immediately on mount against the still-empty
 * placeholder defaults, overwriting anio_fiscal (suggestFiscalYear() → undefined).
 * Despite `shouldDirty: false`, react-hook-form recomputes the global `isDirty`
 * as a deep comparison against the defaultValues frozen at mount — so the form
 * became (falsely) dirty, and the populate effect (which required `!isDirty`)
 * never ran its form.reset(): a circular deadlock that left "Editar Encargo"
 * permanently blank until the user left and re-entered the page.
 *
 * The fix (bugs/0819-181/plan_v2.md): (A) the derivation effect waits for the
 * engagement's real data to be loaded (`engagementLoaded` via
 * initializedEngagementIdRef) before touching anio_fiscal in edit mode, and
 * (B) the populate effect no longer depends on `isDirty` at all — only on the
 * ref that marks "already initialized this engagement".
 *
 * These tests drive `clients` from undefined → resolved on the SAME component
 * instance (rerender, no remount), reproducing the exact sequence observed in
 * the live debugging session.
 *
 * RHF only re-runs the global isDirty deep-comparison when something emits into
 * its state (any change event does; in production the app's own re-render churn
 * while queries resolve provides plenty). jsdom with fully static mocks emits
 * nothing on its own, so Tests 1/3 include a neutral keystroke+backspace during
 * the pending window — it leaves every value at its default and dirtyFields
 * empty (exactly the observed bug state), but forces the recompute the same way
 * any real event does. Verified: with that trigger, Tests 1 and 3 fail against
 * the pre-fix EngagementForm.tsx (populate deadlock) and pass with the fix.
 */

if (typeof (globalThis as any).PointerEvent === "undefined") {
  (globalThis as any).PointerEvent = MouseEvent;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
Element.prototype.scrollIntoView = () => {};
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// Same Calendar/Popover convention as EngagementForm.society.test.tsx so the date
// pickers render without exercising the real react-day-picker.
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: any) => (
    <input
      data-testid="calendar-mock"
      type="date"
      onChange={(e) => e.target.value && onSelect(new Date(e.target.value + "T12:00:00"))}
    />
  ),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover:        ({ children }: any) => <>{children}</>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <>{children}</>,
}));

const mockServices = [
  { practica_id: "s1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
];

const mockSocieties = [
  { society_id: "soc-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "" },
];

const stableClients = [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }];
const stableTaxonomies: never[] = [];
const stableAssignments: never[] = [];
const stableAggregatedReqs: never[] = [];
const stableActiveStaff: never[] = [];
const stableCategories: never[] = [];

// Mutable on purpose: each test starts it as undefined (clients still pending) and
// flips it to the resolved list mid-test, mimicking React Query resolving the query
// and re-rendering the SAME mounted instance.
let clientsData: typeof stableClients | undefined = undefined;

vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: clientsData }),
  useServices: () => ({ data: mockServices }),
  useTaxonomies: () => ({ data: stableTaxonomies }),
  useSocieties: () => ({ data: mockSocieties }),
  useEngagementAssignments: () => ({ data: stableAssignments, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableAggregatedReqs }),
  useActiveStaffWithSkills: () => ({ data: stableActiveStaff }),
  useCategories: () => ({ data: stableCategories }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [{ staff_id: "staff-partner", first_name: "Juan", last_name: "Partner" }],
    partnerOptions: [{ value: "staff-partner", label: "Juan Partner" }],
    managerOptions: [{ value: "staff-manager", label: "Ana Manager" }],
    allActiveStaff: [],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "manager" }),
}));

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";
import { getUpcomingClosingDates, getFiscalYearForDate } from "@/lib/fiscalCalculations";

// fecha_cierre/anio_fiscal are self-consistent (Sep 30 closing → FY 2026) so that, once
// hydrated, the re-enabled derivation effect derives the very same year the reset() put in
// — any divergence would itself be a regression of the fix.
const mockEngagement: Engagement = {
  engagement_id: "eng-race-1",
  client_id: "client-1",
  engagement_name: "Hydration Race Engagement",
  engagement_code: "2026.011.003",
  partner_id: "staff-partner",
  manager_id: "staff-manager",
  status: "active",
  start_date: "2025-10-01",
  end_date: "2026-09-30",
  created_at: "2025-10-01T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 0,
  practica: 1,
  funcion: 0,
  anio_fiscal: 2026,
  fecha_cierre: "2026-09-30",
  anio_fiscal_override: false,
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  taxonomy_id: null,
  contract_file_path: null,
  society_id: "soc-1",
  society: mockSocieties[0],
};

describe("EngagementForm — hydration race (BUG #0819-181)", () => {
  it("Test 1: populates the form once clients resolve late, without remounting", async () => {
    clientsData = undefined;
    const user = userEvent.setup();
    const { rerender } = render(<EngagementForm engagement={mockEngagement} />);

    // While clients are still pending, the form sits on its blank creation defaults.
    expect(screen.getByLabelText(/engagement\.name/)).toHaveValue("");

    // Neutral interaction inside the pending window (see file header): ends with every
    // value back at its default and dirtyFields empty, but makes RHF recompute isDirty —
    // pre-fix, the derivation effect had already overwritten anio_fiscal, so this flipped
    // isDirty to true and deadlocked the populate effect forever.
    const nameInput = screen.getByLabelText(/engagement\.name/);
    await user.type(nameInput, "x");
    await user.type(nameInput, "{backspace}");
    expect(nameInput).toHaveValue("");

    // clients resolve — same instance, no unmount. Against the pre-fix code this rerender
    // never populated the form (the false-dirty deadlock) and the waitFor below timed out.
    clientsData = stableClients;
    rerender(<EngagementForm engagement={mockEngagement} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.name/)).toHaveValue("Hydration Race Engagement");
    });
    expect(screen.getByLabelText(/engagement\.client/)).toHaveTextContent("Test Client");
    expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Ruizmier Pelaez S.R.L.");
    expect(screen.getByLabelText(/engagement\.oficina/)).toHaveTextContent("engagement.oficina_ambos");
    expect(screen.getByLabelText(/engagement\.practica/)).toHaveTextContent("Auditoría");
    expect(screen.getByLabelText(/engagement\.funcion/)).toHaveTextContent("engagement.funcion_adm");
    // The (now gated) derivation effect ran after hydration and kept the engagement's own FY.
    await waitFor(() => {
      expect(screen.getByTestId("anio-fiscal-derived")).toHaveValue("2026");
    });
  });

  it("Test 2: create mode still derives the fiscal year from the closing date (BUG #0604-143 regression)", async () => {
    clientsData = stableClients;
    const user = userEvent.setup();
    render(<EngagementForm />);

    const closingDate = screen.getByRole("combobox", { name: "engagement.closingDate *" });
    await user.click(closingDate);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("option")[0]);

    // The Select lists getUpcomingClosingDates() in order, so option[0] is the first upcoming
    // closing date; the derived FY must follow it (Oct 1 – Sep 30 fiscal calendar).
    const expectedFiscalYear = getFiscalYearForDate(getUpcomingClosingDates()[0].date);
    await waitFor(() => {
      expect(screen.getByTestId("anio-fiscal-derived")).toHaveValue(String(expectedFiscalYear));
    });
  });

  it("Test 3: late hydration never reports a spurious dirty state to the page-leave lock", async () => {
    clientsData = undefined;
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    const { rerender } = render(
      <EngagementForm engagement={mockEngagement} onDirtyChange={onDirtyChange} />
    );

    // Same neutral trigger as Test 1: value churn is legitimate dirty-reporting while the
    // "x" exists, so only what gets reported AFTER the field is back at its default counts.
    const nameInput = screen.getByLabelText(/engagement\.name/);
    await user.type(nameInput, "x");
    await user.type(nameInput, "{backspace}");

    clientsData = stableClients;
    rerender(<EngagementForm engagement={mockEngagement} onDirtyChange={onDirtyChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/engagement\.name/)).toHaveValue("Hydration Race Engagement");
    });

    // EngagementEdit feeds exactly this callback into usePageLeaveLock. Once hydration's
    // form.reset() lands, the reported state must settle on dirty=false — the user changed
    // nothing. Pre-fix, the derivation effect's overwrite of anio_fiscal kept the deep
    // comparison dirty forever (with dirtyFields empty): the reset never ran, the last
    // report stayed true, and the page-leave lock armed itself on a pristine form.
    await waitFor(() => {
      expect(onDirtyChange.mock.calls.at(-1)).toEqual([false]);
    });
  });
});
