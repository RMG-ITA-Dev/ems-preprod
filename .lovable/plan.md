

# Plan_0213-36_v1: Close as Working-As-Designed (No Code Changes)

## Bug Reference

| Field | Value |
|-------|-------|
| ID | 0213-36 |
| Title | Horas de socio |
| Priority | Media |
| Route | OPERACIONES - Hoja de Tiempo |

## Analysis

The tester reported that Partner (Socio) timesheets are auto-approved without going through the standard review flow. After reviewing with the product owner, this is **confirmed as intended behavior**:

- Partners (display_order <= 2) do not require approval from other Partners.
- The database function `is_auto_approved_category()` returns `true` for these categories by design.
- The `get_line_approver()` function returns `NULL` for Partners, meaning "no approver needed."
- On submit, the system creates line approvals with status `"approved"` and shows a distinct toast: **"Hoja de tiempo auto-aprobada"**.

## Verdict

**No code changes required.** The auto-approval behavior is a deliberate business rule, not a bug.

## Recommended Action

Update the bug status to **"Cerrado - Funcionalidad Esperada"** (Closed - Expected Functionality) and add a changelog note documenting the decision for traceability.

## Changes

### 1. `docs/CHANGELOG-2026-02-17.md`

Append a documentation-only entry:

```text
## BUG #0213-36: Partner Timesheet Auto-Approval (Closed - Expected Behavior)

**Date:** 2026-02-18
**Priority:** Media
**Version:** v2.0.10
**Route:** OPERACIONES -> Hoja de Tiempo

### Report
Tester reported that Partner (Socio) timesheets are auto-approved without standard review.

### Resolution
Confirmed as **working as designed**. Business rule: Partners (display_order <= 2) do not require
approval from other Partners. The `is_auto_approved_category()` DB function and `get_line_approver()`
function implement this intentionally. The UI already shows a distinct toast ("Hoja de tiempo
auto-aprobada") to communicate the auto-approval to the user.

**Status:** Closed - Expected Functionality. No code changes.
```

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `docs/CHANGELOG-2026-02-17.md` | MODIFY | Append BUG #0213-36 closure note (documentation only, no code changes) |

