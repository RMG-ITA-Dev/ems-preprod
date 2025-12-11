import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const WorksheetNew = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/worksheets")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("workMatrix.backToList")}
          </Button>
        </div>

        <h1 className="text-2xl font-semibold text-foreground">
          {t("workMatrix.newWorksheet")}
        </h1>

        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            {t("workMatrix.selectEngagement")}
          </p>
        </div>
      </div>
    </AppLayout>
  );
};

export default WorksheetNew;
