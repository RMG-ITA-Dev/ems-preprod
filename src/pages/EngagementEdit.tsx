import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { EngagementForm } from "@/components/forms/EngagementForm";
import { usePortfolioEngagements } from "@/hooks/usePortfolioEngagements";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

const EngagementEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: engagements, isLoading } = usePortfolioEngagements();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const engagement = engagements?.find((e) => e.engagement_id === id);

  const handleCancel = () => {
    allowNextNavigation();
    navigate("/engagements");
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate("/engagements");
  };

  if (isLoading) {
    return (
      <AppLayout title={t("nav.engagements")} focusMode>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  // BUG 0828-185: usePortfolioEngagements() ya no incluye cualquier encargo donde el usuario
  // esté asignado, solo lo que le corresponde por rol/creación -- un deep-link a un id fuera de
  // ese portafolio ahora es común (antes era solo un id inexistente). Sin esta rama,
  // `engagement` llega `undefined` a EngagementForm, que lo interpreta como modo CREACIÓN
  // silencioso -- nunca debe pasar para una ruta /engagements/:id.
  if (!engagement) {
    return (
      <AppLayout title={t("nav.engagements")} focusMode>
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("engagement.unavailable")}</AlertDescription>
          </Alert>
          <Button variant="cancel" onClick={() => navigate("/engagements")}>
            {t("common.cancel")}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("nav.engagements")} focusMode>
      <EngagementForm
        engagement={engagement}
        onDirtyChange={setIsDirty}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
      />
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default EngagementEdit;
