

# Plan: Tracker Engagement Selector — Exclude Internal Engagements (Bug 0220-52) v5

**Bug ID:** 0220-52 | **Priority:** Baja | **Route:** OPERACIONES - Registros de Tiempo

---

## 1) Problem

In the Stopwatch (Tracker) engagement dropdown, internal/administrative engagements (e.g., "Administracion", "Feriados") appear alongside client engagements. Users should only see active, non-internal (client) engagements when recording time with the stopwatch.

---

## 2) Root Cause

`src/hooks/useApprovedEngagements.ts` fetches two groups and merges them:

- **Group A** (engagements with approved Work Orders): Filters `status = 'active'` but has NO `is_internal` filter.
- **Group B** (engagements where `work_order_required = false`): Filters `status = 'active'` and the non-admin visibility `.or()` clause explicitly includes `is_internal.eq.true`.

Both groups merge via a `Map` keyed on `engagement_id`, so internal engagements reach the tracker dropdown.

Additionally, `TrackerRecord.handleStart` does not validate the selected `engagementId` against the filtered list before calling the `start_timer_entry` RPC.

---

## 3) Behavioral Contract

### Tracker Eligibility Invariant (all roles: admin and non-admin)

| `status` | `is_internal` | Eligible for Tracker? |
|---|---|---|
| `'active'` | `false` | YES (if WO approved OR `work_order_required = false`) |
| `'active'` | `true` | NO |
| Any other status | `false` | NO |
| Any other status | `true` | NO |

### Stale/Injected Engagement ID Policy

| Scenario | Outcome | UX |
|---|---|---|
| Engagement becomes ineligible between select and Start click | `handleStart` guard rejects; RPC NOT called | `tracker.engagementNotEligible` toast |
| React state holds ID not in filtered list | `canStart` in TrackerBar is `false` (button disabled); `handleStart` guard as fallback | Button disabled; fallback toast |
| ID injected via devtools | `handleStart` guard rejects | `tracker.engagementNotEligible` toast |

---

## 4) Architecture Decision -- Frontend-Only Enforcement

**Decision**: Frontend-only enforcement. No RPC/database modification.

**Single Start Call Path** (verified via `rg -n "useStartTimerRPC|start_timer_entry" src`):

| File | Usage |
|---|---|
| `src/hooks/useTimerEntries.ts` | Defines `useStartTimerRPC` (wraps `supabase.rpc('start_timer_entry', ...)`) |
| `src/pages/TrackerRecord.tsx` | Only consumer: `startRPC.mutateAsync(...)` inside `handleStart` |
| `src/integrations/supabase/types.ts` | Type definition only |

**Implementation must produce evidence artifact**: After implementation, execute `rg -n "useStartTimerRPC|start_timer_entry" src` and confirm exactly these three files appear with no additional call sites.

**Guard chain on the single start path**:

| # | Guard | Location | Type |
|---|---|---|---|
| G1 | `canStart` boolean (includes `isEngagementApproved` check at TrackerBar line 68) | `TrackerBar` component | UI disable -- button `disabled={!canStart}` |
| G2 | `!tracker.engagementId \|\| !tracker.activityId` early return | `TrackerRecord.handleStart` function | Null guard |
| G3 | **NEW**: `approvedEngagements.some(e => e.engagement_id === tracker.engagementId)` | `TrackerRecord.handleStart` function | Eligibility guard |

---

## 5) State Transitions and Race Handling

### Selection-to-Start State Machine

```text
State A: No engagement selected
  -> User selects from dropdown -> State B

State B: Engagement selected (in eligible list)
  -> User clicks Start -> Guard chain: G2 -> G3 -> weekend -> daily-limit -> RPC
  -> State C (running) on success

State C: Timer running
  -> Dropdown disabled; Save/Cancel/Delete available
```

### Race Condition Matrix

| Race | Trigger | Outcome | UX |
|---|---|---|---|
| R1: Engagement deactivated between select and Start | Admin sets `status != 'active'` | TanStack Query refetches. Fast: `canStart=false`, button disabled. Slow: G3 rejects. | Button disabled OR toast |
| R2: Engagement becomes internal between select and Start | Admin sets `is_internal=true` | Same as R1 | Same as R1 |
| R3: WO approval revoked between select and Start | Admin changes WO to Draft | Engagement drops from Group A on refetch; same resolution | Same as R1 |
| R4: Concurrent timer already running | Another tab started timer | RPC returns `RUNNING_TIMER_EXISTS` | `tracker.timerAlreadyRunning` toast (existing) |

All outcomes are deterministic: disabled button or clear toast. No silent failures.

---

## 6) File-by-File Changes

| # | File | Action | Side Effects | Compatibility Risks |
|---|------|--------|-------------|-------------------|
| 1 | `src/hooks/useApprovedEngagements.ts` | Modify | Fewer engagements returned | None; consumed by TrackerBar and (new) TrackerRecord via same queryKey -- TanStack deduplicates |
| 2 | `src/pages/TrackerRecord.tsx` | Modify | New import + hook call + guard in `handleStart` | None; additive only |
| 3 | `src/locales/en.json` | Modify | Add 1 key in `tracker` block | None |
| 4 | `src/locales/es.json` | Modify | Add 1 key in `tracker` block | None |
| 5 | `src/hooks/__tests__/useApprovedEngagements.test.tsx` | Create | New test file (8 tests) | None |
| 6 | `src/pages/__tests__/TrackerRecord.start-guard.test.tsx` | Create | New test file (4 tests) | None |
| 7 | `docs/CHANGELOG-2026-02-22.md` | Modify | Append entry at end of file | None |

No changes to: `src/hooks/useTimesheetWeek.ts`, `src/components/tracker/TrackerBar.tsx`, `src/hooks/useTimerEntries.ts`, or any RPC/database objects.

---

## 7) Implementation Details

### 7a. `src/hooks/useApprovedEngagements.ts`

**Group A** -- add `is_internal` filter after `.eq("status", "active")` in the Group A engagement query:

```typescript
// BEFORE:
.in("engagement_id", approvedIds)
.eq("status", "active")
.order("created_at", { ascending: false });

// AFTER:
.in("engagement_id", approvedIds)
.eq("status", "active")
.eq("is_internal", false)
.order("created_at", { ascending: false });
```

**Group B base query** -- add `is_internal` filter after `.eq("status", "active")` in the `groupBQuery` builder:

```typescript
// BEFORE:
.eq("work_order_required", false)
.eq("status", "active")
.order("created_at", { ascending: false });

// AFTER:
.eq("work_order_required", false)
.eq("status", "active")
.eq("is_internal", false)
.order("created_at", { ascending: false });
```

**Group B non-admin visibility `.or()` clause** -- remove `is_internal.eq.true` branch inside the `if (!isAdmin && myStaffId)` block:

```typescript
// BEFORE:
groupBQuery = groupBQuery.or(
  `is_internal.eq.true,partner_id.eq.${myStaffId},manager_id.eq.${myStaffId}`
);

// AFTER:
groupBQuery = groupBQuery.or(
  `partner_id.eq.${myStaffId},manager_id.eq.${myStaffId}`
);
```

Merge/dedup `Map` logic remains unchanged.

### 7b. `src/pages/TrackerRecord.tsx`

**Add import** at top of file:

```typescript
import { useApprovedEngagements } from "@/hooks/useApprovedEngagements";
```

**Add hook call** after `useGlobalSettings()`:

```typescript
const { data: approvedEngagements = [] } = useApprovedEngagements();
```

**Add eligibility guard** in `handleStart`, immediately after the existing null-check `if (!tracker.engagementId || !tracker.activityId) return;`:

```typescript
// Defensive: verify engagement is in the eligible list
const isEligible = approvedEngagements.some(
  (e) => e.engagement_id === tracker.engagementId
);
if (!isEligible) {
  toast.error(t("tracker.engagementNotEligible"));
  return;
}
```

All subsequent logic in `handleStart` (weekend check, daily limit check, RPC call) remains unchanged.

### 7c. Locale Strings

**`src/locales/en.json`** -- add inside `"tracker"` object:

```json
"engagementNotEligible": "Selected engagement is no longer eligible. Please choose a valid engagement."
```

**`src/locales/es.json`** -- add inside `"tracker"` object:

```json
"engagementNotEligible": "El encargo seleccionado ya no es elegible. Por favor seleccione un encargo válido."
```

---

## 8) Test Strategy

### Automated Tests

**New file: `src/hooks/__tests__/useApprovedEngagements.test.tsx`** (8 tests)

| # | Test Name | Scenario | Assertion |
|---|-----------|----------|-----------|
| T1 | excludes internal engagements from Group A | WO approved for internal engagement (`is_internal=true`, `status='active'`) | NOT in returned list |
| T2 | excludes internal engagements from Group B | Internal engagement with `work_order_required=false` | NOT in returned list |
| T3 | includes active client engagement from Group A | WO approved for client engagement (`is_internal=false`, `status='active'`) | IS in returned list |
| T4 | includes active client engagement from Group B | Client engagement with `work_order_required=false`, `is_internal=false` | IS in returned list |
| T5 | deduplicates across groups | Same engagement in both Group A and B | Appears exactly once |
| T6 | non-admin visibility restricted to partner/manager | `is_admin=false`, engagement not internal, user neither partner nor manager | NOT in returned list |
| T7 | returns empty array when no eligible engagements | All engagements internal or closed | Returns `[]` |
| T8 | excludes closed/inactive engagements | Engagement with `status='closed'`, `is_internal=false`, has approved WO | NOT in returned list |

**New file: `src/pages/__tests__/TrackerRecord.start-guard.test.tsx`** (4 tests)

| # | Test Name | Scenario | Assertion |
|---|-----------|----------|-----------|
| TA | stale/injected engagementId blocks start | `tracker.engagementId` set to ID NOT in `useApprovedEngagements` result | `toast.error` called with `tracker.engagementNotEligible`; `startRPC.mutateAsync` NOT called |
| TB | valid eligible engagementId starts timer | `tracker.engagementId` IS in `useApprovedEngagements` result | `startRPC.mutateAsync` called once |
| TC | Start button disabled when engagement not in list | Render TrackerBar with `engagementId` not in approved list | Start button has `disabled` attribute |
| TD | race: eligibility changes between select and start | Mock `useApprovedEngagements` to return list without the selected ID mid-flow | `toast.error` called with `tracker.engagementNotEligible`; `startRPC.mutateAsync` NOT called |

### Test Matrix Coverage

| Dimension | Covered By |
|---|---|
| Admin role | T3, T4, T5 |
| Non-admin role | T6 |
| Empty eligible set | T7 |
| Dedup case | T5 |
| Internal exclusion | T1, T2 |
| Closed/inactive exclusion | T8 |
| Valid client inclusion | T3, T4 |
| Stale/invalid ID blocked, RPC not called | TA, TD |
| Valid ID calls RPC | TB |
| UI Start button disabled for ineligible engagement | TC |
| Race path: eligibility changed between select and start | TD |

### Evidence Requirements

After implementation, execute and capture output of:
```
rg -n "useStartTimerRPC|start_timer_entry" src
```
Confirm exactly three files appear:
1. `src/hooks/useTimerEntries.ts` -- definition
2. `src/pages/TrackerRecord.tsx` -- only consumer
3. `src/integrations/supabase/types.ts` -- type only

### Manual Verification

1. Open Tracker > New Entry. Confirm internal engagements (e.g., "ADM", "Feriados") do NOT appear in dropdown.
2. Select a valid client engagement with approved WO. Start, run, save. Confirm normal flow.
3. Open Timesheet grid. Confirm internal engagements still appear for time entry.

---

## 9) Risk Analysis and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Running timer against internal engagement at deploy time | Low | None | Existing DB rows unaffected. Save/stop uses `timer_id`, not engagement eligibility. Only NEW sessions filtered. |
| `is_internal` column has NULL values | None | N/A | Column is `NOT NULL DEFAULT false`. |
| Group B returns empty for non-admin after removing `is_internal.eq.true` | Expected for users with no client engagements | Low | Existing `noApprovedEngagements` alert in TrackerBar handles empty state (TrackerBar line 81-86). |
| `useApprovedEngagements` called twice (TrackerBar + TrackerRecord) | None | None | Same `queryKey` (`approved-engagements-for-tracker`); TanStack Query deduplicates. Single network request. |
| Timesheet regression | None | N/A | `useTimesheetWeek.ts` not modified. Separate query path with its own engagement visibility logic. Bug 0220-51 test suite validates timesheet mutations independently. |
| Frontend-only guard bypassed via devtools | Very Low | Low | RPC validates staff identity via `auth.uid()`; `timer_entries` RLS restricts to own staff. |

---

## 10) Rollback Plan

### Steps

1. **Revert commit**: `git revert <commit-hash>` (single commit containing all 7 file changes).
2. **Redeploy**: Push revert commit; Lovable auto-deploys.
3. **No database rollback needed**: Zero database/RPC changes.

### Post-Rollback Verification

1. Confirm `useApprovedEngagements.ts` no longer contains `.eq("is_internal", false)`.
2. Confirm `TrackerRecord.tsx` no longer imports `useApprovedEngagements`.
3. Open Tracker stopwatch; verify internal engagements reappear in dropdown.
4. Run Bug 0220-51 + 0220-64 test suites to confirm no regression.

---

## 11) Definition of Done

- [ ] `useApprovedEngagements` Group A query includes `.eq("is_internal", false)`
- [ ] `useApprovedEngagements` Group B query includes `.eq("is_internal", false)`
- [ ] Group B visibility `.or()` clause no longer contains `is_internal.eq.true`
- [ ] Merge/dedup `Map` logic unchanged
- [ ] `TrackerRecord.handleStart` validates `engagementId` against filtered `approvedEngagements` list before calling start RPC
- [ ] Invalid/stale engagement ID shows `tracker.engagementNotEligible` toast and does NOT call RPC
- [ ] i18n keys added: `tracker.engagementNotEligible` in `en.json` and `es.json` (Spanish uses `válido` with accent)
- [ ] Tracker dropdown shows only active, non-internal engagements for all roles
- [ ] Empty state alert shown when no eligible engagements exist
- [ ] Timesheet grid unchanged -- still supports internal engagements
- [ ] `src/hooks/__tests__/useApprovedEngagements.test.tsx` created with 8 tests (T1-T8), all passing
- [ ] `src/pages/__tests__/TrackerRecord.start-guard.test.tsx` created with 4 tests (TA-TD), all passing
- [ ] Evidence artifact produced: `rg -n "useStartTimerRPC|start_timer_entry" src` output confirms exactly one start call path
- [ ] Changelog entry appended at end of `docs/CHANGELOG-2026-02-22.md`

---

## 12) Changelog Entry

**Target file**: `docs/CHANGELOG-2026-02-22.md`
**Insertion location**: Append at end of file, following existing heading style.

```text

---

### Bug 0220-52: Tracker Engagement Selector Excludes Internal Engagements

**Plan**: Plan_0220-52_v5
**Priority**: Baja
**Route**: OPERACIONES - Registros de Tiempo

- **Problem**: Internal/administrative engagements appeared in the Tracker stopwatch engagement dropdown.
- **Root Cause**: `useApprovedEngagements.ts` had no `is_internal` filter on either query group. Group B visibility clause explicitly included `is_internal.eq.true`.
- **Fix**:
  - Added `.eq("is_internal", false)` to Group A and Group B queries in `useApprovedEngagements.ts`.
  - Removed `is_internal.eq.true` branch from Group B visibility `.or()` clause.
  - Added defensive runtime guard in `TrackerRecord.handleStart`: rejects stale/invalid engagement IDs with `tracker.engagementNotEligible` toast before calling start RPC.
  - Added i18n keys `tracker.engagementNotEligible` (en/es).
- **Unchanged**: Timesheet grid (`useTimesheetWeek.ts`) unmodified; internal engagements remain available there. No database/RPC changes. No data migration. `TrackerBar.tsx` unchanged.
- **Tests**:
  - 8 hook tests (`src/hooks/__tests__/useApprovedEngagements.test.tsx`): Group A/B filtering, internal exclusion, closed/inactive exclusion, visibility clause, dedup, admin vs non-admin, empty set.
  - 4 integration tests (`src/pages/__tests__/TrackerRecord.start-guard.test.tsx`): stale ID blocked, valid ID calls RPC, UI button disabled for ineligible, race path rejection.
```

