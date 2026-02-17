import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { StaffForm } from "@/components/forms/StaffForm";
import { useStaffFull } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

const StaffEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: staffList, isLoading } = useStaffFull();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const staff = staffList?.find((s) => s.staff_id === id);

  const handleCancel = () => {
    allowNextNavigation();
    navigate("/staff");
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate("/staff");
  };

  if (isLoading) {
    return (
      <AppLayout title="Staff" focusMode>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Staff" focusMode>
      <StaffForm
        staff={staff}
        onDirtyChange={setIsDirty}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
      />
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default StaffEdit;
