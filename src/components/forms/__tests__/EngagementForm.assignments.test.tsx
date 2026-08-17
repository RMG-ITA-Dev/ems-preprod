import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@/test/utils";

/**
 * Fase 5 (bugs/scheduler/fase_5/plan_v2.md §6): EngagementForm integrates
 * StaffAssignmentsCard for a persisted Engagement only, keeps a combined dirty state, and never
 * runs the assignments save inside its own submit. StaffAssignmentsCard itself is stubbed here
 * (its own internals — grid, RPC diff, validation — are covered by StaffAssignmentsCard.test.tsx);
 * this file only exercises the EngagementForm-level integration contract.
 */

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;

  // Mocking Popover below (M5/O9 date-field tests) makes every StaffCombobox's cmdk CommandList
  // mount immediately instead of staying unrendered until opened — cmdk's mount effect calls
  // scrollIntoView/pointer-capture APIs jsdom doesn't implement. Same polyfill convention as the
  // other Fase 5 test files (StaffAssignmentsCard.test.tsx, AssignmentSheet.test.tsx).
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => undefined;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => undefined;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});
const mockNavigate = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// Includes the client referenced by mockEngagement so the client Select can resolve a matching
// SelectItem for full-submit tests (Radix Select can't retain a `value` that has no
// corresponding item, which otherwise silently clears the field and fails zod validation —
// same gotcha documented in EngagementForm.code-generation.test.tsx).
const stableClients = [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }];
const stableServices: never[] = [];
const stableTaxonomies: never[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClients: () => ({ data: stableClients }),
  useServices: () => ({ data: stableServices }),
  useTaxonomies: () => ({ data: stableTaxonomies }),
  useSocieties: () => ({ data: [] }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partners: [],
    partnerOptions: [],
    managerOptions: [],
    allActiveStaff: [],
    hasPartnerCategory: true,
    hasManagerCategory: true,
  }),
}));

// BUG 0722-162: el bloque Equipo pasó a alimentarse de useEngagementTeamCandidates (RPC), así
// que sin este mock el hook real golpearía Supabase. Listas vacías: estos tests no ejercitan
// los selectores de personal. Las dos guardas van en true para no disparar el aviso de
// "faltan categorías" que estos tests no esperan.
const emptyTeamCandidates = {
  partnerDirectorOptions: [],
  managerRoleOptions: [],
  encargadoOptions: [],
  specialistItOptions: [],
  specialistTaxOptions: [],
  hasPartnerDirectorCandidates: true,
  hasManagerCandidates: true,
  isLoading: false,
  isError: false,
};
vi.mock("@/hooks/useEngagementTeamCandidates", () => ({
  useEngagementTeamCandidates: () => emptyTeamCandidates,
}));

const mockUpdateMutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: mockUpdateMutateAsync, isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Mutable (not a static object) so the O9 header-warning tests can flip Admin vs. non-Admin
// without a separate module registration per case.
//
// Merge con feat/roles-permisos (2026-08): EngagementForm ya no usa useUserRole —
// isAdmin sale de roleKey === "admin" via useAuthorization. can() siempre true acá:
// este archivo no prueba gating por permiso, solo el toggle admin/no-admin del
// aviso de assignments (O9); can()=false ocultaría el botón Save (canSave,
// EngagementForm.tsx) y rompería tests que no son de esta suite.
let mockIsAdmin = false;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    roleKey: mockIsAdmin ? "admin" : "manager",
    can: () => true,
    scope: () => "firm",
  }),
}));

// Same convention as EngagementForm.servicesCatalog.test.tsx (review #2 there): Calendar as a
// native date input, Popover always rendering its content — needed to reach start_date/end_date
// without fighting react-day-picker's DOM in jsdom.
vi.mock("@/components/ui/calendar", () => ({
  Calendar: ({ onSelect }: { onSelect?: (date: Date) => void }) => (
    <input
      data-testid="calendar-mock"
      type="date"
      onChange={(e) => e.target.value && onSelect?.(new Date(`${e.target.value}T12:00:00`))}
    />
  ),
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: null }),
}));

// Stub the card: isolates the EngagementForm-level contract (render gate, combined dirty,
// no-navigate-while-dirty) from the card's own internals.
let capturedOnDirtyChange: ((dirty: boolean) => void) | null = null;
const mockSaveAssignmentsFromCard = vi.fn();
vi.mock("@/components/engagements/StaffAssignmentsCard", () => ({
  StaffAssignmentsCard: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => {
    capturedOnDirtyChange = onDirtyChange ?? null;
    return (
      <div data-testid="staff-assignments-card-stub">
        <button type="button" onClick={() => onDirtyChange?.(true)}>
          stub-make-dirty
        </button>
        <button
          type="button"
          onClick={() => {
            mockSaveAssignmentsFromCard();
            onDirtyChange?.(false);
          }}
        >
          stub-save
        </button>
      </div>
    );
  },
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

const mockEngagement: Engagement = {
  engagement_id: "eng-1",
  client_id: "client-1",
  engagement_name: "Audit FY2027",
  engagement_code: "2027.121.001",
  partner_id: "staff-1",
  manager_id: "staff-2",
  status: "active",
  start_date: "2026-10-01",
  end_date: "2027-09-30",
  created_at: "2026-05-22T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 2,
  funcion: 1,
  anio_fiscal: 2027,
  fecha_cierre: "2026-09-30",
  anio_fiscal_override: false,
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  taxonomy_id: "tx-1",
  contract_file_path: null,
  society_id: null,
};

describe("EngagementForm — Fase 5 assignments integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnDirtyChange = null;
    mockUpdateMutateAsync.mockResolvedValue(undefined);
    mockIsAdmin = false;
  });

  it("does NOT render StaffAssignmentsCard in creation — shows an 'available after save' note instead", () => {
    render(<EngagementForm />);
    expect(screen.queryByTestId("staff-assignments-card-stub")).not.toBeInTheDocument();
    expect(screen.getByText("engagement.assignments.availableAfterSave")).toBeInTheDocument();
  });

  it("renders StaffAssignmentsCard for a persisted engagement (edit mode)", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    expect(screen.getByTestId("staff-assignments-card-stub")).toBeInTheDocument();
    expect(screen.queryByText("engagement.assignments.availableAfterSave")).not.toBeInTheDocument();
  });

  it("combined dirty: assignments-only dirty is reported to the parent via onDirtyChange", () => {
    const onDirtyChange = vi.fn();
    render(<EngagementForm engagement={mockEngagement} onDirtyChange={onDirtyChange} />);
    onDirtyChange.mockClear();

    fireEvent.click(screen.getByText("stub-make-dirty"));

    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("the main submit never invokes the card's own save action", async () => {
    render(<EngagementForm engagement={mockEngagement} />);
    fireEvent.click(screen.getByRole("button", { name: "common.saveChanges" }));
    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    expect(mockSaveAssignmentsFromCard).not.toHaveBeenCalled();
  });

  it("header Save does NOT navigate while assignments are dirty — it resets only the form baseline and shows a pending-changes notice", async () => {
    const onSaveSuccess = vi.fn();
    render(<EngagementForm engagement={mockEngagement} onSaveSuccess={onSaveSuccess} />);

    fireEvent.click(screen.getByText("stub-make-dirty"));
    fireEvent.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    expect(onSaveSuccess).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("header Save DOES navigate when assignments are clean (unchanged behavior)", async () => {
    const onSaveSuccess = vi.fn();
    render(<EngagementForm engagement={mockEngagement} onSaveSuccess={onSaveSuccess} />);

    fireEvent.click(screen.getByRole("button", { name: "common.saveChanges" }));

    await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
  });

  it("saving assignments from the card clears the pending state without touching the main form", () => {
    render(<EngagementForm engagement={mockEngagement} />);
    fireEvent.click(screen.getByText("stub-make-dirty"));
    fireEvent.click(screen.getByText("stub-save"));
    expect(mockSaveAssignmentsFromCard).toHaveBeenCalledTimes(1);
    expect(mockUpdateMutateAsync).not.toHaveBeenCalled();
  });

  // O9 (bugs/scheduler/fase_5/plan_v2.md §6): outside Borrador/Rechazado, a non-Admin changing
  // partner/manager/dates while assignments are pending gets a non-blocking warning; the Admin
  // does not. `work_order_required: false` makes savedEffectiveState Aprobado (4) — outside the
  // two excluded states — without needing to thread a work_order fixture through the test.
  const engagementOutsideBorradorRechazado = { ...mockEngagement, work_order_required: false };

  it("REGRESSION (review #M5/O9): shows the header warning when a non-admin changes start_date with assignments dirty", async () => {
    render(<EngagementForm engagement={engagementOutsideBorradorRechazado} />);
    fireEvent.click(screen.getByText("stub-make-dirty"));

    const startDateFormItem = screen.getByText(/engagement.startDate/).closest("div")!;
    const calendarInput = within(startDateFormItem).getByTestId("calendar-mock");
    fireEvent.change(calendarInput, { target: { value: "2027-01-01" } });

    await waitFor(() => {
      expect(screen.getByText("engagement.assignments.warnings.headerChangeWithPending")).toBeInTheDocument();
    });
  });

  it("REGRESSION (review #M5/O9): does NOT show the header warning for the same change when the caller is Admin", async () => {
    mockIsAdmin = true;
    render(<EngagementForm engagement={engagementOutsideBorradorRechazado} />);
    fireEvent.click(screen.getByText("stub-make-dirty"));

    const startDateFormItem = screen.getByText(/engagement.startDate/).closest("div")!;
    const calendarInput = within(startDateFormItem).getByTestId("calendar-mock");
    fireEvent.change(calendarInput, { target: { value: "2027-01-01" } });

    expect(
      screen.queryByText("engagement.assignments.warnings.headerChangeWithPending")
    ).not.toBeInTheDocument();
  });

  it("REGRESSION (review #M5/O9): does NOT show the header warning without a structural field change (assignments dirty alone is not enough)", () => {
    render(<EngagementForm engagement={engagementOutsideBorradorRechazado} />);
    fireEvent.click(screen.getByText("stub-make-dirty"));

    expect(
      screen.queryByText("engagement.assignments.warnings.headerChangeWithPending")
    ).not.toBeInTheDocument();
  });
});
