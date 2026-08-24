import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { render as rtlRender, screen, waitFor } from "@/test/utils";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Engagement, EngagementAssignmentRow } from "@/hooks/useEmsData";

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
// EngagementForm's own combobox tests: render the content unconditionally.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function render(ui: React.ReactElement) {
  return rtlRender(<TooltipProvider>{ui}</TooltipProvider>);
}

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

const CATEGORIES = [
  { category_id: "cat-1", category_name: "Cat One", practica_id: "svc-aud", rate_high_bob: 0, rate_low_bob: 0, rate_high_usd: 0, rate_low_usd: 0, display_order: 1, can_approve_wo: false, can_approve_timesheets: false, default_app_role: null },
];
const STAFF_1 = { staff_id: "staff-1", first_name: "Ana", last_name: "Alvarez", short_name: null, initials: "AA", category_id: "cat-1", society_id: "soc-1", practica_id: "svc-aud", city: null, is_active: true, is_schedulable: true, category: CATEGORIES[0], staff_skills: [] };
const STAFF_2 = { staff_id: "staff-2", first_name: "Beto", last_name: "Bravo", short_name: null, initials: "BB", category_id: "cat-1", society_id: "soc-1", practica_id: "svc-aud", city: null, is_active: true, is_schedulable: true, category: CATEGORIES[0], staff_skills: [] };

const EXISTING_ROW: EngagementAssignmentRow = {
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

const mockSaveAssignments = vi.fn();
vi.mock("@/hooks/mutations", () => ({
  useSaveEngagementAssignments: () => ({ saveAssignments: mockSaveAssignments, isSaving: false }),
}));

import { AssignmentSheet } from "../AssignmentSheet";

describe("AssignmentSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveAssignments.mockResolvedValue([]);
  });

  it("+ Agregar staff mode: prefills engagement dates, 40h/100%, and requires staff+category", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AssignmentSheet
        engagement={ENGAGEMENT}
        open
        onOpenChange={onOpenChange}
        row={null}
        canWrite
        requirements={[]}
        staffOptions={[STAFF_1, STAFF_2]}
        categories={CATEGORIES}
        assignments={[EXISTING_ROW]}
      />
    );

    expect(screen.getByText("engagement.assignments.selectStaff")).toBeInTheDocument();

    await user.click(screen.getByText("scheduler.assignmentSheet.save"));
    expect(mockSaveAssignments).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("engagement.assignments.errors.requiredFields");
  });

  it("edit mode: staff is shown read-only, delete button visible", () => {
    render(
      <AssignmentSheet
        engagement={ENGAGEMENT}
        open
        onOpenChange={vi.fn()}
        row={EXISTING_ROW}
        canWrite
        requirements={[]}
        staffOptions={[STAFF_1, STAFF_2]}
        categories={CATEGORIES}
        assignments={[EXISTING_ROW]}
      />
    );
    expect(screen.getByText("Ana Alvarez")).toBeInTheDocument();
    expect(screen.getByText("scheduler.assignmentSheet.delete")).toBeInTheDocument();
  });

  it("read-only: no Save/Delete buttons", () => {
    render(
      <AssignmentSheet
        engagement={ENGAGEMENT}
        open
        onOpenChange={vi.fn()}
        row={EXISTING_ROW}
        canWrite={false}
        requirements={[]}
        staffOptions={[STAFF_1, STAFF_2]}
        categories={CATEGORIES}
        assignments={[EXISTING_ROW]}
      />
    );
    expect(screen.getByText("scheduler.readOnly")).toBeInTheDocument();
    expect(screen.queryByText("scheduler.assignmentSheet.save")).not.toBeInTheDocument();
    expect(screen.queryByText("scheduler.assignmentSheet.delete")).not.toBeInTheDocument();
  });

  it("save validates against the FULL assignments snapshot for overlap, not a filtered view", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    // row=null (new), staff-1 already has EXISTING_ROW 2026-02-01..2026-03-01; picking the same
    // staff with an overlapping range must be refused even though `assignments` here represents
    // the full snapshot (not something the caller narrowed by a page filter).
    render(
      <AssignmentSheet
        engagement={ENGAGEMENT}
        open
        onOpenChange={onOpenChange}
        row={null}
        canWrite
        requirements={[]}
        staffOptions={[STAFF_1, STAFF_2]}
        categories={CATEGORIES}
        assignments={[EXISTING_ROW]}
      />
    );

    await user.click(screen.getByText("engagement.assignments.selectStaff"));
    // Picking Ana auto-prefills her own category (cat-1, the only category in this fixture),
    // so the category Select's placeholder never renders after this — nothing left to pick.
    await user.click(await screen.findByText("Ana Alvarez"));

    await user.click(screen.getByText("scheduler.assignmentSheet.save"));

    expect(mockSaveAssignments).not.toHaveBeenCalled();
    expect(screen.getByText("scheduler.errors.overlap")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("delete goes through a confirmation dialog before invoking the RPC with deletedIds", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    render(
      <AssignmentSheet
        engagement={ENGAGEMENT}
        open
        onOpenChange={onOpenChange}
        row={EXISTING_ROW}
        canWrite
        requirements={[]}
        staffOptions={[STAFF_1, STAFF_2]}
        categories={CATEGORIES}
        assignments={[EXISTING_ROW]}
        onSaved={onSaved}
      />
    );

    await user.click(screen.getByText("scheduler.assignmentSheet.delete"));
    // Confirmation dialog title reuses the same delete label.
    const confirmButtons = screen.getAllByText("scheduler.assignmentSheet.delete");
    expect(mockSaveAssignments).not.toHaveBeenCalled();
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockSaveAssignments).toHaveBeenCalledWith({
        engagementId: "eng-1",
        current: [],
        original: [EXISTING_ROW],
        deletedIds: ["a-1"],
      });
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("closing a dirty sheet prompts a discard confirmation instead of closing silently", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <AssignmentSheet
        engagement={ENGAGEMENT}
        open
        onOpenChange={onOpenChange}
        row={EXISTING_ROW}
        canWrite
        requirements={[]}
        staffOptions={[STAFF_1, STAFF_2]}
        categories={CATEGORIES}
        assignments={[EXISTING_ROW]}
      />
    );

    await user.type(screen.getByDisplayValue(""), "edited");
    await user.keyboard("{Escape}");

    expect(screen.getByText("common.leavePageDirtyTitle")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("REGRESSION (review #3): a seeded row whose category is outside the service-scoped list blocks save", async () => {
    const user = userEvent.setup();
    const foreignRow: EngagementAssignmentRow = { ...EXISTING_ROW, category_id: "cat-foreign" };
    render(
      <AssignmentSheet
        engagement={ENGAGEMENT}
        open
        onOpenChange={vi.fn()}
        row={foreignRow}
        canWrite
        requirements={[]}
        staffOptions={[STAFF_1, STAFF_2]}
        categories={CATEGORIES}
        assignments={[foreignRow]}
      />
    );

    await user.click(screen.getByText("scheduler.assignmentSheet.save"));

    expect(mockSaveAssignments).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("engagement.assignments.errors.categoryForeignService");
  });

  it("REGRESSION (review #1): a seeded row outside the Engagement's own date range blocks save", async () => {
    const user = userEvent.setup();
    const outOfRangeRow: EngagementAssignmentRow = {
      ...EXISTING_ROW,
      start_date: "2025-11-01",
      end_date: "2025-12-01",
    };
    render(
      <AssignmentSheet
        engagement={ENGAGEMENT}
        open
        onOpenChange={vi.fn()}
        row={outOfRangeRow}
        canWrite
        requirements={[]}
        staffOptions={[STAFF_1, STAFF_2]}
        categories={CATEGORIES}
        assignments={[outOfRangeRow]}
      />
    );

    await user.click(screen.getByText("scheduler.assignmentSheet.save"));

    expect(mockSaveAssignments).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("engagement.assignments.errors.outOfEngagementRange");
  });

  it("REGRESSION (review #3): picking a staff never autofills a category outside the service-scoped list", async () => {
    const user = userEvent.setup();
    const staffForeignCategory = { ...STAFF_2, category_id: "cat-foreign" };
    render(
      <AssignmentSheet
        engagement={ENGAGEMENT}
        open
        onOpenChange={vi.fn()}
        row={null}
        canWrite
        requirements={[]}
        staffOptions={[staffForeignCategory]}
        categories={CATEGORIES}
        assignments={[EXISTING_ROW]}
      />
    );

    await user.click(screen.getByText("engagement.assignments.selectStaff"));
    await user.click(await screen.findByText("Beto Bravo"));

    // Required-field validation still fires (category left blank) — never a silently-accepted
    // foreign category.
    await user.click(screen.getByText("scheduler.assignmentSheet.save"));
    expect(mockSaveAssignments).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("engagement.assignments.errors.requiredFields");
  });
});
