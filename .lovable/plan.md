

# Plan_0213-27_v4 (Final): Holiday Management and Blocking System

## Delta from v3

| # | Tweak | Change Applied |
|---|-------|----------------|
| 2 | Idempotent settings insert | Use `INSERT ... ON CONFLICT (setting_key) DO NOTHING` (matches existing pattern in `20260104`, `20251214`) |
| 3 | Plain RLS, no FORCE | Use `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (matches all existing migrations) |
| 4 | timesheetErrors uses English literals | Confirmed: existing pattern uses hardcoded English strings, not i18n keys. Keep consistent. |
| 5 | Trigger ordering comment | Already in v3. No functional dependency on order. |

Everything else carries forward from v3 unchanged.

---

## Pre-Implementation Verification (All Confirmed)

| Check | Verified |
|-------|----------|
| Time entries table: `time_entries` | Yes |
| Date column: `date_worked` | Yes |
| Engagement FK: `engagement_id` | Yes |
| Admin helper: `is_admin()` | Yes |
| Settings: `global_settings` with `setting_key VARCHAR(100) PRIMARY KEY` | Yes |
| Settings tabs: `Tabs` + `isAdmin` gating | Yes |
| Updated_at trigger: `update_updated_at_column()` | Yes |
| Existing trigger: `check_wo_approved` on `time_entries` | Yes |
| Engagements hook: `useEngagements()` | Yes |
| Error pattern: `TimesheetAppError` with English literals | Yes |
| Date helper: `toISODateString()` returns `YYYY-MM-DD` | Yes |
| Idempotent insert pattern: `ON CONFLICT (setting_key) DO NOTHING` | Yes |
| RLS pattern: plain `ENABLE ROW LEVEL SECURITY` (no FORCE) | Yes |

---

## Phase 1: Database Migration (Single SQL File)

### 1A. Create `holidays` table

```text
holidays
  holiday_id    uuid PK default gen_random_uuid()
  holiday_date  date NOT NULL UNIQUE
  holiday_name  text NOT NULL
  created_by    uuid NOT NULL REFERENCES staff(staff_id)
  created_at    timestamptz default now()
  updated_at    timestamptz default now()
```

- Reuse `update_updated_at_column()` trigger for `updated_at`
- Plain `ENABLE ROW LEVEL SECURITY` (no FORCE)
- RLS policies:
  - SELECT: all authenticated (`true`)
  - INSERT: `is_admin()` with check `is_admin()`
  - UPDATE: `is_admin()`
  - DELETE: `is_admin()`

### 1B. Insert `HOLIDAY_ENGAGEMENT_ID` into `global_settings` (idempotent)

```sql
INSERT INTO public.global_settings (setting_key, setting_value, description)
VALUES ('HOLIDAY_ENGAGEMENT_ID', '', 'Engagement ID allowed for time entries on holiday dates')
ON CONFLICT (setting_key) DO NOTHING;
```

### 1C. Create `enforce_holiday_blocking` trigger

Function logic (UUID-to-UUID comparison):

```text
1. SELECT holiday_name INTO v_holiday_name FROM holidays WHERE holiday_date = NEW.date_worked
2. If NOT FOUND: RETURN NEW (not a holiday)
3. Read setting_value INTO v_raw FROM global_settings WHERE setting_key = 'HOLIDAY_ENGAGEMENT_ID'
4. v_setting := NULLIF(TRIM(v_raw), '')
5. If v_setting IS NULL: RAISE EXCEPTION 'HOLIDAY_NOT_CONFIGURED'
6. v_holiday_engagement_id := v_setting::uuid
7. If NEW.engagement_id != v_holiday_engagement_id: RAISE EXCEPTION 'HOLIDAY_BLOCKED:%', v_holiday_name
8. RETURN NEW
```

Trigger: `BEFORE INSERT OR UPDATE ON time_entries FOR EACH ROW`
SQL comment: `-- NOTE: coexists with check_wo_approved trigger on time_entries`

---

## Phase 2: Frontend -- New Files

### 2A. `src/hooks/useHolidays.ts`

- `useHolidays()` -- all holidays, ordered by `holiday_date DESC`. Key: `["holidays"]`
- `useHolidaysForWeek(weekDates: Date[])` -- holidays in range. Returns `Map<string, string>` keyed by raw DB `holiday_date` (YYYY-MM-DD). Key: `["holidays-week", startStr, endStr]`
- `useHolidayEngagementId()` -- reads `HOLIDAY_ENGAGEMENT_ID` from `useGlobalSettings()`. Returns `string | null` (null if empty)

### 2B. `src/hooks/mutations/useHolidayMutations.ts`

- `useCreateHoliday()` -- INSERT with `created_by` from current staff. Invalidates `["holidays"]` + `["holidays-week"]`. Toast: `messages.holidayCreated`
- `useUpdateHoliday()` -- UPDATE name/date by `holiday_id`. Same invalidation. Toast: `messages.holidayUpdated`
- `useDeleteHoliday()` -- DELETE by `holiday_id`. Same invalidation. Toast: `messages.holidayDeleted`

### 2C. `src/components/settings/HolidaysManager.tsx`

1. **Holiday Engagement Selector Card** (top)
   - Warning Alert if `HOLIDAY_ENGAGEMENT_ID` not configured
   - Select dropdown from `useEngagements()`
   - Save calls `useUpdateGlobalSetting`

2. **Holidays DataTable** (below)
   - Columns: Date (DD/MM/YYYY), Name, Created By (staff name), Created At
   - Add/Edit via `HolidayForm` dialog
   - Delete via `AlertDialog` confirmation

### 2D. `src/components/forms/HolidayForm.tsx`

Dialog form with date picker + name input. Calls create or update mutation on submit.

---

## Phase 3: Frontend -- Modified Files

### 3A. `src/pages/Settings.tsx`

- Import `HolidaysManager`
- Add admin-gated `TabsTrigger` for `"holidays"` after the global tab
- Add corresponding `TabsContent`

### 3B. `src/pages/TimeSheet.tsx`

- Import and call `useHolidaysForWeek(weekInfo.weekDates)` and `useHolidayEngagementId()`
- Pass `holidayMap` and `holidayEngagementId` to `TimesheetGrid`
- Pass holiday data to `copyPreviousWeek.mutate()`

### 3C. `src/components/timesheet/TimesheetGrid.tsx`

New props: `holidayMap?: Map<string, string>`, `holidayEngagementId?: string | null`

1. **Header columns**: If date in `holidayMap`, add tinted background + calendar icon + Tooltip with holiday name
2. **Cell rendering**: Compute `isHolidayBlocked`:
   ```
   const holidayName = holidayMap?.get(toISODateString(date));
   const isHolidayBlocked = !!holidayName && row.engagementId !== holidayEngagementId;
   ```
   Add to `isDisabled` logic. Holiday-blocked cells get warning tint.
3. **handleHoursChange guard**:
   - Holiday date + `holidayEngagementId` is null/empty: toast "not configured" message, revert
   - Holiday date + engagement mismatch: toast "blocked" message with holiday name, revert
4. **onError handler**: Parse Supabase error for `HOLIDAY_BLOCKED:` and `HOLIDAY_NOT_CONFIGURED`

### 3D. `src/hooks/useTimesheetMutations.ts` -- Copy Previous Week

- Accept optional `holidayDates?: Set<string>`, `holidayEngagementId?: string | null`
- Skip entries where target date is in `holidayDates` AND `engagement_id !== holidayEngagementId`
- Show `toast.info` with skipped count

### 3E. `src/lib/timesheetErrors.ts`

Add both codes (English literals, matching existing pattern):
```typescript
export type TimesheetErrorCode = "WEEK_LOCKED" | "NO_ENTRIES" | "HOLIDAY_BLOCKED" | "HOLIDAY_NOT_CONFIGURED";

const messages: Record<TimesheetErrorCode, string> = {
  WEEK_LOCKED: "This week is locked and cannot be modified",
  NO_ENTRIES: "No entries found in the previous week to copy",
  HOLIDAY_BLOCKED: "Cannot log time on a holiday for this engagement",
  HOLIDAY_NOT_CONFIGURED: "Holiday blocking is active but no holiday engagement has been configured",
};
```

### 3F. `src/hooks/mutations/index.ts`

Add: `export { useCreateHoliday, useUpdateHoliday, useDeleteHoliday } from "./useHolidayMutations";`

### 3G. i18n Keys (`en.json` and `es.json`)

| Key | English | Spanish |
|-----|---------|---------|
| settings.holidays | Holidays | Feriados |
| settings.holidayEngagement | Holiday Engagement | Encargo de Feriados |
| settings.holidayEngagementHelp | Select the engagement allowed for time entries on holiday dates | Seleccione el encargo permitido para registros en dias feriados |
| settings.holidayNotConfigured | Holiday blocking is inactive until an engagement is selected | El bloqueo de feriados esta inactivo hasta seleccionar un encargo |
| holiday.addHoliday | Add Holiday | Agregar Feriado |
| holiday.editHoliday | Edit Holiday | Editar Feriado |
| holiday.deleteHoliday | Delete Holiday | Eliminar Feriado |
| holiday.date | Date | Fecha |
| holiday.name | Name | Nombre |
| holiday.createdBy | Created By | Creado Por |
| holiday.deleteConfirm | Are you sure you want to delete this holiday? | Esta seguro que desea eliminar este feriado? |
| timesheet.holidayBlocked | Cannot log time on {{name}} for this engagement. Only the holiday engagement is allowed. | No se puede registrar tiempo en {{name}} para este encargo. Solo el encargo de feriados esta permitido. |
| timesheet.holidayNotConfiguredAttempt | Cannot log time on holidays. The holiday engagement has not been configured by an administrator. | No se puede registrar tiempo en feriados. El encargo de feriados no ha sido configurado por un administrador. |
| timesheet.holidayTooltip | Holiday: {{name}} | Feriado: {{name}} |
| timesheet.holidayEntriesSkipped | {{count}} entries skipped due to holidays | {{count}} registros omitidos por feriados |
| messages.holidayCreated | Holiday created | Feriado creado |
| messages.holidayUpdated | Holiday updated | Feriado actualizado |
| messages.holidayDeleted | Holiday deleted | Feriado eliminado |

---

## Phase 4: Documentation

### Create `docs/CHANGELOG-2026-02-17.md`

Full implementation entry following established format from `CHANGELOG-2026-02-13.md`:
- Bug ID: 0213-27
- Problem: System lacks holiday management and blocking
- Root cause: Missing feature
- Solution: DB table + trigger + Settings UI + Timesheet integration
- All files created/modified with descriptions
- Risk assessment

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/` (new) | CREATE -- holidays table, RLS, trigger, setting row |
| `src/hooks/useHolidays.ts` | CREATE |
| `src/hooks/mutations/useHolidayMutations.ts` | CREATE |
| `src/components/settings/HolidaysManager.tsx` | CREATE |
| `src/components/forms/HolidayForm.tsx` | CREATE |
| `src/pages/Settings.tsx` | MODIFY |
| `src/pages/TimeSheet.tsx` | MODIFY |
| `src/components/timesheet/TimesheetGrid.tsx` | MODIFY |
| `src/hooks/useTimesheetMutations.ts` | MODIFY |
| `src/lib/timesheetErrors.ts` | MODIFY |
| `src/hooks/mutations/index.ts` | MODIFY |
| `src/locales/en.json` | MODIFY |
| `src/locales/es.json` | MODIFY |
| `docs/CHANGELOG-2026-02-17.md` | CREATE |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| All holiday entries blocked if engagement not configured | Strict mode + warning banner + distinct `HOLIDAY_NOT_CONFIGURED` error |
| Copy previous week silently skips cells | Toast info with skipped count |
| Existing time entries on past holiday dates | Trigger only fires on INSERT/UPDATE, not retroactive |
| Trigger ordering with `check_wo_approved` | Documented in migration; no functional dependency |
| Date key mismatch | Enforced: `toISODateString()` everywhere + raw DB date strings |
| UUID/text comparison | Trigger casts to uuid before comparing |
| Migration re-run on existing setting | Idempotent `ON CONFLICT DO NOTHING` |

