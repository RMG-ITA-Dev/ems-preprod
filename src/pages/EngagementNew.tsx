import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { EngagementForm } from "@/components/forms/EngagementForm";
import { usePageLeaveLock } from "@/hooks/usePageLeaveLock";
import { LeavePageDialog } from "@/components/ui/leave-page-dialog";
import { useAuthorization } from "@/hooks/useAuthorization";
import { isAdministrativeCreator, isAdministrativeOnlyCreator } from "@/lib/engagementRoleAccess";

const EngagementNew = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { roleKey } = useAuthorization();
  // El Analista de Talento Humano solo crea encargos Administrativa/Capacitación/Calidad
  // (decisión del operador 2026-10-27): para él el alta es siempre administrativa, llegue por
  // donde llegue. Espejo del trigger de BD `enforce_engagement_profile_scope`.
  // 1110-220 plan_v3 (N1): el alta administrativa es solo de Sistemas y Talento Humano. Para el
  // resto `?mode=administrative` se ignora y el alta queda en Cliente (el trigger rechazaría 0/2/3).
  const administrativeMode =
    isAdministrativeOnlyCreator(roleKey) ||
    (searchParams.get("mode") === "administrative" && isAdministrativeCreator(roleKey));
  // BUG 0922-195: ClientEngagementsTable.tsx navega acá con ?client_id=... (deep-link
  // "Nuevo Encargo" desde el detalle de un cliente); se reenvía a EngagementForm, que lo
  // hidrata una sola vez cuando su catálogo de clientes lo incluya.
  const initialClientId = searchParams.get("client_id") ?? undefined;
  const returnPath = administrativeMode ? "/administrative-engagements" : "/engagements";
  const [isDirty, setIsDirty] = useState(false);
  const { blocker, allowNextNavigation } = usePageLeaveLock({ locked: true, isDirty });
  // Guard de creación por permiso vía <PermissionRoute permission="engagement.create"> en App.tsx.
  const handleCancel = () => {
    allowNextNavigation();
    navigate(returnPath);
  };

  const handleSaveSuccess = () => {
    allowNextNavigation();
    navigate(returnPath);
  };

  const handleGoToWorkMatrix = (engagementId?: string) => {
    allowNextNavigation();
    navigate(engagementId ? `/worksheets/new?engagement=${encodeURIComponent(engagementId)}` : "/worksheets/new");
  };

  // 1112-228: "Crear orden de trabajo" desde el modal de un encargo administrativo.
  const handleCreateWorkOrder = (engagementId?: string) => {
    allowNextNavigation();
    navigate(engagementId ? `/work-orders/new?engagement=${encodeURIComponent(engagementId)}` : "/work-orders/new");
  };

  return (
    <AppLayout title={t(administrativeMode ? "nav.administrativeEngagements" : "nav.engagements")} focusMode>
      <EngagementForm
        administrativeMode={administrativeMode}
        initialClientId={initialClientId}
        onDirtyChange={setIsDirty}
        onCancel={handleCancel}
        onSaveSuccess={handleSaveSuccess}
        onGoToWorkMatrix={handleGoToWorkMatrix}
        onCreateWorkOrder={handleCreateWorkOrder}
      />
      <LeavePageDialog blocker={blocker} isDirty={isDirty} />
    </AppLayout>
  );
};

export default EngagementNew;
