import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  getYear,
  format,
  eachDayOfInterval,
  lastDayOfMonth,
  isBefore,
  isAfter,
  isSameDay,
  parseISO,
  startOfDay,
} from "date-fns";
import { getFiscalWeekNumber } from "@/lib/fiscalCalculations";
import { es, enUS } from "date-fns/locale";

// Types
export interface WeekInfo {
  weekStartDate: Date;
  weekEndDate: Date;
  weekNumber: number;
  year: number;
  weekDates: Date[];
  formattedRange: string;
}

export interface DeadlineInfo {
  deadline: Date;
  isMonthEnd: boolean;
  monthEndDate: Date | null;
}

// Get locale based on language code
export const getLocale = (lang: string) => (lang === "es" ? es : enUS);

// Get the Monday of the week containing the given date
export const getWeekMonday = (date: Date): Date => {
  return startOfWeek(date, { weekStartsOn: 1 }); // 1 = Monday
};

// Get the Friday of the week (for 5-day work week)
export const getWeekFriday = (date: Date): Date => {
  const monday = getWeekMonday(date);
  return addWeeks(monday, 0); // Start from Monday
  // Actually, we need to add 4 days to get Friday
};

// Get work days of the week (Mon-Fri by default, Mon-Sat if workDays=6)
export const getWorkDays = (weekStartDate: Date, workDays: number = 5): Date[] => {
  const days: Date[] = [];
  for (let i = 0; i < workDays; i++) {
    const day = new Date(weekStartDate);
    day.setDate(day.getDate() + i);
    days.push(day);
  }
  return days;
};

// Get full week info for a given date
export const getWeekInfo = (date: Date, workDays: number = 5, lang: string = "es"): WeekInfo => {
  const weekStartDate = getWeekMonday(date);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + workDays - 1);
  
  const weekNumber = getFiscalWeekNumber(weekStartDate);
  const year = getYear(weekStartDate);
  const weekDates = getWorkDays(weekStartDate, workDays);
  
  const locale = getLocale(lang);
  const formattedRange = `${format(weekStartDate, "dd/MM/yyyy", { locale })} - ${format(weekEndDate, "dd/MM/yyyy", { locale })}`;
  
  return {
    weekStartDate,
    weekEndDate,
    weekNumber,
    year,
    weekDates,
    formattedRange,
  };
};

// Navigate to previous week
export const getPreviousWeek = (currentWeekStart: Date): Date => {
  return subWeeks(currentWeekStart, 1);
};

// Navigate to next week
export const getNextWeek = (currentWeekStart: Date): Date => {
  return addWeeks(currentWeekStart, 1);
};

// Format a date for display (DD/MM format)
export const formatDayMonth = (date: Date, lang: string = "es"): string => {
  return format(date, "dd/MM", { locale: getLocale(lang) });
};

// Format a date for display (full date)
export const formatFullDate = (date: Date, lang: string = "es"): string => {
  return format(date, "dd/MM/yyyy", { locale: getLocale(lang) });
};

// Get day name abbreviation
export const getDayName = (date: Date, lang: string = "es"): string => {
  return format(date, "EEE", { locale: getLocale(lang) });
};

// Convert Date to ISO date string (YYYY-MM-DD) for database
export const toISODateString = (date: Date): string => {
  return format(date, "yyyy-MM-dd");
};

// Parse ISO date string to Date
export const fromISODateString = (dateString: string): Date => {
  return parseISO(dateString);
};

/**
 * Parse "YYYY-MM-DD" as local date, avoiding timezone shift.
 *
 * MANDATORY: All date-only DB columns (Supabase DATE type / "YYYY-MM-DD" strings)
 * MUST use this function. NEVER use new Date(string) for date-only values.
 * Ref: BUG 0220-59 -- new Date("YYYY-MM-DD") interprets as UTC midnight,
 * which becomes the previous day in timezones behind UTC (e.g., Bolivia UTC-4).
 */
export const parseDateLocal = (dateString: string): Date => {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
};

// ============== DEADLINE LOGIC ==============

// Check if a week spans a month-end
export const getMonthEndInWeek = (weekStartDate: Date, workDays: number = 5): Date | null => {
  const weekDates = getWorkDays(weekStartDate, workDays);
  
  for (const date of weekDates) {
    const monthEnd = lastDayOfMonth(date);
    // Check if the last day of the month falls within this work week
    if (weekDates.some(d => isSameDay(d, monthEnd))) {
      return monthEnd;
    }
  }
  
  return null;
};

// Calculate the submission deadline for a week
// - If week contains month-end, deadline is that month-end date
// - Otherwise, deadline is the following Monday
export const calculateDeadline = (
  weekStartDate: Date,
  workDays: number = 5,
  monthEndRule: string = "COMPLETE_SPANNING_WEEK"
): DeadlineInfo => {
  const monthEnd = getMonthEndInWeek(weekStartDate, workDays);
  
  if (monthEnd && monthEndRule === "COMPLETE_SPANNING_WEEK") {
    return {
      deadline: monthEnd,
      isMonthEnd: true,
      monthEndDate: monthEnd,
    };
  }
  
  // Default: following Monday
  const followingMonday = addWeeks(weekStartDate, 1);
  return {
    deadline: followingMonday,
    isMonthEnd: false,
    monthEndDate: null,
  };
};

// Check if a deadline has passed
export const isDeadlinePassed = (deadline: Date): boolean => {
  const today = new Date();
  today.setHours(23, 59, 59, 999); // End of today
  return isAfter(today, deadline);
};

// Check if today is the deadline
export const isDeadlineToday = (deadline: Date): boolean => {
  return isSameDay(new Date(), deadline);
};

// ============== PRORATION HELPERS (BUG 0306-74) ==============

/**
 * Calculate effective weekly min/max limits based on workable days.
 * Accounts for hire date, termination date, and holidays.
 */
export const getEffectiveWeeklyLimits = (
  weekDates: Date[],
  weeklyMin: number,
  weeklyMax: number,
  hireDate: string | null,
  terminationDate: string | null,
  holidayDates: Set<string>,
): { effectiveMin: number; effectiveMax: number; workableDays: number; totalDays: number } => {
  if (weekDates.length === 0) {
    return { effectiveMin: weeklyMin, effectiveMax: weeklyMax, workableDays: 0, totalDays: 0 };
  }

  const totalDays = weekDates.length;
  const hireParsed = hireDate ? parseDateLocal(hireDate) : null;
  const termParsed = terminationDate ? parseDateLocal(terminationDate) : null;

  let workableDays = 0;
  for (const date of weekDates) {
    const dayStart = startOfDay(date);
    if (hireParsed && isBefore(dayStart, startOfDay(hireParsed))) continue;
    if (termParsed && isBefore(startOfDay(termParsed), dayStart)) continue;
    // Holiday dates are NOT subtracted — staff must log 8h on holidays
    // against the holiday engagement. Only hire/termination reduce capacity.
    workableDays++;
  }

  const ratio = totalDays > 0 ? workableDays / totalDays : 1;
  const effectiveMin = Math.round(weeklyMin * ratio * 10) / 10;
  const effectiveMax = Math.round(weeklyMax * ratio * 10) / 10;

  return { effectiveMin, effectiveMax, workableDays, totalDays };
};

// ============== STATUS HELPERS ==============
// Note: Legacy status helpers removed. Status is now determined by:
// - submitted_at: null = draft/open, not-null = submitted
// - timesheet_line_approvals: per-engagement approval status

// ============== VALIDATION HELPERS ==============

// Check if week is within retro edit window for employees
export const isWithinRetroWindow = (weekStartDate: Date, retroDays: number): boolean => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retroDays);
  return isAfter(weekStartDate, cutoffDate) || isSameDay(weekStartDate, cutoffDate);
};

// Check if this is the current week
export const isCurrentWeek = (weekStartDate: Date): boolean => {
  const currentWeekStart = getWeekMonday(new Date());
  return isSameDay(weekStartDate, currentWeekStart);
};

// Check if this is a future week
export const isFutureWeek = (weekStartDate: Date): boolean => {
  const currentWeekStart = getWeekMonday(new Date());
  return isAfter(weekStartDate, currentWeekStart);
};

// Check if this is a past week
export const isPastWeek = (weekStartDate: Date): boolean => {
  const currentWeekStart = getWeekMonday(new Date());
  return isBefore(weekStartDate, currentWeekStart);
};
