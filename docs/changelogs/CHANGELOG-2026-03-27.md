# Changelog — 2026-03-27

## Feature: "Borrar todos los registros" (Delete All Week Entries)

**Plan:** v3 (Plan v5 → v6 → v7 → v8 renamed to Plan v3 after CODEX review)

### Summary

Added a red "Borrar todos los registros" button to the timesheet action bar that bulk-deletes all `time_entries` for the current staff member and week. A destructive confirmation dialog warns the user before proceeding.

---

### File Changes

#### 1. `src/pages/TimeSheet.tsx`

**Imports modified:**
- Line 4: Added `useQueryClient` to `@tanstack/react-query` import.
- Line 9: Added `Trash2` to `lucide-react` import.
- Lines 21-30: Added `AlertDialogCancel` to existing AlertDialog import.

**New hooks & state:**
- `const queryClient = useQueryClient()` — instantiated after mutation hooks.
- `const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false)` — controls delete confirmation dialog visibility.
- `const [isDeletingAll, setIsDeletingAll] = useState(false)` — loading state for the delete operation (spinner on main button only).

**New computed flags (after `canCopyToCurrentWeek`):**
- `hasAnyApprovedLine`: checks if any `lineApprovals` entry has `status === 'approved'`. Prevents delete attempt when approved lines exist (DB trigger `protect_approved_time_entries` would reject the DELETE).
- `canDeleteAll`: composite flag requiring `!isSubmitted`, `!period?.is_period_locked`, `entries.length > 0`, editable window checks (`!isBeforeHireDate`, `!isAfterTerminationDate`, `isWithinEditableWindow`), and `!hasAnyApprovedLine`.

**New handler `handleDeleteAll`:**
- Guards on `staffRecord?.staff_id`.
- Computes `dateStrings` from `weekInfo.weekDates` via `toISODateString`.
- Executes `supabase.from('time_entries').delete().eq('staff_id', ...).in('date_worked', dateStrings).eq('is_forecast', false)`.
- On success: shows `timesheet.allEntriesDeleted` toast, invalidates `['time-entries']` and `['timesheet-period']` query keys.
- On error: checks for `APPROVED_LINE_LOCKED` in error message → shows `timesheet.approvedLineCannotEdit` (existing key). Otherwise shows `timesheet.deleteAllFailed`.
- Finally: resets `isDeletingAll` and closes dialog.

**Button placement:**
- Rendered inside the `<div className="flex gap-3 flex-wrap">` action bar, before the Back button.
- Uses `variant="destructive"`, disabled when `isDeletingAll`, shows `Loader2` spinner only on the main button (not on the dialog action).

**Dialog:**
- New `AlertDialog` added after the existing copy-blocked dialog.
- Title: `timesheet.deleteAllWarningTitle` ("ADVERTENCIA" / "WARNING").
- Description: `timesheet.deleteAllWarning`.
- Footer: `AlertDialogCancel` ("Cancelar"/"Cancel") + `AlertDialogAction` styled `bg-destructive` ("Borrar"/"Delete").
- No spinner/disabled on `AlertDialogAction` — Radix auto-closes the dialog on click; the async handler continues in background with toast feedback.

#### 2. `src/locales/en.json`

Added 6 keys inside `timesheet` namespace (after `holidayEntriesSkippedOnCopy`):
- `deleteAllEntries`: "Delete all entries"
- `deleteAllWarningTitle`: "WARNING"
- `deleteAllWarning`: "This action will delete all entries for this week. Once deleted, this action cannot be undone."
- `deleteConfirm`: "Delete"
- `allEntriesDeleted`: "All entries for the week have been deleted"
- `deleteAllFailed`: "Error deleting entries"

The existing key `timesheet.approvedLineCannotEdit` is reused for the `APPROVED_LINE_LOCKED` error case.

#### 3. `src/locales/es.json`

Added 6 keys inside `timesheet` namespace (after `holidayEntriesSkippedOnCopy`):
- `deleteAllEntries`: "Borrar todos los registros"
- `deleteAllWarningTitle`: "ADVERTENCIA"
- `deleteAllWarning`: "Esta acción borrará todos los registros de esta semana. Una vez borrados, esta acción no se puede revertir."
- `deleteConfirm`: "Borrar"
- `allEntriesDeleted`: "Todos los registros de la semana han sido borrados"
- `deleteAllFailed`: "Error al borrar los registros"

The existing key `timesheet.approvedLineCannotEdit` is reused for the `APPROVED_LINE_LOCKED` error case.

---

### Bug Fixes Applied (from CODEX review)

| # | Issue | Resolution |
|---|-------|------------|
| 1 | `canDeleteAll` missing approved-line check — after unsubmit, line approval records persist; DB trigger would reject DELETE | Added `hasAnyApprovedLine` check |
| 2 | `AlertDialogAction` spinner/disabled dead code — Radix auto-closes dialog before async completes | Removed spinner/disabled from dialog; `isDeletingAll` only on main button |
| 3 | CODEX claimed "no AlertDialog import exists" — import existed at lines 21-29 since v4 | Added only `AlertDialogCancel` to existing import |
| 4 | Generic catch swallows `APPROVED_LINE_LOCKED` DB trigger error | Added specific check, reusing `timesheet.approvedLineCannotEdit` |
| 5 | CODEX line numbers (573, 582, 646) based on stale file state | Corrected to actual lines (605, 622, 698+) |
| 6 | Changelog path `docs/CHANGELOG-...` incorrect | Corrected to `docs/changelogs/CHANGELOG-...` |

---

## Button Look & Feel Audit (Plan v7)

### Summary

Standardized all Cancel, Save, and Delete-confirm buttons across every add/modify screen, dialog, and alert dialog. Redefined the `cancel` button variant with dark-mode-safe design tokens. Fixed delete-confirm hover bug. Added missing responsive sizing. Converted HolidayForm to LoadingButton. Replaced raw yellow utility with `brand-gold` token.

---

### Part A: Redefine `cancel` Button Variant

**`src/components/ui/button.tsx` (line 18)**
- FROM: `cancel: "bg-muted text-muted-foreground hover:bg-muted/80"`
- TO: `cancel: "bg-background border border-input text-muted-foreground hover:bg-muted hover:text-foreground hover:border-muted-foreground/40 active:bg-muted/80 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] disabled:bg-muted/50 disabled:text-muted-foreground/50 disabled:border-input/50 disabled:opacity-100 transition-[background-color,color,border-color,box-shadow] duration-150 ease-in-out"`
- Rationale: Uses semantic design tokens for automatic dark-mode support. Adds visible border, press feedback, and disabled state.

**`src/components/ui/alert-dialog.tsx` (line 86)**
- FROM: `className={cn(buttonVariants({ variant: "cancel" }), "border border-input mt-2 sm:mt-0 hover:bg-accent hover:text-accent-foreground", className)}`
- TO: `className={cn(buttonVariants({ variant: "cancel" }), "mt-2 sm:mt-0", className)}`
- Rationale: Removed redundant inline `border border-input` (now in variant) and conflicting `hover:bg-accent hover:text-accent-foreground` (variant uses `hover:bg-muted hover:text-foreground`).

### Part B: Cancel Buttons — `outline` → `cancel` (22 instances, 16 files)

Changed `variant="outline"` to `variant="cancel"` for all dismiss/close/skip actions:

| # | File | Button |
|---|---|---|
| 1 | `forms/HolidayForm.tsx` | Cancel |
| 2 | `forms/ExpenseTypeForm.tsx` | Cancel |
| 3 | `forms/IndustryForm.tsx` | Cancel |
| 4 | `forms/ActivityCodeForm.tsx` | Cancel |
| 5 | `forms/CategoryForm.tsx` | Cancel |
| 6 | `forms/ClientForm.tsx` | Cancel (compact, size=sm) |
| 7 | `forms/ClientForm.tsx` | Cancel (full layout) |
| 8 | `forms/EngagementForm.tsx` | Cancel |
| 9 | `forms/StaffForm.tsx` | Cancel |
| 10 | `forms/StaffForm.tsx` | Close (pending hours dialog) |
| 11 | `forms/StaffForm.tsx` | Skip sync |
| 12 | `forms/ExpenseLogForm.tsx` | Cancel |
| 13 | `forms/WorkOrderForm.tsx` | Cancel |
| 14 | `tracker/ManualEntryDialog.tsx` | Cancel |
| 15 | `auth/ForgotPasswordDialog.tsx` | Close (success state) |
| 16 | `auth/ForgotPasswordDialog.tsx` | Cancel (form state) |
| 17 | `pages/Settings.tsx` | Cancel (global settings) |
| 18 | `pages/TimeSheet.tsx` | Cancel (footer) |
| 19 | `pages/TimesheetApprovalDetail.tsx` | Cancel (footer) |
| 20 | `pages/TimesheetApprovalDetail.tsx` | Cancel (reject dialog) |
| 21 | `pages/WorksheetNew.tsx` | Cancel |
| 22 | `pages/WorksheetEdit.tsx` | Cancel |

**Not changed** (intentionally `outline`): TimeSheet back/copy/unsubmit/save-draft, TimesheetApprovalDetail back, TrackerRecord Run In Background, ConsolidationDialog Exclude, DataTable pagination, Auth demo login, ManualEntryDialog date picker trigger.

### Part C: Save Buttons — Remove Hardcoded Colors (6 instances)

Removed redundant inline bg/text/hover classes from save/submit buttons so they use the default variant (`bg-brand-purple`):

| # | File | Removed |
|---|---|---|
| 1 | `forms/ActivityCodeForm.tsx` | `bg-accent hover:bg-accent/90 text-accent-foreground` |
| 2 | `forms/IndustryForm.tsx` | `bg-accent hover:bg-accent/90 text-accent-foreground` |
| 3 | `forms/ExpenseTypeForm.tsx` | `bg-accent hover:bg-accent/90 text-accent-foreground` |
| 4 | `forms/CategoryForm.tsx` | `bg-accent hover:bg-accent/90 text-accent-foreground` |
| 5 | `tracker/ManualEntryDialog.tsx` | `bg-brand-purple hover:bg-brand-purple/90 text-primary-foreground` |
| 6 | `pages/TimeSheet.tsx` | `bg-brand-purple hover:bg-brand-purple/90 text-primary-foreground` (kept `btn-action`) |

### Part D: Delete Confirm — Fix Purple Hover (8 files)

Added `hover:bg-destructive/90` to `AlertDialogAction` delete buttons to prevent flash of purple on hover:

- `forms/ActivityCodeForm.tsx`
- `forms/IndustryForm.tsx`
- `forms/CategoryForm.tsx`
- `forms/ExpenseTypeForm.tsx`
- `forms/ClientForm.tsx`
- `forms/StaffForm.tsx`
- `forms/EngagementForm.tsx`
- `settings/HolidaysManager.tsx` (added full destructive styling)

Already correct: `pages/TimeSheet.tsx` (delete all dialog).

### Part E: HolidayForm — Convert Save to LoadingButton

**`forms/HolidayForm.tsx`**
- Added `import { LoadingButton } from "@/components/ui/loading-button"`
- Replaced manual `<Button>` with `<LoadingButton loading={isPending}>` — auto-disables and shows spinner when loading.

### Part F: Add Responsive Sizing (6 files)

Added `w-full sm:w-auto min-h-[44px] sm:min-h-0` for mobile touch targets (44px Apple HIG minimum):

| File | Buttons |
|---|---|
| `forms/IndustryForm.tsx` | Cancel + Save |
| `forms/ExpenseTypeForm.tsx` | Cancel + Save |
| `forms/HolidayForm.tsx` | Cancel + Save |
| `tracker/ManualEntryDialog.tsx` | Cancel + Submit |
| `pages/Settings.tsx` | Global tab Cancel + Save |
| `settings/ChangePasswordCard.tsx` | Submit |

### Part G: Copy to Current Week — Use Design Token

**`pages/TimeSheet.tsx`**
- FROM: `bg-yellow-500 text-black hover:bg-yellow-600`
- TO: `bg-brand-gold text-black hover:bg-brand-gold/90`
- Rationale: Uses project design token `brand-gold` (HSL 41 76% 61%) instead of raw Tailwind yellow utilities.

---

## Fix: Standardize Weekly Min/Max Alert Text + Bold

### Summary

Updated the weekly hour-limit alert messages to use a consistent uppercase prefix style ("CANNOT SUBMIT:" / "NO SE PUEDE ENVIAR:") and made the alert text bold. Fixed a critical bug where duplicate i18n keys silently overrode the full alert messages with short labels.

---

### File Changes

#### 1. `src/locales/en.json`

**Updated key** (line ~719, inside `timesheet` namespace):
- `weeklyMaxExceeded`: Changed from `"Weekly total ({{total}}h) exceeds the maximum allowed ({{max}}h). Please reduce hours before submitting."` to `"CANNOT SUBMIT: the total hours ({{total}}h) exceed the weekly maximum ({{max}}h)."` — matches the uppercase prefix style of `weeklyMinNotMet`.

**Removed 5 duplicate keys** (formerly lines 774-778, inside `timesheet` namespace):
- `dailyLimitExceeded`: `"Over limit!"` — duplicate of line 178 definition; short label not referenced by any component.
- `dailyMaxExceeded`: `"Over max!"` — dead key, no component reference.
- `weeklyLimitExceeded`: `"Over limit!"` — dead key, no component reference.
- `weeklyMaxExceeded`: `"Over max!"` — **this duplicate silently overwrote the full alert message at line 719** because JSON keeps only the last occurrence of a key.
- `weeklyBelowMin`: `"Below min"` — dead key, no component reference.

#### 2. `src/locales/es.json`

**Updated key** (line ~719, inside `timesheet` namespace):
- `weeklyMaxExceeded`: Changed from `"El total semanal ({{total}}h) excede el máximo permitido ({{max}}h). Por favor reduzca las horas antes de enviar."` to `"NO SE PUEDE ENVIAR: el total de horas ({{total}}h) excede el máximo semanal ({{max}}h)."`.

**Removed 5 duplicate keys** (formerly lines 774-778, inside `timesheet` namespace):
- `dailyLimitExceeded`: `"¡Excede límite!"` — duplicate of line 178 definition.
- `dailyMaxExceeded`: `"¡Excede máximo!"` — dead key.
- `weeklyLimitExceeded`: `"¡Excede límite!"` — dead key.
- `weeklyMaxExceeded`: `"¡Excede máximo!"` — **duplicate that overwrote the full alert message**.
- `weeklyBelowMin`: `"Bajo mínimo"` — dead key.

#### 3. `src/pages/TimeSheet.tsx`

**Bold wrapper added** (lines ~567-568 and ~585-586):
- Wrapped `AlertDescription` content for `weeklyMinNotMet` in `<span className="font-bold">`.
- Wrapped `AlertDescription` content for `weeklyMaxExceeded` in `<span className="font-bold">`.

---

### Root Cause of Bug

JSON does not support duplicate keys — when the same key appears twice within an object, the parser silently keeps the **last** occurrence. The short labels at lines 774-778 (added in an earlier change) overwrote the full alert messages defined at lines 717-719, causing the alerts to display truncated text like "Over max!" instead of the intended full warning message.
