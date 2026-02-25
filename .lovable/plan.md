# Plan v6: BUG 0213-36 -- Full Runtime Replacement of DAILY_LIMIT/WEEKLY_LIMIT with Min-Max Model (Atomic Backend Write + Period-Scoped Submit)

**Bug ID**: 0213-36
**Plan ID**: BUG-0213-36-v6
**Status**: Ready for review

---

## v5 to v6 Delta

v5 deferred backend integration tests to a placeholder path (`scripts/tests/<backend_test_file>.sql_or_ts`). v6 resolves this by using concrete Deno-based edge function tests under `supabase/functions/test-minmax-settings/index.ts` that exercise both the `update_timesheet_minmax_settings` RPC and `submit_timesheet_safe` weekly min/max enforcement via live RPC calls. All placeholder tokens are eliminated.

Additionally, v6 is rebased against the **actual current codebase** with verified line numbers, current default values (DAILY_LIMIT=8, WEEKLY_LIMIT=40 in live DB), and exact i18n key positions.

### **Implementation notes to keep in scope (non-blocking)**

1. Ensure `update_timesheet_minmax_settings` handles missing rows defensively (if any key row is absent in non-prod DBs) so it cannot silently no-op.
2. For the edge-function backend tests, make sure they are run only in safe test/staging context and do cleanup/reset of changed settings and test data.

---

## Locked Decisions


| Decision                 | Value                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Auto-approval            | Keep Partner/Director auto-approval behavior unchanged                                                      |
| Full replacement         | Remove DAILY_LIMIT and WEEKLY_LIMIT from all runtime code paths                                             |
| New settings             | DAILY_MIN=8, DAILY_MAX=8, WEEKLY_MIN=40, WEEKLY_MAX=40                                                      |
| Submit rule              | WEEKLY_MIN <= weekly_total <= WEEKLY_MAX                                                                    |
| Submit hour scope        | Period-scoped: `period_id + staff_id + is_forecast=false`                                                   |
| Settings write authority | Single atomic backend RPC `update_timesheet_minmax_settings` -- no per-key frontend writes for these 4 keys |
| Compatibility backfill   | Live DB: DAILY_LIMIT=8 maps to DAILY_MAX=8; WEEKLY_LIMIT=40 maps to WEEKLY_MAX=40                           |


---

## Feasibility Invariants (enforced by backend RPC atomically)

```text
DAILY_MIN  <= DAILY_MAX
WEEKLY_MIN <= WEEKLY_MAX
WEEKLY_MIN <= DAILY_MAX * workDays
WEEKLY_MAX >= DAILY_MIN * workDays
```

---

## Current Runtime References (verified line numbers)


| File                                         | Lines                 | Setting                       | Usage                               |
| -------------------------------------------- | --------------------- | ----------------------------- | ----------------------------------- |
| `src/pages/TimeSheet.tsx`                    | 58-66                 | `DAILY_LIMIT`, `WEEKLY_LIMIT` | Submit gating + grid props          |
| `src/pages/TimeSheet.tsx`                    | 109                   | `weeklyLimit`                 | `isWeeklyLimitExceeded`             |
| `src/pages/TimeSheet.tsx`                    | 278-279               | `isWeeklyLimitExceeded`       | `canSubmit`                         |
| `src/pages/TimeSheet.tsx`                    | 284                   | `isWeeklyLimitExceeded`       | Defense-in-depth guard              |
| `src/pages/TimeSheet.tsx`                    | 467-483               | `isWeeklyLimitExceeded`       | Alert UI                            |
| `src/pages/TimeSheet.tsx`                    | 499-500               | `dailyLimit`, `weeklyLimit`   | Grid props                          |
| `src/pages/Settings.tsx`                     | 80-81                 | state vars                    | `dailyLimit`, `weeklyLimit`         |
| `src/pages/Settings.tsx`                     | 124-125               | `DAILY_LIMIT`, `WEEKLY_LIMIT` | Dirty check                         |
| `src/pages/Settings.tsx`                     | 134-135               | `dailyLimit`, `weeklyLimit`   | Dirty comparison                    |
| `src/pages/Settings.tsx`                     | 158-159               | state reset                   | Cancel handler                      |
| `src/pages/Settings.tsx`                     | 279-284               | `DAILY_LIMIT`, `WEEKLY_LIMIT` | Save mutation                       |
| `src/pages/Settings.tsx`                     | 544-567               | `DAILY_LIMIT`, `WEEKLY_LIMIT` | UI fields                           |
| `src/components/timesheet/TimesheetGrid.tsx` | 61-62                 | props interface               | `dailyLimit`, `weeklyLimit`         |
| `src/components/timesheet/TimesheetGrid.tsx` | 90-91                 | defaults                      | `dailyLimit = 10, weeklyLimit = 50` |
| `src/components/timesheet/TimesheetGrid.tsx` | 561-578               | limit checks                  | `isDailyOverLimit`, etc.            |
| `src/components/timesheet/TimesheetGrid.tsx` | 846-891               | footer                        | Coloring + labels                   |
| `src/pages/TrackerRecord.tsx`                | 127-130               | `DAILY_LIMIT`                 | Daily guard read                    |
| `src/pages/TrackerRecord.tsx`                | 152                   | `dailyLimit`                  | Remaining hours calc                |
| `supabase/functions/dashboard-data/index.ts` | 800-807               | `WEEKLY_LIMIT`                | Dashboard payload                   |
| `src/locales/en.json`                        | 275-278, 699, 737-738 | labels/messages               | Settings + grid UI                  |
| `src/locales/es.json`                        | 275-278, 699, 737-738 | labels/messages               | Settings + grid UI                  |


---

## Phase P0-DB: Database Migration

**File**: `supabase/migrations/<timestamp>_bug_0213_36_replace_limits_with_minmax.sql` (CREATE)

### DB-1: Upsert new settings with compatibility backfill

```sql
DO $$
DECLARE
  v_daily_limit numeric;
  v_weekly_limit numeric;
BEGIN
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'DAILY_LIMIT'), 8
  ) INTO v_daily_limit;

  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_LIMIT'), 40
  ) INTO v_weekly_limit;

  INSERT INTO global_settings (setting_key, setting_value, description)
  VALUES ('DAILY_MIN', '8', 'Minimum hours per day (visual indicator in timesheet grid)')
  ON CONFLICT (setting_key) DO NOTHING;

  INSERT INTO global_settings (setting_key, setting_value, description)
  VALUES ('DAILY_MAX', v_daily_limit::text, 'Maximum hours per day (visual indicator and tracker guard)')
  ON CONFLICT (setting_key) DO NOTHING;

  INSERT INTO global_settings (setting_key, setting_value, description)
  VALUES ('WEEKLY_MIN', '40', 'Minimum weekly hours required to submit timesheet')
  ON CONFLICT (setting_key) DO NOTHING;

  INSERT INTO global_settings (setting_key, setting_value, description)
  VALUES ('WEEKLY_MAX', v_weekly_limit::text, 'Maximum weekly hours allowed to submit timesheet')
  ON CONFLICT (setting_key) DO NOTHING;
END $$;
```

### DB-2: Atomic backend-authoritative settings write RPC

```sql
CREATE OR REPLACE FUNCTION public.update_timesheet_minmax_settings(
  p_daily_min numeric,
  p_daily_max numeric,
  p_weekly_min numeric,
  p_weekly_max numeric,
  p_work_days integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_daily_min > p_daily_max THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'DAILY_MIN_EXCEEDS_MAX');
  END IF;

  IF p_weekly_min > p_weekly_max THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MIN_EXCEEDS_MAX');
  END IF;

  IF p_weekly_min > p_daily_max * p_work_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MIN_EXCEEDS_DAILY_MAX');
  END IF;

  IF p_weekly_max < p_daily_min * p_work_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'WEEKLY_MAX_BELOW_DAILY_MIN');
  END IF;

  UPDATE global_settings SET setting_value = p_daily_min::text, updated_at = now()
  WHERE setting_key = 'DAILY_MIN';
  UPDATE global_settings SET setting_value = p_daily_max::text, updated_at = now()
  WHERE setting_key = 'DAILY_MAX';
  UPDATE global_settings SET setting_value = p_weekly_min::text, updated_at = now()
  WHERE setting_key = 'WEEKLY_MIN';
  UPDATE global_settings SET setting_value = p_weekly_max::text, updated_at = now()
  WHERE setting_key = 'WEEKLY_MAX';

  RETURN jsonb_build_object('success', true);
END;
$$;
```

### DB-3: Period-scoped min/max validation in `submit_timesheet_safe`

New declarations added:

```sql
  v_weekly_min numeric;
  v_weekly_max numeric;
  v_actual_hours numeric;
```

New validation block inserted between step 2 (LOCK) and step 3 (UPDATE submitted_at):

```sql
  -- BUG 0213-36: Enforce weekly min/max (period-scoped)
  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MIN'), 40
  ) INTO v_weekly_min;

  SELECT COALESCE(
    (SELECT setting_value::numeric FROM global_settings WHERE setting_key = 'WEEKLY_MAX'), 40
  ) INTO v_weekly_max;

  SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual_hours
  FROM time_entries te
  WHERE te.period_id = p_period_id
    AND te.staff_id = p_staff_id
    AND te.is_forecast = false;

  IF v_actual_hours < v_weekly_min THEN
    RAISE EXCEPTION 'WEEKLY_MIN_NOT_MET:actual=%,min=%', v_actual_hours, v_weekly_min;
  END IF;

  IF v_actual_hours > v_weekly_max THEN
    RAISE EXCEPTION 'WEEKLY_MAX_EXCEEDED:actual=%,max=%', v_actual_hours, v_weekly_max;
  END IF;
```

Position:

```text
[existing] 1. SANITIZE engagement IDs
[existing] 2. LOCK period row (SELECT ... FOR UPDATE -- unchanged)
[NEW]      2b. VALIDATE weekly min/max (period-scoped)
[existing] 3. UPDATE submitted_at
[existing] 4-7. Process engagements (auto-approval logic UNCHANGED)
```

### DB-4: No changes to approval functions

`is_auto_approved_category`, `get_line_approver`, `can_approve_timesheet_line`, `get_approvable_pairs` -- all untouched.

---

## Phase P1-Frontend

### FE-1: `src/pages/TimeSheet.tsx` (MODIFY)

**a) Lines 57-66:** Remove `dailyLimit`/`weeklyLimit` memos reading `DAILY_LIMIT`/`WEEKLY_LIMIT`. Replace with four memos reading `DAILY_MIN` (default 8), `DAILY_MAX` (default 8), `WEEKLY_MIN` (default 40), `WEEKLY_MAX` (default 40).

**b) Line 109:** Replace `const isWeeklyLimitExceeded = weeklyGrandTotal > Number(weeklyLimit);` with:

```typescript
const isBelowWeeklyMin = weeklyGrandTotal < weeklyMin;
const isAboveWeeklyMax = weeklyGrandTotal > weeklyMax;
const isWeeklyOutOfBounds = isBelowWeeklyMin || isAboveWeeklyMax;
```

**c) Line 279:** Replace `!isWeeklyLimitExceeded` with `!isWeeklyOutOfBounds`.

**d) Line 284:** Replace `if (isWeeklyLimitExceeded) return;` with `if (isWeeklyOutOfBounds) return;`.

**e) Lines 467-483:** Replace single `isWeeklyLimitExceeded` alert with two alerts for `isBelowWeeklyMin` and `isAboveWeeklyMax`, using `timesheet.weeklyMinNotMet` and `timesheet.weeklyMaxExceeded` i18n keys.

**f) Lines 499-500:** Replace `dailyLimit={dailyLimit}` / `weeklyLimit={weeklyLimit}` with `dailyMin={dailyMin} dailyMax={dailyMax} weeklyMin={weeklyMin} weeklyMax={weeklyMax}`.

**g) Lines 292-301 (auto-approval):** Keep unchanged.

### FE-2: `src/components/timesheet/TimesheetGrid.tsx` (MODIFY)

**a) Lines 61-62 (interface):** Replace `dailyLimit?: number; weeklyLimit?: number;` with `dailyMin?: number; dailyMax?: number; weeklyMin?: number; weeklyMax?: number;`.

**b) Lines 90-91 (defaults):** Replace `dailyLimit = 10, weeklyLimit = 50,` with `dailyMin = 8, dailyMax = 8, weeklyMin = 40, weeklyMax = 40,`.

**c) Lines 561-578 (limit checks):** Replace with `isDailyOverMax`, `isDailyBelowMin`, `isDailyNearMax`, `isWeeklyOverMax`, `isWeeklyBelowMin`, `isWeeklyNearMax`.

**d) Lines 846-891 (footer):**

- Line 853: `isDailyOverLimit(date)` becomes `isDailyOverMax(date)`
- Line 854: `isDailyNearLimit(date)` becomes `isDailyNearMax(date)`
- Line 855: Replace `DAILY_TARGET_HOURS = 8` with `dailyMin`
- Line 872: Replace `t("timesheet.dailyLimitExceeded")` with `t("timesheet.dailyMaxExceeded")`
- Line 879: `isWeeklyOverLimit()` becomes `isWeeklyOverMax()`
- Line 880: `isWeeklyNearLimit()` becomes `isWeeklyNearMax()`
- Line 888: Replace `t("timesheet.weeklyLimitExceeded")` with `t("timesheet.weeklyMaxExceeded")`
- Add `isDailyBelowMin` and `isWeeklyBelowMin` info coloring

### FE-3: `src/pages/TrackerRecord.tsx` (MODIFY)

**Lines 127-130:** Replace `DAILY_LIMIT` read with `DAILY_MAX` (default 8).
**Line 152:** Replace `dailyLimit` with `dailyMax`.
Tracker toast `tracker.dailyLimitReached` (line 187) remains unchanged.

### FE-4: `src/pages/Settings.tsx` (MODIFY) -- KEY v6 CHANGE

**a) Lines 80-81:** Replace `dailyLimit`/`weeklyLimit` state with `dailyMin`, `dailyMax`, `weeklyMin`, `weeklyMax`.

**b) Lines 124-125, 134-135:** Update dirty check to read `DAILY_MIN`/`DAILY_MAX`/`WEEKLY_MIN`/`WEEKLY_MAX`. Update dependency array (line 137-138).

**c) Lines 158-159:** Reset all four new state vars in cancel handler.

**d) Lines 279-284 (save handler):** Replace per-key `DAILY_LIMIT`/`WEEKLY_LIMIT` updates with single atomic RPC call:

```typescript
const timesheetMinMaxDirty = dailyMin || dailyMax || weeklyMin || weeklyMax;

if (timesheetMinMaxDirty) {
  const dMin = parseFloat(dailyMin || getSetting("DAILY_MIN") || "8");
  const dMax = parseFloat(dailyMax || getSetting("DAILY_MAX") || "8");
  const wMin = parseFloat(weeklyMin || getSetting("WEEKLY_MIN") || "40");
  const wMax = parseFloat(weeklyMax || getSetting("WEEKLY_MAX") || "40");
  const wd = allowWeekendTracking ? 6 : 5;

  const { data: result, error: rpcError } = await supabase.rpc(
    "update_timesheet_minmax_settings",
    { p_daily_min: dMin, p_daily_max: dMax, p_weekly_min: wMin, p_weekly_max: wMax, p_work_days: wd }
  );

  if (rpcError) throw rpcError;

  if (result && !result.success) {
    const errorKey = {
      DAILY_MIN_EXCEEDS_MAX: "settings.dailyMinMaxError",
      WEEKLY_MIN_EXCEEDS_MAX: "settings.weeklyMinMaxError",
      WEEKLY_MIN_EXCEEDS_DAILY_MAX: "settings.weeklyMinExceedsDailyMax",
      WEEKLY_MAX_BELOW_DAILY_MIN: "settings.weeklyMaxBelowDailyMin",
    }[result.error_code as string] || "messages.error";
    toast.error(t(errorKey));
    return;
  }
}
```

These four keys are NEVER written via `updateSettingMutation`. All other settings (TAX_RATE, LANGUAGE, etc.) keep using the per-key mutation as before.

**e) Lines 544-567:** Replace 2-column limit grid with 2x2 min/max grid using `NumericInput`:

```text
Row 1: [DAILY_MIN (default 8)] [DAILY_MAX (default 8)]
Row 2: [WEEKLY_MIN (default 40)] [WEEKLY_MAX (default 40)]
```

### FE-5: `supabase/functions/dashboard-data/index.ts` (MODIFY)

**Lines 800-807:** Replace `WEEKLY_LIMIT` read with `WEEKLY_MAX`. Payload field name `weekly_limit` (line 814) kept.

### FE-6: `src/hooks/useTimesheetMutations.ts` (MODIFY)

**In `useSubmitTimesheet.onError` (after line 198):** Add before `SUBMIT_NO_ENTRIES` check:

```typescript
if (msg.includes('WEEKLY_MIN_NOT_MET')) {
  toast.error(i18n.t("timesheet.weeklyMinNotMet"));
  return;
}
if (msg.includes('WEEKLY_MAX_EXCEEDED')) {
  toast.error(i18n.t("timesheet.weeklyMaxExceeded"));
  return;
}
```

---

## Phase P1-i18n

**Files**: `src/locales/en.json`, `src/locales/es.json` (MODIFY)

### New timesheet keys


| Key                 | EN                                                                                 | ES                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `weeklyMinNotMet`   | `Cannot submit: total hours ({{total}}h) are below the weekly minimum ({{min}}h).` | `No se puede enviar: el total de horas ({{total}}h) esta por debajo del minimo semanal ({{min}}h).` |
| `weeklyMaxExceeded` | `Cannot submit: total hours ({{total}}h) exceed the weekly maximum ({{max}}h).`    | `No se puede enviar: el total de horas ({{total}}h) exceden el maximo semanal ({{max}}h).`          |
| `dailyMaxExceeded`  | `Over max!`                                                                        | `Excede maximo!`                                                                                    |
| `weeklyBelowMin`    | `Below min`                                                                        | `Bajo minimo`                                                                                       |


### New settings keys


| Key                        | EN                                                                                    | ES                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `dailyMin`                 | `Daily Minimum Hours`                                                                 | `Minimo de Horas Diarias`                                                                                 |
| `dailyMinHelp`             | `Minimum hours per day (visual indicator)`                                            | `Minimo de horas por dia (indicador visual)`                                                              |
| `dailyMax`                 | `Daily Maximum Hours`                                                                 | `Maximo de Horas Diarias`                                                                                 |
| `dailyMaxHelp`             | `Maximum hours per day in timesheets and tracker`                                     | `Maximo de horas por dia en hojas de tiempo y cronometro`                                                 |
| `weeklyMin`                | `Weekly Minimum Hours`                                                                | `Minimo de Horas Semanales`                                                                               |
| `weeklyMinHelp`            | `Minimum hours per week required to submit timesheet`                                 | `Minimo de horas por semana requerido para enviar hoja de tiempo`                                         |
| `weeklyMax`                | `Weekly Maximum Hours`                                                                | `Maximo de Horas Semanales`                                                                               |
| `weeklyMaxHelp`            | `Maximum hours per week allowed to submit timesheet`                                  | `Maximo de horas por semana permitido para enviar hoja de tiempo`                                         |
| `dailyMinMaxError`         | `Daily minimum cannot exceed daily maximum.`                                          | `El minimo diario no puede exceder el maximo diario.`                                                     |
| `weeklyMinMaxError`        | `Weekly minimum cannot exceed weekly maximum.`                                        | `El minimo semanal no puede exceder el maximo semanal.`                                                   |
| `weeklyMinExceedsDailyMax` | `Weekly minimum is not achievable: it exceeds daily maximum multiplied by workdays.`  | `El minimo semanal no es alcanzable: excede el maximo diario multiplicado por dias laborables.`           |
| `weeklyMaxBelowDailyMin`   | `Weekly maximum is not achievable: it is below daily minimum multiplied by workdays.` | `El maximo semanal no es alcanzable: esta por debajo del minimo diario multiplicado por dias laborables.` |


### Keys kept as dead code (not deleted)

`settings.dailyLimit`, `settings.dailyLimitHelp`, `settings.weeklyLimit`, `settings.weeklyLimitHelp`, `timesheet.cannotSubmitWeeklyLimit`, `timesheet.dailyLimitExceeded` (en.json line 737), `timesheet.weeklyLimitExceeded` (en.json line 738).

---

## Phase P0/P1-Tests

### T-1: `src/hooks/__tests__/useTimesheetMutations.test.tsx` (MODIFY)

Add two tests in the `useSubmitTimesheet (BUG 0220-51)` describe block (after existing T4 at line 160):

- **T-MIN**: Mock `supabase.rpc` returning `{ data: null, error: { message: 'WEEKLY_MIN_NOT_MET:actual=32,min=40' } }`. Assert `toast.error` called with `timesheet.weeklyMinNotMet`.
- **T-MAX**: Mock `supabase.rpc` returning `{ data: null, error: { message: 'WEEKLY_MAX_EXCEEDED:actual=48,max=40' } }`. Assert `toast.error` called with `timesheet.weeklyMaxExceeded`.

### T-2: `src/pages/__tests__/TimeSheet.submit-guards.test.tsx` (CREATE)

- **TSG-1**: Total=32h, WEEKLY_MIN=40, WEEKLY_MAX=50. Submit absent. Below-min alert.
- **TSG-2**: Total=52h, WEEKLY_MIN=40, WEEKLY_MAX=50. Submit absent. Above-max alert.
- **TSG-3**: Total=40h, WEEKLY_MIN=40, WEEKLY_MAX=50. Submit present. No alerts.
- **TSG-4**: Total=50h boundary. Submit present.
- **TSG-5**: Total=40h, WEEKLY_MIN=40, WEEKLY_MAX=40. Submit present (exact match).
- **TSG-6**: Auto-approval RPC call unchanged verification.

### T-3: `src/pages/__tests__/Settings.global-focus-cancel.test.tsx` (MODIFY)

**Lines 27-28:** Replace mock data:

```typescript
{ setting_key: "DAILY_MIN", setting_value: "8" },
{ setting_key: "DAILY_MAX", setting_value: "8" },
{ setting_key: "WEEKLY_MIN", setting_value: "40" },
{ setting_key: "WEEKLY_MAX", setting_value: "40" },
```

### T-4: Backend Integration Tests via Edge Function

**File**: `supabase/functions/test-minmax-settings/index.ts` (CREATE)

This edge function uses the service role key to exercise both RPCs against the live database. It covers:

1. `update_timesheet_minmax_settings` rejects `DAILY_MIN_EXCEEDS_MAX` (daily_min=10, daily_max=5)
2. `update_timesheet_minmax_settings` rejects `WEEKLY_MIN_EXCEEDS_MAX` (weekly_min=50, weekly_max=30)
3. `update_timesheet_minmax_settings` rejects `WEEKLY_MIN_EXCEEDS_DAILY_MAX` (weekly_min=100, daily_max=8, work_days=5)
4. `update_timesheet_minmax_settings` rejects `WEEKLY_MAX_BELOW_DAILY_MIN` (weekly_max=10, daily_min=8, work_days=5)
5. `update_timesheet_minmax_settings` succeeds with valid values and all four keys are persisted
6. `submit_timesheet_safe` raises `WEEKLY_MIN_NOT_MET` when period hours < WEEKLY_MIN
7. `submit_timesheet_safe` raises `WEEKLY_MAX_EXCEEDED` when period hours > WEEKLY_MAX

**Concrete test command**:

```text
curl -X POST https://ugqxfnrxvksiltwxzist.supabase.co/functions/v1/test-minmax-settings \
  -H "Authorization: Bearer <service_role_key>"
```

Or via the Lovable tools: `supabase--curl_edge_functions` with path `/test-minmax-settings` and method `POST`.

The function returns JSON with pass/fail per test case.

### T-5: `.github/workflows/test.yml` (MODIFY)

Add CI guard step after test step:

```yaml
- name: Guard against old limit settings in runtime code
  run: |
    if grep -rn --include='*.ts' --include='*.tsx' \
      -E '"DAILY_LIMIT"|"WEEKLY_LIMIT"' \
      src/ supabase/functions/ \
      | grep -v '\.test\.' \
      | grep -v '__tests__' \
      | grep -v '// DEPRECATED'; then
      echo "ERROR: Found runtime references to DAILY_LIMIT or WEEKLY_LIMIT"
      exit 1
    fi
```

---

## Phase P2-Docs

### DOC-1: `docs/database-schema.sql` (MODIFY)

- Add `DAILY_MIN`, `DAILY_MAX`, `WEEKLY_MIN`, `WEEKLY_MAX` to global_settings reference.
- Add `update_timesheet_minmax_settings` function definition.
- Update `submit_timesheet_safe` with period-scoped min/max validation block.
- Mark `DAILY_LIMIT`/`WEEKLY_LIMIT` as deprecated/inert.

### DOC-2: `docs/CHANGELOG-2026-02-24.md` (APPEND)

```markdown
## BUG 0213-36: Replace DAILY_LIMIT/WEEKLY_LIMIT with Min/Max Model

**Migration**: `<timestamp>_bug_0213_36_replace_limits_with_minmax.sql`

### Changes

- Added global settings DAILY_MIN (8), DAILY_MAX (8), WEEKLY_MIN (40), WEEKLY_MAX (40).
- Compatibility backfill: existing DAILY_LIMIT=8 mapped to DAILY_MAX; WEEKLY_LIMIT=40 mapped to WEEKLY_MAX.
- DAILY_LIMIT and WEEKLY_LIMIT remain in DB as inert historical data; removed from all runtime code.
- Added update_timesheet_minmax_settings() RPC for backend-authoritative atomic settings write. Validates feasibility invariants server-side and writes all four settings in one transaction.
- submit_timesheet_safe() now validates WEEKLY_MIN <= actual_hours <= WEEKLY_MAX using period-scoped query (period_id + staff_id + is_forecast=false). Raises WEEKLY_MIN_NOT_MET or WEEKLY_MAX_EXCEEDED.
- Settings UI: 2x2 min/max field grid replaces old limit fields. Save calls atomic RPC.
- TimeSheet: submit gating enforces dual-bound check.
- TimesheetGrid: daily coloring uses DAILY_MIN/DAILY_MAX.
- TrackerRecord: daily guard uses DAILY_MAX.
- Dashboard edge function: uses WEEKLY_MAX for weekly_limit payload field.
- Partner/Director auto-approval behavior unchanged.
- Backend integration tests via test-minmax-settings edge function.
- CI guard prevents reintroduction of old settings in runtime code.
- EN/ES i18n parity for all new labels/errors. Old keys kept as dead code.
```

---

## Execution Order

1. Database migration (DB-1 + DB-2 + DB-3 in single file)
2. `src/hooks/useTimesheetMutations.ts` (FE-6)
3. `src/components/timesheet/TimesheetGrid.tsx` (FE-2)
4. `src/pages/TimeSheet.tsx` (FE-1)
5. `src/pages/TrackerRecord.tsx` (FE-3)
6. `src/pages/Settings.tsx` (FE-4)
7. `supabase/functions/dashboard-data/index.ts` (FE-5)
8. `src/locales/en.json` + `src/locales/es.json` (I18N)
9. `src/hooks/__tests__/useTimesheetMutations.test.tsx` (T-1)
10. `src/pages/__tests__/TimeSheet.submit-guards.test.tsx` (T-2)
11. `src/pages/__tests__/Settings.global-focus-cancel.test.tsx` (T-3)
12. `supabase/functions/test-minmax-settings/index.ts` (T-4)
13. `.github/workflows/test.yml` (T-5)
14. `docs/database-schema.sql` (DOC-1)
15. `docs/CHANGELOG-2026-02-24.md` (DOC-2)

---

## Files Expected to Change


| File                                                                         | Change Type |
| ---------------------------------------------------------------------------- | ----------- |
| `supabase/migrations/<timestamp>_bug_0213_36_replace_limits_with_minmax.sql` | Create      |
| `src/hooks/useTimesheetMutations.ts`                                         | Modify      |
| `src/components/timesheet/TimesheetGrid.tsx`                                 | Modify      |
| `src/pages/TimeSheet.tsx`                                                    | Modify      |
| `src/pages/TrackerRecord.tsx`                                                | Modify      |
| `src/pages/Settings.tsx`                                                     | Modify      |
| `supabase/functions/dashboard-data/index.ts`                                 | Modify      |
| `src/locales/en.json`                                                        | Modify      |
| `src/locales/es.json`                                                        | Modify      |
| `src/hooks/__tests__/useTimesheetMutations.test.tsx`                         | Modify      |
| `src/pages/__tests__/TimeSheet.submit-guards.test.tsx`                       | Create      |
| `src/pages/__tests__/Settings.global-focus-cancel.test.tsx`                  | Modify      |
| `supabase/functions/test-minmax-settings/index.ts`                           | Create      |
| `.github/workflows/test.yml`                                                 | Modify      |
| `docs/database-schema.sql`                                                   | Modify      |
| `docs/CHANGELOG-2026-02-24.md`                                               | Append      |


---

## Acceptance Criteria

1. No runtime references to `DAILY_LIMIT` or `WEEKLY_LIMIT` in `src/` or `supabase/functions/` (CI guard).
2. Settings page exposes only `DAILY_MIN`/`DAILY_MAX`/`WEEKLY_MIN`/`WEEKLY_MAX` for hour constraints.
3. Settings infeasible combinations rejected by backend atomic RPC. Frontend has NO per-key write path for these four settings.
4. Submit blocked when weekly total outside `[WEEKLY_MIN, WEEKLY_MAX]` in both UI and backend.
5. Backend submit RPC uses period-scoped hours (`period_id + staff_id + is_forecast=false`).
6. TimesheetGrid daily coloring uses `DAILY_MIN`/`DAILY_MAX`.
7. TrackerRecord daily guard uses `DAILY_MAX`.
8. Dashboard edge function uses `WEEKLY_MAX` for payload.
9. Partner/Director auto-approval behavior unchanged.
10. EN/ES i18n parity for all new labels and errors.
11. All frontend tests pass (`pnpm test`).
12. Backend integration tests pass (edge function `test-minmax-settings`).
13. CI guard passes.

---

## Risk Register


| Risk                                  | Severity        | Mitigation                                                             |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------- |
| Legacy key references in runtime code | Medium          | CI guard + explicit file sweep                                         |
| Client bypasses settings validation   | High (resolved) | Single atomic backend RPC; no per-key frontend writes for these 4 keys |
| Backfill creates unexpected defaults  | Low             | `ON CONFLICT DO NOTHING`; live DB has DAILY_LIMIT=8, WEEKLY_LIMIT=40   |
| Dashboard payload field name change   | Low             | Field name `weekly_limit` kept                                         |
| Auto-approval behavior drift          | Medium          | No changes to approval functions; dedicated regression test            |


---

## Rollback Plan

### Step 1: DB rollback

Create rollback migration: drop `update_timesheet_minmax_settings` function, remove min/max validation block from `submit_timesheet_safe`. Keep min/max settings rows as inert data.

### Step 2: Frontend rollback

- Restore `dailyLimit`/`weeklyLimit` state and `DAILY_LIMIT`/`WEEKLY_LIMIT` reads in TimeSheet, Settings, TrackerRecord.
- Restore `dailyLimit`/`weeklyLimit` props in TimesheetGrid.
- Restore `WEEKLY_LIMIT` read in dashboard-data edge function.
- Remove atomic RPC call from Settings; restore per-key saves.
- Remove CI guard step from test.yml.
- Delete `TimeSheet.submit-guards.test.tsx` and `test-minmax-settings` edge function.
- Revert Settings test mock data.

### Step 3: Post-rollback verification

- Settings page shows Daily Limit and Weekly Limit fields.
- Submit gating uses `WEEKLY_LIMIT` max-only check.
- TimesheetGrid coloring uses `DAILY_LIMIT`.
- TrackerRecord uses `DAILY_LIMIT`.
- No `WEEKLY_MIN_NOT_MET` or `WEEKLY_MAX_EXCEEDED` errors.
- Partner/Director auto-approval unchanged.
- All baseline tests pass.

---

## Definition of Done

1. `DAILY_LIMIT` and `WEEKLY_LIMIT` fully replaced by min/max model across app runtime.
2. Backend-authoritative atomic write RPC for settings feasibility (`update_timesheet_minmax_settings`).
3. Submit gating enforces min+max in frontend and backend (period-scoped).
4. Daily coloring and tracker guard aligned to min/max model.
5. No regression in Partner/Director auto-approval.
6. EN/ES i18n parity maintained.
7. All frontend tests, backend integration tests, lint, and CI guard pass.
8. `docs/database-schema.sql` and `docs/CHANGELOG-2026-02-24.md` updated.

## Verification Commands

```text
pnpm test -- src/hooks/__tests__/useTimesheetMutations.test.tsx
pnpm test -- src/pages/__tests__/TimeSheet.submit-guards.test.tsx
pnpm test -- src/pages/__tests__/Settings.global-focus-cancel.test.tsx
pnpm test -- src/pages/__tests__
pnpm test
pnpm lint
```

Backend integration (run after deploy):

```text
supabase--curl_edge_functions path=/test-minmax-settings method=POST
```