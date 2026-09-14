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
      { clave: "lineas", singular: "semana por aprobar", plural: "semanas por aprobar" },
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
