import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCalendarYearPeriod,
  getFiscalYearPeriod,
  getCustomPeriod,
  getAvailableYears,
  formatFiscalYear,
  getCurrentFiscalPeriod,
  formatDateRange,
  formatDateForApi,
  getFiscalYearForDate,
  getFiscalWeekOneMonday,
  getFiscalWeekNumber,
  getUpcomingClosingDates,
} from "../fiscalCalculations";

describe("getCalendarYearPeriod", () => {
  describe("full year", () => {
    it("returns Jan 1 to Dec 31", () => {
      const period = getCalendarYearPeriod(2024, "full");
      expect(period.startDate.getFullYear()).toBe(2024);
      expect(period.startDate.getMonth()).toBe(0); // January
      expect(period.startDate.getDate()).toBe(1);
      expect(period.endDate.getMonth()).toBe(11); // December
      expect(period.endDate.getDate()).toBe(31);
    });

    it("returns correct label", () => {
      const period = getCalendarYearPeriod(2024, "full");
      expect(period.label).toBe("2024");
    });

    it("defaults to full when quarter is undefined", () => {
      const period = getCalendarYearPeriod(2024);
      expect(period.quarter).toBe("full");
    });
  });

  describe("quarters", () => {
    it("Q1 is Jan-Mar", () => {
      const period = getCalendarYearPeriod(2024, "Q1");
      expect(period.startDate.getMonth()).toBe(0); // Jan
      expect(period.endDate.getMonth()).toBe(2); // Mar
      expect(period.label).toBe("Q1 2024");
    });

    it("Q2 is Apr-Jun", () => {
      const period = getCalendarYearPeriod(2024, "Q2");
      expect(period.startDate.getMonth()).toBe(3); // Apr
      expect(period.endDate.getMonth()).toBe(5); // Jun
    });

    it("Q3 is Jul-Sep", () => {
      const period = getCalendarYearPeriod(2024, "Q3");
      expect(period.startDate.getMonth()).toBe(6); // Jul
      expect(period.endDate.getMonth()).toBe(8); // Sep
    });

    it("Q4 is Oct-Dec", () => {
      const period = getCalendarYearPeriod(2024, "Q4");
      expect(period.startDate.getMonth()).toBe(9); // Oct
      expect(period.endDate.getMonth()).toBe(11); // Dec
    });
  });

  describe("YTD", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns Jan 1 to today", () => {
      vi.setSystemTime(new Date(2024, 5, 15)); // June 15
      const period = getCalendarYearPeriod(2024, "ytd");
      expect(period.startDate.getMonth()).toBe(0); // Jan
      expect(period.endDate.getMonth()).toBe(5); // Jun
      expect(period.endDate.getDate()).toBe(15);
      expect(period.label).toBe("YTD 2024");
    });
  });
});

describe("getFiscalYearPeriod", () => {
  describe("full fiscal year", () => {
    it("FY2025 runs Oct 1, 2024 to Sep 30, 2025", () => {
      const period = getFiscalYearPeriod(2025, "full");
      expect(period.startDate.getFullYear()).toBe(2024);
      expect(period.startDate.getMonth()).toBe(9); // October
      expect(period.startDate.getDate()).toBe(1);
      expect(period.endDate.getFullYear()).toBe(2025);
      expect(period.endDate.getMonth()).toBe(8); // September
      expect(period.endDate.getDate()).toBe(30);
    });

    it("returns correct label", () => {
      const period = getFiscalYearPeriod(2025, "full");
      expect(period.label).toBe("2025");
      expect(period.type).toBe("tax_bolivia");
    });
  });

  describe("fiscal quarters", () => {
    it("FY Q1 is Oct-Dec", () => {
      const period = getFiscalYearPeriod(2025, "Q1");
      expect(period.startDate.getMonth()).toBe(9); // Oct 2024
      expect(period.startDate.getFullYear()).toBe(2024);
      expect(period.endDate.getMonth()).toBe(11); // Dec 2024
    });

    it("FY Q2 is Jan-Mar", () => {
      const period = getFiscalYearPeriod(2025, "Q2");
      expect(period.startDate.getMonth()).toBe(0); // Jan 2025
      expect(period.startDate.getFullYear()).toBe(2025);
      expect(period.endDate.getMonth()).toBe(2); // Mar 2025
    });

    it("FY Q3 is Apr-Jun", () => {
      const period = getFiscalYearPeriod(2025, "Q3");
      expect(period.startDate.getMonth()).toBe(3); // Apr
      expect(period.endDate.getMonth()).toBe(5); // Jun
    });

    it("FY Q4 is Jul-Sep", () => {
      const period = getFiscalYearPeriod(2025, "Q4");
      expect(period.startDate.getMonth()).toBe(6); // Jul
      expect(period.endDate.getMonth()).toBe(8); // Sep
    });
  });

  describe("fiscal YTD", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns fiscal start to today", () => {
      vi.setSystemTime(new Date(2025, 1, 15)); // Feb 15, 2025
      const period = getFiscalYearPeriod(2025, "ytd");
      expect(period.startDate.getFullYear()).toBe(2024);
      expect(period.startDate.getMonth()).toBe(9); // Oct 2024
      expect(period.endDate.getMonth()).toBe(1); // Feb 2025
      expect(period.endDate.getDate()).toBe(15);
    });
  });
});

describe("getCustomPeriod", () => {
  it("returns correct date range", () => {
    const start = new Date(2024, 0, 15);
    const end = new Date(2024, 2, 20);
    const period = getCustomPeriod(start, end);
    expect(period.startDate).toEqual(start);
    expect(period.endDate).toEqual(end);
    expect(period.type).toBe("custom");
  });

  it("formats label correctly", () => {
    const start = new Date(2024, 0, 15);
    const end = new Date(2024, 2, 20);
    const period = getCustomPeriod(start, end);
    expect(period.label).toContain("15");
    expect(period.label).toContain("20");
  });

  it("uses end date year for period year", () => {
    const start = new Date(2023, 11, 15);
    const end = new Date(2024, 0, 15);
    const period = getCustomPeriod(start, end);
    expect(period.year).toBe(2024);
  });
});

describe("formatFiscalYear", () => {
  it("formats 2024 as FY24", () => {
    expect(formatFiscalYear(2024)).toBe("FY24");
  });

  it("formats 2025 as FY25", () => {
    expect(formatFiscalYear(2025)).toBe("FY25");
  });

  it("formats 2026 as FY26", () => {
    expect(formatFiscalYear(2026)).toBe("FY26");
  });
});

describe("getAvailableYears", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current fiscal year and 2 previous (before October)", () => {
    vi.setSystemTime(new Date(2026, 0, 15)); // January 2026 → FY26
    const years = getAvailableYears();
    expect(years).toEqual([2024, 2025, 2026]);
  });

  it("returns next fiscal year when in October or later", () => {
    vi.setSystemTime(new Date(2025, 9, 15)); // October 2025 → FY26
    const years = getAvailableYears();
    expect(years).toEqual([2024, 2025, 2026]);
  });

  it("updates correctly for different years", () => {
    vi.setSystemTime(new Date(2027, 5, 1)); // June 2027 → FY27
    const years = getAvailableYears();
    expect(years).toEqual([2025, 2026, 2027]);
  });
});

describe("getCurrentFiscalPeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns correct fiscal year when in Oct-Dec", () => {
    vi.setSystemTime(new Date(2024, 10, 15)); // Nov 2024
    const period = getCurrentFiscalPeriod();
    expect(period.year).toBe(2025); // FY2025
    expect(period.quarter).toBe("ytd");
  });

  it("returns correct fiscal year when in Jan-Sep", () => {
    vi.setSystemTime(new Date(2025, 2, 15)); // Mar 2025
    const period = getCurrentFiscalPeriod();
    expect(period.year).toBe(2025); // Still FY2025
  });

  it("returns YTD period type", () => {
    vi.setSystemTime(new Date(2025, 5, 15));
    const period = getCurrentFiscalPeriod();
    expect(period.type).toBe("tax_bolivia");
    expect(period.quarter).toBe("ytd");
  });
});

describe("formatDateRange", () => {
  it("formats date range in Spanish format", () => {
    const start = new Date(2024, 0, 15);
    const end = new Date(2024, 2, 20);
    const formatted = formatDateRange(start, end);
    expect(formatted).toContain("15");
    expect(formatted).toContain("20");
    expect(formatted).toContain("2024");
    expect(formatted).toContain("-");
  });
});

describe("formatDateForApi", () => {
  it("formats date as YYYY-MM-DD", () => {
    const date = new Date(2024, 5, 15);
    expect(formatDateForApi(date)).toBe("2024-06-15");
  });

  it("pads single digit months and days", () => {
    const date = new Date(2024, 0, 5);
    expect(formatDateForApi(date)).toBe("2024-01-05");
});

describe("getFiscalYearForDate", () => {
  it("returns next year for October dates", () => {
    expect(getFiscalYearForDate(new Date(2025, 9, 1))).toBe(2026);
  });
  it("returns next year for December dates", () => {
    expect(getFiscalYearForDate(new Date(2025, 11, 31))).toBe(2026);
  });
  it("returns same year for January dates", () => {
    expect(getFiscalYearForDate(new Date(2026, 0, 15))).toBe(2026);
  });
  it("returns same year for September dates", () => {
    expect(getFiscalYearForDate(new Date(2026, 8, 30))).toBe(2026);
  });
});

describe("getFiscalWeekOneMonday", () => {
  it("FY2026: Oct 1, 2025 is Wednesday → Week 1 Monday = Sep 29, 2025", () => {
    const monday = getFiscalWeekOneMonday(2026);
    expect(monday.getFullYear()).toBe(2025);
    expect(monday.getMonth()).toBe(8);
    expect(monday.getDate()).toBe(29);
    expect(monday.getDay()).toBe(1);
  });

  it("FY2029: Oct 1, 2028 is Sunday → shifts to Oct 2 → Monday = Oct 2, 2028", () => {
    const monday = getFiscalWeekOneMonday(2029);
    expect(monday.getFullYear()).toBe(2028);
    expect(monday.getMonth()).toBe(9);
    expect(monday.getDate()).toBe(2);
    expect(monday.getDay()).toBe(1);
  });

  it("FY2034: Oct 1, 2033 is Saturday → shifts to Oct 3 → Monday = Oct 3, 2033", () => {
    const monday = getFiscalWeekOneMonday(2034);
    expect(monday.getFullYear()).toBe(2033);
    expect(monday.getMonth()).toBe(9);
    expect(monday.getDate()).toBe(3);
    expect(monday.getDay()).toBe(1);
  });
});

describe("getFiscalWeekNumber", () => {
  it("Oct 1, 2025 (Wed) → FY2026 Week 1", () => {
    expect(getFiscalWeekNumber(new Date(2025, 9, 1))).toBe(1);
  });

  it("Sep 29, 2025 (Mon) → FY2026 Week 1", () => {
    expect(getFiscalWeekNumber(new Date(2025, 8, 29))).toBe(1);
  });

  it("Oct 6, 2025 (Mon) → FY2026 Week 2", () => {
    expect(getFiscalWeekNumber(new Date(2025, 9, 6))).toBe(2);
  });

  it("Feb 9, 2026 (Mon) → FY2026 Week 20", () => {
    expect(getFiscalWeekNumber(new Date(2026, 1, 9))).toBe(20);
  });

  it("Feb 16, 2026 (Mon) → FY2026 Week 21", () => {
    expect(getFiscalWeekNumber(new Date(2026, 1, 16))).toBe(21);
  });

  it("Sep 28, 2026 (Mon) → FY2027 Week 1 (Oct 1, 2026 is Thu, so Week 1 Monday = Sep 28)", () => {
    expect(getFiscalWeekNumber(new Date(2026, 8, 28))).toBe(1);
  });

  it("Oct 2, 2028 (Mon, after Sun shift) → FY2029 Week 1", () => {
    expect(getFiscalWeekNumber(new Date(2028, 9, 2))).toBe(1);
  });

  it("Oct 3, 2033 (Mon, after Sat shift) → FY2034 Week 1", () => {
    expect(getFiscalWeekNumber(new Date(2033, 9, 3))).toBe(1);
  });

  it("Sep 28, 2025 (Sun) pivots to FY2025 → week 52", () => {
    const week = getFiscalWeekNumber(new Date(2025, 8, 28));
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBe(52);
  });

  it("always returns >= 1 for various dates", () => {
    const testDates = [
      new Date(2025, 9, 1),
      new Date(2025, 8, 29),
      new Date(2025, 9, 6),
      new Date(2026, 1, 9),
      new Date(2026, 1, 16),
      new Date(2026, 8, 28),
      new Date(2028, 9, 2),
      new Date(2033, 9, 3),
      new Date(2025, 8, 28),
      new Date(2024, 9, 1),
      new Date(2024, 0, 1),
    ];
    testDates.forEach((date) => {
      expect(getFiscalWeekNumber(date)).toBeGreaterThanOrEqual(1);
    });
  });
});
});

// BUG 0604-143: dated rolling-window closing-date options for the "Fecha de Cierre" dropdown.
describe("getUpcomingClosingDates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("July 2026 → next close through Sep 30 of next FY (5 options)", () => {
    const opts = getUpcomingClosingDates(new Date(2026, 6, 1)); // Jul 1, 2026
    expect(opts.map((o) => o.value)).toEqual([
      "2026-09-30",
      "2026-12-31",
      "2027-03-31",
      "2027-06-30",
      "2027-09-30",
    ]);
  });

  it("February 2026 → 7 options, first Mar 31 2026, last Sep 30 2027", () => {
    const opts = getUpcomingClosingDates(new Date(2026, 1, 1)); // Feb 1, 2026
    expect(opts.map((o) => o.value)).toEqual([
      "2026-03-31",
      "2026-06-30",
      "2026-09-30",
      "2026-12-31",
      "2027-03-31",
      "2027-06-30",
      "2027-09-30",
    ]);
  });

  it("includes today when today is exactly a quarter-end (Sep 30)", () => {
    const opts = getUpcomingClosingDates(new Date(2026, 8, 30)); // Sep 30, 2026
    expect(opts[0].value).toBe("2026-09-30");
  });

  it("is sorted ascending, all >= today, and ends at Sep 30 of the next fiscal year", () => {
    const today = new Date(2026, 6, 1);
    const opts = getUpcomingClosingDates(today);
    const times = opts.map((o) => o.date.getTime());
    expect([...times]).toEqual([...times].sort((a, b) => a - b));
    expect(times.every((t) => t >= new Date(2026, 6, 1).getTime())).toBe(true);
    expect(opts[opts.length - 1].value).toBe("2027-09-30"); // FY2026 → next FY ends Sep 30 2027
  });

  it("each option's date derives the expected fiscal year via getFiscalYearForDate", () => {
    const opts = getUpcomingClosingDates(new Date(2026, 6, 1));
    const fyByValue = Object.fromEntries(opts.map((o) => [o.value, getFiscalYearForDate(o.date)]));
    expect(fyByValue["2026-09-30"]).toBe(2026);
    expect(fyByValue["2026-12-31"]).toBe(2027);
    expect(fyByValue["2027-03-31"]).toBe(2027);
    expect(fyByValue["2027-09-30"]).toBe(2027);
  });
});
