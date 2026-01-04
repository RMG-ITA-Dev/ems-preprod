import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export interface UserRoleData {
  role_id: string;
  user_id: string;
  email: string;
  role: AppRole;
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

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_user_roles"] });
      toast({ title: t("userRoles.roleUpdated") });
    },
    onError: (error) => {
      toast({
        title: t("userRoles.updateError"),
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
