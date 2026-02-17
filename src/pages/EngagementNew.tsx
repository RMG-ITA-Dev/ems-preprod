import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { EngagementForm } from "@/components/forms/EngagementForm";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

const EngagementNew = () => {
  const navigate = useNavigate();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const handleCancel = () => {
    allowNextNavigation();
    navigate("/engagements");
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate("/engagements");
  };

  return (
    <AppLayout title="Engagements" focusMode>
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
