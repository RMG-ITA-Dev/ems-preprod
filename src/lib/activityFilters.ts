/**
 * Filters activity codes to those applicable to an engagement's service.
 *
 * An engagement's service is identified by `engagements.practica` (smallint, matches
 * `services.code`). An activity is linked to a service via `activity_codes.practica_id`,
 * exposed here as the embedded `service.code`. Activities with no service link
 * (`service == null`) are "global" (legacy codes like `100-PLA`, plus `ADM`) and are
 * always shown.
 *
 * Rules:
 * - Global activities (`service == null`) are always included.
 * - Service-linked activities are included only when their service code matches the
 *   engagement's `practica`.
 * - The currently-selected activity is always kept visible, even if it no longer matches
 *   (e.g. the engagement's service changed, or it's a legacy entry), so the Select never
 *   renders blank.
 *
 * Engagements with `practica == null` (legacy, pre–services-catalog) therefore see only
 * global activities, which is the confirmed desired behavior.
 */
export function filterActivitiesByService<
  T extends { activity_id: string; service?: { code: number } | null }
>(
  activities: T[],
  practica: number | null | undefined,
  currentActivityId?: string,
): T[] {
  return activities.filter(
    (act) =>
      act.service == null ||
      act.service.code === practica ||
      act.activity_id === currentActivityId,
  );
}

/**
 * Filters activity codes for the work-order budget matrix (WorksheetEdit).
 *
 * Unlike `filterActivitiesByService` above, global/system activities (`is_system`,
 * e.g. `ADM`) are never valid here — a matrix cell must always belong to the
 * engagement's own practice (0825-183). Timesheet/Tracker keep using
 * `filterActivitiesByService`, where those same activities are intentionally global.
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
