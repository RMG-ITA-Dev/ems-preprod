// engagements.funcion: 0 administrativa, 1 cliente, 2 capacitación, 3 calidad (0827-184).
const FUNCION_CLIENTE = 1;
const FUNCIONES_ADMINISTRATIVAS = new Set([0, 2, 3]);

/**
 * Filters activity codes to those applicable to an engagement, anchored on
 * `engagements.funcion` rather than the admin-only `activity_required` flag (0827-184).
 *
 * Rules:
 * - `funcion == null` (legacy/unset): fail-closed, no activities.
 * - `funcion === 1` (cliente): only activities whose service code matches the engagement's
 *   `practica`, excluding system activities (e.g. ADM) and other practices. `practica == null`
 *   yields an empty list.
 * - `funcion` 0/2/3 (administrativa/capacitación/calidad): only the system activity (ADM)
 *   is valid.
 * - Any other `funcion` value (not 0/1/2/3 — outside the DB's `CHECK` constraint): fail-closed,
 *   no activities, same as `funcion == null`.
 * - The currently-selected activity is always kept visible even if it no longer matches
 *   (e.g. the engagement's funcion/practica changed), so the Select never renders blank.
 */
export function filterActivitiesForEngagement<
  T extends { activity_id: string; is_system: boolean; service?: { code: number } | null }
>(
  activities: T[],
  funcion: number | null | undefined,
  practica: number | null | undefined,
  currentActivityId?: string,
): T[] {
  if (funcion == null) {
    return activities.filter((act) => act.activity_id === currentActivityId);
  }
  if (funcion === FUNCION_CLIENTE) {
    return activities.filter(
      (act) =>
        (!act.is_system && practica != null && act.service?.code === practica) ||
        act.activity_id === currentActivityId,
    );
  }
  if (FUNCIONES_ADMINISTRATIVAS.has(funcion)) {
    return activities.filter(
      (act) => act.is_system || act.activity_id === currentActivityId,
    );
  }
  return activities.filter((act) => act.activity_id === currentActivityId);
}

/**
 * Filters activity codes for the work-order budget matrix (WorksheetEdit).
 *
 * Unlike `filterActivitiesForEngagement` above, global/system activities (`is_system`,
 * e.g. `ADM`) are never valid here — a matrix cell must always belong to the
 * engagement's own practice (0825-183). Timesheet/Tracker keep using
 * `filterActivitiesForEngagement`, where those same activities are intentionally global
 * for non-client engagements (0827-184).
 *
 * Rules:
 * - An activity is included only when its `practica_id` matches `practiceId` exactly
 *   and it is not a system activity.
 * - A null/undefined `practiceId` (engagement has no practice, or the practice
 *   mapping hasn't resolved) yields an empty list — there is no valid activity to show.
 */
export function filterWorksheetActivitiesByPractice<
  T extends { practica_id: string | null; is_system: boolean }
>(activities: T[], practiceId: string | null | undefined): T[] {
  if (!practiceId) return [];
  return activities.filter((act) => !act.is_system && act.practica_id === practiceId);
}

/**
 * Numeric-aware comparator for activity codes.
 * Sorts by prefix (alphabetical) then by numeric suffix so that
 * AUD-A2 < AUD-A10 < AUD-A11 (instead of the lexicographic AUD-A10 < AUD-A2).
 */
export function compareActivityCodes(a: string, b: string): number {
  const suffix = (code: string) => parseInt(code.match(/(\d+)$/)?.[1] ?? '0', 10);
  const prefix = (code: string) => code.replace(/\d+$/, '');
  const pa = prefix(a), pb = prefix(b);
  if (pa !== pb) return pa.localeCompare(pb);
  return suffix(a) - suffix(b);
}
