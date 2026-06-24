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
  useGenerateNationalHolidays: () => ({ mutate: mutateMock, isPending: false }),
  useCreateHoliday: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateHoliday: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteHoliday: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/boliviaHolidays", () => ({
  getBoliviaNationalHolidays: () => [
    { date: "2027-01-01", name: "Año Nuevo" },
    { date: "2027-05-01", name: "Día del Trabajo" },
  ],
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
      if (opts) {
        return Object.entries(opts).reduce(
          (s, [key, val]) => s.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val)),
          k
        );
      }
      return k;
    },
  }),
}));

// ---------------------------------------------------------------------------

describe("HolidaysManager — generate national holidays (0513-113)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01T12:00:00"));
    mutateMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("HM1: generate button is enabled when staffRecord is loaded (no source-year requirement)", () => {
    render(React.createElement(HolidaysManager));
    expect(
      screen.getByRole("button", { name: /holiday\.generateButton/i })
    ).toBeEnabled();
  });

  it("HM2: clicking the button opens a confirmation dialog", async () => {
    const user = userEvent.setup();
    render(React.createElement(HolidaysManager));

    await user.click(screen.getByRole("button", { name: /holiday\.generateButton/i }));

    expect(screen.getByRole("heading", { name: /holiday\.generateConfirmTitle/i })).toBeInTheDocument();
  });

  it("HM3: confirming calls mutate with the current staff_id and target year", async () => {
    const user = userEvent.setup();
    render(React.createElement(HolidaysManager));

    await user.click(screen.getByRole("button", { name: /holiday\.generateButton/i }));
    await user.click(screen.getByRole("button", { name: /common\.confirm/i }));

    expect(mutateMock).toHaveBeenCalledWith({ created_by: "staff-1", year: 2027 });
  });
});
