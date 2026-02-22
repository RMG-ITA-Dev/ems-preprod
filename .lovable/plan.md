

# Plan_0220-49_v2: Fix Encargo Tab Select Crash + Sweep for Empty-Value SelectItem Anti-Pattern

## Problem

BUG 0220-49: A new user (adrianespinoza) with no time entries switches from the "Personal" tab to "Encargo" on the Dashboard. The app crashes with:

> Error: A `<SelectItem />` must have a value prop that is not an empty string.

## Root Cause

**File:** `src/components/dashboard/EngagementSelector.tsx`, line 128:

```typescript
<SelectItem value="" disabled>
  {t('dashboard.encargo.noEngagements')}
</SelectItem>
```

Radix UI `SelectItem` throws at runtime if `value=""`. When the engagements query returns an empty list (new user, no time entries), this code path fires and crashes the page.

## Solution

### Layer 1: Primary Fix (EngagementSelector)

Replace the empty-state `<SelectItem value="">` with a non-interactive `<div>` inside `SelectContent`.

### Layer 2: Preventative Sweep (project-wide)

A codebase-wide search for the anti-pattern (`<SelectItem value="">`, `value={""}`, `value="" disabled`) found **no additional occurrences** beyond the one in `EngagementSelector.tsx`. The sweep is clean -- no other files require changes.

---

## Technical Changes

### File: `src/components/dashboard/EngagementSelector.tsx`

**Edit 1 (lines 127-130): Replace empty-state SelectItem with plain div**

Before:
```typescript
) : (
  <SelectItem value="" disabled>
    {t('dashboard.encargo.noEngagements')}
  </SelectItem>
)}
```

After:
```typescript
) : (
  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
    {t('dashboard.encargo.noEngagements')}
  </div>
)}
```

**Logic:** Radix `SelectItem` requires a non-empty `value`. A plain `<div>` inside `SelectContent` renders the empty-state message without participating in the Select value system, avoiding the crash entirely.

### File: `docs/CHANGELOG-2026-02-22.md`

Append detailed entry for BUG 0220-49 with before/after code snippets, sweep results, and risk assessment.

---

## Files Changed

| File | Lines | Change |
|------|-------|--------|
| `src/components/dashboard/EngagementSelector.tsx` | 127-130 | Replace `<SelectItem value="" disabled>` with `<div>` for empty state |
| `docs/CHANGELOG-2026-02-22.md` | append | BUG 0220-49 entry with before/after snippets and sweep results |

## Preventative Sweep Results

| Search Pattern | Matches Found |
|---|---|
| `<SelectItem value="">` | 1 (EngagementSelector.tsx -- the primary fix) |
| `value={""}` | 0 |
| `value="" disabled` | 1 (same match above) |

No additional files require changes.

## Acceptance Tests

| Case | Expected |
|------|----------|
| New user with no time entries switches to Encargo tab | No crash; dropdown shows "no engagements" text |
| User with engagements opens the dropdown | Engagement list renders normally; selection works |
| Select an engagement, change period so list becomes empty | No crash; selector handles empty list gracefully |
| Open every other Select component in the app with an empty list | No crash (sweep confirmed no other occurrences) |

## Risk Assessment

- Minimal risk: single element swap in one component, no DB or logic changes.
- Zero business-logic changes; only empty-state rendering.
- Sweep confirms this is the sole occurrence in the codebase.

