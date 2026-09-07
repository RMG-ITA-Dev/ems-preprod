import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WorkOrderForm, BudgetLineInput, ExpenseBudgetInput } from "@/components/forms/WorkOrderForm";
import { useEngagements, useSetting, useCategories, useWorkOrders } from "@/hooks/useEmsData";
import { useWorksheetByEngagementId } from "@/hooks/useWorksheetData";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useCreateWorkOrder, useCreateBudgetLine, useCreateExpenseBudget, useUpsertPaymentPlan, useBatchUpsertInstallments } from "@/hooks/mutations";
import { toast } from "sonner";
import { useAuthorization } from "@/hooks/useAuthorization";
import type { PaymentPlanInput, PaymentInstallmentInput } from "@/types/workOrderPaymentPlan";
import { applyExchangeRateMode } from "@/lib/workOrderPaymentPlan";

const WorkOrderNew = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const engagementIdParam = searchParams.get("engagement");
  // Guard de creación por permiso vía <PermissionRoute permission="work_order.create"> en App.tsx.
  // El estado del plan de pagos lo edita Admin o Cobranzas, igual que en
  // WorkOrderEdit. La Fase 5 quitó el `useUserRole()` de este componente pero
  // dejó la prop apuntando a un `isAdmin` que ya no existía, así que la pantalla
  // reventaba con "isAdmin is not defined" al elegir el encargo.
  const { can, scope, roleKey } = useAuthorization();
  const isAdmin = roleKey === "admin";

  const { data: engagements, isLoading: engagementsLoading } = useEngagements();
  const { data: categories } = useCategories();
  const { data: workOrders } = useWorkOrders();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const globalTaxRate = useSetting("TAX_RATE");

  const createWorkOrder = useCreateWorkOrder();
  const createBudgetLine = useCreateBudgetLine();
  const createExpenseBudget = useCreateExpenseBudget();
  const upsertPaymentPlan = useUpsertPaymentPlan();
  const batchUpsertInstallments = useBatchUpsertInstallments();

  const [selectedEngagementId, setSelectedEngagementId] = useState("");
  const [currency, setCurrency] = useState<"USD" | "BOB" | "USDT">("BOB");
  const [seasonMode, setSeasonMode] = useState<"High" | "Low">("High");
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [budgetLines, setBudgetLines] = useState<BudgetLineInput[]>([]);
  const [expenseBudget, setExpenseBudget] = useState<ExpenseBudgetInput[]>([]);
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanInput | null>(null);
  const [paymentInstallments, setPaymentInstallments] = useState<PaymentInstallmentInput[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const woIsDirty = !!(selectedEngagementId || budgetLines.length > 0 || expenseBudget.length > 0);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: woIsDirty });
  const taxRate = parseFloat(globalTaxRate || "0.13");

  // Get list of engagement IDs that already have work orders
  const engagementsWithWorkOrders = workOrders?.map((wo) => wo.engagement_id) || [];

  // Filter to active engagements, without existing work orders, created by the current
  // user (BUG 0828-186 Punto D: "creado por mí", no responsable directo). Admin ve todos
  // (decisión del operador, 2026-08-31): ya tiene visibilidad de firma completa vía RLS
  // ('firm' scope en useEngagements()), así que el filtro de autor no debe limitarlo.
  const staffId = staffRecord?.staff_id;
  const availableEngagements = engagements?.filter(
    (e) =>
      e.status === "active" &&
      !engagementsWithWorkOrders.includes(e.engagement_id) &&
      (isAdmin || e.created_by_staff_id === staffId)
  );

  // BUG 0828-186: valida la preselección ?engagement= contra la lista ya filtrada -- un id
  // ajeno, inactivo o con OT existente no debe colarse por URL.
  useEffect(() => {
    if (
      engagementIdParam &&
      !selectedEngagementId &&
      availableEngagements?.some((e) => e.engagement_id === engagementIdParam)
    ) {
      setSelectedEngagementId(engagementIdParam);
    }
  }, [engagementIdParam, availableEngagements, selectedEngagementId]);

  // BUG 0828-186 review: si el encargo elegido deja de estar en la lista filtrada (ej. otro
  // usuario le creó una OT en un refetch de fondo), se limpia la selección para no dejar
  // habilitado el formulario ni el envío con un id que ya no es elegible.
  useEffect(() => {
    if (
      selectedEngagementId &&
      availableEngagements &&
      !availableEngagements.some((e) => e.engagement_id === selectedEngagementId)
    ) {
      setSelectedEngagementId("");
    }
  }, [selectedEngagementId, availableEngagements]);

  const selectedEngagement = availableEngagements?.find((e) => e.engagement_id === selectedEngagementId);

  // Check if selected engagement has a worksheet
  const { data: existingWorksheet } = useWorksheetByEngagementId(selectedEngagementId || undefined);

  // Auto-detect season based on client's industry fiscal year end
  useEffect(() => {
    if (selectedEngagement?.client?.industry) {
      const fiscalYearEnd = selectedEngagement.client.industry.fiscal_year_end;
      const isHighSeason = fiscalYearEnd?.includes("December") || fiscalYearEnd?.includes("31 de diciembre");
      setSeasonMode(isHighSeason ? "High" : "Low");
    }
  }, [selectedEngagement]);

  // Update rates when currency or season changes
  useEffect(() => {
    if (!categories) return;
    
    const effectiveCurrency = currency === "USDT" ? "usd" : currency.toLowerCase();
    setBudgetLines((prev) =>
      prev.map((line) => {
        const category = categories.find((c) => c.category_id === line.category_id);
        if (!category) return line;
        const rateKey = `rate_${seasonMode.toLowerCase()}_${effectiveCurrency}` as keyof typeof category;
        return { ...line, standard_rate: Number(category[rateKey]) || 0 };
      })
    );
  }, [currency, seasonMode, categories]);

  const handleSubmitClick = () => {
    if (!selectedEngagementId) {
      toast.error(t("workOrders.selectEngagementFirst"));
      return;
    }
    // Show confirmation dialog before creating
    setShowConfirmDialog(true);
  };

  const handleConfirmCreate = async () => {
    setShowConfirmDialog(false);

    // Validate before any mutations to avoid partial saves
    if (paymentInstallments.length > 0) {
      if (paymentInstallments.some((i) => i.percentage < 0 || i.percentage > 100)) {
        toast.error(t("workOrders.paymentPlan.validationPercentageRange"));
        return;
      }
      const pctSum = paymentInstallments.reduce((s, i) => s + i.percentage, 0);
      if (Math.abs(pctSum - 100) > 0.01) {
        toast.error(t("workOrders.paymentPlan.validationPercentageSum"));
        return;
      }
    }

    try {
      // Create work order
      const wo = await createWorkOrder.mutateAsync({
        engagement_id: selectedEngagementId,
        currency,
        season_mode: seasonMode,
        tax_rate: taxRate,
        adjustment_amount: adjustmentAmount,
        approval_status: "Draft",
      });

      // Create budget lines
      for (const line of budgetLines) {
        if (line.category_id && line.budgeted_hours > 0) {
          await createBudgetLine.mutateAsync({
            wo_id: wo.wo_id,
            category_id: line.category_id,
            budgeted_hours: line.budgeted_hours,
            standard_rate: line.standard_rate,
          });
        }
      }

      // Create expense budgets
      for (const exp of expenseBudget) {
        if (exp.expense_type_id && exp.budgeted_amount > 0) {
          await createExpenseBudget.mutateAsync({
            wo_id: wo.wo_id,
            expense_type_id: exp.expense_type_id,
            budgeted_amount: exp.budgeted_amount,
          });
        }
      }

      // Persist payment plan if any installments were configured
      if (paymentInstallments.length > 0) {
        const mode = paymentPlan?.exchange_rate_mode ?? "fijo";
        const exchangeRate = paymentPlan?.exchange_rate ?? null;
        const savedPlan = await upsertPaymentPlan.mutateAsync({
          wo_id: wo.wo_id,
          exchange_rate: exchangeRate,
          payment_days: paymentPlan?.payment_days ?? 30,
          exchange_rate_mode: mode,
        });
        await batchUpsertInstallments.mutateAsync({
          planId: savedPlan.plan_id,
          woId: wo.wo_id,
          installments: applyExchangeRateMode(mode, exchangeRate, paymentInstallments),
        });
      }

      toast.success(t("messages.createSuccess", { entity: t("entities.workOrder") }));
      allowNextNavigation();
      navigate(`/work-orders/${wo.wo_id}`);
    } catch (error) {
      // Error handled by mutations
    }
  };

  return (
    <AppLayout title={t("workOrders.newWorkOrder")} focusMode>
      <div className="space-y-6">
        {/* Engagement Selection */}
        {!selectedEngagementId && (
          <Card>
            <CardHeader>
              <CardTitle>{t("workOrders.selectEngagement")}</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Tres estados distintos, antes colapsados en dos: `engagements`
                  viene `undefined` mientras carga, y `undefined?.length === 0` es
                  FALSE, así que se caía al select con el desplegable vacío y sin
                  explicación (reportado 2026-07-31 por un Socio sin encargos
                  asignados). Ahora: cargando / sin encargos disponibles / lista. */}
              {engagementsLoading || staffLoading ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : !availableEngagements?.length ? (
                <Alert>
                  <AlertDescription className="flex flex-col gap-2">
                    {/* La lista viene filtrada por RLS: work_order.create con alcance
                        assigned_engagements (Socio, Gerente, ITA/TAX) solo ve SUS encargos.
                        Decir "todos los encargos activos" afirma algo de toda la firma que
                        ese usuario no puede saber, así que el mensaje se ajusta al alcance. */}
                    <span>
                      {scope("work_order.create") === "firm"
                        ? t("workOrders.allEngagementsHaveWorkOrders")
                        : t("workOrders.noAssignedEngagementsAvailable")}
                    </span>
                    {/* El enlace solo si puede crear encargos: el Socio NO tiene
                        engagement.create, así que antes lo mandaba al 403 de PermissionRoute. */}
                    {can("engagement.create") && (
                      <Link to="/engagements/new" className="text-primary hover:underline font-medium">
                        {t("workOrders.createEngagementFirst")}
                      </Link>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="max-w-md">
                  <Label>{t("entities.engagement")}</Label>
                  <Select value={selectedEngagementId} onValueChange={setSelectedEngagementId}>
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder={t("engagement.selectClient")} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEngagements?.map((eng) => (
                        <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                          {eng.engagement_code} - {eng.engagement_name} ({eng.client?.client_legal_name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex justify-end mt-4">
                <Button
                  variant="cancel"
                  onClick={() => { allowNextNavigation(); navigate("/work-orders"); }}
                  className="btn-action"
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show engagement info */}
        {selectedEngagement && (
          <>
            <Card className="bg-muted/30">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("entities.engagement")}</p>
                    <p className="font-semibold">{selectedEngagement.engagement_code} - {selectedEngagement.engagement_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedEngagement.client?.client_legal_name}</p>
                  </div>
                  {selectedEngagement.client?.industry && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{t("industry.fiscalYearEnd")}</p>
                      <p className="font-medium">{selectedEngagement.client.industry.fiscal_year_end}</p>
                      <p className="text-xs text-muted-foreground">
                        {seasonMode === "High" ? t("industry.highSeason") : t("industry.lowSeason")} ({t("workOrders.autoDetected")})
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Show worksheet recommendation if one exists */}
            {existingWorksheet && !existingWorksheet.wo_id && (
              <Card className="border-primary/50 bg-primary/5">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    {t("workMatrix.worksheetExists")}
                  </CardTitle>
                  <CardDescription>
                    {t("workMatrix.worksheetExistsDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-2">
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/worksheets/${existingWorksheet.id}`)}
                  >
                    {t("workMatrix.useWorksheet")}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Work Order Form */}
        {selectedEngagementId && (
          <WorkOrderForm
            currency={currency}
            seasonMode={seasonMode}
            approvalStatus="Draft"
            adjustmentAmount={adjustmentAmount}
            taxRate={taxRate}
            budgetLines={budgetLines}
            expenseBudget={expenseBudget}
            isNew={true}
            isDirty={false}
            onCurrencyChange={setCurrency}
            onSeasonChange={setSeasonMode}
            onAdjustmentChange={setAdjustmentAmount}
            onBudgetLinesChange={setBudgetLines}
            onExpenseBudgetChange={setExpenseBudget}
            onSubmit={handleSubmitClick}
            onCancel={() => { allowNextNavigation(); navigate("/work-orders"); }}
            isLocked={false}
            canApprove={false}
            isSubmitting={createWorkOrder.isPending}
            woId=""
            paymentPlan={paymentPlan}
            paymentInstallments={paymentInstallments}
            isAdminDateEditable={false}
            // 0722-156b (Amendment 2026-09-07): Cobranza/Estado/TC por cuota son el registro de
            // lo que efectivamente pasa post-aprobacion -- una OT recien creada siempre esta
            // Draft, asi que nunca son editables aca (evita ademas depender de un boton
            // "Guardar" que WorkOrderForm no ofrece fuera de Draft/socioCorrecting).
            isStatusEditable={false}
            onPaymentPlanChange={setPaymentPlan}
            onPaymentInstallmentsChange={setPaymentInstallments}
          />
        )}
      </div>

      {/* Confirmation Dialog for Currency/Season */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("workOrders.confirmParametersTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("workOrders.confirmParametersDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("workOrders.selectedCurrency")}:</span>
              <span className="font-medium">{currency}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("workOrders.selectedSeason")}:</span>
              <span className="font-medium">
                {seasonMode === "High" ? t("industry.high") : t("industry.low")}
              </span>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCreate}>
              {t("workOrders.confirmAndCreate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <LeavePageDialog blocker={blocker} isDirty={woIsDirty} />
    </AppLayout>
  );
};

export default WorkOrderNew;
