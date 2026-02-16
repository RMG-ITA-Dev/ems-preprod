# Changelog — 2026-02-13

## Schema: Merge `staff_capacity` into `staff`

### Problem

The database had a separate `staff_capacity` table designed to track per-staff weekly capacity with historical date-range support (`effective_from`, `effective_to`). In practice:

- The table contained **zero rows** — every capacity lookup fell back to the hardcoded default of 40 hours/week.
- The date-range columns (`effective_from`, `effective_to`) were never used; the edge function always selected the single latest active record or defaulted to 40.
- The table added unnecessary complexity: its own RLS policies, indexes, triggers, and a join in the `dashboard-data` edge function — all for a value that could be a simple column on `staff`.
- Only **one file** outside of auto-generated types and documentation referenced the table: `supabase/functions/dashboard-data/index.ts`.

### Solution

Consolidate `staff_capacity` into the `staff` table by adding a single column.

### What Changed

#### Database Migration
- Added `weekly_capacity_hours NUMERIC NOT NULL DEFAULT 40` column to the `staff` table.
- Migrated any existing data from `staff_capacity` into the new column (0 rows at time of migration, but handled for safety).
- Dropped the `staff_capacity` table along with all its dependent objects:
  - RLS policies (`staff_capacity_admin_all`, `staff_capacity_self_read`)
  - Index (`idx_staff_capacity_staff_id`)
  - Trigger (`update_staff_capacity_updated_at`)

#### Edge Function (`supabase/functions/dashboard-data/index.ts`)
1. **Team utilization (lines ~574-600):** Removed the separate `staff_capacity` query and join. The existing staff query now includes `weekly_capacity_hours`, and `capacityByStaff` is built directly from the staff list.
2. **Individual capacity (lines ~803-813):** Removed the dedicated `staff_capacity` lookup. Capacity is now read from the staff record already fetched earlier in the function.
3. Removed the `StaffCapacity` interface (no longer needed).

#### Documentation
- `docs/database-schema.sql` — Removed `staff_capacity` table definition, policies, indexes, and trigger; added `weekly_capacity_hours` column to `staff`.
- `supabase/ems-er-diagram.md` — Removed `staff_capacity` entity and its relationship arrow to `staff`.

### Files Modified

| File | Action |
|------|--------|
| Migration SQL | Add column, migrate data, drop table + policies + trigger + indexes |
| `supabase/functions/dashboard-data/index.ts` | Replace 2 `staff_capacity` queries with reads from `staff.weekly_capacity_hours`; remove `StaffCapacity` interface |
| `docs/database-schema.sql` | Schema documentation update |
| `supabase/ems-er-diagram.md` | Remove entity from ER diagram |
| `docs/CHANGELOG-2026-02-13.md` | This changelog |

### Impact

- **Frontend:** None — no `src/` file ever referenced `staff_capacity`.
- **Data loss:** None — table had 0 rows; all capacity values defaulted to 40.
- **Performance:** Slight improvement — dashboard edge function eliminates one extra query/join per request.
- **Rollback:** The migration can be reversed by re-creating the table if needed.

---

## BUG #0206-3: Timesheet Buttons Not Available on Non-Current Weeks

**Date:** 2026-02-13  
**Priority:** Alta  
**Version:** v2.0.3 → v2.0.4  
**Route:** OPERACIONES → Hoja de Tiempo

### Problem

The "Copiar Semana Anterior", "Retirar Envío", and "Guardar Borrador" buttons disappeared when navigating to past or future weeks. Root cause: button visibility was coupled to the monolithic `isEditable` flag, which depends on `lineApprovals` data (`hasPendingLines`, `hasRejectedLines`, `isFullyApproved`). For non-current weeks where no `lineApprovals` records exist yet, these derived booleans evaluate to `false`, hiding the buttons.

### Root Cause Detail

1. `isEditable` requires `lineApprovals` to contain pending/rejected lines for submitted weeks — often empty for past/future weeks.
2. `canUnsubmit` required `hasPendingLines`, making it `false` while `lineApprovals` is loading or absent.
3. Button rules should be independent of line-approval record availability.

### Solution

Decoupled each button's visibility from `isEditable`/`lineApprovals` into three self-contained flags. Added a previous-week period query to gate "Copy Previous Week" correctly. `isEditable` remains unchanged (still controls grid cell editability and Import from Timer).

### Changes — `src/pages/TimeSheet.tsx`

| Change | Detail |
|--------|--------|
| **Import added** | `useQuery` from `@tanstack/react-query`; `toISODateString` from `@/lib/timesheetUtils` |
| **Previous-week period query** | New `useQuery` fetching `timesheet_periods` for the previous week (`previousWeekStart`). Derives `prevWeekSubmittedOrApproved` = `!!previousPeriod?.submitted_at`. |
| **`hasNonZeroEntry`** | New derived boolean: `entries.some((e) => e.hours_logged > 0)` |
| **`canCopyPreviousWeek`** | `!isBeforeHireDate && isWithinEditableWindow && !isSubmitted && !period?.is_period_locked && prevWeekSubmittedOrApproved` |
| **`canUnsubmit` (simplified)** | Old: `isSubmitted && hasPendingLines && !isFullyApproved && isWithinEditableWindow`. New: `isSubmitted && !isFullyApproved && isWithinEditableWindow && !period?.is_period_locked` (removed `hasPendingLines` dependency, added lock guard) |
| **`canSaveDraft`** | `!isBeforeHireDate && isWithinEditableWindow && !period?.is_period_locked && !isFullyApproved && hasNonZeroEntry` |
| **JSX: Copy button** | Condition changed from `isEditable && !isSubmitted` → `canCopyPreviousWeek` |
| **JSX: Unsubmit button** | Uses new `canUnsubmit` (unchanged variable name, simplified logic) |
| **JSX: Save Draft button** | Condition changed from `isEditable` → `canSaveDraft` |
| **Handler guards** | Added `if (!canCopyPreviousWeek) return;`, `if (!canUnsubmit) return;`, `if (!canSaveDraft) return;` at top of respective handlers |

### What Stays Unchanged

- `isEditable` — still controls grid cell editability and Import from Timer button
- `canSubmit` — unchanged
- No mutation logic changes
- No backend/database changes

---

## BUG #0206-19: Start Date Allows Values Before Engagement Creation Date

**Date:** 2026-02-16  
**Priority:** Alta  
**Version:** v2.0.3 → v2.0.4  
**Route:** PRINCIPAL → Encargos

### Problem

The Engagement form allowed users to select a Start Date earlier than the engagement's creation date. The `Engagement` interface lacked `created_at`, the Calendar picker had no date restrictions, and no save-time validation existed.

### Root Cause

1. `Engagement` interface missing `created_at` field — form couldn't reference creation date.
2. Start Date Calendar had no `disabled` prop — any past date was selectable.
3. No `onSubmit` guard to block invalid values.

### Solution

Added a `minStartDate` constraint (today for new engagements, `created_at` for edits) enforced via Calendar `disabled` prop + `onSubmit` validation guard. Also restricted End Date Calendar to not allow dates before the selected Start Date.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useEmsData.ts` | Added `created_at: string \| null` to `Engagement` interface |
| `src/components/forms/EngagementForm.tsx` | Added `useMemo`, `startOfDay`, `isBefore` imports; computed `minStartDate`; added `onSubmit` validation guard; added `disabled` prop to both Start Date and End Date Calendars |
| `src/locales/en.json` | Added `engagement.startDateBeforeCreation` key |
| `src/locales/es.json` | Added `engagement.startDateBeforeCreation` key |
| `docs/CHANGELOG-2026-02-13.md` | This changelog entry |

### Risk Assessment

- **Low risk** — adds constraint only; no existing data or mutations modified.
- Legacy engagements with `start_date < created_at` will still display but will be blocked on save unless corrected.
