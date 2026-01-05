import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClientForm } from "@/components/forms/ClientForm";
import { ClientEngagementsTable } from "@/components/clients/ClientEngagementsTable";
import { useClients } from "@/hooks/useEmsData";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDeleteClient } from "@/hooks/mutations";
import { Trash2 } from "lucide-react";

const ClientEdit = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClients();
  const deleteMutation = useDeleteClient();
  
  const client = clients?.find((c) => c.client_id === id);

  const handleDelete = async () => {
    if (client) {
      await deleteMutation.mutateAsync(client.client_id);
      navigate("/clients");
    }
  };

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
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">{t("client.editClient")}</h1>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                {t("common.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("client.deleteClient")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("common.confirmDelete", { name: client?.client_legal_name })} {t("common.deleteWarning")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Client Form - Top 1/3 */}
        <div className="mb-4">
          <ClientForm client={client} compact />
        </div>

        {/* Engagements Table - Bottom 2/3 */}
        <div className="flex-1 min-h-0">
          {id && <ClientEngagementsTable clientId={id} />}
        </div>
      </div>
    </AppLayout>
  );
};

export default ClientEdit;
