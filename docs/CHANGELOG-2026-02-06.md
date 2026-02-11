# EMS 2.0 Bug Fixes — Session Changelog

**Date:** February 6, 2026  
**Session Focus:** Timesheet submission safeguards, client deletion UX, and engagement filtering fix

## Completion Summary

| # | Bug ID | Title | Status |
|---|--------|-------|--------|
| 1 | #19 | Engagement filtering — show all approved WO engagements | ✅ Completed |
| 2 | #20 | Friendly delete prevention for clients with engagements | ✅ Completed |
| 3 | #21 | Prevent re-submission of already submitted timesheet | ✅ Completed |

---

## Bug #19: Engagement Filtering — All Approved WO Engagements

### Problem
The timesheet engagement dropdown was previously restricted to engagements where the staff member was explicitly assigned via the `engagement_team` table. This was overly restrictive — any staff member should be able to log time to any engagement with an approved Work Order.

### Changes

| File | Change |
|------|--------|
| `src/hooks/useTimesheetWeek.ts` | Replaced `get_staff_assigned_engagements` RPC call with a direct query: fetch all approved Work Orders → get their `engagement_id`s → fetch active engagements matching those IDs. Removed `engagement_team` dependency. |

### Technical Details
- Query chain: `work_orders` (filter `approval_status = 'Approved'`) → collect `engagement_id` list → `engagements` (filter `status = 'active'`, `IN` approved IDs)
- Includes client join for display: `client:clients!client_id(client_id, client_legal_name)`
- Cached with 5-minute `staleTime` since engagement/WO changes are infrequent

---

## Bug #20: Friendly Delete Prevention for Clients With Engagements

### Problem
Attempting to delete a client with linked engagements produced a generic database constraint violation error ("violates data constraints"). Users had no way to understand why the deletion failed.

### Changes

| File | Change |
|------|--------|
| `src/pages/ClientEdit.tsx` | Added `useQuery` engagement count check; conditionally disables Delete button with Tooltip when `count > 0`; added safety pre-check in `handleDelete` |
| `src/components/forms/ClientForm.tsx` | Same pattern for the full-layout delete button in the form component |
| `src/locales/en.json` | Added `client.cannotDeleteTooltip`, `client.cannotDelete` |
| `src/locales/es.json` | Added `client.cannotDeleteTooltip`, `client.cannotDelete` |

### Technical Details
- **Count query:** `supabase.from('engagements').select('engagement_id', { count: 'exact', head: true }).eq('client_id', clientId)` — efficient HEAD request returning only count
- **Disabled button UX:** Radix Tooltip requires a non-disabled trigger element, so the disabled `<Button>` is wrapped in a `<span>` inside `<TooltipTrigger asChild>`
- **Safety pre-check:** `handleDelete` re-queries count immediately before executing the delete mutation; shows toast error if engagements found (guards against race conditions)
- **Tooltip message (es):** "Para eliminar este cliente, primero debe eliminar todos los encargos asociados."
- **Tooltip message (en):** "To delete this client, all associated engagements must be deleted first."

---

## Bug #21: Prevent Re-submission of Already Submitted Timesheet

### Problem
The "Enviar Semana" button remained active after a timesheet week was submitted and pending approval. Clicking it again would overwrite the `submitted_at` timestamp and upsert line approvals, potentially disrupting an in-progress approval workflow.

**Root cause:** The `isEditable` flag (which controls grid cell editability for correction scenarios) was also used to gate the Submit button. These are two separate concerns — a submitted week with pending lines should allow cell editing (for corrections on rejected lines) but should NOT allow re-submission.

### Changes

| File | Change |
|------|--------|
| `src/pages/TimeSheet.tsx` | Added new `canSubmit` flag separate from `isEditable`; conditionally renders Submit button with `{canSubmit && ...}`; dynamic label for resubmit scenario |
| `src/locales/en.json` | Added `timesheet.resubmitWeek`: "Resubmit Week" |
| `src/locales/es.json` | Added `timesheet.resubmitWeek`: "Reenviar Semana" |

### Technical Details

**New `canSubmit` flag logic:**
```typescript
const canSubmit = !isBeforeHireDate && isWithinEditableWindow && entries.length > 0 && (
  (!isSubmitted && !period?.is_period_locked) ||
  (isSubmitted && hasRejectedLines && !isFullyApproved)
);
```

**State matrix:**

| Scenario | `isEditable` | `canSubmit` | Submit Button |
|----------|-------------|-------------|---------------|
| Fresh week, no entries | ✅ | ❌ | Hidden |
| Fresh week, has entries | ✅ | ✅ | "Enviar Semana" |
| Submitted, pending lines | ✅ | ❌ | **Hidden** (this is the fix) |
| Submitted, rejected lines | ✅ | ✅ | "Reenviar Semana" |
| Fully approved | ❌ | ❌ | Hidden |
| Period locked | ❌ | ❌ | Hidden |
| Before hire date | ❌ | ❌ | Hidden |

**What stays unchanged:**
- `isEditable` — still controls grid cell editing for correction scenarios
- `canUnsubmit` — still allows withdrawing a submitted week ("Retirar Envío")
- Copy Previous Week and Save Draft buttons — still gated by `isEditable`

---

## Translation Keys Added

### English (`src/locales/en.json`)
```json
{
  "client.cannotDeleteTooltip": "To delete this client, all associated engagements must be deleted first.",
  "client.cannotDelete": "Cannot delete this client",
  "timesheet.resubmitWeek": "Resubmit Week"
}
```

### Spanish (`src/locales/es.json`)
```json
{
  "client.cannotDeleteTooltip": "Para eliminar este cliente, primero debe eliminar todos los encargos asociados.",
  "client.cannotDelete": "No se puede eliminar este cliente",
  "timesheet.resubmitWeek": "Reenviar Semana"
}
```

---

## Testing Checklist

- [ ] Timesheet: Submit a fresh week → button disappears after submission
- [ ] Timesheet: View submitted/pending week → only "Retirar Envío" visible, no "Enviar Semana"
- [ ] Timesheet: After rejection, "Reenviar Semana" button appears
- [ ] Timesheet: After resubmission, button disappears again
- [ ] Timesheet: Fully approved week shows no submit/resubmit button
- [ ] Client: Delete button disabled with tooltip when client has engagements
- [ ] Client: Delete button enabled and functional when client has no engagements
- [ ] Engagement dropdown: All engagements with approved WOs appear for any staff member

---

*Document generated: February 6, 2026*
