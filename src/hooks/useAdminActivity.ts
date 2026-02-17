import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the activity_id for the system "ADM" activity code.
 * Safe to use .single() because activity_code has a unique constraint.
 */
export function useAdminActivityId(): string | null {
  const query = useQuery({
    queryKey: ["admin-activity-id"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_codes")
        .select("activity_id")
        .eq("activity_code", "ADM")
        .eq("is_active", true)
        .single();
      if (error) throw error;
      return data.activity_id;
    },
    staleTime: 10 * 60 * 1000,
  });
  return query.data ?? null;
}
