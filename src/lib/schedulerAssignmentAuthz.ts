/**
 * Fase 5 write-authorization mirror for engagement assignments — el espejo cliente EXACTO de
 * `is_engagement_responsible(engagement_id)`
 * (`supabase/migrations/20260727100000_scheduler_fase2_rls_grants.sql`), la única regla de
 * autorización que la RPC `save_engagement_assignments` aplica:
 *
 *   is_admin() OR is_engagement_responsible(engagement_id)
 *
 * donde is_engagement_responsible() es:
 *
 *   get_my_staff_id() IN (manager_id, partner_id, sqr_id, encargado_id,
 *                         specialist_it_id, specialist_tax_id)
 *
 * Fase 5 — Decisión del operador (bugs/scheduler/fase_5/plan_v2.md, "Decisiones del operador" #2):
 * se ELIMINA el caso "senior con assignment propio" del mirror de `sruizmier-scheduler-v3`. La
 * RPC no lo autoriza — conservarlo mostraría botones de escritura que fallarían con `EAS_DENIED`.
 * El caso "Senior a Cargo" requeriría modificar la RPC (fuera del alcance que Fase 5 decide sola).
 *
 * Este es solo un mirror de conveniencia para la UI; RLS + la RPC (SECURITY DEFINER) siguen
 * siendo la autoridad real. Un cambio de responsabilidad entre el render y el guardado se
 * manifiesta como `EAS_DENIED`, manejado por el caller.
 */
export interface AssignmentWriteAuthzInput {
  isAdmin: boolean;
  myStaffId: string | null | undefined;
  /** [manager_id, partner_id, sqr_id, encargado_id, specialist_it_id, specialist_tax_id] del Engagement. */
  responsibleStaffIds: Array<string | null | undefined>;
}

export function canWriteEngagementAssignments(a: AssignmentWriteAuthzInput): boolean {
  if (a.isAdmin) return true;
  if (!a.myStaffId) return false;
  return a.responsibleStaffIds.includes(a.myStaffId);
}
