import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { EngagementForm } from "@/components/forms/EngagementForm";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import { useUserRole } from "@/hooks/useUserRole";

const EngagementNew = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });
  const { isAdmin, isPartner, isDirector, isLoading: roleLoading } = useUserRole();
  const canCreate = isAdmin || isPartner || isDirector;

  useEffect(() => {
    if (!roleLoading && !canCreate) {
      allowNextNavigation();
      navigate("/engagements", { replace: true });
    }
  }, [roleLoading, canCreate, allowNextNavigation, navigate]);

  if (roleLoading || !canCreate) return null;

  const handleCancel = () => {
    allowNextNavigation();
    navigate("/engagements");
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate("/engagements");
  };

  return (
    <AppLayout title={t("nav.engagements")} focusMode>
      <EngagementForm
        onDirtyChange={setIsDirty}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
      />
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default EngagementNew;
