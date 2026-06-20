import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLocale,
  getWeekMonday,
  getWorkDays,
  getWeekInfo,
  getPreviousWeek,
  getNextWeek,
  formatDayMonth,
  formatFullDate,
  getDayName,
  toISODateString,
  fromISODateString,
  parseDateLocal,
  getMonthEndInWeek,
  calculateDeadline,
  isDeadlinePassed,
  isDeadlineToday,
  isWithinRetroWindow,
  isCurrentWeek,
  isFutureWeek,
  isPastWeek,
  getEffectiveWeeklyLimits,
  getDailyHourViolations,
} from "../timesheetUtils";
import { es, enUS } from "date-fns/locale";

describe("getLocale", () => {
  it("returns Spanish locale for 'es'", () => {
    expect(getLocale("es")).toBe(es);
  });

  it("returns English locale for 'en'", () => {
    expect(getLocale("en")).toBe(enUS);
  });

  it("returns English locale for unknown language", () => {
    expect(getLocale("fr")).toBe(enUS);
  });
});

describe("getWeekMonday", () => {
  it("returns Monday for a Monday", () => {
    const monday = new Date(2024, 0, 8); // Jan 8, 2024 is Monday
    const result = getWeekMonday(monday);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(8);
  });

  it("returns Monday for a Wednesday", () => {
    const wednesday = new Date(2024, 0, 10); // Jan 10, 2024 is Wednesday
    const result = getWeekMonday(wednesday);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(8);
  });

  it("returns Monday for a Sunday", () => {
    const sunday = new Date(2024, 0, 14); // Jan 14, 2024 is Sunday
    const result = getWeekMonday(sunday);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(8);
  });

  it("returns Monday for a Saturday", () => {
    const saturday = new Date(2024, 0, 13); // Jan 13, 2024 is Saturday
    const result = getWeekMonday(saturday);
    expect(result.getDay()).toBe(1);
    expect(result.getDate()).toBe(8);
  });
});

describe("getWorkDays", () => {
  it("returns 5 days by default (Mon-Fri)", () => {
    const monday = new Date(2024, 0, 8);
    const days = getWorkDays(monday);
    expect(days).toHaveLength(5);
    expect(days[0].getDate()).toBe(8); // Mon
    expect(days[4].getDate()).toBe(12); // Fri
  });

  it("returns 6 days when specified (Mon-Sat)", () => {
    const monday = new Date(2024, 0, 8);
    const days = getWorkDays(monday, 6);
    expect(days).toHaveLength(6);
    expect(days[5].getDate()).toBe(13); // Sat
  });

  it("returns 7 days when specified", () => {
    const monday = new Date(2024, 0, 8);
    const days = getWorkDays(monday, 7);
    expect(days).toHaveLength(7);
    expect(days[6].getDate()).toBe(14); // Sun
  });
});

describe("getWeekInfo", () => {
  it("returns correct week info", () => {
    const date = new Date(2024, 0, 10); // Wed Jan 10, 2024
    const info = getWeekInfo(date);
    
    expect(info.weekStartDate.getDate()).toBe(8); // Monday
    expect(info.weekEndDate.getDate()).toBe(12); // Friday (5 work days)
    expect(info.weekNumber).toBe(15); // Fiscal week (Oct 1 start), not calendar week
    expect(info.year).toBe(2024);
    expect(info.weekDates).toHaveLength(5);
  });

  it("formats range correctly in Spanish", () => {
    const date = new Date(2024, 0, 10);
    const info = getWeekInfo(date, 5, "es");
    expect(info.formattedRange).toContain("08/01/2024");
    expect(info.formattedRange).toContain("12/01/2024");
  });

  it("respects workDays parameter", () => {
    const date = new Date(2024, 0, 10);
    const info = getWeekInfo(date, 6);
    expect(info.weekDates).toHaveLength(6);
    expect(info.weekEndDate.getDate()).toBe(13); // Saturday
  });
});

describe("getPreviousWeek / getNextWeek", () => {
  it("getPreviousWeek returns week before", () => {
    const monday = new Date(2024, 0, 8);
    const prevMonday = getPreviousWeek(monday);
    expect(prevMonday.getDate()).toBe(1);
    expect(prevMonday.getMonth()).toBe(0);
  });

  it("getNextWeek returns week after", () => {
    const monday = new Date(2024, 0, 8);
    const nextMonday = getNextWeek(monday);
    expect(nextMonday.getDate()).toBe(15);
    expect(nextMonday.getMonth()).toBe(0);
  });

  it("handles month boundaries", () => {
    const lastMondayOfJan = new Date(2024, 0, 29);
    const nextMonday = getNextWeek(lastMondayOfJan);
    expect(nextMonday.getMonth()).toBe(1); // February
    expect(nextMonday.getDate()).toBe(5);
  });
});

describe("formatDayMonth", () => {
  it("formats in DD/MM format", () => {
    const date = new Date(2024, 0, 15);
    expect(formatDayMonth(date, "es")).toBe("15/01");
    expect(formatDayMonth(date, "en")).toBe("15/01");
  });
});

describe("formatFullDate", () => {
  it("formats in DD/MM/YYYY format", () => {
    const date = new Date(2024, 5, 15);
    expect(formatFullDate(date, "es")).toBe("15/06/2024");
  });
});

describe("getDayName", () => {
  it("returns day abbreviation in Spanish", () => {
    const monday = new Date(2024, 0, 8);
    const name = getDayName(monday, "es");
    expect(name.toLowerCase()).toContain("lun");
  });

  it("returns day abbreviation in English", () => {
    const monday = new Date(2024, 0, 8);
    const name = getDayName(monday, "en");
    expect(name.toLowerCase()).toContain("mon");
  });
});

describe("toISODateString / fromISODateString", () => {
  it("converts date to ISO string", () => {
    const date = new Date(2024, 5, 15);
    expect(toISODateString(date)).toBe("2024-06-15");
  });

  it("parses ISO string to date", () => {
    const date = fromISODateString("2024-06-15");
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(5); // June (0-indexed)
    expect(date.getDate()).toBe(15);
  });

  it("round-trips correctly", () => {
    const original = new Date(2024, 11, 25);
    const isoString = toISODateString(original);
    const parsed = fromISODateString(isoString);
    expect(toISODateString(parsed)).toBe(isoString);
  });
});

describe("parseDateLocal", () => {
  it("parses date as local midnight", () => {
    const date = parseDateLocal("2024-12-01");
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(11); // December
    expect(date.getDate()).toBe(1);
  });

  it("avoids timezone shift issue", () => {
    // This is the key difference from new Date("2024-12-01")
    const date = parseDateLocal("2024-06-15");
    expect(date.getDate()).toBe(15); // Should always be 15, not 14
  });
});

describe("getMonthEndInWeek", () => {
  it("returns null when no month-end in week", () => {
    const midMonthMonday = new Date(2024, 0, 15); // Jan 15, 2024
    expect(getMonthEndInWeek(midMonthMonday)).toBeNull();
  });

  it("returns month-end date when in work week", () => {
    // Jan 29, 2024 is Monday, Jan 31 (Wed) is month-end
    const monday = new Date(2024, 0, 29);
    const result = getMonthEndInWeek(monday);
    expect(result).not.toBeNull();
    expect(result?.getDate()).toBe(31);
  });

  it("respects workDays parameter", () => {
    // A week where month-end falls on Saturday (day 6)
    const monday = new Date(2024, 2, 25); // March 25, week ending March 30/31
    const result5Days = getMonthEndInWeek(monday, 5);
    const result6Days = getMonthEndInWeek(monday, 6);
    // March 31 is Sunday, so neither should find it
    expect(result5Days).toBeNull();
    expect(result6Days).toBeNull();
  });
});

describe("calculateDeadline", () => {
  it("returns following Monday by default", () => {
    const monday = new Date(2024, 0, 15); // No month-end in week
    const result = calculateDeadline(monday);
    expect(result.isMonthEnd).toBe(false);
    expect(result.monthEndDate).toBeNull();
    expect(result.deadline.getDate()).toBe(22); // Following Monday
  });

  it("returns month-end when in week", () => {
    const monday = new Date(2024, 0, 29); // Jan 31 is Wed
    const result = calculateDeadline(monday);
    expect(result.isMonthEnd).toBe(true);
    expect(result.monthEndDate?.getDate()).toBe(31);
    expect(result.deadline.getDate()).toBe(31);
  });
});

describe("isDeadlinePassed / isDeadlineToday", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("isDeadlinePassed returns true for past date", () => {
    vi.setSystemTime(new Date(2024, 0, 15));
    const pastDeadline = new Date(2024, 0, 10);
    expect(isDeadlinePassed(pastDeadline)).toBe(true);
  });

  it("isDeadlinePassed returns false for future date", () => {
    vi.setSystemTime(new Date(2024, 0, 15));
    const futureDeadline = new Date(2024, 0, 20);
    expect(isDeadlinePassed(futureDeadline)).toBe(false);
  });

  it("isDeadlineToday returns true for today", () => {
    vi.setSystemTime(new Date(2024, 0, 15, 10, 30));
    const today = new Date(2024, 0, 15);
    expect(isDeadlineToday(today)).toBe(true);
  });

  it("isDeadlineToday returns false for other days", () => {
    vi.setSystemTime(new Date(2024, 0, 15));
    expect(isDeadlineToday(new Date(2024, 0, 14))).toBe(false);
    expect(isDeadlineToday(new Date(2024, 0, 16))).toBe(false);
  });
});

describe("isWithinRetroWindow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for week within window", () => {
    vi.setSystemTime(new Date(2024, 0, 15));
    const recentWeek = new Date(2024, 0, 8); // 7 days ago
    expect(isWithinRetroWindow(recentWeek, 14)).toBe(true);
  });

  it("returns false for week outside window", () => {
    vi.setSystemTime(new Date(2024, 0, 15));
    const oldWeek = new Date(2024, 0, 1); // 14 days ago
    expect(isWithinRetroWindow(oldWeek, 7)).toBe(false);
  });

  it("returns true for exactly at cutoff", () => {
    vi.setSystemTime(new Date(2024, 0, 15));
    const cutoffWeek = new Date(2024, 0, 8); // 7 days ago
    expect(isWithinRetroWindow(cutoffWeek, 7)).toBe(true);
  });
});

describe("isCurrentWeek / isFutureWeek / isPastWeek", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("isCurrentWeek returns true for current week's Monday", () => {
    vi.setSystemTime(new Date(2024, 0, 10)); // Wednesday
    const thisMonday = new Date(2024, 0, 8);
    expect(isCurrentWeek(thisMonday)).toBe(true);
  });

  it("isCurrentWeek returns false for other weeks", () => {
    vi.setSystemTime(new Date(2024, 0, 10));
    expect(isCurrentWeek(new Date(2024, 0, 1))).toBe(false);
    expect(isCurrentWeek(new Date(2024, 0, 15))).toBe(false);
  });

  it("isFutureWeek returns true for future week", () => {
    vi.setSystemTime(new Date(2024, 0, 10));
    const nextMonday = new Date(2024, 0, 15);
    expect(isFutureWeek(nextMonday)).toBe(true);
  });

  it("isFutureWeek returns false for current/past weeks", () => {
    vi.setSystemTime(new Date(2024, 0, 10));
    expect(isFutureWeek(new Date(2024, 0, 8))).toBe(false);
    expect(isFutureWeek(new Date(2024, 0, 1))).toBe(false);
  });

  it("isPastWeek returns true for past week", () => {
    vi.setSystemTime(new Date(2024, 0, 10));
    const lastMonday = new Date(2024, 0, 1);
    expect(isPastWeek(lastMonday)).toBe(true);
  });

  it("isPastWeek returns false for current/future weeks", () => {
    vi.setSystemTime(new Date(2024, 0, 10));
    expect(isPastWeek(new Date(2024, 0, 8))).toBe(false);
    expect(isPastWeek(new Date(2024, 0, 15))).toBe(false);
  });
});

describe("getEffectiveWeeklyLimits", () => {
  const mon = new Date(2026, 2, 2);
  const tue = new Date(2026, 2, 3);
  const wed = new Date(2026, 2, 4);
  const thu = new Date(2026, 2, 5);
  const fri = new Date(2026, 2, 6);
  const fullWeek = [mon, tue, wed, thu, fri];
  const noHolidays = new Set<string>();

  it("returns full limits for full week with no boundaries", () => {
    const result = getEffectiveWeeklyLimits(fullWeek, 40, 40, null, null, noHolidays);
    expect(result.effectiveMin).toBe(40);
    expect(result.effectiveMax).toBe(40);
    expect(result.workableDays).toBe(5);
    expect(result.totalDays).toBe(5);
  });

  it("adjusts for mid-week hire date (BUG 0306-74)", () => {
    const result = getEffectiveWeeklyLimits(fullWeek, 40, 40, "2026-03-06", null, noHolidays);
    expect(result.effectiveMin).toBe(8);
    expect(result.effectiveMax).toBe(8);
    expect(result.workableDays).toBe(1);
  });

  it("adjusts for mid-week termination date", () => {
    const result = getEffectiveWeeklyLimits(fullWeek, 40, 40, null, "2026-03-04", noHolidays);
    expect(result.effectiveMin).toBe(24);
    expect(result.effectiveMax).toBe(24);
    expect(result.workableDays).toBe(3);
  });

  it("does NOT subtract holidays from workable days (holidays require 8h on holiday engagement)", () => {
    const holidays = new Set(["2026-03-04"]);
    const result = getEffectiveWeeklyLimits(fullWeek, 40, 40, null, null, holidays);
    expect(result.effectiveMin).toBe(40);
    expect(result.effectiveMax).toBe(40);
    expect(result.workableDays).toBe(5);
  });

  it("hire date still prorates but holidays do not", () => {
    const holidays = new Set(["2026-03-06"]);
    const result = getEffectiveWeeklyLimits(fullWeek, 40, 40, "2026-03-05", null, holidays);
    expect(result.effectiveMin).toBe(16);
    expect(result.effectiveMax).toBe(16);
    expect(result.workableDays).toBe(2);
  });

  it("returns 0 effective min when no workable days", () => {
    const result = getEffectiveWeeklyLimits(fullWeek, 40, 40, "2026-03-09", null, noHolidays);
    expect(result.effectiveMin).toBe(0);
    expect(result.effectiveMax).toBe(0);
    expect(result.workableDays).toBe(0);
  });
});

describe("getDailyHourViolations", () => {
  // Week: Mon 2025-05-19 … Fri 2025-05-23
  const weekDates = [
    new Date(2025, 4, 19), // Mon
    new Date(2025, 4, 20), // Tue
    new Date(2025, 4, 21), // Wed
    new Date(2025, 4, 22), // Thu
    new Date(2025, 4, 23), // Fri
  ];

  it("returns 2 violations when Mon above max and Fri below min (10/8/8/8/6)", () => {
    const entries = [
      { date_worked: "2025-05-19", hours_logged: 10 },
      { date_worked: "2025-05-20", hours_logged: 8 },
      { date_worked: "2025-05-21", hours_logged: 8 },
      { date_worked: "2025-05-22", hours_logged: 8 },
      { date_worked: "2025-05-23", hours_logged: 6 },
    ];
    const result = getDailyHourViolations(entries, weekDates, 8, 8);
    expect(result).toHaveLength(2);
    expect(result[0].dateStr).toBe("2025-05-19");
    expect(result[0].total).toBe(10);
    expect(result[1].dateStr).toBe("2025-05-23");
    expect(result[1].total).toBe(6);
  });

  it("returns 0 violations when all days are exactly 8h (8/8/8/8/8)", () => {
    const entries = [
      { date_worked: "2025-05-19", hours_logged: 8 },
      { date_worked: "2025-05-20", hours_logged: 8 },
      { date_worked: "2025-05-21", hours_logged: 8 },
      { date_worked: "2025-05-22", hours_logged: 8 },
      { date_worked: "2025-05-23", hours_logged: 8 },
    ];
    const result = getDailyHourViolations(entries, weekDates, 8, 8);
    expect(result).toHaveLength(0);
  });

  it("flags days with 0h when they are in weekDates (caller pre-filters workable days)", () => {
    // Only Monday is passed as workable; Tue-Fri were filtered out by the caller
    const entries = [{ date_worked: "2025-05-19", hours_logged: 8 }];
    const result = getDailyHourViolations(entries, [weekDates[0]], 8, 8);
    expect(result).toHaveLength(0); // Mon = 8h exact → no violation
  });

  it("flags a workable day with 0h as a violation", () => {
    // Caller passes all 5 days; Fri has no entry → 0h → violation
    const entries = [
      { date_worked: "2025-05-19", hours_logged: 8 },
      { date_worked: "2025-05-20", hours_logged: 8 },
      { date_worked: "2025-05-21", hours_logged: 8 },
      { date_worked: "2025-05-22", hours_logged: 8 },
      // Fri: no entry → dayTotal = 0 → violation
    ];
    const result = getDailyHourViolations(entries, weekDates, 8, 8);
    expect(result).toHaveLength(1);
    expect(result[0].dateStr).toBe("2025-05-23");
    expect(result[0].total).toBe(0);
  });

  it("sums across multiple rows (engagements) on the same day", () => {
    const entries = [
      { date_worked: "2025-05-19", hours_logged: 5 },
      { date_worked: "2025-05-19", hours_logged: 5 }, // total Mon = 10h → violation
    ];
    // Caller pre-filters: only Monday is workable in this scenario
    const result = getDailyHourViolations(entries, [weekDates[0]], 8, 8);
    expect(result).toHaveLength(1);
    expect(result[0].dateStr).toBe("2025-05-19");
    expect(result[0].total).toBe(10);
  });

  it("returns 1 violation when a single day is below min", () => {
    const entries = [
      { date_worked: "2025-05-19", hours_logged: 4 },
    ];
    // Caller pre-filters: only Monday is workable in this scenario
    const result = getDailyHourViolations(entries, [weekDates[0]], 8, 8);
    expect(result).toHaveLength(1);
    expect(result[0].dateStr).toBe("2025-05-19");
    expect(result[0].total).toBe(4);
  });
});
