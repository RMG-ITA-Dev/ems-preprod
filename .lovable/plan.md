# Plan v4 -- BUG 0220-59: Engagement Dates Shift -1 Day

## Context

When creating or editing an Engagement and setting start/end dates, the saved dates display as one day earlier than selected. This affects the Engagement list, edit form prefill, and the Client Engagements sub-table.

## Root Cause

`new Date("2026-02-20")` parses as UTC midnight. In UTC-4 (Bolivia), this renders as Feb 19 at 20:00 local, so `format()` outputs the previous day. The project already has `parseDateLocal()` at `src/lib/timesheetUtils.ts:122` that splits "YYYY-MM-DD" into components and constructs a local-midnight Date, avoiding the shift.

## Affected Files


| #   | File                                                | Problem Location | Issue                                           |
| --- | --------------------------------------------------- | ---------------- | ----------------------------------------------- |
| W1  | `src/components/forms/EngagementForm.tsx`           | Lines 163-164    | Edit form hydration uses `new Date()`           |
| W2  | `src/pages/Engagements.tsx`                         | Lines 72, 82     | Main list renders dates with `new Date()`       |
| W3  | `src/components/clients/ClientEngagementsTable.tsx` | Line 169         | Client sub-table `formatDate` uses `new Date()` |
| W4  | `src/lib/timesheetUtils.ts`                         | Lines 118-121    | JSDoc needs mandatory-use warning               |
| W5  | `.github/workflows/test.yml`                        | After line 38    | No guardrail for date-only parsing              |
| W6  | `docs/CHANGELOG-2026-02-24.md`                      | Append           | Changelog entry                                 |


## File-by-File Change Plan

### W1: `src/components/forms/EngagementForm.tsx` -- Edit form hydration

- Add import: `parseDateLocal` from `@/lib/timesheetUtils`
- **Line 163**: `new Date(engagement.start_date)` --> `parseDateLocal(engagement.start_date)`
- **Line 164**: `new Date(engagement.end_date)` --> `parseDateLocal(engagement.end_date)`
- Submit path (lines 208-209) unchanged -- already uses `format(date, "YYYY-MM-DD")` on a local Date from Calendar.
- Do NOT change `created_at` parsing elsewhere -- that is a full timestamp, not date-only.

### W2: `src/pages/Engagements.tsx` -- Main list display

- Add import: `parseDateLocal` from `@/lib/timesheetUtils`
- **Line 72**: `format(new Date(engagement.start_date), "DD/MM/YYYY")` --> `format(parseDateLocal(engagement.start_date), "DD/MM/YYYY")`
- **Line 82**: `format(new Date(engagement.end_date), "DD/MM/YYYY")` --> `format(parseDateLocal(engagement.end_date), "DD/MM/YYYY")`

### W3: `src/components/clients/ClientEngagementsTable.tsx` -- Client sub-table

- Add import: `parseDateLocal` from `@/lib/timesheetUtils`
- **Line 169**: `format(new Date(dateStr), "DD/MM/YYYY")` --> `format(parseDateLocal(dateStr), "DD/MM/YYYY")`

### W4: `src/lib/timesheetUtils.ts` -- Mandatory-use JSDoc

Replace comment block at lines 118-121 with:

```ts
/**
 * Parse "YYYY-MM-DD" as local date, avoiding timezone shift.
 *
 * MANDATORY: All date-only DB columns (Supabase DATE type / "YYYY-MM-DD" strings)
 * MUST use this function. NEVER use new Date(string) for date-only values.
 * Ref: BUG 0220-59 -- new Date("YYYY-MM-DD") interprets as UTC midnight,
 * which becomes the previous day in timezones behind UTC (e.g., Bolivia UTC-4).
 */
```

### W5: `.github/workflows/test.yml` -- CI grep guardrail

Append a new step after line 38 that blocks reintroduction of `new Date()` on date-only engagement fields in non-test source files:

```yaml
      - name: Guard against UTC date parsing on date-only fields (BUG 0220-59)
        run: |
          if grep -rn --include='*.ts' --include='*.tsx' \
            -E 'new Date\(.*(start_date|end_date)' \
            src/ \
            | grep -v '\.test\.' \
            | grep -v '__tests__' \
            | grep -v 'parseDateLocal'; then
            echo "ERROR: Use parseDateLocal() for date-only fields (BUG 0220-59)"
            exit 1
          fi
```

### W6: Changelog -- Append to `docs/CHANGELOG-2026-02-24.md`

Concise bugfix entry documenting root cause, affected files, fix pattern, tests added, and CI guardrail.

## Test Plan

### Primary: 3 behavior-level test files

These test the actual rendering/hydration logic as used in each UI surface, not just the utility.

#### T1: `src/components/forms/__tests__/EngagementForm.date-hydration.test.ts`

Simulates the form hydration path (lines 163-164):

```ts
/**
 * BUG 0220-59: Engagement form date hydration must not shift dates.
 */
import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Mirrors EngagementForm lines 163-164
function hydrateDate(dbValue: string | null): Date | undefined {
  return dbValue ? parseDateLocal(dbValue) : undefined;
}

describe("EngagementForm date hydration (BUG 0220-59)", () => {
  it("hydrates start_date 2026-02-20 as Feb 20", () => {
    const d = hydrateDate("2026-02-20")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(20);
  });

  it("hydrates end_date 2026-09-30 as Sep 30", () => {
    const d = hydrateDate("2026-09-30")!;
    expect(d.getDate()).toBe(30);
    expect(d.getMonth()).toBe(8);
  });

  it("returns undefined for null", () => {
    expect(hydrateDate(null)).toBeUndefined();
  });

  it("round-trip: hydrate then format back equals original", () => {
    const original = "2026-02-20";
    expect(format(hydrateDate(original)!, "YYYY-MM-DD")).toBe(original);
  });

  it("repeated edit/save cycles produce no cumulative drift", () => {
    let dateStr = "2026-02-20";
    for (let i = 0; i < 5; i++) {
      dateStr = format(hydrateDate(dateStr)!, "YYYY-MM-DD");
    }
    expect(dateStr).toBe("2026-02-20");
  });
});
```

#### T2: `src/pages/__tests__/Engagements.date-render.test.ts`

Simulates the list-view render path (lines 72, 82):

```ts
/**
 * BUG 0220-59: Engagements list date rendering must not shift dates.
 */
import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Mirrors Engagements.tsx lines 72, 82
function renderDate(dbDate: string | null): string {
  return dbDate ? format(parseDateLocal(dbDate), "DD/MM/YYYY") : "-";
}

describe("Engagements list date rendering (BUG 0220-59)", () => {
  it("renders 2026-02-20 as 20/02/2026", () => {
    expect(renderDate("2026-02-20")).toBe("20/02/2026");
  });

  it("renders 2026-09-30 as 30/09/2026", () => {
    expect(renderDate("2026-09-30")).toBe("30/09/2026");
  });

  it("renders null as dash", () => {
    expect(renderDate(null)).toBe("-");
  });

  it("handles month boundary 2026-01-01", () => {
    expect(renderDate("2026-01-01")).toBe("01/01/2026");
  });

  it("handles year boundary 2025-12-31", () => {
    expect(renderDate("2025-12-31")).toBe("31/12/2025");
  });
});
```

#### T3: `src/components/clients/__tests__/ClientEngagementsTable.date-render.test.ts`

Simulates the client sub-table formatDate helper (line 169):

```ts
/**
 * BUG 0220-59: ClientEngagementsTable date rendering must not shift dates.
 */
import { describe, it, expect } from "vitest";
import { format } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";

// Mirrors ClientEngagementsTable.tsx line 167-170
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return format(parseDateLocal(dateStr), "DD/MM/YYYY");
}

describe("ClientEngagementsTable formatDate (BUG 0220-59)", () => {
  it("formats 2026-02-20 as 20/02/2026", () => {
    expect(formatDate("2026-02-20")).toBe("20/02/2026");
  });

  it("formats null as dash", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("handles month-end 2026-02-28", () => {
    expect(formatDate("2026-02-28")).toBe("28/02/2026");
  });

  it("handles year-start 2026-01-01", () => {
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });
});
```

### Manual Validation Checklist

1. Create Engagement with start=20/02/2026, end=30/09/2026 --> list shows exact dates.
2. Open edit --> calendar prefills exact dates --> save without changes --> dates unchanged.
3. Repeat open/save 3 times -- no compounding drift.
4. Navigate to Client detail --> Client Engagements sub-table shows exact dates.

## Acceptance Criteria

1. Creating an Engagement with start=20/02/2026 and end=30/09/2026 displays exactly those dates after save.
2. Editing the same Engagement prefills calendar with exactly 20/02/2026 and 30/09/2026.
3. Saving repeatedly without changing dates produces zero drift.
4. Main Engagement list and Client Engagement sub-table both show exact stored dates.
5. All 3 behavior-level test files pass.
6. CI grep guard passes (no raw `new Date()` on date-only fields in source).

## Risks and Rollback

- **Risk**: Low. Changes limited to 3 read/parse calls + docs + CI guard. No DB/API changes.
- **Rollback**: Revert the 3 `parseDateLocal` substitutions. Tests confirm the regression returns only if rollback is applied.

## Definition of Done

- All 3 read paths use `parseDateLocal` for date-only fields.
- No `new Date(x.start_date)` or `new Date(x.end_date)` remains in targeted source paths.
- 3 behavior-level test files created and passing.
- CI guardrail step added and passing.
- JSDoc mandatory-use warning added to `parseDateLocal`.
- Changelog entry appended to `docs/CHANGELOG-2026-02-24.md`.