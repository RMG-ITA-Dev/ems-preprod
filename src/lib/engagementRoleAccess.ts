// 1110-220 — reglas por role_key del alta y la edición de encargos, sin React ni Supabase.
//
// La autoridad real es la base de datos (trigger `enforce_engagement_profile_scope` y las
// políticas UPDATE de `engagements`); esto solo decide qué ofrece la pantalla, para que el
// formulario no muestre editable lo que la RLS va a rechazar al guardar.

import type { ScopeKey } from "@/hooks/useAuthorization";

/**
 * `role_key` que solo crean encargos no-Cliente (funcion 0/2/3): EngagementNew les fuerza el modo
 * administrativo. Espejo del trigger `enforce_engagement_profile_scope` (hr_analyst desde
 * 2026-10-27; Gerente de Contabilidad, Supervisor de Riesgos y Jefe de Secretaría desde 1110-220).
 * Si se toca uno, tocar el otro.
 */
export const ADMINISTRATIVE_ONLY_CREATOR_ROLE_KEYS = [
  "hr_analyst",
  "accounting_manager",
  "risk_supervisor",
  "secretariat_head",
] as const;

export function isAdministrativeOnlyCreator(roleKey: string | null | undefined): boolean {
  return !!roleKey && (ADMINISTRATIVE_ONLY_CREATOR_ROLE_KEYS as readonly string[]).includes(roleKey);
}

/**
 * `role_key` que editan TODOS los encargos no-Cliente de la firma. Espejo de la política
 * "engagements hr administrative update" (B3c-3 + 1110-220).
 */
export const ADMINISTRATIVE_EDITOR_ROLE_KEYS = ["hr_manager", "hr_analyst", "secretariat_head"] as const;

export interface EngagementEditTarget {
  manager_id: string | null;
  partner_id: string | null;
  funcion: number | null;
  created_by_staff_id?: string | null;
}

export interface EngagementEditAccessInput {
  can: (permissionKey: string) => boolean;
  scope: (permissionKey: string) => ScopeKey | null;
  roleKey: string | null | undefined;
  /** staff_id del usuario actual; null mientras carga o si no tiene ficha. */
  myStaffId: string | null | undefined;
  engagement: EngagementEditTarget;
}

/**
 * ¿La base de datos dejaría guardar cambios sobre este encargo? Espejo de las tres políticas
 * UPDATE de `engagements`, todas con `engagement.update`:
 *   - "engagements write update": alcance `firm`, o ser Gerente/Socio (`is_engagement_team_member`,
 *     que solo mira manager_id/partner_id — Encargado, SQR y especialistas NO editan);
 *   - "engagements creator update": haber creado el encargo;
 *   - "engagements hr administrative update": rol de ADMINISTRATIVE_EDITOR_ROLE_KEYS y encargo
 *     no-Cliente (funcion <> 1; NULL se lee como Cliente).
 * Sin staff resuelto no se puede comprobar nada por asignación: solo lectura (fail-closed).
 */
export function canEditEngagement({ can, scope, roleKey, myStaffId, engagement }: EngagementEditAccessInput): boolean {
  if (!can("engagement.update")) return false;
  if (scope("engagement.update") === "firm") return true;
  if (
    roleKey &&
    (ADMINISTRATIVE_EDITOR_ROLE_KEYS as readonly string[]).includes(roleKey) &&
    engagement.funcion != null &&
    engagement.funcion !== 1
  ) {
    return true;
  }
  if (!myStaffId) return false;
  return (
    engagement.created_by_staff_id === myStaffId ||
    engagement.manager_id === myStaffId ||
    engagement.partner_id === myStaffId
  );
}
