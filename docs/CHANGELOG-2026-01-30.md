# EMS 2.0 Bug Fixes & Features - Session Changelog

**Date:** January 30, 2026  
**Session Focus:** Comprehensive bug fixes and feature implementations across Phases 1-7

---

## Table of Contents
1. [Phase 1: Database Migration](#phase-1-database-migration)
2. [Phase 2-3: Core Timesheet Fixes](#phase-2-3-core-timesheet-fixes)
3. [Phase 4: Timer & Work Order Fixes](#phase-4-timer--work-order-fixes)
4. [Phase 5: Data Integrity](#phase-5-data-integrity)
5. [Phase 6: Polish](#phase-6-polish)
6. [Phase 7: Feature Requests](#phase-7-feature-requests)

---

## Phase 1: Database Migration

### Schema Changes
- **Specialist Categories:** Added new staff categories (SQR, IT, TAX) to support specialized roles
- **Staff Table Enhancements:**
  - Added `deleted_at` column for soft delete functionality
  - Added `hire_date` column for employment date validation
- **Work Orders Risk Assessment:**
  - Added `ceac_completed_at` and `ceac_notes` columns
  - Added `san_completed_at` and `san_notes` columns
- **Storage:** Created `expense-receipts` bucket for receipt file uploads

---

## Phase 2-3: Core Timesheet Fixes

### Bug #29: Save Draft Button with Status Indicator
**Files Modified:**
- `src/pages/TimeSheet.tsx`
- `src/components/timesheet/TimesheetGrid.tsx`

**Changes:**
- Added manual "Save Draft" button alongside auto-save functionality
- Implemented save status indicator showing: idle, saving (spinner), saved (checkmark with timestamp)
- Added `saveNowTrigger` prop to force immediate save
- Added `onSaveStatusChange` callback to communicate status to parent

### Bug #32: Unsubmit Button for Editing After Submission
**Files Modified:**
- `src/pages/TimeSheet.tsx`
- `src/hooks/useTimesheetMutations.ts`

**Changes:**
- Added `useUnsubmitTimesheet` mutation to clear `submitted_at` timestamp
- Added "Unsubmit" button visible when timesheet is submitted with pending lines
- Updated editability logic to allow corrections on current week with pending/rejected lines

### Bug #33: Decimal Hours Input Fix
**Files Modified:**
- `src/components/timesheet/TimesheetGrid.tsx`

**Changes:**
- Fixed input handling to properly accept decimal values (0.5, 1.5, etc.)
- Ensured locale-aware number parsing for Spanish decimal format (comma)

### Bug #31: Client Name in Engagement Selector
**Files Modified:**
- `src/components/timesheet/TimesheetGrid.tsx`

**Changes:**
- Updated engagement dropdown to display format: "Client Name - Engagement Name"
- Improved readability for users with multiple engagements

### Bugs #11, #15: Duplicate NIT/Email Friendly Error Messages
**Files Modified:**
- `src/hooks/mutations/useClientMutations.ts`
- `src/hooks/mutations/useStaffMutations.ts`
- `src/locales/en.json`
- `src/locales/es.json`

**Changes:**
- Added error detection for unique constraint violations (error code 23505)
- Implemented user-friendly toast messages for duplicate NIT and email errors
- Added translations for `duplicateNit` and `duplicateEmail` keys

### Bug #6: Translated Password Reset Validation
**Files Modified:**
- `src/pages/ResetPassword.tsx`
- `src/locales/en.json`
- `src/locales/es.json`

**Changes:**
- Added password validation messages with translations
- Implemented minimum length and confirmation match validation
- Added `passwordTooShort` and `passwordMismatch` translation keys

---

## Phase 4: Timer & Work Order Fixes

### Bug #18: Timer Background Tracking
**Files Modified:**
- `src/hooks/useTimeTracker.ts`

**Changes:**
- Implemented timestamp-based calculation instead of interval-based
- Timer now correctly calculates elapsed time when tab is in background
- Stores `startedAt` timestamp and calculates duration on demand

### Bug #21: Import to Timesheet Button
**Files Modified:**
- `src/pages/TrackerList.tsx`
- `src/components/tracker/TimerImportDialog.tsx`

**Changes:**
- Added "Import to Timesheet" button on TrackerList page
- Implemented bulk import dialog for selecting timer entries
- Added validation to prevent importing already-imported entries

### Bug #28: Status Tooltips on Work Orders
**Files Modified:**
- `src/pages/WorkOrders.tsx`

**Changes:**
- Added tooltip explanations for each Work Order status badge
- Draft: "Work order is being prepared"
- Pending: "Awaiting partner/manager approval"
- Approved: "Budget locked and ready for execution"

### Bug #34: Risk Assessment UI
**Files Modified:**
- `src/components/forms/WorkOrderForm.tsx`

**Changes:**
- Added collapsible "Risk Assessment" section during WO approval
- CEAC (Client Evaluation and Acceptance Checklist) fields: date and notes
- SAN (Special Approval Needs) fields: date and notes
- Only visible when WO is in approval workflow

---

## Phase 5: Data Integrity

### Bug #36: Soft Delete Implementation
**Files Modified:**
- `src/hooks/mutations/useStaffMutations.ts`
- `src/components/forms/StaffForm.tsx`
- Database migration (staff_directory view update)

**Changes:**
- Implemented soft delete for staff with related records (time_entries, engagements)
- Hard delete only for staff without dependencies
- Updated `staff_directory` view to filter out soft-deleted records
- Added UI explanation about soft delete behavior

### Bug #19: Engagement Assignment Filtering
**Files Modified:**
- `src/hooks/useTimesheetWeek.ts`
- Database migration (engagement_team table, get_staff_assigned_engagements function)

**Changes:**
- Created `engagement_team` table for explicit staff-engagement assignments
- Added `get_staff_assigned_engagements()` database function
- Timesheet now only shows engagements where staff is assigned or has prior entries
- Respects partner/manager override access

### Bug #35: Pending vs Approved Hours Breakdown
**Files Modified:**
- `src/components/dashboard/tabs/EncargoTab.tsx`
- `src/hooks/useEmsData.ts`
- Database migration (vw_hours_by_approval_status view)

**Changes:**
- Created `vw_hours_by_approval_status` database view
- Dashboard now shows breakdown: "Approved: X hrs | Pending: Y hrs"
- Visual distinction between approved and pending actual hours

### Bug #22: Hire Date Validation
**Files Modified:**
- `src/pages/TimeSheet.tsx`
- `src/hooks/useCurrentStaff.ts`
- `src/locales/en.json`
- `src/locales/es.json`

**Changes:**
- Extended `useCurrentStaff` hook to include `hire_date` field
- Added `isBeforeHireDate` check in TimeSheet page
- Displays warning alert when viewing week before hire date
- Blocks editing for pre-hire date weeks

---

## Phase 6: Polish

### Bug #24: File Upload for Expense Receipts
**Files Modified:**
- `src/components/forms/ExpenseLogForm.tsx`
- `src/locales/en.json`
- `src/locales/es.json`

**Changes:**
- Implemented file upload to `expense-receipts` Supabase storage bucket
- Added file type validation (JPG, PNG, WebP, PDF)
- Added file size validation (10MB max)
- Implemented upload progress indicator
- Generated signed URLs with 1-year expiry for viewing
- Added "View Receipt" link for existing uploads

### Bug #14: Removed BOB/USD Dropdown
**Files Modified:**
- `src/components/layout/AppHeader.tsx`

**Changes:**
- Removed non-functional currency dropdown from header
- Cleaned up unused imports and state

### Bug #16: Removed Global Search
**Files Modified:**
- `src/components/layout/AppHeader.tsx`

**Changes:**
- Removed non-functional search input from header
- Simplified header layout

### Bug #20: Timesheet Revert Functionality
**Files Modified:**
- `src/hooks/useTimesheetApprovals.ts`
- `src/locales/en.json`
- `src/locales/es.json`

**Changes:**
- Added `useRequestRevision` mutation hook
- Resets line approval status to "pending"
- Clears `approved_by` and `approved_at` timestamps
- Returns timesheet to staff for correction

---

## Phase 7: Feature Requests

### Bug #12: Copy Previous Week Functionality
**Files Modified:**
- `src/hooks/useTimesheetMutations.ts`
- `src/pages/TimeSheet.tsx`
- `src/locales/en.json`
- `src/locales/es.json`

**Changes:**
- Added `useCopyPreviousWeek` mutation hook
- Fetches entries from previous week for current staff
- Maps entries to current week dates (preserving engagement, activity, hours)
- Creates new period if needed
- Skips entries that would duplicate existing ones
- Added "Copy Previous Week" button in timesheet actions

### Bug #13: Hour Limit Validation with Warnings
**Files Modified:**
- `src/pages/TimeSheet.tsx`
- `src/components/timesheet/TimesheetGrid.tsx`
- `src/locales/en.json`
- `src/locales/es.json`

**Changes:**
- Fetches `DAILY_LIMIT` and `WEEKLY_LIMIT` from global_settings
- Visual warnings in daily totals row:
  - Yellow background at 80% of limit
  - Red background with AlertTriangle icon when exceeding limit
- Weekly total warning when exceeding weekly limit
- Tooltip showing limit values on hover

### Bug #4: Improved Initials Generation
**Files Modified:**
- `src/components/forms/StaffForm.tsx`

**Changes:**
- Enhanced algorithm to use consonants for uniqueness
- Pattern: First letter of first name + consonants from last name
- Examples:
  - "Juan Pérez" → "JPR"
  - "María González" → "MGN"
  - "Carlos Smith" → "CSM"
- Generates 3-4 character initials
- Falls back to first letters if no consonants available

---

## Translation Keys Added

### English (`src/locales/en.json`)
```json
{
  "timesheet.saving": "Saving...",
  "timesheet.saved": "Saved at",
  "timesheet.saveDraft": "Save Draft",
  "timesheet.autoSaveHint": "Changes auto-save every few seconds",
  "timesheet.unsubmit": "Unsubmit",
  "timesheet.copyPreviousWeek": "Copy Previous Week",
  "timesheet.beforeHireDate": "You cannot log time before your hire date",
  "timesheet.dailyLimitExceeded": "Daily limit exceeded",
  "timesheet.weeklyLimitExceeded": "Weekly limit exceeded",
  "expenses.uploadReceipt": "Upload Receipt",
  "expenses.uploading": "Uploading...",
  "expenses.viewReceipt": "View Receipt",
  "expenses.fileTooLarge": "File too large (max 10MB)",
  "expenses.invalidFileType": "Invalid file type",
  "staff.staffDeactivated": "Staff member deactivated",
  "approval.requestRevision": "Request Revision",
  "approval.revisionRequested": "Revision requested"
}
```

### Spanish (`src/locales/es.json`)
```json
{
  "timesheet.saving": "Guardando...",
  "timesheet.saved": "Guardado a las",
  "timesheet.saveDraft": "Guardar Borrador",
  "timesheet.autoSaveHint": "Los cambios se guardan automáticamente",
  "timesheet.unsubmit": "Retirar Envío",
  "timesheet.copyPreviousWeek": "Copiar Semana Anterior",
  "timesheet.beforeHireDate": "No puede registrar tiempo antes de su fecha de contratación",
  "timesheet.dailyLimitExceeded": "Límite diario excedido",
  "timesheet.weeklyLimitExceeded": "Límite semanal excedido",
  "expenses.uploadReceipt": "Subir Recibo",
  "expenses.uploading": "Subiendo...",
  "expenses.viewReceipt": "Ver Recibo",
  "expenses.fileTooLarge": "Archivo muy grande (máx 10MB)",
  "expenses.invalidFileType": "Tipo de archivo inválido",
  "staff.staffDeactivated": "Personal desactivado",
  "approval.requestRevision": "Solicitar Revisión",
  "approval.revisionRequested": "Revisión solicitada"
}
```

---

## Database Objects Created

### Tables
- `engagement_team` - Staff-to-engagement assignments

### Views
- `vw_hours_by_approval_status` - Hours aggregated by approval status

### Functions
- `get_staff_assigned_engagements(p_staff_id UUID)` - Returns engagement IDs for a staff member

### Storage Buckets
- `expense-receipts` - Public bucket for receipt file uploads

---

## Testing Checklist

- [x] Timer tracks correctly when tab is in background
- [x] Import to Timesheet button visible and functional
- [x] Work Order status tooltips display correctly
- [x] Risk assessment section shows during approval
- [x] All translations work in both EN/ES
- [x] File upload for expense receipts works correctly
- [x] Request Revision returns timesheet for correction
- [ ] Copy Previous Week button works correctly
- [ ] Hour limit warnings display when limits exceeded
- [ ] Initials generation produces unique 3-4 character codes

---

## Notes

- **Currency Change Rate Recalculation (#30):** Deferred - requires additional specification from stakeholders
- **Soft Delete Strategy:** Staff with related records are deactivated (deleted_at set), not permanently deleted
- **Fiscal Year:** All date calculations respect the Oct 1 - Sep 30 fiscal year

---

*Document generated: January 30, 2026*
