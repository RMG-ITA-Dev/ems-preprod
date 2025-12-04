import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Staff } from "./useEmsData";

export function useCurrentStaff() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['current_staff', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('staff')
        .select(`
          *,
          category:categories(*)
        `)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as Staff | null;
    },
    enabled: !!user?.id,
  });
}
