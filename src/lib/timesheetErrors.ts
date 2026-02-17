// Typed error utility for timesheet mutations.
// Extends Error so it works correctly with generic error handlers,
// stack traces, and instanceof checks.

const TIMESHEET_ERROR_BRAND = "__timesheetError__" as const;

export type TimesheetErrorCode = "WEEK_LOCKED" | "NO_ENTRIES" | "HOLIDAY_BLOCKED" | "HOLIDAY_NOT_CONFIGURED" | "ADM_ACTIVITY_NOT_CONFIGURED";

const messages: Record<TimesheetErrorCode, string> = {
  WEEK_LOCKED: "This week is locked and cannot be modified",
  NO_ENTRIES: "No entries found in the previous week to copy",
  HOLIDAY_BLOCKED: "Cannot log time on a holiday for this engagement",
  HOLIDAY_NOT_CONFIGURED: "Holiday blocking is active but no holiday engagement has been configured",
  ADM_ACTIVITY_NOT_CONFIGURED: "System ADM activity is not configured. Contact an administrator.",
};

export class TimesheetAppError extends Error {
  readonly [TIMESHEET_ERROR_BRAND] = true as const;

  constructor(public readonly code: TimesheetErrorCode, message: string) {
    super(message);
    this.name = "TimesheetAppError";
  }
}

export function createTimesheetError(
  code: TimesheetErrorCode
): TimesheetAppError {
  return new TimesheetAppError(code, messages[code]);
}

export function isTimesheetError(
  error: unknown,
  code?: TimesheetErrorCode
): error is TimesheetAppError {
  if (!(error instanceof TimesheetAppError)) return false;
  if (code !== undefined) return error.code === code;
  return true;
}
