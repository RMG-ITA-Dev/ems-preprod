import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

const WorksheetEdit = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();

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
          {t("workMatrix.editWorksheet")}
        </h1>

        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            Worksheet ID: {id}
          </p>
          <p className="text-muted-foreground mt-2">
            {t("workMatrix.gridPlaceholder")}
          </p>
        </div>
      </div>
    </AppLayout>
  );
};

export default WorksheetEdit;
