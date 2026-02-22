

# Plan_0220-47_v6: Fecha de Salida + Hours Completeness Gate + No-Reingreso (UI + DB) + DB Constraints

## Changes from v5 to v6

Three targeted improvements based on CODEX review:

1. **Idempotent CHECK constraint**: Wrap `ADD CONSTRAINT` in a `DO...EXCEPTION WHEN duplicate_object` block to prevent migration failures on rerun.
2. **Constraint-name-based error detection**: Replace brittle `msg.includes("email")` / `msg.includes("id_number")` with constraint/index name matching (`idx_staff_email_unique`, `idx_staff_id_number_unique`) in `handleStaffError`.
3. **Schema grounding confirmed**: `hours_logged`, `weekly_capacity_hours`, `is_forecast`, and `holidays.holiday_date` all verified in the codebase. No RPC adjustments needed.

Everything else from v5 is unchanged.

---

## 1. Database Migration

All SQL in a single migration, executed in order:

### 1a. Add `termination_date` column

```sql
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS termination_date date;
```

### 1b. CHECK constraint: termination_date >= hire_date (idempotent)

```sql
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

### 1c. Trigger: block time entry after termination date

```sql
CREATE OR REPLACE FUNCTION public.enforce_termination_date()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_term date;
BEGIN
  SELECT termination_date INTO v_term
  FROM staff WHERE staff_id = NEW.staff_id;
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

### 1d. Trigger: prevent staff reactivation (No-Reingreso DB guard)

```sql
CREATE OR REPLACE FUNCTION public.prevent_staff_reactivation()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.is_active = false AND NEW.is_active = true THEN
    RAISE EXCEPTION 'REACTIVATION_BLOCKED: Staff reactivation is not permitted. Delete the record and create a new one.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_staff_reactivation ON public.staff;
CREATE TRIGGER trg_prevent_staff_reactivation
  BEFORE UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_staff_reactivation();
```

### 1e. Update unique indexes to exclude soft-deleted records

```sql
-- Drop existing unconditional unique constraint on email
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_email_key;

-- Drop existing partial index on email
DROP INDEX IF EXISTS idx_staff_email_unique;

-- Recreate email uniqueness excluding soft-deleted records
CREATE UNIQUE INDEX idx_staff_email_unique
  ON public.staff (LOWER(TRIM(email)))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- Add id_number uniqueness excluding soft-deleted records
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_id_number_unique
  ON public.staff (id_number)
  WHERE id_number IS NOT NULL AND TRIM(id_number) != '' AND deleted_at IS NULL;
```

### 1f. RPC: `check_pending_hours_before_termination`

Holiday-aware expected-vs-actual hours completeness check. Returns JSONB array of weeks with gap > 0. Empty array = OK to deactivate.

Schema grounding (all verified in codebase):
- `staff.weekly_capacity_hours` (numeric, default 40) -- daily = weekly / 5
- `holidays.holiday_date` (date) -- firm holidays excluded from working days
- `time_entries.hours_logged` (numeric) -- actual hours; filter `is_forecast = false`
- `staff.hire_date` (date) -- clamp start boundary

```sql
CREATE OR REPLACE FUNCTION public.check_pending_hours_before_termination(
  p_staff_id uuid,
  p_termination_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hire_date date;
  v_capacity numeric;
  v_daily numeric;
  v_cursor date;
  v_week_end date;
  v_eff_start date;
  v_eff_end date;
  v_working_days integer;
  v_holiday_count integer;
  v_expected numeric;
  v_actual numeric;
  v_gap numeric;
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT hire_date, weekly_capacity_hours
  INTO v_hire_date, v_capacity
  FROM staff WHERE staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN
    v_hire_date := p_termination_date;
  END IF;

  v_daily := COALESCE(v_capacity, 40) / 5.0;

  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= p_termination_date LOOP
    v_week_end := v_cursor + 4;

    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, p_termination_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(*) INTO v_holiday_count
    FROM holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5;

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor,
          'effective_start', v_eff_start,
          'effective_end', v_eff_end,
          'expected_hours', v_expected,
          'actual_hours', v_actual,
          'gap', v_gap
        );
      END IF;
    END IF;

    v_cursor := v_cursor + 7;
  END LOOP;

  RETURN v_result;
END;
$$;
```

---

## 2. Type Updates

### `src/hooks/useEmsData.ts`
- Add `termination_date: string | null` to `StaffFull` interface.

### `src/hooks/useCurrentStaff.ts`
- Add `termination_date` to `StaffWithHireDate` interface and both `.select()` query strings.

---

## 3. Mutation Hook (`src/hooks/mutations/useStaffMutations.ts`)

### 3a. Payload types
- Add `termination_date?: string | null` to `useCreateStaff` and `useUpdateStaff` payload types.

### 3b. Error handler: match constraint/index names (not column substrings)

```typescript
function handleStaffError(error: Error, operation: string) {
  const err = error as unknown as { code?: string; message?: string };
  const msg = err.message || "";

  // Unique constraint violations (23505) — match index/constraint names
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

  // Custom DB trigger exceptions
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

Key difference from v5: matching `idx_staff_email_unique` / `staff_email_key` and `idx_staff_id_number_unique` (constraint/index names) instead of `"email"` / `"id_number"` (column name substrings). Falls back to `staff_email_key` for the transition period where the old constraint may still exist.

---

## 4. Staff Form (`src/components/forms/StaffForm.tsx`)

### 4a. Add `termination_date` field
- Add to Zod schema as optional string.
- Date input labeled "Fecha de Salida" next to `hire_date`. Only visible in **edit mode**.
- Helper text: "Restringe la carga de horas despues de esta fecha".
- Zod refine: `termination_date >= hire_date` if both set (mirrors DB CHECK).

### 4b. Deactivation with pending-hours gate (hard block)

On form submit, if transition is `is_active: true -> false` and `termination_date` is set:

1. Call `supabase.rpc('check_pending_hours_before_termination', { p_staff_id, p_termination_date })`.
2. If array is non-empty: **block save**, open dialog listing each gap week (week_start, expected, actual, gap) and total missing hours.
3. If RPC fails: **block save** (fail-safe), show toast `staff.pendingHoursCheckError`.
4. If array is empty: proceed with save.

When `is_active` toggles `true -> false` and `termination_date` is empty, auto-set to today.

### 4c. Block reactivation (No-Reingreso -- UI level)
- When `is_active` is `false` AND `termination_date` is set (edit mode), **disable** the `is_active` switch.
- Show helper: `errors.noReingreso`.
- Even if UI is bypassed, `trg_prevent_staff_reactivation` provides DB-level hard guard.

### 4d. `id_number` pre-save duplicate check
- Query for existing staff with same `id_number` (WHERE `deleted_at IS NULL`). If found, show toast.

---

## 5. Timesheet Restrictions (`src/pages/TimeSheet.tsx`)

Mirror existing `hire_date` pattern:
- `isAfterTerminationDate`: entire week after `termination_date` -> banner + lock grid.
- `lockedDaysAfterTermination`: mid-week terminations -> lock individual day columns.
- Gate `isEditable`, `canCopyPreviousWeek` on `!isAfterTerminationDate`.
- `latestWeekStart` prop to `WeekNavigator`.

### `src/components/timesheet/TimesheetGrid.tsx`
- Add `lockedDaysAfterTermination` prop, merge with existing locking logic.

### `src/components/timesheet/WeekNavigator.tsx`
- Add `latestWeekStart` prop, disable forward button and calendar `toDate`.

---

## 6. Tracker Restrictions

### `src/hooks/useTimeTracker.ts`
- Block timer start if today > `termination_date`.

### `src/pages/TrackerEdit.tsx`
- Block save if `date_worked > termination_date`.

---

## 7. Translations (`src/locales/en.json` and `src/locales/es.json`)

| Key | EN | ES |
|-----|----|----|
| `staff.terminationDate` | Termination Date | Fecha de Salida |
| `staff.terminationDateHelp` | Restricts time entry after this date | Restringe la carga de horas despues de esta fecha |
| `staff.pendingHoursTitle` | Pending Hours | Horas Pendientes |
| `staff.pendingHoursDescription` | Cannot deactivate. The following weeks have missing hours that must be completed before deactivation: | No se puede desactivar. Las siguientes semanas tienen horas pendientes que deben completarse antes de la desvinculacion: |
| `staff.pendingHoursCheckError` | Could not verify hours completeness. Deactivation blocked as a safety measure. Please try again. | No se pudo verificar la completitud de horas. La desactivacion fue bloqueada como medida de seguridad. Intente nuevamente. |
| `staff.weekOf` | Week of | Semana del |
| `staff.expected` | Expected | Esperadas |
| `staff.actual` | Actual | Reales |
| `staff.gap` | Missing | Faltantes |
| `staff.totalMissing` | Total missing hours | Total horas faltantes |
| `errors.afterTerminationDate` | Cannot log time after termination date | No se puede registrar tiempo despues de la fecha de salida |
| `errors.noReingreso` | Reactivation is not allowed. To rehire this person, delete the previous record and create a new one. | No se permite reingreso. Para reincorporar a esta persona, elimine el registro anterior y cree uno nuevo. |
| `errors.duplicateIdNumber` | A staff member with this ID number already exists. Delete the previous record first. | Ya existe un miembro del personal con este numero de CI. Debe eliminar el registro anterior antes de crear uno nuevo. |
| `validation.terminationDateBeforeHire` | Termination date cannot be before hire date | La fecha de salida no puede ser anterior a la fecha de ingreso |
| `validation.terminationDateRequired` | Termination date is required when deactivating | La fecha de salida es obligatoria al desactivar |

---

## 8. Changelog (`docs/CHANGELOG-2026-02-22.md`)

Append entry documenting: `termination_date` column, idempotent CHECK constraint, DB triggers (termination enforcement + reactivation prevention), updated unique indexes for soft-delete compatibility, pending-hours completeness gate RPC, No-Reingreso policy (UI + DB), constraint-name-based error mapping, and all affected files.

---

## Files Changed Summary

| File | Action |
|------|--------|
| Database migration (new) | Add column, idempotent CHECK, 2 triggers + functions, update unique indexes, add RPC |
| `src/hooks/useEmsData.ts` | Add `termination_date` to `StaffFull` |
| `src/hooks/useCurrentStaff.ts` | Add `termination_date` to interface + both select queries |
| `src/hooks/mutations/useStaffMutations.ts` | Add `termination_date` to payloads; constraint-name-based error mapping for 23505 + `REACTIVATION_BLOCKED` + `TERMINATION_DATE_BLOCKED` |
| `src/components/forms/StaffForm.tsx` | Add field, pending-hours gate dialog + RPC call, block reactivation, id_number pre-check |
| `src/pages/TimeSheet.tsx` | Post-termination day locking + banner + latestWeekStart |
| `src/components/timesheet/TimesheetGrid.tsx` | Add `lockedDaysAfterTermination` prop |
| `src/components/timesheet/WeekNavigator.tsx` | Add `latestWeekStart` prop |
| `src/hooks/useTimeTracker.ts` | Block timer start after termination date |
| `src/pages/TrackerEdit.tsx` | Block manual entry after termination date |
| `src/locales/en.json` | Add 15 translation keys |
| `src/locales/es.json` | Add 15 translation keys |
| `docs/CHANGELOG-2026-02-22.md` | Document changes |

---

## Pending-Hours Gate Flow

```text
Admin sets termination_date + toggles is_active OFF
                    |
                    v
           [Form Submit Handler]
                    |
                    v
  supabase.rpc('check_pending_hours_before_termination',
    { p_staff_id, p_termination_date })
                    |
        +-----------+-----------+
        |           |           |
   RPC error?   Array empty?  Array has items?
        |           |           |
        v           v           v
   BLOCK SAVE    SAVE OK     BLOCK SAVE
   (toast error) (deactivate) (dialog with table:
                               week | expected |
                               actual | gap
                               + total missing)
```

---

## Acceptance Tests

| Case | Description | Expected |
|------|-------------|----------|
| A | Staff has complete hours for all weeks up to termination_date | Deactivation succeeds |
| B | Staff has missing hours in one or more weeks | Deactivation blocked; dialog lists gap weeks with expected/actual/gap and total |
| C | RPC call fails (network/db error) | Deactivation blocked; `staff.pendingHoursCheckError` toast |
| D | After deactivation, log time after termination_date via Timesheet UI | Blocked (banner + locked cells) |
| E | After deactivation, log time after termination_date via Tracker | Blocked (error toast) |
| F | Direct DB insert of time_entry after termination_date | Blocked by `trg_enforce_termination_date` (TERMINATION_DATE_BLOCKED) |
| G | UI: attempt to toggle is_active false -> true | Switch disabled, `errors.noReingreso` shown |
| H | DB: direct UPDATE setting is_active=true when is_active=false | Blocked by `trg_prevent_staff_reactivation` (REACTIVATION_BLOCKED) |
| I | Create new staff with same email while non-deleted old record exists | Blocked with `errors.duplicateEmail` |
| J | Create new staff with same id_number while non-deleted old record exists | Blocked with `errors.duplicateIdNumber` |
| K | Soft-delete old record, create new staff with same email/id_number | Succeeds (unique indexes exclude soft-deleted records) |
| L | Save staff with termination_date before hire_date | Blocked by Zod (frontend) and CHECK constraint (DB) |
| M | Re-run migration on environment that already has the CHECK constraint | Succeeds (idempotent DO...EXCEPTION block) |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Nullable `termination_date` column | Existing records unaffected |
| DB reactivation trigger blocks admin workflows that relied on reactivation | Policy is explicit: delete old record and create new one |
| Soft-delete + unique constraint interaction | Unique indexes exclude `deleted_at IS NOT NULL` records |
| `trg_prevent_staff_reactivation` and soft-delete flow | Trigger only blocks `false -> true`; soft-delete sets `false -> false` (safe) |
| Pending-hours RPC uses SECURITY DEFINER | Only returns aggregate data (week/hours), no PII leak |
| Fail-safe on RPC error | Deactivation blocked if completeness cannot be verified |
| CHECK constraint is immutable (no time-based logic) | Pure date comparison, safe for CHECK |
| Migration rerun | CHECK constraint wrapped in idempotent `DO...EXCEPTION WHEN duplicate_object`; triggers use `DROP IF EXISTS` + `CREATE OR REPLACE`; indexes use `IF NOT EXISTS` |
| Dropping `staff_email_key` | Replaced by partial index `idx_staff_email_unique` (case-insensitive + excludes soft-deleted) |

### Explicit non-goal

Do NOT add a creation-time duplicate gate that blocks new staff creation when the prior record is soft-deleted. The updated partial unique indexes handle this correctly: soft-deleted records are excluded from uniqueness checks.

