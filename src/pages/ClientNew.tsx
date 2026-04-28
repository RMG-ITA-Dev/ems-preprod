import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ClientForm } from "@/components/forms/ClientForm";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import { useUserRole } from "@/hooks/useUserRole";

const ClientNew = () => {
  const navigate = useNavigate();
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });
  const { isAdmin, isPartner, isDirector, isLoading: roleLoading } = useUserRole();
  const canCreate = isAdmin || isPartner || isDirector;

  useEffect(() => {
    if (!roleLoading && !canCreate) {
      allowNextNavigation();
      navigate("/clients", { replace: true });
    }
  }, [roleLoading, canCreate, allowNextNavigation, navigate]);

  if (roleLoading || !canCreate) return null;

  const handleCancel = () => {
    allowNextNavigation();
    navigate("/clients");
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate("/clients");
  };

  return (
    <AppLayout title="Clients" focusMode>
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
