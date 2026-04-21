# Bug Fix Plan — 0319-87: Redundant Cancel Dialog in Timesheet Approvals (no
   changes)

  a. Context

  Bug ID: 0319-87 | Module: OPERACIONES-Aprobaciones | Priority: Baja |
  Version: 2.0.7 | Tester: marceloovando

  A user opens the timesheet approval detail view
  (/timesheet/approvals/:periodId), makes no approval decisions, and clicks
  the Cancelar button in the page header. Instead of navigating directly
  back to the approvals list, a modal dialog appears first, requiring a
  second click to actually leave the page.

  Screenshot analysis:

  - 0319-87-1.png — The approval detail page showing a clean state: counter
  reads "0 a aprobar • 0 a rechazar • 1 pendientes". No decision has been
  selected for any line. This confirms the trigger condition precisely: zero
   local decisions, one pending approval still in "Pendiente" status.
  - 0319-87-2.png — The LeavePageDialog rendered with isDirty={false}.
  Title: "¿Salir de esta pantalla?" Body: "Use Guardar o Cancelar para salir
   de esta pantalla." Actions: "Quedarme" and "Cancelar". This is the
  clean-state variant of the navigation lock dialog. It appears even though
  no decisions were made, confirming the redundant block.
  - 0319-87-3.png — A different dialog instance: "Tiene cambios sin guardar"
   with "Quedarme" and "Salir de todas formas". This is the LeavePageDialog
  with isDirty={true}, rendered when the user has made local decisions.
  Screenshot 3 is a reference to show the intended behavior when real
  changes exist — it must be preserved exactly.

  Relevant files:

  File: src/pages/TimesheetApprovalDetail.tsx
  Role: Page with the bug — configures the lock
  ────────────────────────────────────────
  File: src/hooks/usePageLeaveLock.ts
  Role: Shared hook — wraps useBlocker
  ────────────────────────────────────────
  File: src/components/ui/leave-page-dialog.tsx
  Role: Dialog rendered when blocker fires
  ────────────────────────────────────────
  File: src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx
  Role: Existing tests — need new cases

  ---
  b. Root Cause Hypothesis

  Primary cause — locked is always true regardless of dirty state:

  src/pages/TimesheetApprovalDetail.tsx:89:
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true,
  isDirty: hasDecisions });

  usePageLeaveLock (src/hooks/usePageLeaveLock.ts:12–17) configures
  useBlocker with:
  locked && !bypassRef.current && currentLocation.pathname !==
  nextLocation.pathname

  Because locked is hardcoded to true, the router blocker is always active,
  even when hasDecisions is false (no decisions made). Every navigation from
   this page — including the explicit Cancelar button click — is
  intercepted.

  Secondary cause — allowNextNavigation() bypass does not survive
  navigate(-1):

  handleBack() at TimesheetApprovalDetail.tsx:91–98 calls
  allowNextNavigation() to set bypassRef.current = true, then immediately
  calls navigate(-1). The allowNextNavigation() implementation
  (usePageLeaveLock.ts:30–35) uses queueMicrotask to reset the ref:

  const allowNextNavigation = () => {
    bypassRef.current = true;
    queueMicrotask(() => { bypassRef.current = false; });
  };

  For navigate("/path") React Router processes the navigation synchronously
  — the blocker check runs before any microtasks, so the bypass holds. For
  navigate(-1), React Router calls window.history.go(-1), which fires the
  popstate event asynchronously (as a macrotask). The microtask that resets
  bypassRef.current runs before the popstate event, so by the time the
  blocker check executes, bypassRef.current is already false → the blocker
  fires → dialog appears.

  This secondary cause explains why the dialog appears despite
  allowNextNavigation() being called. However, the primary fix targets the
  root: when there are no decisions, locked should be false and no bypass is
   needed at all.

  The dialog content is correct for its context
  (leave-page-dialog.tsx:29–47): when isDirty is false it shows the "¿Salir
  de esta pantalla?" variant; when isDirty is true it shows "Tiene cambios
  sin guardar". The dialog component itself has no bug; the issue is purely
  in when the lock is active.

  ---
  c. Proposed Fix

  One-line change in TimesheetApprovalDetail.tsx:89:

  - const { blocker, allowNextNavigation } = usePageLeaveLock({ locked:
  true, isDirty: hasDecisions });
  + const { blocker, allowNextNavigation } = usePageLeaveLock({ locked:
  hasDecisions, isDirty: hasDecisions });

  Rationale:

  - When hasDecisions = false (no local approve/reject selections): locked =
   false → blocker is inactive → Cancelar navigates directly without any
  dialog. Bug fixed.
  - When hasDecisions = true (user has made at least one local decision):
  locked = true → blocker is active → navigating away (browser back,
  sidebar, direct URL) triggers the "Tiene cambios sin guardar" dialog.
  Screenshot 3 behavior preserved.
  - The beforeunload guard in usePageLeaveLock.ts:20–28 also gates on
  locked, so it too will only fire when there are unsaved decisions —
  correct behavior.
  - No changes to usePageLeaveLock.ts, leave-page-dialog.tsx, or any other
  shared file.

  ---
  d. Files to Change

  src/pages/TimesheetApprovalDetail.tsx

  Line 89 — single word change from true to hasDecisions:

  -  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked:
  true, isDirty: hasDecisions });
  +  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked:
  hasDecisions, isDirty: hasDecisions });

  No other changes in this file. All other logic (handleBack,
  processDecisions, handleSaveDecisions, LeavePageDialog usage at line 323)
  remains identical.

  ---
  e. Tests to Add or Update

  Update:
  src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx

  Current state: The mock for usePageLeaveLock is a fixed stub that returns
  a constant value and never captures the arguments passed to it. The four
  existing tests (TA1–TA4) use isLoading: true data and only verify that
  allowNextNavigation is called before navigate. They do not assert what
  locked/isDirty values the page passes to the hook.

  Pattern to follow:
  src/pages/__tests__/Settings.global-focus-cancel.test.tsx:8,15–16 — this
  test captures capturedLockArgs to assert that Settings passes correct
  locked and isDirty values in different states.

  Changes required:

  1. Add capturedLockArgs capture to the usePageLeaveLock mock, following
  the Settings test pattern exactly.
  2. Add a data fixture — the four existing tests use isLoading: true. To
  test the clean vs dirty states we need a second mock variant that returns
  data with at least one approvable pending line. A minimal
  StaffTimesheetForApproval stub is sufficient.
  3. Add three new test cases:

  TA5 — lock is inactive when no decisions are made:
  Renders page with loaded data containing one approvable pending line.
  No onDecisionChange call is made.
  Asserts: capturedLockArgs.locked === false
  Asserts: capturedLockArgs.isDirty === false

  TA6 — lock activates when a decision is made:
  Renders page with loaded data.
  Stubs ApprovalTimesheetGrid to expose a test button that calls
  onDecisionChange("appr-1", "approve").
  User clicks that button.
  Asserts: capturedLockArgs.locked === true
  Asserts: capturedLockArgs.isDirty === true

  TA7 — LeavePageDialog receives isDirty=true when decisions exist:
  Same setup as TA6 — user makes a decision.
  Mock LeavePageDialog to expose data-is-dirty attribute (as Settings test
  does).
  Asserts: leave-page-dialog data-is-dirty attribute is "true"

  Existing TA1–TA4 — keep unchanged. They test the loading branch and
  allowNextNavigation ordering; both remain valid after the fix.

  ApprovalTimesheetGrid stub approach (for TA6/TA7):
  vi.mock("@/components/timesheet/ApprovalTimesheetGrid", () => ({
    ApprovalTimesheetGrid: ({ onDecisionChange }: any) => (
      <button onClick={() => onDecisionChange("appr-1", "approve")}>
        make-decision
      </button>
    ),
  }));
  This avoids mounting the full grid and its dependencies while still
  exercising the setApprovalDecisions state path.

  Run command:
  npx vitest run
  src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx

  ---
  f. Verification Steps

  Reproducing the original symptom:

  1. npm run dev
  2. Log in as a user with approver permissions (e.g., marceloovando /
  socio).
  3. Navigate to OPERACIONES → Aprobaciones de Horas.
  4. Open an approval for a staff member that has at least one pending line.
  5. Confirm the header counter shows 0 a aprobar • 0 a rechazar (no
  decision selected yet).
  6. Click Cancelar.
  7. Before the fix: a dialog "¿Salir de esta pantalla?" appears — two
  clicks required.
  After the fix: the page navigates immediately to /timesheet/approvals — no
   dialog.

  Confirming the "dirty state" dialog still works (must not regress):

  8. Return to the same approval detail page.
  9. Click Aprobar or Rechazar on at least one line.
  10. Confirm the header shows ≥1 a aprobar or ≥1 a rechazar.
  11. Press the browser back button (or click a sidebar link).
  12. Expected: "Tiene cambios sin guardar" dialog appears with "Quedarme"
  and "Salir de todas formas". This proves the lock is still active when
  decisions exist.

  Automated tests:
  npx vitest run
  src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx
  All 7 cases (TA1–TA7) must be green.

  ---
  g. Regression Risks

  Risk 1 — navigate(-1) timing issue persists when hasDecisions = true and
  Cancel is clicked.

  With locked: hasDecisions and hasDecisions = true, clicking Cancelar still
   calls allowNextNavigation() + navigate(-1). The microtask-vs-popstate
  timing issue means the bypass may not hold, and the dirty-state dialog
  ("Tiene cambios sin guardar") could appear. This is technically a separate
   issue (clicking Cancel when you have unsaved decisions should arguably
  ask for confirmation anyway). It is not introduced by this fix — it exists
   today — and it only manifests when the user has made decisions and clicks
   Cancel instead of Guardar. Out of scope per the JSON bug report which
  specifies "al cancelar sin haber realizado cambios."

  Mitigation: Document this residual case and track it as a separate ticket
  if the team decides it should also skip the dialog.

  Risk 2 — locked: hasDecisions changes beforeunload behavior.

  Previously, the beforeunload event was registered immediately on page
  mount (locked: true). With the fix, it only registers after the first
  decision is made. This is the correct behavior — there's no reason to warn
   the user about closing the tab when they haven't done anything. No
  functional regression; behavioral improvement.

  Risk 3 — Other pages using usePageLeaveLock({ locked: true, ... }) are
  unaffected.

  The fix is local to TimesheetApprovalDetail.tsx. All other callers
  (ClientNew, EngagementNew, EngagementEdit, ClientEdit, ExpenseNew,
  ExpenseEdit, TrackerEdit, StaffEdit, StaffNew, WorkOrderEdit,
  WorksheetEdit, WorkOrderNew, WorksheetNew, Settings) are not touched.
  Their locked arguments remain unchanged.

  Risk 4 — Approval detail page becomes navigable before data loads.

  During the loading and no-data branches (lines 204–226 of
  TimesheetApprovalDetail.tsx), hasDecisions is always false (empty map), so
   locked = false. This means no navigation lock during loading. Previously,
   the lock was active during loading. Since the user cannot make any
  decisions while loading, there are no changes to protect — removing the
  lock here is correct.

  ---
  h. Out of Scope

  - Changes to usePageLeaveLock.ts (fixing the queueMicrotask / navigate(-1)
   timing issue).
  - Changes to leave-page-dialog.tsx (dialog copy, styling, or button
  variants).
  - Changing the Cancel button's navigation target from navigate(-1) to
  navigate("/timesheet/approvals").
  - Applying the same locked: hasDecisions pattern to other pages
  (WorksheetNew uses locked: true, isDirty: false which may also be
  redundant — separate audit).
  - Any changes to the Approvals list page (TimesheetApprovals.tsx).
  - Database, Edge Functions, or migrations.
  - Audit of all focusMode pages for consistent navigation policy.

  ---
  i. Open Questions

  1. Should clicking Cancelar when hasDecisions = true also skip the dialog?
   Currently (and after this fix), pressing Cancel with unsaved decisions
  still shows the dirty-state dialog due to the navigate(-1) timing issue.
  The bug report only mentions the redundant dialog when there are no
  changes. If the product intention is that Cancelar always navigates
  immediately (discarding decisions silently), the navigate(-1) call in
  handleBack should be changed to navigate("/timesheet/approvals"). This is
  a separate UX decision not covered by this ticket.
  2. Does the beforeunload behavior change matter to anyone? With the fix,
  beforeunload is no longer active at page load — only after the first
  decision is made. If there is a product requirement to warn the user on
  tab close even before any decision (to prevent accidental tab loss of the
  context they were reviewing), this change would contradict that. The
  screenshots and bug report give no indication such a requirement exists.
  3. Screenshot 3 source ambiguity. The third screenshot shows a different
  week (16/02–20/02) than screenshots 1 and 2 (23/02–27/02). It is treated
  here as a reference screenshot demonstrating the expected behavior when
  there are unsaved decisions, not as a step in the same reproduction
  sequence. If it was captured from a different flow or a different bug, the
   plan is not affected, but the tester should confirm.