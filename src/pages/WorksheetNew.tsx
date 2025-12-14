import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, AlertCircle } from "lucide-react";
import { useEngagementsWithoutWorksheet } from "@/hooks/useWorksheetData";
import { useCreateWorksheet } from "@/hooks/useWorksheetMutations";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const WorksheetNew = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: engagements, isLoading } = useEngagementsWithoutWorksheet();
  const { data: currentStaff } = useCurrentStaff();
  const createWorksheet = useCreateWorksheet();

  const [selectedEngagementId, setSelectedEngagementId] = useState<string>("");

  const handleCreate = async () => {
    if (!selectedEngagementId) return;

    try {
      const result = await createWorksheet.mutateAsync({
        engagement_id: selectedEngagementId,
        created_by_staff_id: currentStaff?.staff_id,
      });

      // Navigate to edit the newly created worksheet
      navigate(`/worksheets/${result.id}`);
    } catch (error) {
      console.error("Error creating worksheet:", error);
    }
  };

  const selectedEngagement = engagements?.find(
    (e) => e.engagement_id === selectedEngagementId
  );

  return (
    <AppLayout>
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-lg font-semibold text-foreground">
          {t("workMatrix.newWorksheet")}
        </h1>

        <Card>
          <CardHeader>
            <CardTitle>{t("workMatrix.selectEngagement")}</CardTitle>
            <CardDescription>
              {t("workMatrix.selectEngagementDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : engagements && engagements.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {t("workMatrix.allEngagementsHaveWorksheets")}
                  <Button
                    variant="link"
                    className="px-1 h-auto"
                    onClick={() => navigate("/engagements/new")}
                  >
                    {t("workOrders.createEngagementFirst")}
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <Select
                  value={selectedEngagementId}
                  onValueChange={setSelectedEngagementId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("engagement.selectClient")} />
                  </SelectTrigger>
                  <SelectContent>
                    {engagements?.map((eng) => (
                      <SelectItem key={eng.engagement_id} value={eng.engagement_id}>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {eng.engagement_code
                              ? `${eng.engagement_code} - ${eng.engagement_name}`
                              : eng.engagement_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {eng.client?.client_legal_name || "-"}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Selected Engagement Preview */}
                {selectedEngagement && (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">{t("engagement.client")}:</span>
                        <p className="font-medium">
                          {selectedEngagement.client?.client_legal_name || "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("engagement.code")}:</span>
                        <p className="font-medium">
                          {selectedEngagement.engagement_code || "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("engagement.partner")}:</span>
                        <p className="font-medium">
                          {selectedEngagement.partner
                            ? selectedEngagement.partner.short_name ||
                              `${selectedEngagement.partner.first_name} ${selectedEngagement.partner.last_name}`
                            : "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("engagement.manager")}:</span>
                        <p className="font-medium">
                          {selectedEngagement.manager
                            ? selectedEngagement.manager.short_name ||
                              `${selectedEngagement.manager.first_name} ${selectedEngagement.manager.last_name}`
                            : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="cancel"
                    onClick={() => navigate("/worksheets")}
                    className="btn-action"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="default"
                    onClick={handleCreate}
                    disabled={!selectedEngagementId || createWorksheet.isPending}
                    className="btn-action"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {t("common.create")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default WorksheetNew;
