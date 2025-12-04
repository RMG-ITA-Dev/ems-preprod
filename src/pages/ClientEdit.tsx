import { useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClientForm } from "@/components/forms/ClientForm";
import { useClients } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";

const ClientEdit = () => {
  const { id } = useParams<{ id: string }>();
  const { data: clients, isLoading } = useClients();
  
  const client = clients?.find((c) => c.client_id === id);

  if (isLoading) {
    return (
      <AppLayout title="Clients">
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Clients">
      <ClientForm client={client} />
    </AppLayout>
  );
};

export default ClientEdit;
