import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "admin" | "staff" | "viewer";

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export function useUserRole() {
  const { user } = useAuth();

  const { data: userRole, isLoading } = useQuery({
    queryKey: ["user_role", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      
      if (error) {
        // User might not have a role yet, return default
        console.warn("No role found for user:", error.message);
        return null;
      }
      
      return data as UserRole;
    },
    enabled: !!user?.id,
  });

  const role = userRole?.role || "staff";
  
  return {
    role,
    isAdmin: role === "admin",
    isStaff: role === "staff",
    isViewer: role === "viewer",
    isLoading,
  };
}
