# EMS 2.0 Bug Fixes — Session Changelog

**Testing Date:** February 6, 2026  
**Fix Date:** February 10, 2026  
**Source:** `TestEMS20-060226_v3.json` (21 bugs reported by `lcandia` and `jyamaca`)  
**Session Focus:** Comprehensive bug-fix session covering authentication, timer, timesheet, forms, roles, approvals, and client management

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
| `src/pages/Auth.tsx` | Handles `ACCOUNT_INACTIVE` error code → shows `messages.accountInactive` toast |

### Technical Details
- After successful `signInWithPassword`, a query to `staff` checks `is_active` for the authenticated user
- If inactive, `supabase.auth.signOut()` is called immediately, and a custom error `ACCOUNT_INACTIVE` is returned
- Auth page catches this error and displays a localized toast message

---

## Bug #2: Cronómetro no registra tiempo correctamente

**Reporter:** lcandia · **Priority:** Alta · **Route:** `/tracker/new`

### Problem
The timer was losing elapsed time on page reload and accumulating drift due to incremental `setInterval` state updates.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useTimeTracker.ts` | Complete rewrite: uses `originalStartTime` (absolute timestamp) + `accumulatedSeconds` instead of incremental `elapsedSeconds` updates. Pure derived elapsed via `useMemo`. |

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
| `src/hooks/useTimesheetMutations.ts` | Updated mutation hooks to support operations on non-current-week periods |

### Technical Details
- `isWithinEditableWindow` checks if the week is within the configurable retro window (default 30 days)
- `canUnsubmit` uses `isWithinEditableWindow` instead of `isCurrentWeek`
- Button visibility now correctly shows for past weeks within the editable window

---

## Bug #4: Transferencia Cronómetro a Hoja de Tiempo

**Reporter:** lcandia · **Priority:** Alta · **Route:** `/tracker`

### Problem
Timer entries could not be transferred (imported) to the timesheet. The import dialog was missing or non-functional.

### Changes

| File | Change |
|------|--------|
| `src/components/tracker/TimerImportDialog.tsx` | Created import dialog with checkboxes, duration display, engagement/activity columns, and batch import action |
| `src/pages/TrackerList.tsx` | Added "Import to Timesheet" button that opens the dialog with unimported timer entries |

### Technical Details
- Dialog shows all completed, non-imported timer entries with select-all capability
- Selected entries are imported as time entries with matching engagement/activity/date
- After import, timer entries are marked `is_imported = true` with `imported_to_time_id` reference
- Total selected duration displayed at the bottom of the dialog

---

## Bug #5: Control semanas vs fecha ingreso

**Reporter:** lcandia · **Priority:** Alta · **Route:** `/timesheet`

### Problem
Staff members could navigate to and enter time on weeks before their hire date. No validation existed to prevent time entry before employment start.

### Changes

| File | Change |
|------|--------|
| `src/pages/TimeSheet.tsx` | BUG #5: Added `isBeforeHireDate` flag, `lockedDaysBeforeHire` per-day lock map, `earliestWeekStart` constraint |
| `src/components/timesheet/WeekNavigator.tsx` | BUG #5: Added `earliestWeekStart` prop — disables backward navigation past hire date, restricts calendar picker with `fromDate` |
| `src/components/timesheet/TimesheetGrid.tsx` | BUG #5: Added `lockedDaysBeforeHire` prop — locks individual day columns that fall before the hire date |

### Technical Details
- **Full week before hire:** Shows destructive Alert with `timesheet.beforeHireDate` message; all buttons disabled
- **Mid-week hire:** Individual day columns before hire date are locked (cells disabled), but post-hire days remain editable
- **Navigation:** `WeekNavigator` uses `fromDate={earliestWeekStart}` on the calendar component and disables the "Previous" button when at the earliest week
- Uses `date-fns` `parseISO`, `isBefore`, `startOfDay` for date comparisons

---

## Bug #6: Leyendas estados órdenes de trabajo

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/work-orders`

### Problem
The Work Orders list page did not have a visible legend explaining the meaning of status dot colors (Draft, Pending, Approved, Rejected) and season icons (High/Low).

### Changes

| File | Change |
|------|--------|
| `src/pages/WorkOrders.tsx` | Added status and season legend bar below the search/filter row (desktop only) |

### Technical Details
- Legend shows: Sun icon for High season, Snowflake icon for Low season
- Status dots: `bg-warning` (Draft), `bg-info` (Pending), `bg-success` (Approved), `bg-destructive` (Rejected)
- Hidden on mobile (`!isMobile`) to preserve space
- Uses semantic color classes from the design system

---

## Bug #7: Crear nueva categoría — campos vacíos

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/settings`

### Problem
The Category creation form allowed submission with empty rate fields, causing database errors or zero-rate categories.

### Changes

| File | Change |
|------|--------|
| `src/components/forms/CategoryForm.tsx` | Changed Zod schema to use `z.coerce.number().positive("Rate must be greater than 0")` for all four rate fields; set default values to `undefined` to force user input |

### Technical Details
- Rate fields (`rate_high_bob`, `rate_low_bob`, `rate_high_usd`, `rate_low_usd`) use `z.coerce.number().positive()` validation
- Default values are `undefined as unknown as number` — forces Zod validation to reject empty submissions
- `category_name` uses `z.string().min(1)` to prevent empty names

---

## Bug #8: No se puede seleccionar encargo

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/timesheet`

### Problem
The engagement dropdown in the timesheet grid was empty because it only showed engagements where the staff member was explicitly in the `engagement_team` table.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useTimesheetWeek.ts` | BUG #19: Replaced `get_staff_assigned_engagements` RPC with direct query: fetch all approved Work Orders → get engagement IDs → fetch active engagements |

### Technical Details
- Query chain: `work_orders` (filter `approval_status = 'Approved'`) → collect `engagement_id` list → `engagements` (filter `status = 'active'`, `IN` approved IDs)
- Includes client join: `client:clients!client_id(client_id, client_legal_name)`
- Cached with 5-minute `staleTime`
- All staff can now log time to any engagement with an approved WO

---

## Bug #9: Control campos crear usuario

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/staff/new`

### Problem
The Staff creation form did not enforce required fields (email, category, city, ID number), allowing incomplete records.

### Changes

| File | Change |
|------|--------|
| `src/components/forms/StaffForm.tsx` | Updated Zod schema: `email` → `z.string().min(1).email()`, `category_id` → `z.string().min(1)`, `city` → `z.string().min(1)`, `id_number` → `z.string().min(1)` |

### Technical Details
- All required fields now use `z.string().min(1, "X is required")` validation
- Form labels show `*` suffix for required fields
- City uses a `Select` component with fixed options (La Paz, Santa Cruz)
- Email field also includes a pre-save duplicate check via Supabase query

---

## Bug #10: Roles faltantes SQR, Especialista IT/TAX

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/settings`

### Problem
The `app_role` enum was missing three roles: `sqr`, `specialist_it`, and `specialist_tax`. The User Roles Manager UI did not display or allow assignment of these roles.

### Changes

| File | Change |
|------|--------|
| DB migration | Added `sqr`, `specialist_it`, `specialist_tax` values to `app_role` enum |
| `src/components/settings/UserRolesManager.tsx` | Added icons (`ShieldCheck`, `Monitor`, `Calculator`), colors, and `SelectItem` entries for all three new roles |
| `src/locales/en.json`, `src/locales/es.json` | Added `userRoles.roles.sqr`, `userRoles.roles.specialist_it`, `userRoles.roles.specialist_tax` |

### Technical Details
- Enum values: `sqr`, `specialist_it`, `specialist_tax`
- Role icons: `ShieldCheck` (SQR), `Monitor` (Specialist IT), `Calculator` (Specialist Tax)
- Role colors: orange (SQR), cyan (IT), indigo (Tax)

---

## Bug #11: Mostrar/Ocultar contraseña login

**Reporter:** jyamaca · **Priority:** Baja · **Route:** `/auth`

### Problem
The login page had no way to toggle password visibility, making it difficult to verify typed passwords.

### Changes

| File | Change |
|------|--------|
| `src/pages/Auth.tsx` | Added `showPassword` state, Eye/EyeOff toggle button inside password input, `pr-10` padding for input |

### Technical Details
- Toggle button positioned with `absolute right-3 top-1/2 -translate-y-1/2`
- Uses `Eye` and `EyeOff` icons from lucide-react
- `tabIndex={-1}` to prevent tab-stop on the toggle
- `aria-label` set for accessibility: `auth.showPassword` / `auth.hidePassword`
- Input type toggles between `"text"` and `"password"`

---

## Bug #12: Cuenta correo repetida

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/staff/new`

### Problem
Creating a staff member with a duplicate email produced a generic database error instead of a user-friendly message.

### Changes

| File | Change |
|------|--------|
| `src/hooks/mutations/useStaffMutations.ts` | BUG #15: Added `handleStaffError` function that checks for `23505` + `email` constraint violation → shows `errors.duplicateEmail` toast |
| `src/lib/error-handler.ts` | BUG #11, #15: Added `DB_DUPLICATE_KEY` error code for PostgreSQL `23505` (unique constraint violation) |
| `src/components/forms/StaffForm.tsx` | Added pre-save duplicate email check via Supabase query before mutation |

### Technical Details
- **Mutation-level:** `handleStaffError` intercepts `23505` errors containing `"email"` → shows `errors.duplicateEmail` toast
- **Form-level:** Pre-save check queries `staff` table for matching email excluding current record → shows `staff.emailAlreadyUsed` with the existing staff member's name
- **Error handler:** `parseSupabaseErrorCode` maps `23505` → `DB_DUPLICATE_KEY` for consistent error categorization

---

## Bug #13: Mensaje cuenta no vinculada

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/timesheet`

### Problem
When a user logged in but had no linked staff record, the error message was unclear and didn't help the user understand the issue.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useCurrentStaff.ts` | Added email-based fallback lookup: if no `auth_user_id` match, tries `email` match with `auth_user_id IS NULL`, then auto-links |
| `src/pages/TimeSheet.tsx` | Shows descriptive Alert with `timesheet.noStaffRecord` and `timesheet.noStaffRecordHelp` (includes user email) |

### Technical Details
- **Primary lookup:** `staff.auth_user_id = user.id`
- **Fallback:** If no match, queries `staff.email = user.email AND auth_user_id IS NULL`
- **Auto-link:** If email match found, updates `staff.auth_user_id` to current user's ID
- **UI message:** Shows the user's email so admins can identify and manually link if needed

---

## Bug #14: Dropdown Seleccionar Encargo — contraste

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/timesheet`

### Problem
The engagement dropdown items in the timesheet grid lacked sufficient contrast and didn't show the client name, making it hard to distinguish between engagements.

### Changes

| File | Change |
|------|--------|
| `src/components/timesheet/TimesheetGrid.tsx` | BUG #31: Added client name display below engagement name in dropdown items with `text-muted-foreground text-xs` styling |

### Technical Details
- Each `SelectItem` now shows:
  - Line 1: `[engagement_code] engagement_name`
  - Line 2: `client_legal_name` (from joined client data)
- Client name uses `text-muted-foreground text-xs` for visual hierarchy
- Engagement code uses `font-mono text-xs opacity-60`

---

## Bug #15: Cronómetro permite múltiples actividades

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/tracker/new`

### Problem
The timer allowed starting multiple concurrent timers for different engagements/activities, leading to overlapping time entries.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useTimeTracker.ts` | Timer state is a single global object (not per-engagement); starting a new timer implicitly stops any running timer |
| `src/components/tracker/TrackerBar.tsx` | Engagement/Activity selectors disabled while timer is running (`disabled={isRunning}`) |

### Technical Details
- Single timer state stored in `localStorage` under `ems_timer_state`
- `setEngagement` resets `activityId` to `null` to prevent stale combinations
- `start()` sets `isRunning = true` with a new `originalStartTime` — only one timer can run
- Engagement and Activity `Select` components are `disabled={isRunning}` to prevent changes mid-timer

---

## Bug #16: Aprobación de horas desde gerente

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/timesheet-approvals`

### Problem
Managers could not approve timesheet lines for engagements they managed. The RPC function `can_approve_timesheet_line` was not correctly checking manager/partner eligibility.

### Changes

| File | Change |
|------|--------|
| DB function | Updated `can_approve_timesheet_line` RPC to check if the approver is the engagement's `manager_id` or `partner_id`, or has an auto-approve category |
| `src/hooks/useTimesheetApprovals.ts` | Uses `can_approve_timesheet_line` RPC to filter approvable lines; bulk approve mutations update `approved_by` with approver's `staff_id` |

### Technical Details
- RPC checks: `p_approver_auth_id` → find `staff_id` → check if staff is `manager_id` or `partner_id` on the engagement, OR if staff's category has `can_approve_timesheets = true`
- Approval mutations: `useBulkApproveTimesheetLines` and `useApproveTimesheetLine` both set `approved_by` and `approved_at`
- Query invalidation ensures approval list refreshes after any approval action

---

## Bug #17: Comportamiento errático Hoja de Tiempo

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/timesheet`

### Problem
The timesheet grid exhibited erratic behavior: (1) stale closures in debounced save callbacks read outdated row data, (2) NumericInput blocked valid intermediate values like "0." while typing.

### Changes

| File | Change |
|------|--------|
| `src/components/timesheet/TimesheetGrid.tsx` | BUG #29: Added `rowsRef` (useRef) synced with rows state; debounced callbacks read from `rowsRef.current` instead of stale closure. BUG #33: Save-now trigger reads from `rowsRef.current` |
| `src/components/ui/numeric-input.tsx` | BUG #33: Added `intermediateValue` state for partial inputs ("-", "."). Min constraint deferred to `onBlur`. Allows "0." as intermediate state |

### Technical Details
- **Stale closure fix:** `rowsRef = useRef<GridRow[]>([])` is updated via `useEffect` whenever `rows` changes. All debounced/delayed callbacks access `rowsRef.current` instead of the closed-over `rows` variable
- **NumericInput intermediate values:** When user types "0.", the component stores `intermediateValue = "0."` and displays it, without emitting `onChange(0)` until the next digit is typed
- **Min validation on blur:** `handleBlur` enforces `min` constraint only after user finishes typing, preventing "0" from being clamped to min while typing "0.5"

---

## Bug #18: Nombre cliente repetido

**Reporter:** jyamaca · **Priority:** Alta · **Route:** `/clients/new`

### Problem
Creating a client with a duplicate NIT (tax ID) produced a generic database constraint error instead of a user-friendly message.

### Changes

| File | Change |
|------|--------|
| `src/hooks/mutations/useClientMutations.ts` | BUG #11: Added `handleClientError` function that checks for `23505` + `unique_tax_id` constraint violation → shows `errors.duplicateNit` toast |
| `src/lib/error-handler.ts` | BUG #11: `DB_DUPLICATE_KEY` error code handles PostgreSQL `23505` violations |

### Technical Details
- `handleClientError` intercepts: `err.code === "23505" && err.message?.includes("unique_tax_id")`
- Shows localized toast: `errors.duplicateNit`
- Falls back to generic `createMutationErrorHandler` for other errors

---

## Bug #19: Fecha inicio encargo anterior a creación

**Reporter:** jyamaca · **Priority:** Media · **Route:** `/engagements/new`

### Problem
The engagement form allowed setting end dates before start dates without validation.

### Changes

| File | Change |
|------|--------|
| `src/components/forms/EngagementForm.tsx` | Added Zod `.refine()` cross-field validation: `end_date >= start_date`, with error on `end_date` path |

### Technical Details
- Zod refine: `(data) => data.end_date >= data.start_date` with message "End date must be on or after the start date"
- Both dates are required: `z.date({ required_error: "Start/End date is required" })`
- Also includes duplicate `engagement_code` pre-save check via Supabase query

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
- **Disabled button UX:** Radix Tooltip wraps a `<span>` around the disabled `<Button>` (since disabled elements don't fire events)
- **Safety pre-check:** `handleDelete` re-queries count before executing delete mutation; shows toast error if engagements found
- **Tooltip message:** "Para eliminar este cliente, primero debe eliminar todos los encargos asociados."

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

## Translation Keys Added

### English (`src/locales/en.json`)
```json
{
  "messages.accountInactive": "Your account has been deactivated. Contact your administrator.",
  "auth.showPassword": "Show password",
  "auth.hidePassword": "Hide password",
  "errors.duplicateEmail": "A staff member with this email already exists.",
  "errors.duplicateNit": "A client with this NIT already exists.",
  "staff.emailAlreadyUsed": "This email is already used by {{name}}.",
  "timesheet.noStaffRecord": "No staff record linked to your account.",
  "timesheet.noStaffRecordHelp": "Ask your administrator to link your account ({{email}}) to a staff record.",
  "timesheet.beforeHireDate": "This week is before your hire date. Time entry is not allowed.",
  "timesheet.resubmitWeek": "Resubmit Week",
  "client.cannotDeleteTooltip": "To delete this client, all associated engagements must be deleted first.",
  "client.cannotDelete": "Cannot delete this client",
  "userRoles.roles.sqr": "SQR",
  "userRoles.roles.specialist_it": "Specialist IT",
  "userRoles.roles.specialist_tax": "Specialist Tax",
  "tracker.importTitle": "Import Timer Entries",
  "tracker.importDescription": "Select completed timer entries to import to your timesheet.",
  "workOrders.status.draft": "Draft",
  "workOrders.status.pending": "Pending",
  "workOrders.status.approved": "Approved",
  "workOrders.status.rejected": "Rejected"
}
```

### Spanish (`src/locales/es.json`)
```json
{
  "messages.accountInactive": "Su cuenta ha sido desactivada. Contacte a su administrador.",
  "auth.showPassword": "Mostrar contraseña",
  "auth.hidePassword": "Ocultar contraseña",
  "errors.duplicateEmail": "Ya existe un colaborador con este correo electrónico.",
  "errors.duplicateNit": "Ya existe un cliente con este NIT.",
  "staff.emailAlreadyUsed": "Este correo ya está en uso por {{name}}.",
  "timesheet.noStaffRecord": "No hay un registro de personal vinculado a su cuenta.",
  "timesheet.noStaffRecordHelp": "Solicite a su administrador vincular su cuenta ({{email}}) a un registro de personal.",
  "timesheet.beforeHireDate": "Esta semana es anterior a su fecha de ingreso. No se permite el registro de horas.",
  "timesheet.resubmitWeek": "Reenviar Semana",
  "client.cannotDeleteTooltip": "Para eliminar este cliente, primero debe eliminar todos los encargos asociados.",
  "client.cannotDelete": "No se puede eliminar este cliente",
  "userRoles.roles.sqr": "SQR",
  "userRoles.roles.specialist_it": "Especialista IT",
  "userRoles.roles.specialist_tax": "Especialista Tributario",
  "tracker.importTitle": "Importar Registros del Cronómetro",
  "tracker.importDescription": "Seleccione los registros completados del cronómetro para importar a su hoja de tiempo.",
  "workOrders.status.draft": "Borrador",
  "workOrders.status.pending": "Pendiente",
  "workOrders.status.approved": "Aprobado",
  "workOrders.status.rejected": "Rechazado"
}
```

---

## Testing Checklist

### Authentication (Bugs #1, #11)
- [ ] Inactive staff member cannot log in — shows "account deactivated" message
- [ ] Password visibility toggle works on login and signup
- [ ] Active staff member can log in normally

### Timer (Bugs #2, #4, #15)
- [ ] Timer persists across page reloads without losing time
- [ ] Timer shows correct elapsed time after pause/resume
- [ ] Only one timer can run at a time — engagement/activity locked while running
- [ ] Timer entries can be imported to timesheet via import dialog

### Timesheet (Bugs #3, #5, #8, #14, #17, #21)
- [ ] Buttons (Submit, Save Draft, Copy Previous) available on past weeks within retro window
- [ ] Navigation blocked before hire date; mid-week hire locks pre-hire days
- [ ] Engagement dropdown shows all engagements with approved Work Orders
- [ ] Engagement dropdown shows client name for each item
- [ ] Typing "0.5" in hours cells works without erratic behavior
- [ ] Submit button hidden after submission; "Reenviar Semana" only shows if lines rejected

### Work Orders (Bug #6)
- [ ] Status legend visible on desktop showing dot colors and season icons

### Forms (Bugs #7, #9, #12, #18, #19)
- [ ] Category form rejects empty rate fields with validation error
- [ ] Staff form requires email, category, city, and ID number
- [ ] Duplicate email shows friendly error message with existing staff name
- [ ] Duplicate NIT shows friendly error message
- [ ] Engagement end date must be on or after start date

### Roles (Bug #10)
- [ ] SQR, Specialist IT, Specialist Tax roles appear in role dropdown
- [ ] Roles can be assigned and display correct icons/colors

### Account Linking (Bug #13)
- [ ] Unlinked user sees helpful message with their email
- [ ] Email-based fallback auto-links staff record

### Approvals (Bug #16)
- [ ] Manager can approve lines for engagements they manage
- [ ] Partner can approve lines for engagements they lead

### Clients (Bug #20)
- [ ] Delete button disabled with tooltip when client has engagements
- [ ] Delete button enabled when client has no engagements

---

*Testing session: February 6, 2026 · Bug fixes applied: February 10, 2026*
