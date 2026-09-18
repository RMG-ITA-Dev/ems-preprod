import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdministrativeEngagement extends Record<string, unknown> {
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string;
  funcion: number;
  society_id: string;
  society_name: string;
  client_id: string;
  client_name: string;
  oficina: number | null;
  practica: number | null;
  practica_name: string | null;
  anio_fiscal: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

export function useAdministrativeEngagements() {
  return useQuery({
    queryKey: ["engagements", "administrative"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_administrative_engagements" as never);
      if (error) throw error;
      return (data ?? []) as unknown as AdministrativeEngagement[];
    },
  });
}
