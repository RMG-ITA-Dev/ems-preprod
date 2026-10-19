import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createMutationErrorHandler, handleError, ErrorCode } from "@/lib/error-handler";
import i18n from "@/i18n";

// Handle duplicate constraint errors with structured matching
function handleClientError(error: Error, operation: string) {
  const err = error as unknown as {
    code?: string;
    message?: string;
    constraint?: string;
    details?: string;
  };

  if (err.code === "23505") {
    // Prefer err.constraint when available; fall back to message.includes()
    const constraintName = err.constraint || err.message || "";

    if (constraintName.includes("clients_client_legal_name_unique")) {
      toast.error(i18n.t("errors.duplicateClientName"));
      return;
    }
    if (constraintName.includes("clients_unique_tax_id_key")) {
      // Sin {nit, name}: con la RLS de clients (B3c) el chequeo previo de ClientForm no ve un cliente
      // ajeno, así que el NIT duplicado llega acá como 23505 y no hay nombre que mostrar.
      // `errors.duplicateNit` (con variables) sigue siendo el del chequeo previo.
      toast.error(i18n.t("errors.duplicateNitExists"));
      return;
    }
  }

  createMutationErrorHandler(operation)(error);
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      // Cobranzas Fase 5: el alta ACEPTA el client_id que genera el formulario. Hacía falta
      // porque esta mutación no puede devolver la fila creada (ver el comentario de abajo
      // sobre el RETURNING) y los contactos, que se guardan aparte, necesitan ese id.
      client_id?: string;
      client_legal_name: string;
      unique_tax_id: string;
      industry_id?: string;
      address?: string;
      is_active?: boolean;
    }) => {
      // Sin `.select()` a propósito: el RETURNING obliga a que la fila nueva pase
      // la política de LECTURA de clients, que para los roles con alcance
      // 'assigned_clients' exige is_assigned_to_client() — imposible de cumplir
      // para un cliente que acaba de nacer y todavía no tiene ningún encargo.
      // Con RETURNING, la creación fallaba para Socio, SQR, Director, Gerente y
      // los Gerentes Especialistas ITA/TAX. Nadie consume la fila devuelta:
      // ClientForm descarta el resultado y ClientNew navega a /clients.
      const { error } = await supabase.from("clients").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(i18n.t("messages.createSuccess", { entity: i18n.t("entities.client") }));
    },
    onError: (error) => handleClientError(error, "creating client"),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        client_legal_name: string;
        unique_tax_id: string;
        industry_id: string;
        address: string;
        is_active: boolean;
      }>;
    }) => {
      const { data: result, error } = await supabase
        .from("clients")
        .update(data)
        .eq("client_id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(i18n.t("messages.updateSuccess", { entity: i18n.t("entities.client") }));
    },
    onError: (error) => handleClientError(error, "updating client"),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("client_id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success(i18n.t("messages.deleteSuccess", { entity: i18n.t("entities.client") }));
    },
    onError: createMutationErrorHandler("deleting client"),
  });
}

// ── Cobranzas Fase 5 (issue #352): contactos del cliente ─────────────────────────────────
// Reemplaza el juego completo de contactos. La RPC valida el mínimo —al menos un contacto
// activo de tipo `general` y uno de tipo `cobranza` (decisión Q52)— y decide quién puede
// escribirlos: quien mantiene al cliente (`client.update`), el gerente de un encargo suyo o un
// admin. Ese segundo caso es el que permite completarlos DESDE el plan de pagos, que es donde
// se descubre que falta el de finanzas (decisión Q21/Q22).
export function useSaveClientContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      contacts,
    }: {
      clientId: string;
      contacts: Array<{
        contact_id?: string;
        contact_type: "general" | "cobranza";
        full_name: string;
        email?: string;
        phone?: string;
        is_active?: boolean;
      }>;
      /** Presente cuando se guarda desde el plan: invalida también esa consulta. */
      woId?: string;
    }) => {
      const { error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message?: string } | null }>)("save_client_contacts", {
        p_client_id: clientId,
        p_contacts: contacts,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["client_contacts", v.clientId] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      if (v.woId) queryClient.invalidateQueries({ queryKey: ["wo_client_contacts", v.woId] });
    },
    onError: createMutationErrorHandler("saving client contacts"),
  });
}
