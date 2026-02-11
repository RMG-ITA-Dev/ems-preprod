# EMS 2.0 Bug Fixes — Session Changelog (v3 — Verified)

**Testing Date:** February 6, 2026  
**Fix Date:** February 10, 2026  
**Source:** `TestEMS20-060226_v3.json` (21 bugs reported by `lcandia` and `jyamaca`)  
**Session Focus:** Comprehensive bug-fix session covering authentication, timer, timesheet, forms, roles, approvals, and client management  
**Changelog Version:** v3 — corrected against independent code diff verification (Feb 11, 2026); v3 correction pass based on Claude Opus 4.6 Extended verification report

> **Note:** This changelog was rewritten after an independent line-by-line diff verification revealed
> 7 files falsely claimed as changed (features pre-existed) and 4 genuinely changed files omitted.
> All claims below are verified against actual diffs between the old (`ems-v2.0.H-stable`) and new codebases.

---

## Completion Summary

| # | Title | Priority | Type | Status |
|---|-------|----------|------|--------|
| 1 | Registro de usuario inactivo | Alta | Funcionalidad | ✅ Fixed |
| 2 | Cronómetro no registra tiempo correctamente | Alta | Funcionalidad | ✅ Fixed |
| 3 | Botones no disponibles en semanas distintas | Alta | Funcionalidad | ✅ Fixed |
| 4 | Transferencia Cronómetro a Hoja de Tiempo | Alta | Funcionalidad | ✅ Fixed |
| 5 | Control semanas vs fecha ingreso | Alta | Funcionalidad | ✅ Fixed |
| 6 | Leyendas estados órdenes de trabajo | Media | UX | ✅ Fixed |
| 7 | Crear nueva categoría — campos vacíos | Alta | Funcionalidad | ✅ Fixed |
| 8 | No se puede seleccionar encargo | Alta | Funcionalidad | ✅ Fixed |
| 9 | Control campos crear usuario | Alta | Funcionalidad | ✅ Fixed |
| 10 | Roles faltantes SQR, Especialista IT/TAX | Media | Funcionalidad | ✅ Fixed |
| 11 | Mostrar/Ocultar contraseña login | Baja | UX | ✅ Fixed |
| 12 | Cuenta correo repetida | Alta | Funcionalidad | ✅ Fixed |
| 13 | Mensaje cuenta no vinculada | Media | UX | ✅ Fixed |
| 14 | Dropdown Seleccionar Encargo — contraste | Media | UX | ✅ Fixed |
| 15 | Cronómetro permite múltiples actividades | Alta | Funcionalidad | ✅ Fixed |
| 16 | Aprobación de horas desde gerente | Alta | Funcionalidad | ✅ Fixed |
| 17 | Comportamiento errático Hoja de Tiempo | Alta | Funcionalidad | ✅ Fixed |
| 18 | Nombre cliente repetido | Alta | Funcionalidad | ✅ Fixed |
| 19 | Fecha inicio encargo anterior a creación | Media | Funcionalidad | ✅ Fixed |
| 20 | Error deleting client | Alta | Funcionalidad | ✅ Fixed |
| 21 | Aprobar semana no enviada | Alta | Funcionalidad | ✅ Fixed |

---

## Bug #1: Registro de usuario inactivo

**Reporter:** lcandia · **Priority:** Alta · **Route:** `/auth`

### Problem
An inactive staff member (with `is_active = false`) could still log in. The system did not check the staff record's active status during authentication.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useAuth.tsx` | Added post-login check: queries `staff` table by `auth_user_id`, if `is_active === false` → signs out and returns `ACCOUNT_INACTIVE` error |
| `src/pages/Auth.tsx` | Handles `ACCOUNT_INACTIVE` error code → shows `messages.accountInactive` toast. Also added email confirmation flow: `emailConfirmationRequired` state shows a "Check Your Email" verification card |
| `src/components/ProtectedRoute.tsx` | **New file.** Session guard: checks `staffRecord.is_active === false` during active sessions → forces `signOut()` + redirect to `/auth`. Catches inactive users who were already logged in when deactivated |

### Technical Details
- **Login-time:** After successful `signInWithPassword`, a query to `staff` checks `is_active` for the authenticated user. If inactive, `supabase.auth.signOut()` is called immediately
- **Session-time:** `ProtectedRoute` wraps all authenticated routes. If `staffRecord` loads as inactive, forces sign-out without requiring a new login attempt
- **Email confirmation:** `useAuth` exposes `emailConfirmationRequired` flag; `Auth.tsx` renders a "Verify Your Email" card when set

---

## Bug #2: Cronómetro no registra tiempo correctamente

**Reporter:** lcandia · **Priority:** Alta · **Route:** `/tracker/new`

### Problem
The timer was losing elapsed time on page reload and accumulating drift due to incremental `setInterval` state updates.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useTimeTracker.ts` | Complete rewrite: uses `originalStartTime` (absolute timestamp) + `accumulatedSeconds` instead of incremental `elapsedSeconds` updates. Pure derived elapsed via `useMemo` |

### Technical Details
- **State model:** `{ isRunning, originalStartTime, accumulatedSeconds }` persisted to `localStorage`
- **Elapsed calculation:** `accumulatedSeconds + Math.floor((Date.now() - originalStartTime) / 1000)` — single source of truth, no drift
- **Tick effect:** `setInterval` only triggers re-renders via `setTick(t => t + 1)`, does NOT mutate time state
- **Legacy migration:** Automatically converts old `startTime`/`elapsedSeconds` field names to new format
- **Stop action:** Freezes accumulated time: `total = accumulatedSeconds + elapsed since originalStartTime`

---

## Bug #3: Botones no disponibles en semanas distintas

**Reporter:** lcandia · **Priority:** Alta · **Route:** `/timesheet`

### Problem
The Submit, Unsubmit, Copy Previous Week, and Save Draft buttons were not available when navigating to weeks other than the current week (past weeks within the retro window).

### Changes

| File | Change |
|------|--------|
| `src/pages/TimeSheet.tsx` | BUG #32: Rewrote `isEditable`, `canUnsubmit`, `canSubmit` logic to use `isWithinEditableWindow` (based on `employeeRetroDays` policy) instead of `isCurrentWeek` |

> **Note:** The mutation hooks in `src/hooks/useTimesheetMutations.ts` already supported non-current-week operations prior to this session. No changes were made to that file.

### Technical Details
- `isWithinEditableWindow` checks if the week is within the configurable retro window (default 30 days)
- `canUnsubmit` uses `isWithinEditableWindow` instead of `isCurrentWeek`
- Button visibility now correctly shows for past weeks within the editable window

---

## Bug #4: Transferencia Cronómetro a Hoja de Tiempo

**Reporter:** lcandia · **Priority:** Alta · **Route:** `/tracker`

### Problem
Timer entries could not be transferred (imported) to the timesheet. The import button was conditionally hidden when no importable entries existed, making the feature undiscoverable. There was no import entry point from the Timesheet page.

### Changes

> **Note:** The `TimerImportDialog` component and the basic `handleImport` function in `TrackerList` already existed prior to this session. The changes below improve discoverability and add a second entry point.

| File | Change |
|------|--------|
| `src/pages/TrackerList.tsx` | Changed import button from conditionally hidden (`{count > 0 && <Button>}`) to always visible but disabled when no importable entries exist. Added `Badge` showing importable entry count |
| `src/pages/TimeSheet.tsx` | **New integration.** Added "Import from Timer" button alongside existing action buttons. Queries `useUnimportedTimerEntries` for the current week. Opens `TimerImportDialog`. Includes `handleTimerImport` function that creates `time_entries` and marks `timer_entries` as imported |
| `src/hooks/useTimerEntries.ts` | Added `useRunningTimerEntries` convenience hook for querying running entries (`ended_at IS NULL`) |

### Technical Details
- **TrackerList:** Button always renders with `disabled={entriesLoading || importableEntries.length === 0}`. Badge shows count when entries are ready
- **TimeSheet:** Uses `useUnimportedTimerEntries(currentWeekStart, weekEnd)` to query entries for the displayed week. Import creates `time_entries` via Supabase insert, then marks `timer_entries` as imported via `useMarkTimerEntriesImported`
- **Dialog reuse:** Both pages use the same `TimerImportDialog` component

---

## Bug #5: Control semanas vs fecha ingreso

**Reporter:** lcandia · **Priority:** Alta · **Route:** `/timesheet`

### Problem
Staff members could navigate to and enter time on weeks before their hire date. No validation existed to prevent time entry before employment start.

### Changes

| File | Change |
|------|--------|
| `src/pages/TimeSheet.tsx` | BUG #5: Added `isBeforeHireDate` flag, `lockedDaysBeforeHire` per-day lock map, `earliestWeekStart` constraint |
| `src/components/timesheet/WeekNavigator.tsx` | Added `earliestWeekStart` prop — disables backward navigation past hire date, restricts calendar picker with `fromDate` |
| `src/components/timesheet/TimesheetGrid.tsx` | Added `lockedDaysBeforeHire` prop — locks individual day columns that fall before the hire date |
| `src/hooks/useEmsData.ts` | Added `hire_date` to `StaffFull` interface to make it available throughout the app |

### Technical Details
- **Full week before hire:** Shows destructive Alert with `timesheet.beforeHireDate` message; all buttons disabled
- **Mid-week hire:** Individual day columns before hire date are locked (cells disabled with `bg-muted/40`), but post-hire days remain editable
- **Navigation:** `WeekNavigator` uses `fromDate={earliestWeekStart}` on the calendar component and disables the "Previous" button when at the earliest week
- Uses `date-fns` `parseISO`, `isBefore`, `startOfDay` for date comparisons

---

## Bug #6: Leyendas estados órdenes de trabajo

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/work-orders`

### Problem
The Work Orders list page did not have a visible legend explaining the meaning of status dot colors and season icons.

### Changes

| File | Change |
|------|--------|
| `src/pages/WorkOrders.tsx` | Added status and season legend bar below the search/filter row (desktop only). Also added abbreviated column headers ("T", "E") with tooltips, and season icon tooltips on table body cells |

### Technical Details
- Legend shows: Sun icon for High season, Snowflake icon for Low season
- Status dots: `bg-warning` (Draft), `bg-info` (Pending), `bg-success` (Approved), `bg-destructive` (Rejected)
- Hidden on mobile (`!isMobile`) to preserve space

---

## Bug #7: Crear nueva categoría — campos vacíos

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/settings`

### Problem
The Category creation form allowed submission with empty rate fields, causing database errors or zero-rate categories.

### Changes

| File | Change |
|------|--------|
| `src/components/forms/CategoryForm.tsx` | Changed Zod schema: rates from `.min(0)` to `.positive("Rate must be greater than 0")`; default values from `0` to `undefined as unknown as number` to force user input |

### Technical Details
- Rate fields (`rate_high_bob`, `rate_low_bob`, `rate_high_usd`, `rate_low_usd`) use `z.coerce.number().positive()` validation
- `category_name` uses `z.string().min(1)` to prevent empty names

---

## Bug #8: No se puede seleccionar encargo

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/timesheet`

### Problem
The engagement dropdown in the timesheet grid was empty because it filtered engagements to only those where the staff member was the `partner_id`, `manager_id`, or had prior time entries.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useTimesheetWeek.ts` | BUG #19: Removed the JS filter that restricted engagements by `partner_id`/`manager_id`/prior time entries. Now fetches all active engagements with approved Work Orders |

### Technical Details
- Query chain: `work_orders` (filter `approval_status = 'Approved'`) → collect `engagement_id` list → `engagements` (filter `status = 'active'`, `IN` approved IDs)
- Includes client join: `client:clients!client_id(client_id, client_legal_name)`
- All staff can now log time to any engagement with an approved WO

---

## Bug #9: Control campos crear usuario

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/staff/new`

### Problem
The Staff creation form did not enforce required fields (email, category, city, ID number), allowing incomplete records.

### Changes

| File | Change |
|------|--------|
| `src/components/forms/StaffForm.tsx` | Updated Zod schema: `email` → `z.string().min(1).email()`, `category_id` → `z.string().min(1)`, `city` → `z.string().min(1)`, `id_number` → `z.string().min(1)`. Added `*` suffix to required field labels |

### Technical Details
- City uses a `Select` component with fixed options (La Paz, Santa Cruz)
- Email field also includes a pre-save duplicate check (see Bug #12)

---

## Bug #10: Roles faltantes SQR, Especialista IT/TAX

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/settings`

### Problem
The `app_role` enum was missing three roles: `sqr`, `specialist_it`, and `specialist_tax`.

### Changes

| File | Change |
|------|--------|
| DB migration `20260211004322` | Added `sqr`, `specialist_it`, `specialist_tax` values to `app_role` enum |
| `src/components/settings/UserRolesManager.tsx` | Added icons (`ShieldCheck`, `Monitor`, `Calculator`), colors, and `SelectItem` entries for all three new roles |
| `src/locales/en.json`, `src/locales/es.json` | Added `userRoles.roles.sqr`, `userRoles.roles.specialist_it`, `userRoles.roles.specialist_tax` |

### Technical Details
- Role icons: `ShieldCheck` (SQR), `Monitor` (Specialist IT), `Calculator` (Specialist Tax)
- Role colors: orange (SQR), cyan (IT), indigo (Tax)

---

## Bug #11: Mostrar/Ocultar contraseña login

**Reporter:** jyamaca · **Priority:** Baja · **Route:** `/auth`

### Problem
The login page had no way to toggle password visibility.

### Changes

| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | Added `showPassword` state, Eye/EyeOff toggle button inside password input, `pr-10` padding for input |

### Technical Details
- Toggle button positioned with `absolute right-3 top-1/2 -translate-y-1/2`
- `tabIndex={-1}` to prevent tab-stop on the toggle
- `aria-label` set for accessibility

---

## Bug #12: Cuenta correo repetida

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/staff/new`

### Problem
Two staff records could share the same email address. No database-level constraint existed, and email swaps between records could corrupt the `auth_user_id ↔ staff` linkage.

### Changes

| File | Change |
|------|--------|
| `src/components/forms/StaffForm.tsx` | Added pre-save duplicate email check via Supabase query (excluding current record) → shows `staff.emailAlreadyUsed` toast with existing staff name. Added `emailLinkedWarning` text below email field when staff has a linked auth account |
| DB migration `20260211…` | Added partial unique index `idx_staff_email_unique ON staff(email) WHERE email IS NOT NULL` |

> **Note:** The error handler in `src/lib/error-handler.ts` and the mutation-level `handleStaffError` in `src/hooks/mutations/useStaffMutations.ts` already existed prior to this session as defense-in-depth. The genuinely new work is the form-level pre-save check and the DB constraint.

### Technical Details
- **Form-level:** Pre-save queries `staff` table for matching email, excluding current record → shows `staff.emailAlreadyUsed` with the existing staff member's name
- **Auth warning:** When editing a staff record with `auth_user_id` set, shows `staff.emailLinkedWarning` — changing staff email does not update login credentials
- **DB-level:** Partial unique index allows multiple NULL emails but prevents two records from sharing the same email string

---

## Bug #13: Mensaje cuenta no vinculada

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/timesheet`

### Problem
When a user logged in but had no linked staff record, the error message was unclear.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useCurrentStaff.ts` | Added email-based fallback lookup: if no `auth_user_id` match, tries `email` match with `auth_user_id IS NULL`, then auto-links |
| `src/pages/TimeSheet.tsx` | Shows descriptive Alert with `timesheet.noStaffRecord` and `timesheet.noStaffRecordHelp` (includes user email) |
| DB migration `20260211010034` | Added `link_staff_to_auth_user()` trigger function — server-side complement: when a staff record is created/updated with an email matching an existing auth user, automatically sets `auth_user_id` |

### Technical Details
- **Primary lookup:** `staff.auth_user_id = user.id`
- **Fallback:** If no match, queries `staff.email = user.email AND auth_user_id IS NULL`
- **Auto-link:** If email match found, updates `staff.auth_user_id` to current user's ID
- **DB trigger:** `link_staff_to_auth_user()` fires on INSERT/UPDATE of staff records, matching email to `auth.users`

---

## Bug #14: Dropdown Seleccionar Encargo — contraste

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/timesheet`

### Problem
The engagement dropdown items in the timesheet grid lacked sufficient contrast and didn't show the client name.

### Changes

| File | Change |
|------|--------|
| `src/components/timesheet/TimesheetGrid.tsx` | BUG #31: Added client name display below engagement name in dropdown items. Engagement code uses `font-mono text-xs opacity-60`, client name uses `text-xs opacity-70` |

### Technical Details
- Each `SelectItem` now shows:
  - Line 1: `[engagement_code] engagement_name`
  - Line 2: `client_legal_name` (from joined client data)
- Uses opacity classes for visual hierarchy

---

## Bug #15: Cronómetro permite múltiples actividades

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/tracker/new`

### Problem
The timer allowed starting multiple concurrent timers for different engagements/activities, leading to overlapping time entries with `ended_at = NULL`.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useTimeTracker.ts` | Timer state is a single global object (not per-engagement); starting a new timer implicitly stops any running timer |
| `src/pages/TrackerRecord.tsx` | `handleStart` now queries for orphaned running entries (`ended_at IS NULL`), auto-stops them with correct `duration_minutes`, before creating a new entry |
| DB migration `20260211010728` | Added unique partial index `idx_timer_entries_one_running_per_staff ON timer_entries(staff_id) WHERE ended_at IS NULL` — defense-in-depth: DB rejects a second running entry for the same staff |

> **Note:** The `disabled={isRunning}` props on engagement/activity selectors in `src/components/tracker/TrackerBar.tsx` already existed prior to this session.

### Technical Details
- **Frontend:** `handleStart` queries `timer_entries WHERE staff_id = ? AND ended_at IS NULL`, calculates duration for each, updates with `ended_at` and `duration_minutes`, then creates the new entry
- **DB constraint:** Unique partial index guarantees at most one running entry per staff member, catching any frontend bypasses

---

## Bug #16: Aprobación de horas desde gerente

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/timesheet-approvals`

### Problem
Managers could not approve timesheet lines for engagements they managed. The approval list was not correctly filtered to show only approvable lines.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useTimesheetApprovals.ts` | `usePendingApprovalSummaries` now calls `can_approve_timesheet_line` RPC for each (period, engagement) pair to filter the summary list to only approvable items |

> **Note:** The `can_approve_timesheet_line` DB function existed since December 2025. The fix was calling it in the right place (the approval list query on the client side), not modifying the function itself.

### Technical Details
- The hook iterates over pending summaries and calls `can_approve_timesheet_line(p_approver_auth_id, p_period_id, p_engagement_id)` RPC
- Only summaries where the RPC returns `true` are included in the filtered list
- Query invalidation ensures approval list refreshes after any approval action

---

## Bug #17: Comportamiento errático Hoja de Tiempo

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/timesheet`

### Problem
The timesheet allowed duplicate engagement+activity rows. Users could create multiple rows with the same combination, fragmenting hours and causing data integrity issues.

### Changes

| File | Change |
|------|--------|
| `src/components/timesheet/TimesheetGrid.tsx` | Added duplicate row merge logic in `handleEngagementChange` and `handleActivityChange`: detects duplicate engagement+activity combination, merges hours into existing row, removes duplicate, shows `rowMerged` toast. Added `usedActivitiesByEngagement` memo map that disables already-used activities in the dropdown |

> **Note:** The `rowsRef` (stale closure fix) and `intermediateValue` in `numeric-input.tsx` (decimal typing fix) already existed prior to this session. The genuinely new work is the duplicate detection/merge logic and the activity filtering.

### Technical Details
- **Duplicate detection:** When changing engagement or activity, checks if another row already has the same `engagementId + activityId` combination
- **Merge logic:** If duplicate found, adds current row's hours into existing row's hours map, removes current row, shows `timesheet.rowMerged` toast warning
- **Activity filtering:** `usedActivitiesByEngagement` map (`Map<engagementId, Set<activityId>>`) disables already-used activities in the Select dropdown with `opacity-50` styling
- **On page load:** The `initialRows` useMemo groups by `engagement_id-activity_id` key, consolidating any pre-existing duplicates from the database

---

## Bug #18: Nombre cliente repetido

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/clients/new`

### Problem
Creating a client with a duplicate NIT (tax ID) or name produced a generic database error instead of a user-friendly message.

### Changes

| File | Change |
|------|--------|
| `src/components/forms/ClientForm.tsx` | Added pre-save duplicate NIT check via Supabase query → shows `errors.duplicateNit` toast with existing client name. Added case-insensitive duplicate name check → shows `errors.duplicateClientName` warning toast |

> **Note:** The mutation-level `handleClientError` in `src/hooks/mutations/useClientMutations.ts` and `DB_DUPLICATE_KEY` in `src/lib/error-handler.ts` already existed prior to this session as defense-in-depth for DB constraint violations. The genuinely new work is the form-level pre-save checks that catch duplicates before they hit the database.

### Technical Details
- **NIT check:** Queries `clients` table for matching `unique_tax_id`, excluding current record → shows `errors.duplicateNit` with the existing client's name
- **Name check:** Case-insensitive query using `.ilike('client_legal_name', name)` → shows `errors.duplicateClientName` as a warning (allows override since similar names may be legitimate)
- **Missing DB constraint:** `clients.unique_tax_id` still lacks a DB-level unique constraint — see Recommendations section

---

## Bug #19: Fecha inicio encargo anterior a creación

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/engagements/new`

### Problem
The engagement form allowed setting end dates before start dates without validation. Also lacked duplicate engagement code prevention.

### Changes

| File | Change |
|------|--------|
| `src/components/forms/EngagementForm.tsx` | Added Zod `.refine()` cross-field validation: `end_date >= start_date`. Added `engagement_code` format validation (regex `^[A-Za-z0-9._-]+$`, max 20 chars). Added pre-save duplicate code check. Made `partner_id` and `manager_id` required |
| DB migration `20260211012646` | Added unique index `idx_engagements_code_unique ON engagements(engagement_code) WHERE engagement_code IS NOT NULL` |

### Technical Details
- Zod refine: `(data) => data.end_date >= data.start_date` with error on `end_date` path
- Pre-save duplicate code check queries `engagements` by `engagement_code`, excluding current record

---

## Bug #20: Error deleting client

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/clients/:id`

### Problem
Deleting a client with linked engagements produced a generic database constraint violation error.

### Changes

| File | Change |
|------|--------|
| `src/pages/ClientEdit.tsx` | Added `useQuery` engagement count check; conditionally disables Delete button with Tooltip when `count > 0`; safety pre-check in `handleDelete` |
| `src/components/forms/ClientForm.tsx` | Same pattern for the form-level delete button |

### Technical Details
- **Count query:** `supabase.from('engagements').select('engagement_id', { count: 'exact', head: true }).eq('client_id', id)` — efficient HEAD request
- **Disabled button UX:** Radix Tooltip wraps a `<span>` around the disabled `<Button>` (since disabled elements don't fire pointer events)
- **Tooltip message:** `client.cannotDeleteTooltip`

---

## Bug #21: Aprobar semana no enviada

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/timesheet`

### Problem
The "Enviar Semana" button remained active after submission. Re-clicking overwrote the `submitted_at` timestamp and upserted line approvals.

### Changes

| File | Change |
|------|--------|
| `src/pages/TimeSheet.tsx` | BUG #21: Added `canSubmit` flag separate from `isEditable`; button renders conditionally with `{canSubmit && ...}`; dynamic label for resubmit scenario |

### Technical Details

**`canSubmit` logic:**
```typescript
const canSubmit = !isBeforeHireDate && isWithinEditableWindow && entries.length > 0 && (
  (!isSubmitted && !period?.is_period_locked) ||
  (isSubmitted && hasRejectedLines && !isFullyApproved)
);
```

**State matrix:**

| Scenario | `isEditable` | `canSubmit` | Submit Button |
|----------|-------------|-------------|---------------|
| Fresh week, no entries | ✅ | ❌ | Hidden |
| Fresh week, has entries | ✅ | ✅ | "Enviar Semana" |
| Submitted, pending lines | ✅ | ❌ | **Hidden** (the fix) |
| Submitted, rejected lines | ✅ | ✅ | "Reenviar Semana" |
| Fully approved | ❌ | ❌ | Hidden |
| Period locked | ❌ | ❌ | Hidden |
| Before hire date | ❌ | ❌ | Hidden |

---

## Database Migrations

All migrations created during this session (dated `20260211*`):

| Migration | Content | Bug |
|-----------|---------|-----|
| `20260211004322` | `ALTER TYPE app_role ADD VALUE 'sqr'`, `'specialist_it'`, `'specialist_tax'` | #10 |
| `20260211010034` | `link_staff_to_auth_user()` trigger function — reverse auto-link from staff email to auth user | #13 |
| `20260211010728` | `CREATE UNIQUE INDEX idx_timer_entries_one_running_per_staff ON timer_entries(staff_id) WHERE ended_at IS NULL` | #15 |
| `20260211012646` | `CREATE UNIQUE INDEX idx_engagements_code_unique ON engagements(engagement_code) WHERE engagement_code IS NOT NULL` | #19 |
| `20260211032125` | `CREATE UNIQUE INDEX idx_staff_email_unique ON staff(email) WHERE email IS NOT NULL` | #12 |

---

## Translation Keys Added

### Genuinely New Keys (verified against baseline diff)

| Key | Bug | Language |
|-----|-----|----------|
| `messages.accountInactive` | #1 | en/es |
| `auth.showPassword` / `auth.hidePassword` | #11 | en/es |
| `auth.verifyYourEmail` / `auth.confirmationSent` | #1 (bonus) | en/es |
| `staff.hireDate` / `staff.hireDateHelp` | #5 | en/es |
| `staff.emailAlreadyUsed` | #12 | en/es |
| `staff.emailLinkedWarning` | #12 | en/es |
| `engagement.duplicateCode` | #19 | en/es |
| `errors.duplicateClientName` | #18 | en/es |
| `timesheet.noStaffRecordHelp` | #13 | en/es |
| `timesheet.resubmitWeek` | #21 | en/es |
| `timesheet.rowMerged` | #17 | en/es |
| `client.cannotDeleteTooltip` / `client.cannotDelete` | #20 | en/es |
| `userRoles.roles.sqr` / `specialist_it` / `specialist_tax` | #10 | en/es |
| `workOrders.seasonColumn` / `statusColumn` / `seasonHigh` / `seasonLow` | #6 | en/es |
### Keys That Already Existed (NOT new in this session)

The following keys were falsely claimed as new in the previous changelog version. They existed in the baseline:

- `errors.duplicateEmail`, `errors.duplicateNit` (value modified to include `{{nit}}` and `{{name}}` template variables)
- `timesheet.noStaffRecord`, `timesheet.beforeHireDate`
- `tracker.importTitle`, `tracker.importDescription`, `tracker.importFromTimer`

---

## DB Constraints Summary

All critical unique constraints are now in place:

- **`staff.email`** — partial unique index added in this session (`idx_staff_email_unique`, migration `20260211032125`)
- **`clients.unique_tax_id`** — `NOT NULL UNIQUE` constraint exists since original schema creation (migration `20251204045534`)
- **`engagements.engagement_code`** — partial unique index added in this session (`idx_engagements_code_unique`, migration `20260211012646`)

---

## Testing Checklist

### Authentication (Bugs #1, #11)
- [ ] Inactive staff member cannot log in — shows "account deactivated" message
- [ ] Active session with deactivated staff gets force-signed-out (ProtectedRoute)
- [ ] Password visibility toggle works on login and signup
- [ ] Email confirmation flow shows "Check Your Email" card

### Timer (Bugs #2, #4, #15)
- [ ] Timer persists across page reloads without losing time
- [ ] Timer shows correct elapsed time after pause/resume
- [ ] Starting a new timer auto-stops any orphaned running entries
- [ ] Only one `ended_at IS NULL` entry per staff in the database
- [ ] Import button always visible on TrackerList (disabled when empty, enabled with badge count)
- [ ] "Import from Timer" button appears on Timesheet page when unimported entries exist for the week
- [ ] Timer entries can be imported from both TrackerList and TimeSheet pages

### Timesheet (Bugs #3, #5, #8, #14, #17, #21)
- [ ] Buttons (Submit, Save Draft, Copy Previous) available on past weeks within retro window
- [ ] Navigation blocked before hire date; mid-week hire locks pre-hire days
- [ ] Engagement dropdown shows all engagements with approved Work Orders
- [ ] Engagement dropdown shows client name with opacity-based contrast
- [ ] Duplicate engagement+activity row auto-merges with toast notification
- [ ] Already-used activities disabled in dropdown per engagement
- [ ] Submit button hidden after submission; "Reenviar Semana" only shows if lines rejected

### Work Orders (Bug #6)
- [ ] Status legend visible on desktop showing dot colors and season icons

### Forms (Bugs #7, #9, #12, #18, #19)
- [ ] Category form rejects empty rate fields with validation error
- [ ] Staff form requires email, category, city, and ID number
- [ ] Duplicate email shows friendly error with existing staff name
- [ ] Email linked warning shown when editing linked staff records
- [ ] Duplicate NIT shows friendly error with existing client name
- [ ] Duplicate client name shows warning toast
- [ ] Engagement end date must be on or after start date
- [ ] Duplicate engagement code shows error with existing engagement name

### Roles (Bug #10)
- [ ] SQR, Specialist IT, Specialist Tax roles appear in role dropdown
- [ ] Roles can be assigned and display correct icons/colors

### Account Linking (Bug #13)
- [ ] Unlinked user sees helpful message with their email
- [ ] Email-based fallback auto-links staff record
- [ ] DB trigger auto-links on staff record creation/update

### Approvals (Bug #16)
- [ ] Manager can approve lines for engagements they manage
- [ ] Partner can approve lines for engagements they lead

### Clients (Bug #20)
- [ ] Delete button disabled with tooltip when client has engagements
- [ ] Delete button enabled when client has no engagements

---

*Testing session: February 6, 2026 · Bug fixes applied: February 10–11, 2026*  
*Changelog v2 verified: February 11, 2026*
