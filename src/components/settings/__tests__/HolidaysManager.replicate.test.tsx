import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { HolidaysManager } from "../HolidaysManager";

// ---------------------------------------------------------------------------
// Hoisted mock handles
// ---------------------------------------------------------------------------
const { mutateMock } = vi.hoisted(() => ({ mutateMock: vi.fn() }));

vi.mock("@/hooks/useHolidays", () => ({
  useHolidays: () => ({
    data: [
      {
        holiday_id: "h1",
        holiday_date: "2026-01-01",
        holiday_name: "Año Nuevo",
        created_by: "staff-1",
        created_at: null,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1" } }),
}));

vi.mock("@/hooks/mutations/useHolidayMutations", () => ({
  useReplicateHolidaysToNextYear: () => ({ mutate: mutateMock, isPending: false }),
  useCreateHoliday: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateHoliday: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteHoliday: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useStaff: () => ({ data: [] }),
}));

vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: () => React.createElement("div", { "data-testid": "data-table" }),
}));

vi.mock("@/components/forms/HolidayForm", () => ({
  HolidayForm: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => {
      if (opts?.fromYear !== undefined && opts?.toYear !== undefined) {
        return `${opts.fromYear} ${opts.toYear}`;
      }
      return k;
    },
  }),
}));

// ---------------------------------------------------------------------------

describe("HolidaysManager — replicate button (0513-113)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00"));
    mutateMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("HM1: replicate button is enabled when current-year holidays exist and staffRecord is loaded", () => {
    render(React.createElement(HolidaysManager));
    expect(
      screen.getByRole("button", { name: /holiday\.replicateButton/i })
    ).toBeEnabled();
  });

  it("HM2: clicking the button opens a confirmation dialog showing source and target years", async () => {
    const user = userEvent.setup();
    render(React.createElement(HolidaysManager));

    await user.click(screen.getByRole("button", { name: /holiday\.replicateButton/i }));

    expect(screen.getByRole("heading", { name: /2026.*2027/ })).toBeInTheDocument();
  });

  it("HM3: confirming calls mutate with the current staff_id", async () => {
    const user = userEvent.setup();
    render(React.createElement(HolidaysManager));

    await user.click(screen.getByRole("button", { name: /holiday\.replicateButton/i }));
    await user.click(screen.getByRole("button", { name: /common\.confirm/i }));

    expect(mutateMock).toHaveBeenCalledWith({ created_by: "staff-1" });
  });
});
