
# Plan_0222-E2E_v1: Comprehensive End-to-End Testing Plan

## Overview

This plan covers manual and automated verification of all 9 session items (7 bug fixes/features + TESTFIX_v3 + FAIL-03 fix) using Lovable's browser automation, database queries, edge function testing, and test runner capabilities.

---

## Phase 1: Automated Unit Test Suite (Full Regression)

**Tool:** Lovable test runner
**Goal:** Confirm 341/341 pass, 0 failures

Run the complete test suite to verify Plan_0222-TESTFIX_v3 holds and no regressions from any session changes.

| Check | Expected |
|-------|----------|
| Total tests | 341 |
| Failures | 0 |
| FAIL-01 through FAIL-08 (all 7 fixed tests) | Green |
| All 21 new session tests | Green |

---

## Phase 2: Browser-Based E2E Verification

### 2.1 BUG 0220-18: Duplicate Client Name/NIT Prevention

**Route:** /clients (must be logged in as admin)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Clients page, click "New Client" | Form opens |
| 2 | Enter a client name that already exists (case-insensitive match) | Toast error with NIT of conflicting record |
| 3 | Enter a NIT that already exists | Toast error identifying the existing client name |
| 4 | Enter unique name + unique NIT, save | Success toast, client appears in list |
| 5 | Edit an existing client, change name to match another client | Toast error on save |

**DB verification:** Query `clients` table to confirm unique index exists:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'clients' AND indexname = 'clients_client_legal_name_unique';
```

### 2.2 BUG 0220-45: Deletion of Exported Time Entries

**Route:** /timesheet + /tracker

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a timer entry in Tracker, export it to Timesheet | Entry appears in timesheet grid |
| 2 | Delete the timesheet row | Row deletes successfully (no FK error) |
| 3 | Check Tracker: the original timer entry | `is_imported` reset to false, `imported_to_time_id` is null |

**DB verification:**
```sql
SELECT conname, confdeltype FROM pg_constraint WHERE conname = 'timer_entries_imported_to_time_id_fkey';
-- Expected: confdeltype = 'n' (SET NULL)
```

### 2.3 Hours-Only Toggle (Timer Entries)

**Route:** /tracker

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Manual Entry dialog | Toggle "Specify times" visible, default OFF |
| 2 | With toggle OFF: enter Date + Hours, leave times empty | Save succeeds; `has_explicit_times = false` in DB |
| 3 | With toggle ON: enter Date + Start + End times | Save succeeds; `has_explicit_times = true` |
| 4 | Edit entry created in step 2 | Toggle initializes OFF; time fields disabled |
| 5 | Edit entry created in step 3 | Toggle initializes ON; time fields enabled |

### 2.4 Feature 0220-47: Exit Date + Hours Gate + No-Reingreso

**Route:** /staff (admin only)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Edit active staff, set termination_date, deactivate | Pending-hours RPC runs; if gaps exist, dialog blocks save |
| 2 | If no gaps: save succeeds | Staff deactivated, termination_date saved |
| 3 | Edit deactivated+terminated staff, try to toggle Active ON | Switch disabled; "No reingreso" helper text shown |
| 4 | Navigate to Timesheet for terminated staff | Days after termination_date are locked; forward nav capped |
| 5 | Try to create time entry after termination_date via DB | DB trigger raises TERMINATION_DATE_BLOCKED |

**DB verification:**
```sql
SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_enforce_termination_date', 'trg_prevent_staff_reactivation');
-- Expected: both triggers exist
```

```sql
SELECT proname FROM pg_proc WHERE proname = 'check_pending_hours_before_termination';
-- Expected: RPC exists
```

### 2.5 BUG 0220-48: Historical Start Dates for Internal Engagements

**Route:** /engagements/new

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create new engagement, leave "Internal" OFF | Calendar blocks dates before today |
| 2 | Toggle "Internal" ON | Calendar allows all past dates |
| 3 | Select a historical start date (e.g., Oct 1, 2025), save | Engagement saves successfully |
| 4 | Toggle "Internal" OFF again | Calendar re-blocks past dates |

### 2.6 BUG 0220-49: Encargo Tab Crash Fix

**Route:** / (Dashboard)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as user with NO assigned engagements | Dashboard loads without crash |
| 2 | Click "Encargo" tab | Tab renders empty state (no crash, no white screen) |
| 3 | Log in as user WITH engagements | Encargo tab shows engagement selector and data |

### 2.7 Feature 0220-50: Pending Hours Indicator

**Route:** / (Dashboard)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Log in as staff with incomplete hours for current week | Yellow/amber alert banner visible |
| 2 | Log in as staff with all hours logged | No alert banner |
| 3 | Check alert text | Shows missing hours count and links to timesheet |

---

## Phase 3: Database Integrity Checks

Run these SQL queries to verify all schema changes are in place:

```sql
-- 1. Client name unique index
SELECT indexname FROM pg_indexes WHERE tablename = 'clients' AND indexname = 'clients_client_legal_name_unique';

-- 2. Timer entries FK with SET NULL
SELECT conname, confdeltype FROM pg_constraint WHERE conname = 'timer_entries_imported_to_time_id_fkey';

-- 3. has_explicit_times column
SELECT column_name, data_type, column_default FROM information_schema.columns 
WHERE table_name = 'timer_entries' AND column_name = 'has_explicit_times';

-- 4. termination_date column
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'staff' AND column_name = 'termination_date';

-- 5. Triggers
SELECT tgname FROM pg_trigger WHERE tgname IN (
  'trg_enforce_termination_date', 
  'trg_prevent_staff_reactivation',
  'trg_reset_timer_import_on_unlink'
);

-- 6. Staff unique indexes (soft-delete aware)
SELECT indexname FROM pg_indexes WHERE tablename = 'staff' 
AND indexname IN ('idx_staff_email_unique', 'idx_staff_id_number_unique');

-- 7. Pending hours RPC
SELECT proname FROM pg_proc WHERE proname = 'check_pending_hours_before_termination';
```

---

## Phase 4: Error Handler Verification

Verify via unit tests (already covered in FAIL-01 fix):

| PostgreSQL Code | Expected ErrorCode |
|-----------------|-------------------|
| 23505 | DB_DUPLICATE_KEY |
| 23503 | DB_CONSTRAINT |
| 42501 | AUTH_FORBIDDEN |

---

## Phase 5: i18n Verification

**Tool:** Browser automation with language toggle

| Step | Action | Expected |
|------|--------|----------|
| 1 | Set language to EN in Settings | All new keys render in English |
| 2 | Set language to ES in Settings | All new keys render in Spanish |
| 3 | Verify no missing translation keys (check console for i18n warnings) | No warnings |

---

## Execution Order

1. Run full automated test suite (Phase 1) -- immediate pass/fail gate
2. Run database integrity queries (Phase 3) -- schema verification
3. Browser E2E tests in order: 2.6 (crash fix, quickest), 2.1, 2.3, 2.5, 2.2, 2.4, 2.7
4. i18n spot check (Phase 5)

## Acceptance Criteria

| Criterion | Target |
|-----------|--------|
| Unit tests: 341/341 | 0 failures |
| DB schema: 7 queries | All return expected results |
| Browser E2E: 7 features | All steps pass |
| i18n: EN + ES | No missing keys |
