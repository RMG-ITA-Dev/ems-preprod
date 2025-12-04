import { useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { StaffForm } from "@/components/forms/StaffForm";
import { useStaff } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";

const StaffEdit = () => {
  const { id } = useParams<{ id: string }>();
  const { data: staffList, isLoading } = useStaff();
  
  const staff = staffList?.find((s) => s.staff_id === id);

  if (isLoading) {
    return (
      <AppLayout title="Staff">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Staff">
      <StaffForm staff={staff} />
    </AppLayout>
  );
};

export default StaffEdit;
