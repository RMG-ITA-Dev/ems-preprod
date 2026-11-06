import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle } from "lucide-react";
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
import { useAuthorization } from "@/hooks/useAuthorization";
import { useSetClientActive } from "@/hooks/mutations";

interface ClientActivationButtonProps {
  clientId: string;
  isActive: boolean;
  /** `compact`: botón chico para la fila de la lista (solo activa). */
  variant?: "full" | "compact";
}

// 1028-211: activar o desactivar un cliente, con confirmación. Activar: client.activate (Cobranzas,
// Gerente de Contabilidad y admin). Desactivar: solo admin. La RPC set_client_active lo vuelve a exigir. No depende de
// client.update: quien activa no necesariamente puede editar la ficha.
export function ClientActivationButton({ clientId, isActive, variant = "full" }: ClientActivationButtonProps) {
  const { t } = useTranslation();
  const { can, roleKey } = useAuthorization();
  const setActive = useSetClientActive();

  if (!can("client.activate")) return null;
  // En la fila de la lista solo se ofrece activar: desactivar es una decisión que se toma en la ficha.
  if (variant === "compact" && isActive) return null;
  // Desactivar es solo de admin (2026-11-06); Cobranzas y Contabilidad solo activan. El backend lo exige igual.
  if (isActive && roleKey !== "admin") return null;

  const next = !isActive;
  const label = next
    ? variant === "compact" ? t("client.activateShort") : t("client.activate")
    : t("client.deactivate");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          // Activar es la acción principal (morado). Desactivar usa el gris del avatar de la cabecera
          // (bg-accent), que se distingue del fondo oscuro, a diferencia de outline.
          variant={next ? "default" : "ghost"}
          className={next ? undefined : "bg-accent text-accent-foreground hover:bg-accent/80"}
          disabled={setActive.isPending}
          // En la lista la fila entera navega a la ficha: el clic del botón no debe llegar a ella.
          onClick={(event) => event.stopPropagation()}
        >
          {next ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(event) => event.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {next ? t("client.activateConfirmTitle") : t("client.deactivateConfirmTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {next ? t("client.activateConfirmDescription") : t("client.deactivateConfirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => setActive.mutate({ clientId, active: next })}>
            {next ? t("client.activate") : t("client.deactivate")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
