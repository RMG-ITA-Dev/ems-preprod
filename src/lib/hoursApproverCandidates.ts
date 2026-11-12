// 1110-220 (plan_v5 §6.1/§6.2) — "Aprobador de horas" de un encargo no-Cliente (funcion 0/2/3).
//
// En un no-Cliente el campo `manager_id` deja de ser "Gerente" y pasa a ser el Aprobador de horas. Se elige en
// dos pasos (Rol → Persona) entre una lista cerrada de 14 roles, igual para admin, Gerente de TH y Analista
// de TH. La lista solo se usa al ELEGIR: después, toda la autoridad (aprobar horas y solicitudes de fondos)
// sale de `manager_id`, sin volver a mirar el rol.
//
// La autoridad es la base: el guard de `enforce_engagement_profile_scope` y `get_hours_approver_candidates()`.
// Este módulo es su espejo puro y testeable. Si se toca uno, tocar el otro.

/** Los 14 `role_key` que pueden ser Aprobador de horas, en el orden en que los ofrece el selector de Rol. */
export const HOURS_APPROVER_ROLE_KEYS = [
  "senior_partner",
  "partner",
  "director",
  "manager",
  "senior",
  "ita_manager",
  "ita_senior",
  "tax_manager",
  "tax_senior",
  "hr_manager",
  "hr_analyst",
  "accounting_manager",
  "risk_supervisor",
  "secretariat_head",
] as const;

export type HoursApproverRoleKey = (typeof HOURS_APPROVER_ROLE_KEYS)[number];

export function isHoursApproverRoleKey(roleKey: string | null | undefined): roleKey is HoursApproverRoleKey {
  return !!roleKey && (HOURS_APPROVER_ROLE_KEYS as readonly string[]).includes(roleKey);
}

/** Fila de `get_hours_approver_candidates()`. */
export interface HoursApproverCandidate {
  staff_id: string;
  display_name: string;
  role_key: string;
  society_id: string | null;
}

/**
 * Candidatos utilizables para un encargo de la sociedad `societyId`: solo personas de esa sociedad (operador
 * 2026-11-12; mismo criterio que el guard). Sin sociedad elegida todavía no se ofrece a nadie: primero se elige el
 * cliente interno (admin) o la sociedad sale de la ficha del creador (TH).
 * Descarta filas con un rol fuera de la lista (defensa ante un RPC desalineado).
 */
export function eligibleHoursApprovers(
  rows: readonly HoursApproverCandidate[],
  societyId: string | null | undefined,
): HoursApproverCandidate[] {
  if (!societyId) return [];
  return rows.filter((r) => isHoursApproverRoleKey(r.role_key) && r.society_id === societyId);
}

/** Roles con al menos un candidato, en el orden de `HOURS_APPROVER_ROLE_KEYS`. */
export function hoursApproverRolesWithCandidates(rows: readonly HoursApproverCandidate[]): HoursApproverRoleKey[] {
  const present = new Set(rows.map((r) => r.role_key));
  return HOURS_APPROVER_ROLE_KEYS.filter((k) => present.has(k));
}

/** Personas de un rol, en el orden del RPC (apellido, nombre). Sin rol elegido no se ofrece a nadie. */
export function hoursApproversOfRole(
  rows: readonly HoursApproverCandidate[],
  roleKey: string | null | undefined,
): HoursApproverCandidate[] {
  if (!roleKey) return [];
  return rows.filter((r) => r.role_key === roleKey);
}

/** Rol de la persona guardada, para hidratar el selector de Rol al editar. null si ya no es candidata. */
export function roleOfHoursApprover(
  rows: readonly HoursApproverCandidate[],
  staffId: string | null | undefined,
): string | null {
  if (!staffId) return null;
  return rows.find((r) => r.staff_id === staffId)?.role_key ?? null;
}
