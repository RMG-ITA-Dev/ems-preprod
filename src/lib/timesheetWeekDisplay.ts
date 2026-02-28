import { startOfWeek } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { getFiscalWeekNumber, getFiscalYearForDate, getFiscalWeekOneMonday } from "@/lib/fiscalCalculations";

/**
 * Week display metadata returned by the canonical helper.
 */
export interface WeekDisplayInfo {
  weekNumber: number;
  fiscalYear: number;
  isValid: boolean;
}

/**
 * Canonical helper for computing week display labels from a week_start_date string.
 *
 * This is the single source of truth for week number and fiscal year display
 * across all timesheet-related screens (Hoja de Tiempo, Aprobaciones, etc.).
 *
 * DB columns `timesheet_periods.week_number` and `timesheet_periods.year` are
 * retained for sorting/indexing but are **non-authoritative** for UI labels.
 * All display must route through this helper (ref: INV-3 in fiscalCalculations.ts).
 *
 * The fiscal year returned is the fiscal year the *week* belongs to, which may
 * differ from `getFiscalYearForDate()` at boundaries (e.g., a late-September
 * Monday that starts FY Week 1 of the next fiscal year).
 *
 * @param weekStartDate - ISO date string (YYYY-MM-DD) of the Monday that starts the week.
 *   May be null, undefined, or empty for defensive handling.
 * @returns WeekDisplayInfo with isValid=false when input is unusable.
 */
export function getWeekDisplayInfo(weekStartDate: string | null | undefined): WeekDisplayInfo {
  const INVALID: WeekDisplayInfo = { weekNumber: 0, fiscalYear: 0, isValid: false };

  if (!weekStartDate || weekStartDate.trim() === "") {
    return INVALID;
  }

  const date = parseDateLocal(weekStartDate);
  if (isNaN(date.getTime())) {
    return INVALID;
  }

  const weekNumber = getFiscalWeekNumber(date);

  // Derive the fiscal year the WEEK belongs to (mirrors logic in getFiscalWeekNumber)
  let fiscalYear = getFiscalYearForDate(date);
  const inputMonday = startOfWeek(date, { weekStartsOn: 1 });
  const nextFYAnchor = getFiscalWeekOneMonday(fiscalYear + 1);
  if (inputMonday.getTime() >= nextFYAnchor.getTime()) {
    fiscalYear = fiscalYear + 1;
  }

  return { weekNumber, fiscalYear, isValid: true };
}
