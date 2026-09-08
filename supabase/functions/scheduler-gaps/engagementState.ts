// Fase 3 — copia byte-sincronizada de src/lib/engagementStatus.ts
// (development, fuente de verdad de la máquina de 8 estados). Las Edge
// Functions (Deno, unidad de despliegue separada) no pueden importar de
// src/lib/, así que esta es una copia exacta de deriveEngagementState /
// effectiveEngagementState, más engagementStateBucket — un bucket de
// filtrado nuevo que NO existe en el original (necesario porque el
// statusFilter del cliente sigue siendo un enum de 5 valores, no el estado
// numérico 1-8 completo).
//
// BUG 0817-179: el estado 9 Congelado se retiró del sistema (junto con el bucket
// "frozen"); el CHECK de engagement_state_override acepta 1..8.
//
// NO modificar deriveEngagementState/effectiveEngagementState aquí sin
// aplicar el mismo cambio en src/lib/engagementStatus.ts Y en la copia
// gemela ../scheduler-gaps/engagementState.ts — ver
// src/test/edge-functions/engagementState.parity.test.ts.

export enum EngagementState {
  Pendiente = 1,
  AprobadoSocio = 2,
  AprobadoRiesgos = 3,
  Aprobado = 4,
  AprobadoEmergencia = 5,
  Cancelado = 6,
  Finalizado = 7,
  Rechazado = 8,
}

export interface EngagementStateInput {
  work_order_required: boolean;
  engagement_state_override?: number | null;
}

export interface WorkOrderStateInput {
  approval_status?: string | null;
  approved_at?: string | null;
  risk_status?: string | null;
}

function isValidState(
  value: number | null | undefined
): value is EngagementState {
  return value != null && value >= 1 && value <= 8;
}

/** Estado DERIVADO de la OT (ignora el override manual). Primera coincidencia gana. */
export function deriveEngagementState(
  engagement: EngagementStateInput,
  workOrder?: WorkOrderStateInput | null
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

/** Estado EFECTIVO: el override manual (si es válido) tiene prioridad sobre el derivado. */
export function effectiveEngagementState(
  engagement: EngagementStateInput,
  workOrder?: WorkOrderStateInput | null
): EngagementState {
  if (isValidState(engagement.engagement_state_override)) {
    return engagement.engagement_state_override;
  }
  return deriveEngagementState(engagement, workOrder);
}

/** Solo se pueden cargar horas/solicitudes cuando el encargo está Aprobado (4) o AprobadoEmergencia (5). */
export function canLogHours(state: EngagementState): boolean {
  return (
    state === EngagementState.Aprobado ||
    state === EngagementState.AprobadoEmergencia
  );
}

// Fase 3 (plan v2 §1) — bucket de filtrado/color server-side. Espejo del
// cliente engagementTaskType (src/lib/schedulerGantt.ts) sin el nombre de
// clase CSS — este bucket es lo que STATUS_FILTERS valida y filtra.
export type EngagementStateBucket =
  | "active"
  | "pending"
  | "completed"
  | "cancelled"
  | "unknown";

export function engagementStateBucket(
  state: EngagementState | null | undefined
): EngagementStateBucket {
  switch (state) {
    case EngagementState.Aprobado:
    case EngagementState.AprobadoEmergencia:
      return "active";
    case EngagementState.Pendiente:
    case EngagementState.AprobadoSocio:
    case EngagementState.AprobadoRiesgos:
      return "pending";
    case EngagementState.Finalizado:
      return "completed";
    case EngagementState.Cancelado:
    case EngagementState.Rechazado:
      return "cancelled";
    default:
      return "unknown";
  }
}
