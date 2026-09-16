import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClientForm } from "@/components/forms/ClientForm";
import { ClientEngagementsTable } from "@/components/clients/ClientEngagementsTable";
import { useClientsFull } from "@/hooks/useEmsData";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

const ClientEdit = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: clients, isLoading } = useClientsFull();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });

  const client = clients?.find((c) => c.client_id === id);

  const handleCancel = () => {
    allowNextNavigation();
    navigate("/clients");
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate("/clients");
  };

  if (isLoading) {
    return (
      <AppLayout title={t("nav.clients")} focusMode>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  // Un id que no está en la lista deja `client` en `undefined`, y ClientForm lee
  // `isEdit = !!client`: sin esta rama la pantalla se volvía un formulario de ALTA silencioso
  // sobre una URL /clients/:id. Peor que confuso, era un agujero de permisos: `canSave` es
  // `!isEdit || can("client.update")`, o sea `true` cuando no hay cliente, y el submit caia en
  // `createMutation` — creando un cliente desde una ruta que solo exige `client.read`,
  // salteando el `client.create` que si gatea /clients/new.
  //
  // Se llega acá tecleando cualquier uuid, y también desde un aviso de `client.updated` /
  // `client.deactivated`: `notif_client_assigned()` incluye a los dos especialistas y
  // `is_assigned_to_client()` (la policy "clients read") no los miraba. Esa mitad se arregla
  // aparte; esta rama es la red que faltaba de todos modos.
  //
  // Misma rama que EngagementEdit.tsx ya tiene desde el BUG 0828-185, por el mismo motivo.
  if (!client) {
    return (
      <AppLayout title={t("nav.clients")} focusMode>
        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("client.unavailable")}</AlertDescription>
          </Alert>
          <Button variant="cancel" onClick={() => navigate("/clients")}>
            {t("common.cancel")}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("nav.clients")} focusMode>
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold">{t("client.editClient")}</h1>
        </div>

        {/* Client Form - Top 1/3 */}
        <div className="mb-4">
          <ClientForm
            client={client}
            compact
            onDirtyChange={setIsDirty}
            onCancel={handleCancel}
            onSaveSuccess={handleSaveSuccess}
          />
        </div>

        {/* Engagements Table - Bottom 2/3 */}
        <div className="flex-1 min-h-0">
          {id && <ClientEngagementsTable clientId={id} />}
        </div>
      </div>
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default ClientEdit;
