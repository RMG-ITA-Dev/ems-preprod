// 1110-220 (plan_v5 §4, §6.5, §6.6) — firma del Socio de un encargo no-Cliente y candado de edición, sin React ni
// Supabase. Espejo de engagement_partner_signed(), decide_/resubmit_engagement_partner_approval() y del trigger
// enforce_engagement_partner_approval (cero_02). La base decide; esto solo dice qué ofrece la pantalla.

import { isNonClientFuncion } from "@/lib/engagementRoleAccess";

export interface PartnerApprovalTarget {
  funcion: number | null;
  work_order_required: boolean;
  partner_id: string | null;
  created_by_staff_id?: string | null;
  partner_approval_status?: string | null;
  partner_approval_legacy_source?: string | null;
}

/** ¿El encargo pide la firma del Socio sobre el encargo mismo (no-Cliente sin OT)? Con OT, firma la OT. */
export function needsEngagementPartnerApproval(e: Pick<PartnerApprovalTarget, "funcion" | "work_order_required">): boolean {
  return isNonClientFuncion(e.funcion) && !e.work_order_required;
}

/**
 * ¿El Socio ya aprobó este no-Cliente? Con OT: la OT está aprobada (y Riesgos no la rechazó). Sin OT: la firma del
 * encargo. Cliente: nunca (no tiene candado).
 */
export function isPartnerSigned(
  e: Pick<PartnerApprovalTarget, "funcion" | "work_order_required" | "partner_approval_status">,
  workOrder?: { approval_status?: string | null; risk_status?: string | null } | null,
): boolean {
  if (!isNonClientFuncion(e.funcion)) return false;
  if (e.work_order_required) {
    return workOrder?.approval_status === "Approved" && workOrder?.risk_status !== "Rejected";
  }
  return e.partner_approval_status === "approved";
}

/** Acciones que la pantalla ofrece sobre la firma de un no-Cliente sin OT. */
export function partnerApprovalActions({
  engagement,
  myStaffId,
  roleKey,
}: {
  engagement: PartnerApprovalTarget;
  myStaffId: string | null | undefined;
  roleKey: string | null | undefined;
}): { canDecide: boolean; canResubmit: boolean } {
  if (!needsEngagementPartnerApproval(engagement)) return { canDecide: false, canResubmit: false };
  const status = engagement.partner_approval_status ?? "pending";
  const canDecide = status === "pending" && !!myStaffId && engagement.partner_id === myStaffId;
  const isThCreator =
    (roleKey === "hr_manager" || roleKey === "hr_analyst") &&
    !!myStaffId &&
    engagement.created_by_staff_id === myStaffId &&
    engagement.funcion !== 3;
  const canResubmit = status === "rejected" && (roleKey === "admin" || isThCreator);
  return { canDecide, canResubmit };
}
