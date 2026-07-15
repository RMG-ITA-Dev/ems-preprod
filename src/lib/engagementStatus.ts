/**
 * FEAT 0602-135 — Máquina de estados del encargo (9 estados).
 *
 * El estado que se muestra al usuario es el "estado efectivo":
 *   estado_efectivo = override_manual (si existe) ?? estado_derivado_de_la_OT
 *
 * - Los estados 1,2,3,4,5,8 se DERIVAN del estado de la Orden de Trabajo (pistas
 *   independientes Socio + Riesgos + emergencia). No hay secuencia forzada: Riesgos
 *   puede aprobar antes que el Socio (estado 3).
 * - Los estados 6 Cancelado, 7 Finalizado y 9 Congelado son manuales/terminales y se
 *   persisten en engagements.engagement_state_override (el Admin/Gerente los fija, y el
 *   cron de finalizado escribe el 7). El override, si está presente, gana sobre la OT.
 * - Encargos administrativos (work_order_required = false) no tienen OT ni flujo de
 *   aprobación: su estado derivado es 4 Aprobado.
 *
 * Ver bugs/0602-135/plan_v2.md.
 */

export enum EngagementState {
  Pendiente = 1,
  AprobadoSocio = 2,
  AprobadoRiesgos = 3,
  Aprobado = 4,
  AprobadoEmergencia = 5,
  Cancelado = 6,
  Finalizado = 7,
  Rechazado = 8,
  Congelado = 9,
}

/** Orden de presentación en filtros/listados. */
export const ENGAGEMENT_STATES: readonly EngagementState[] = [
  EngagementState.Pendiente,
  EngagementState.AprobadoSocio,
  EngagementState.AprobadoRiesgos,
  EngagementState.Aprobado,
  EngagementState.AprobadoEmergencia,
  EngagementState.Cancelado,
  EngagementState.Finalizado,
  EngagementState.Rechazado,
  EngagementState.Congelado,
];

/** Estados manuales/terminales: los fija el Admin/Gerente (o el cron para el 7). */
export const MANUAL_STATES: ReadonlySet<EngagementState> = new Set([
  EngagementState.Cancelado,
  EngagementState.Finalizado,
  EngagementState.Congelado,
]);

/**
 * Campos mínimos del encargo necesarios para calcular el estado. Se declara aquí
 * (no se importa de los tipos generados de Supabase) para que el módulo sea puro
 * y 100% testeable sin dependencias.
 */
export interface EngagementStateInput {
  work_order_required: boolean;
  engagement_state_override?: number | null;
}

/** Campos mínimos de la OT necesarios para derivar el estado. */
export interface WorkOrderStateInput {
  approval_status?: string | null;
  approved_at?: string | null;
  risk_status?: string | null;
}

function isValidState(value: number | null | undefined): value is EngagementState {
  return value != null && value >= 1 && value <= 9;
}

/**
 * Estado DERIVADO de la OT (ignora el override manual). Primera coincidencia gana.
 */
export function deriveEngagementState(
  engagement: EngagementStateInput,
  workOrder?: WorkOrderStateInput | null,
): EngagementState {
  // Administrativo: sin OT ni flujo Socio/Riesgos → Aprobado directo.
  if (!engagement.work_order_required) return EngagementState.Aprobado;

  if (!workOrder) return EngagementState.Pendiente;

  const { approval_status, approved_at, risk_status } = workOrder;

  // Rechazo desde cualquier pista.
  if (approval_status === "Rejected" || risk_status === "Rejected") {
    return EngagementState.Rechazado;
  }

  // Aprobación total (ambas pistas). approval_status='Approved' implica Socio + Riesgos.
  if (approval_status === "Approved") {
    return risk_status === "Emergency_Approved"
      ? EngagementState.AprobadoEmergencia
      : EngagementState.Aprobado;
  }

  // Solo el Socio aprobó (Riesgos aún pendiente).
  if (approved_at != null) return EngagementState.AprobadoSocio;

  // Solo Riesgos aprobó (Socio aún pendiente) — normal o emergencia.
  if (risk_status === "Approved" || risk_status === "Emergency_Approved") {
    return EngagementState.AprobadoRiesgos;
  }

  return EngagementState.Pendiente;
}

/**
 * Estado EFECTIVO: el override manual (si es válido) tiene prioridad sobre el derivado.
 */
export function effectiveEngagementState(
  engagement: EngagementStateInput,
  workOrder?: WorkOrderStateInput | null,
): EngagementState {
  if (isValidState(engagement.engagement_state_override)) {
    return engagement.engagement_state_override;
  }
  return deriveEngagementState(engagement, workOrder);
}

/**
 * Política 13: solo se pueden cargar horas/solicitudes cuando el encargo está
 * Aprobado (4) o Aprobado de emergencia (5).
 */
export function canLogHours(state: EngagementState): boolean {
  return state === EngagementState.Aprobado || state === EngagementState.AprobadoEmergencia;
}

/** Clave i18n de la etiqueta del estado (ej. "engagementState.4"). */
export function engagementStateI18nKey(state: EngagementState): string {
  return `engagementState.${state}`;
}

/** Clases Tailwind del badge por estado (tokens del design system del repo). */
export function engagementStateBadgeClass(state: EngagementState): string {
  switch (state) {
    case EngagementState.Aprobado:
    case EngagementState.AprobadoEmergencia:
      return "bg-success/10 text-success border-success/20";
    case EngagementState.Pendiente:
    case EngagementState.AprobadoSocio:
    case EngagementState.AprobadoRiesgos:
      return "bg-warning/10 text-warning border-warning/20";
    case EngagementState.Rechazado:
      return "bg-destructive/10 text-destructive border-destructive/20";
    case EngagementState.Congelado:
      return "bg-info/10 text-info border-info/20";
    case EngagementState.Cancelado:
    case EngagementState.Finalizado:
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
