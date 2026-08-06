import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthorization } from "@/hooks/useAuthorization";

interface PermissionRouteProps {
  /** Permiso requerido para entrar a la ruta, p. ej. "client.read". */
  permission: string;
  children: ReactNode;
  /** Si se define, redirige ahí en vez de mostrar el 403 en línea. */
  redirectTo?: string;
}

/**
 * Guarda una ruta por permiso. Fail-closed: mientras carga muestra spinner;
 * si no tiene el permiso, redirige (si `redirectTo`) o muestra un 403 en línea.
 *
 * Se combina con `ProtectedRoute` (que exige sesión + staff activo):
 *   <ProtectedRoute><PermissionRoute permission="client.read"><Clients/></PermissionRoute></ProtectedRoute>
 *
 * Nota: la seguridad real la impone el RLS; esto es la capa de experiencia.
 */
export function PermissionRoute({
  permission,
  children,
  redirectTo,
}: PermissionRouteProps) {
  const { t } = useTranslation();
  const { can, isLoading } = useAuthorization();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-muted-foreground">{t("common.loading", "Cargando...")}</p>
        </div>
      </div>
    );
  }

  if (!can(permission)) {
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="flex flex-col items-center gap-3 text-center max-w-md">
          <h1 className="text-2xl font-semibold text-foreground">
            {t("authz.accessDenied.title", "Sin acceso")}
          </h1>
          <p className="text-muted-foreground">
            {t(
              "authz.accessDenied.description",
              "No tienes permiso para ver esta sección. Si crees que es un error, contacta a un administrador."
            )}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
