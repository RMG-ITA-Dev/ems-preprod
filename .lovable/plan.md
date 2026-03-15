

# Plan — Fix 3 Failing Test Suites in CI

## What is `test.yml`?

The GitHub Actions workflow (`.github/workflows/test.yml`) runs automatically on every push/PR. It does three things:

1. **Runs all Vitest tests** with coverage
2. **Guards against deprecated `DAILY_LIMIT`/`WEEKLY_LIMIT`** string literals in runtime code (enforcing the min/max migration)
3. **Guards against UTC date parsing bugs** — ensures `parseDateLocal()` is used for date-only DB fields

This is standard CI (Continuous Integration) — it catches regressions before they reach production. You need it because without it, bugs like the timezone date-shift issue (BUG 0220-59) or accidental use of old setting keys could silently reappear.

## Why Tests Are Failing

Three test files have issues. Here's each problem and fix:

---

### Fix 1: `src/lib/__tests__/timesheetUtils.test.ts` — Wrong `weekNumber` expectation

**Problem:** Test expects `weekNumber` to be `2` (calendar week), but `getWeekInfo` calls `getFiscalWeekNumber` which uses fiscal year (Oct 1 start). Jan 8 2024 is fiscal week ~15, not 2.

**Fix:** Change the assertion on line 101 to match fiscal week numbering. Calculate: FY2024 anchor is Oct 2, 2023 (Monday). Jan 8 is 14 weeks later → fiscal week 15.

```typescript
// Line 101 — change:
expect(info.weekNumber).toBe(2);
// to:
expect(info.weekNumber).toBe(15);
```

---

### Fix 2: `src/pages/__tests__/Settings.global-focus-cancel.test.tsx` — Missing QueryClientProvider

**Problem:** `Settings` component calls `useQueryClient()` at line 51, but the test renders it without a `QueryClientProvider` wrapper.

**Fix:** Wrap renders with `QueryClientProvider`. Use the existing test utility from `src/test/utils.tsx` or add inline:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// In the describe block:
let queryClient: QueryClient;
beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

// Replace all render(<Settings />) with:
render(
  <QueryClientProvider client={queryClient}>
    <Settings />
  </QueryClientProvider>
);
```

All 5 tests in this suite need this wrapper.

---

### Fix 3: `src/pages/__tests__/TrackerRecord.start-guard.test.tsx` — `mockMutateAsync` not called

**Problem:** Test TB expects `mockMutateAsync` to be called once, but the `handleStart` function checks `remainingHours <= 0` before calling `startRPC.mutateAsync`. The mock for `useTimerEntries` returns `data: []` (no entries), and `useRunningTimerEntry` returns `data: null` — so `todayTrackedHours = 0` and `remainingHours = 8`. That part is fine.

The real issue: `handleStart` is an `async` function that calls `await startRPC.mutateAsync(...)`. The mock `useStartTimerRPC` returns `{ mutateAsync: mockMutateAsync }`, but `TrackerRecord` destructures it as `const startRPC = useStartTimerRPC()` then calls `startRPC.mutateAsync(...)`. The mock returns the right shape.

Actually, looking more carefully: the `isWeekend` check — the test runs with real `Date`, and if CI runs on a weekend, `isWeekendToday` would be `true` and `allowWeekendTracking` is `false` (no `ALLOW_WEEKEND_TRACKING` in mock `globalSettings.data: []`), so it would hit `toast.error("tracker.weekendNotAllowed")` and return before calling `mutateAsync`.

**Fix:** Mock the current date to a known weekday using `vi.useFakeTimers()`:

```typescript
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2024, 0, 10)); // Wednesday
  // ... existing setup
});

afterEach(() => {
  vi.useRealTimers();
});
```

Also add `ALLOW_WEEKEND_TRACKING` to the globalSettings mock to be safe:

```typescript
vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: () => ({ data: [
    { setting_key: "DAILY_MAX", setting_value: "8" },
    { setting_key: "ALLOW_WEEKEND_TRACKING", setting_value: "false" },
  ] }),
  useActivityCodes: () => ({
    data: [
      { activity_id: "act-1", activity_code: "AUD", description: "Audit", is_active: true },
    ],
  }),
}));
```

---

## Summary

| File | Problem | Fix |
|---|---|---|
| `timesheetUtils.test.ts` | `weekNumber` assertion uses calendar week, not fiscal | Change `toBe(2)` → `toBe(15)` |
| `Settings.global-focus-cancel.test.tsx` | Missing `QueryClientProvider` | Wrap renders with provider |
| `TrackerRecord.start-guard.test.tsx` | Weekend/date-dependent test fails on weekends in CI | Pin date with `vi.useFakeTimers()` to a weekday |

Three files, minimal changes. No runtime code or backend changes.

