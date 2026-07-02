/**
 * Utility for displaying fiscal year-end dates in a localized format.
 * Database stores standardized English values (e.g., "December 31")
 * This utility converts them to localized display strings based on language.
 */

type FiscalDateKey = "December 31" | "March 31" | "June 30" | "September 30";

const fiscalDates: Record<FiscalDateKey, { en: string; es: string }> = {
  "December 31": { en: "December 31", es: "31 de diciembre" },
  "March 31": { en: "March 31", es: "31 de marzo" },
  "June 30": { en: "June 30", es: "30 de junio" },
  "September 30": { en: "September 30", es: "30 de septiembre" },
};

/**
 * Formats a fiscal year-end value for display based on the current language.
 * @param value - The stored fiscal year-end value (e.g., "December 31")
 * @param language - The current language code ("en" or "es")
 * @returns The localized display string, or "-" if no value
 */
export function formatFiscalYearEnd(
  value: string | null | undefined,
  language: string
): string {
  if (!value) return "-";

  const mapping = fiscalDates[value as FiscalDateKey];
  if (!mapping) return value; // fallback to raw value if not recognized

  return language === "es" ? mapping.es : mapping.en;
}

/**
 * Gets the list of fiscal year options for use in dropdowns.
 * Returns the standardized English values that are stored in the database.
 */
export function getFiscalYearOptions(): FiscalDateKey[] {
  return ["December 31", "March 31", "June 30", "September 30"];
}

/**
 * BUG #0604-143: localized label for a dated closing-date option (month/day + year).
 * ES: "30 de septiembre de 2026"; EN: "September 30, 2026".
 */
export function formatClosingDateLabel(
  value: string,
  year: number,
  language: string
): string {
  const base = formatFiscalYearEnd(value, language);
  return language === "es" ? `${base} de ${year}` : `${base}, ${year}`;
}
