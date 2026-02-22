# Plan_0222-TESTFIX_v3: Fix 7 Remaining Test Failures (Hardened)

## Overview

Test-only fixes for 7 pre-existing failures across 5 files. Zero production code changes. Incorporates all CODEX amendments (AMEND-01 through AMEND-05) plus hardening changes (HC-01 through HC-04).

---

## FAIL-01: `src/lib/__tests__/error-handler.test.ts` (lines 96-100)

**Root cause:** Source code (line 72) maps `23505` to `ErrorCode.DB_DUPLICATE_KEY`. Test asserts `DB_CONSTRAINT`.

**Fix:** Update assertion and rename test description.

```typescript
// Before (lines 96-100):
it("parses PostgreSQL constraint violations", () => {
  const error = { code: "23505", message: "Unique violation" };
  const result = handleError(error, { showToast: false });
  expect(result.code).toBe(ErrorCode.DB_CONSTRAINT);
});

// After:
it("parses PostgreSQL 23505 as duplicate key", () => {
  const error = { code: "23505", message: "Unique violation" };
  const result = handleError(error, { showToast: false });
  expect(result.code).toBe(ErrorCode.DB_DUPLICATE_KEY);
});
```

---

## FAIL-02: `src/hooks/__tests__/useAuth.test.tsx` (lines 8-23)

**Root cause:** `signIn` (lines 78-82) queries `supabase.from('staff').select('is_active').eq('auth_user_id', userId).maybeSingle()`, then conditionally `supabase.from('user_roles')` (lines 91-96). The test mock has no `from` property.

**Fix (HC-04 verified):** Add `from` at the root level of the supabase mock (same level as `auth` and `functions`), with table-name branching:

```typescript
// Add at line 9, after signOut/updateUser/resetPasswordForEmail and before closing brace:
from: vi.fn((table: string) => {
  if (table === 'staff') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { is_active: true },
            error: null,
          }),
        }),
      }),
    } as any;
  }
  if (table === 'user_roles') {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    } as any;
  }
  throw new Error(`Unexpected table in useAuth test: ${table}`);
}),
```

Placement: inside the `supabase` object at lines 9-22, alongside `auth` and `functions`.

---

## FAIL-04: `src/hooks/__tests__/useCurrentStaff.test.tsx` (lines 111-117)

**Root cause:** When primary lookup returns `null`, the hook (lines 46-63) runs a fallback: `.from('staff').select(...).eq('email', ...).is('auth_user_id', null).maybeSingle()`. The test mock lacks `.is()` support.

**Fix:** Use `mockReturnValueOnce` twice -- first call for primary lookup (returns null), second call for fallback with `.is()` in chain (also returns null).

```typescript
// Replace lines 111-117:
const primaryMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const fallbackMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mocked(supabase.from)
  .mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: primaryMaybeSingle }),
    }),
  } as any)
  .mockReturnValueOnce({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({ maybeSingle: fallbackMaybeSingle }),
      }),
    }),
  } as any);
```

---

## FAIL-05: `src/hooks/mutations/__tests__/useStaffMutations.test.tsx` (lines 114-132)

**Root cause:** `useDeleteStaff` (lines 118-166 in source) checks 4 dependency tables before deleting. Three use `.select().eq().limit(1)`, `engagements` uses `.select().or(...).limit(1)`. Test only mocks `delete().eq()`.

**Fix (HC-01 + HC-02):** Replace with table-branching mock. Keep named references for strong assertions. Add `afterEach` mock reset.

```typescript
describe("useDeleteStaff", () => {
  afterEach(() => {
    vi.mocked(supabase.from).mockReset();  // HC-02: prevent leakage
  });

  it("should delete a staff member by id (hard delete, no dependencies)", async () => {
    const mockDeleteEq = vi.fn().mockResolvedValue({ error: null });  // HC-01: named ref
    const mockDeleteFn = vi.fn().mockReturnValue({ eq: mockDeleteEq });

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (["time_entries", "timer_entries", "timesheet_periods", "engagements"].includes(table)) {
        const base = { limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(base),
            or: vi.fn().mockReturnValue(base),
          }),
        } as any;
      }
      if (table === "staff") {
        return {
          delete: mockDeleteFn,
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        } as any;
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const { result } = renderHook(() => useDeleteStaff(), {
      wrapper: createWrapper(),
    });

    result.current.mutate("staff-123");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledWith("staff");
    expect(mockDeleteEq).toHaveBeenCalledWith("staff_id", "staff-123");  // HC-01: strong assertion
    expect(toast.success).toHaveBeenCalled();
  });
});
```

---

## FAIL-06, FAIL-07, FAIL-08: `src/hooks/__tests__/useLanguage.test.tsx`

**Root cause:** Inline `vi.mock("react-i18next", ...)` at line 74 is hoisted by Vitest, corrupting mock state for all tests. The "does not change language" test also lacks a real assertion.

**Fix (HC-03):** Rewrite mock infrastructure with mutable `mockLanguage` variable. Add explicit `mockChangeLanguage.mockClear()` in `beforeEach`. Add `expect(mockChangeLanguage).not.toHaveBeenCalled()` assertion.

Full replacement of the file's mock and test structure:

```typescript
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLanguage } from "../useLanguage";

// Mutable language state for controlling i18n.language per-test
let mockLanguage = "en";
const mockChangeLanguage = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      get language() { return mockLanguage; },
      changeLanguage: mockChangeLanguage,
    },
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: vi.fn(),
}));

import { useGlobalSettings } from "@/hooks/useEmsData";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useLanguage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLanguage = "en";
    mockChangeLanguage.mockClear();  // HC-03: explicit intent
  });

  // ... all 5 tests remain, with line 72-97 replaced:

  it("does not change language if already matches", () => {
    mockLanguage = "es";  // Simulates i18n already set to "es"

    vi.mocked(useGlobalSettings).mockReturnValue({
      data: [
        { setting_key: "LANGUAGE", setting_value: "es", description: null },
      ],
      isLoading: false,
    } as any);

    renderHook(() => useLanguage(), { wrapper: createWrapper() });

    expect(mockChangeLanguage).not.toHaveBeenCalled();  // Real assertion
  });

  // Other 4 tests unchanged (returns current language, syncs language,
  // exposes changeLanguage, handles missing setting)
});
```

---

## Files to Modify


| File                                                       | Fix IDs               | Key Change                                                                             |
| ---------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `src/lib/__tests__/error-handler.test.ts`                  | FAIL-01               | Line 96-100: assertion `DB_CONSTRAINT` to `DB_DUPLICATE_KEY`                           |
| `src/hooks/__tests__/useAuth.test.tsx`                     | FAIL-02, HC-04        | Lines 8-23: add `from()` at root level with staff/user_roles branching                 |
| `src/hooks/__tests__/useCurrentStaff.test.tsx`             | FAIL-04               | Lines 111-117: two-call mock with `.is()` for fallback path                            |
| `src/hooks/mutations/__tests__/useStaffMutations.test.tsx` | FAIL-05, HC-01, HC-02 | Lines 114-132: table-branching mock, named refs for strong assertions, afterEach reset |
| `src/hooks/__tests__/useLanguage.test.tsx`                 | FAIL-06/07/08, HC-03  | Full mock rewrite: mutable `mockLanguage`, explicit `mockClear`, real assertion        |


---

Please document the implementation of this PLAN by appending it to the [CHANGELOG-2026-02-2.md](http://CHANGELOG-2026-02-2.md) file In the Codebase.

&nbsp;

## Constraints

- Zero production code changes (test-only)
- No inline `vi.mock` re-declarations inside individual tests
- All mocks match actual hook code paths
- Named mock references for strong argument assertions (HC-01)
- Mock reset in afterEach to prevent leakage (HC-02)
- Explicit mockClear for intent clarity (HC-03)
- `from` placed at supabase root level (HC-04)

## Acceptance Criteria


| Criterion                           | Target   |
| ----------------------------------- | -------- |
| FAIL-01 through FAIL-08 all pass    | Green    |
| All 21 session tests remain passing | Green    |
| Full suite: 0 failures              | Green    |
| Only test files changed             | Verified |
