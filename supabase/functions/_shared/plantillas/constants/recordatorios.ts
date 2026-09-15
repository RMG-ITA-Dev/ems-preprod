// supabase/functions/_shared/plantillas/constants/recordatorios.ts

/**
 * Textos de los 4 recordatorios periódicos (D-44).
 *
 * Un recordatorio no cuenta un hecho: cuenta lo acumulado. Por eso cada uno declara sus
 * `conceptos` —qué contadores resume y cómo se llama cada uno—, y el renderizador arma las líneas
 * con los números que trae el payload, salteando los que vienen en cero.
 *
 * Sólo texto. El armado del mensaje vive en `../notificaciones.ts`.
 */

import type { Copia } from "../layout.ts";

export type Concepto = {
  /** Clave del payload que trae `{ count: n }`. */
  clave: string;
  /** Cómo se lee el número. Singular y plural, porque "1 semanas" se nota. */
  singular: string;
  plural: string;
};

export type CopiaRecordatorio = Copia & { conceptos: Concepto[] };

export const TEXTOS_RECORDATORIO: Record<string, CopiaRecordatorio> = {
  "timesheet.reminder.daily": {
    asunto: "Horas pendientes de registro",
    intro: "Tiene registros de horas pendientes.",
    boton: "Ir a mi hoja de tiempo",
    conceptos: [
      { clave: "overdue", singular: "semana sin registrar", plural: "semanas sin registrar" },
      { clave: "reverted", singular: "semana devuelta", plural: "semanas devueltas" },
    ],
  },

  "approval.reminder.weekly": {
    asunto: "Aprobaciones pendientes",
    intro: "Tiene trabajo esperando su aprobación.",
    boton: "Ir a aprobaciones",
    conceptos: [
      // OJO: `lineas` NO es trabajo por aprobar, es lo contrario. El contador cuenta las semanas
      // que envió el DESTINATARIO y que siguen esperando a su aprobador
      // (`notif_agg_timesheet_pending_approval` filtra por `tp.staff_id = p_staff_id`). Decía
      // "semana por aprobar" y mandaba a la cola del aprobador, a la que un senior ni entra.
      {
        clave: "lineas",
        singular: "semana suya esperando aprobación",
        plural: "semanas suyas esperando aprobación",
      },
      {
        clave: "capacitacion",
        singular: "línea de capacitación por aprobar",
        plural: "líneas de capacitación por aprobar",
      },
      { clave: "encargos", singular: "encargo por aprobar", plural: "encargos por aprobar" },
    ],
  },

  "fund.reminder.weekly": {
    asunto: "Solicitudes de fondos pendientes",
    intro: "Hay solicitudes de fondos esperando su gestión.",
    boton: "Ir a solicitudes",
    conceptos: [
      { clave: "revision_gastos", singular: "gasto por revisar", plural: "gastos por revisar" },
      { clave: "desembolsos", singular: "solicitud por desembolsar", plural: "solicitudes por desembolsar" },
      { clave: "liquidaciones", singular: "solicitud por liquidar", plural: "solicitudes por liquidar" },
      { clave: "cierres", singular: "solicitud por cerrar", plural: "solicitudes por cerrar" },
    ],
  },

  "wo.installment.reminder.weekly": {
    asunto: "Cuotas por cobrar",
    intro: "Hay cuotas vencidas o por vencer esta semana.",
    boton: "Ir a órdenes de trabajo",
    conceptos: [
      { clave: "vencidas", singular: "cuota vencida", plural: "cuotas vencidas" },
      { clave: "por_vencer", singular: "cuota por vencer", plural: "cuotas por vencer" },
    ],
  },
};

/** Destino de cada recordatorio. No llevan entity_id: apuntan a una pantalla, no a un registro. */
export const RUTAS_RECORDATORIO: Record<string, string> = {
  "timesheet.reminder.daily": "/timesheet",
  "approval.reminder.weekly": "/timesheet/approvals",
  "fund.reminder.weekly": "/fund-requests",
  "wo.installment.reminder.weekly": "/work-orders",
};

export type DestinoRecordatorio = { ruta: string; boton: string; intro: string };

/**
 * Cuando un recordatorio resume contadores que viven en PANTALLAS DISTINTAS, el destino no puede
 * ser uno fijo por tipo: sale del contador que el destinatario realmente tiene.
 *
 * `approval.reminder.weekly` junta tres cosas que la app rutea por separado
 * (`TYPE_ROUTE_PERMISSION` en src/lib/notifications.ts): la boleta propia esperando aprobación va
 * a `/timesheet`, la cola de capacitación a `/timesheet/approvals` y los encargos a
 * `/engagements`. Mandarlas a las tres a la cola del aprobador le daba "No access" a los ocho
 * roles que reciben el recordatorio sin `timesheet_approval.read` — assistant, semisenior,
 * senior, los ita_/tax_ y Seguridad TI, o sea casi toda la firma.
 *
 * El orden de las claves ES la prioridad: primero lo que el destinatario tiene que resolver él,
 * y recién al final lo que sólo está esperando a otro. Los recordatorios que no figuran acá
 * tienen un destino único y siguen saliendo por `RUTAS_RECORDATORIO`.
 */
export const DESTINOS_POR_CONCEPTO: Record<string, Record<string, DestinoRecordatorio>> = {
  "approval.reminder.weekly": {
    capacitacion: {
      ruta: "/timesheet/approvals",
      boton: "Ir a aprobaciones",
      intro: "Tiene trabajo esperando su aprobación.",
    },
    encargos: {
      ruta: "/engagements",
      boton: "Ir a encargos",
      intro: "Tiene trabajo esperando su aprobación.",
    },
    lineas: {
      ruta: "/timesheet",
      boton: "Ir a mi hoja de tiempo",
      intro: "Tiene semanas enviadas que todavía esperan aprobación.",
    },
  },
};

function conteoDeConcepto(payload: Record<string, unknown>, clave: string): number {
  const bloque = payload[clave];
  if (!bloque || typeof bloque !== "object") return 0;
  const valor = (bloque as Record<string, unknown>).count;
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) && numero > 0 ? Math.trunc(numero) : 0;
}

/**
 * El destino de un recordatorio según lo que trae su payload: el primer contador con algo, en el
 * orden de prioridad declarado arriba. Null cuando el tipo no reparte destinos o cuando ninguno
 * de sus contadores tiene número — ahí manda `RUTAS_RECORDATORIO`.
 */
export function destinoDeRecordatorio(
  typeKey: string,
  payload: Record<string, unknown>,
): DestinoRecordatorio | null {
  const porConcepto = DESTINOS_POR_CONCEPTO[typeKey];
  if (!porConcepto) return null;

  for (const [clave, destino] of Object.entries(porConcepto)) {
    if (conteoDeConcepto(payload, clave) > 0) return destino;
  }
  return null;
}
