# Bug Fix Plan v2 — 0319-87: Redundant Cancel Dialog in Timesheet Approvals
  (no changes)

  ---
  Comparison Matrix

  Section: Context
  Plan A position: Detailed per-screenshot breakdown (what each image shows
    and how it supports the bug); same 4 files identified
  Plan B position: Same conclusions, shorter analysis; additionally cites
    WorksheetNew.tsx and Settings.tsx as shared-hook risk references
  Agreement?: Yes on substance
  Chosen position: Hybrid
  Reason: Plan A's screenshot detail is more useful for execution reference;

    Plan B's risk-file citations add useful context for the regression
    section
  ────────────────────────────────────────
  Section: Root Cause
  Plan A position: Two causes: (1) locked: true always (primary), (2)
    queueMicrotask timing with navigate(-1) (secondary). Notes dialog is
    correct, not a cause
  Plan B position: One cause: locked: true always. Notes useBlocker depends
    only on locked. Adds test coverage gap observation
  Agreement?: Partial
  Chosen position: Plan A + Plan B's test-gap note
  Reason: Plan A's timing analysis documents the full mechanism and explains

    why allowNextNavigation() doesn't rescue the clean-state case. Plan B's
    test gap adds value. Both identify the same primary cause
  ────────────────────────────────────────
  Section: Proposed Fix
  Plan A position: locked: hasDecisions, isDirty: hasDecisions — one-liner
  Plan B position: Same fix; optionally introduces const
  shouldLockNavigation
    = hasDecisions for readability
  Agreement?: Yes
  Chosen position: Both agree on the fix; drop the optional constant
  Reason: The fix is identical. The intermediate constant adds diff noise
  for
    a self-explanatory one-liner. Drop it
  ────────────────────────────────────────
  Section: Files to Change
  Plan A position: Only TimesheetApprovalDetail.tsx:89
  Plan B position: Same source file + explicitly lists the test file as a
    second file to change
  Agreement?: Partial
  Chosen position: Both
  Reason: Plan B's explicit test-file listing makes the section more
  concrete
    and directly executable
  ────────────────────────────────────────
  Section: Tests
  Plan A position: TA5/TA6/TA7 with capturedLockArgs pattern (from Settings
    test), explicit ApprovalTimesheetGrid stub code, keep TA1–TA4
  Plan B position: Same 3 semantic cases; same stub suggestion; less
    concrete; explicitly says keep existing back-button test
  Agreement?: Yes
  Chosen position: Plan A
  Reason: Plan A is more concrete: exact mock code, Settings pattern
    reference, numbered test IDs. Plan B's "keep back-button test" is
  already
     covered by Plan A's "keep TA1–TA4"
  ────────────────────────────────────────
  Section: Verification
  Plan A position: 12 manual steps (6 for reproducing bug + 6 for dirty
    confirmation); single test command
  Plan B position: 8 steps covering same points; adds a second test command
    running both the target file and Settings.global-focus-cancel.test.tsx
  as
     a regression guard
  Agreement?: Partial
  Chosen position: Hybrid
  Reason: Plan A's detailed steps; Plan B's dual-file test command retained
    as a regression sanity check
  ────────────────────────────────────────
  Section: Regression Risks
  Plan A position: 4 risks: navigate(-1) timing persists (pre-existing),
    beforeunload change (improvement), other pages unaffected, loading state

    has no lock
  Plan B position: 3 risks: low risk (local change), medium risk if someone
    modifies hook globally (cites WorksheetNew.tsx:30,
  Settings.tsx:148-151),
     implicit lock requirement risk
  Agreement?: Partial
  Chosen position: Union
  Reason: Complementary, not conflicting. Plan A's 4 + Plan B's "future
    global hook mutation" risk added
  ────────────────────────────────────────
  Section: Out of Scope
  Plan A position: 6 items: timing fix, dialog changes, navigate target,
    other-pages audit, approvals list, DB/edge functions
  Plan B position: 4 items: modal copy, global hook semantics, focusMode
    audit, style changes
  Agreement?: Partial
  Chosen position: Union
  Reason: Plan A's list subsumes Plan B's; adding Plan B's explicit items
    makes the exclusions comprehensive
  ────────────────────────────────────────
  Section: Open Questions
  Plan A position: Q1: dirty-state Cancel behavior; Q2: beforeunload change;

    Q3: screenshot 3 week ambiguity
  Plan B position: Q1: trigger mechanism (Cancel button vs browser back);
  Q2:
    screenshot 3 (closed: preserve); Q3: other pages (closed: out of scope)
  Agreement?: Partial
  Chosen position: Hybrid
  Reason: Keep Plan A's Q1 (dirty Cancel actionable follow-up) + Plan B's Q1

    (trigger mechanism, valid for testing). Drop beforeunload Q (addressed
  in
     risks). Drop screenshot 3 ambiguity (both plans agree it is a
  reference,
     not a defect)

  ---
  Context

  Bug ID: 0319-87 | Module: OPERACIONES-Aprobaciones | Priority: Baja |
  Version: 2.0.7 | Tester: marceloovando

  A user opens the timesheet approval detail view
  (/timesheet/approvals/:periodId), makes no approval decisions, and clicks
  the Cancelar button. Instead of navigating directly back, a modal dialog
  appears, requiring a second action to actually leave — hence the report
  title "Repetir 2 veces la acción de Cancelar." The suggestion in the JSON
  is explicit: if no changes exist (the system already knows this), exit
  directly without asking.

  Screenshot analysis:

  - 0319-87-1.png — Approval detail in clean state: counter reads "0 a
  aprobar • 0 a rechazar • 1 pendientes". No decision is selected for any
  line. This confirms the trigger condition precisely: zero local decisions,
   one approval still at "Pendiente" server status. The "Guardar Decisiones"
   button is disabled.
  - 0319-87-2.png — LeavePageDialog rendered with isDirty={false}: Title
  "¿Salir de esta pantalla?", body "Use Guardar o Cancelar para salir de
  esta pantalla.", actions "Quedarme" and "Cancelar". This is the
  clean-state variant of the navigation lock dialog
  (leave-page-dialog.tsx:55–56, i18n keys leavePageTitle /
  leavePageLockedBody). It appears even though no decisions were made — the
  bug confirmed in UI.
  - 0319-87-3.png — LeavePageDialog rendered with isDirty={true}: Title
  "Tiene cambios sin guardar", body "Si sale, sus cambios se perderán.",
  actions "Quedarme" and "Salir de todas formas". This is the dirty-state
  variant (leavePageDirtyTitle / leavePageDirtyBody). Note the week shown
  (16/02–20/02) differs from screenshots 1–2 (23/02–27/02), so this was
  captured in a separate session to illustrate the correct behavior when
  real decisions exist. It must be preserved exactly.

  Relevant files:

  File: src/pages/TimesheetApprovalDetail.tsx
  Role: Page — contains the bug at line 89
  ────────────────────────────────────────
  File: src/hooks/usePageLeaveLock.ts
  Role: Shared hook — wraps useBlocker; not modified by this fix
  ────────────────────────────────────────
  File: src/components/ui/leave-page-dialog.tsx
  Role: Dialog — not a cause; not modified
  ────────────────────────────────────────
  File: src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx
  Role: Existing tests — updated with 3 new cases

  Shared-hook context (not modified, monitored for regression):
  src/pages/WorksheetNew.tsx:30, src/pages/Settings.tsx:148–151.

  ---
  Root Cause Hypothesis

  Primary cause — locked is hardcoded to true regardless of dirty state:

  src/pages/TimesheetApprovalDetail.tsx:89:
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true,
  isDirty: hasDecisions });

  Inside usePageLeaveLock (src/hooks/usePageLeaveLock.ts:12–17), useBlocker
  is configured with:
  locked && !bypassRef.current && currentLocation.pathname !==
  nextLocation.pathname

  Because locked is always true, the router blocker is always active —
  including when hasDecisions is false. Every navigation from this page is
  intercepted. The isDirty parameter only controls the dialog content after
  the block; it does not affect whether the block fires.

  Secondary cause — allowNextNavigation() bypass is ineffective for
  navigate(-1):

  handleBack() (TimesheetApprovalDetail.tsx:91–98) calls
  allowNextNavigation() then navigate(-1). The bypass implementation
  (usePageLeaveLock.ts:30–35) uses queueMicrotask to reset
  bypassRef.current:

  const allowNextNavigation = () => {
    bypassRef.current = true;
    queueMicrotask(() => { bypassRef.current = false; });
  };

  For navigate("/path"), React Router processes the navigation synchronously
   — the blocker check runs before any microtask, so the bypass holds. For
  navigate(-1), React Router calls window.history.go(-1), which fires the
  popstate event as an async macrotask. The microtask that resets
  bypassRef.current runs first, so by the time the blocker check executes,
  bypassRef.current is already false → the block fires → the dialog appears
  even though allowNextNavigation() was called.

  This secondary timing issue is pre-existing and out of scope to fix here.
  The primary fix makes it irrelevant for the clean-state case: when locked
  = false, the blocker never fires, so no bypass is needed.

  Test coverage gap:
  src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx:14–16
   mocks usePageLeaveLock as a fixed stub. Lines 45–54 verify that
  allowNextNavigation() is called before navigate(), but no test asserts
  that the page passes the correct locked/isDirty values to the hook in
  clean vs. dirty states. This gap allows the regression to exist
  undetected.

  The LeavePageDialog component is correct — its clean-state and dirty-state
   branches (leave-page-dialog.tsx:29–47) render the right content for each
  isDirty value. The dialog is not a cause and requires no changes.

  ---
  Proposed Fix

  One-line change in src/pages/TimesheetApprovalDetail.tsx:89:

  - const { blocker, allowNextNavigation } = usePageLeaveLock({ locked:
  true, isDirty: hasDecisions });
  + const { blocker, allowNextNavigation } = usePageLeaveLock({ locked:
  hasDecisions, isDirty: hasDecisions });

  Why this is correct:

  - hasDecisions = false → locked = false → blocker inactive → Cancelar
  navigates immediately, no dialog. Bug fixed.
  - hasDecisions = true → locked = true → blocker active → navigating away
  (browser back, sidebar, direct URL) triggers "Tiene cambios sin guardar".
  Screenshot 3 behavior preserved.
  - beforeunload (usePageLeaveLock.ts:20–28) also gates on locked — it will
  now only register when there are unsaved decisions. This is an
  improvement, not a regression.
  - No changes to usePageLeaveLock.ts, leave-page-dialog.tsx, or any other
  shared file. All other pages using locked: true are unaffected.

  ---
  Files to Change

  1. src/pages/TimesheetApprovalDetail.tsx

  Line 89 — change true to hasDecisions:

  -  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked:
  true, isDirty: hasDecisions });
  +  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked:
  hasDecisions, isDirty: hasDecisions });

  No other changes in this file. All other logic (handleBack,
  processDecisions, handleSaveDecisions, LeavePageDialog at line 323)
  remains identical.

  2. src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx

  Add capturedLockArgs capture to the usePageLeaveLock mock and add three
  new test cases (TA5, TA6, TA7). Full details in the Tests section below.

  ---
  Tests to Add or Update

  File: src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx

  Pattern to follow:
  src/pages/__tests__/Settings.global-focus-cancel.test.tsx:8,15–16 — that
  test captures capturedLockArgs at every render cycle to assert what
  locked/isDirty values the page passes to the hook.

  Change 1 — Upgrade the mock to capture args:

  + let capturedLockArgs: any = {};

    vi.mock("@/hooks/usePageLeaveLock", () => ({
  -   usePageLeaveLock: () => ({ blocker: mockBlocker, allowNextNavigation:
  mockAllowNextNavigation, isDirty: false }),
  +   usePageLeaveLock: (args: any) => {
  +     capturedLockArgs = args;
  +     return { blocker: mockBlocker, allowNextNavigation:
  mockAllowNextNavigation, isDirty: false };
  +   },
    }));

  Change 2 — Add capturedLockArgs = {} to beforeEach cleanup:

    beforeEach(() => {
      vi.clearAllMocks();
  +   capturedLockArgs = {};
    });

  Change 3 — Add ApprovalTimesheetGrid stub (new mock, placed with the other
   vi.mock calls):

  vi.mock("@/components/timesheet/ApprovalTimesheetGrid", () => ({
    ApprovalTimesheetGrid: ({ onDecisionChange }: any) => (
      <button onClick={() => onDecisionChange("appr-1", "approve")}>
        make-decision
      </button>
    ),
  }));

  Change 4 — Add LeavePageDialog stub that exposes isDirty (update existing
  mock):

    vi.mock("@/components/ui/leave-page-dialog", () => ({
  -   LeavePageDialog: () => <div data-testid="leave-page-dialog" />,
  +   LeavePageDialog: ({ isDirty }: any) => <div
  data-testid="leave-page-dialog" data-is-dirty={isDirty} />,
    }));

  Change 5 — Add a loaded-data mock variant. The four existing tests use
  isLoading: true. Add a second mock setup factory that returns a minimal
  StaffTimesheetForApproval with one approvable pending line:

  const mockTimesheetData = {
    staff: { short_name: "Test Staff", first_name: "Test", last_name:
  "Staff" },
    period: { week_start_date: "2026-02-23", week_number: 9, fiscal_year:
  2026 },
    lineApprovals: [{ approval_id: "appr-1", engagement_id: "eng-1", status:
   "pending" as const }],
    approvableEngagementIds: ["eng-1"],
    timeEntries: [],
    engagementBudgets: {},
  };

  And a second mock toggle:

  let mockTimesheetReturn = { data: null as any, isLoading: true };

  vi.mock("@/hooks/useTimesheetApprovals", () => ({
    useStaffTimesheetForApproval: () => mockTimesheetReturn,
    useBulkApproveTimesheetLines: () => ({ mutate: vi.fn(), isPending: false
   }),
    useBulkRejectTimesheetLines: () => ({ mutate: vi.fn(), isPending: false
  }),
  }));

  In the new tests, set mockTimesheetReturn = { data: mockTimesheetData,
  isLoading: false } in a beforeEach.

  New test cases:

  TA5 — lock is inactive when page loads with no local decisions:
  Setup: mockTimesheetReturn = { data: mockTimesheetData, isLoading: false }
  Render: <TimesheetApprovalDetail />
  Assert: capturedLockArgs.locked === false
  Assert: capturedLockArgs.isDirty === false

  TA6 — lock activates after a decision is made:
  Setup: mockTimesheetReturn = { data: mockTimesheetData, isLoading: false }
  Render: <TimesheetApprovalDetail />
  User: click "make-decision" (stub button that calls
  onDecisionChange("appr-1", "approve"))
  Assert: capturedLockArgs.locked === true
  Assert: capturedLockArgs.isDirty === true

  TA7 — LeavePageDialog receives isDirty=true when a decision exists:
  Setup: same as TA6
  Render + click "make-decision"
  Assert: screen.getByTestId("leave-page-dialog").dataset.isDirty === "true"

  Existing TA1–TA4 — unchanged. They test the loading branch and
  allowNextNavigation call ordering; both remain valid after the fix.

  ---
  Verification Steps

  Reproducing the original symptom:

  1. npm run dev
  2. Log in as a user with approver role (e.g., marceloovando / socio).
  3. Navigate to OPERACIONES → Aprobaciones de Horas (/timesheet/approvals).
  4. Open an approval for a staff member that has at least one pending line.
  5. Confirm the header counter reads "0 a aprobar • 0 a rechazar" — no
  decision selected.
  6. Click Cancelar.
  7. Before fix: dialog "¿Salir de esta pantalla?" appears — two clicks
  required to leave.
  After fix: page navigates immediately to /timesheet/approvals — no dialog.
   ✓

  Confirming the dirty-state dialog is preserved:

  8. Navigate back to the same approval detail page.
  9. Click Aprobar or Rechazar on at least one line. Confirm the header
  shows ≥1 a aprobar or ≥1 a rechazar.
  10. Click the browser back button (or click any sidebar link).
  11. Expected: dialog "Tiene cambios sin guardar" appears with "Quedarme"
  and "Salir de todas formas". ✓
  12. Click Guardar Decisiones with decisions set — confirm save succeeds
  and navigates to /timesheet/approvals when no pending lines remain. ✓

  Automated tests:

  # Primary — all 7 cases must be green
  npx vitest run
  src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx

  # Regression sanity — confirms Settings and other shared-hook pages
  unaffected
  npx vitest run
  src/pages/__tests__/TimesheetApprovalDetail.lock-navigation.test.tsx
  src/pages/__tests__/Settings.global-focus-cancel.test.tsx

  ---
  Regression Risks

  Risk 1 — navigate(-1) timing issue persists when hasDecisions = true and
  Cancel is clicked.
  With locked: hasDecisions and hasDecisions = true, clicking Cancelar still
   hits allowNextNavigation() + navigate(-1). The queueMicrotask reset runs
  before the popstate event, so the bypass may fail, causing the dirty-state
   dialog to appear. This is a pre-existing condition, not introduced by
  this fix. The bug report specifies only the clean-state redundancy.
  Severity: low — the dirty-state dialog is at least semantically correct
  (the user is discarding decisions).
  Mitigation: Document as a follow-up ticket if the team decides Cancelar
  should always skip the dialog regardless of decisions.

  Risk 2 — beforeunload guard activation window changes.
  usePageLeaveLock.ts:20–28 registers the beforeunload handler only when
  locked is true. Before the fix, beforeunload was registered immediately on
   mount. After the fix, it only registers after the first decision. This is
   a behavioral improvement: the browser will not prompt "Leave site?" on
  tab close when the user has done nothing. No functional regression.

  Risk 3 — Other pages sharing usePageLeaveLock are unaffected.
  The fix is strictly local to TimesheetApprovalDetail.tsx. All other
  callers (ClientNew, EngagementNew, EngagementEdit, ClientEdit, ExpenseNew,
   ExpenseEdit, TrackerEdit, StaffEdit, StaffNew, WorkOrderEdit,
  WorkOrderNew, WorksheetEdit, WorksheetNew, Settings) retain their existing
   locked arguments unchanged. The second npx vitest run command in
  Verification catches any accidental regression.

  Risk 4 — Future developer modifies usePageLeaveLock globally.
  The hook is used in 14+ pages. If someone later changes
  usePageLeaveLock.ts (e.g., to make isDirty control useBlocker directly),
  that change would affect all callers. This fix does not create this risk —
   it pre-exists — but it is noted because Plan B cited WorksheetNew.tsx:30
  and Settings.tsx:148–151 as the most sensitive callers.
  Mitigation: Changes to usePageLeaveLock.ts should always include a grep of
   all callers before landing.

  Risk 5 — Implicit requirement to block navigation without changes.
  If there is an undocumented product requirement to always block navigation
   in the approval detail view (regardless of decisions made, to prevent
  "accidental" loss of context), this fix removes that block in the clean
  state. The screenshots, the JSON description, and the JSON suggestion all
  point in the opposite direction. No evidence of such a requirement exists.

  ---
  Out of Scope

  - Fixing the queueMicrotask / navigate(-1) timing issue in
  usePageLeaveLock.ts.
  - Any changes to src/components/ui/leave-page-dialog.tsx (copy, styling,
  button variants, or removing the clean-state branch).
  - Changing navigate(-1) to navigate("/timesheet/approvals") in handleBack
  to make the bypass reliable when hasDecisions = true.
  - Applying locked: hasDecisions to any other page that uses
  usePageLeaveLock.
  - Auditing all focusMode pages for consistent navigation-lock policy.
  - Changes to src/pages/TimesheetApprovals.tsx (the approvals list page).
  - Changes to src/hooks/useTimesheetApprovals.ts or
  src/components/timesheet/ApprovalTimesheetGrid.tsx (beyond the test stub).
  - Database, Edge Functions, or migrations.

  ---
  Open Questions

  1. Should Cancelar also skip the dialog when hasDecisions = true? Today
  (and after this fix), clicking Cancelar with unsaved decisions still shows
   the dirty-state dialog due to the navigate(-1) timing issue. The JSON
  suggestion says "salir directamente si no existen cambios" — scoped to the
   no-changes case. If the product intention is that Cancelar always
  discards and navigates immediately (regardless of decisions), the fix
  would need to also change navigate(-1) to navigate("/timesheet/approvals")
   in handleBack. This is a separate product decision. Requires answer from
  Marcelo before scope can expand.
  2. Is the trigger mechanism the Cancel button, the browser back button, or
   both? The bug title says "repetir 2 veces la acción de Cancelar," which
  implies the page's Cancel button. Screenshot 2 confirms the dialog
  appears. The fix removes the block in clean state for all navigation paths
   (Cancel button, browser back, sidebar) — which is the correct behavior.
  No ambiguity for the fix itself, but useful to confirm for testing step 10
   in Verification.

  ---
  Synthesis Notes

  ┌──────────────────────────────┬─────────────────┬───────────────────┐
  │           Decision           │     Origin      │       Type        │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Screenshot analysis detail   │                 │                   │
  │ (all 3 images, per-image     │ Plan A          │ Plan A wins       │
  │ breakdown)                   │                 │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Risk-context file mentions   │                 │                   │
  │ (WorksheetNew.tsx,           │ Plan B          │ Plan B adds value │
  │ Settings.tsx)                │                 │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Primary root cause: locked:  │ Both —          │ Consensus         │
  │ true always                  │ identical       │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Secondary root cause:        │                 │                   │
  │ queueMicrotask timing with   │ Plan A only     │ Plan A adds value │
  │ navigate(-1)                 │                 │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Test coverage gap            │ Plan B          │ Plan B adds value │
  │ observation                  │                 │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Fix: locked: hasDecisions,   │ Both —          │ Consensus         │
  │ isDirty: hasDecisions        │ identical       │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Drop optional                │ Neither         │ Scope reduction — │
  │ shouldLockNavigation         │ (pruned)        │  adds diff noise  │
  │ constant                     │                 │ for no gain       │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ List test file explicitly in │ Plan B          │ Plan B wins —     │
  │  "Files to Change"           │                 │ more concrete     │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Test mock pattern:           │                 │ Plan A wins —     │
  │ capturedLockArgs from        │ Plan A          │ explicit code +   │
  │ Settings test                │                 │ real reference    │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │                              │                 │ Plan A wins —     │
  │ Test IDs: TA5, TA6, TA7      │ Plan A          │ concrete and      │
  │                              │                 │ consistent with   │
  │                              │                 │ existing TA1–TA4  │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ ApprovalTimesheetGrid stub   │ Both — agreed   │ Consensus         │
  │ with test button             │                 │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ LeavePageDialog stub exposes │ Plan A          │ Plan A wins       │
  │  data-is-dirty attribute     │                 │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Detailed 12-step manual      │ Plan A          │ Plan A wins —     │
  │ verification                 │                 │ more executable   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Second test command          │ Plan B          │ Plan B adds       │
  │ including Settings test      │                 │ regression guard  │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Regression risk: timing      │                 │                   │
  │ issue persists               │ Plan A          │ Plan A wins       │
  │ (pre-existing, out of scope) │                 │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Regression risk: future      │ Plan B (with    │ Plan B adds value │
  │ global hook mutation         │ file citations) │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Open Question: dirty-state   │                 │ Plan A wins —     │
  │ Cancel behavior              │ Plan A          │ actionable        │
  │                              │                 │ follow-up         │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │ Open Question: trigger       │ Plan B          │ Plan B adds value │
  │ mechanism                    │                 │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │                              │ Both closed it  │                   │
  │ Drop: screenshot 3 week      │ as "preserve    │ Consensus — not   │
  │ ambiguity as open question   │ reference       │ needed            │
  │                              │ behavior"       │                   │
  ├──────────────────────────────┼─────────────────┼───────────────────┤
  │                              │                 │ Resolved — all    │
  │ Drop: Plan B's "Disagreement │ Plan B          │ three positions   │
  │  Targets" section            │                 │ agreed in         │
  │                              │                 │ synthesis         │
  └──────────────────────────────┴─────────────────┴───────────────────┘