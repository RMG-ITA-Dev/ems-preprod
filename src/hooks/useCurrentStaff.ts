import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Staff } from "./useEmsData";

// Extended Staff type that includes hire_date for timesheet validation
interface StaffWithHireDate extends Staff {
  hire_date: string | null;
}

export function useCurrentStaff() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['current_staff', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from('staff')
        .select(`
          staff_id,
          first_name,
          last_name,
          short_name,
          initials,
          category_id,
          city,
          is_active,
          hire_date,
          category:categories(*)
        `)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as StaffWithHireDate | null;
    },
    enabled: !!user?.id,
  });

  return {
    ...query,
    staffRecord: query.data,
  };
}
