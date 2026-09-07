import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TrackerBar } from "../TrackerBar";

// BUG 0827-184: the Activity selector must be scoped by engagement.funcion, not the stored
// activity_required flag — funcion=1 (cliente) sees only its own practica's activities
// (never ADM); funcion 0/2/3 sees only ADM.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const ENGAGEMENTS = [
  { engagement_id: "eng-client", engagement_code: "E-CLI", engagement_name: "Client Eng", funcion: 1, practica: 1 },
  { engagement_id: "eng-adm", engagement_code: "E-ADM", engagement_name: "Admin Eng", funcion: 0, practica: null },
  { engagement_id: "eng-legacy", engagement_code: "E-LEG", engagement_name: "Legacy Eng", funcion: null, practica: 1 },
];

vi.mock("@/hooks/useApprovedEngagements", () => ({
  useApprovedEngagements: () => ({ data: ENGAGEMENTS }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useActivityCodes: () => ({
    data: [
      { activity_id: "adm-1", activity_code: "ADM", description: "Administrative", is_active: true, is_system: true },
      { activity_id: "aud-1", activity_code: "AUD-1", description: "Audit work", is_active: true, is_system: false, service: { code: 1 } },
      { activity_id: "tax-1", activity_code: "TAX-1", description: "Tax work", is_active: true, is_system: false, service: { code: 3 } },
    ],
  }),
}));

vi.mock("@/hooks/useAdminActivity", () => ({
  useAdminActivityId: () => "adm-1",
}));

vi.mock("@/components/tracker/EngagementCombobox", () => ({
  EngagementCombobox: ({
    engagements,
    value,
    onValueChange,
  }: {
    engagements: Array<{ engagement_id: string; engagement_name: string }>;
    value: string;
    onValueChange: (id: string) => void;
  }) => (
    <select
      data-testid="engagement-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="" />
      {engagements.map((eng) => (
        <option key={eng.engagement_id} value={eng.engagement_id}>
          {eng.engagement_name}
        </option>
      ))}
    </select>
  ),
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
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

function optionValues(select: HTMLSelectElement): string[] {
  return within(select)
    .queryAllByRole("option")
    .map((o) => (o as HTMLOptionElement).value)
    .filter((v) => v !== "");
}

const baseProps = {
  isRunning: false,
  elapsedSeconds: 0,
  engagementId: null,
  activityId: null,
  remainingHours: null,
  onStart: vi.fn(),
  onSaveAndReset: vi.fn(),
  onCancel: vi.fn(),
  onEngagementChange: vi.fn(),
  onActivityChange: vi.fn(),
};

describe("TrackerBar activity scope (BUG 0827-184)", () => {
  it("funcion=1 (cliente): only the matching practica's activities, ADM excluded", () => {
    render(<TrackerBar {...baseProps} engagementId="eng-client" />);
    const activitySelect = screen.getByTestId("activity-select") as HTMLSelectElement;
    expect(activitySelect).not.toBeDisabled();
    expect(optionValues(activitySelect)).toEqual(["aud-1"]);
  });

  it("funcion=0 (administrativa): activity selector disabled, only ADM in the list", () => {
    render(<TrackerBar {...baseProps} engagementId="eng-adm" />);
    const activitySelect = screen.getByTestId("activity-select") as HTMLSelectElement;
    expect(activitySelect).toBeDisabled();
    expect(optionValues(activitySelect)).toEqual(["adm-1"]);
  });

  it("selecting an administrativa engagement auto-assigns ADM as the activity", () => {
    const onActivityChange = vi.fn();
    render(<TrackerBar {...baseProps} onActivityChange={onActivityChange} />);
    fireEvent.change(screen.getByTestId("engagement-select"), { target: { value: "eng-adm" } });
    expect(onActivityChange).toHaveBeenCalledWith("adm-1");
  });

  it("no engagement selected: activity selector disabled", () => {
    render(<TrackerBar {...baseProps} />);
    const activitySelect = screen.getByTestId("activity-select") as HTMLSelectElement;
    expect(activitySelect).toBeDisabled();
  });

  it("funcion=null (legacy, unset): activity selector disabled and fails closed", () => {
    render(<TrackerBar {...baseProps} engagementId="eng-legacy" />);
    const activitySelect = screen.getByTestId("activity-select") as HTMLSelectElement;
    expect(activitySelect).toBeDisabled();
    expect(optionValues(activitySelect)).toEqual([]);
  });

  // Codex review (iteración 2): ADM (is_system, service == null) survived a switch into a
  // funcion === 1 (cliente) engagement because the old clearing check only compared
  // service.code, which is never set on a system activity.
  it("switching from an administrativa engagement (ADM selected) to a cliente engagement clears the stale ADM activity", () => {
    const onActivityChange = vi.fn();
    render(
      <TrackerBar
        {...baseProps}
        engagementId="eng-adm"
        activityId="adm-1"
        onActivityChange={onActivityChange}
      />
    );
    fireEvent.change(screen.getByTestId("engagement-select"), { target: { value: "eng-client" } });
    expect(onActivityChange).toHaveBeenCalledWith(null);
  });
});
