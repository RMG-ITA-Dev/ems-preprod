import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { EngagementForm } from "@/components/forms/EngagementForm";
import { useEngagements } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

const EngagementEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: engagements, isLoading } = useEngagements();
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
