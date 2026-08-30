import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// BUG 0827-184: the Activity selector must be scoped by engagement.funcion, not the stored
// activity_required flag — funcion=1 (cliente) sees only its own practica's activities
// (never ADM); funcion 0/2/3 sees only ADM.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ id: "timer-1" }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "unblocked" }, allowNextNavigation: vi.fn(), isDirty: false }),
}));

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "en" }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ENTRY = {
  timer_id: "timer-1",
  started_at: new Date("2026-04-20T08:00:00").toISOString(),
  ended_at: new Date("2026-04-20T16:00:00").toISOString(),
  duration_minutes: 480,
  is_imported: false,
  imported_to_time_id: null,
  has_explicit_times: true,
  engagement_id: "eng-client",
  activity_id: "aud-1",
  description: "",
};

vi.mock("@/hooks/useTimerEntries", () => ({
  useTimerEntries: () => ({ data: [ENTRY], isFetched: true }),
  useUpdateTimerEntry: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTimerEntry: () => ({ mutateAsync: vi.fn() }),
}));

const ENGAGEMENTS = [
  { engagement_id: "eng-client", engagement_code: "E-CLI", engagement_name: "Client Eng", funcion: 1, practica: 1 },
  { engagement_id: "eng-adm", engagement_code: "E-ADM", engagement_name: "Admin Eng", funcion: 0, practica: null },
  // practica=3 (not 1, unlike aud-1's service) so switching from eng-client clears the
  // stale activityId instead of accidentally keeping it via a matching practica.
  { engagement_id: "eng-legacy", engagement_code: "E-LEG", engagement_name: "Legacy Eng", funcion: null, practica: 3 },
];

vi.mock("@/hooks/useEmsData", () => ({
  useEngagements: () => ({ data: ENGAGEMENTS }),
  useActivityCodes: () => ({
    data: [
      { activity_id: "adm-1", activity_code: "ADM", description: "Administrative", is_active: true, is_system: true },
      { activity_id: "aud-1", activity_code: "AUD-1", description: "Audit work", is_active: true, is_system: false, service: { code: 1 } },
      { activity_id: "tax-1", activity_code: "TAX-1", description: "Tax work", is_active: true, is_system: false, service: { code: 3 } },
    ],
  }),
}));

vi.mock("@/hooks/useApprovedEngagements", () => ({
  useApprovedEngagements: () => ({ data: ENGAGEMENTS }),
}));

vi.mock("@/hooks/useAdminActivity", () => ({
  useAdminActivityId: () => "adm-1",
}));

// Simplified native <select> so options are directly queryable in jsdom.
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
      data-testid="ui-select"
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
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import TrackerEdit from "../TrackerEdit";

function optionValues(select: HTMLSelectElement): string[] {
  return within(select)
    .queryAllByRole("option")
    .map((o) => (o as HTMLOptionElement).value)
    .filter((v) => v !== "");
}

describe("TrackerEdit activity scope (BUG 0827-184)", () => {
  it("funcion=1 (cliente): only the matching practica's activities, ADM excluded", () => {
    render(<TrackerEdit />);
    const [, activitySelect] = screen.getAllByTestId("ui-select") as HTMLSelectElement[];
    expect(activitySelect).not.toBeDisabled();
    expect(optionValues(activitySelect)).toEqual(["aud-1"]);
  });

  it("funcion=0 (administrativa): only ADM offered, selector disabled, ADM auto-assigned", () => {
    render(<TrackerEdit />);
    const [engagementSelect, activitySelect] = screen.getAllByTestId("ui-select") as HTMLSelectElement[];
    fireEvent.change(engagementSelect, { target: { value: "eng-adm" } });
    expect(activitySelect).toBeDisabled();
    expect(activitySelect.value).toBe("adm-1");
    expect(optionValues(activitySelect)).toEqual(["adm-1"]);
  });

  it("funcion=null (legacy, unset): activity selector disabled and fails closed", () => {
    render(<TrackerEdit />);
    const [engagementSelect, activitySelect] = screen.getAllByTestId("ui-select") as HTMLSelectElement[];
    fireEvent.change(engagementSelect, { target: { value: "eng-legacy" } });
    expect(activitySelect).toBeDisabled();
    expect(optionValues(activitySelect)).toEqual([]);
  });

  // Codex review (iteración 2): ADM (is_system, service == null) survived a switch into a
  // funcion === 1 (cliente) engagement because the old clearing check only compared
  // service.code, which is never set on a system activity.
  it("switching from an administrativa engagement (ADM selected) to a cliente engagement clears the stale ADM activity", () => {
    render(<TrackerEdit />);
    const [engagementSelect, activitySelect] = screen.getAllByTestId("ui-select") as HTMLSelectElement[];
    fireEvent.change(engagementSelect, { target: { value: "eng-adm" } });
    expect(activitySelect.value).toBe("adm-1");
    fireEvent.change(engagementSelect, { target: { value: "eng-client" } });
    // The stale ADM activity must no longer be offered — if it hadn't been cleared,
    // filterActivitiesForEngagement's "always preserve the current selection" rule would
    // still list it. (Not asserting `.value` here: jsdom falls back a native <select> with
    // no matching <option value=""> to its first option, so an emptied value would
    // misleadingly read back as "aud-1" even though the underlying state is correctly "".)
    expect(optionValues(activitySelect)).toEqual(["aud-1"]);
    expect(optionValues(activitySelect)).not.toContain("adm-1");
  });
});
