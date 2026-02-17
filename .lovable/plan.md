# Plan_0213-27_C02_v1: Add Policy Toggles JSX + Changelog Documentation

## Problem

The EngagementForm has all state, imports, and payload wiring for the three policy flags (`workOrderRequired`, `activityRequired`, `isInternal`) but the actual Switch components were never rendered in the JSX. Without the toggles visible, admins cannot configure engagements like "ADM_01 Feriados" to be internal/non-WO-required, which blocks them from appearing in the timesheet dropdown.

## Solution

Two changes:

### 1. Insert "Timesheet Policy" JSX section into EngagementForm

Insert a new admin-only section between the Dates `</div>` (line 487) and the submit buttons `<div>` (line 489) in `src/components/forms/EngagementForm.tsx`.

The section renders (wrapped in `{isAdmin && (...)}`):

- A section header: `t("engagement.timesheetPolicy")`
- Three rows, each with a `<Switch>` and label + helper text:
  - **Work Order Required** -- bound to `workOrderRequired` / `setWorkOrderRequired`
  - **Activity Required** -- bound to `activityRequired` / `setActivityRequired`
  - **Internal (All Staff)** -- bound to `isInternal` / `setIsInternal`

All imports (`Switch`, `useUserRole`), state variables, and payload inclusion already exist in the file -- only the JSX block is missing.

### 2. Append C02_v1 implementation entry to changelog

Append a new section to `docs/CHANGELOG-2026-02-17.md` documenting the Non-Chargeable Engagement Policy System implementation (Plan C02_v1), covering:

- Problem description
- Solution summary (three flags + DB-enforced ADM activity)
- Database migration details (columns, triggers, global setting)
- Files created and modified
- Risk assessment

## Files Summary


| File                                      | Action | Description                                                                   |
| ----------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `src/components/forms/EngagementForm.tsx` | MODIFY | Insert ~30 lines of JSX for the three Switch toggles between line 487 and 489 |
| `docs/CHANGELOG-2026-02-17.md`            | MODIFY | Append C01_v5 implementation changelog entry                                  |


## Post-Deploy Steps

1. Navigate to Engagements, edit "ADM_01 Feriados"
2. The new "Timesheet Policy" section should now be visible (admin only)
3. Set: Work Order Required OFF, Activity Required OFF, Internal (All Staff) ON
4. Save -- the engagement will then appear in all staff timesheet dropdowns