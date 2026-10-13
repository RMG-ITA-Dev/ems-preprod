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
          society_id,
          practica_id,
          city,
          is_active,
          hire_date,
          termination_date,
          category:categories!staff_category_id_fkey(*)
        `)
        .eq('auth_user_id', user.id)
        .maybeSingle();
      
      if (error) throw error;
      // El enlace staff <-> usuario lo hace la base (triggers link_auth_user_to_staff al crear el usuario y
      // trg_link_staff_to_auth_user al crear o cambiar el email de la ficha). Este hook ya no intenta enlazar por
      // email desde el navegador: con la RLS de staff (B3e) solo admin escribe esa tabla, y antes de B3e cualquier
      // empleado podía reclamar así la ficha de otra persona.
      return (data ?? null) as StaffWithHireDate | null;
    },
    enabled: !!user?.id,
  });

  return {
    ...query,
    staffRecord: query.data,
  };
}
