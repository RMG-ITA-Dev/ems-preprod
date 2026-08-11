import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export interface UserRoleData {
  role_id: string;
  user_id: string;
  email: string;
  /** Enum legacy: espejo de role_key, aún lo leen políticas RLS vía has_role(). */
  role: AppRole;
  /** Autoridad del motor de autorización. null = usuario sin rol (fail-closed). */
  role_key: string | null;
  staff_name: string | null;
  created_at: string;
}

export function useAllUserRoles() {
  return useQuery({
    queryKey: ["all_user_roles"],
    queryFn: async (): Promise<UserRoleData[]> => {
      const { data, error } = await supabase.rpc("get_all_user_roles");

      if (error) throw error;
      return (data as UserRoleData[]) || [];
    },
  });
}

/**
 * @deprecated Escribe SOLO el enum legacy `user_roles.role`; NO toca `role_key`,
 * que es lo que lee el motor de autorización. Es decir: cambia la insignia pero
 * no los permisos efectivos. Usar `useUpdateUserRoleKey` para asignar roles.
 */
export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ userId, newRole, reason }: { userId: string; newRole: AppRole; reason?: string }) => {
      const { data, error } = await supabase.rpc("admin_set_user_role", {
        p_target_user_id: userId,
        p_new_role: newRole,
        p_reason: reason || null,
      });

      if (error) throw error;
      const result = data as unknown as { success: boolean; code: string; message: string };
      if (!result.success) {
        throw new Error(result.code);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_user_roles"] });
      toast.success(t("userRoles.roleUpdated"));
    },
    onError: (error) => {
      const code = error.message;
      if (code === "LAST_ADMIN") {
        toast.error(t("userRoles.lastAdminBlocked"));
      } else if (code === "SELF_CHANGE") {
        toast.error(t("userRoles.cannotChangeSelf"));
      } else if (code === "NOT_ADMIN") {
        toast.error(t("userRoles.notAdmin"));
      } else {
        toast.error(t("userRoles.updateError"), { description: error.message });
      }
    },
  });
}

/**
 * Asigna cualquiera de los 23 roles del catálogo escribiendo `user_roles.role_key`
 * (Fase 8). El RPC espeja además el enum legacy, así que las políticas RLS que
 * aún usan `has_role()` siguen coherentes.
 */
export function useUpdateUserRoleKey() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({
      userId,
      newRoleKey,
      reason,
    }: { userId: string; newRoleKey: string; reason?: string }) => {
      // NOTA: admin_set_user_role_key aún no está en types.ts (se regenera vía
      // Lovable tras aplicar la migración). Hasta entonces casteamos el nombre.
      const { data, error } = await supabase.rpc(
        "admin_set_user_role_key" as never,
        {
          p_target_user_id: userId,
          p_new_role_key: newRoleKey,
          p_reason: reason || null,
        } as never
      );

      if (error) throw error;
      const result = data as unknown as { success: boolean; code: string; message: string };
      if (!result.success) {
        throw new Error(result.code);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_user_roles"] });
      // El usuario afectado debe recargar sus permisos en su próxima sesión;
      // invalidamos por si el admin cambió su propio contexto indirectamente.
      queryClient.invalidateQueries({ queryKey: ["authz_context"] });
      toast.success(t("userRoles.roleUpdated"));
    },
    onError: (error) => {
      const code = error.message;
      if (code === "LAST_ADMIN") {
        toast.error(t("userRoles.lastAdminBlocked"));
      } else if (code === "SELF_CHANGE") {
        toast.error(t("userRoles.cannotChangeSelf"));
      } else if (code === "NOT_ADMIN") {
        toast.error(t("userRoles.notAdmin"));
      } else if (code === "INVALID_ROLE" || code === "ROLE_NOT_MAPPED") {
        toast.error(t("userRoles.invalidRole"));
      } else {
        toast.error(t("userRoles.updateError"), { description: error.message });
      }
    },
  });
}

export function useDeleteAuthUser() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("manage-auth-user", {
        body: { action: "delete", userId },
      });

      if (error) throw error;
      if (!data.success) {
        throw new Error(data.code);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_user_roles"] });
      toast.success(t("userRoles.accountDeleted"));
    },
    onError: (error) => {
      const code = error.message;
      if (code === "SELF_DELETE") {
        toast.error(t("userRoles.cannotDeleteSelf"));
      } else if (code === "LINKED_USER") {
        toast.error(t("userRoles.cannotDeleteLinked"));
      } else if (code === "ALREADY_DELETED") {
        toast.info(t("userRoles.alreadyDeleted"));
      } else {
        toast.error(t("userRoles.deleteError"), { description: error.message });
      }
    },
  });
}
