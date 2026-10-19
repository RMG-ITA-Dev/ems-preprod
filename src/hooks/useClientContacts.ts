import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cobranzas Fase 5 (issue #352) — contactos del cliente.
 *
 * El cliente tenía UN contacto suelto y Cobranzas necesita otro distinto: el de finanzas, a
 * quien se le reclama una factura. Ahora hay dos tipos, `general` y `cobranza`, los dos
 * obligatorios, y puede haber varios de cada uno (decisiones Q20 y Q52).
 */
export interface ClientContact {
  contact_id: string;
  client_id: string;
  contact_type: "general" | "cobranza";
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

/** Los contactos de un cliente, para la ficha de Cliente. */
export function useClientContacts(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client_contacts", clientId],
    queryFn: async (): Promise<ClientContact[]> => {
      const { data, error } = await supabase
        .from("client_contacts" as never)
        .select("*")
        .eq("client_id", clientId!)
        .eq("is_active", true)
        .order("contact_type");
      if (error) throw error;
      return (data ?? []) as unknown as ClientContact[];
    },
    enabled: !!clientId,
  });
}

/**
 * Los contactos vistos DESDE el plan de pagos. Va por RPC y no por la tabla porque el Gerente
 * de Contabilidad no tiene `client.read` (Carril B / B3p) y la decisión Q57 fue mostrarle los
 * contactos dentro del plan, sin abrirle la ficha entera del cliente.
 */
export function useWorkOrderClientContacts(woId: string | undefined) {
  return useQuery({
    queryKey: ["wo_client_contacts", woId],
    queryFn: async (): Promise<ClientContact[]> => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)("get_wo_client_contacts", { p_wo_id: woId });
      if (error) throw error;
      return (data ?? []) as ClientContact[];
    },
    enabled: !!woId,
  });
}

/** El primer contacto activo de un tipo. El formulario de Cliente edita ése. */
export function firstContactOfType(
  contacts: ClientContact[] | undefined,
  type: "general" | "cobranza",
): ClientContact | undefined {
  return (contacts ?? []).find((c) => c.contact_type === type && c.is_active);
}
