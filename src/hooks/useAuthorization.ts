import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";

/**
 * Motor de autorización del frontend (Fase 2, tanda B).
 *
 * Consume el RPC `get_my_authorization_context()` (Fase 2, tanda A) y expone
 * `can()` / `scope()` sobre los permisos del usuario actual. Es la ÚNICA fuente
 * de verdad de permisos en el frontend (reemplaza los flags dispersos de
 * `useUserRole`). El backend (RLS) sigue siendo la autoridad; esto solo refleja
 * la decisión para la experiencia de usuario.
 *
 * Fail-closed: mientras carga, si hay error o si no hay datos, `can()` => false.
 */

export type ScopeKey =
  | "firm"
  | "assigned_clients"
  | "assigned_engagements"
  | "own"
  | "department"
  | "none";

interface AuthorizationContext {
  role_key: string | null;
  permissions: Record<string, ScopeKey>;
}

export type AuthorizationStatus = "loading" | "error" | "no-role" | "ready";

export interface UseAuthorizationResult {
  status: AuthorizationStatus;
  isLoading: boolean;
  isError: boolean;
  /** role_key del usuario (o null si no tiene rol asignado). */
  roleKey: string | null;
  /** ¿El usuario tiene este permiso? Fail-closed. */
  can: (permissionKey: string) => boolean;
  /** Alcance (scope_key) del permiso para este usuario, o null si no lo tiene. */
  scope: (permissionKey: string) => ScopeKey | null;
  /** Mapa completo permiso -> scope (solo lectura). */
  permissions: Record<string, ScopeKey>;
  /** Reintenta la carga del contexto de autorización (p.ej. tras un error). */
  refetch: () => void;
}

export function useAuthorization(): UseAuthorizationResult {
  const { user } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["authz_context", user?.id],
    queryFn: async (): Promise<AuthorizationContext> => {
      // NOTA: get_my_authorization_context aún no está en types.ts (se regenera
      // vía Lovable tras aplicar la migración). Hasta entonces casteamos el nombre.
      const { data, error } = await supabase.rpc(
        "get_my_authorization_context" as never
      );

      if (error) {
        logger.error("Failed to load authorization context:", error.message);
        throw error;
      }

      const ctx = (data ?? {}) as {
        role_key?: string | null;
        permissions?: Record<string, ScopeKey>;
      };

      return {
        role_key: ctx.role_key ?? null,
        permissions: ctx.permissions ?? {},
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const can = useCallback(
    (permissionKey: string): boolean => {
      // Fail-closed: sin datos (cargando/error) => denegado.
      if (!data) return false;
      return Object.prototype.hasOwnProperty.call(data.permissions, permissionKey);
    },
    [data]
  );

  const scope = useCallback(
    (permissionKey: string): ScopeKey | null => {
      if (!data) return null;
      return data.permissions[permissionKey] ?? null;
    },
    [data]
  );

  const status: AuthorizationStatus = isLoading
    ? "loading"
    : isError
      ? "error"
      : !data?.role_key
        ? "no-role"
        : "ready";

  return {
    status,
    isLoading,
    isError,
    roleKey: data?.role_key ?? null,
    can,
    scope,
    permissions: data?.permissions ?? {},
    refetch: () => {
      void refetch();
    },
  };
}
