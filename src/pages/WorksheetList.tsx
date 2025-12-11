import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const WorksheetList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("workMatrix.title")}
          </h1>
          <Button onClick={() => navigate("/worksheets/new")}>
            <Plus className="h-4 w-4 mr-2" />
            {t("workMatrix.newWorksheet")}
          </Button>
        </div>

        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            {t("workMatrix.emptyState")}
          </p>
        </div>
      </div>
    </AppLayout>
  );
};

export default WorksheetList;
