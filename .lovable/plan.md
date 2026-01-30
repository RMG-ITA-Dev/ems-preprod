
# EMS 2.0 Bug Fixes - Implementation Plan

## Overview
This plan addresses 24 bugs identified by your team, organized by priority. Each bug includes the problem, root cause analysis, and specific implementation steps.

---

## Phase 1: HIGH PRIORITY (Critical Business Impact)

### BUG #26: Missing Specialist Hours in Work Order Budget
**Problem:** Quality Partner (SQR), IT Specialist, and TAX Specialist categories are missing from Work Order budget forms.

**Root Cause:** Database `categories` table only has 6 entries (Socio, Director, Gerente, Senior, Semi-Senior, Asistente). Specialist categories were never added.

**Solution:**
1. Add missing categories via database migration:
   - SQR (Socio de Calidad) - display_order: 3 (between Socio and Director)
   - Especialista IT - display_order: 7
   - Especialista TAX - display_order: 8
2. Update existing category display_order values to accommodate

**Files:** Database migration only (no code changes needed - `useCategories` already fetches all)

---

### BUG #29: Timesheet Partial Save - Add Manual Save Button
**Problem:** Users don't realize auto-save is working; they want explicit feedback and a "Save Draft" button.

**Root Cause:** The auto-save with 3-second debounce works but lacks visibility.

**Solution:**
1. Add save status indicator in `TimeSheet.tsx` showing "Saving..." / "Saved at HH:MM"
2. Add "Save Draft" button that immediately saves all pending changes
3. Add helper text explaining auto-save behavior
4. Expose save callbacks from `TimesheetGrid.tsx` to parent

**Files to Modify:**
- `src/pages/TimeSheet.tsx` - Add save status UI and Save Draft button
- `src/components/timesheet/TimesheetGrid.tsx` - Expose onSaveStatusChange callback
- `src/locales/en.json` and `es.json` - Add translations

---

### BUG #32: Cannot Edit Timesheet After Submit with <40 Hours
**Problem:** Once submitted, timesheet is locked even if under 40 hours and not yet approved.

**Root Cause:** `isEditable` logic in `TimeSheet.tsx` (line 83) only checks `!isSubmitted`, not approval status.

**Solution:**
1. Modify `isEditable` logic to allow editing when:
   - Submitted but has pending approvals AND is current week
   - Has rejected lines needing correction
2. Add "Unsubmit" button to recall timesheet before approval
3. Create `useUnsubmitTimesheet` mutation

**Files to Modify:**
- `src/pages/TimeSheet.tsx` - Update isEditable logic, add Unsubmit button
- `src/hooks/useTimesheetMutations.ts` - Add useUnsubmitTimesheet mutation
- `src/locales/en.json` and `es.json` - Add translations

---

### BUG #36: User Deletion Procedure (Data Integrity)
**Problem:** Deleting staff with related records fails silently or causes orphaned data.

**Solution:**
1. Add `deleted_at` column to staff table for soft deletes
2. Modify `useDeleteStaff` mutation to:
   - Check for related time_entries and timer_entries
   - Soft-delete if related records exist
   - Hard-delete only if no related records
3. Update delete confirmation dialog to explain behavior

**Files to Modify:**
- Database: Add `deleted_at` column, update staff_directory view
- `src/hooks/mutations/useStaffMutations.ts` - Implement soft delete logic
- `src/components/forms/StaffForm.tsx` - Update delete confirmation message

---

## Phase 2: MEDIUM PRIORITY (User Experience)

### BUG #31: Add Client Info to Engagement Selector in Timesheet
**Problem:** Engagement dropdown doesn't show client name, making it hard to identify correct engagement.

**Root Cause:** `TimesheetGrid.tsx` only displays engagement_code and engagement_name.

**Solution:**
1. Modify engagement SelectItem in `TimesheetGrid.tsx` to show client name
2. Client data already available in `ApprovedEngagement` interface

**Files to Modify:**
- `src/components/timesheet/TimesheetGrid.tsx` - Update SelectItem rendering

---

### BUG #33: Cannot Register Decimal Hours (0.5, 1.5)
**Problem:** Cannot enter values like 0.5 hours in timesheet.

**Root Cause:** In `NumericInput.tsx`, the min constraint check (lines 146-148) blocks values less than min during typing. When typing "0.5", the "0" is valid but rejected because 0 < 0 is false but the check runs on every keystroke.

**Solution:**
1. Modify `NumericInput` to allow intermediate decimal typing (e.g., "0." on the way to "0.5")
2. Only enforce min constraint on blur/commit, not during typing

**Files to Modify:**
- `src/components/ui/numeric-input.tsx` - Relax min constraint during typing

---

### BUG #34: Risk Assessment Fields in Work Order Approval
**Problem:** Need CEAC and SAN date fields for risk assessment during WO approval.

**Solution:**
1. Add columns to work_orders table: `ceac_completed_at`, `ceac_notes`, `san_completed_at`, `san_notes`
2. Add risk assessment section to WorkOrderForm (visible during approval)
3. Make risk assessment required before approval
4. Update approval mutation to include these fields

Provide proper internationalization with i18n

**Files to Modify:**
- Database: Add 4 columns to work_orders table
- `src/hooks/useEmsData.ts` - Update WorkOrder interface
- `src/components/forms/WorkOrderForm.tsx` - Add risk assessment section
- `src/hooks/mutations/useWorkOrderMutations.ts` - Update approval mutation
- `src/locales/en.json` and `es.json` - Add translations

---

### BUG #35: Pending Hours in Execution Reports
**Problem:** Pending (unapproved) hours are mixed with approved hours in reports.

**Business Decision Required:** Should we:
- A) Show only approved hours
- B) Show both separately (recommended)
- C) Keep current behavior

**Recommended Solution (Option B):**
1. Create database view showing hours by approval status
2. Update dashboard components to show approved vs pending breakdown

**Files to Modify:**
- Database: Create new view with approval status
- `src/components/dashboard/tabs/EncargoTab.tsx` - Show breakdown

---

## Phase 3: LOW PRIORITY (Polish & Edge Cases)

### BUG #4: Initials Auto-Generation is Erratic
**Problem:** Initials generation is unpredictable and doesn't validate uniqueness.

**Solution:**
1. Improve `generateInitials` algorithm in `StaffForm.tsx`
2. Track manual edits to avoid overwriting user changes
3. Add uniqueness validation against existing staff

**Files to Modify:**
- `src/components/forms/StaffForm.tsx` - Improve algorithm, add uniqueness check

---

### BUG #6: Invalid Email Address on Password Reset
**Problem:** Shows "Invalid email address" even for valid emails; message not translated.

**Root Cause:** Zod schema in `ForgotPasswordDialog.tsx` uses hardcoded English message.

**Solution:**
1. Move schema inside component to use i18n translations
2. Show inline error below input instead of toast only

**Files to Modify:**
- `src/components/auth/ForgotPasswordDialog.tsx` - Use translated messages
- `src/locales/en.json` and `es.json` - Add validation translations

---

### BUG #11: Generic Error on Duplicate NIT
**Problem:** Shows generic "violates data constraints" for duplicate NIT.

**Solution:**
1. Add specific handling in error-handler for PostgreSQL error code 23505
2. Check constraint name in useCreateClient to show friendly message

**Files to Modify:**
- `src/lib/error-handler.ts` - Add DB_DUPLICATE_KEY error code
- `src/hooks/mutations/useClientMutations.ts` - Handle duplicate NIT
- `src/locales/en.json` and `es.json` - Add error message

---

### BUG #12: Copy Previous Week Feature Request
**Problem:** No way to copy engagement/activity rows from previous week.

**Solution:**
1. Add "Copy Previous Week" button in TimeSheet.tsx
2. Fetch previous week's entries and create same engagement/activity rows
3. Only copy row structure, not hours

**Files to Modify:**
- `src/pages/TimeSheet.tsx` - Add button and handler

---

### BUG #13: Allows >40 Hours Despite Configuration
**Problem:** Can enter more than daily/weekly limits.

**Solution:**
1. Pass policy limits to TimesheetGrid
2. Validate before saving; show error if exceeded
3. Add visual warning when approaching limits

**Files to Modify:**
- `src/pages/TimeSheet.tsx` - Pass limits as props
- `src/components/timesheet/TimesheetGrid.tsx` - Add validation

---

### BUG #14: BOB/USD Dropdown Non-Functional
**Problem:** Currency dropdown in header doesn't do anything.

**Solution Options:**
- Remove if not needed (simplest)
- Implement global currency context if needed

**Files to Modify:**
- Identify location (likely AppHeader.tsx) - Remove or implement

---

### BUG #15: Generic Error on Duplicate Email
**Problem:** Same as BUG #11 but for email in Staff module.

**Solution:** Same pattern as BUG #11

**Files to Modify:**
- `src/hooks/mutations/useStaffMutations.ts` - Handle duplicate email

---

### BUG #16: Search Button Doesn't Work
**Problem:** Global search button is non-functional.

**Solution Options:**
- Remove placeholder button
- Implement global search using CommandDialog

**Files to Modify:**
- Identify component location - Remove or implement

---

### BUG #18: Timer Doesn't Track in Background
**Problem:** Timer lags when tab is inactive.

**Root Cause:** `useTimeTracker.ts` uses `setInterval` which doesn't run when tab is inactive.

**Solution:**
1. Use timestamp-based calculation instead of interval counting
2. Calculate elapsed from startTime on each tick
3. Add visibility change listener to update when tab becomes active

**Files to Modify:**
- `src/hooks/useTimeTracker.ts` - Rewrite timer logic

---

### BUG #19: Can Log Time to Unassigned Engagements
**Problem:** Users can log time to any engagement, not just ones they're assigned to.

**Solution:**
1. Create database function to get staff's assigned engagements
2. Modify useTimesheetWeek to filter by assignment
3. Consider creating engagement_team table for team assignments beyond partner/manager

**Files to Modify:**
- Database: Create function or table
- `src/hooks/useTimesheetWeek.ts` - Filter engagements

---

### BUG #20: No Timesheet Revert Functionality
**Problem:** Approvers can't send timesheets back for correction.

**Solution:**
1. Add "Request Revision" action in approval detail page
2. Set line approval status to "rejected" with notes

**Files to Modify:**
- `src/pages/TimesheetApprovalDetail.tsx` - Add revision button
- `src/hooks/useTimesheetApprovals.ts` - Add revision mutation

---

### BUG #21: Timer to Timesheet Import Unclear
**Problem:** Import functionality exists but is not discoverable.

**Solution:**
1. Add prominent "Import to Timesheet" button in TrackerList
2. Improve import dialog flow

**Files to Modify:**
- `src/pages/TrackerList.tsx` - Make import more visible
- `src/components/tracker/TimerImportDialog.tsx` - Improve UX

---

### BUG #22: Can Log Time Before Hire Date
**Problem:** No validation prevents logging time before employment started.

**Solution:**
1. Add `hire_date` column to staff table
2. Validate in TimeSheet.tsx before navigating to past weeks
3. Show warning/block if trying to log before hire date

**Files to Modify:**
- Database: Add hire_date column
- `src/pages/TimeSheet.tsx` - Add date validation

---

### BUG #24: Upload Expense Receipt File
**Problem:** Can only enter URL, not upload file.

**Solution:**
1. Create Supabase storage bucket for receipts
2. Add file upload dropzone to ExpenseLogForm
3. Upload file before saving expense

**Files to Modify:**
- Database: Create storage bucket and RLS policies
- `src/components/forms/ExpenseLogForm.tsx` - Add file upload
- May need to add react-dropzone dependency

---

### BUG #28: Work Order Status Column Needs Legend
**Problem:** Status dots have no explanation.

**Solution:**
1. Add tooltip to status dots showing status name
2. Add legend row/section explaining all statuses

**Files to Modify:**
- `src/pages/WorkOrders.tsx` - Add tooltips and legend

---

### BUG #30: Currency Change Doesn't Convert Values
**Problem:** Changing currency doesn't update rates.

**Note:** This may be intentional - WO is created in one currency and stays that way.

**Solution (if conversion desired):**
1. Add exchange rate to global_settings
2. On currency change, re-fetch category rates for new currency
3. Show confirmation dialog warning about rate changes

**Files to Modify:**
- Database: Add exchange rate setting
- `src/components/forms/WorkOrderForm.tsx` - Handle currency change

---

## Implementation Order

Recommended sequence to minimize conflicts:

1. **Database Changes First** (all in one migration):
   - Add specialist categories (#26)
   - Add staff.deleted_at column (#36)
   - Add staff.hire_date column (#22)
   - Add work_orders risk assessment columns (#34)
   - Create storage bucket for receipts (#24)

2. **Core Timesheet Fixes**:
   - #32 (edit after submit) + #29 (save draft) together
   - #33 (decimal hours)
   - #13 (hour limits)
   - #31 (client in dropdown)
   - #12 (copy previous week)

3. **Error Handling**:
   - #11 (duplicate NIT) + #15 (duplicate email) together
   - #6 (password reset validation)
   - #4 (initials generation)

4. **Timer Fixes**:
   - #18 (background tracking)
   - #21 (import visibility)

5. **Work Order Enhancements**:
   - #34 (risk assessment)
   - #28 (status legend)
   - #30 (currency change)

6. **Data Integrity**:
   - #36 (soft delete)
   - #19 (engagement assignment)
   - #35 (pending hours)
   - #22 (hire date validation)

7. **Polish**:
   - #24 (file upload)
   - #14 (BOB/USD dropdown)
   - #16 (search button)
   - #20 (revert functionality)

---

## Translations to Add

All bugs requiring new UI text will need entries in both `src/locales/en.json` and `src/locales/es.json`.

---

## Testing Checklist

After each phase, verify:
- [ ] No regressions in existing functionality
- [ ] New features work in both languages
- [ ] Mobile responsiveness maintained
- [ ] Error states handled gracefully
