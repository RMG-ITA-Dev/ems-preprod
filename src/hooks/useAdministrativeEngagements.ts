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

export interface AdministrativeInternalClient {
  client_id: string;
  client_legal_name: string;
  unique_tax_id: string;
  is_active: boolean;
}

// Review fix (Codex): hr_manager/hr_analyst have engagement.create but not client.read, so
// useClients() (RLS-gated) returns nothing for them and they can't pick the internal client an
// administrative engagement requires. This RPC exposes only the two controlled internal clients
// to anyone with engagement.create, without granting broader client.read.
export function useAdministrativeInternalClients() {
  return useQuery({
    queryKey: ["clients", "administrative-internal"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_administrative_internal_clients" as never);
      if (error) throw error;
      return (data ?? []) as unknown as AdministrativeInternalClient[];
    },
  });
}
