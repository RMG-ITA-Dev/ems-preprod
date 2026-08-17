import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * FEAT 0722-157: WorksheetEngagementCombobox — search-as-you-type engagement picker for
 * /worksheets/new (replaces the previous plain <Select>). Modeled on TimesheetEngagementCombobox.
 * Popover is mocked as a passthrough (same convention as EngagementForm's StaffCombobox tests)
 * so the Command list is always in the DOM without driving Radix's real positioning/pointer flow.
 */

// cmdk (used inside PopoverContent) relies on ResizeObserver and scrollIntoView, unavailable in JSDOM.
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
Element.prototype.scrollIntoView = () => {};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: any) => <>{children}</>,
  PopoverTrigger: ({ children }: any) => <>{children}</>,
  PopoverContent: ({ children }: any) => <>{children}</>,
}));

import { WorksheetEngagementCombobox } from "@/components/worksheet/WorksheetEngagementCombobox";

const engagements = [
  {
    engagement_id: "eng-1",
    engagement_code: "12",
    engagement_name: "AUD EEFF 2025",
    client: { client_legal_name: "TOTTO SA" },
  },
  {
    engagement_id: "eng-2",
    engagement_code: "34",
    engagement_name: "Tax Review",
    client: { client_legal_name: "Acme Corp" },
  },
];

describe("WorksheetEngagementCombobox (0722-157)", () => {
  it("lists every engagement with its code, name, and client", () => {
    render(<WorksheetEngagementCombobox engagements={engagements} value="" onValueChange={vi.fn()} />);
    expect(screen.getByText("AUD EEFF 2025")).toBeInTheDocument();
    expect(screen.getByText("TOTTO SA")).toBeInTheDocument();
    expect(screen.getByText("Tax Review")).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("typing filters by code, name, or client", async () => {
    const user = userEvent.setup();
    render(<WorksheetEngagementCombobox engagements={engagements} value="" onValueChange={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("worksheet.searchEngagement"), "TOTTO");

    expect(screen.getByText("AUD EEFF 2025")).toBeInTheDocument();
    expect(screen.queryByText("Tax Review")).not.toBeInTheDocument();
  });

  it("selecting an item calls onValueChange with its engagement_id", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<WorksheetEngagementCombobox engagements={engagements} value="" onValueChange={onValueChange} />);

    await user.click(screen.getByText("Tax Review"));

    expect(onValueChange).toHaveBeenCalledWith("eng-2");
  });

  it("shows the selected engagement's code and name in the trigger", () => {
    render(<WorksheetEngagementCombobox engagements={engagements} value="eng-1" onValueChange={vi.fn()} />);
    // getAllByRole: the CommandInput (always in the DOM here, since Popover is mocked open)
    // also carries role="combobox" — the trigger Button is the first of the two.
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("12 - AUD EEFF 2025");
  });
});
