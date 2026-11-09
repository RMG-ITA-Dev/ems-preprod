/**
 * FEAT 1105-219 — Estado "de lista" de una Orden de Trabajo para el filtro de /work-orders.
 *
 * `approval_status` agrupa en `Pending_Approval` tres situaciones distintas (falta el Socio,
 * faltan Riesgos o faltan ambos) y no sabe nada del encargo. Este módulo proyecta la OT a un
 * estado de lista que sí las distingue y que además separa los encargos Finalizados (7) y
 * Cancelados (6). Es puro (sin React ni Supabase) para poder testearlo aislado.
 *
 * Ver bugs/1105-219/plan_v2.md.
 */
import { EngagementState } from "@/lib/engagementStatus";

export type WorkOrderListStatus =
  | "draft"
  | "pending_partner"
  | "pending_risk"
  | "pending_both"
  | "approved"
  | "rejected"
  | "cancelled"
  | "finalized";

/**
 * Valores del filtro:
 * - `not_finalized`: valor por defecto; todo menos los encargos Finalizados.
 * - `all`: todas.
 * - `Pending_Approval`: alias de compatibilidad para el enlace del tablero de Socio
 *   (`/work-orders?status=Pending_Approval`). Filtra por `approval_status` crudo, igual que
 *   el KPI `pending_wo_count`, para que número y lista coincidan.
 * - Un estado de lista concreto.
 */
export type WorkOrderStatusFilter = "not_finalized" | "all" | "Pending_Approval" | WorkOrderListStatus;

export const DEFAULT_WO_STATUS_FILTER: WorkOrderStatusFilter = "not_finalized";

/** Opciones visibles del selector, en orden de presentación. */
export const STATUS_FILTER_OPTIONS: readonly Exclude<WorkOrderStatusFilter, "Pending_Approval">[] = [
  "not_finalized",
  "all",
  "draft",
  "pending_partner",
  "pending_risk",
  "pending_both",
  "approved",
  "rejected",
  "cancelled",
  "finalized",
];

/** Clave i18n de cada opción del selector (bajo `workOrders.listStatus`). */
export const STATUS_FILTER_I18N_KEY: Record<Exclude<WorkOrderStatusFilter, "Pending_Approval">, string> = {
  not_finalized: "workOrders.listStatus.notFinalized",
  all: "workOrders.listStatus.all",
  draft: "workOrders.listStatus.draft",
  pending_partner: "workOrders.listStatus.pendingPartner",
  pending_risk: "workOrders.listStatus.pendingRisk",
  pending_both: "workOrders.listStatus.pendingBoth",
  approved: "workOrders.listStatus.approved",
  rejected: "workOrders.listStatus.rejected",
  cancelled: "workOrders.listStatus.cancelled",
  finalized: "workOrders.listStatus.finalized",
};

/** Campos mínimos de la OT (y de su encargo) que necesita la clasificación. */
export interface WorkOrderListStatusInput {
  approval_status?: string | null;
  approved_at?: string | null;
  risk_status?: string | null;
  engagement?: {
    engagement_state_override?: number | null;
    funcion?: number | null;
  } | null;
}

const RISK_APPROVED = new Set(["Approved", "Emergency_Approved"]);

/**
 * Encargo administrativo: misma regla que WorkOrderEdit.tsx (`funcion != null && funcion !== 1`).
 * Sus OTs no pasan por Riesgos: el trigger les fuerza `risk_status = 'Pending'` como pista no
 * aplicable (migración 0722_160), así que ese Pending no significa "falta Riesgos".
 */
function isAdministrative(wo: WorkOrderListStatusInput): boolean {
  const funcion = wo.engagement?.funcion;
  return funcion != null && funcion !== 1;
}

/** Estado de lista de una OT. Gana la primera regla que se cumple. */
export function classifyWorkOrderListStatus(wo: WorkOrderListStatusInput): WorkOrderListStatus {
  const override = wo.engagement?.engagement_state_override;
  if (override === EngagementState.Finalizado) return "finalized";
  if (override === EngagementState.Cancelado) return "cancelled";

  const { approval_status, approved_at, risk_status } = wo;

  if (approval_status == null || approval_status === "Draft") return "draft";

  // Rechazo desde cualquier pista, igual que deriveEngagementState.
  if (approval_status === "Rejected" || risk_status === "Rejected") return "rejected";

  // Aprobado manda: cubre administrativas cerradas y la compleción de emergencia
  // (Approved con Riesgos de vuelta en Pending, por diseño).
  if (approval_status === "Approved") return "approved";

  if (isAdministrative(wo)) return "pending_partner";

  const partnerDone = approved_at != null;
  const riskDone = risk_status != null && RISK_APPROVED.has(risk_status);

  if (partnerDone && !riskDone) return "pending_risk";
  if (!partnerDone && riskDone) return "pending_partner";
  if (!partnerDone && !riskDone) return "pending_both";
  // Ambas pistas firmadas pero el cierre aún no se reflejó: transitorio.
  return "approved";
}

export function matchesWorkOrderStatusFilter(
  wo: WorkOrderListStatusInput,
  filter: WorkOrderStatusFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "not_finalized":
      return classifyWorkOrderListStatus(wo) !== "finalized";
    case "Pending_Approval":
      return wo.approval_status === "Pending_Approval";
    default:
      return classifyWorkOrderListStatus(wo) === filter;
  }
}

// Map (no objeto literal) para que "toString" y similares no matcheen por el prototipo.
const LEGACY_PARAMS = new Map<string, WorkOrderStatusFilter>([
  ["Pending_Approval", "Pending_Approval"],
  ["Draft", "draft"],
  ["Approved", "approved"],
  ["Rejected", "rejected"],
]);

const VALID_FILTERS: ReadonlySet<string> = new Set<string>(STATUS_FILTER_OPTIONS);

/** Valor inicial del filtro a partir de `?status=`. Desconocido o vacío → por defecto. */
export function normalizeStatusParam(param: string | null | undefined): WorkOrderStatusFilter {
  if (!param) return DEFAULT_WO_STATUS_FILTER;
  const legacy = LEGACY_PARAMS.get(param);
  if (legacy) return legacy;
  if (VALID_FILTERS.has(param)) return param as WorkOrderStatusFilter;
  return DEFAULT_WO_STATUS_FILTER;
}
