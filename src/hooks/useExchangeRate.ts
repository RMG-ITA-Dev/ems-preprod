import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExchangeRate {
  fecha_vigencia: string;
  compra: number;
  venta: number;
  fuente: string;
  estado: "vigente" | "stale";
}

const RATE_COLUMNS = "fecha_vigencia,compra,venta,fuente,estado";

/**
 * Reads the most recent row of exchange_rate_history directly (RLS: authenticated
 * SELECT-only, no bespoke query needed). Returns null when the table is empty — the
 * navbar indicator renders its own "unavailable" state rather than treating this as an
 * error (bug 0722-156, Fase 1: no automatic cron yet, so an unseeded environment is
 * expected until an admin uses Settings → "Probar → Guardar").
 */
export function useLatestExchangeRate() {
  return useQuery({
    queryKey: ["exchange-rate", "latest"],
    queryFn: async (): Promise<ExchangeRate | null> => {
      const { data, error } = await supabase
        .from("exchange_rate_history" as never)
        .select(RATE_COLUMNS)
        .order("fecha_vigencia", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as ExchangeRate) ?? null;
    },
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
