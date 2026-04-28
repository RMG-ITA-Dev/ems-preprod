# 0319-86 Plan

  ## Context

  The bug is that the Nueva Orden de Trabajo page has no visible Cancelar or
  Salir action when the user is still on the initial engagement-selection
  step, before choosing an Encargo. In this repository, that flow lives in
  src/pages/WorkOrderNew.tsx:35, with the reusable form actions rendered by
  src/components/forms/WorkOrderForm.tsx:83. The route entry is defined in
  src/App.tsx:85, and the list page that launches the flow is src/pages/
  WorkOrders.tsx:243. Focus-mode layout behavior is controlled by src/
  components/layout/AppLayout.tsx:14 and src/components/layout/
  AppHeader.tsx:49.

  The screenshot shows the create page in focus mode with the title Nueva
  Orden de Trabajo, a single card titled Seleccionar Encargo, one empty
  select input, and no visible footer actions, sidebar, or back affordance.
  That confirms the written description for the create flow. It also adds an
  important detail the text does not spell out: because focus mode hides
  normal navigation chrome, the missing cancel button leaves the user with
  no obvious in-app exit on that screen.

  ## Root Cause Hypothesis

  1. In src/pages/WorkOrderNew.tsx:156, the initial selection UI is rendered
     only when !selectedEngagementId, but that branch contains only the
     selection card and no action row with Cancelar.
  2. The cancel action for work orders is currently provided only through
     WorkOrderForm via the onCancel prop at src/pages/WorkOrderNew.tsx:243
     and rendered in src/components/forms/WorkOrderForm.tsx:591. Because the
     form itself is gated behind selectedEngagementId at src/pages/
     WorkOrderNew.tsx:242, the cancel button does not exist until after an
     engagement has already been selected.
  3. In focus mode, src/components/layout/AppLayout.tsx:21 removes the
     sidebar and src/components/layout/AppLayout.tsx:35 removes mobile
     navigation, while src/components/layout/AppHeader.tsx:53 also hides the
     sidebar trigger. So the missing page-level cancel is not a minor UI
     omission; it removes the only explicit navigation reversal mechanism
     required by the repo rules.
  4. The packet mentions create and edit, but the code only shows this exact
     “before selecting engagement” state on the create page. src/pages/
     WorkOrderEdit.tsx:257 loads an existing work order and always renders
     WorkOrderForm, so its cancel button should already be present once the
     record is loaded.

  ## Proposed Fix

  Make the smallest safe change in WorkOrderNew only:

  Add a page-level Cancelar button to the pre-selection branch, shown when !
  selectedEngagementId, wired to the same navigation target already used by
  the form-level cancel: call allowNextNavigation() and then navigate("/
  work-orders").

  That keeps behavior consistent with the existing work-order flow, avoids
  touching WorkOrderForm, avoids duplicate cancel buttons after an
  engagement is selected, and directly addresses the state shown in the
  screenshot.

  ## Files to Change

  - src/pages/WorkOrderNew.tsx
    Add a conditional action row for the initial selection state with a
    Button variant="cancel" that navigates back to /work-orders using
    allowNextNavigation() first. Keep the existing form-level cancel
    unchanged for the post-selection state.
  - src/pages/__tests__/WorkOrderNew.focus-cancel.test.tsx
    Add focused page-level tests for the missing-cancel scenario in the
    create flow.

  ## Tests to Add or Update

  - src/pages/__tests__/WorkOrderNew.focus-cancel.test.tsx
    Assert that focusMode is enabled on the page.
    Assert that when no engagement is selected, a common.cancel button is
    rendered.
    Assert that clicking that cancel button calls allowNextNavigation() and
    navigates to /work-orders.
    Assert that after an engagement is selected, the page still exposes a
    cancel action through the form flow and does not regress into duplicate
    or missing actions.

  I would model this test after the existing focus/cancel page tests such as
  src/pages/__tests__/Settings.global-focus-cancel.test.tsx:55 and src/
  pages/__tests__/TimeSheet.focus-lock.test.tsx:42.

  ## Verification Steps

  1. Automated checks:

     npx vitest run src/pages/__tests__/WorkOrderNew.focus-cancel.test.tsx
     npx eslint src/pages/WorkOrderNew.tsx src/pages/__tests__/
  WorkOrderNew.focus-cancel.test.tsx
  2. Manual reproduction:
     Open /work-orders.
     Click Nueva Orden de Trabajo.
     Confirm that before selecting an engagement, a visible Cancelar button
     appears on the page.
     Click Cancelar.
     Confirm navigation returns to /work-orders without trapping the user on
     the page.
  3. Regression checks:
     Re-open /work-orders/new.
     Select an engagement.
     Confirm the existing form-level cancel button is still present.
     Confirm save/submit actions still render exactly as before.
     If the page is dirty after selection, confirm browser/back navigation
     still uses LeavePageDialog as before; the new explicit cancel should
     continue to bypass the blocker through allowNextNavigation().

  ## Regression Risks

  - Low risk of visual duplication if the new button is rendered outside
    the !selectedEngagementId branch or if the condition is incorrect.
  - Low risk of inconsistent navigation if the new cancel target differs
    from the existing WorkOrderForm cancel behavior.
  - Low risk of bypassing leave protection incorrectly if
    allowNextNavigation() is omitted from the new button handler.

  ## Out of Scope

  - Any redesign of the work-order create layout beyond adding the missing
    cancel affordance.
  - Changes to WorkOrderEdit unless separate reproduction shows a real
    missing-cancel issue there.
  - Changing navigation semantics from /work-orders to history-back
    behavior.
  - Broader audit of focus-mode pages outside this bug.

  ## Open Questions

  - The packet says the issue affects both creation and editing, but the
    screenshot and code only clearly support the create-page pre-selection
    state. Is there a separate edit-path reproduction that was not included
    in the packet?
  - The suggestion says “regresar a la pantalla anterior.” The current work-
    order form already routes cancel to /work-orders, not browser history. I
    recommend preserving that existing convention unless product explicitly
    wants true history-back behavior.

  ## Disagreement Targets

  - Another planner may propose fixing this in WorkOrderForm so cancel is
    “centralized.” I prefer a WorkOrderNew-only fix because the bug exists
    before WorkOrderForm is mounted, and changing the shared form increases
    surface area with no benefit.
  - Another planner may propose a header-level back button. I prefer a local
    page-level Cancelar button because the repo rules explicitly say “No
    back arrows” and other focus-mode forms already use cancel-style
    actions.
  - Another planner may propose changing cancel to navigate(-1). I prefer
    navigate("/work-orders") because that is the existing work-order cancel
    contract in both new and edit flows, so it is the safer consistency-
    preserving choice.