import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClientForm } from "@/components/forms/ClientForm";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";

const ClientNew = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });
  // Guard de creación por permiso vía <PermissionRoute permission="client.create"> en App.tsx.
  const handleCancel = () => {
    allowNextNavigation();
    navigate("/clients");
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate("/clients");
  };

  return (
    <AppLayout title={t("nav.clients")} focusMode>
      <ClientForm
        onDirtyChange={setIsDirty}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
      />
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default ClientNew;
