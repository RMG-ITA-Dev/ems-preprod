/**
 * 1028-213 — Lógica pura de la pista de Riesgos de la Orden de Trabajo.
 *
 * Es el ÚNICO sitio donde viven las derivaciones del estado de Riesgos (invariante de
 * decisiones.md §7): la tarjeta compartida (`WorkOrderRiskSection`), `WorkOrderForm` y la lista
 * `/risks` las importan de acá en vez de recalcularlas. Antes estaban en línea dentro de
 * `WorkOrderForm.tsx`.
 *
 * Los DTO son `type` (no `interface`) a propósito: `DataTable<T extends Record<string, unknown>>`
 * solo acepta alias de tipo, que son compatibles con la firma de índice.
 */

export const RISK_LEVELS = ["Bajo", "Moderado", "Alto"] as const;

/** `engagement_state_override` = 7: encargo finalizado (D-12). */
export const ENGAGEMENT_STATE_FINALIZED = 7;
/** `engagement_state_override` = 6: encargo cancelado (H-5, excluido de `/risks` en el servidor). */
export const ENGAGEMENT_STATE_CANCELLED = 6;

// ── DTOs de las funciones del servidor (Plan v2 §3) ─────────────────────────────────────────

/** Fila de `list_risk_work_orders()`: solo campos de Riesgos, sin montos ni horas (D-08, D-18). */
export type RiskWorkOrderRow = {
  wo_id: string;
  engagement_id: string;
  engagement_code: string | null;
  engagement_name: string | null;
  client_name: string | null;
  san_approval_id: string | null;
  san_completed_at: string | null;
  ceac_number: string | null;
  ceac_completed_at: string | null;
  risk_level: string | null;
  risk_status: string | null;
  emergency_review_at: string | null;
  emergency_partner_at: string | null;
  emergency_deadline_at: string | null;
  has_emergency_justification: boolean;
  engagement_state_override: number | null;
};

/** Resultado de `get_risk_work_order(p_wo_id)`: la fila de la lista más el detalle de D-14. */
export type RiskWorkOrderDetail = RiskWorkOrderRow & {
  approval_status: string | null;
  approved_at: string | null;
  risk_notes: string | null;
  emergency_justification: string | null;
  risk_approved_at: string | null;
  risk_approved_by: string | null;
  emergency_review_by: string | null;
  emergency_partner_by: string | null;
};

// ── Derivaciones de la pista (antes inline en WorkOrderForm.tsx) ────────────────────────────

export type RiskFieldsInput = {
  ceacCompletedAt?: string | null;
  ceacNumber?: string | null;
  sanCompletedAt?: string | null;
  sanApprovalId?: string | null;
  riskLevel?: string | null;
};

export type RiskTrackInput = RiskFieldsInput & {
  riskStatus?: string | null;
  emergencyReviewAt?: string | null;
  emergencyPartnerAt?: string | null;
};

/** El formato de SAN/CEAC es libre (D-01): basta con que no estén vacíos. */
export function isRiskCodeFilled(value: string | null | undefined): boolean {
  return (value ?? "").trim().length > 0;
}

/** Los 5 campos completos: camino normal de envío/aprobación. */
export function isRiskApprovalReady(f: RiskFieldsInput): boolean {
  return (
    !!f.ceacCompletedAt &&
    isRiskCodeFilled(f.ceacNumber) &&
    !!f.sanCompletedAt &&
    isRiskCodeFilled(f.sanApprovalId) &&
    RISK_LEVELS.includes(f.riskLevel as (typeof RISK_LEVELS)[number])
  );
}

/** Los 5 campos vacíos: camino de emergencia (D-03). */
export function isRiskAllEmpty(f: RiskFieldsInput): boolean {
  return (
    !f.ceacCompletedAt &&
    !f.ceacNumber &&
    !f.sanCompletedAt &&
    !f.sanApprovalId &&
    !f.riskLevel
  );
}

/**
 * Todo-o-nada (D-03): el envío pasa con los 5 llenos o con los 5 vacíos; el parcial se bloquea.
 */
export function isRiskSubmitAllowed(f: RiskFieldsInput, isAdministrative = false): boolean {
  return isAdministrative || isRiskApprovalReady(f) || isRiskAllEmpty(f);
}

/**
 * La pista pasa (o pasó) por emergencia: firmas pendientes, ya aprobada en emergencia, o
 * Pendiente con los 5 campos vacíos (recién enviada). Una vez `Approved` (normalización
 * posterior) la emergencia quedó resuelta.
 */
export function isEmergencyTrack(t: RiskTrackInput): boolean {
  const isEmergencyApproved = t.riskStatus === "Emergency_Approved";
  return (
    (isEmergencyApproved ||
      !!t.emergencyReviewAt ||
      !!t.emergencyPartnerAt ||
      (t.riskStatus === "Pending" && isRiskAllEmpty(t))) &&
    t.riskStatus !== "Approved"
  );
}

/**
 * Aprobación normal de Riesgos (un solo visto bueno): con los datos completos y SOLO una vez
 * enviados a revisión (nunca mientras siga `Emergency_Approved`, o sea, mientras el gerente
 * completa los datos).
 */
export function showNormalRiskApprove(t: RiskTrackInput, hasHandler = true): boolean {
  return isRiskApprovalReady(t) && t.riskStatus !== "Emergency_Approved" && hasHandler;
}

/** Emergencia, paso 1: revisión de Riesgos. */
export function showEmergencyReview(t: RiskTrackInput, hasHandler = true): boolean {
  return (
    isRiskAllEmpty(t) &&
    t.riskStatus !== "Emergency_Approved" &&
    !t.emergencyReviewAt &&
    hasHandler
  );
}

/** Emergencia, paso 2: firma del Socio de Riesgos (tras el paso 1, "la primera gana"). */
export function showEmergencyPartner(t: RiskTrackInput, hasHandler = true): boolean {
  return (
    isRiskAllEmpty(t) &&
    t.riskStatus !== "Emergency_Approved" &&
    !!t.emergencyReviewAt &&
    !t.emergencyPartnerAt &&
    hasHandler
  );
}

// ── Grupos y filtro de la lista /risks (D-10…D-12, D-39, D-46) ──────────────────────────────

export type RiskListGroup = "emergency" | "pending" | "rejected" | "approved" | "finalized";

/** Opciones del filtro de estado: los grupos más "Todas" (D-39). */
export type RiskListFilter = RiskListGroup | "all";

export const RISK_LIST_FILTERS: readonly RiskListFilter[] = [
  "emergency",
  "pending",
  "rejected",
  "approved",
  "finalized",
  "all",
];

export function riskRowToTrack(row: RiskWorkOrderRow): RiskTrackInput {
  return {
    riskStatus: row.risk_status,
    ceacCompletedAt: row.ceac_completed_at,
    ceacNumber: row.ceac_number,
    sanCompletedAt: row.san_completed_at,
    sanApprovalId: row.san_approval_id,
    riskLevel: row.risk_level,
    emergencyReviewAt: row.emergency_review_at,
    emergencyPartnerAt: row.emergency_partner_at,
  };
}

/**
 * A qué grupos de la lista pertenece una OT. Los grupos se solapan a propósito:
 * - Encargo finalizado (override 7) prevalece: solo `finalized` (D-12, AC-12).
 * - `emergency` ⇔ pista de emergencia, incluida `Emergency_Approved` con la fecha corriendo
 *   (D-11, D-46).
 * - `pending` ⇔ `risk_status = 'Pending'`, lo que incluye emergencias con pasos pendientes (D-10).
 * - `Emergency_Approved` NO entra en `approved` (D-46).
 */
export function riskListGroups(row: RiskWorkOrderRow): Set<RiskListGroup> {
  const groups = new Set<RiskListGroup>();
  if (row.engagement_state_override === ENGAGEMENT_STATE_FINALIZED) {
    groups.add("finalized");
    return groups;
  }
  if (isEmergencyTrack(riskRowToTrack(row))) groups.add("emergency");
  if (row.risk_status === "Pending") groups.add("pending");
  if (row.risk_status === "Rejected") groups.add("rejected");
  if (row.risk_status === "Approved") groups.add("approved");
  return groups;
}

/** Filtro activo al abrir `/risks`: Emergencia si existe alguna OT de emergencia; si no, Pendiente. */
export function defaultRiskFilter(rows: readonly RiskWorkOrderRow[]): "emergency" | "pending" {
  return rows.some((r) => riskListGroups(r).has("emergency")) ? "emergency" : "pending";
}

/** Aplica el filtro de estado; "Todas" devuelve todo. El orden del servidor se conserva. */
export function filterRiskRows(
  rows: readonly RiskWorkOrderRow[],
  filter: RiskListFilter,
): RiskWorkOrderRow[] {
  if (filter === "all") return [...rows];
  return rows.filter((r) => riskListGroups(r).has(filter));
}
