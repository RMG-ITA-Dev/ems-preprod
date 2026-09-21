import { startOfYear, endOfYear, startOfQuarter, endOfQuarter, startOfMonth, endOfMonth, startOfWeek, startOfDay, format, subYears, addMonths, getYear, getQuarter } from 'date-fns';
import { es } from 'date-fns/locale';

export type PeriodType = 'calendar' | 'tax_bolivia' | 'custom';
export type QuarterType = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'full' | 'ytd';

export interface FiscalPeriod {
  startDate: Date;
  endDate: Date;
  label: string;
  type: PeriodType;
  year: number;
  quarter?: QuarterType;
}

// Fiscal year runs October 1 - September 30
const FISCAL_YEAR_START_MONTH = 9; // October (0-indexed)

/**
 * Get calendar year period
 */
export function getCalendarYearPeriod(year: number, quarter?: QuarterType): FiscalPeriod {
  const yearStart = startOfYear(new Date(year, 0, 1));
  const yearEnd = endOfYear(new Date(year, 0, 1));
  
  if (!quarter || quarter === 'full') {
    return {
      startDate: yearStart,
      endDate: yearEnd,
      label: `${year}`,
      type: 'calendar',
      year,
      quarter: 'full',
    };
  }
  
  if (quarter === 'ytd') {
    // Bug reportado 2026-09-18: con getAvailableYears() habilitando el año siguiente
    // (todavía no arrancado), "today" cae ANTES de yearStart -- sin este clamp, endDate <
    // startDate y el backend responde INVALID_RANGE. Un año futuro que no arrancó tiene
    // YTD vacío por definición, no un rango invertido.
    const today = new Date();
    const endDate = today < yearStart ? yearStart : today;
    return {
      startDate: yearStart,
      endDate,
      label: `YTD ${year}`,
      type: 'calendar',
      year,
      quarter: 'ytd',
    };
  }
  
  const quarterNum = parseInt(quarter.replace('Q', ''));
  const quarterStart = startOfQuarter(new Date(year, (quarterNum - 1) * 3, 1));
  const quarterEnd = endOfQuarter(new Date(year, (quarterNum - 1) * 3, 1));
  
  return {
    startDate: quarterStart,
    endDate: quarterEnd,
    label: `${quarter} ${year}`,
    type: 'calendar',
    year,
    quarter,
  };
}

/**
 * Get fiscal year period (October 1 - September 30)
 */
export function getFiscalYearPeriod(fiscalYear: number, quarter?: QuarterType): FiscalPeriod {
  // Fiscal year 2025 runs October 1, 2024 - September 30, 2025
  const yearStart = new Date(fiscalYear - 1, FISCAL_YEAR_START_MONTH, 1);
  const yearEnd = endOfMonth(new Date(fiscalYear, FISCAL_YEAR_START_MONTH - 1, 1));
  
  if (!quarter || quarter === 'full') {
    return {
      startDate: yearStart,
      endDate: yearEnd,
      label: `${fiscalYear}`,
      type: 'tax_bolivia',
      year: fiscalYear,
      quarter: 'full',
    };
  }
  
  if (quarter === 'ytd') {
    // Mismo clamp que getCalendarYearPeriod (ver comentario ahí): un año fiscal futuro que
    // todavía no arrancó tiene YTD vacío, no un rango invertido (endDate < startDate).
    const today = new Date();
    const endDate = today < yearStart ? yearStart : today;
    return {
      startDate: yearStart,
      endDate,
      label: `${fiscalYear} YTD`,
      type: 'tax_bolivia',
      year: fiscalYear,
      quarter: 'ytd',
    };
  }
  
  // Fiscal quarters (Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep)
  const quarterNum = parseInt(quarter.replace('Q', ''));
  const quarterStartMonth = FISCAL_YEAR_START_MONTH + (quarterNum - 1) * 3;
  const quarterStartYear = quarterStartMonth >= 12 ? fiscalYear - 1 + Math.floor(quarterStartMonth / 12) : fiscalYear - 1;
  const adjustedMonth = quarterStartMonth % 12;
  
  const quarterStart = startOfMonth(new Date(quarterStartYear, adjustedMonth, 1));
  const quarterEnd = endOfMonth(addMonths(quarterStart, 2));
  
  return {
    startDate: quarterStart,
    endDate: quarterEnd,
    label: `${fiscalYear} ${quarter}`,
    type: 'tax_bolivia',
    year: fiscalYear,
    quarter,
  };
}

/**
 * Get custom date range period
 */
export function getCustomPeriod(startDate: Date, endDate: Date): FiscalPeriod {
  return {
    startDate,
    endDate,
    label: `${format(startDate, 'dd MMM', { locale: es })} - ${format(endDate, 'dd MMM yyyy', { locale: es })}`,
    type: 'custom',
    year: getYear(endDate),
  };
}

/**
 * Format fiscal year as FYxx (e.g., 2024 → "FY24")
 */
export function formatFiscalYear(year: number): string {
  return `FY${String(year).slice(-2)}`;
}

/**
 * Get available years for selection (current fiscal year, 2 previous, and the next one).
 * Decisión del operador 2026-09-18 (dash_cartera bug-fixing): un encargo puede tener
 * fecha_cierre / anio_fiscal en el ejercicio que todavía no arrancó (p.ej. creado en
 * septiembre para un cierre de octubre) -- sin el año siguiente, era imposible seleccionarlo
 * en ningún selector de periodo del dashboard hasta que rodara el calendario.
 */
export function getAvailableYears(): number[] {
  const today = new Date();
  const currentMonth = today.getMonth();
  // Fiscal year runs Oct-Sep, so October or later means next fiscal year
  const currentFiscalYear = currentMonth >= FISCAL_YEAR_START_MONTH
    ? today.getFullYear() + 1
    : today.getFullYear();

  return [currentFiscalYear - 2, currentFiscalYear - 1, currentFiscalYear, currentFiscalYear + 1];
}

/**
 * Get the current fiscal period
 */
export function getCurrentFiscalPeriod(): FiscalPeriod {
  const today = new Date();
  const currentYear = getYear(today);
  
  // Fiscal year - determine which fiscal year we're in
  const currentMonth = today.getMonth();
  const fiscalYear = currentMonth >= FISCAL_YEAR_START_MONTH ? currentYear + 1 : currentYear;
  
  return getFiscalYearPeriod(fiscalYear, 'ytd');
}

/**
 * Format date range for display
 */
export function formatDateRange(startDate: Date, endDate: Date): string {
  return `${format(startDate, 'dd MMM yyyy', { locale: es })} - ${format(endDate, 'dd MMM yyyy', { locale: es })}`;
}

/**
 * Format date for API calls (ISO format)
 */
export function formatDateForApi(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Get the fiscal year a date belongs to.
 * Rule: If month >= October (index 9), fiscal year = year + 1; otherwise fiscal year = year.
 * Example: Oct 15, 2025 → FY2026; Mar 1, 2026 → FY2026; Sep 30, 2026 → FY2026.
 */
export function getFiscalYearForDate(date: Date): number {
  return date.getMonth() >= FISCAL_YEAR_START_MONTH
    ? date.getFullYear() + 1
    : date.getFullYear();
}

// BUG #0604-143: standard quarter-end closing dates, as [month (0-indexed), day].
export type ClosingDateKey = "December 31" | "March 31" | "June 30" | "September 30";
const CLOSING_MONTH_DAY: [ClosingDateKey, number, number][] = [
  ["December 31", 11, 31],
  ["March 31", 2, 31],
  ["June 30", 5, 30],
  ["September 30", 8, 30],
];

export interface ClosingDateOption {
  value: string;        // normalized "yyyy-MM-dd"
  key: ClosingDateKey;  // for localized labeling via formatFiscalYearEnd
  year: number;         // calendar year of the closing date
  date: Date;
}

/**
 * BUG #0604-143: upcoming quarter-end closing dates for the "Fecha de Cierre" dropdown.
 * Returns every standard close with date >= today, through Sep 30 of the next fiscal year
 * (fiscal year = Oct→Sep, named by its ending year), sorted ascending. Each option carries
 * its full date so the derived fiscal year is unambiguous (no implicit "current year").
 */
export function getUpcomingClosingDates(today: Date = new Date()): ClosingDateOption[] {
  const start = startOfDay(today);
  const currentFY = getFiscalYearForDate(today);
  const upper = new Date(currentFY + 1, 8, 30); // Sep 30 of next fiscal year
  const out: ClosingDateOption[] = [];
  for (let y = start.getFullYear(); y <= currentFY + 1; y++) {
    for (const [key, m, d] of CLOSING_MONTH_DAY) {
      const date = new Date(y, m, d);
      if (date >= start && date <= upper) {
        out.push({ value: format(date, "yyyy-MM-dd"), key, year: y, date });
      }
    }
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

/**
 * Get the Monday that starts fiscal Week 1 for a given fiscal year.
 * Anchor: October 1 of (fiscalYear - 1).
 * If Oct 1 falls on Saturday → shift to Oct 3 (Monday).
 * If Oct 1 falls on Sunday → shift to Oct 2 (Monday).
 * Then return the Monday of the week containing the anchor.
 */
export function getFiscalWeekOneMonday(fiscalYear: number): Date {
  let anchor = new Date(fiscalYear - 1, FISCAL_YEAR_START_MONTH, 1); // Oct 1
  const dow = anchor.getDay(); // 0=Sun, 6=Sat
  if (dow === 6) {
    // Saturday → shift to Monday Oct 3
    anchor = new Date(anchor.getFullYear(), anchor.getMonth(), 3);
  } else if (dow === 0) {
    // Sunday → shift to Monday Oct 2
    anchor = new Date(anchor.getFullYear(), anchor.getMonth(), 2);
  }
  // Get Monday of the week containing the anchor
  return startOfWeek(anchor, { weekStartsOn: 1 });
}

const MS_PER_DAY = 86400000;

/**
 * Compute the fiscal week number for any date.
 * INV-1: Always returns an integer >= 1.
 * INV-2: If date precedes current FY anchor, pivots to previous FY.
 * INV-3: Single source of truth for all week numbering.
 */
export function getFiscalWeekNumber(date: Date): number {
  let fiscalYear = getFiscalYearForDate(date);
  const inputMonday = startOfWeek(date, { weekStartsOn: 1 });

  // Check if the date's week belongs to the NEXT fiscal year
  // (happens when Oct 1 falls mid-week and Week 1 Monday is in late September)
  const nextFYAnchor = getFiscalWeekOneMonday(fiscalYear + 1);
  if (inputMonday.getTime() >= nextFYAnchor.getTime()) {
    fiscalYear = fiscalYear + 1;
  }

  const anchorMonday = getFiscalWeekOneMonday(fiscalYear);
  let daysDiff = Math.round((inputMonday.getTime() - anchorMonday.getTime()) / MS_PER_DAY);

  // Pre-anchor pivot: date is before current FY Week 1 Monday
  if (daysDiff < 0) {
    const prevAnchorMonday = getFiscalWeekOneMonday(fiscalYear - 1);
    daysDiff = Math.round((inputMonday.getTime() - prevAnchorMonday.getTime()) / MS_PER_DAY);
  }

  return Math.floor(daysDiff / 7) + 1;
}
