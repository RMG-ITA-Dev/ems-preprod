

# Plan_0220-50_v3: Pending Hours Indicator via DB RPC + Collapsible Detail

## Problem

BUG 0220-50: The Dashboard Personal tab has no indicator showing how many weeks and/or hours the user has pending to report since their hire date. Users cannot quickly identify periods with missing or unreported hours.

## Changes from v2

Applied reviewer comments:
- SQL tables explicitly schema-qualified (`public.staff`, `public.time_entries`, `public.holidays`) inside the RPC since `search_path` is set
- i18n keys confirmed consistent under `dashboard.personal.pendingHours.*` -- no leftover key names from prior drafts (`missingHours.*` removed)
- Security: component always passes `staffRecord.staff_id` from `useCurrentStaff()` (current user's own ID) -- confirmed safe with `SECURITY DEFINER`
- Skip-current-week logic (`v_week_end >= CURRENT_DATE THEN EXIT`) confirmed correct since weeks iterate in ascending order

---

## Layer 1: Database RPC

### New Migration: `get_my_pending_hours(uuid)` RPC

```sql
CREATE OR REPLACE FUNCTION public.get_my_pending_hours(p_staff_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hire_date date;
  v_end_date date;
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
  SELECT s.hire_date, s.weekly_capacity_hours, s.termination_date
  INTO v_hire_date, v_capacity, v_end_date
  FROM public.staff s WHERE s.staff_id = p_staff_id;

  IF v_hire_date IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_end_date := LEAST(COALESCE(v_end_date, CURRENT_DATE), CURRENT_DATE);
  v_daily := COALESCE(v_capacity, 40) / 5.0;

  -- Start from Monday of hire_date's week
  v_cursor := v_hire_date - (EXTRACT(ISODOW FROM v_hire_date)::int - 1);

  WHILE v_cursor <= v_end_date LOOP
    v_week_end := v_cursor + 4;  -- Friday

    -- Skip current/incomplete week (ascending order, so EXIT is safe)
    IF v_week_end >= CURRENT_DATE THEN
      EXIT;
    END IF;

    v_eff_start := GREATEST(v_cursor, v_hire_date);
    v_eff_end := LEAST(v_week_end, v_end_date);

    SELECT COUNT(*) INTO v_working_days
    FROM generate_series(v_eff_start, v_eff_end, '1 day'::interval) d
    WHERE EXTRACT(ISODOW FROM d) <= 5;

    SELECT COUNT(*) INTO v_holiday_count
    FROM public.holidays h
    WHERE h.holiday_date BETWEEN v_eff_start AND v_eff_end
      AND EXTRACT(ISODOW FROM h.holiday_date) <= 5;

    v_working_days := v_working_days - v_holiday_count;

    IF v_working_days > 0 THEN
      v_expected := v_working_days * v_daily;

      SELECT COALESCE(SUM(te.hours_logged), 0) INTO v_actual
      FROM public.time_entries te
      WHERE te.staff_id = p_staff_id
        AND te.date_worked BETWEEN v_eff_start AND v_eff_end
        AND te.is_forecast = false;

      v_gap := v_expected - v_actual;

      IF v_gap > 0 THEN
        v_result := v_result || jsonb_build_object(
          'week_start', v_cursor,
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

GRANT EXECUTE ON FUNCTION public.get_my_pending_hours(uuid) TO authenticated;
```

Key points:
- All tables explicitly schema-qualified (`public.staff`, `public.time_entries`, `public.holidays`)
- `SECURITY DEFINER` with `search_path = 'public'`
- Skips current incomplete week via `EXIT` (safe -- ascending iteration)
- Respects `termination_date` as upper bound
- Excludes forecast entries (`is_forecast = false`)
- Excludes holidays from expected workdays

---

## Layer 2: New Component `PendingHoursAlert.tsx`

### New File: `src/components/dashboard/PendingHoursAlert.tsx`

Self-contained component that:
1. Calls `supabase.rpc('get_my_pending_hours', { p_staff_id })` via React Query (`staleTime: 5 min`)
2. Renders nothing when loading or array is empty
3. Shows a warning-styled `Card` with summary: "X week(s) with Y unreported hours"
4. Chevron toggle (Radix `Collapsible`) expands a detail table
5. Detail table shows the 12 most recent deficient weeks (week_start, expected, actual, gap)
6. Footer "...and X more week(s)" if beyond 12
7. "Go to Timesheet" link button

All i18n keys use the `dashboard.personal.pendingHours.*` namespace consistently:
- `t('dashboard.personal.pendingHours.title')`
- `t('dashboard.personal.pendingHours.summary', { weeks, hours })`
- `t('dashboard.personal.pendingHours.weekOf', { date })`
- `t('dashboard.personal.pendingHours.expected')`
- `t('dashboard.personal.pendingHours.logged')`
- `t('dashboard.personal.pendingHours.missing')`
- `t('dashboard.personal.pendingHours.goToTimesheet')`
- `t('dashboard.personal.pendingHours.andMore', { count })`

Security: always passes `staffRecord.staff_id` from `useCurrentStaff()` -- never an arbitrary ID.

---

## Layer 3: PersonalTab Integration

### File: `src/components/dashboard/tabs/PersonalTab.tsx`

**Edit 1 (line 2): Add import**

Before:
```typescript
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
```

After:
```typescript
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { PendingHoursAlert } from "@/components/dashboard/PendingHoursAlert";
```

**Edit 2 (line 344-346): Insert component between KPI cards and charts row**

Before:
```typescript
      </div>

      {/* Row 2: Charts and Recent Entries */}
```

After:
```typescript
      </div>

      {/* Pending Hours Alert */}
      <PendingHoursAlert />

      {/* Row 2: Charts and Recent Entries */}
```

---

## Layer 4: i18n Keys

### `src/locales/es.json` (after line 557)

Before:
```json
      "noRecentEntries": "Sin entradas recientes"
    },
```

After:
```json
      "noRecentEntries": "Sin entradas recientes",
      "pendingHours": {
        "title": "Horas Pendientes de Reporte",
        "summary": "{{weeks}} semana(s) con {{hours}} horas sin registrar",
        "weekOf": "Semana del {{date}}",
        "expected": "Esperadas",
        "logged": "Registradas",
        "missing": "Faltantes",
        "goToTimesheet": "Ir a Hoja de Tiempo",
        "andMore": "...y {{count}} semana(s) más"
      }
    },
```

### `src/locales/en.json` (after line 557)

Before:
```json
      "noRecentEntries": "No recent entries"
    },
```

After:
```json
      "noRecentEntries": "No recent entries",
      "pendingHours": {
        "title": "Missing Hours to Report",
        "summary": "{{weeks}} week(s) with {{hours}} unreported hours",
        "weekOf": "Week of {{date}}",
        "expected": "Expected",
        "logged": "Logged",
        "missing": "Missing",
        "goToTimesheet": "Go to Timesheet",
        "andMore": "...and {{count}} more week(s)"
      }
    },
```

---

## Layer 5: Changelog

### `docs/CHANGELOG-2026-02-22.md` -- Append

Entry for BUG 0220-50 including:
- Problem and user impact
- DB RPC creation with full SQL
- Component creation with i18n key mapping
- PersonalTab integration with before/after snippets
- Risk assessment

---

## Files Changed

| File | Type | Change |
|------|------|--------|
| Migration SQL | New | `get_my_pending_hours(uuid)` RPC with explicit schema-qualified tables + GRANT |
| `src/components/dashboard/PendingHoursAlert.tsx` | New | Collapsible alert component calling RPC via React Query |
| `src/components/dashboard/tabs/PersonalTab.tsx` | Edit | Import + insert `<PendingHoursAlert />` (2 small edits) |
| `src/locales/es.json` | Edit | Add `dashboard.personal.pendingHours.*` (8 keys) |
| `src/locales/en.json` | Edit | Add `dashboard.personal.pendingHours.*` (8 keys) |
| `docs/CHANGELOG-2026-02-22.md` | Append | BUG 0220-50 entry |

## Acceptance Tests

| Case | Expected |
|------|----------|
| New user with `hire_date` and zero time entries | Alert shows correct week count and total missing hours |
| User with all hours logged | Alert does not render |
| Current (incomplete) week | Not counted as missing |
| User with `termination_date` in the past | Computation stops at termination_date |
| Holiday in a week | Expected hours reduced; no false positive |
| Expand/collapse toggle | Detail table appears/hides; shows up to 12 weeks |
| More than 12 gap weeks | Footer shows "...and X more" |
| Click "Go to Timesheet" | Navigates to `/timesheet` |
| User without `hire_date` | Alert does not render |

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| RPC performance | Low | Mirrors proven algorithm; single function call, no N+1 |
| Security | None | `SECURITY DEFINER` + UI always passes own `staff_id` from `useCurrentStaff()` |
| UI clutter | None | Component renders nothing when no gaps exist |
| Business logic duplication | None | All computation in DB RPC; frontend is display-only |
| i18n key collisions | None | Clean namespace `pendingHours.*`; no leftover keys from prior drafts |

