import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render as rtlRender, screen, waitFor, within } from "@/test/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Engagement } from "@/hooks/useEmsData";

// MatchDot renders a Radix Tooltip per row — needs a TooltipProvider ancestor.
function render(ui: React.ReactElement) {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

if (typeof window !== "undefined") {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => undefined;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => undefined;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
}
if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

// Radix Popover positioning/portals are unreliable in jsdom — same convention as
// EngagementForm's own combobox tests (EngagementForm.servicesCatalog.test.tsx): render the
// content unconditionally so CommandItem options are always queryable.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const ENGAGEMENT: Engagement = {
  engagement_id: "eng-1",
  client_id: "client-1",
  engagement_name: "Audit FY2027",
  engagement_code: "2027.111.001",
  partner_id: null,
  manager_id: "mgr-1",
  status: "active",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  created_at: "2026-01-01T00:00:00Z",
  work_order_required: true,
  activity_required: true,
  is_internal: false,
  approval_required: true,
  oficina: 1,
  practica: 1,
  anio_fiscal: 2027,
  funcion: 0,
  fecha_cierre: "2026-09-30",
  anio_fiscal_override: false,
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  taxonomy_id: null,
  contract_file_path: null,
} as Engagement;

const SERVICES = [{ service_id: "svc-aud", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "" }];
const CATEGORIES = [{ category_id: "cat-1", category_name: "Cat One", service_id: "svc-aud", rate_high_bob: 0, rate_low_bob: 0, rate_high_usd: 0, rate_low_usd: 0, display_order: 1, can_approve_wo: false, can_approve_timesheets: false, default_app_role: null }];
const STAFF_ACTIVE = { staff_id: "staff-1", first_name: "Ana", last_name: "Alvarez", short_name: null, initials: "AA", category_id: "cat-1", city: null, is_active: true, is_schedulable: true, category: CATEGORIES[0], staff_skills: [] };
const STAFF_NOT_SCHEDULABLE = { staff_id: "staff-2", first_name: "Ivy", last_name: "NotSched", short_name: null, initials: "IN", category_id: "cat-1", city: null, is_active: true, is_schedulable: false, category: CATEGORIES[0], staff_skills: [] };
const PERSISTED_ROW = {
  assignment_id: "a-1",
  engagement_id: "eng-1",
  staff_id: "staff-1",
  category_id: "cat-1",
  start_date: "2026-02-01",
  end_date: "2026-03-01",
  hours_per_week: 20,
  allocation_percent: 50,
  notes: null,
  status: "PROPOSED",
  staff: { staff_id: "staff-1", first_name: "Ana", last_name: "Alvarez", short_name: null, category_id: "cat-1" },
  category: CATEGORIES[0],
};

let assignmentsState: { data: unknown[]; isLoading: boolean; isError: boolean } = {
  data: [PERSISTED_ROW],
  isLoading: false,
  isError: false,
};
let staffOptionsState: unknown[] = [STAFF_ACTIVE, STAFF_NOT_SCHEDULABLE];

vi.mock("@/hooks/useEmsData", () => ({
  useEngagementAssignments: () => assignmentsState,
  useEngagementAggregatedRequirements: () => ({ data: [] }),
  useActiveStaffWithSkills: () => ({ data: staffOptionsState }),
  useServices: () => ({ data: SERVICES }),
  useCategories: () => ({ data: CATEGORIES }),
}));

const mockSaveAssignments = vi.fn();
let isSavingState = false;
vi.mock("@/hooks/mutations", () => ({
  useSaveEngagementAssignments: () => ({ saveAssignments: mockSaveAssignments, isSaving: isSavingState }),
}));

let mockRole: { isAdmin: boolean } = { isAdmin: false };
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => mockRole }));

let mockStaffRecord: { staff_id: string } | null = { staff_id: "mgr-1" };
vi.mock("@/hooks/useCurrentStaff", () => ({ useCurrentStaff: () => ({ staffRecord: mockStaffRecord }) }));

import { StaffAssignmentsCard } from "../StaffAssignmentsCard";

describe("StaffAssignmentsCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assignmentsState = { data: [PERSISTED_ROW], isLoading: false, isError: false };
    staffOptionsState = [STAFF_ACTIVE, STAFF_NOT_SCHEDULABLE];
    mockRole = { isAdmin: false };
    mockStaffRecord = { staff_id: "mgr-1" }; // matches engagement.manager_id -> canEdit
    isSavingState = false;
    mockSaveAssignments.mockResolvedValue([]);
  });

  it("shows a loading skeleton while the query is pending", () => {
    assignmentsState = { data: [], isLoading: true, isError: false };
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);
    expect(screen.getByText("engagement.assignments.title")).toBeInTheDocument();
    expect(screen.queryByText("engagement.assignments.addRow")).not.toBeInTheDocument();
  });

  it("shows an error state when the query fails", () => {
    assignmentsState = { data: [], isLoading: false, isError: true };
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);
    expect(screen.getByText("engagement.assignments.errors.loadFailed")).toBeInTheDocument();
  });

  it("shows the empty state when there are no assignments", () => {
    assignmentsState = { data: [], isLoading: false, isError: false };
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);
    expect(screen.getAllByText("engagement.assignments.empty").length).toBeGreaterThan(0);
  });

  it("read-only mode: no Add/Save/Discard controls when the caller cannot write", () => {
    mockStaffRecord = { staff_id: "someone-else" };
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);
    expect(screen.getByText("engagement.assignments.readOnly")).toBeInTheDocument();
    expect(screen.queryByText("engagement.assignments.addRow")).not.toBeInTheDocument();
    expect(screen.queryByText("engagement.assignments.save")).not.toBeInTheDocument();
  });

  it("admin can always write, regardless of responsibility", () => {
    mockRole = { isAdmin: true };
    mockStaffRecord = { staff_id: "bystander" };
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);
    expect(screen.queryByText("engagement.assignments.readOnly")).not.toBeInTheDocument();
    expect(screen.getAllByText("engagement.assignments.addRow").length).toBeGreaterThan(0);
  });

  it("adding a row makes Save/Discard active (dirty)", async () => {
    const user = userEvent.setup();
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);
    const saveButtons = screen.getAllByText("engagement.assignments.save");
    expect(saveButtons[0].closest("button")).toBeDisabled();

    await user.click(screen.getAllByText("engagement.assignments.addRow")[0]);

    await waitFor(() => {
      expect(screen.getAllByText("engagement.assignments.save")[0].closest("button")).not.toBeDisabled();
    });
  });

  it("discard restores the baseline (removes the newly added row)", async () => {
    const user = userEvent.setup();
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);
    await user.click(screen.getAllByText("engagement.assignments.addRow")[0]);
    await waitFor(() => {
      expect(screen.getAllByText("engagement.assignments.save")[0].closest("button")).not.toBeDisabled();
    });

    await user.click(screen.getAllByText("engagement.assignments.discard")[0]);

    await waitFor(() => {
      expect(screen.getAllByText("engagement.assignments.save")[0].closest("button")).toBeDisabled();
    });
  });

  it("removing a persisted row stages a soft-delete and offers Undo", async () => {
    const user = userEvent.setup();
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);
    const removeButtons = screen.getAllByLabelText("engagement.assignments.remove");
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("engagement.assignments.pendingChanges")).toBeInTheDocument();
    });
    expect(screen.getAllByText("engagement.assignments.save")[0].closest("button")).not.toBeDisabled();
  });

  it("save invokes the RPC wrapper with the engagement id and the current diff, then adopts the returned rows", async () => {
    mockSaveAssignments.mockResolvedValue([
      {
        assignment_id: "a-1",
        staff_id: "staff-1",
        category_id: "cat-1",
        start_date: "2026-02-01",
        end_date: "2026-03-01",
        hours_per_week: 25,
        allocation_percent: 60,
        status: "PROPOSED",
        notes: "changed",
      },
    ]);
    const user = userEvent.setup();
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);

    // Query by accessible name, not display value: with the Popover mock rendering its content
    // unconditionally, every StaffCombobox's CommandInput ALSO has an empty display value, so
    // getAllByDisplayValue("") would grab the wrong (unrelated) element.
    const notesInputs = screen.getAllByLabelText("engagement.assignments.notes");
    await user.type(notesInputs[0], "changed");

    await waitFor(() => {
      expect(screen.getAllByText("engagement.assignments.save")[0].closest("button")).not.toBeDisabled();
    });
    await user.click(screen.getAllByText("engagement.assignments.save")[0]);

    await waitFor(() => {
      expect(mockSaveAssignments).toHaveBeenCalledTimes(1);
    });
    const call = mockSaveAssignments.mock.calls[0][0];
    expect(call.engagementId).toBe("eng-1");
    expect(call.deletedIds).toEqual([]);

    // After a successful save, dirty settles (Save disables again) without waiting on a refetch.
    await waitFor(() => {
      expect(screen.getAllByText("engagement.assignments.save")[0].closest("button")).toBeDisabled();
    });
  });

  it("a historical row whose category is outside the resolved service is blocked from saving", async () => {
    assignmentsState = {
      data: [{ ...PERSISTED_ROW, category_id: "cat-foreign", category: { ...CATEGORIES[0], category_id: "cat-foreign" } }],
      isLoading: false,
      isError: false,
    };
    const user = userEvent.setup();
    render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);

    // Rendered once per layout copy (desktop + mobile, both always in the DOM — visibility is
    // CSS-only), so assert presence via count rather than a single unique match.
    expect(screen.getAllByText("engagement.assignments.errors.categoryForeignService").length).toBeGreaterThan(0);

    // Force dirty via add-row (no need to fill it in) so Save is enabled, then verify it still
    // refuses to call the RPC because of the pre-existing foreign-category row.
    await user.click(screen.getAllByText("engagement.assignments.addRow")[0]);
    await waitFor(() => {
      expect(screen.getAllByText("engagement.assignments.save")[0].closest("button")).not.toBeDisabled();
    });
    await user.click(screen.getAllByText("engagement.assignments.save")[0]);

    expect(mockSaveAssignments).not.toHaveBeenCalled();
  });

  it("a non-schedulable staff member is not offered as a candidate for a NEW row (but is not hidden from a persisted row)", async () => {
    const user = userEvent.setup();
    const { container } = render(<StaffAssignmentsCard engagement={ENGAGEMENT} />);
    await user.click(screen.getAllByText("engagement.assignments.addRow")[0]);

    // Two placeholder triggers exist for the new row (desktop table + mobile card copies);
    // neither's candidate list includes the non-schedulable Ivy.
    const newRowTriggers = screen.getAllByText("engagement.assignments.selectStaff");
    expect(newRowTriggers.length).toBeGreaterThan(0);
    for (const trigger of newRowTriggers) {
      const scope = trigger.closest("td") ?? trigger.closest(".space-y-2") ?? container;
      expect(within(scope as HTMLElement).queryByText("Ivy NotSched")).not.toBeInTheDocument();
      expect(within(scope as HTMLElement).getByText("Ana Alvarez")).toBeInTheDocument();
    }

    // The PERSISTED row (Ana already assigned) still offers Ivy as a candidate — the
    // is_schedulable gate only applies to brand-new rows, never hides historical staff.
    expect(screen.getAllByText("Ivy NotSched").length).toBeGreaterThan(0);
  });
});
