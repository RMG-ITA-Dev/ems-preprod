# Changelog — 2026-02-22

## Session: 260222_EMS2.0.5_Debugg_Session

---

### Bug 0220-18: Prevent Duplicate Client Names

**Plan**: Plan_0220-18_v5
**Priority**: Baja
**Route**: PRINCIPAL - Clientes

#### Problem
Creating or editing a client allowed saving duplicate client names (e.g., multiple "PETROBRAS" entries with different NITs).

#### Root Cause
1. Frontend duplicate-name check used `maybeSingle()`, which silently returns `null` when multiple matches exist (PostgREST returns error for >1 row with `maybeSingle`).
2. No database-level unique constraint on normalized `client_legal_name`.
3. Update mutation used generic error handler, missing friendly duplicate-name messages.
4. Existing `handleClientError` used brittle message substring matching.

#### Solution — Detailed Edits

**Edit 1 — `ClientForm.tsx`: Replace `maybeSingle()` → `.limit(1)` for NIT check (lines 137-142)**

```typescript
// BEFORE:
const { data: existingByNit } = await supabase
  .from("clients")
  .select("client_id, client_legal_name")
  .eq("unique_tax_id", data.unique_tax_id)
  .neq("client_id", client?.client_id || "")
  .maybeSingle();
// consumed as: if (existingByNit) { ... }

// AFTER:
const { data: existingByNit, error: nitError } = await supabase
  .from("clients")
  .select("client_id, client_legal_name")
  .eq("unique_tax_id", data.unique_tax_id)
  .neq("client_id", client?.client_id || "")
  .limit(1);

if (nitError) {
  toast.error(t("errors.duplicateCheckFailed"));
  return;
}
if (existingByNit && existingByNit.length > 0) {
  toast.error(t("errors.duplicateNit", { nit: data.unique_tax_id, name: existingByNit[0].client_legal_name }));
  return;
}
```

**Logic**: `.maybeSingle()` throws when >1 row matches; `.limit(1)` returns an array safely. Added error guard for failed queries.

**Edit 2 — `ClientForm.tsx`: Replace `maybeSingle()` → `.limit(1)` for name check + trim (lines 132-168)**

```typescript
// BEFORE:
const { data: existingByName } = await supabase
  .from("clients")
  .select("client_id, unique_tax_id")
  .ilike("client_legal_name", data.client_legal_name)
  .neq("client_id", client?.client_id || "")
  .maybeSingle();
// consumed as: if (existingByName) { ... }

// AFTER:
const trimmedName = data.client_legal_name.trim();  // normalize before check
const { data: existingByName, error: nameError } = await supabase
  .from("clients")
  .select("client_id, unique_tax_id")
  .ilike("client_legal_name", trimmedName)
  .neq("client_id", client?.client_id || "")
  .limit(1);

if (nameError) {
  toast.error(t("errors.duplicateCheckFailed"));
  return;
}
if (existingByName && existingByName.length > 0) {
  toast.error(t("errors.duplicateClientNameWithNit", { nit: existingByName[0].unique_tax_id }));
  return;
}
```

**Logic**: Added `.trim()` normalization to match DB constraint behavior. Changed i18n key to `duplicateClientNameWithNit` which includes the NIT of the conflicting record.

**Edit 3 — `ClientForm.tsx`: Trim name in save payload (line 171)**

```typescript
// BEFORE:
const payload = { client_legal_name: data.client_legal_name, ... };

// AFTER:
const payload = { client_legal_name: trimmedName, ... };
```

**Edit 4 — `useClientMutations.ts`: Structured constraint matching in `handleClientError` (lines 8-31)**

```typescript
// BEFORE:
function handleClientError(error: Error, operation: string) {
  const msg = (error as any).message || "";
  if (msg.includes("duplicate") && msg.includes("client_legal_name")) {
    toast.error(i18n.t("errors.duplicateClientName"));
    return;
  }
  if (msg.includes("duplicate") && msg.includes("unique_tax_id")) {
    toast.error(i18n.t("errors.duplicateNit"));
    return;
  }
  createMutationErrorHandler(operation)(error);
}

// AFTER:
function handleClientError(error: Error, operation: string) {
  const err = error as unknown as {
    code?: string; message?: string; constraint?: string; details?: string;
  };
  if (err.code === "23505") {
    const constraintName = err.constraint || err.message || "";
    if (constraintName.includes("clients_client_legal_name_unique")) {
      toast.error(i18n.t("errors.duplicateClientName"));
      return;
    }
    if (constraintName.includes("clients_unique_tax_id_key")) {
      toast.error(i18n.t("errors.duplicateNit"));
      return;
    }
  }
  createMutationErrorHandler(operation)(error);
}
```

**Logic**: Switched from brittle `msg.includes("duplicate")` to PostgreSQL error code `23505` + constraint name matching. Checks `err.constraint` first (available on some drivers), falls back to `err.message`.

**Edit 5 — `useClientMutations.ts`: Apply `handleClientError` to `useUpdateClient` (line 94)**

```typescript
// BEFORE:
onError: createMutationErrorHandler("updating client"),

// AFTER:
onError: (error) => handleClientError(error, "updating client"),
```

**Logic**: Previously only `useCreateClient` used the custom handler; `useUpdateClient` used the generic one, so duplicate-name edits showed a generic error.

**Edit 6 — Database migration: Unique index**

```sql
CREATE UNIQUE INDEX clients_client_legal_name_unique
  ON public.clients (LOWER(TRIM(client_legal_name)));
```

**Edit 7 — i18n keys added**

| Key | EN | ES |
|-----|----|----|
| `errors.duplicateCheckFailed` | Could not verify. Please check your connection and try again. | No se pudo verificar. Revise su conexión e intente nuevamente. |
| `errors.duplicateClientNameWithNit` | A client with this name already exists (NIT: {{nit}}). | Ya existe un cliente con este nombre (NIT: {{nit}}). |
| `errors.duplicateClientName` | A client with this name already exists. | El nombre de cliente ya existe. |

#### Files Modified

| File | Lines Affected | Change |
|------|----------------|--------|
| `src/components/forms/ClientForm.tsx` | 131-168 | Replace `maybeSingle()` → `.limit(1)` for NIT + name checks; add `.trim()`; add error guards; use `duplicateClientNameWithNit` |
| `src/components/forms/ClientForm.tsx` | 170-171 | Save payload uses `trimmedName` |
| `src/hooks/mutations/useClientMutations.ts` | 8-31 | Structured constraint-name matching in `handleClientError` |
| `src/hooks/mutations/useClientMutations.ts` | 94 | Apply `handleClientError` to `useUpdateClient` |
| `src/locales/en.json` | — | Add 3 keys: `duplicateCheckFailed`, `duplicateClientNameWithNit`, simplified `duplicateClientName` |
| `src/locales/es.json` | — | Add 3 keys; fix accent "conexión" |
| Database migration | — | Unique index on `LOWER(TRIM(client_legal_name))` |

#### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Existing duplicate names in production | None | Zero duplicates verified in current DB |
| Index creation lock time | None | Small table (<100 rows) |
| Return type change (`maybeSingle` → array) | Low | All consuming code updated in same change |
| UI vs DB normalization gap | Low | Documented as best-effort; DB is authoritative |

---

### Bug 0220-45: Fix Deletion of Exported Time Entries in Timesheet

**Plan**: Plan_0220-45_v3
**Priority**: Baja
**Route**: OPERACIONES - Hoja de Tiempo / Registros de Tiempo

#### Problem
In OPERACIONES → Hoja de Tiempo, rows exported from "Registros de Tiempo" could not be deleted. Clicking the delete icon showed "Error al eliminar la fila. Se ha restaurado." Rows created directly in the timesheet deleted normally.

#### Root Cause
The FK constraint `timer_entries.imported_to_time_id → time_entries(time_id)` used the default `NO ACTION` delete rule. When a `time_entries` row was referenced by `timer_entries.imported_to_time_id`, PostgreSQL blocked the delete.

#### Solution — Detailed Edits

**Edit 1 — Database migration: Change FK to ON DELETE SET NULL**

```sql
-- BEFORE: FK with default NO ACTION
-- timer_entries_imported_to_time_id_fkey → time_entries(time_id) ON DELETE NO ACTION

-- AFTER:
ALTER TABLE public.timer_entries
  DROP CONSTRAINT timer_entries_imported_to_time_id_fkey;

ALTER TABLE public.timer_entries
  ADD CONSTRAINT timer_entries_imported_to_time_id_fkey
  FOREIGN KEY (imported_to_time_id) REFERENCES public.time_entries(time_id)
  ON DELETE SET NULL;
```

**Logic**: Deleting a `time_entries` row now sets `timer_entries.imported_to_time_id = NULL` instead of raising a FK violation.

**Edit 2 — Database migration: Add un-push trigger**

```sql
CREATE OR REPLACE FUNCTION public.reset_timer_import_on_unlink()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.imported_to_time_id IS NOT NULL AND NEW.imported_to_time_id IS NULL THEN
    NEW.is_imported := false;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_reset_timer_import_on_unlink
  BEFORE UPDATE ON public.timer_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_timer_import_on_unlink();
```

**Logic**: PostgreSQL's `ON DELETE SET NULL` fires BEFORE UPDATE triggers. When `imported_to_time_id` transitions from NOT NULL → NULL, the trigger sets `is_imported = false`, "un-pushing" the timer entry back to Ready status for re-export.

**Edit 3 — `TrackerEdit.tsx`: Dual-field import guard (line 78)**

```typescript
// BEFORE:
const isImported = entry?.is_imported ?? false;

// AFTER:
const isImported = Boolean(entry?.is_imported) || Boolean(entry?.imported_to_time_id);
```

**Logic**: The Delete button and field disabling are gated on `isImported`. Using OR logic ensures that if **either** `is_imported` is true **or** `imported_to_time_id` is not null, the UI treats the entry as imported. This covers edge cases where the two fields are temporarily out of sync (e.g., mid-trigger execution).

#### Files Modified

| File | Lines Affected | Change |
|------|----------------|--------|
| Database migration | — | Drop/re-add FK with `ON DELETE SET NULL`; add `trg_reset_timer_import_on_unlink` trigger + function |
| `src/pages/TrackerEdit.tsx` | 78 | `isImported` dual-field check: `Boolean(is_imported) \|\| Boolean(imported_to_time_id)` |

#### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Timer entries lose import tracking on deletion | None | Desired "un-push" behavior; entries return to Ready for re-export |
| ON DELETE SET NULL not firing UPDATE trigger | None | PostgreSQL fires BEFORE UPDATE triggers for ON DELETE SET NULL (verified) |
| `trg_prevent_imported_timer_delete` conflict | None | Checks `is_imported = true`; after un-push it's `false`, so deletion is allowed |
| FK constraint name mismatch | None | Verified via `pg_constraint` query |
| Edge case: fields out of sync | None | UI guards on both fields with OR logic |
| Approved timesheet lines | None | `trg_protect_approved_time_entries` still blocks independently |

---

### Feature: Hours-Only Toggle for Timer Entry Forms

**Plan**: Plan_HoursOnlyToggle_v2
**Priority**: Media
**Route**: OPERACIONES - Registros de Tiempo

#### Summary
Added a toggle switch ("Especificar horas" / "Specify times") to both the Manual Entry dialog and the Edit form for timer entries. When OFF (default for new entries), users only enter Date + Hours; Start/End Time fields are cleared and disabled. When ON, all four fields are active (current behavior).

#### Solution — Detailed Edits

**Edit 1 — Database migration: Add column**

```sql
ALTER TABLE public.timer_entries
  ADD COLUMN IF NOT EXISTS has_explicit_times boolean NOT NULL DEFAULT true;
```

**Logic**: Existing entries default to `true` (toggle ON when re-opened). New entries created via hours-only mode will have `false`.

**Edit 2 — `useTimerEntries.ts`: Add to TimerEntry interface + mutation types**

```typescript
// BEFORE (TimerEntry interface):
interface TimerEntry {
  timer_id: string;
  staff_id: string;
  engagement_id: string;
  activity_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  description: string | null;
  is_imported: boolean;
  imported_to_time_id: string | null;
  created_at: string;
}

// AFTER:
interface TimerEntry {
  // ... all above fields ...
  has_explicit_times: boolean;  // ← added
}
```

Also added `has_explicit_times` to the `CreateTimerInput` and `UpdateTimerInput` types, and included it in the `.select()` query strings.

**Edit 3 — `ManualEntryDialog.tsx`: Add toggle (default OFF) + hours-only mode**

```typescript
// ADDED: State for toggle (default OFF for new entries)
const [useExplicitTimes, setUseExplicitTimes] = useState(false);

// ADDED: Toggle UI
<div className="flex items-center justify-between">
  <Label>{t("tracker.useExplicitTimes")}</Label>
  <Switch checked={useExplicitTimes} onCheckedChange={setUseExplicitTimes} />
</div>

// CHANGED: Start/End time inputs
// BEFORE: Always visible and required
// AFTER: Disabled + cleared when useExplicitTimes is false
<Input type="time" disabled={!useExplicitTimes} ... />

// CHANGED: onSubmit passes has_explicit_times
onSubmit({ ..., has_explicit_times: useExplicitTimes, hours });
```

**Edit 4 — `TrackerList.tsx`: `handleManualSubmit` computes synthetic timestamps**

```typescript
// BEFORE:
const handleManualSubmit = async (data) => {
  await createEntry({ started_at: data.startTime, ended_at: data.endTime, ... });
};

// AFTER:
const handleManualSubmit = async (data) => {
  let started_at, ended_at;
  if (data.has_explicit_times) {
    started_at = /* user-provided start time */;
    ended_at = /* user-provided end time */;
  } else {
    // Synthetic: midnight + hours offset
    started_at = `${dateStr}T00:00:00`;
    ended_at = addMinutes(startOfDay, data.hours * 60);
  }
  await createEntry({ started_at, ended_at, has_explicit_times: data.has_explicit_times, ... });
};
```

**Edit 5 — `TrackerEdit.tsx`: Toggle initializes from entry + hours-only save**

```typescript
// ADDED:
const [useExplicitTimes, setUseExplicitTimes] = useState(entry?.has_explicit_times ?? true);

// CHANGED: Start/End time inputs disabled when toggle OFF
// CHANGED: Save uses synthetic timestamps when toggle OFF (same logic as TrackerList)
```

**Edit 6 — i18n keys**

| Key | EN | ES |
|-----|----|----|
| `tracker.useExplicitTimes` | Specify times | Especificar horas |

#### Files Modified

| File | Lines Affected | Change |
|------|----------------|--------|
| Database migration | — | Add `has_explicit_times boolean NOT NULL DEFAULT true` to `timer_entries` |
| `src/hooks/useTimerEntries.ts` | Interface + mutations | Add `has_explicit_times` to `TimerEntry`, `CreateTimerInput`, `UpdateTimerInput`, and select queries |
| `src/components/tracker/ManualEntryDialog.tsx` | Form section | Add `useExplicitTimes` state (default OFF); conditional disable of time inputs; pass `has_explicit_times` to onSubmit |
| `src/pages/TrackerList.tsx` | `handleManualSubmit` | Compute synthetic `started_at`/`ended_at` when `has_explicit_times = false` |
| `src/pages/TrackerEdit.tsx` | Form section + save | Add toggle (init from entry); conditional disable; synthetic timestamps on save |
| `src/locales/en.json` | — | Add `tracker.useExplicitTimes` |
| `src/locales/es.json` | — | Add `tracker.useExplicitTimes` |

---

### Feature 0220-47: Fecha de Salida + Hours Completeness Gate + No-Reingreso Policy

**Plan**: Plan_0220-47_v6
**Priority**: Alta
**Route**: ADMINISTRACIÓN - Personal

#### Summary
Added `termination_date` (Fecha de Salida) to staff records with multi-layer enforcement:
1. **DB trigger** blocks time entries after termination date (`trg_enforce_termination_date`)
2. **DB trigger** prevents staff reactivation (`trg_prevent_staff_reactivation`) — No-Reingreso policy
3. **DB CHECK constraint** ensures `termination_date >= hire_date`
4. **Pending-hours completeness gate** via RPC `check_pending_hours_before_termination` — blocks deactivation until all expected hours are logged (holiday-aware)
5. **Updated unique indexes** on `email` and `id_number` to exclude soft-deleted records, enabling the "delete old + create new" rehire workflow

#### Solution — Detailed Edits

**Edit 1 — Database migration: Add column + CHECK**

```sql
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS termination_date date;

DO $$
BEGIN
  ALTER TABLE public.staff
    ADD CONSTRAINT chk_termination_after_hire
    CHECK (termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
```

**Edit 2 — Database migration: Trigger to block time entries after termination**

```sql
CREATE OR REPLACE FUNCTION public.enforce_termination_date()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_term date;
BEGIN
  SELECT termination_date INTO v_term FROM staff WHERE staff_id = NEW.staff_id;
  IF v_term IS NOT NULL AND NEW.date_worked > v_term THEN
    RAISE EXCEPTION 'TERMINATION_DATE_BLOCKED: Cannot log time after termination date %', v_term;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_enforce_termination_date ON public.time_entries;
CREATE TRIGGER trg_enforce_termination_date
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_termination_date();
```

**Edit 3 — Database migration: Trigger to prevent staff reactivation**

```sql
CREATE OR REPLACE FUNCTION public.prevent_staff_reactivation()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_active = false AND NEW.is_active = true THEN
    RAISE EXCEPTION 'REACTIVATION_BLOCKED: Staff reactivation is not permitted.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_staff_reactivation ON public.staff;
CREATE TRIGGER trg_prevent_staff_reactivation
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_reactivation();
```

**Edit 4 — Database migration: Update unique indexes for soft-delete compatibility**

```sql
-- BEFORE: Unconditional unique constraint
-- staff_email_key UNIQUE (email) — blocks rehire even after soft-delete

-- AFTER:
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_email_key;
DROP INDEX IF EXISTS idx_staff_email_unique;
CREATE UNIQUE INDEX idx_staff_email_unique
  ON public.staff (LOWER(TRIM(email)))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_id_number_unique
  ON public.staff (id_number)
  WHERE id_number IS NOT NULL AND TRIM(id_number) != '' AND deleted_at IS NULL;
```

**Logic**: Soft-deleted records (`deleted_at IS NOT NULL`) are excluded from uniqueness checks, enabling "delete old + create new" rehire workflow.

**Edit 5 — Database migration: RPC `check_pending_hours_before_termination`**

Holiday-aware expected-vs-actual hours completeness check. Iterates weeks from `hire_date` to `termination_date`, computes expected hours (working days × daily capacity, minus holidays), compares with actual `time_entries.hours_logged` (excluding forecasts). Returns JSONB array of weeks with `gap > 0`.

**Edit 6 — `useEmsData.ts`: Add `termination_date` to `StaffFull` (line 43)**

```typescript
// BEFORE:
export interface StaffFull extends Staff {
  email: string | null;
  id_number: string | null;
  aud_reg_number: string | null;
  hire_date: string | null;
  auth_user_id: string | null;
}

// AFTER:
export interface StaffFull extends Staff {
  email: string | null;
  id_number: string | null;
  aud_reg_number: string | null;
  hire_date: string | null;
  auth_user_id: string | null;
  termination_date: string | null;  // ← added
}
```

**Edit 7 — `useCurrentStaff.ts`: Add `termination_date` to interface + queries (lines 7-9, 33, 58)**

```typescript
// BEFORE:
interface StaffWithHireDate extends Staff {
  hire_date: string | null;
}

// AFTER:
interface StaffWithHireDate extends Staff {
  hire_date: string | null;
  termination_date: string | null;  // ← added
}

// Both .select() queries updated to include termination_date:
.select(`staff_id, first_name, ..., hire_date, termination_date, category:categories(*)`)
```

**Edit 8 — `useStaffMutations.ts`: Add `termination_date` to payloads + constraint-name error handler (full file)**

```typescript
// BEFORE (handleStaffError):
function handleStaffError(error: Error, operation: string) {
  const msg = (error as any).message || "";
  if (msg.includes("email")) { toast.error(i18n.t("errors.duplicateEmail")); return; }
  createMutationErrorHandler(operation)(error);
}

// AFTER:
function handleStaffError(error: Error, operation: string) {
  const err = error as unknown as { code?: string; message?: string };
  const msg = err.message || "";

  if (err.code === "23505") {
    if (msg.includes("idx_staff_email_unique") || msg.includes("staff_email_key")) {
      toast.error(i18n.t("errors.duplicateEmail"));
      return;
    }
    if (msg.includes("idx_staff_id_number_unique")) {
      toast.error(i18n.t("errors.duplicateIdNumber"));
      return;
    }
  }
  if (msg.includes("REACTIVATION_BLOCKED")) {
    toast.error(i18n.t("errors.noReingreso"));
    return;
  }
  if (msg.includes("TERMINATION_DATE_BLOCKED")) {
    toast.error(i18n.t("errors.afterTerminationDate"));
    return;
  }
  createMutationErrorHandler(operation)(error);
}
```

**Logic**: Switched from brittle column-name substring matching to PostgreSQL error code `23505` + index/constraint name matching. Added handlers for custom DB trigger exception messages `REACTIVATION_BLOCKED` and `TERMINATION_DATE_BLOCKED`.

```typescript
// BEFORE (useCreateStaff payload type):
data: { first_name: string; last_name: string; ...; hire_date?: string | null; }

// AFTER:
data: { ...; hire_date?: string | null; termination_date?: string | null; }
```

Same addition to `useUpdateStaff` payload type (line 92).

**Edit 9 — `StaffForm.tsx`: Add `termination_date` field, pending-hours gate, No-Reingreso (lines 53-311)**

```typescript
// ADDED to Zod schema (line 65):
termination_date: z.string().optional(),
// ADDED Zod refine (lines 67-78):
.refine((data) => {
  if (data.termination_date && data.hire_date) {
    return data.termination_date >= data.hire_date;
  }
  return true;
}, { message: t("validation.terminationDateBeforeHire"), path: ["termination_date"] })

// ADDED state (lines 148-149):
const [pendingWeeks, setPendingWeeks] = useState<PendingWeek[]>([]);
const [showPendingDialog, setShowPendingDialog] = useState(false);

// ADDED No-Reingreso UI guard (line 205):
const isReactivationBlocked = isEdit && staff && !staff.is_active && !!staff.termination_date;
// → Disables is_active switch when true; shows errors.noReingreso helper text

// ADDED auto-set termination_date on deactivation (lines 220-224):
useEffect(() => {
  if (isEdit && staff?.is_active && !watchIsActive && !watchTerminationDate) {
    form.setValue("termination_date", new Date().toISOString().split("T")[0]);
  }
}, [watchIsActive, isEdit, staff?.is_active, watchTerminationDate, form]);

// ADDED pre-save id_number duplicate check (lines 246-258):
if (data.id_number) {
  const { data: existingIdNum } = await supabase
    .from('staff').select('staff_id, first_name, last_name')
    .eq('id_number', data.id_number).is('deleted_at', null)
    .neq('staff_id', staff?.staff_id || '').limit(1);
  if (existingIdNum && existingIdNum.length > 0) {
    toast.error(t('errors.duplicateIdNumber'));
    return;
  }
}

// ADDED pending-hours completeness gate (lines 261-285):
if (isEdit && staff && staff.is_active && !data.is_active && data.termination_date) {
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('check_pending_hours_before_termination', {
      p_staff_id: staff.staff_id,
      p_termination_date: data.termination_date,
    });
  if (rpcError) { toast.error(t('staff.pendingHoursCheckError')); return; }
  const gaps = (rpcResult as unknown as PendingWeek[]) || [];
  if (gaps.length > 0) {
    setPendingWeeks(gaps);
    setShowPendingDialog(true);
    return;  // BLOCK SAVE
  }
}

// ADDED termination_date to save payload (line 298):
termination_date: data.termination_date || null,
```

**Edit 10 — `TimeSheet.tsx`: Post-termination locking + banner (lines 204-235, 241-252)**

```typescript
// ADDED: Check if entire week is after termination_date (lines 204-210)
const isAfterTerminationDate = useMemo(() => {
  if (!staffRecord?.termination_date) return false;
  const termDate = parseISO(staffRecord.termination_date);
  const weekStart = weekInfo.weekDates[0];
  return isBefore(startOfDay(termDate), startOfDay(weekStart));
}, [staffRecord?.termination_date, weekInfo.weekDates]);

// ADDED: Per-day lock map for mid-week termination (lines 212-223)
const lockedDaysAfterTermination = useMemo(() => {
  if (!staffRecord?.termination_date) return new Set<number>();
  const termDate = parseISO(staffRecord.termination_date);
  const locked = new Set<number>();
  weekInfo.weekDates.forEach((date, index) => {
    if (isBefore(startOfDay(termDate), startOfDay(date))) locked.add(index);
  });
  return locked;
}, [staffRecord?.termination_date, weekInfo.weekDates]);

// ADDED: Latest navigable week (lines 231-235)
const latestWeekStart = useMemo(() => {
  if (!staffRecord?.termination_date) return undefined;
  return getWeekMonday(parseISO(staffRecord.termination_date));
}, [staffRecord?.termination_date]);

// CHANGED: isEditable gate (line 241)
// BEFORE:
const isEditable = !isBeforeHireDate && isWithinEditableWindow && ...;
// AFTER:
const isEditable = !isBeforeHireDate && !isAfterTerminationDate && isWithinEditableWindow && ...;

// CHANGED: canCopyPreviousWeek gate (line 247)
// BEFORE: && !isBeforeHireDate && ...
// AFTER: && !isBeforeHireDate && !isAfterTerminationDate && ...
```

**Edit 11 — `TimesheetGrid.tsx`: Add `lockedDaysAfterTermination` prop (lines 66, 91)**

```typescript
// BEFORE (props interface):
interface TimesheetGridProps {
  ...
  lockedDaysBeforeHire?: Set<number>;
  holidayMap?: Map<string, string>;
  ...
}

// AFTER:
interface TimesheetGridProps {
  ...
  lockedDaysBeforeHire?: Set<number>;
  lockedDaysAfterTermination?: Set<number>;  // ← added
  holidayMap?: Map<string, string>;
  ...
}
```

The cell-locking logic merges both sets: a cell is locked if its day index is in `lockedDaysBeforeHire` OR `lockedDaysAfterTermination`.

**Edit 12 — `WeekNavigator.tsx`: Add `latestWeekStart` prop (lines 35, 46, 60-61, 133)**

```typescript
// BEFORE (props interface):
interface WeekNavigatorProps {
  ...
  earliestWeekStart?: Date;
}

// AFTER:
interface WeekNavigatorProps {
  ...
  earliestWeekStart?: Date;
  latestWeekStart?: Date;  // ← added
}

// ADDED: Forward navigation cap (lines 60-61)
const canGoNext = !latestWeekStart ||
  currentWeekStart.getTime() < latestWeekStart.getTime();

// CHANGED: Calendar toDate prop (line 133)
// BEFORE: toDate={undefined}
// AFTER:
toDate={latestWeekStart ? new Date(latestWeekStart.getTime() + 6 * 86400000) : undefined}
```

**Logic**: Disables forward button and calendar selection past the termination week.

**Edit 13 — i18n keys added (15+ keys)**

| Key | EN | ES |
|-----|----|----|
| `staff.terminationDate` | Termination Date | Fecha de Salida |
| `staff.terminationDateHelp` | Restricts time entry after this date | Restringe la carga de horas despues de esta fecha |
| `staff.pendingHoursTitle` | Pending Hours | Horas Pendientes |
| `staff.pendingHoursDescription` | Cannot deactivate. The following weeks have missing hours... | No se puede desactivar. Las siguientes semanas tienen horas pendientes... |
| `staff.pendingHoursCheckError` | Could not verify hours completeness... | No se pudo verificar la completitud de horas... |
| `staff.weekOf` | Week of | Semana del |
| `staff.expected` | Expected | Esperadas |
| `staff.actual` | Actual | Reales |
| `staff.gap` | Missing | Faltantes |
| `staff.totalMissing` | Total missing hours | Total horas faltantes |
| `errors.afterTerminationDate` | Cannot log time after termination date | No se puede registrar tiempo despues de la fecha de salida |
| `errors.noReingreso` | Reactivation is not allowed... | No se permite reingreso... |
| `errors.duplicateIdNumber` | A staff member with this ID number already exists... | Ya existe un miembro del personal con este numero de CI... |
| `validation.terminationDateBeforeHire` | Termination date cannot be before hire date | La fecha de salida no puede ser anterior a la fecha de ingreso |
| `validation.terminationDateRequired` | Termination date is required when deactivating | La fecha de salida es obligatoria al desactivar |

#### Files Modified

| File | Lines Affected | Change |
|------|----------------|--------|
| Database migration | — | Column, idempotent CHECK, 2 triggers + functions, updated indexes, RPC |
| `src/hooks/useEmsData.ts` | 43 | Add `termination_date: string \| null` to `StaffFull` |
| `src/hooks/useCurrentStaff.ts` | 7-9, 33, 58 | Add `termination_date` to `StaffWithHireDate` + both `.select()` queries |
| `src/hooks/mutations/useStaffMutations.ts` | 7-36, 53, 92 | Constraint-name error handler; `termination_date` in both payload types |
| `src/components/forms/StaffForm.tsx` | 53-78, 148-149, 205, 220-224, 246-258, 261-285, 298 | Zod schema, pending-hours gate, No-Reingreso, id_number check, auto-set termination_date |
| `src/pages/TimeSheet.tsx` | 204-235, 241, 247-252 | `isAfterTerminationDate`, `lockedDaysAfterTermination`, `latestWeekStart`, editability gates |
| `src/components/timesheet/TimesheetGrid.tsx` | 66, 91 | Add `lockedDaysAfterTermination` prop to interface + destructuring |
| `src/components/timesheet/WeekNavigator.tsx` | 35, 46, 60-61, 133 | Add `latestWeekStart` prop; cap forward navigation + calendar |
| `src/locales/en.json` | — | Add 15 translation keys |
| `src/locales/es.json` | — | Add 15 translation keys |

#### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Nullable `termination_date` | None | Existing records unaffected |
| DB reactivation trigger | Low | Policy is explicit; delete + recreate workflow documented |
| Soft-delete + unique indexes | None | Indexes exclude `deleted_at IS NOT NULL` records |
| Pending-hours RPC SECURITY DEFINER | None | Returns only aggregate data |
| Fail-safe on RPC error | None | Deactivation blocked if completeness unverifiable |

---

### Bug 0220-48: Allow Historical Start Dates for Internal Engagements

**Plan**: Plan_0220-48_v2
**Priority**: Baja
**Route**: PRINCIPAL - Encargos

#### Problem
When creating internal/administrative engagements (e.g., fiscal year Oct 2025 - Sep 2026), the calendar blocked selection of historical start dates. Internal engagements frequently need past start dates to cover periods that have already begun.

#### Root Cause
In `EngagementForm.tsx`, `minStartDate` was always set (today for new, `created_at` for edit) regardless of engagement type. The start_date and end_date calendars passed `minStartDate` to `disabled` with no null-guard, and submit-time validation did not account for `isInternal`.

#### Solution — Detailed Edits

**Edit 1 — `EngagementForm.tsx`: `minStartDate` memo (lines 136-143)**

```typescript
// BEFORE (was at lines 93-99, before isInternal state declaration):
// BUG #0206-19: Minimum allowed start date
const minStartDate = useMemo(() => {
  if (isEdit && engagement?.created_at) {
    return startOfDay(new Date(engagement.created_at));
  }
  return startOfDay(new Date());
}, [isEdit, engagement?.created_at]);

// AFTER (moved after isInternal state, lines 136-143):
// BUG #0206-19 + #0220-48: Minimum allowed start date (bypassed for internal)
const minStartDate = useMemo(() => {
  if (isInternal) return undefined;
  if (isEdit && engagement?.created_at) {
    return startOfDay(new Date(engagement.created_at));
  }
  return startOfDay(new Date());
}, [isInternal, isEdit, engagement?.created_at]);
```

**Logic**: Added `isInternal` as first check — returns `undefined` (no restriction) for internal engagements. Added `isInternal` to dependency array. Memo was also moved below the `isInternal` state declaration to avoid "used before declaration" error.

**Edit 2 — `EngagementForm.tsx`: Start-date calendar `disabled` prop (line 452)**

```typescript
// BEFORE:
disabled={(date) => isBefore(startOfDay(date), minStartDate)}

// AFTER:
disabled={minStartDate ? (date) => isBefore(startOfDay(date), minStartDate) : undefined}
```

**Logic**: When `minStartDate` is `undefined` (internal engagements), passes `undefined` to `disabled` so all past dates are selectable. For external engagements, behavior is unchanged.

**Edit 3 — `EngagementForm.tsx`: End-date calendar `disabled` prop (lines 489-494)**

```typescript
// BEFORE:
disabled={(date) => {
  const startDate = form.getValues("start_date");
  if (startDate) return isBefore(startOfDay(date), startOfDay(startDate));
  return isBefore(startOfDay(date), minStartDate);
}}

// AFTER:
disabled={(date) => {
  const startDate = form.getValues("start_date");
  if (startDate) return isBefore(startOfDay(date), startOfDay(startDate));
  if (minStartDate) return isBefore(startOfDay(date), minStartDate);
  return false;
}}
```

**Logic**: Added null-guard on `minStartDate` fallback. When `start_date` is empty and `minStartDate` is `undefined` (internal engagements), returns `false` so all dates are selectable. Prevents `isBefore(date, undefined)` which would cause incorrect behavior.

**Edit 4 — `EngagementForm.tsx`: Submit-time validation (lines 178-184)**

```typescript
// BEFORE:
// BUG #0206-19: Validate start_date >= creation date
if (data.start_date && isBefore(startOfDay(data.start_date), minStartDate)) {
  form.setError("start_date", {
    message: t("engagement.startDateBeforeCreation"),
  });
  return;
}

// AFTER:
// BUG #0206-19 + #0220-48: skip for internal engagements
if (!isInternal && minStartDate && data.start_date && isBefore(startOfDay(data.start_date), minStartDate)) {
  form.setError("start_date", {
    message: t("engagement.startDateBeforeCreation"),
  });
  return;
}
```

**Logic**: Added `!isInternal` bypass so internal engagements skip the past-date validation entirely. Added `minStartDate` null-guard as defensive check (though it's technically always defined when `!isInternal`). External engagements retain the full restriction.

#### Files Modified

| File | Lines Affected | Change |
|------|----------------|--------|
| `src/components/forms/EngagementForm.tsx` | 136-143 (was 93-99) | `minStartDate` memo: added `isInternal` bypass + moved after state declaration |
| `src/components/forms/EngagementForm.tsx` | 452 | Start-date calendar: null-guard on `disabled` prop |
| `src/components/forms/EngagementForm.tsx` | 489-494 | End-date calendar: null-guard on `minStartDate` fallback |
| `src/components/forms/EngagementForm.tsx` | 178-184 | Submit validation: `!isInternal` bypass + `minStartDate` null-guard |

#### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| External engagements lose restriction | None | `isInternal` check preserves existing behavior for external engagements |
| Toggle is_internal ON/OFF | None | `useMemo` dependency on `isInternal` recomputes immediately |
| End-date over-restriction | None | Null-guard on `minStartDate` fallback prevents false disabling |
