// supabase/functions/_shared/plantillas/rutas.ts

/**
 * A qué pantalla lleva el botón de cada correo.
 *
 * Espejo de `notificationRoute()` (src/lib/notifications.ts), acotado a los tipos que salen por
 * correo. No se importa aquel: vive en el bundle del navegador, y esto corre en Deno.
 *
 * Que sean dos copias es deliberado pero no gratis: si una ruta cambia en la app, este archivo
 * queda apuntando a una pantalla que ya no existe. El correo seguiría saliendo y el enlace daría
 * 404, que es peor que no tener enlace. Cuando se toque una ruta de la app, se toca acá.
 */

import { RUTAS_RECORDATORIO } from "./constants/recordatorios.ts";

export type DatosRuta = {
  typeKey: string;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
};

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/**
 * Devuelve la ruta relativa, o null si no hay a dónde ir. Sin ruta el correo igual se manda: lleva
 * al inicio de la aplicación, que es mejor que no avisar.
 */
export function rutaDeNotificacion(datos: DatosRuta): string | null {
  const { typeKey } = datos;
  const entidad = texto(datos.entityId);
  const payload = datos.payload ?? {};

  const recordatorio = RUTAS_RECORDATORIO[typeKey];
  if (recordatorio) return recordatorio;

  // Los eventos de GASTO llevan fre_id en entity_id, que no es parámetro de ninguna ruta: el
  // destino es la pantalla de gastos de su solicitud, cuyo id viaja en el payload.
  if (typeKey.startsWith("fund.expense.")) {
    const solicitud = texto(payload.fund_request_id);
    return solicitud ? `/fund-requests/${solicitud}/expenses` : null;
  }

  // El consolidado se emite sobre la SOLICITUD, no sobre un gasto.
  if (typeKey === "fund.expenses.all_reviewed") {
    return entidad ? `/fund-requests/${entidad}/expenses` : null;
  }

  if (typeKey.startsWith("fund.")) {
    return entidad ? `/fund-requests/${entidad}` : null;
  }

  // Todos los eventos del módulo llevan wo_id en entity_id, incluidos los de cuota: la cuota no
  // tiene pantalla propia, se edita en la pestaña "Plan de pagos" de su orden.
  if (typeKey.startsWith("wo.")) {
    return entidad ? `/work-orders/${entidad}` : null;
  }

  if (typeKey.startsWith("engagement.")) {
    return entidad ? `/engagements/${entidad}` : null;
  }

  // Los eventos de cuenta nacen en `user_roles`, donde lo que hay es un user_id: el disparador
  // resuelve la ficha y la deja en el payload.
  if (typeKey.startsWith("auth.")) {
    const staff = texto(payload.staff_id);
    return staff ? `/staff/${staff}` : null;
  }

  return null;
}

/** Ruta relativa a URL absoluta contra el origen de la aplicación. */
export function urlAbsoluta(base: string, ruta: string | null): string {
  const origen = base.replace(/\/+$/, "");
  if (!ruta) return origen || "/";
  return `${origen}${ruta.startsWith("/") ? ruta : `/${ruta}`}`;
}
