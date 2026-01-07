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
});
