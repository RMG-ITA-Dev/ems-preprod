import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Catálogo de roles de negocio (Fase 1: `authorization_roles`, 23 roles).
 *
 * Es la fuente de verdad de "qué roles se pueden asignar". Antes la UI tenía una
 * lista literal con los 11 valores del enum `app_role`, por lo que los roles
 * especializados (ita_*, tax_*, accounting_*, hr_*, risk_*, ...) eran invisibles.
 *
 * La policy `authz_roles_select` deja leer esta tabla a cualquier autenticado.
 */

export interface AuthorizationRole {
  role_key: string;
  /** Clave i18n (p.ej. "authz.role.ita_manager"). */
  label_key: string;
  description: string | null;
  is_system: boolean;
  display_order: number;
}

export function useAuthorizationRoles() {
  return useQuery({
    queryKey: ["authorization_roles"],
    queryFn: async (): Promise<AuthorizationRole[]> => {
      // NOTA: authorization_roles aún no está en types.ts (se regenera vía
      // Lovable tras aplicar las migraciones). Hasta entonces casteamos.
      const { data, error } = await supabase
        .from("authorization_roles" as never)
        .select("role_key, label_key, description, is_system, display_order")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as AuthorizationRole[];
    },
    // El catálogo solo cambia por migración: no hace falta refrescarlo seguido.
    staleTime: 30 * 60 * 1000,
  });
}
