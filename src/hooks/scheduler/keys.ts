// Scheduler query-key literals — single source (Phase 4 plan §4).
// camelCase, matching Phase 3's ["engagementAssignments", id] convention.
// Never inline these strings: drag-commit invalidations (§8) and the
// hooks below must agree on the exact keys.
export const SCHEDULER_L1_KEY = "schedulerL1";
export const SCHEDULER_STAFF_LOAD_KEY = "schedulerStaffLoad";
export const SCHEDULER_STAFF_TIMELINE_KEY = "schedulerStaffTimeline";
export const SCHEDULER_TIMESHEET_AUTHZ_KEY = "schedulerTimesheetAuthz";
export const SCHEDULER_GAPS_KEY = "schedulerGaps";
