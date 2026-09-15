// supabase/functions/_shared/plantillas/constants/notificaciones.ts

/**
 * Textos de los 22 tipos del catálogo que salen por correo (D-44,
 * docs/propuesta-correos-por-tipo.md §12).
 *
 * Un tipo sin texto acá no se manda: `../notificaciones.ts` falla ruidoso en vez de despachar un
 * correo vacío, y un test verifica que la lista coincida con lo que el seed marca `email_enabled`.
 *
 * Sólo texto. El armado del mensaje vive en `../notificaciones.ts`.
 */

import type { Copia } from "../layout.ts";

export const TEXTOS_NOTIFICACION: Record<string, Copia> = {
  // ── Cuentas ──
  // Dos variantes del mismo tipo: el rol se deriva de la categoría, así que cambiar la categoría
  // de alguien también dispara este aviso. El emisor deja el origen en el payload.
  "auth.role.changed": {
    asunto: "Su rol en EMS cambió",
    intro: "Un administrador modificó su rol. Con esto cambia lo que puede hacer en el sistema.",
    boton: "Ver mi ficha",
  },
  "auth.role.changed:category": {
    asunto: "Su categoría en EMS cambió",
    intro:
      "Un administrador modificó su categoría y, con ella, su rol en el sistema. Esto cambia lo que puede hacer.",
    boton: "Ver mi ficha",
  },

  // ── Tiempos ──
  // El mismo tipo cubre el envio y el retiro de la boleta: el emisor los distingue con
  // `context` en el payload, igual que hace el panel para elegir el texto.
  "timesheet.own_submit_confirmed": {
    asunto: "Boleta semanal enviada",
    intro: "Se registró el envío de su boleta semanal.",
    boton: "Ver mi hoja de tiempo",
    cierre:
      "Si existe alguna observación sobre la boleta, se le informará por este mismo medio.",
  },
  "timesheet.own_submit_confirmed:withdrawn": {
    asunto: "Boleta semanal retirada",
    intro: "Se retiró su boleta semanal. Vuelva a enviarla cuando esté lista.",
    boton: "Ver mi hoja de tiempo",
  },

  // ── Encargos ──
  "engagement.ending_soon": {
    asunto: "Encargo próximo a finalizar",
    intro: "Un encargo a su cargo está por llegar a su fecha de fin.",
    boton: "Ver encargo",
  },
  "engagement.sqr_assigned": {
    asunto: "Asignación como Socio de Riesgos",
    intro: "Lo asignaron como Socio de Riesgos de un encargo.",
    boton: "Abrir EMS",
  },
  "engagement.encargado_assigned": {
    asunto: "Asignación como Encargado",
    intro: "Lo asignaron como Encargado de un encargo.",
    boton: "Abrir EMS",
  },

  // ── Órdenes de trabajo ──
  "wo.submitted_partner": {
    asunto: "Orden de trabajo pendiente de su aprobación",
    intro: "Una orden de trabajo espera su aprobación como socio.",
    boton: "Revisar orden",
  },
  "wo.submitted_risk": {
    asunto: "Orden de trabajo pendiente de revisión de riesgos",
    intro: "Una orden de trabajo espera la revisión del área de Riesgos.",
    boton: "Revisar orden",
  },
  "wo.rejected_partner": {
    asunto: "Orden de trabajo rechazada por el socio",
    intro: "El socio rechazó una orden de trabajo. Corrija las observaciones y vuelva a enviarla.",
    boton: "Ver orden",
  },
  "wo.rejected_risk": {
    asunto: "Orden de trabajo rechazada por Riesgos",
    intro: "Riesgos rechazó una orden de trabajo. Corrija las observaciones y vuelva a enviarla.",
    boton: "Ver orden",
  },
  "wo.risk.resubmitted": {
    asunto: "Orden de trabajo reenviada a Riesgos",
    intro: "Corrigieron una orden de trabajo y vuelve a la cola de Riesgos.",
    boton: "Revisar orden",
  },
  "wo.payment_plan.pending_approval": {
    asunto: "Plan de pagos pendiente de aprobación",
    intro: "Un plan de pagos espera su aprobación.",
    boton: "Revisar plan",
  },
  "wo.emergency.deadline_near": {
    asunto: "Plazo de emergencia por vencer",
    intro: "Una orden de trabajo en emergencia está por llegar a su plazo.",
    boton: "Ver orden",
  },
  "wo.emergency.deadline_passed": {
    asunto: "Plazo de emergencia vencido",
    intro: "Una orden de trabajo en emergencia superó su plazo.",
    boton: "Ver orden",
  },
  "wo.approval_reverted": {
    asunto: "Aprobación de orden de trabajo revertida",
    intro: "Revirtieron una aprobación. La orden vuelve a requerir revisión.",
    boton: "Ver orden",
  },

  // ── Solicitud de fondos ──
  "fund.request.submitted_for_approval": {
    asunto: "Solicitud de fondos pendiente de su aprobación",
    intro: "Una solicitud de fondos espera su aprobación.",
    boton: "Revisar solicitud",
  },
  "fund.request.decided": {
    asunto: "Decisión sobre su solicitud de fondos",
    intro: "El gerente decidió sobre su solicitud de fondos.",
    boton: "Ver solicitud",
  },
  "fund.expenses.all_reviewed": {
    asunto: "Gastos revisados en su totalidad",
    intro: "Contabilidad terminó de revisar los gastos de una solicitud. Puede liquidarla.",
    boton: "Ver gastos",
  },
  "fund.disbursement.done": {
    asunto: "Fondos desembolsados",
    intro: "Se registró el desembolso de una solicitud de fondos.",
    boton: "Ver solicitud",
  },
  "fund.settlement.recorded": {
    asunto: "Liquidación registrada",
    intro: "Se registró la liquidación de una solicitud de fondos.",
    boton: "Ver solicitud",
  },
  "fund.request.closed": {
    asunto: "Solicitud de fondos cerrada",
    intro: "Se cerró una solicitud de fondos.",
    boton: "Ver solicitud",
  },
  "fund.request.cancelled": {
    asunto: "Solicitud de fondos cancelada",
    intro: "Se canceló una solicitud de fondos. No requiere ninguna acción adicional.",
    boton: "Ver solicitud",
  },
  "fund.expense.returned_no_support": {
    asunto: "Gasto devuelto por falta de respaldo",
    intro:
      "Contabilidad devolvió un gasto porque falta el respaldo. Cargue la factura y vuelva a enviarlo.",
    boton: "Cargar respaldo",
  },
  "fund.expense.iva_penalty": {
    asunto: "Multa de IVA aplicada a un gasto",
    intro: "Se aplicó una multa de IVA sobre uno de sus gastos.",
    boton: "Ver gasto",
  },
};

/**
 * Claves del payload que se muestran como detalle, en este orden.
 *
 * Sacan el identificador DEL TEXTO: "Se cerró la solicitud FR-2026-2027 de BOB 1.500" obliga a
 * redactar una frase distinta por tipo. El texto se queda con el hecho, y la referencia baja a
 * una línea aparte.
 *
 * `formato` sólo se declara donde el valor NO llega ya presentable, y se declara CLAVE POR CLAVE
 * en vez de detectarse por patrón: un `notes` o un `reason` que el usuario escriba con forma de
 * fecha es texto suyo, y reordenarlo sería corromperlo.
 *
 *   - `fecha`: vienen de columnas `date` y jsonb las serializa en ISO, así que sin la marca el
 *     correo imprimía "Plazo: 2026-09-18", contra la regla 3 de AGENTS.md (DD/MM/YYYY).
 *   - `monto`: `JSON.parse` convierte el 1500.00 de jsonb en 1500, y String() lo dejaba pasar sin
 *     separador de miles ni moneda. La moneda sale de `payload.currency` y NO tiene línea propia:
 *     "BOB" a secas no le dice nada a nadie, y los cuatro disparadores que mandan `amount` mandan
 *     también la moneda.
 */
export const DETALLES_PAYLOAD: { clave: string; etiqueta: string; formato?: "fecha" | "monto" }[] = [
  { clave: "semana", etiqueta: "Semana" },
  { clave: "request_number", etiqueta: "Solicitud" },
  { clave: "engagement_code", etiqueta: "Encargo" },
  { clave: "activity_code", etiqueta: "Actividad" },
  { clave: "amount", etiqueta: "Monto", formato: "monto" },
  { clave: "decision", etiqueta: "Decisión" },
  { clave: "reason", etiqueta: "Motivo" },
  { clave: "notes", etiqueta: "Observaciones" },
  { clave: "deadline", etiqueta: "Plazo", formato: "fecha" },
  { clave: "invoice_date", etiqueta: "Fecha de facturación", formato: "fecha" },
  { clave: "previous_role_key", etiqueta: "Rol anterior" },
  { clave: "role_key", etiqueta: "Rol actual" },
];
