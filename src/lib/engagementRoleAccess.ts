// 1110-220 — reglas por role_key del alta y la edición de encargos, sin React ni Supabase.
//
// La autoridad real es la base de datos (trigger `enforce_engagement_profile_scope` y las
// políticas UPDATE de `engagements`); esto solo decide qué ofrece la pantalla, para que el
// formulario no muestre editable lo que la RLS va a rechazar al guardar.

import type { ScopeKey } from "@/hooks/useAuthorization";

/**
 * `role_key` que solo crean encargos no-Cliente (funcion 0/2/3): EngagementNew les fuerza el modo
 * administrativo. Espejo del trigger `enforce_engagement_profile_scope` (hr_analyst desde
 * 2026-10-27; hr_manager desde 1110-220 plan_v3, N9). Contabilidad, Riesgos y Secretaría ya no crean
 * encargos.
 * Si se toca uno, tocar el otro.
 */
export const ADMINISTRATIVE_ONLY_CREATOR_ROLE_KEYS = ["hr_analyst", "hr_manager"] as const;

export function isAdministrativeOnlyCreator(roleKey: string | null | undefined): boolean {
  return !!roleKey && (ADMINISTRATIVE_ONLY_CREATOR_ROLE_KEYS as readonly string[]).includes(roleKey);
}

/**
 * 1110-220 plan_v3 (N1): `role_key` que crean encargos no-Cliente y sus OTs: Sistemas y Talento
 * Humano. Nadie más, aunque tenga `engagement.create` (Gerente normal, ITA/Tax). Espejo del trigger
 * `enforce_engagement_profile_scope`. Si se toca uno, tocar el otro.
 */
export const ADMINISTRATIVE_CREATOR_ROLE_KEYS = ["admin", "hr_manager", "hr_analyst"] as const;

export function isAdministrativeCreator(roleKey: string | null | undefined): boolean {
  return !!roleKey && (ADMINISTRATIVE_CREATOR_ROLE_KEYS as readonly string[]).includes(roleKey);
}

/** Función del encargo no-Cliente (0/2/3). NULL se lee como Cliente en todo el sistema. */
export function isNonClientFuncion(funcion: number | null | undefined): boolean {
  return funcion != null && funcion !== 1;
}

export interface AdministrativeWorkInput {
  roleKey: string | null | undefined;
  /** staff_id del usuario actual; null mientras carga o si no tiene ficha. */
  myStaffId: string | null | undefined;
  engagement: { funcion: number | null; partner_id: string | null; created_by_staff_id?: string | null };
}

/**
 * 1110-220 plan_v3 (N5): ¿la base dejaría escribir el encargo, sus OTs, su matriz, su presupuesto y
 * su equipo? Espejo de `can_write_administrative_work()` (cero_02), que las políticas RESTRICTIVE
 * suman con AND a las de siempre. En un encargo no-Cliente solo escriben admin, el Talento Humano que lo
 * creó (plan_v5, N10) y el Socio del encargo; el Aprobador de horas (manager_id) solo aprueba y mira,
 * aunque sea de TH. Cliente: sin restricción.
 * No concede nada por sí sola: se combina con la regla propia de cada pantalla.
 */
export function canWriteAdministrativeWork({ roleKey, myStaffId, engagement }: AdministrativeWorkInput): boolean {
  if (!isNonClientFuncion(engagement.funcion)) return true;
  // N19: Control de Calidad lo escribe solo admin (y el Socio firma su OT); Talento Humano no.
  if (engagement.funcion === 3) return roleKey === "admin" || (!!myStaffId && engagement.partner_id === myStaffId);
  if (roleKey === "admin") return true;
  if (!myStaffId) return false;
  if (isAdministrativeOnlyCreator(roleKey) && engagement.created_by_staff_id === myStaffId) return true;
  return engagement.partner_id === myStaffId;
}

/**
 * `role_key` a los que se oculta el menú "Encargos" (/engagements, que lista solo encargos de Cliente):
 * no ven encargos de Cliente en el portafolio y todo lo suyo vive en "Encargos Administrativos".
 * El Supervisor de Riesgos NO está: consulta todos los encargos de Cliente (bucket firm de
 * list_portfolio_engagements), solo que no los crea desde ahí (ver `isAdministrativeOnlyCreator`).
 */
export const HIDDEN_CLIENT_ENGAGEMENTS_MENU_ROLE_KEYS = [
  "hr_analyst",
  "hr_manager", // 1110-220 plan_v3 (N9): Talento Humano solo gestiona encargos administrativos.
  "accounting_manager",
  "secretariat_head",
] as const;

export function showsClientEngagementsMenu(roleKey: string | null | undefined): boolean {
  return !roleKey || !(HIDDEN_CLIENT_ENGAGEMENTS_MENU_ROLE_KEYS as readonly string[]).includes(roleKey);
}

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
 * ¿La base de datos dejaría guardar cambios sobre este encargo? Espejo de las dos políticas
 * UPDATE de `engagements`, ambas con `engagement.update`:
 *   - "engagements write update": alcance `firm`, o ser Gerente/Socio (`is_engagement_team_member`,
 *     que solo mira manager_id/partner_id — Encargado, SQR y especialistas NO editan);
 *   - "engagements creator update": haber creado el encargo.
 * 1110-220 plan_v3 (N10): "engagements hr administrative update" se retiró — Talento Humano ve todos
 * los administrativos pero cada uno edita solo lo que creó o gerencia.
 * Y, con AND, la RESTRICTIVE "administrative write update" (1110-220 plan_v3): en no-Cliente solo
 * admin, Talento Humano y el Socio (`canWriteAdministrativeWork`).
 * Sin staff resuelto no se puede comprobar nada por asignación: solo lectura (fail-closed).
 */
export function canEditEngagement({ can, scope, roleKey, myStaffId, engagement }: EngagementEditAccessInput): boolean {
  if (!can("engagement.update")) return false;
  // 1110-220 plan_v3 (N19): el encargo de Control de Calidad lo edita solo admin.
  if (engagement.funcion === 3 && roleKey !== "admin") return false;
  // 1110-220 plan_v3 (N5): RESTRICTIVE "administrative write update" de engagements.
  if (!canWriteAdministrativeWork({ roleKey, myStaffId, engagement })) return false;
  if (scope("engagement.update") === "firm") return true;
  if (!myStaffId) return false;
  return (
    engagement.created_by_staff_id === myStaffId ||
    engagement.manager_id === myStaffId ||
    engagement.partner_id === myStaffId
  );
}

export interface WorkOrderCreateInput {
  roleKey: string | null | undefined;
  myStaffId: string | null | undefined;
  engagement: { funcion: number | null; manager_id: string | null; created_by_staff_id?: string | null };
}

/**
 * ¿Puede crear la OT de este encargo? Espejo de las políticas INSERT de `work_orders`:
 * `wo_create_by_permission` (Gerente del encargo), "wo hr analyst administrative insert" (Analista
 * de TH creador de un no-Cliente) y la RESTRICTIVE "administrative write insert" (1110-220 plan_v3).
 * Cliente: admin o el Gerente. No-Cliente: admin o el Talento Humano (Gerente o Analista) que lo creó
 * (plan_v5); el Aprobador de horas no crea, aunque sea de TH. El permiso `work_order.create` lo gatea la ruta.
 */
export function canCreateWorkOrderFor({ roleKey, myStaffId, engagement }: WorkOrderCreateInput): boolean {
  if (roleKey === "admin") return true;
  if (!myStaffId) return false;
  if (!isNonClientFuncion(engagement.funcion)) return engagement.manager_id === myStaffId;
  if (engagement.funcion === 3) return false; // N19: la OT de Control de Calidad la crea solo admin.
  if (isAdministrativeOnlyCreator(roleKey)) return engagement.created_by_staff_id === myStaffId;
  return false;
}
