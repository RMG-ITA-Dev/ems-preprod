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
        oficina: 0,
        created_by: "staff-1",
        created_at: null,
      },
      // Pre-existing 2027 national holiday matching the generated slot exactly —
      // used to assert the preview marks it as already correct.
      {
        holiday_id: "h2",
        holiday_date: "2027-01-01",
        holiday_name: "Año Nuevo",
        oficina: 0,
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
    { date: "2027-01-01", name: "Año Nuevo", oficina: 0 },
    { date: "2027-05-01", name: "Día del Trabajo", oficina: 0 },
    { date: "2027-07-16", name: "Aniversario del Departamento de La Paz", oficina: 1 },
  ],
  NATIONAL_HOLIDAY_NAMES: new Set(["Año Nuevo", "Día del Trabajo"]),
  normalizeHolidayName: (name: string) => name.replace(/^Feriado\s*-\s*/i, "").trim(),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useStaff: () => ({ data: [] }),
}));

vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: ({ headerActions }: { headerActions?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "data-table" }, headerActions ?? null),
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

  it("HM1: generate button is enabled when staffRecord is loaded (no source-year gate)", () => {
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

  // BUG 0526-122: reincorporated year selector (chevron ◀▶), range currentYear..currentYear+5.
  it("HM4: previous-year chevron is disabled at the minimum year (currentYear)", async () => {
    const user = userEvent.setup();
    render(React.createElement(HolidaysManager));

    const prevButton = screen.getByRole("button", { name: /holiday\.previousYear/i });
    expect(prevButton).toBeEnabled(); // starts at currentYear+1 = 2027

    await user.click(prevButton);
    expect(prevButton).toBeDisabled(); // now at currentYear = 2026
  });

  it("HM5: next-year chevron advances the target year used on confirm", async () => {
    const user = userEvent.setup();
    render(React.createElement(HolidaysManager));

    await user.click(screen.getByRole("button", { name: /holiday\.nextYear/i }));
    await user.click(screen.getByRole("button", { name: /holiday\.generateButton/i }));
    await user.click(screen.getByRole("button", { name: /common\.confirm/i }));

    expect(mutateMock).toHaveBeenCalledWith({ created_by: "staff-1", year: 2028 });
  });

  it("HM6: next-year chevron is disabled at the maximum year (currentYear+5)", async () => {
    const user = userEvent.setup();
    render(React.createElement(HolidaysManager));

    const nextButton = screen.getByRole("button", { name: /holiday\.nextYear/i });
    for (let i = 0; i < 4; i++) {
      await user.click(nextButton); // 2027 -> 2028 -> 2029 -> 2030 -> 2031 (=currentYear+5)
    }
    expect(nextButton).toBeDisabled();
  });

  // REVIEW (0526-122 review cycle): the confirmation dialog must preview each
  // generated date with its office, not just aggregate counts.
  it("HM7: confirmation dialog previews each generated date with its office and status", async () => {
    const user = userEvent.setup();
    render(React.createElement(HolidaysManager));

    await user.click(screen.getByRole("button", { name: /holiday\.generateButton/i }));

    // Año Nuevo 2027-01-01 already exists with the correct name → exact match.
    expect(screen.getByText("01/01/2027")).toBeInTheDocument();
    // Día del Trabajo 2027-05-01 has no existing row → will be created.
    expect(screen.getByText("01/05/2027")).toBeInTheDocument();
    // La Paz 2027-07-16 (oficina=1) is previewed with its office label, distinct
    // from the national (oficina=0) entries' "Todas" label.
    expect(screen.getByText("16/07/2027")).toBeInTheDocument();
    expect(screen.getAllByText("engagement.oficina_laPaz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("engagement.oficina_ambos").length).toBeGreaterThan(0);
    expect(screen.getByText("holiday.generatePreviewExact")).toBeInTheDocument();
    expect(screen.getAllByText("holiday.generatePreviewNew").length).toBe(2);
  });
});
