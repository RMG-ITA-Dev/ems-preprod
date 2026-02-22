import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Staff } from "./useEmsData";

// Extended Staff type that includes hire_date for timesheet validation
interface StaffWithHireDate extends Staff {
  hire_date: string | null;
  termination_date: string | null;
}

export function useCurrentStaff() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['current_staff', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Primary lookup: by auth_user_id
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
          termination_date,
          category:categories(*)
        `)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      if (data) return data as StaffWithHireDate | null;

      // Fallback: try to find and link by email
      const userEmail = user.email;
      if (!userEmail) return null;

      const { data: staffByEmail, error: emailError } = await supabase
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
          termination_date,
          category:categories(*)
        `)
        .eq('email', userEmail)
        .is('auth_user_id', null)
        .maybeSingle();

      if (emailError) throw emailError;

      if (staffByEmail) {
        // Auto-link: set auth_user_id on the matching staff record
        const { error: linkError } = await supabase
          .from('staff')
          .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
          .eq('staff_id', staffByEmail.staff_id)
          .is('auth_user_id', null);

        if (!linkError) {
          return staffByEmail as StaffWithHireDate;
        }
      }

      return null;
    },
    enabled: !!user?.id,
  });

  return {
    ...query,
    staffRecord: query.data,
  };
}
