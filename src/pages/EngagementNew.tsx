import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { EngagementForm } from "@/components/forms/EngagementForm";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

const EngagementNew = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });
  // Guard de creación por permiso vía <PermissionRoute permission="engagement.create"> en App.tsx.
  const handleCancel = () => {
    allowNextNavigation();
    navigate("/engagements");
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate("/engagements");
  };

  const handleGoToWorkMatrix = (engagementId?: string) => {
    allowNextNavigation();
    navigate(engagementId ? `/worksheets/new?engagement=${encodeURIComponent(engagementId)}` : "/worksheets/new");
  };

  return (
    <AppLayout title={t("nav.engagements")} focusMode>
      <EngagementForm
        onDirtyChange={setIsDirty}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
        onGoToWorkMatrix={handleGoToWorkMatrix}
      />
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default EngagementNew;
