Bug Fix Plan — 0319-86: Missing Cancel button in Work Order creation form
  before engagement selection

  Context

  Bug ID: 0319-86 | Módulo: PRINCIPAL-Ordenes de Trabajo | Prioridad: Baja

  The Work Order creation page (/work-orders/new) opens in focusMode, which
  hides the sidebar and all navigation controls. The page has a two-phase
  flow:

  1. Pre-selection phase — a "Seleccionar Encargo" card is shown with an
  engagement dropdown. No WorkOrderForm is rendered yet.
  2. Post-selection phase — once an engagement is chosen, WorkOrderForm
  renders; it contains a Cancel button (via onCancel prop).

  Screenshot analysis: The screenshot (0319-86.png) shows exactly the
  pre-selection phase: the Nueva Orden de Trabajo page with only the
  "Seleccionar Encargo" card and its "Seleccionar un cliente" dropdown
  visible. The rest of the screen is blank. There is no Cancel, Back, or
  Exit button anywhere on the page. Since focusMode hides the sidebar and
  bottom nav, the user has no in-app escape route — the only option is the
  browser's native back button.

  The bug description says "Formulario de Creación y Edición antes de
  seleccionar el Encargo." In the edit flow (/work-orders/:id), the
  WorkOrderForm is always rendered (engagement is already known from the
  work order record) and onCancel is always passed, so the Cancel button is
  visible there. The missing Cancel button is exclusively in the
  pre-selection phase of the creation form.

  Relevant files:
  - src/pages/WorkOrderNew.tsx — the page with the missing Cancel button
  - src/components/forms/WorkOrderForm.tsx — the sub-form that has a Cancel
  button, but only renders after engagement selection
  - src/pages/WorkOrderEdit.tsx — edit page; Cancel button always present
  via WorkOrderForm

  ---
  Root Cause Hypothesis

  src/pages/WorkOrderNew.tsx, lines 156–189:

  {!selectedEngagementId && (
    <Card>
      <CardHeader>
        <CardTitle>{t("workOrders.selectEngagement")}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* dropdown or "no engagements" alert */}
      </CardContent>
    </Card>
  )}

  This block renders only the selection card with no Cancel button. The
  WorkOrderForm that contains the Cancel button is guarded by
  {selectedEngagementId && ...} at line 242 — it does not render until an
  engagement is selected.

  The allowNextNavigation function (line 59) and navigate (line 37) are
  already declared in scope and used identically in the post-selection
  onCancel handler at line 259:

  onCancel={() => { allowNextNavigation(); navigate("/work-orders"); }}

  No new infrastructure is needed — the fix is purely additive: one Cancel
  button in the pre-selection block.

  ---
  Proposed Fix

  Add a Cancel button to the pre-selection card in WorkOrderNew.tsx. It
  must:
  - Use variant="cancel" (consistent with WorkOrderForm's Cancel button at
  line 593 of WorkOrderForm.tsx)
  - Call allowNextNavigation() then navigate("/work-orders") (same handler
  as line 259)
  - Use {t("common.cancel")} — the key already exists ("cancel": "Cancel" /
  "cancel": "Cancelar")
  - Appear as a right-aligned action row below the dropdown, inside the
  CardContent

  No new i18n keys. No changes to WorkOrderForm.tsx, WorkOrderEdit.tsx, or
  any locale file.

  ---
  Files to Change

  src/pages/WorkOrderNew.tsx

  Single change — add a Cancel button row inside the pre-selection
  CardContent, after the dropdown <div> (around line 186, before
  </CardContent>):

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
  +            <div className="flex justify-end mt-4">
  +              <Button
  +                variant="cancel"
  +                onClick={() => { allowNextNavigation();
  navigate("/work-orders"); }}
  +                className="btn-action"
  +              >
  +                {t("common.cancel")}
  +              </Button>
  +            </div>
             )}
           </CardContent>

  The Cancel button must also appear in the availableEngagements?.length ===
   0 branch (when all engagements already have work orders). That branch
  currently shows an Alert with a link to create an engagement, but no way
  to leave the page either.

  Full change covers both branches inside CardContent:

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
                 {/* ...Select... */}
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

  Placing the Cancel <div> after the if/else (but still inside CardContent)
  means it renders in both the "dropdown" and the "all engaged" branches
  with one declaration.

  ---
  Tests to Add or Update

  New file: src/pages/__tests__/WorkOrderNew.cancel.test.tsx

  No existing tests cover WorkOrderNew. The new test renders the page with
  mocked hooks returning empty data and asserts the Cancel button is present
   before an engagement is selected.

  Required mocks (all from the same pattern as EngagementForm.test.tsx):
  - @/hooks/useEmsData → useEngagements returns [], useWorkOrders returns
  [], useCategories returns [], useSetting returns "0.13"
  - @/hooks/useWorksheetData → useWorksheetByEngagementId returns undefined
  - @/hooks/mutations → useCreateWorkOrder, useCreateBudgetLine,
  useCreateExpenseBudget return { mutateAsync: vi.fn(), isPending: false }
  - @/hooks/usePageLeaveLock → returns { blocker: null, allowNextNavigation:
   vi.fn() }
  - react-router-dom → useNavigate returns vi.fn(), useSearchParams returns
  [new URLSearchParams(), vi.fn()]

  Test cases:
  describe("WorkOrderNew — pre-selection Cancel button (BUG 0319-86)", () =>
   {
    it("renders a Cancel button before an engagement is selected", () => {
      // render <WorkOrderNew />
      // expect screen.getByRole("button", { name: /cancel/i }) to be in the
   document
    });

    it("Cancel button navigates to /work-orders", async () => {
      // render <WorkOrderNew />
      // userEvent.click(getByRole("button", { name: /cancel/i }))
      // expect mockNavigate to have been called with "/work-orders"
    });
  });

  Run command:
  npx vitest run src/pages/__tests__/WorkOrderNew.cancel.test.tsx

  ---
  Verification Steps

  1. npm run dev
  2. Navigate to Ordenes de Trabajo → Nueva Orden de Trabajo
  (/work-orders/new).
  3. Before selecting any engagement: confirm a Cancelar button is visible
  in the lower-right of the "Seleccionar Encargo" card.
  4. Click Cancelar → should navigate to /work-orders (the work orders
  list).
  5. Navigate again to /work-orders/new. Select an engagement. Confirm the
  Cancel button still appears (now rendered by WorkOrderForm) and behaves
  identically.
  6. Simulate the "all engagements have work orders" state (or verify in an
  environment where it applies): confirm the Cancel button also appears in
  that alert branch.
  7. npx vitest run src/pages/__tests__/WorkOrderNew.cancel.test.tsx → both
  cases in green.

  ---
  Regression Risks

  Riesgo: The new Cancel button's allowNextNavigation() call bypasses the
    usePageLeaveLock guard.
  Mitigación: This is intentional and identical to the existing onCancel
    handler at line 259. woIsDirty is false at the pre-selection phase
    (selectedEngagementId is ""), so the leave-lock is not active
  regardless.
  ────────────────────────────────────────
  Riesgo: The mt-4 spacing on the Cancel <div> may look misaligned on the
    "all engagements" branch, where the Alert already has its own bottom
    margin.
  Mitigación: Visual regression check in step 6 of Verification. Adjust to
    mt-2 or mt-3 if needed.
  ────────────────────────────────────────
  Riesgo: No other component shares the pre-selection Card pattern in this
    file.
  Mitigación: Change is isolated to WorkOrderNew.tsx and additive only.

  ---
  Out of Scope

  - Changes to WorkOrderEdit.tsx (Cancel button already present via
  WorkOrderForm)
  - Changes to WorkOrderForm.tsx
  - Adding a back-arrow to AppHeader in focusMode
  - Any other Work Order form fields or validation
  - Database, Edge Functions, or migrations

  ---
  Open Questions

  1. Navigation target on Cancel: The existing onCancel in both pages
  navigates to /work-orders. The JSON SUGERENCIA says "regresar a la
  pantalla anterior." Should Cancel use navigate(-1) (browser history back)
  instead of the hardcoded /work-orders? If the user arrived from a deep
  link or a different page, navigate(-1) is more correct, but /work-orders
  is consistent with the current pattern. Decision needed from Marcelo.
  2. Button placement: Should the Cancel button be inside the Card (as
  proposed) or outside it, as a standalone row below the card (matching the
  WorkOrderForm button row which sits outside all Cards)? Both are
  functional; this is a visual consistency decision.

✻ Worked for 3m 6s

※ recap: Planning bug fixes for the EMS work order module. Two plans are
  ready: 0306-76 (NIT numeric validation) is synthesized into plan_v2.md.
  Next: save the 0319-86 Cancel button plan to
  bugs/0319-86/plan_claude_v1.md. (disable recaps in /config)