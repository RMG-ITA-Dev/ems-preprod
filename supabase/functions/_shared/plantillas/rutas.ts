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

import { destinoDeRecordatorio, RUTAS_RECORDATORIO } from "./constants/recordatorios.ts";

export type DatosRuta = {
  typeKey: string;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
};

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/**
 * Devuelve la ruta relativa, o null si no hay a dónde ir.
 *
 * Sin ruta el correo igual se manda —el hecho vale por sí mismo—, pero SIN BOTÓN: hasta
 * 2026-09-16 el null se convertía en el origen pelado (`urlAbsoluta`) y el mensaje salía con
 * "Ver encargo" apuntando a la portada, que es la misma mentira que un enlace roto. Lo decide
 * `renderizarCorreoNotificacion`, y `layout.ts` omite el botón cuando no hay enlace.
 */
export function rutaDeNotificacion(datos: DatosRuta): string | null {
  const { typeKey } = datos;
  const entidad = texto(datos.entityId);
  const payload = datos.payload ?? {};

  // PRIMERO, y antes que cualquier destino: el destinatario no puede abrir esa pantalla. Lo
  // decide `notify_staff` al encolar, que es el único momento en que se sabe de quién es el
  // correo — acá no hay sesión contra la cual chequear permisos. Sin esto el botón llevaba a
  // "Sin acceso" a pantalla completa: risk_partner y risk_supervisor en los avisos de riesgo,
  // senior y collections_analyst en los de plan de pagos. Ver `notif_permiso_de_ruta` en la
  // migración del catálogo.
  if (payload.sin_ruta === true) return null;

  // Un recordatorio que resume contadores de pantallas distintas elige destino según lo que
  // traiga el payload; el resto tiene uno fijo.
  const porConcepto = destinoDeRecordatorio(typeKey, payload);
  if (porConcepto) return porConcepto.ruta;

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

  // El borrado de encargo es DURO: el trigger emite el id de una fila que ya no existe, así que
  // la pantalla de detalle sólo puede mostrar el cartel de "no disponible". Esto no lo cubre el
  // `sin_ruta` de arriba —el admin SÍ tiene `engagement.read`—, y no es lo mismo: allá la
  // pantalla existe y le queda cerrada, acá directamente no hay pantalla.
  if (typeKey === "engagement.deleted") return null;

  // La asignación de un especialista tampoco tiene a dónde llevar, y por una razón distinta de
  // la del borrado: el encargo EXISTE, pero el destinatario no lo tiene en su portafolio.
  // EngagementEdit.tsx no lee la tabla, lee `list_portfolio_engagements()` (BUG 0828-185), y
  // su bucket `own_management` resuelve a `ita_manager`/`tax_manager` por `manager_id` — las
  // columnas `specialist_it_id` y `specialist_tax_id` no figuran en ninguno de los 4 buckets.
  // Un encargo donde el Gerente ESPECIALISTA sólo es especialista no aparece en la lista, y
  // /engagements/<id> le muestra "encargo no disponible". (Salvo que lo haya creado él: el
  // bucket `creator` sí lo alcanza. El aviso no puede distinguir ese caso.)
  //
  // NO ES LA RLS, aunque lo parezca: `is_assigned_to_engagement()` tampoco mira esas dos
  // columnas, pero `engagements` no tiene ENABLE ROW LEVEL SECURITY —drift de 20260115000154,
  // ver docs/hallazgo-rls-drift-ruta-a.md— así que la policy "engagements read" no se evalúa
  // hoy. Cuando se reactive, la falta de la RLS se suma; no la reemplaza.
  //
  // Tampoco lo cubre el `sin_ruta` de arriba: `ita_manager` y `tax_manager` SÍ tienen
  // `engagement.read`, y lo que les falta es la FILA, no el permiso. Espejo de
  // `notificationRoute` (src/lib/notifications.ts). El correo compensa nombrando cliente y
  // encargo en el detalle.
  if (typeKey === "engagement.specialist_assigned") return null;

  // Acá vivía una excepción a mano para `engagement.sqr_assigned` y `engagement.encargado_assigned`,
  // que apagaba el enlace porque Senior/Semi Senior reciben esas asignaciones sin tener
  // `engagement.read`. La reemplaza el `sin_ruta` de arriba, que cubre la clase entera en vez de
  // dos tipos — y de paso deja de castigar a los gerentes, que SÍ pueden abrir el encargo.
  if (typeKey.startsWith("engagement.")) {
    return entidad ? `/engagements/${entidad}` : null;
  }

  // La hoja de tiempo tiene DOS destinos segun de quien sea la boleta, igual que en la app
  // (`notificationRoute`, case "timesheet"): el acuse propio va a MI hoja —/timesheet no toma la
  // semana por URL, TimeSheet.tsx no lee searchParams— y los avisos sobre la boleta de OTRO al
  // detalle de aprobacion de ese periodo, que si lo toma por ruta.
  //
  // Hoy el unico de los tres que sale por correo es el acuse propio, pero la rama espeja los tres:
  // este archivo se quedo sin rama `timesheet.` desde el principio, y el correo salia con el boton
  // "Ver mi hoja de tiempo" apuntando a la portada. Cubrir la clase entera evita repetirlo cuando
  // la matriz le encienda el correo a otro.
  if (typeKey === "timesheet.own_submit_confirmed") return "/timesheet";
  if (typeKey.startsWith("timesheet.")) {
    return entidad ? `/timesheet/approvals/${entidad}` : null;
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
