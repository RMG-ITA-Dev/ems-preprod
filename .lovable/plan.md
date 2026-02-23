# Plan: DB Consistency Fix for Orphan Timesheet Periods (Revision A)

**Plan ID:** Plan_DB_Consistency_Orphan_Periods_v1_REVISION_A
**Task ID:** DB_CONSISTENCY_ORPHAN_PERIODS
**Status:** READY_FOR_IMPLEMENTATION (all BLOCKER additions included)

---

## 1. Confirmed Diagnosis vs. Hypothesis

### Confirmed Facts (reproduced via DB queries)

**16 orphan `timesheet_periods**` exist: rows with `total_hours > 0` and `submitted_at IS NOT NULL`, but **zero matching `time_entries**`.


| Staff                         | staff_id     | Orphan Weeks | Phantom Hours | Date Range           |
| ----------------------------- | ------------ | ------------ | ------------- | -------------------- |
| Isaac Cori Alvarez            | e311d219-... | 3            | 126.00h       | Nov 17 - Dec 1, 2025 |
| Lourdes Gomez Vargas          | 7d3c23dd-... | 10           | 388.70h       | Sep 29 - Dec 1, 2025 |
| Victor Delfin Pelaez Mariscal | 1a60b0b4-... | 3            | 91.00h        | Nov 17 - Dec 1, 2025 |


**6 orphan `timesheet_line_approvals**` reference these orphan periods, all tied to engagement `11111111-1111-1111-1111-111111111111` (Auditoria Financiera 2024, BMSC-2025):


| approval_id  | Staff   | Week       | Status       |
| ------------ | ------- | ---------- | ------------ |
| 5ed40956-... | Isaac   | 2025-11-17 | pending      |
| 9a735334-... | Isaac   | 2025-11-24 | pending      |
| 6681dc1f-... | Isaac   | 2025-12-01 | **approved** |
| 75f42a3f-... | Lourdes | 2025-11-17 | pending      |
| 811b5dac-... | Lourdes | 2025-11-24 | pending      |
| 7769bfee-... | Lourdes | 2025-12-01 | **approved** |


**1 non-orphan approval (excluded):** Yandira Quispe's rejected approval for 2026-03-02 has 5 real time entries -- this is legitimate data and will NOT be touched.

### Probable Cause (not confirmed as fact)

These 16 periods and 6 approvals were **probably** created via bulk import or manual SQL during the pre-production testing phase (Sep-Dec 2025). The `time_entries` rows were either never created or were deleted before the `trg_protect_approved_time_entries` trigger was deployed.

**Proof criteria to upgrade to confirmed:** If someone can identify the import script or manual SQL session that generated these records, the cause is confirmed. Until then, it remains probable.

**STOP condition:** If any orphan period_id is found to have been created AFTER the system went into production use (post Jan 2026), escalate immediately -- this would indicate an active code bug rather than legacy data.

### Safety Confirmation

The `trg_protect_approved_time_entries` trigger is ACTIVE on the `time_entries` table, preventing deletion of entries linked to approved period+engagement pairs. No code path in the current codebase performs direct SQL deletes on `time_entries`.

---

## 2. Candidate Selection SQL (Dry-Run Only)

These queries identify the exact rows to remediate. They must be run and reviewed BEFORE any mutation.

### Query A: Orphan Periods (16 rows expected)

```text
SELECT tp.period_id, tp.staff_id, tp.week_start_date, tp.total_hours, tp.submitted_at
FROM timesheet_periods tp
WHERE tp.total_hours > 0
AND tp.submitted_at IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM time_entries te
  WHERE te.staff_id = tp.staff_id
  AND te.date_worked >= tp.week_start_date
  AND te.date_worked < tp.week_start_date + 7
  AND te.is_forecast = false
)
ORDER BY tp.staff_id, tp.week_start_date;
```

### Query B: Orphan Approvals (6 rows expected)

```text
SELECT tla.approval_id, tla.period_id, tla.engagement_id, tla.status
FROM timesheet_line_approvals tla
WHERE tla.period_id IN (
  -- Exactly the orphan period IDs from Query A
  SELECT tp.period_id FROM timesheet_periods tp
  WHERE tp.total_hours > 0
  AND tp.submitted_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM time_entries te
    WHERE te.staff_id = tp.staff_id
    AND te.date_worked >= tp.week_start_date
    AND te.date_worked < tp.week_start_date + 7
    AND te.is_forecast = false
  )
)
ORDER BY tla.period_id;
```

---

## 3. Safety Gates and Approval Checkpoints


| Gate                    | Condition                                                                             | Action if Failed                                            |
| ----------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| GATE-1: Scope Check     | Candidate set contains ONLY period_ids from the 16 listed above                       | ABORT. Do not proceed.                                      |
| GATE-2: Staff Allowlist | Affected staff_ids are ONLY: `e311d219-...`, `7d3c23dd-...`, `1a60b0b4-...`           | ABORT. Investigate new orphans.                             |
| GATE-3: Date Window     | All candidate `week_start_date` values fall within 2025-09-29 to 2025-12-01 inclusive | ABORT. Post-production orphan = possible code bug.          |
| GATE-4: Row Count       | Query A returns exactly 16 rows, Query B returns exactly 6 rows                       | ABORT. Unexpected count means data changed since diagnosis. |
| GATE-5: Sergio Approval | Plan reviewed and explicitly approved by Sergio                                       | Do not proceed without approval.                            |


---

## 4. Transactional Remediation Runbook

### Phase 1: PREVIEW

Run Query A and Query B above. Verify outputs match the expected row counts and IDs. Save output for audit record.

### Phase 2: BACKUP

Create timestamped backup tables containing only the affected rows:

```text
CREATE TABLE _backup_orphan_periods_20260223 AS
SELECT * FROM timesheet_periods
WHERE period_id IN ( <16 period_ids from Query A> );

CREATE TABLE _backup_orphan_approvals_20260223 AS
SELECT * FROM timesheet_line_approvals
WHERE approval_id IN ( <6 approval_ids from Query B> );
```

Verify backup row counts: 16 periods, 6 approvals.

### Phase 3: APPLY (within transaction)

All mutations run inside a single transaction using explicit ID allowlists (NOT dynamic subqueries):

```text
BEGIN;

-- Step 3A: Delete orphan approvals (6 rows)
DELETE FROM timesheet_line_approvals
WHERE approval_id IN (
  '5ed40956-0a68-405c-947f-d5a54ef55dcc',
  '9a735334-7dc7-4738-b4f7-a73d6ac448d8',
  '6681dc1f-6a1c-4344-b4bf-61283e7f8be5',
  '75f42a3f-b4cb-470f-b5c8-c882d5ad0262',
  '811b5dac-0ea9-40a9-97df-b4ccbc40282c',
  '7769bfee-a03b-483e-a565-e6582569a535'
);
-- Expected: 6 rows deleted

-- Step 3B: Reset orphan periods (16 rows)
UPDATE timesheet_periods
SET total_hours = 0, submitted_at = NULL
WHERE period_id IN (
  '1a24d4be-8ca2-43b3-bfb8-88e9ca49a917',
  'c58bbd63-0c4f-42ba-99b4-dcfef87e2654',
  '6f7cb6ca-9229-47c1-af37-b7c7087f1f6a',
  '6ef06941-4427-409f-aff3-67d722154f38',
  '289456c8-1965-4e16-91bd-de65ae78e253',
  '7ca3163e-cbce-46fc-9c0a-90b3674633d5',
  'e14b4677-6fa9-4c80-b31b-a0f41db6b76c',
  '90b46679-754f-43d7-98a0-eeeadc35ddc9',
  '8854c324-6ebc-432e-be1e-6ca7fc4961ca',
  'ec17a1d7-7030-4957-9d6f-fa82b317774b',
  'd68d23bd-d883-4099-9da5-198cfecefd1f',
  'e0d41e9b-b6e6-41b7-b5c3-c78b43e00d84',
  '66be6476-9844-4ac3-b283-6a952961b05c',
  'a67c9fcf-997c-4a44-94de-76986ea9d08d',
  '9be69459-97c4-4d3b-a4a1-24fa177fca03',
  '1f14e822-b640-479e-bd74-4c4021f802cc'
);
-- Expected: 16 rows updated

-- Phase 4 (VERIFY) runs here before COMMIT
```

### Phase 4: VERIFY (before committing)

Run within the same transaction:

```text
-- V1: Zero orphan periods remain
SELECT count(*) FROM timesheet_periods tp
WHERE tp.total_hours > 0 AND tp.submitted_at IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM time_entries te
  WHERE te.staff_id = tp.staff_id
  AND te.date_worked >= tp.week_start_date
  AND te.date_worked < tp.week_start_date + 7
  AND te.is_forecast = false
);
-- Expected: 0

-- V2: No collateral damage to other approvals
SELECT count(*) FROM timesheet_line_approvals;
-- Expected: previous total minus 6

-- V3: Yandira's approval untouched
SELECT approval_id, status FROM timesheet_line_approvals
WHERE approval_id = '1f4b451b-ae9f-452b-b216-14674b0c1090';
-- Expected: 1 row, status = 'rejected'

-- V4: All non-orphan periods untouched
SELECT count(*) FROM timesheet_periods
WHERE submitted_at IS NOT NULL AND total_hours > 0;
-- Expected: previous total minus 16
```

If all verifications pass: `COMMIT;`
If any verification fails: `ROLLBACK;`

### Phase 5: ROLLBACK (if needed after commit)

If issues are discovered post-commit, restore from backup tables:

```text
-- Restore approvals
INSERT INTO timesheet_line_approvals
SELECT * FROM _backup_orphan_approvals_20260223;

-- Restore periods
UPDATE timesheet_periods tp
SET total_hours = bk.total_hours, submitted_at = bk.submitted_at
FROM _backup_orphan_periods_20260223 bk
WHERE tp.period_id = bk.period_id;

-- Clean up backup tables after confirmed restore
-- DROP TABLE _backup_orphan_periods_20260223;
-- DROP TABLE _backup_orphan_approvals_20260223;
```

---

## 5. Preventive Trigger Migration (Phase 2)

### Design

**Trigger name:** `trg_validate_submission_has_entries`
**Table:** `timesheet_periods`
**Fires:** BEFORE UPDATE
**Condition:** Only when `submitted_at` transitions from NULL to NOT NULL

**Logic (pseudocode):**

```text
IF NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL THEN
  COUNT time_entries WHERE
    staff_id = NEW.staff_id
    AND date_worked >= NEW.week_start_date       -- Monday (inclusive)
    AND date_worked <= NEW.week_start_date + 4    -- Friday (inclusive)
    AND is_forecast = false

  IF count = 0 THEN
    RAISE EXCEPTION 'SUBMIT_NO_ENTRIES: Cannot submit a timesheet with no time entries for week starting %', NEW.week_start_date
  END IF
END IF
RETURN NEW
```

**Week boundary:** Monday (inclusive) through Friday (inclusive), matching the business workday policy (Mon-Fri). Uses `week_start_date + 4` for Friday, consistent with the existing `get_week_statuses` RPC which uses `v_cursor + 4` for `v_week_end`.

**Error contract:**

- Error code prefix: `SUBMIT_NO_ENTRIES`
- Expected caller behavior: Frontend catches this and displays a toast explaining that entries must be logged before submitting

**Idempotent deployment:**

```text
DROP TRIGGER IF EXISTS trg_validate_submission_has_entries ON timesheet_periods;
DROP FUNCTION IF EXISTS validate_submission_has_entries();

CREATE OR REPLACE FUNCTION validate_submission_has_entries() ...

CREATE TRIGGER trg_validate_submission_has_entries
  BEFORE UPDATE ON timesheet_periods
  FOR EACH ROW
  WHEN (NEW.submitted_at IS NOT NULL AND OLD.submitted_at IS NULL)
  EXECUTE FUNCTION validate_submission_has_entries();
```

**Downgrade path (reversible):**

```text
DROP TRIGGER IF EXISTS trg_validate_submission_has_entries ON timesheet_periods;
DROP FUNCTION IF EXISTS validate_submission_has_entries();
```

---

## 6. Validation Matrix

### DB-Level Tests (post Phase 1)


| Test                  | Query                                  | Expected        | Validates |
| --------------------- | -------------------------------------- | --------------- | --------- |
| Zero orphans remain   | V1 query above                         | count = 0       | AC-1      |
| Yandira untouched     | V3 query above                         | 1 row, rejected | AC-5      |
| No collateral periods | V4 query above                         | correct count   | AC-5      |
| Backup tables exist   | SELECT count(*) FROM each backup table | 16 + 6          | AC-6      |


### DB-Level Tests (post Phase 2 -- trigger)


| Test                          | Method                                                                         | Expected                                              | Validates |
| ----------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- | --------- |
| Normal submit with entries    | UPDATE timesheet_periods SET submitted_at = now() for a period WITH entries    | Succeeds                                              | AC-4      |
| Submit with zero entries      | UPDATE timesheet_periods SET submitted_at = now() for a period with NO entries | Raises SUBMIT_NO_ENTRIES                              | AC-3      |
| Non-submit update unaffected  | UPDATE timesheet_periods SET total_hours = 10 (submitted_at unchanged)         | Succeeds                                              | AC-4      |
| Re-submit (already submitted) | UPDATE submitted_at from one timestamp to another                              | Trigger does not fire (OLD.submitted_at was not NULL) | AC-4      |


### UI Smoke Checks


| Test                                            | Expected                                    | Validates |
| ----------------------------------------------- | ------------------------------------------- | --------- |
| Navigate to Isaac Dec 1-5, 2025                 | Week shows as empty/editable (NOT approved) | AC-2      |
| Navigate to any real approved week with entries | Rows visible, locked, read-only             | AC-5      |
| Submit a week with entries                      | Normal flow completes                       | AC-4      |


### Production-Safety Dry-Run Requirement

Phase 1 PREVIEW queries must be executed and output reviewed BEFORE proceeding to BACKUP and APPLY phases. This serves as the dry-run gate.

---

## 7. Rollback Plan


| Scenario                                        | Action                                                        |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Phase 1 verification fails (within transaction) | `ROLLBACK;` -- no data changed                                |
| Phase 1 post-commit issue discovered            | Restore from `_backup_orphan_*` tables (SQL in Phase 5 above) |
| Phase 2 trigger causes production issues        | Drop trigger and function (downgrade path in Section 5)       |
| Backup tables no longer needed                  | Drop after 30 days of confirmed stability                     |


---

## Tables Touched


| Phase   | Table                                     | Operation                 |
| ------- | ----------------------------------------- | ------------------------- |
| Phase 1 | `timesheet_line_approvals`                | DELETE 6 specific rows    |
| Phase 1 | `timesheet_periods`                       | UPDATE 16 specific rows   |
| Phase 1 | `_backup_orphan_periods_20260223` (new)   | CREATE + INSERT           |
| Phase 1 | `_backup_orphan_approvals_20260223` (new) | CREATE + INSERT           |
| Phase 2 | `timesheet_periods`                       | New BEFORE UPDATE trigger |


---

Wrap. Please document the implementation of this PLAN by appending it to the [CHANGELOG-2026-02-2.md](http://CHANGELOG-2026-02-2.md) file In the Codebase.

&nbsp;

## Acceptance Criteria (Measurable)


| AC   | Criterion                                                         | Verification Method                                            |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| AC-1 | Zero orphan periods remain after remediation                      | V1 query returns 0                                             |
| AC-2 | Affected weeks show as NOT_LOGGED/DRAFT in UI                     | Navigate to Isaac Dec 1-5 in timesheet                         |
| AC-3 | New trigger prevents submitting periods with zero entries         | Attempt UPDATE with no entries, expect SUBMIT_NO_ENTRIES error |
| AC-4 | Normal submission flow (entries exist) works without interference | Submit a real week with entries, succeeds                      |
| AC-5 | Non-orphan data completely unaffected (zero collateral)           | V3 + V4 queries confirm exact counts                           |
| AC-6 | Backup tables available for rollback                              | Backup tables exist with correct row counts                    |


---

## STOP Conditions

1. **Candidate count mismatch:** If PREVIEW returns anything other than exactly 16 periods / 6 approvals, ABORT.
2. **Unexpected staff:** If any staff_id outside the 3 listed appears in candidates, ABORT.
3. **Post-production orphan:** If any orphan `week_start_date` is after 2025-12-31, ABORT and investigate code bug.
4. **Verification failure:** If any Phase 4 verification query returns unexpected results, ROLLBACK.

---

**Implementation requires explicit Sergio approval after this plan review.**