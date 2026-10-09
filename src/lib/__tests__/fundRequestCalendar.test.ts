import { describe, it, expect } from "vitest";
import {
  laPazToday,
  addMonths,
  fundRequestDeadline,
  fundRequestReviewDeadline,
  selectableMonths,
  isDeadlinePassed,
  isReviewDeadlinePassed,
  expenseDateRange,
  formatDateDMY,
} from "@/lib/fundRequestCalendar";

// Mismos casos que supabase/tests/rpc-fund-expense-calendar.sql: el cliente y el servidor
// tienen que calcular las mismas fechas.

describe("fundRequestCalendar", () => {
  it("uses La Paz time for 'today' (UTC-4): 02:00 UTC is still the previous day", () => {
    expect(laPazToday(new Date("2026-12-04T02:00:00Z"))).toBe("2026-12-03");
    expect(laPazToday(new Date("2026-12-04T04:05:00Z"))).toBe("2026-12-04");
  });

  it("computes the end date (day 3) and the review deadline (day 5) of the next month", () => {
    expect(fundRequestDeadline("2026-11-01")).toBe("2026-12-03");
    expect(fundRequestReviewDeadline("2026-11-01")).toBe("2026-12-05");
  });

  it("crosses the year boundary", () => {
    expect(fundRequestDeadline("2026-12-01")).toBe("2027-01-03");
    expect(fundRequestReviewDeadline("2026-12-01")).toBe("2027-01-05");
    expect(addMonths("2026-10-01", 5)).toBe("2027-03-01");
  });

  it("offers the current month and the next 5", () => {
    expect(selectableMonths("2026-10-08")).toEqual([
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
      "2027-02-01",
      "2027-03-01",
    ]);
  });

  it("day 3 and day 5 still count", () => {
    expect(isDeadlinePassed("2026-11-01", "2026-12-03")).toBe(false);
    expect(isDeadlinePassed("2026-11-01", "2026-12-04")).toBe(true);
    expect(isReviewDeadlinePassed("2026-11-01", "2026-12-05")).toBe(false);
    expect(isReviewDeadlinePassed("2026-11-01", "2026-12-06")).toBe(true);
  });

  it("expense dates go from the disbursement day (La Paz) to min(today, end date)", () => {
    // 10/11 15:20 en La Paz = 10/11 19:20 UTC.
    const disbursed = "2026-11-10T19:20:00Z";
    expect(expenseDateRange(disbursed, "2026-11-01", "2026-11-15")).toEqual({
      min: "2026-11-10",
      max: "2026-11-15",
    });
    expect(expenseDateRange(disbursed, "2026-11-01", "2026-12-03")).toEqual({
      min: "2026-11-10",
      max: "2026-12-03",
    });
  });

  it("has no range before disbursement or after the end date", () => {
    expect(expenseDateRange(null, "2026-11-01", "2026-11-15")).toBeNull();
    expect(expenseDateRange("2026-11-10T19:20:00Z", "2026-11-01", "2026-12-04")).toBeNull();
  });

  it("formats dates as DD/MM/YYYY", () => {
    expect(formatDateDMY("2026-12-03")).toBe("03/12/2026");
  });
});
