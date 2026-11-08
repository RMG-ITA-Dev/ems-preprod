// 1028-211: el texto de trazabilidad de la ficha del cliente ("Activado por Ana Pérez el 06/11/2026").
// Sin React ni Supabase: recibe la fila y devuelve la clave i18n y sus parámetros.

import { format, parseISO } from "date-fns";

type Person = { first_name: string; last_name: string } | null | undefined;

export interface ClientActivationFields {
  is_active: boolean | null;
  activated_at?: string | null;
  deactivated_at?: string | null;
  activated_by?: Person;
  deactivated_by?: Person;
}

export interface ActivationInfo {
  key: "client.activatedBy" | "client.activatedOn" | "client.deactivatedBy" | "client.deactivatedOn";
  params: { name?: string; date: string };
}

const fullName = (person: Person): string | null => {
  const name = person ? `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() : "";
  return name || null;
};

/**
 * Lo que corresponde al estado ACTUAL: un cliente activo muestra su última activación y uno inactivo su
 * última desactivación. Sin fecha registrada (clientes anteriores a 1028-211, o un alta pendiente que
 * nunca se activó) devuelve null. Sin nombre (lo hizo el sistema, p. ej. la carga ETL) solo da la fecha.
 */
export function clientActivationInfo(client: ClientActivationFields): ActivationInfo | null {
  const active = client.is_active === true;
  const at = active ? client.activated_at : client.deactivated_at;
  if (!at) return null;
  const date = format(parseISO(at), "dd/MM/yyyy");
  const name = fullName(active ? client.activated_by : client.deactivated_by);
  if (active) return name ? { key: "client.activatedBy", params: { name, date } } : { key: "client.activatedOn", params: { date } };
  return name ? { key: "client.deactivatedBy", params: { name, date } } : { key: "client.deactivatedOn", params: { date } };
}
