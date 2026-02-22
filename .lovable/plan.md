

# Plan_0222-TEST_v1: Comprehensive Test Suite for Session 260222 Changes

## Scope

This plan covers unit and integration tests for all 7 items implemented during this debugging session:

1. BUG 0220-18: Duplicate Client Name Prevention
2. BUG 0220-45: Deletion of Exported Time Entries in Timesheet
3. Feature: Hours-Only Toggle for Timer Entry Forms
4. Feature 0220-47: Fecha de Salida + Hours Completeness Gate
5. BUG 0220-48: Historical Start Dates for Internal Engagements
6. BUG 0220-49: Encargo Tab Select Crash Fix
7. Feature 0220-50: Pending Hours Indicator (PendingHoursAlert)

---

## Test Infrastructure

The project already has a mature Vitest + React Testing Library setup:
- `vitest.config.ts` with jsdom environment and globals
- `src/test/setup.ts` with mocks for sonner, i18n, and Supabase client
- `src/test/utils.tsx` with `render` wrapper including QueryClientProvider
- Established patterns in `src/hooks/__tests__/` and `src/hooks/mutations/__tests__/`

No infrastructure changes needed -- all new tests follow existing conventions.

---

## Technical Details: New Test Files

### 1. `src/hooks/mutations/__tests__/useClientMutations.test.tsx` -- ADD tests for BUG 0220-18

The existing test file already tests happy-path create/update/delete. Add new tests for the `handleClientError` duplicate-name handling:

```
describe("duplicate client name handling (BUG 0220-18)")
  it("shows duplicateClientName toast on 23505 error with clients_client_legal_name_unique constraint")
  it("shows duplicateNit toast on 23505 error with clients_unique_tax_id_key constraint")
  it("falls back to generic error handler for non-23505 errors")
  it("falls back to generic error handler for 23505 with unknown constraint")
```

These tests mock `supabase.from().insert().select().single()` to reject with structured error objects containing `code: "23505"` and the relevant `constraint` string, then verify the correct `toast.error()` message.

### 2. `src/components/dashboard/__tests__/EngagementSelector.test.tsx` -- NEW file for BUG 0220-49

Tests that the empty-state renders a plain `<div>` instead of a `<SelectItem value="">`:

```
describe("EngagementSelector (BUG 0220-49)")
  it("renders 'no engagements' message as div (not SelectItem) when engagement list is empty")
  it("renders SelectItem elements when engagements exist")
  it("does not crash when switching to Encargo tab with zero engagements")
```

Requires mocking `useCurrentStaff`, `useDashboard`, `useDashboardAccess`, and the Supabase query. Uses `render()` from test utils with a `MemoryRouter` wrapper.

### 3. `src/components/dashboard/__tests__/PendingHoursAlert.test.tsx` -- NEW file for Feature 0220-50

Tests the collapsible pending-hours component:

```
describe("PendingHoursAlert (Feature 0220-50)")
  it("renders nothing when pendingWeeks is empty")
  it("renders nothing while loading")
  it("renders summary card with correct week count and total hours")
  it("shows detail table when expanded with up to 12 weeks")
  it("shows 'and X more' footer when more than 12 weeks exist")
  it("does not show 'and X more' footer when 12 or fewer weeks")
  it("displays 'Go to Timesheet' link pointing to /timesheet")
  it("formats dates according to locale (es vs en)")
  it("computes totalGap correctly from week gaps")
```

Requires mocking `useCurrentStaff` (returning a `staffRecord` with `staff_id`), `supabase.rpc` (returning mock `PendingWeek[]` data), and wrapping in `MemoryRouter` + `QueryClientProvider`.

### 4. `src/components/forms/__tests__/EngagementForm.test.tsx` -- NEW file for BUG 0220-48

Tests the `minStartDate` logic that bypasses date restriction for internal engagements:

```
describe("EngagementForm start date (BUG 0220-48)")
  it("allows historical start dates when is_internal is true")
  it("restricts start date to today or later for non-internal new engagements")
  it("restricts start date to created_at for non-internal edits")
```

This is a focused test on the `minStartDate` useMemo logic. Because `EngagementForm` is a large form component with many dependencies (clients, staff, categories), these tests will mock all data dependencies and verify the calendar disabled-days behavior.

### 5. `src/hooks/__tests__/useTimesheetMutations.test.tsx` -- NEW file for BUG 0220-45

Tests that deletion of exported time entries is handled correctly:

```
describe("useTimesheetMutations (BUG 0220-45)")
  it("allows deletion of time entries that are not exported")
  it("prevents deletion of exported/locked time entries with appropriate error")
```

Mocks the Supabase delete chain and verifies error handling for locked periods.

### 6. DB RPC Test: `get_my_pending_hours` -- SQL-level verification

Since the RPC is the authoritative computation for Feature 0220-50, add a direct SQL test using the `supabase--read-query` tool during implementation to verify:

```
-- Test: Staff with no hire_date returns empty array
SELECT get_my_pending_hours('staff-id-without-hire-date');

-- Test: Staff with all hours filled returns empty array
-- (insert test data, run RPC, verify empty result)

-- Test: Staff with gaps returns correct week_start, expected, actual, gap
-- (insert partial time entries, run RPC, verify JSON output)
```

These will be executed as manual verification queries during implementation, not as automated tests (DB RPCs cannot be unit-tested in jsdom).

---

## Files to Create/Modify

| File | Action | Tests |
|------|--------|-------|
| `src/hooks/mutations/__tests__/useClientMutations.test.tsx` | Modify | Add 4 tests for duplicate constraint handling |
| `src/components/dashboard/__tests__/EngagementSelector.test.tsx` | Create | 3 tests for empty-state rendering |
| `src/components/dashboard/__tests__/PendingHoursAlert.test.tsx` | Create | 9 tests for alert component |
| `src/components/forms/__tests__/EngagementForm.test.tsx` | Create | 3 tests for internal engagement date bypass |
| `src/hooks/__tests__/useTimesheetMutations.test.tsx` | Create | 2 tests for exported entry deletion |
| `docs/CHANGELOG-2026-02-22.md` | Append | Test suite addition entry |

**Total: 21 new automated tests across 5 files**

---

## Mock Patterns (Consistent with Existing Tests)

All tests follow the project's established mock patterns:

```typescript
// Supabase client mock (from setup.ts, extended per test)
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),  // Added for PendingHoursAlert
  },
}));

// Hook mocks (per existing pattern in useUserRole.test.tsx)
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

// react-i18next mock
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => key,
    i18n: { language: "en" },
  }),
}));
```

---

## Execution

After implementation, all tests will be run using the Vitest test runner. The GitHub Actions workflow (`.github/workflows/test.yml`) will also execute them on push.

---

## Acceptance Criteria

| Criterion | Target |
|-----------|--------|
| All 21 new tests pass | Green |
| No regressions in existing tests | Green |
| Coverage for changed files improves | Incremental |
| Each bug fix has at least 1 regression test | Verified |
| DB RPC verified via manual SQL queries | Verified |

