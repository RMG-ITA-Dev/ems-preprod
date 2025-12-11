import { useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { useWorksheetById } from "@/hooks/useWorksheetData";
import { useBatchUpsertCells, useUpdateWorksheet } from "@/hooks/useWorksheetMutations";
import { useCategories, useActivityCodes } from "@/hooks/useEmsData";
import { WorksheetGrid } from "@/components/worksheet/WorksheetGrid";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  
  const batchUpsertCells = useBatchUpsertCells();
  const updateWorksheet = useUpdateWorksheet();

  // Local state for unsaved changes
  const [localCells, setLocalCells] = useState<Map<string, number>>(new Map());
  const [notes, setNotes] = useState<string>("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Initialize notes when worksheet loads
  useMemo(() => {
    if (worksheet?.notes !== undefined && notes === "") {
      setNotes(worksheet.notes || "");
    }
  }, [worksheet?.notes]);

  // Filter active activity codes only
  const activeActivities = useMemo(
    () => activityCodes?.filter((a) => a.is_active) || [],
    [activityCodes]
  );

  const handleCellChange = useCallback(
    (categoryId: string, activityId: string, hours: number) => {
      const key = `${categoryId}-${activityId}`;
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
      existingCellsMap.set(`${cell.category_id}-${cell.activity_id}`, cell.budget_hours);
    });

    // Merge with local changes
    localCells.forEach((hours, key) => {
      existingCellsMap.set(key, hours);
    });

    // Convert to array
    existingCellsMap.forEach((hours, key) => {
      const [categoryId, activityId] = key.split("-");
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
      console.error("Error saving worksheet:", error);
    }
  };

  // Merge worksheet cells with local changes for display
  const mergedCells = useMemo(() => {
    if (!worksheet) return [];
    
    const cellsMap = new Map<string, typeof worksheet.cells[0]>();
    
    // Add existing cells
    worksheet.cells.forEach((cell) => {
      cellsMap.set(`${cell.category_id}-${cell.activity_id}`, cell);
    });

    // Apply local changes
    localCells.forEach((hours, key) => {
      const existing = cellsMap.get(key);
      if (existing) {
        cellsMap.set(key, { ...existing, budget_hours: hours });
      } else {
        const [categoryId, activityId] = key.split("-");
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

  const isLoading = wsLoading || catLoading || actLoading;
  const isSaving = batchUpsertCells.isPending || updateWorksheet.isPending;
  const isReadOnly = worksheet?.status === "approved" || worksheet?.status === "archived";

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!worksheet) {
    return (
      <AppLayout>
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
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/worksheets")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("workMatrix.backToList")}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <span className="text-sm text-warning">{t("timesheet.saving")}</span>
            )}
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving || isReadOnly}
              className="btn-action"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t("common.save")}
            </Button>
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
                      onClick={() => navigate(`/work-orders/${worksheet.wo_id}`)}
                    >
                      {t("common.yes")}
                    </Button>
                  ) : (
                    t("common.no")
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Budget Grid */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("workMatrix.budgetGrid")}</h2>
          {categories && activeActivities.length > 0 ? (
            <WorksheetGrid
              categories={categories}
              activities={activeActivities}
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
      </div>
    </AppLayout>
  );
};

export default WorksheetEdit;
