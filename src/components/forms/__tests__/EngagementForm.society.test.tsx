import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * FEAT 0714-155: EngagementForm — "Sociedad" select (engagements.society_id).
 * Behaves like oficina/practica/funcion: required only in creation (validated
 * manually, mirroring the onSubmit guard below), disabled in edit mode, and omitted
 * from the update payload (immutable after create). Named "society" (not "firma") per
 * operator decision (2026-08-13, bugs/0714-155/plan_v2.md §Open Questions #3) to stay
 * consistent with the existing staff.society/staff.selectSociety terminology (0810-173).
 *
 * The end-to-end "crear otro resets Sociedad to empty" path is covered together with
 * the existing full create-submit fixture in EngagementForm.servicesCatalog.test.tsx
 * (which already drives every other required field through a real submit) rather than
 * duplicating that heavy harness here.
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

// Mock Calendar with a simple date input and Popover as a passthrough (same convention as
// EngagementForm.servicesCatalog.test.tsx) so start_date/end_date — required by the Zod
// schema for onSubmit to even run — can be set without exercising the real react-day-picker.
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
  { service_id: "s1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "" },
];

// REVIEW FIX: useSocieties() filters is_active=true server-side (unlike useClients/
// useTaxonomies, which fetch every row and filter client-side) — mocking it with an
// inactive row here would mask the real production shape and let a broken fallback
// pass. Only active societies come from the catalog; the inactive historical one below
// is supplied through the engagement's `society` embed instead, same as production.
const mockSocieties = [
  { society_id: "soc-active-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "" },
  { society_id: "soc-active-2", name: "Ruizmier Juaregui S.R.L.", is_active: true, created_at: "" },
];

const inactiveSociety = { society_id: "soc-inactive", name: "Old Society S.R.L.", is_active: false, created_at: "" };

// Includes the client referenced by the edit-mode fixtures below so the client Select can
// resolve a matching SelectItem — Radix Select can't retain a `value` that has no
// corresponding item, which otherwise silently clears the field and fails zod validation
// (same gotcha documented in EngagementForm.code-generation.test.tsx).
const stableClients = [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }];
const stableTaxonomies: never[] = [];
const stableAssignments: never[] = [];
const stableAggregatedReqs: never[] = [];
const stableActiveStaff: never[] = [];
const stableCategories: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
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
    partners: [{ staff_id: "p1", first_name: "Juan", last_name: "Partner" }],
    partnerOptions: [{ value: "p1", label: "Juan Partner" }],
    managerOptions: [{ value: "m1", label: "Ana Manager" }],
    allActiveStaff: [],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

// BUG 0722-162: el bloque Equipo pasó a alimentarse de useEngagementTeamCandidates (RPC), así
// que sin este mock el hook real golpearía Supabase.
// Estos tests hacen submit completo, así que Socio y Gerente deben ser seleccionables.
// `serviceId: "s1"` es el servicio de Auditoría (code 1) de mockServices: los no-admin lo reciben
// auto-asignado en creación, y el filtro por servicio descartaría candidatos de otro service_id.
const stableTeamCandidates = {
  partnerDirectorOptions: [{ value: "p1", label: "Juan Partner", serviceId: "s1" }],
  managerRoleOptions: [{ value: "m1", label: "Ana Manager", serviceId: "s1" }],
  encargadoOptions: [],
  specialistItOptions: [],
  specialistTaxOptions: [],
  hasPartnerDirectorCandidates: true,
  hasManagerCandidates: true,
  isLoading: false,
  isError: false,
};
vi.mock("@/hooks/useEngagementTeamCandidates", () => ({
  useEngagementTeamCandidates: () => stableTeamCandidates,
}));

const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined);
const mockCreateMutateAsync = vi.fn();
vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

// The scheduler flag defaults to "true" in vitest.config.ts, so edit mode mounts
// StaffAssignmentsCard, which pulls useUserRole (-> useAuth). Mocked as a controllable vi.fn()
// (default non-admin) so the 0722-157 admin-editable-Sociedad tests can flip it per test —
// same convention as EngagementForm.servicesCatalog.test.tsx. `useAuthorization` derives
// `roleKey` from it at call time (not at mock-hoist time) so both mocks stay in sync.
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: vi.fn() }));
vi.mock("@/hooks/useAuthorization", async () => {
  const { useUserRole } = await import("@/hooks/useUserRole");
  return {
    useAuthorization: () => ({
      can: () => true,
      roleKey: (useUserRole() as unknown as { isAdmin?: boolean })?.isAdmin ? "admin" : "manager",
    }),
  };
});

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

import { useUserRole } from "@/hooks/useUserRole";
import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

const mockEngagementWithSociety: Engagement = {
  engagement_id: "eng-soc-1",
  client_id: "client-1",
  engagement_name: "Old Client Engagement",
  engagement_code: "2026.011.002",
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
  society_id: "soc-inactive",
  society: inactiveSociety,
};

const mockEngagementNullSociety: Engagement = {
  ...mockEngagementWithSociety,
  engagement_id: "eng-soc-2",
  society_id: null,
  society: undefined,
};

describe("EngagementForm — Sociedad select (FEAT 0714-155)", () => {
  beforeEach(() => {
    mockUpdateMutateAsync.mockClear();
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: false, isLoading: false } as any);
  });

  it("renders the label with an asterisk", () => {
    render(<EngagementForm />);
    expect(screen.getByText((_, el) => el?.textContent === "engagement.society *")).toBeInTheDocument();
  });

  it("create mode: opening the select lists only active societies", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    await user.click(screen.getByLabelText(/engagement\.society/));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Ruizmier Pelaez S.R.L." })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Ruizmier Juaregui S.R.L." })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Old Society S.R.L." })).not.toBeInTheDocument();
    });
  });

  it("edit mode: the select is disabled (immutable after create, like oficina/practica/funcion)", () => {
    render(<EngagementForm engagement={mockEngagementWithSociety} />);
    expect(screen.getByLabelText(/engagement\.society/)).toBeDisabled();
  });

  it("edit mode: shows the current society even though it is now inactive", () => {
    render(<EngagementForm engagement={mockEngagementWithSociety} />);
    expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("Old Society S.R.L.");
  });

  it("edit mode: a historical engagement with society_id=null shows the unanswered placeholder", () => {
    render(<EngagementForm engagement={mockEngagementNullSociety} />);
    expect(screen.getByLabelText(/engagement\.society/)).toHaveTextContent("engagement.selectSociety");
  });

  it("edit mode: saving does not send society_id in the update payload (immutable by omission)", async () => {
    const user = userEvent.setup();
    render(<EngagementForm engagement={mockEngagementWithSociety} />);

    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    const [[call]] = mockUpdateMutateAsync.mock.calls;
    expect(call.data).not.toHaveProperty("society_id");
  });

  // 0722-157: Admin may edit Sociedad after creation (frontend-only, no DB guard — OQ4);
  // every other role keeps seeing it disabled, unchanged from the block above.
  describe("admin-only editable after creation (0722-157)", () => {
    beforeEach(() => {
      vi.mocked(useUserRole).mockReturnValue({ isAdmin: true, isLoading: false } as any);
    });

    it("edit mode: the select is enabled for admin", () => {
      render(<EngagementForm engagement={mockEngagementWithSociety} />);
      expect(screen.getByLabelText(/engagement\.society/)).not.toBeDisabled();
    });

    it("edit mode: admin changing Sociedad sends the new society_id in the update payload", async () => {
      const user = userEvent.setup();
      render(<EngagementForm engagement={mockEngagementWithSociety} />);

      await user.click(screen.getByLabelText(/engagement\.society/));
      await waitFor(() => screen.getByRole("option", { name: "Ruizmier Juaregui S.R.L." }));
      await user.click(screen.getByRole("option", { name: "Ruizmier Juaregui S.R.L." }));

      await user.click(screen.getByRole("button", { name: "common.saveChanges" }));

      await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
      const [[call]] = mockUpdateMutateAsync.mock.calls;
      expect(call.data).toMatchObject({ society_id: "soc-active-2" });
    });
  });
});

describe("EngagementForm — Sociedad required in creation (real submit, FEAT 0714-155)", () => {
  beforeEach(() => {
    mockCreateMutateAsync.mockClear();
    vi.mocked(useUserRole).mockReturnValue({ isAdmin: false, isLoading: false } as any);
  });

  // REVIEW FIX: the previous version of this describe block only re-implemented the
  // onSubmit guard as a standalone `isSocietyMissing` helper and asserted against that
  // copy — it never rendered the form or submitted it, so it couldn't catch a regression
  // in the actual guard. This drives a real submit through every other required field
  // (mirroring EngagementForm.servicesCatalog.test.tsx's create-and-reset fixture) while
  // leaving Sociedad untouched.
  it("blocks submit and shows requiredSociety when Sociedad is left unselected", async () => {
    const user = userEvent.setup();
    render(<EngagementForm />);

    await user.type(screen.getByLabelText(/engagement\.name/), "Test Engagement Alpha");

    const clientSelect = screen.getByLabelText(/engagement\.client/);
    await user.click(clientSelect);
    await waitFor(() => screen.getByRole("option", { name: "Test Client" }));
    await user.click(screen.getByRole("option", { name: "Test Client" }));

    const partnerSelect = screen.getByLabelText(/engagement\.partner/);
    await user.click(partnerSelect);
    // BUG 0722-162: Socio/Director y SQR comparten el conjunto de candidatos (ambos piden Socio
    // o Director), y el mock de Popover de arriba renderiza todos los popovers a la vez — así que
    // "Juan Partner" aparece dos veces. El [0] es el del campo Socio/Director, que va primero.
    await waitFor(() => screen.getAllByRole("option", { name: "Juan Partner" }));
    await user.click(screen.getAllByRole("option", { name: "Juan Partner" })[0]);

    const managerSelect = screen.getByLabelText(/engagement\.manager/);
    await user.click(managerSelect);
    await waitFor(() => screen.getByRole("option", { name: "Ana Manager" }));
    await user.click(screen.getByRole("option", { name: "Ana Manager" }));

    const calendars = screen.getAllByTestId("calendar-mock");
    fireEvent.change(calendars[0], { target: { value: "2026-10-01" } });
    fireEvent.change(calendars[1], { target: { value: "2027-09-30" } });

    const oficina = screen.getByLabelText(/engagement\.oficina/);
    await user.click(oficina);
    await waitFor(() => screen.getByRole("option", { name: "engagement.oficina_ambos" }));
    await user.click(screen.getByRole("option", { name: "engagement.oficina_ambos" }));

    // funcion_adm (0) avoids the Cliente-only taxonomy requirement, same as the sibling fixture.
    const funcion = screen.getByLabelText(/engagement\.funcion/);
    await user.click(funcion);
    await waitFor(() => screen.getByRole("option", { name: "engagement.funcion_adm" }));
    await user.click(screen.getByRole("option", { name: "engagement.funcion_adm" }));

    const closingDate = screen.getByRole("combobox", { name: "engagement.closingDate *" });
    await user.click(closingDate);
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole("option")[0]);

    // Sociedad is intentionally left unselected — submit without touching it.
    await user.click(screen.getByText("engagement.createEngagement"));

    await waitFor(() => {
      expect(screen.getByText("engagement.requiredSociety")).toBeInTheDocument();
    });
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  }, 15000);
});
