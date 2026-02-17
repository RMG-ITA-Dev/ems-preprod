

# Plan_0213-27_C01_v5: Non-Chargeable Engagement Policy System

## Problem

Two issues block internal/non-chargeable engagements (holidays, training, admin) from working in timesheets:

1. **Invisible in dropdown**: The engagement query only fetches engagements with approved Work Orders. Internal engagements like "ADM_01 Feriados" have no WO, so they never appear.
2. **Activity code required**: `time_entries.activity_id` is NOT NULL and part of the unique index `idx_time_entries_unique_entry(staff_id, engagement_id, activity_id, date_worked, is_forecast)`. The TimesheetGrid disables cells when no activity is selected. Internal engagements should not require a meaningful activity selection.

## Pre-Implementation Verification (All Confirmed via DB Queries)

| Check | Result |
|-------|--------|
| `activity_codes.activity_code` UNIQUE constraint | Yes (`activity_codes_activity_code_key`) |
| `time_entries` unique index includes `activity_id` | Yes (`idx_time_entries_unique_entry`) |
| `time_entries.activity_id` NOT NULL | Yes |
| RLS `engagements` SELECT = `true` for all authenticated | Yes -- NOT the blocker |
| RLS `time_entries` INSERT = `staff_id = get_my_staff_id()` | Yes -- checks own staff only, NOT engagement assignment. NOT a blocker |
| `check_wo_approved()` trigger on `time_entries` | Yes -- trigger name `enforce_wo_approval`, type BEFORE INSERT OR UPDATE. IS a blocker |
| `enforce_holiday_blocking()` trigger | Yes -- BEFORE INSERT OR UPDATE. Independent, no changes needed |
| `global_settings` PK is on `setting_key` | Yes -- `ON CONFLICT (setting_key)` works for upsert |
| Frontend dropdown filtered by approved WO only | Yes -- IS a blocker |
| Existing triggers on `time_entries` | `enforce_wo_approval`, `enforce_holiday_blocking`, `update_time_entries_updated_at` |

**Root cause confirmed**: `icori@ruizmier.com` could not use the holiday engagement because of TWO blockers: (1) frontend query excludes non-WO engagements from dropdown, and (2) `check_wo_approved` trigger rejects the INSERT at DB level. RLS is NOT a factor.

---

## Solution: Three independent policy flags + DB-enforced ADM activity

| Flag | Default | Controls |
|------|---------|----------|
| `work_order_required` | `true` | **Eligibility**: Must have approved WO to appear in dropdown and pass DB trigger |
| `activity_required` | `true` | **Classification**: Must select an activity code when logging time |
| `is_internal` | `false` | **Visibility**: Visible to ALL active staff (not just assigned team) |

These are independent dimensions -- any combination is valid.

### Why Option B (hidden default activity, NOT nullable `activity_id`)

The unique index `idx_time_entries_unique_entry` includes `activity_id`. In PostgreSQL, NULLs are treated as distinct in unique indexes, meaning two entries with NULL `activity_id` for the same staff/engagement/date/forecast would BOTH be allowed -- breaking deduplication. Keeping `activity_id` NOT NULL and using a system "ADM" activity code is safer.

---

## Phase 1: Database Migration (Single SQL File)

### 1A. Add policy columns to `engagements`

```sql
ALTER TABLE public.engagements
  ADD COLUMN work_order_required boolean NOT NULL DEFAULT true,
  ADD COLUMN activity_required boolean NOT NULL DEFAULT true,
  ADD COLUMN is_internal boolean NOT NULL DEFAULT false;
```

### 1B. Upsert system "ADM" activity code (self-healing)

```sql
INSERT INTO public.activity_codes (activity_code, description, is_active)
VALUES ('ADM', 'Administrative', true)
ON CONFLICT (activity_code) DO UPDATE
  SET is_active = true, description = EXCLUDED.description;
```

If ADM exists but was deactivated or renamed, this repairs it.

### 1C. Store ADM activity ID in `global_settings` (self-healing + fail-loud)

```sql
DO $$
DECLARE
  v_adm_id uuid;
BEGIN
  SELECT activity_id INTO v_adm_id
  FROM public.activity_codes WHERE activity_code = 'ADM';

  IF v_adm_id IS NULL THEN
    RAISE EXCEPTION 'ADM activity code not found -- migration cannot proceed';
  END IF;

  INSERT INTO public.global_settings (setting_key, setting_value, description)
  VALUES (
    'ADM_ACTIVITY_ID',
    v_adm_id::text,
    'System activity ID for non-chargeable engagements (auto-assigned by trigger)'
  )
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value;
END $$;
```

This guarantees the setting is never NULL or stale. If ADM somehow doesn't exist, the migration fails loudly.

### 1D. Update `check_wo_approved()` -- preserve exact signature and security attributes

```sql
CREATE OR REPLACE FUNCTION public.check_wo_approved()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_wo_required boolean;
BEGIN
  -- Check if engagement requires a Work Order
  SELECT work_order_required INTO v_wo_required
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  -- Non-WO-required engagements bypass the check
  IF v_wo_required IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- Original WO approval check (unchanged)
  IF NOT EXISTS (
    SELECT 1 FROM work_orders wo
    WHERE wo.engagement_id = NEW.engagement_id
    AND wo.approval_status = 'Approved'
  ) THEN
    RAISE EXCEPTION 'Cannot log time: Work Order is not approved';
  END IF;

  RETURN NEW;
END;
$function$;
```

Uses `CREATE OR REPLACE` preserving: same function name, same parameters (none), same return type (`trigger`), same `SECURITY DEFINER`, same `SET search_path`. The existing trigger `enforce_wo_approval` continues to bind to this function with no changes.

Uses `IS DISTINCT FROM true` so that NULL `work_order_required` (impossible with NOT NULL default, but defensive) is treated as "not required."

### 1E. Create `enforce_activity_default()` trigger function + trigger

```sql
CREATE OR REPLACE FUNCTION public.enforce_activity_default()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_activity_required boolean;
  v_raw text;
  v_adm_id uuid;
BEGIN
  -- Check if engagement requires activity selection
  SELECT activity_required INTO v_activity_required
  FROM engagements WHERE engagement_id = NEW.engagement_id;

  -- If activity is required (default), no auto-assignment
  IF v_activity_required IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;

  -- Read ADM activity ID from global_settings
  SELECT setting_value INTO v_raw
  FROM global_settings
  WHERE setting_key = 'ADM_ACTIVITY_ID';

  IF v_raw IS NULL OR TRIM(v_raw) = '' THEN
    RAISE EXCEPTION 'ADM_ACTIVITY_NOT_CONFIGURED';
  END IF;

  v_adm_id := TRIM(v_raw)::uuid;

  -- Force activity to ADM regardless of what was sent
  NEW.activity_id := v_adm_id;
  RETURN NEW;
END;
$function$;

-- Create the trigger (coexists with enforce_wo_approval, enforce_holiday_blocking, update_time_entries_updated_at)
CREATE TRIGGER trg_enforce_activity_default
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_activity_default();
```

When `ADM_ACTIVITY_ID` is missing/empty, raises `ADM_ACTIVITY_NOT_CONFIGURED` -- a clear, diagnosable error rather than a mysterious UUID cast failure.

### 1F. No RLS changes needed

Confirmed: `engagements` SELECT = `true` for all authenticated. `time_entries` INSERT checks `staff_id = get_my_staff_id()` only. Neither blocks internal engagement usage.

---

## Phase 2: Frontend -- New Hook

### 2A. `src/hooks/useAdminActivity.ts` (new file)

New hook in its own file (not in `useHolidays.ts` -- cleaner conceptual separation):

```typescript
export function useAdminActivityId(): string | null
```

Queries `activity_codes` for `activity_code = 'ADM'`, `is_active = true`, using `.single()` (safe because of verified unique constraint `activity_codes_activity_code_key`). `staleTime: 10 * 60 * 1000`.

---

## Phase 3: Frontend -- Modified Files

### 3A. `src/hooks/mutations/useEngagementMutations.ts`

Add `work_order_required`, `activity_required`, `is_internal` to the create and update mutation type signatures (all optional booleans).

### 3B. `src/components/forms/EngagementForm.tsx`

Add a "Timesheet Policy" section after the existing "Team" section (admin-only via `useUserRole`):

- **Work Order Required** -- Switch (default: ON)
- **Activity Required** -- Switch (default: ON)
- **Internal (All Staff)** -- Switch (default: OFF)

Each with translated helper text. Update Zod schema to include three new optional boolean fields. Wire to create/update payloads. For edit mode, populate from engagement data.

The form's Zod schema currently requires `partner_id` and `manager_id` as `.min(1)`. For internal engagements these may not be meaningful but we keep the current validation -- admins can assign themselves. This avoids schema complexity in v5.

### 3C. `src/hooks/useTimesheetWeek.ts` -- Two-filter engagement query (Eligibility + Visibility)

Update `engagementsQuery` to implement eligibility and visibility as independent server-side filters:

**Eligibility (which engagements can appear):**
- Group A: Active engagements with approved WOs (existing logic, unchanged)
- Group B: Active engagements where `work_order_required = false`

**Visibility (who sees Group B engagements) -- applied in the SQL predicate:**
- If `is_internal = true` -- include (visible to all staff)
- Else -- include only if user is assigned (partner_id or manager_id = current staffId) OR user is admin

Implementation: fetch Group B with a single query using `.or()` filter:

```
.eq('work_order_required', false)
.eq('status', 'active')
.or(`is_internal.eq.true,partner_id.eq.${staffId},manager_id.eq.${staffId}`)
```

If user is admin, skip the `.or()` filter (admin sees all).

Merge Group A + Group B, deduplicate by `engagement_id`.

Update the `ApprovedEngagement` interface to include the new fields:
```typescript
activity_required: boolean;
work_order_required: boolean;
is_internal: boolean;
```

Update the select shape to include these three columns.

### 3D. `src/hooks/useApprovedEngagements.ts` -- Same two-filter pattern for Tracker

Same eligibility + visibility merge logic as 3C. Update the `Engagement` type returned to include the new fields.

### 3E. `src/components/timesheet/TimesheetGrid.tsx`

New props: `activityNotRequiredIds?: Set<string>`, `adminActivityId?: string | null`

Changes:

1. **`handleEngagementChange` (line 305)**: When user selects an engagement in `activityNotRequiredIds`, auto-set `activityId` to `adminActivityId` and update the row ID.

2. **Activity selector (lines 620-647)**: Disable/make read-only for rows where engagement is in `activityNotRequiredIds`. Show "ADM - Administrative" as selected value.

3. **`isDisabled` logic (line 656-657)**: Update to not require `activityId` when engagement is activity-not-required:
   ```
   const isActivityNotRequired = activityNotRequiredIds?.has(row.engagementId);
   const isDisabled = isLocked || isDayLockedByHire || isHolidayBlocked
     || !row.engagementId || (!row.activityId && !isActivityNotRequired);
   ```

4. **UI guard when `adminActivityId` is null**: If `activityNotRequiredIds` has entries but `adminActivityId` is null, disable hours input for those rows and show a toast (`ADM_ACTIVITY_NOT_CONFIGURED` i18n key) when user attempts to type. This prevents mystery DB failures.

5. **Save logic (lines 398-401, 410)**: For activity-not-required engagements, use `adminActivityId` as the `activityId`. The DB trigger also enforces this as a safety net.

6. **Batch save (lines 183-184)**: Same guard -- use `adminActivityId` when `activityNotRequiredIds` contains the row's engagement.

### 3F. `src/pages/TimeSheet.tsx`

- Import `useAdminActivityId()` from new hook
- Compute `activityNotRequiredIds` set from engagements data (filter where `activity_required === false`)
- Pass `activityNotRequiredIds` and `adminActivityId` to `TimesheetGrid`

### 3G. `src/components/tracker/TrackerBar.tsx`

When selected engagement has `activity_required === false`:
- Auto-select ADM activity via `onActivityChange(adminActivityId)`
- Disable activity dropdown (show "ADM - Administrative")
- If `adminActivityId` is null, disable the Start button and show alert

Requires engagement data from `useApprovedEngagements` to include `activity_required` field (done in 3D).

### 3H. `src/components/tracker/ManualEntryDialog.tsx`

Same pattern as 3G:
- When selected engagement has `activity_required === false`, auto-select ADM activity and disable activity dropdown
- If `adminActivityId` is null, disable submit button
- Update `canSubmit` logic: allow submission when activity is auto-assigned

### 3I. `src/pages/Engagements.tsx` -- Show "Internal" badge

Add an "Internal" badge column/indicator for engagements where `is_internal = true`. Uses the existing `useEngagements()` hook (which fetches `*` so the new columns are included automatically via Supabase types refresh).

### 3J. `src/lib/timesheetErrors.ts`

Add new error code:
```typescript
ADM_ACTIVITY_NOT_CONFIGURED: "System ADM activity is not configured. Contact an administrator.",
```

### 3K. i18n Keys (`en.json` and `es.json`)

| Key | English | Spanish |
|-----|---------|---------|
| `engagement.workOrderRequired` | Work Order Required | Requiere Orden de Trabajo |
| `engagement.workOrderRequiredHelp` | When off, appears in timesheets without a Work Order | Cuando esta desactivado, aparece en planillas sin Orden de Trabajo |
| `engagement.activityRequired` | Activity Required | Requiere Actividad |
| `engagement.activityRequiredHelp` | When off, the ADM activity code is auto-assigned | Cuando esta desactivado, se asigna el codigo ADM automaticamente |
| `engagement.isInternal` | Internal (All Staff) | Interno (Todo el Personal) |
| `engagement.isInternalHelp` | All active staff can log time against this engagement | Todo el personal activo puede registrar tiempo en este encargo |
| `engagement.internal` | Internal | Interno |
| `engagement.timesheetPolicy` | Timesheet Policy | Politica de Planilla |
| `timesheet.admActivityNotConfigured` | System ADM activity is not configured. Contact an administrator. | La actividad ADM del sistema no esta configurada. Contacte al administrador. |

---

## Phase 4: Documentation

Append implementation details to `docs/CHANGELOG-2026-02-17.md`.

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/` (new) | CREATE | Add 3 columns, ADM activity upsert, ADM_ACTIVITY_ID setting upsert (fail-loud), update `check_wo_approved` preserving signature, create `enforce_activity_default` |
| `src/hooks/useAdminActivity.ts` | CREATE | `useAdminActivityId()` hook |
| `src/hooks/mutations/useEngagementMutations.ts` | MODIFY | Add new fields to type signatures |
| `src/components/forms/EngagementForm.tsx` | MODIFY | Add policy toggles section |
| `src/hooks/useTimesheetWeek.ts` | MODIFY | Two-filter query (eligibility + visibility in SQL predicate) with new fields in select |
| `src/hooks/useApprovedEngagements.ts` | MODIFY | Same two-filter pattern for tracker |
| `src/components/timesheet/TimesheetGrid.tsx` | MODIFY | Auto-assign ADM, disable activity selector, UI guard when `adminActivityId` null |
| `src/pages/TimeSheet.tsx` | MODIFY | Pass `activityNotRequiredIds` + `adminActivityId` |
| `src/components/tracker/TrackerBar.tsx` | MODIFY | Handle activity-not-required engagements + null guard |
| `src/components/tracker/ManualEntryDialog.tsx` | MODIFY | Handle activity-not-required engagements + null guard |
| `src/pages/Engagements.tsx` | MODIFY | Show Internal badge |
| `src/lib/timesheetErrors.ts` | MODIFY | Add `ADM_ACTIVITY_NOT_CONFIGURED` code |
| `src/locales/en.json` | MODIFY | Add i18n keys |
| `src/locales/es.json` | MODIFY | Add i18n keys |
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append implementation entry |

---

## Post-Implementation Configuration

Admin edits "ADM_01 Feriados" engagement and sets:
- Work Order Required: OFF
- Activity Required: OFF
- Internal (All Staff): ON

This immediately makes it visible and usable by all staff without a WO and without activity selection.

---

## Codex Compliance Checklist (v5 vs v4 deltas)

| Codex Requirement | v4 Status | v5 Fix |
|-------------------|-----------|--------|
| Preserve `check_wo_approved` signature/security | Not explicit | `CREATE OR REPLACE` preserving `SECURITY DEFINER`, `SET search_path`, same name/params/return |
| ADM_ACTIVITY_ID guaranteed non-null at migration | `ON CONFLICT DO NOTHING` risk | DO block with explicit NULL check + `RAISE EXCEPTION` |
| Visibility filter in SQL predicate (not JS) | Fetch all Group B, filter client-side | `.or()` filter in query predicate (server-side) |
| UI guard when `adminActivityId` is null | Not addressed | Disable hours input + toast for affected rows in TimesheetGrid, TrackerBar, ManualEntryDialog |
| `useAdminActivityId()` in separate file | In `useHolidays.ts` | New `src/hooks/useAdminActivity.ts` |
| `nonChargeableEngagementIds` renamed | Done in v4 | `activityNotRequiredIds` (kept) |
| ADM upsert self-healing | `ON CONFLICT DO NOTHING` | `ON CONFLICT DO UPDATE SET is_active=true, description=EXCLUDED.description` |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Existing engagements affected | All three flags default to current behavior (true/true/false) -- zero regression |
| ADM activity deleted by admin | DB trigger fails with clear `ADM_ACTIVITY_NOT_CONFIGURED`; UI proactively disables input |
| ADM_ACTIVITY_ID setting stale/null | Self-healing upsert in migration; fail-loud DO block; trigger validates at runtime |
| Unique index with ADM activity | `activity_id` stays NOT NULL; ADM provides a real value |
| Non-WO engagement accidentally visible to all | Only if `is_internal=true`; `work_order_required=false` alone does NOT grant visibility to unassigned staff (visibility filter in SQL) |
| Trigger ordering on `time_entries` | Four triggers coexist independently (`enforce_wo_approval`, `enforce_holiday_blocking`, `trg_enforce_activity_default`, `update_time_entries_updated_at`); no ordering dependency |
| `check_wo_approved` signature drift | Explicitly preserves `SECURITY DEFINER` + `SET search_path TO 'public'` via `CREATE OR REPLACE` |
| UI allows typing before ADM loads | `adminActivityId === null` guard disables input; toast explains |

