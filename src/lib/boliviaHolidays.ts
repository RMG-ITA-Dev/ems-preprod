// Meeus/Jones/Butcher — Gregorian Easter Sunday for `year`.
// All date math uses UTC to prevent timezone drift on YYYY-MM-DD values.
export function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export interface GeneratedHoliday {
  date: string;
  name: string;
  // If true, this holiday observes the following Monday when it falls on Sunday.
  // Requires applyMondayTransfer:true in opts. Confirm legal basis per holiday before enabling.
  transfers?: boolean;
}

// SINGLE SOURCE OF TRUTH — Bolivia national holidays only (no departmental).
// Ref: https://en.wikipedia.org/wiki/Public_holidays_in_Bolivia
// Confirm list and transfer rules against an authoritative/legal source before shipping.
export function getBoliviaNationalHolidays(
  year: number,
  opts: { applyMondayTransfer?: boolean } = {},
): GeneratedHoliday[] {
  const easter = computeEaster(year);

  const list: GeneratedHoliday[] = [
    { date: `${year}-01-01`, name: "Año Nuevo" },
    { date: `${year}-01-22`, name: "Día del Estado Plurinacional" },
    { date: ymd(addDays(easter, -48)), name: "Lunes de Carnaval" },
    { date: ymd(addDays(easter, -47)), name: "Martes de Carnaval" },
    { date: ymd(addDays(easter, -2)), name: "Viernes Santo" },
    // transfers flag commented until legal confirmation of D.S. 2750 scope
    { date: `${year}-05-01`, name: "Día del Trabajo" /* , transfers: true */ },
    { date: ymd(addDays(easter, 60)), name: "Corpus Christi" },
    { date: `${year}-06-21`, name: "Año Nuevo Andino Amazónico" },
    { date: `${year}-08-06`, name: "Día de la Independencia" },
    { date: `${year}-11-02`, name: "Día de los Difuntos" },
    { date: `${year}-12-25`, name: "Navidad" },
  ];

  const out = list.map((h) => {
    if (!opts.applyMondayTransfer || h.transfers !== true) return h;
    const d = new Date(`${h.date}T00:00:00Z`);
    // Store only the observed Monday; never both days.
    return d.getUTCDay() === 0 ? { ...h, date: ymd(addDays(d, 1)) } : h;
  });

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Canonical name set — used for stale detection in the mutation.
// Built from a fixed year because names are year-independent.
export const NATIONAL_HOLIDAY_NAMES: ReadonlySet<string> = new Set(
  getBoliviaNationalHolidays(2000).map((h) => h.name)
);

// Strip the "Feriado - " prefix that the old "Replicar" feature used in existing data.
// Does NOT strip "(Adicional)" — those are firm-custom extensions that must be preserved.
// Examples:
//   "Feriado - Corpus Christi"             → "Corpus Christi"            ✓ matches national
//   "Feriado - Corpus Christi (Adicional)" → "Corpus Christi (Adicional)" ✗ no match, preserved
//   "Carnaval 2026"                        → "Carnaval 2026"             ✗ no match, manual cleanup needed
export function normalizeHolidayName(name: string): string {
  return name.replace(/^Feriado\s*-\s*/i, "").trim();
}
