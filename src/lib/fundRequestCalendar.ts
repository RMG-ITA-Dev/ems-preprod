// Calendario de gastos de Solicitud de Fondos (docs/plan-contabilidad-gastos.md, Fase 3).
//
// Espejo en el cliente de las funciones SQL fund_today / fund_request_deadline /
// fund_request_review_deadline / fund_request_month_is_selectable. El servidor es la autoridad
// (trigger fre_enforce_window y las RPC); esto solo arma el formulario y los avisos. Fechas
// como 'YYYY-MM-DD' (strings), sin Date de por medio, para no correr un día por zona horaria.

const pad = (n: number) => String(n).padStart(2, "0");

/** Hoy en La Paz ('YYYY-MM-DD'), igual que fund_today() del servidor. */
export function laPazToday(now: Date = new Date()): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Primer día del mes de una fecha 'YYYY-MM-DD'. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Suma meses a un mes 'YYYY-MM-01'. */
export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${pad(mm + 1)}-01`;
}

/** Fecha fin: día 3 del mes siguiente al mes elegido. */
export function fundRequestDeadline(month: string): string {
  return `${addMonths(monthStart(month), 1).slice(0, 7)}-03`;
}

/** Fin de la revisión de Contabilidad: día 5 del mes siguiente. */
export function fundRequestReviewDeadline(month: string): string {
  return `${addMonths(monthStart(month), 1).slice(0, 7)}-05`;
}

/** Meses que se pueden elegir: el actual y hasta 5 más adelante (6 opciones). */
export function selectableMonths(today: string): string[] {
  const first = monthStart(today);
  return Array.from({ length: 6 }, (_, i) => addMonths(first, i));
}

/** ¿Ya pasó la fecha fin? (el día 3 todavía cuenta). */
export function isDeadlinePassed(month: string, today: string): boolean {
  return today > fundRequestDeadline(month);
}

/** ¿Ya pasó el fin de la revisión de Contabilidad? (el día 5 todavía cuenta). */
export function isReviewDeadlinePassed(month: string, today: string): boolean {
  return today > fundRequestReviewDeadline(month);
}

/** Día del desembolso en La Paz ('YYYY-MM-DD'), a partir del timestamp. */
export function laPazDate(isoTimestamp: string): string {
  return laPazToday(new Date(isoTimestamp));
}

/**
 * Rango válido para la fecha de un gasto: desde el día del desembolso en adelante (la fecha "Al"
 * va desde la fecha "Del" en adelante). null si todavía no hay desembolso o la ventana para
 * registrar ya cerró (pasó la fecha fin).
 */
export function expenseDateRange(
  disbursedAt: string | null,
  month: string,
  today: string,
): { min: string } | null {
  if (!disbursedAt) return null;
  if (today > fundRequestDeadline(month)) return null;
  return { min: laPazDate(disbursedAt) };
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export function formatDateDMY(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** Etiqueta del mes, p. ej. "noviembre de 2026". */
export function formatMonthLabel(month: string, locale: string): string {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}
