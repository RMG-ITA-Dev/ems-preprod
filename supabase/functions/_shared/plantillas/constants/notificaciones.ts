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

// Las plantillas de correo se ejecutan en la Edge Function y no tienen acceso a i18next. Estos
// son los equivalentes en español de `authz.role.*`: el payload conserva el role_key canónico,
// pero nunca se lo expone como texto técnico a la persona destinataria.
export const NOMBRES_ROL_CORREO: Record<string, string> = {
  admin: "Administrador",
  it_security_manager: "Gerente Nacional de Seguridad TI",
  senior_partner: "Senior Partner",
  partner: "Socio",
  sqr: "Calidad-Riesgo (SQR)",
  director: "Director",
  manager: "Gerente",
  senior: "Senior",
  semisenior: "Semi Senior",
  assistant: "Asistente",
  // Valores de `app_role` legacy: notify_user_account_events() los envía cuando
  // cambia únicamente user_roles.role mediante el RPC deprecado.
  staff: "Asistente",
  viewer: "Visualizador",
  specialist_it: "Especialista IT",
  specialist_tax: "Especialista Tax",
  ita_manager: "Gerente Especialista ITA",
  ita_senior: "Senior Especialista ITA",
  ita_assistant: "Asistente Especialista ITA",
  tax_manager: "Gerente Especialista TAX",
  tax_senior: "Senior Especialista TAX",
  tax_assistant: "Asistente Especialista TAX",
  accounting_manager: "Gerente de Contabilidad",
  accounting_analyst: "Analista de Contabilidad",
  collections_analyst: "Analista de Cobranzas",
  risk_partner: "Socio de Riesgos",
  risk_supervisor: "Supervisor de Riesgos",
  hr_manager: "Gerente de Talento Humano",
  hr_analyst: "Analista de Talento Humano",
};

export const TEXTOS_NOTIFICACION: Record<string, Copia> = {
  // ── Cuentas ──
  // Dos variantes del mismo tipo: el rol se deriva de la categoría, así que cambiar la categoría
  // de alguien también dispara este aviso. El emisor deja el origen en el payload.
  "auth.role.changed": {
    asunto: "Su rol cambió",
    intro: "Un administrador modificó su rol. Con esto cambia lo que puede hacer en el sistema.",
    boton: "Ver mi ficha",
  },
  "auth.role.changed:category": {
    asunto: "Su categoría cambió",
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
  "timesheet.team_submitted_for_approval": {
    asunto: "Boleta semanal pendiente de aprobación",
    intro: "Una boleta de su equipo espera su revisión.",
    boton: "Ir a aprobaciones",
  },
  "engagement.created": {
    asunto: "Nuevo encargo asignado",
    intro: "Se creó un encargo bajo su responsabilidad.",
    boton: "Ver encargo",
  },
  "engagement.owners.changed": {
    asunto: "Cambios en responsables del encargo",
    intro: "Se actualizaron los responsables de un encargo bajo su responsabilidad.",
    boton: "Ver encargo",
  },
  "engagement.staffing.changed": {
    asunto: "Asignación de personal actualizada",
    intro: "Se actualizó la asignación de personal de un encargo.",
    boton: "Ver encargo",
  },
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

  // Un tipo, dos redacciones por `context` (D-43): el hecho es el mismo y lo unico que cambia es
  // la especialidad. El texto base existe igual, por si algun dia hay un especialista sin sabor.
  //
  // LOS TRES VAN SIN `boton`, y es deliberado: /engagements/<id> le muestra al Gerente
  // ESPECIALISTA el cartel de "encargo no disponible". La pantalla se surte de
  // `list_portfolio_engagements()` (BUG 0828-185), cuyos 4 buckets resuelven a ita_manager/
  // tax_manager por `manager_id` y no por `specialist_it_id`/`specialist_tax_id`. Un boton
  // "Ver encargo" ahi es una promesa que el sistema no cumple.
  //
  // Como el correo se queda sin destino, el encargo tiene que quedar identificado EN EL TEXTO:
  // de eso se ocupan las lineas de detalle, cliente + encargo (ver DETALLES_PAYLOAD).
  // Cuando el portafolio contemple a los especialistas, esto vuelve a llevar boton.
  "engagement.specialist_assigned": {
    asunto: "Lo asignaron a un encargo",
    intro: "Lo asignaron como especialista del encargo que se detalla a continuacion.",
    cierre: "Aviso informativo: no requiere ninguna accion de su parte.",
  },
  "engagement.specialist_assigned:it": {
    asunto: "Lo asignaron a un encargo",
    intro: "Lo asignaron como especialista ITA del encargo que se detalla a continuacion.",
    cierre: "Aviso informativo: no requiere ninguna accion de su parte.",
  },
  "engagement.specialist_assigned:tax": {
    asunto: "Lo asignaron a un encargo",
    intro: "Lo asignaron como especialista TAX del encargo que se detalla a continuacion.",
    cierre: "Aviso informativo: no requiere ninguna accion de su parte.",
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
  // El cliente encabeza al encargo porque es el dato que lo ubica: "Auditoria Externa 2026" se
  // repite entre clientes, y un correo sin boton —ver `engagement.specialist_assigned`— no
  // tiene pantalla a la que ir a averiguar de cual se trata.
  { clave: "client_name", etiqueta: "Cliente" },
  // Codigo y nombre del encargo viajan en claves distintas y se muestran en UNA linea:
  // "Encargo: 12-06" y "Nombre: Auditoria Externa 2026" son dos renglones para un solo dato.
  // Los compone `detallesDeEvento`, igual que hace con la semana.
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
