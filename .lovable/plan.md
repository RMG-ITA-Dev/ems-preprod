
# EMS 2.0 Bug Fixes - Implementation Plan

## Progress Tracker

### ✅ Phase 1: Database Migration (COMPLETED)
- Added specialist categories (SQR, IT, TAX)
- Added staff.deleted_at and staff.hire_date columns
- Added work_orders risk assessment columns (ceac_completed_at, ceac_notes, san_completed_at, san_notes)
- Created expense-receipts storage bucket

### ✅ Phase 2-3: Core Timesheet Fixes (COMPLETED)
- #29: Save Draft button with save status indicator
- #32: Unsubmit button for editing after submission
- #33: Decimal hours input fix (0.5, 1.5)
- #31: Client name in engagement selector
- #11, #15: Duplicate NIT/Email friendly error messages
- #6: Translated password reset validation

### ✅ Phase 4: Timer & Work Order Fixes (COMPLETED)
- #18: Timer background tracking - FIXED (timestamp-based calculation)
- #21: Import to Timesheet button - ADDED (visible in TrackerList)
- #28: Status tooltips - ADDED (Work Orders page)
- #34: Risk assessment UI - ADDED (WorkOrderForm)

---

## Remaining Work (Phase 5-7)

### Phase 5: Data Integrity
- #36: Soft delete implementation in useStaffMutations
- #19: Engagement assignment filtering
- #35: Pending vs approved hours breakdown
- #22: Hire date validation in TimeSheet

### Phase 6: Polish
- #24: File upload for expense receipts
- #14: Remove/implement BOB/USD dropdown
- #16: Remove/implement global search
- #20: Timesheet revert functionality

### Phase 7: Feature Requests
- #12: Copy Previous Week functionality
- #13: Hour limit validation with warnings
- #4: Improved initials generation
- #30: Currency change rate recalculation (optional)

---

## Testing Checklist
- [ ] Timer tracks correctly when tab is in background
- [ ] Import to Timesheet button visible and functional
- [ ] Work Order status tooltips display correctly
- [ ] Risk assessment section shows during approval
- [ ] All translations work in both EN/ES
