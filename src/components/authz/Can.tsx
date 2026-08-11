import { ReactNode } from "react";
import { useAuthorization } from "@/hooks/useAuthorization";

interface CanProps {
  /** Clave de permiso, p. ej. "client.create". */
  permission: string;
  children: ReactNode;
  /** Qué renderizar si NO tiene el permiso (por defecto: nada). */
  fallback?: ReactNode;
}

/**
 * Muestra `children` solo si el usuario tiene el permiso. Fail-closed:
 * mientras carga o si hay error, no renderiza (usa `useAuthorization().can`).
 *
 * Uso:
 *   <Can permission="client.create">
 *     <Button>Nuevo cliente</Button>
 *   </Can>
 *
 * OJO: esto es solo UX (ocultar/mostrar). La seguridad real la impone el RLS.
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const { can } = useAuthorization();
  return <>{can(permission) ? children : fallback}</>;
}
