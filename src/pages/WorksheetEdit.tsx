import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Save, Loader2, FileText, Sun, Snowflake, Lock, Copy } from "lucide-react";
import { useWorksheetById } from "@/hooks/useWorksheetData";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useBatchUpsertCells, useUpdateWorksheet, useCreateWorkOrderFromWorksheet } from "@/hooks/useWorksheetMutations";
import { useCategories, useActivityCodes, useAllActivityCodes, useSetting, useServices } from "@/hooks/useEmsData";
import { WorksheetGrid } from "@/components/worksheet/WorksheetGrid";
import { CopyFromEngagementDialog } from "@/components/worksheet/CopyFromEngagementDialog";
import { filterActivitiesByService } from "@/lib/activityFilters";
import { WorksheetCell } from "@/hooks/useWorksheetData";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const statusColors: Record<string, string> = {
  draft: "bg-warning text-warning-foreground",
  approved: "bg-success text-success-foreground",
  archived: "bg-muted text-muted-foreground",
};

const WorksheetEdit = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const { data: worksheet, isLoading: wsLoading } = useWorksheetById(id);
  const { data: categories, isLoading: catLoading } = useCategories();
  const { data: activityCodes, isLoading: actLoading } = useActivityCodes();
  const { data: allActivityCodes, isLoading: allActLoading } = useAllActivityCodes();
  const { data: services, isLoading: svcLoading } = useServices();
  const globalTaxRate = useSetting("TAX_RATE");
  
  const batchUpsertCells = useBatchUpsertCells();
  const updateWorksheet = useUpdateWorksheet();
  const createWOFromWorksheet = useCreateWorkOrderFromWorksheet();

  // Local state for unsaved changes
  const [localCells, setLocalCells] = useState<Map<string, number>>(new Map());
  const [notes, setNotes] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty: hasUnsavedChanges });
  
  // Copy from engagement dialog state
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [gridKey, setGridKey] = useState(0);

  // Create WO dialog state
  const [showCreateWODialog, setShowCreateWODialog] = useState(false);
  const [woCurrency, setWOCurrency] = useState<"USD" | "BOB">("BOB");
  const [woSeasonMode, setWOSeasonMode] = useState<"High" | "Low">("High");
  const [confirmCreate, setConfirmCreate] = useState(false);

  const taxRate = parseFloat(globalTaxRate || "0.13");

  // Initialize notes when worksheet loads
  useEffect(() => {
    if (worksheet?.notes !== undefined && notes === "") {
      setNotes(worksheet.notes || "");
    }
    // Auto-detect season from client's industry when opening dialog
    if (worksheet?.engagement?.client?.industry) {
      const fiscalYearEnd = worksheet.engagement.client.industry.fiscal_year_end;
      const isHighSeason = fiscalYearEnd?.includes("December") || fiscalYearEnd?.includes("31 de diciembre");
      setWOSeasonMode(isHighSeason ? "High" : "Low");
    }
  }, [worksheet?.notes, worksheet?.engagement?.client?.industry, notes]);

  // Filter active activity codes only
  const activeActivities = useMemo(
    () => activityCodes?.filter((a) => a.is_active) || [],
    [activityCodes]
  );

  // The matrix is auto-scoped to the engagement's service (engagement.practica
  // matches services.code — see src/lib/activityFilters.ts). No manual filter.
  const practica = worksheet?.engagement?.practica ?? null;

  const engagementServiceId = useMemo(
    () => (services ?? []).find((s) => s.code === practica)?.service_id,
    [services, practica]
  );

  const scopedCategories = useMemo(() => {
    if (!categories) return categories;
    return categories.filter((c) => c.service_id === engagementServiceId);
  }, [categories, engagementServiceId]);

  const scopedActivities = useMemo(
    () => filterActivitiesByService(activeActivities, practica),
    [activeActivities, practica]
  );

  // Destructive allow-lists for save/copy. `undefined` = scoping doesn't apply
  // (engagement has no resolved service, OR the category/activity catalog isn't
  // actually loaded — which includes a query error, not just the initial
  // loading window already covered by `isLoading` above) — callers must keep
  // every existing cell rather than purge, since the cleanup migration also
  // leaves these no-service worksheets untouched. Guarding on the raw
  // `categories`/`allActivityCodes` query data (not just `engagementServiceId`)
  // matters because React Query's `isLoading` only reflects the *first* fetch:
  // once a query settles into an error state, `isLoading` is false but `data`
  // stays `undefined` forever, and `(data ?? [])` would otherwise silently read
  // as "empty catalog" and wipe every cell on the next save (review.md
  // iteración 10). When defined, built from ALL activity codes (not just the
  // active ones shown in the grid via `useActivityCodes()`, which already
  // excludes inactive rows server-side) so historical hours on an activity
  // later marked inactive aren't silently dropped by an unrelated save.
  // Matches on the raw `service_id` FK directly (no `services.code` round-trip
  // needed).
  const scopedCategoryIdsForSave = useMemo(() => {
    if (engagementServiceId === undefined || !scopedCategories) return undefined;
    return new Set(scopedCategories.map((c) => c.category_id));
  }, [scopedCategories, engagementServiceId]);

  const scopedActivityIdsForSave = useMemo(() => {
    if (engagementServiceId === undefined || !allActivityCodes) return undefined;
    return new Set(
      allActivityCodes
        .filter((a) => a.service_id == null || a.service_id === engagementServiceId)
        .map((a) => a.activity_id)
    );
  }, [allActivityCodes, engagementServiceId]);

  const handleCellChange = useCallback(
    (categoryId: string, activityId: string, hours: number) => {
      const key = `${categoryId}|${activityId}`;
      setLocalCells((prev) => {
        const newMap = new Map(prev);
        newMap.set(key, hours);
        return newMap;
      });
      setHasUnsavedChanges(true);
    },
    []
  );

  const handleSave = async () => {
    if (!worksheet || !id) return;

    // Prepare cells for batch upsert
    const cellsToSave: { worksheet_id: string; category_id: string; activity_id: string; budget_hours: number }[] = [];

    // Start with existing cells
    const existingCellsMap = new Map<string, number>();
    worksheet.cells.forEach((cell) => {
      existingCellsMap.set(`${cell.category_id}|${cell.activity_id}`, cell.budget_hours);
    });

    // Merge with local changes
    localCells.forEach((hours, key) => {
      existingCellsMap.set(key, hours);
    });

    // Only persist cells that belong to the engagement's service. This purges
    // any stray out-of-service cells left over from before this fix. When the
    // engagement has no resolved service, the allow-lists are `undefined` and
    // every existing cell is kept as-is (no scope to purge against).
    // Convert to array
    existingCellsMap.forEach((hours, key) => {
      const [categoryId, activityId] = key.split("|");
      if (scopedCategoryIdsForSave && !scopedCategoryIdsForSave.has(categoryId)) return;
      if (scopedActivityIdsForSave && !scopedActivityIdsForSave.has(activityId)) return;
      cellsToSave.push({
        worksheet_id: id,
        category_id: categoryId,
        activity_id: activityId,
        budget_hours: hours,
      });
    });

    try {
      // Save cells
      await batchUpsertCells.mutateAsync({
        worksheetId: id,
        cells: cellsToSave,
      });

      // Update notes if changed
      if (notes !== worksheet.notes) {
        await updateWorksheet.mutateAsync({
          id,
          notes,
        });
      }

      setLocalCells(new Map());
      setHasUnsavedChanges(false);
    } catch (error) {
      logger.error("Error saving worksheet:", error);
    }
  };

  // Merge worksheet cells with local changes for display
  const mergedCells = useMemo(() => {
    if (!worksheet) return [];
    
    const cellsMap = new Map<string, typeof worksheet.cells[0]>();
    
    // Add existing cells
    worksheet.cells.forEach((cell) => {
      cellsMap.set(`${cell.category_id}|${cell.activity_id}`, cell);
    });

    // Apply local changes
    localCells.forEach((hours, key) => {
      const existing = cellsMap.get(key);
      if (existing) {
        cellsMap.set(key, { ...existing, budget_hours: hours });
      } else {
        const [categoryId, activityId] = key.split("|");
        cellsMap.set(key, {
          id: `local-${key}`,
          worksheet_id: id!,
          category_id: categoryId,
          activity_id: activityId,
          budget_hours: hours,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    });

    return Array.from(cellsMap.values());
  }, [worksheet, localCells, id]);

  const isLoading = wsLoading || catLoading || actLoading || allActLoading || svcLoading;
  const isSaving = batchUpsertCells.isPending || updateWorksheet.isPending;

  const { can, roleKey } = useAuthorization();
  const { staffRecord } = useCurrentStaff();

  // Escribir la matriz exige ser Socio o Gerente DEL encargo, o admin. Es el
  // predicado del backend, en sus dos caminos de guardado:
  //   - las celdas: batch_upsert_worksheet_cells -> is_admin() OR
  //     is_engagement_team_member()
  //   - la fila:    policy "worksheet_team_update" -> is_engagement_team_member()
  //                 (+ "Admins can manage worksheets")
  // y `is_engagement_team_member` mira SOLO partner_id y manager_id.
  //
  // Hace falta distinguirlo en el frontend desde 20260730010000: esa migración dio
  // lectura de la matriz a SQR y Encargado (decisión de negocio: solo lectura). Sin
  // este gate veían el grid editable y el botón Guardar, cargaban horas y perdían
  // el trabajo con "Permission denied: not a team member of this engagement".
  const myStaffId = staffRecord?.staff_id;
  const isEngagementTeamMember =
    !!myStaffId &&
    (myStaffId === worksheet?.engagement?.partner?.staff_id ||
      myStaffId === worksheet?.engagement?.manager?.staff_id);
  const canWriteWorksheet = roleKey === "admin" || isEngagementTeamMember;

  // Determine if the worksheet is locked
  const linkedWOStatus = worksheet?.work_order?.approval_status;
  const isWOLocked = linkedWOStatus === "Pending_Approval" || linkedWOStatus === "Approved";
  const isReadOnly =
    worksheet?.status === "approved" ||
    worksheet?.status === "archived" ||
    isWOLocked ||
    // Mientras carga el staff, se asume solo lectura (fail-closed): mejor un
    // instante sin poder editar que ofrecer un guardado que va a fallar.
    !canWriteWorksheet;

  const hasWorkOrder = !!worksheet?.wo_id;

  const woStatusI18nKey: Record<string, string> = {
    Draft: "workOrders.status.draft",
    Pending_Approval: "workOrders.status.pending",
    Approved: "workOrders.status.approved",
    Rejected: "workOrders.status.rejected",
  };

  // practica != null: sync_worksheet_to_wo_budget aggregates every stored cell
  // regardless of service, but the grid is hidden for no-service worksheets —
  // block WO creation from budget lines the user can't see or validate
  // (review.md iteración 11).
  const canCreateWorkOrder =
    can("work_order.create") &&
    !hasWorkOrder &&
    worksheet?.status === "draft" &&
    !hasUnsavedChanges &&
    practica != null;

  const handleApplyCopy = (sourceCells: WorksheetCell[]) => {
    const newLocalCells = new Map<string, number>();

    // Only load copied cells that belong to the engagement's service (no-op
    // when the engagement has no resolved service — see scopedActivityIdsForSave).
    sourceCells.forEach((cell) => {
      if (scopedCategoryIdsForSave && !scopedCategoryIdsForSave.has(cell.category_id)) return;
      if (scopedActivityIdsForSave && !scopedActivityIdsForSave.has(cell.activity_id)) return;
      newLocalCells.set(`${cell.category_id}|${cell.activity_id}`, cell.budget_hours);
    });

    // Zero out existing DB cells not present in the copy so they get cleared on save
    worksheet?.cells.forEach((cell) => {
      const key = `${cell.category_id}|${cell.activity_id}`;
      if (!newLocalCells.has(key)) newLocalCells.set(key, 0);
    });

    setLocalCells(newLocalCells);
    setHasUnsavedChanges(true);
    setGridKey((k) => k + 1);
  };

  const handleCreateWorkOrder = async () => {
    if (!worksheet || !id) return;

    try {
      const result = await createWOFromWorksheet.mutateAsync({
        worksheetId: id,
        engagementId: worksheet.engagement_id,
        currency: woCurrency,
        seasonMode: woSeasonMode,
        taxRate,
      });

      setShowCreateWODialog(false);
      // Navigate to the new work order
      allowNextNavigation();
      navigate(`/work-orders/${result.wo_id}`);
    } catch (error) {
      logger.error("Error creating work order:", error);
    }
  };

  if (isLoading) {
    return (
      <AppLayout title={t("workMatrix.title")} focusMode>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!worksheet) {
    return (
      <AppLayout title={t("workMatrix.title")} focusMode>
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">{t("common.noResults")}</p>
          <Button variant="link" onClick={() => navigate("/worksheets")}>
            {t("workMatrix.backToList")}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("workMatrix.title")} focusMode>
      <div className="space-y-4">
      {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-foreground">
            {t("workMatrix.editWorksheet")}
          </h1>
          <div className="flex items-center gap-2">
            {isSaving && (
              <span className="text-sm text-warning">{t("timesheet.saving")}</span>
            )}
            {hasUnsavedChanges && !isSaving && (
              <span className="text-sm text-muted-foreground">{t("common.unsavedChanges")}</span>
            )}

            <Button
              variant="cancel"
              onClick={() => { allowNextNavigation(); navigate("/worksheets"); }}
              className="btn-action"
            >
              {t("common.cancel")}
            </Button>

            {!isReadOnly && practica != null && (
              <Button
                variant="secondary"
                onClick={() => setShowCopyDialog(true)}
              >
                <Copy className="h-4 w-4 mr-2" />
                {t("workMatrix.copyFromEngagement")}
              </Button>
            )}
            
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving || isReadOnly}
              variant="default"
              className="btn-action"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t("common.save")}
            </Button>
            {canCreateWorkOrder && (
              <Button
                onClick={() => setShowCreateWODialog(true)}
                className="btn-action"
              >
                <FileText className="h-4 w-4 mr-2" />
                {t("workMatrix.createWorkOrder")}
              </Button>
            )}
          </div>
        </div>

        {/* Engagement Info Card */}
        <Card>
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {worksheet.engagement?.engagement_code
                  ? `${worksheet.engagement.engagement_code} - ${worksheet.engagement.engagement_name}`
                  : worksheet.engagement?.engagement_name}
              </CardTitle>
              <Badge className={cn("text-xs", statusColors[worksheet.status])}>
                {t(`workMatrix.status.${worksheet.status}`)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="py-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">{t("engagement.client")}:</span>
                <p className="font-medium">
                  {worksheet.engagement?.client?.client_legal_name || "-"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("engagement.partner")}:</span>
                <p className="font-medium">
                  {worksheet.engagement?.partner
                    ? worksheet.engagement.partner.short_name ||
                      `${worksheet.engagement.partner.first_name} ${worksheet.engagement.partner.last_name}`
                    : "-"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("engagement.manager")}:</span>
                <p className="font-medium">
                  {worksheet.engagement?.manager
                    ? worksheet.engagement.manager.short_name ||
                      `${worksheet.engagement.manager.first_name} ${worksheet.engagement.manager.last_name}`
                    : "-"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("workMatrix.linkedWorkOrder")}:</span>
                <p className="font-medium">
                  {worksheet.wo_id ? (
                    <Button
                      variant="link"
                      className="p-0 h-auto"
                      onClick={() => { allowNextNavigation(); navigate(`/work-orders/${worksheet.wo_id}`); }}
                    >
                      {t("common.yes")}
                      {linkedWOStatus && (
                        <span className="ml-1 text-xs text-muted-foreground font-normal">
                          · {t(woStatusI18nKey[linkedWOStatus] ?? "workOrders.status.draft")}
                        </span>
                      )}
                    </Button>
                  ) : (
                    t("common.no")
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Locked by Work Order Banner */}
        {isWOLocked && !!worksheet.wo_id && (
          <Alert variant="default" className="border-warning bg-warning/10">
            <Lock className="h-4 w-4" />
            <AlertTitle className="flex items-center gap-2">
              {t("workMatrix.lockedByWorkOrderTitle")}
              <Badge variant="outline" className="text-xs font-normal">
                {linkedWOStatus === "Pending_Approval"
                  ? t("workOrders.status.pending")
                  : t("workOrders.status.approved")}
              </Badge>
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                {linkedWOStatus === "Pending_Approval"
                  ? t("workMatrix.lockedByWorkOrderPending")
                  : t("workMatrix.lockedByWorkOrderApproved")}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-warning text-warning hover:bg-warning hover:text-warning-foreground"
                onClick={() => { allowNextNavigation(); navigate(`/work-orders/${worksheet.wo_id}`); }}
              >
                {t("workMatrix.goToWorkOrder")}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Budget Grid */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("workMatrix.budgetGrid")}</h2>
          {practica == null && (
            <Alert variant="default" className="border-warning bg-warning/10">
              <AlertDescription data-testid="worksheet-no-service-alert">
                {t("workMatrix.noServiceOnEngagement")}
              </AlertDescription>
            </Alert>
          )}
          {scopedCategories && scopedCategories.length > 0 && scopedActivities.length > 0 ? (
            <WorksheetGrid
              key={gridKey}
              categories={scopedCategories}
              activities={scopedActivities}
              cells={mergedCells}
              onChange={handleCellChange}
              readOnly={isReadOnly}
            />
          ) : (
            <div className="rounded-lg border bg-muted/30 p-8 text-center text-muted-foreground">
              {t("workMatrix.noCategoriesOrActivities")}
            </div>
          )}
        </div>

        {/* Notes Section */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("workMatrix.notes")}</h2>
          <Textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setHasUnsavedChanges(true);
            }}
            placeholder={t("workMatrix.notesPlaceholder")}
            className="min-h-[100px]"
            disabled={isReadOnly}
          />
        </div>

        {/* Create Work Order Dialog */}
        <Dialog open={showCreateWODialog} onOpenChange={setShowCreateWODialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("workMatrix.createWorkOrder")}</DialogTitle>
              <DialogDescription>
                {t("workMatrix.createWorkOrderDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("workOrders.currency")}</Label>
                <Select value={woCurrency} onValueChange={(v) => setWOCurrency(v as "USD" | "BOB")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOB">BOB - Bolivianos</SelectItem>
                    <SelectItem value="USD">USD - US Dollars</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("workOrders.season")}</Label>
                <Select value={woSeasonMode} onValueChange={(v) => setWOSeasonMode(v as "High" | "Low")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="High">
                      <div className="flex items-center gap-2">
                        <Sun className="h-4 w-4 text-warning" />
                        {t("industry.highSeason")}
                      </div>
                    </SelectItem>
                    <SelectItem value="Low">
                      <div className="flex items-center gap-2">
                        <Snowflake className="h-4 w-4 text-info" />
                        {t("industry.lowSeason")}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {worksheet?.engagement?.client?.industry && (
                  <p className="text-xs text-muted-foreground">
                    {t("workOrders.autoDetected")} - {worksheet.engagement.client.industry.fiscal_year_end}
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox 
                  id="confirmCreate" 
                  checked={confirmCreate} 
                  onCheckedChange={(checked) => setConfirmCreate(!!checked)} 
                />
                <Label htmlFor="confirmCreate" className="text-sm cursor-pointer">
                  {t("workMatrix.confirmCreateWorkOrder")}
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button"
                variant="outline" 
                onClick={() => {
                  setShowCreateWODialog(false);
                  setConfirmCreate(false);
                }}
                autoFocus
              >
                {t("common.cancel")}
              </Button>
              <Button 
                type="button"
                onClick={handleCreateWorkOrder}
                disabled={createWOFromWorksheet.isPending || !confirmCreate}
              >
                {createWOFromWorksheet.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                {t("common.create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {showCopyDialog && id && (
        <CopyFromEngagementDialog
          open={showCopyDialog}
          onOpenChange={setShowCopyDialog}
          currentWorksheetId={id}
          practica={practica}
          onApply={handleApplyCopy}
        />
      )}
      <LeavePageDialog blocker={blocker} isDirty={hasUnsavedChanges} />
    </AppLayout>
  );
};

export default WorksheetEdit;
