 Bug Fix Plan v2 — 0319-86: Missing Cancel button in Work Order creation
  form before engagement selection

  ---
  Comparison Matrix

  Section: Context
  Plan A position: Pre-selection phase has no Cancel; focusMode hides nav;
    edit form already has Cancel via WorkOrderForm
  Plan B position: Same, plus explicitly cites AppLayout:21/35 and
    AppHeader:53 removing nav chrome in focusMode
  Agreement?: Yes
  Chosen position: Hybrid
  Reason: Both are accurate; Plan B's explicit AppLayout/AppHeader
    observation strengthens the "why this is serious" argument; included in
    context.
  ────────────────────────────────────────
  Section: Root Cause
  Plan A position: Lines 156–189 of WorkOrderNew.tsx (pre-selection card);
    WorkOrderForm gated at line 242; allowNextNavigation + navigate already
    in scope
  Plan B position: Same line numbers; additionally calls out that focusMode
    removes all three nav mechanisms
  Agreement?: Yes
  Chosen position: Both
  Reason: Identical diagnosis; Plan B's emphasis on focusMode side-effects
    retained.
  ────────────────────────────────────────
  Section: Proposed Fix
  Plan A position: Cancel button placed after the ternary, inside
    CardContent, still within {!selectedEngagementId && (...)} — covers both

    branches (dropdown + all-engaged alert) with one declaration
  Plan B position: Cancel button in the pre-selection branch — placement
    unspecified; only dropdown branch mentioned
  Agreement?: Partial
  Chosen position: Plan A
  Reason: Plan A's placement (after the if/else, still inside CardContent)
  is
    more precise and covers the "all engagements" branch automatically with
    zero code duplication. Plan B leaves the "all engaged" branch
    unaddressed.
  ────────────────────────────────────────
  Section: Navigation target
  Plan A position: navigate("/work-orders") — left as open question
  Plan B position: navigate("/work-orders") — explicitly closed as the right

    choice, consistent with existing onCancel convention
  Agreement?: No
  Chosen position: Plan B
  Reason: Plan B explicitly resolves this: keep /work-orders for consistency

    with WorkOrderNew.tsx:259 and WorkOrderEdit.tsx:320. No open question
    remains.
  ────────────────────────────────────────
  Section: Files to Change
  Plan A position: WorkOrderNew.tsx only
  Plan B position: WorkOrderNew.tsx + test file
  Agreement?: Yes
  Chosen position: Both
  Reason: Both agree on the single source file; test file is the appropriate

    additional artifact.
  ────────────────────────────────────────
  Section: Test file name
  Plan A position: src/pages/__tests__/WorkOrderNew.cancel.test.tsx
  Plan B position: src/pages/__tests__/WorkOrderNew.focus-cancel.test.tsx
  Agreement?: No
  Chosen position: Plan B
  Reason: Plan B's naming follows the established codebase convention
    exactly: Settings.global-focus-cancel.test.tsx,
    TimeSheet.focus-lock.test.tsx.
  ────────────────────────────────────────
  Section: Test mock pattern
  Plan A position: Described generically
  Plan B position: Explicitly models after
    Settings.global-focus-cancel.test.tsx and TimeSheet.focus-lock.test.tsx
  Agreement?: No
  Chosen position: Plan B
  Reason: The reference files exist and are the direct pattern to follow.
    Settings.global-focus-cancel.test.tsx tests the exact same scenario
    (focus-mode Cancel button present and navigates).
  ────────────────────────────────────────
  Section: Test cases
  Plan A position: 2 cases: Cancel button renders, click navigates
  Plan B position: 4 assertions: focusMode active, Cancel renders, click
    navigates, post-selection no regression
  Agreement?: No
  Chosen position: Hybrid
  Reason: Keep Plan B's focusMode assertion (TW1) + both plans' core 2 cases

    (TW2, TW3). Drop Plan B's post-selection regression case — it requires
    mounting full WorkOrderForm with many additional mocks, expanding scope
    significantly for marginal value. Total: 3 cases.
  ────────────────────────────────────────
  Section: Verification
  Plan A position: 7 manual steps
  Plan B position: 3 grouped steps + npx eslint
  Agreement?: Partial
  Chosen position: Hybrid
  Reason: Merge into clear numbered steps; include ESLint as a step since
  the
    project uses TypeScript/ESLint.
  ────────────────────────────────────────
  Section: Regression Risks
  Plan A position: 3 risks: allowNextNavigation bypass, mt-4 spacing,
    isolated change
  Plan B position: 3 risks: visual duplication outside condition,
    inconsistent nav target, omitting allowNextNavigation
  Agreement?: Partial
  Chosen position: Union
  Reason: Complementary; all six risks included.
  ────────────────────────────────────────
  Section: Out of Scope
  Plan A position: 5 items: WorkOrderEdit, WorkOrderForm, AppHeader
    back-arrow, fields/validation, DB/edge functions
  Plan B position: 4 items: layout redesign, WorkOrderEdit unless reproduced

    separately, navigate(-1) semantics, broader focusMode audit
  Agreement?: Partial
  Chosen position: Union of both
  Reason: Covers all exclusions without conflicts.
  ────────────────────────────────────────
  Section: Open Questions
  Plan A position: 2: navigate target (now resolved), button placement (now
    resolved by Plan A's diff)
  Plan B position: 2: edit path reproduction (confirmed non-issue), navigate

    target (resolved by Plan B)
  Agreement?: Partial
  Chosen position: None remain
  Reason: All ambiguities resolved in synthesis.

  ---
  Context

  Bug ID: 0319-86 | Módulo: PRINCIPAL-Ordenes de Trabajo | Prioridad: Baja |
   Tester: marceloovando

  The Work Order creation page (/work-orders/new) has a two-phase flow:

  1. Pre-selection phase — a "Seleccionar Encargo" card is shown with an
  engagement dropdown. WorkOrderForm is not yet rendered.
  2. Post-selection phase — once an engagement is chosen, WorkOrderForm
  renders; it contains a Cancel button via its onCancel prop.

  The page uses focusMode, which causes AppLayout (lines 21 and 35 of
  AppLayout.tsx) to hide the sidebar and mobile bottom nav, and AppHeader
  (line 53) to hide the sidebar trigger. This means there is no navigation
  chrome whatsoever during the pre-selection phase — the Cancel button
  missing from that phase is the user's only explicit in-app exit, not just
  a minor convenience.

  Screenshot analysis (0319-86.png): The screenshot shows exactly the
  pre-selection state: title "Nueva Orden de Trabajo", one card titled
  "Seleccionar Encargo", one empty dropdown reading "Seleccionar un
  cliente", and nothing else. No button, no back link, no sidebar. This
  confirms the written description and makes clear the severity: the page is
   a visual dead-end unless the user knows to use the browser's native back
  button.

  Edit form assessment: The bug description mentions "Creación y Edición."
  WorkOrderEdit.tsx always renders WorkOrderForm (engagement is known from
  the work order record), and onCancel is always passed at line 320. The
  Cancel button is therefore already present in the edit flow. No change
  needed there.

  Relevant files:
  - src/pages/WorkOrderNew.tsx — only file that needs changing
  - src/components/forms/WorkOrderForm.tsx — Cancel button rendered at line
  592–596; untouched
  - src/pages/WorkOrderEdit.tsx — already has Cancel button; untouched
  - src/components/layout/AppLayout.tsx — focusMode behavior; untouched
  - src/components/layout/AppHeader.tsx — focusMode behavior; untouched

  ---
  Root Cause

  src/pages/WorkOrderNew.tsx, lines 156–189:

  {!selectedEngagementId && (
    <Card>
      <CardHeader>
        <CardTitle>{t("workOrders.selectEngagement")}</CardTitle>
      </CardHeader>
      <CardContent>
        {availableEngagements?.length === 0 ? (
          <Alert>...</Alert>
        ) : (
          <div className="max-w-md">...</div>
        )}
        {/* ← no Cancel button here */}
      </CardContent>
    </Card>
  )}

  The Cancel button lives inside WorkOrderForm at
  src/components/forms/WorkOrderForm.tsx:592–596, which is guarded by
  {selectedEngagementId && (...)} at WorkOrderNew.tsx:242. It does not mount
   until after an engagement has been selected.

  Both allowNextNavigation (line 59) and navigate (line 37) are already
  declared in scope. The identical handler already exists at line 259:

  onCancel={() => { allowNextNavigation(); navigate("/work-orders"); }}

  No new helpers, hooks, or imports are required — the fix is a single
  additive block.

  ---
  Proposed Fix

  Add one Cancel button <div> inside the pre-selection CardContent, after
  the ternary (availableEngagements?.length === 0 ? ... : ...), but still
  within the {!selectedEngagementId && (...)} outer conditional. This
  placement means a single button declaration covers both inner branches:

  - When engagements are available → the dropdown is shown + Cancel
  - When all engagements already have work orders → the Alert/link is shown
  + Cancel

  The button:
  - Uses variant="cancel" (consistent with WorkOrderForm.tsx:593)
  - Calls allowNextNavigation(); navigate("/work-orders") (identical to
  WorkOrderNew.tsx:259)
  - Uses {t("common.cancel")} — key already exists in both locales

  No new i18n keys. No changes to WorkOrderForm.tsx, WorkOrderEdit.tsx,
  AppLayout.tsx, AppHeader.tsx, or any locale file.

  ---
  Files to Change

  src/pages/WorkOrderNew.tsx — only file modified

  Single additive change at lines 161–188 (inside CardContent, after the
  ternary):

           <CardContent>
             {availableEngagements?.length === 0 ? (
               <Alert>
                 <AlertDescription className="flex flex-col gap-2">

  <span>{t("workOrders.allEngagementsHaveWorkOrders")}</span>
                   <Link to="/engagements/new" className="text-primary
  hover:underline font-medium">
                     {t("workOrders.createEngagementFirst")}
                   </Link>
                 </AlertDescription>
               </Alert>
             ) : (
               <div className="max-w-md">
                 <Label>{t("entities.engagement")}</Label>
                 <Select value={selectedEngagementId}
  onValueChange={setSelectedEngagementId}>
                   <SelectTrigger className="mt-2">
                     <SelectValue placeholder={t("engagement.selectClient")}
   />
                   </SelectTrigger>
                   <SelectContent>
                     {availableEngagements?.map((eng) => (
                       <SelectItem key={eng.engagement_id}
  value={eng.engagement_id}>
                         {eng.engagement_code} - {eng.engagement_name}
  ({eng.client?.client_legal_name})
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
             )}
  +          <div className="flex justify-end mt-4">
  +            <Button
  +              variant="cancel"
  +              onClick={() => { allowNextNavigation();
  navigate("/work-orders"); }}
  +              className="btn-action"
  +            >
  +              {t("common.cancel")}
  +            </Button>
  +          </div>
           </CardContent>

  No other changes anywhere in the file.

  ---
  Tests

  New file: src/pages/__tests__/WorkOrderNew.focus-cancel.test.tsx

  Modeled after the established pattern in
  src/pages/__tests__/Settings.global-focus-cancel.test.tsx (which tests the
   same scenario: focus-mode Cancel button present and navigates). Three
  test cases:

  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import React from "react";

  const mockNavigate = vi.fn();
  const mockAllowNextNavigation = vi.fn();

  vi.mock("react-router-dom", async () => {
    const actual = await vi.importActual("react-router-dom");
    return {
      ...actual,
      useNavigate: () => mockNavigate,
      useSearchParams: () => [new URLSearchParams(), vi.fn()],
    };
  });

  vi.mock("@/hooks/usePageLeaveLock", () => ({
    usePageLeaveLock: () => ({
      blocker: { state: "unblocked" as const, reset: vi.fn(), proceed:
  vi.fn() },
      allowNextNavigation: mockAllowNextNavigation,
    }),
  }));

  vi.mock("@/hooks/useEmsData", () => ({
    useEngagements: () => ({ data: [] }),
    useWorkOrders: () => ({ data: [] }),
    useCategories: () => ({ data: [] }),
    useSetting: () => "0.13",
  }));

  vi.mock("@/hooks/useWorksheetData", () => ({
    useWorksheetByEngagementId: () => ({ data: undefined }),
  }));

  vi.mock("@/hooks/mutations", () => ({
    useCreateWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateBudgetLine: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateExpenseBudget: () => ({ mutateAsync: vi.fn(), isPending: false
  }),
  }));

  vi.mock("@/components/layout/AppLayout", () => ({
    AppLayout: ({ children, focusMode }: any) => (
      <div data-testid="app-layout"
  data-focus-mode={focusMode}>{children}</div>
    ),
  }));

  vi.mock("@/components/ui/leave-page-dialog", () => ({
    LeavePageDialog: () => <div data-testid="leave-page-dialog" />,
  }));

  vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" }
  }),
  }));

  import WorkOrderNew from "../WorkOrderNew";

  describe("WorkOrderNew focus-cancel (BUG 0319-86)", () => {
    let queryClient: QueryClient;

    beforeEach(() => {
      vi.clearAllMocks();
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry:
  false } },
      });
    });

    const renderPage = () =>
      render(
        <QueryClientProvider client={queryClient}>
          <WorkOrderNew />
        </QueryClientProvider>
      );

    it("TW1: page is rendered in focusMode", () => {
      renderPage();

  expect(screen.getByTestId("app-layout").dataset.focusMode).toBe("true");
    });

    it("TW2: Cancel button is present before any engagement is selected", ()
   => {
      renderPage();
      expect(screen.getByText("common.cancel")).toBeInTheDocument();
    });

    it("TW3: clicking Cancel calls allowNextNavigation and navigates to
  /work-orders", async () => {
      renderPage();
      const user = userEvent.setup();
      await user.click(screen.getByText("common.cancel"));
      expect(mockAllowNextNavigation).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith("/work-orders");
    });
  });

  Run command:
  npx vitest run src/pages/__tests__/WorkOrderNew.focus-cancel.test.tsx

  ---
  Verification Steps

  1. npm run dev
  2. Navigate to Ordenes de Trabajo → Nueva Orden de Trabajo
  (/work-orders/new).
  3. Before selecting any engagement: confirm a Cancelar button is visible
  in the lower-right of the "Seleccionar Encargo" card.
  4. Click Cancelar → confirm navigation goes to /work-orders (the list
  page).
  5. Navigate again to /work-orders/new. Select an engagement from the
  dropdown. Confirm:
    - The pre-selection card disappears and WorkOrderForm renders.
    - The form-level Cancel button (from WorkOrderForm) is still present and
   behaves identically.
    - There is exactly one Cancel button on the page (no duplication).
  6. In an environment where all active engagements already have work orders
   (or temporarily mock availableEngagements to []): confirm the Cancel
  button is also visible below the "all engaged" Alert.
  7. Run automated tests and lint:
  npx vitest run src/pages/__tests__/WorkOrderNew.focus-cancel.test.tsx
  npx eslint src/pages/WorkOrderNew.tsx
  src/pages/__tests__/WorkOrderNew.focus-cancel.test.tsx
  7. All 3 test cases green; no ESLint errors.

  ---
  Regression Risks

  Riesgo: Cancel button renders outside the {!selectedEngagementId && (...)}

    guard, causing it to appear alongside the form-level Cancel after
    selection (visual duplication).
  Mitigación: The added <div> is placed inside the outer
    {!selectedEngagementId && (...)} conditional (lines 156–190). Verified
  by
     step 5 of Verification.
  ────────────────────────────────────────
  Riesgo: New Cancel handler omits allowNextNavigation(), allowing the
    usePageLeaveLock blocker to intercept and show LeavePageDialog.
  Mitigación: The handler is () => { allowNextNavigation();
    navigate("/work-orders"); } — identical to the existing handler at line
    259. Test case TW3 explicitly asserts mockAllowNextNavigation was
  called.
  ────────────────────────────────────────
  Riesgo: New Cancel navigates to a different target than the form-level
    Cancel, creating inconsistent behavior.
  Mitigación: Both use navigate("/work-orders"). Test case TW3 asserts the
    exact call.
  ────────────────────────────────────────
  Riesgo: mt-4 top margin on the Cancel <div> looks inconsistent in the "all

    engagements" Alert branch (Alert already has its own spacing).
  Mitigación: Visual check in Verification step 6. Adjust to mt-2 or mt-3 if

    the spacing looks excessive; functional behavior is unaffected.
  ────────────────────────────────────────
  Riesgo: Change is isolated to WorkOrderNew.tsx, additive only. No shared
    components are touched.
  Mitigación: Confirmed — no other file is modified.

  ---
  Out of Scope

  - Changes to WorkOrderEdit.tsx (Cancel button is already present via
  WorkOrderForm once data loads)
  - Changes to WorkOrderForm.tsx
  - Adding a back-arrow or breadcrumb to AppHeader in focusMode
  - Changing Cancel navigation from /work-orders to navigate(-1) (browser
  history back)
  - Any other Work Order form fields, validation, or layout changes
  - Broader audit of focusMode pages for missing Cancel buttons
  - Database, migrations, or Edge Functions

  ---
  Open Questions

  None. All ambiguities from the individual plans are resolved:

  Question: navigate(-1) vs navigate("/work-orders")?
  Resolution: Use /work-orders — consistent with existing onCancel at
    WorkOrderNew.tsx:259 and WorkOrderEdit.tsx:320. Plan B explicitly closes

    this.
  ────────────────────────────────────────
  Question: Button inside Card vs outside Card?
  Resolution: Inside CardContent, after the ternary — Plan A's concrete diff

    resolves this. Covers both inner branches with one declaration.
  ────────────────────────────────────────
  Question: Does the edit form (WorkOrderEdit) also need a fix?
  Resolution: No — WorkOrderForm always renders in the edit flow (engagement

    is known from the work order record) and onCancel is always passed (line

    320). No reproduction exists for the edit path.

  ---
  Synthesis Notes

  Decision: Root cause diagnosis (lines 156, 242, allowNextNavigation in
    scope)
  Origin: Both plans — identical
  Type: Consensus
  ────────────────────────────────────────
  Decision: Only WorkOrderNew.tsx needs changing
  Origin: Both plans — identical
  Type: Consensus
  ────────────────────────────────────────
  Decision: Cancel placed after ternary inside CardContent (covers both
    branches)
  Origin: Plan A
  Type: Plan A wins
  ────────────────────────────────────────
  Decision: "All engagements" Alert branch also lacks Cancel — must be
    covered
  Origin: Plan A
  Type: Plan A — Plan B silent on this
  ────────────────────────────────────────
  Decision: Use navigate("/work-orders") — open question closed
  Origin: Plan B
  Type: Plan B wins
  ────────────────────────────────────────
  Decision: Test file name: WorkOrderNew.focus-cancel.test.tsx
  Origin: Plan B — matches Settings.global-focus-cancel,
  TimeSheet.focus-lock
    convention
  Type: Plan B wins
  ────────────────────────────────────────
  Decision: Test mock pattern: follow Settings.global-focus-cancel.test.tsx
    exactly
  Origin: Plan B — references real existing files
  Type: Plan B wins
  ────────────────────────────────────────
  Decision: Test case TW1 (focusMode assertion on AppLayout)
  Origin: Plan B
  Type: Plan B wins
  ────────────────────────────────────────
  Decision: Test cases TW2 + TW3 (Cancel present, click navigates)
  Origin: Both plans
  Type: Consensus
  ────────────────────────────────────────
  Decision: Post-selection regression test case dropped
  Origin: Neither plan — dropped as scope expansion requiring full
    WorkOrderForm mocks
  Type: Hybrid (pruned)
  ────────────────────────────────────────
  Decision: No open questions remain
  Origin: Both ambiguities resolved within synthesis
  Type: Hybrid