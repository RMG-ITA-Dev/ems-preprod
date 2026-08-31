import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TimesheetEngagementCombobox } from "../TimesheetEngagementCombobox";
import type { ApprovedEngagement } from "@/hooks/useTimesheetWeek";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// cmdk and Radix Popover use browser APIs unavailable in JSDOM; stub them
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
});

function eng(
  id: string,
  code: string | null,
  name: string,
  clientName: string | null
): ApprovedEngagement {
  return {
    engagement_id: id,
    engagement_code: code,
    engagement_name: name,
    activity_required: false,
    work_order_required: false,
    is_internal: false,
    practica: null,
    funcion: null,
    start_date: null,
    end_date: null,
    client: clientName ? { client_id: id, client_legal_name: clientName } : null,
  };
}

const ENGAGEMENTS: ApprovedEngagement[] = [
  eng("1", "AUD-001", "Financial Audit", "ACME Corp"),
  eng("2", "ADM_01", "Feriados", null),
  eng("3", "PPC-010", "Tax Advisory", "Beta Ltd"),
];

describe("TimesheetEngagementCombobox (BUG 0220-57)", () => {
  it("renders placeholder when no value is selected", () => {
    render(
      <TimesheetEngagementCombobox
        engagements={ENGAGEMENTS}
        value=""
        onValueChange={vi.fn()}
        placeholder="timesheet.selectEngagement"
      />
    );
    expect(screen.getByText("timesheet.selectEngagement")).toBeTruthy();
  });

  it("renders selected engagement code and name when value is set", () => {
    render(
      <TimesheetEngagementCombobox
        engagements={ENGAGEMENTS}
        value="1"
        onValueChange={vi.fn()}
      />
    );
    expect(screen.getByText("AUD-001 - Financial Audit")).toBeTruthy();
  });

  it("reveals a search input when opened", () => {
    render(
      <TimesheetEngagementCombobox
        engagements={ENGAGEMENTS}
        value=""
        onValueChange={vi.fn()}
      />
    );
    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    expect(screen.getByPlaceholderText("timesheet.searchEngagement")).toBeTruthy();
  });

  it("filters list by engagement_code", () => {
    render(
      <TimesheetEngagementCombobox
        engagements={ENGAGEMENTS}
        value=""
        onValueChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("timesheet.searchEngagement");
    fireEvent.change(input, { target: { value: "AUD" } });
    expect(screen.getByText("Financial Audit")).toBeTruthy();
    expect(screen.queryByText("Tax Advisory")).toBeNull();
  });

  it("filters list by engagement_name", () => {
    render(
      <TimesheetEngagementCombobox
        engagements={ENGAGEMENTS}
        value=""
        onValueChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("timesheet.searchEngagement");
    fireEvent.change(input, { target: { value: "Tax" } });
    expect(screen.getByText("Tax Advisory")).toBeTruthy();
    expect(screen.queryByText("Financial Audit")).toBeNull();
  });

  it("filters list by client_legal_name", () => {
    render(
      <TimesheetEngagementCombobox
        engagements={ENGAGEMENTS}
        value=""
        onValueChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("timesheet.searchEngagement");
    fireEvent.change(input, { target: { value: "Beta" } });
    expect(screen.getByText("Tax Advisory")).toBeTruthy();
    expect(screen.queryByText("Financial Audit")).toBeNull();
  });

  it("shows empty state when no option matches", () => {
    render(
      <TimesheetEngagementCombobox
        engagements={ENGAGEMENTS}
        value=""
        onValueChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("timesheet.searchEngagement");
    fireEvent.change(input, { target: { value: "zzznomatch" } });
    expect(screen.getByText("timesheet.noMatchingEngagements")).toBeTruthy();
  });

  it("calls onValueChange with engagement_id when an item is selected and closes the popover", () => {
    const onValueChange = vi.fn();
    render(
      <TimesheetEngagementCombobox
        engagements={ENGAGEMENTS}
        value=""
        onValueChange={onValueChange}
      />
    );
    fireEvent.click(screen.getByRole("combobox"));
    const item = screen.getByText("Financial Audit");
    fireEvent.click(item);
    expect(onValueChange).toHaveBeenCalledWith("1");
    expect(screen.queryByPlaceholderText("timesheet.searchEngagement")).toBeNull();
  });

  it("renders trigger as disabled when disabled prop is true and does not open the popover", () => {
    render(
      <TimesheetEngagementCombobox
        engagements={ENGAGEMENTS}
        value=""
        onValueChange={vi.fn()}
        disabled
      />
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByPlaceholderText("timesheet.searchEngagement")).toBeNull();
  });
});
