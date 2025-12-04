import { useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { EngagementForm } from "@/components/forms/EngagementForm";
import { useEngagements } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";

const EngagementEdit = () => {
  const { id } = useParams<{ id: string }>();
  const { data: engagements, isLoading } = useEngagements();
  
  const engagement = engagements?.find((e) => e.engagement_id === id);

  if (isLoading) {
    return (
      <AppLayout title="Engagements">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Engagements">
      <EngagementForm engagement={engagement} />
    </AppLayout>
  );
};

export default EngagementEdit;
