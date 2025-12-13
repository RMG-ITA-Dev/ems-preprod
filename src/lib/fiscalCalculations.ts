import { startOfYear, endOfYear, startOfQuarter, endOfQuarter, startOfMonth, endOfMonth, format, subYears, addMonths, getYear, getQuarter } from 'date-fns';
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

// Bolivia tax year runs April 1 - March 31
const BOLIVIA_TAX_YEAR_START_MONTH = 3; // April (0-indexed)

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
    const today = new Date();
    return {
      startDate: yearStart,
      endDate: today,
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
 * Get Bolivia tax year period (April 1 - March 31)
 */
export function getBoliviaTaxYearPeriod(fiscalYear: number, quarter?: QuarterType): FiscalPeriod {
  // Fiscal year 2025 runs April 1, 2024 - March 31, 2025
  const yearStart = new Date(fiscalYear - 1, BOLIVIA_TAX_YEAR_START_MONTH, 1);
  const yearEnd = endOfMonth(new Date(fiscalYear, BOLIVIA_TAX_YEAR_START_MONTH - 1, 1));
  
  if (!quarter || quarter === 'full') {
    return {
      startDate: yearStart,
      endDate: yearEnd,
      label: `AF ${fiscalYear}`,
      type: 'tax_bolivia',
      year: fiscalYear,
      quarter: 'full',
    };
  }
  
  if (quarter === 'ytd') {
    const today = new Date();
    return {
      startDate: yearStart,
      endDate: today,
      label: `AF ${fiscalYear} YTD`,
      type: 'tax_bolivia',
      year: fiscalYear,
      quarter: 'ytd',
    };
  }
  
  // Tax quarters
  const quarterNum = parseInt(quarter.replace('Q', ''));
  const quarterStartMonth = BOLIVIA_TAX_YEAR_START_MONTH + (quarterNum - 1) * 3;
  const quarterStartYear = quarterStartMonth >= 12 ? fiscalYear : fiscalYear - 1;
  const adjustedMonth = quarterStartMonth >= 12 ? quarterStartMonth - 12 : quarterStartMonth;
  
  const quarterStart = startOfMonth(new Date(quarterStartYear, adjustedMonth, 1));
  const quarterEnd = endOfMonth(addMonths(quarterStart, 2));
  
  return {
    startDate: quarterStart,
    endDate: quarterEnd,
    label: `AF ${fiscalYear} ${quarter}`,
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
 * Get available years for selection (current + 2 previous)
 */
export function getAvailableYears(): number[] {
  const currentYear = getYear(new Date());
  return [currentYear, currentYear - 1, currentYear - 2];
}

/**
 * Get the current fiscal period based on type
 */
export function getCurrentFiscalPeriod(type: PeriodType): FiscalPeriod {
  const today = new Date();
  const currentYear = getYear(today);
  
  if (type === 'calendar') {
    return getCalendarYearPeriod(currentYear, 'ytd');
  }
  
  // Bolivia tax year - determine which fiscal year we're in
  const currentMonth = today.getMonth();
  const fiscalYear = currentMonth >= BOLIVIA_TAX_YEAR_START_MONTH ? currentYear + 1 : currentYear;
  
  return getBoliviaTaxYearPeriod(fiscalYear, 'ytd');
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
