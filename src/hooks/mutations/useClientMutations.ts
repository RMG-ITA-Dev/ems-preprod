import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpcUntyped } from "@/lib/rpcUntyped";
import { toast } from "sonner";
import { createMutationErrorHandler, handleError, ErrorCode } from "@/lib/error-handler";
import i18n from "@/i18n";

// 1028-211: NIT y razón social ya no son únicos (ETL retiró clients_unique_tax_id_key y
// clients_client_legal_name_unique), así que no hay 23505 de cliente que traducir. Cualquier otro
// error —incluido un 23505 de otra tabla, como client_contacts— va al manejador genérico.
function handleClientError(error: Error, operation: string) {
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
      tax_id: string;
      industry_id?: string | null;
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
        tax_id: string;
        industry_id: string | null;
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

// 1028-211: activar o desactivar un cliente. Solo Cobranzas, el Gerente de Contabilidad y admin
// (client.activate); la RPC lo vuelve a exigir y limita a Cobranzas/Contabilidad a su sociedad. No
// pasa por client.update, que daría edición de toda la ficha.
export function useSetClientActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, active }: { clientId: string; active: boolean }) => {
      const { error } = await rpcUntyped("set_client_active", {
        p_client_id: clientId,
        p_active: active,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      // ['clients'] cubre la lista y el directorio (['clients', 'directory']); la ficha lee
      // ['clients_full'], que es otra clave: sin invalidarla, la ficha seguía mostrando el estado viejo.
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients_full"] });
      toast.success(i18n.t(v.active ? "client.activatedSuccess" : "client.deactivatedSuccess"));
    },
    onError: createMutationErrorHandler("updating client status"),
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
      const { error } = await rpcUntyped("save_client_contacts", {
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

// La ficha y sus contactos en UNA llamada (save_client_with_contacts): si los contactos fallan,
// la ficha no queda grabada a medias. Reemplaza en ClientForm el par alta/edición + contactos.
export function useSaveClientWithContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      isNew,
      client,
      contacts,
    }: {
      clientId: string;
      isNew: boolean;
      client: {
        client_legal_name: string;
        tax_id: string;
        // 1028-211: ausente conserva el valor guardado; null lo limpia (save_client_with_contacts).
        industry_id?: string | null;
        address?: string;
        is_active?: boolean;
      };
      contacts: Array<{
        contact_id?: string;
        contact_type: "general" | "cobranza";
        full_name: string;
        email?: string;
        phone?: string;
        is_active?: boolean;
      }>;
    }) => {
      const { error } = await rpcUntyped("save_client_with_contacts", {
        p_client_id: clientId,
        p_is_new: isNew,
        p_client: client,
        p_contacts: contacts,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client_contacts", v.clientId] });
      toast.success(
        i18n.t(v.isNew ? "messages.createSuccess" : "messages.updateSuccess", { entity: i18n.t("entities.client") }),
      );
    },
    onError: (error, v) => handleClientError(error, v.isNew ? "creating client" : "updating client"),
  });
}
