import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TimesheetGrid } from "../TimesheetGrid";
import type { ApprovedEngagement, ActivityCode, TimeEntry } from "@/hooks/useTimesheetWeek";

// BUG 0827-184: the Activity selector must be scoped by engagement.funcion, not the stored
// activity_required flag — funcion=1 (cliente) sees only its own practica's activities
// (never ADM); funcion 0/2/3 (administrativa/capacitación/calidad) sees only ADM; funcion=null
// (legacy, unset) and "no engagement selected" both fail closed to an empty list.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/timesheetUtils", () => ({
  toISODateString: (d: Date) => d.toISOString().split("T")[0],
  getDayName: () => "Mon",
  formatDayMonth: () => "20/04",
}));

vi.mock("@/hooks/useTimesheetMutations", () => ({
  useUpsertTimeEntry: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteRowEntries: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEntryActivity: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../TimesheetEngagementCombobox", () => ({
  TimesheetEngagementCombobox: () => <div data-testid="engagement-combobox" />,
}));

vi.mock("@/lib/timesheetActivityRules", () => ({
  normalizeActivityForEngagement: ({ currentActivityId }: { currentActivityId: string }) => ({
    nextActivityId: currentActivityId,
    wasCleared: false,
  }),
}));

vi.mock("@/lib/timesheetEngagementOptions", () => ({
  sortEngagements: (arr: unknown[]) => arr,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

// Simplified native <select> so options are directly queryable in jsdom (Radix's real
// SelectContent renders in a portal and needs pointer-event plumbing this test doesn't need).
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <select
      data-testid="activity-select"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    disabled,
    children,
  }: {
    value: string;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  ),
}));

const WEEK_DATES = [
  new Date("2026-04-20"),
  new Date("2026-04-21"),
  new Date("2026-04-22"),
  new Date("2026-04-23"),
  new Date("2026-04-24"),
];

const ADM: ActivityCode = {
  activity_id: "adm-1",
  activity_code: "ADM",
  description: "Administrative",
  is_active: true,
  is_system: true,
};
const AUD: ActivityCode = {
  activity_id: "aud-1",
  activity_code: "AUD-1",
  description: "Audit work",
  is_active: true,
  is_system: false,
  service: { code: 1 },
};
const TAX: ActivityCode = {
  activity_id: "tax-1",
  activity_code: "TAX-1",
  description: "Tax work",
  is_active: true,
  is_system: false,
  service: { code: 3 },
};
const ACTIVITIES = [ADM, AUD, TAX];

function makeEngagement(overrides: Partial<ApprovedEngagement>): ApprovedEngagement {
  return {
    engagement_id: "eng-1",
    engagement_code: "E001",
    engagement_name: "Test Engagement",
    activity_required: true,
    work_order_required: false,
    is_internal: false,
    practica: null,
    funcion: null,
    start_date: null,
    end_date: null,
    client: null,
    ...overrides,
  };
}

const makeEntry = (overrides: Partial<TimeEntry> = {}): TimeEntry => ({
  time_id: "t1",
  staff_id: "staff-1",
  engagement_id: "eng-1",
  activity_id: "aud-1",
  date_worked: "2026-04-20",
  hours_logged: 8,
  description: null,
  period_id: "period-1",
  is_forecast: false,
  ...overrides,
});

// Mirrors TimeSheet.tsx's activityNotRequiredIds derivation (0827-184): funcion 0/2/3 only —
// funcion === null must NOT be treated as auto-ADM (fail-closed instead).
function activityNotRequiredIdsFor(engagements: ApprovedEngagement[]): Set<string> {
  const ids = new Set<string>();
  engagements.forEach((e) => {
    if (e.funcion != null && e.funcion !== 1) ids.add(e.engagement_id);
  });
  return ids;
}

const baseProps = {
  weekDates: WEEK_DATES,
  activities: ACTIVITIES,
  staffId: "staff-1",
  periodId: "period-1",
  isLocked: false,
  autoSaveSeconds: 0,
  lang: "en",
  lineApprovals: [],
  adminActivityId: "adm-1",
};

describe("TimesheetGrid activity scope (BUG 0827-184)", () => {
  it("no engagement selected: Select is disabled and has no items", () => {
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[]}
        engagements={[makeEngagement({ engagement_id: "eng-client", funcion: 1, practica: 1 })]}
        activityNotRequiredIds={new Set()}
      />
    );
    const select = screen.getByTestId("activity-select") as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(within(select).queryAllByRole("option")).toHaveLength(0);
  });

  it("funcion=1 (cliente): only the matching practica's activities, ADM excluded", () => {
    const eng = makeEngagement({ engagement_id: "eng-client", funcion: 1, practica: 1 });
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ engagement_id: "eng-client", activity_id: "aud-1" })]}
        engagements={[eng]}
        activityNotRequiredIds={activityNotRequiredIdsFor([eng])}
      />
    );
    const select = screen.getByTestId("activity-select") as HTMLSelectElement;
    expect(select).not.toBeDisabled();
    const optionValues = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toEqual(["aud-1"]);
    expect(optionValues).not.toContain("adm-1");
    expect(optionValues).not.toContain("tax-1");
  });

  it.each([0, 2, 3])("funcion=%i (administrativa/capacitación/calidad): disabled, only ADM offered", (funcion) => {
    const eng = makeEngagement({ engagement_id: "eng-adm", funcion, practica: null });
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ engagement_id: "eng-adm", activity_id: "adm-1" })]}
        engagements={[eng]}
        activityNotRequiredIds={activityNotRequiredIdsFor([eng])}
      />
    );
    const select = screen.getByTestId("activity-select") as HTMLSelectElement;
    expect(select).toBeDisabled();
    const optionValues = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toEqual(["adm-1"]);
  });

  it("funcion=null (legacy, unset): disabled and fails closed — no new activity offered, not auto-ADM", () => {
    // Stale saved entry from before funcion was cleared/unset — must stay visible (never go
    // blank on an existing row) but no other activity, and NOT ADM, is offered instead. The
    // selector itself is disabled (funcion=null is excluded from activityNotRequiredIds, but
    // TimesheetGrid disables separately whenever funcion is unresolved).
    const eng = makeEngagement({ engagement_id: "eng-legacy", funcion: null, practica: 1 });
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ engagement_id: "eng-legacy", activity_id: "aud-1" })]}
        engagements={[eng]}
        activityNotRequiredIds={activityNotRequiredIdsFor([eng])}
      />
    );
    const select = screen.getByTestId("activity-select") as HTMLSelectElement;
    expect(select).toBeDisabled();
    const optionValues = within(select)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(optionValues).toEqual(["aud-1"]);
    expect(optionValues).not.toContain("adm-1");
  });

  // review#15 (iteration 4): the Select preserves a stale activity for display on any
  // row (locked or not) so it never goes blank, but an EDITABLE row must not let the
  // hour cells stay open (and thus autosave/submit) with an activity from another
  // practica — that's the same fail-closed guarantee funcion=null already gets.
  it("funcion=1 (cliente), editable row with a stale activity from another practica: hour cells stay disabled", () => {
    const eng = makeEngagement({ engagement_id: "eng-client", funcion: 1, practica: 1 });
    render(
      <TimesheetGrid
        {...baseProps}
        entries={[makeEntry({ engagement_id: "eng-client", activity_id: "tax-1" })]}
        engagements={[eng]}
        activityNotRequiredIds={activityNotRequiredIdsFor([eng])}
      />
    );
    // Still shown for display (never blanks an existing row) ...
    const select = screen.getByTestId("activity-select") as HTMLSelectElement;
    expect(select.value).toBe("tax-1");
    // ... but "tax-1" is service code 3, not this engagement's practica (1), so the
    // hour cells must stay locked until a valid activity is chosen.
    screen.getAllByRole("textbox").forEach((input) => expect(input).toBeDisabled());
  });
});
