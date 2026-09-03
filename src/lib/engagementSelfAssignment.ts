// BUG 0810-172 — asignación automática y bloqueo del Socio/Director o Gerente al CREAR un encargo.
//
// El packet habla de la "categoría" del usuario, pero el discriminador que se usa acá es
// `user_roles.role_key` (decisión del operador, 2026-08-17). Las tres variantes de "categoría"
// quedaron descartadas por evidencia:
//
//   · `categories.default_app_role` — es el enum LEGACY `app_role` (el mismo que 0722-162 rechazó
//     por colapsar siete role_key en `manager`) y quedó NULLABLE tras FASE 3c: CategoryForm ya no
//     lo edita, así que toda categoría creada desde entonces guarda null.
//   · `categories.category_name`   — es TEXTO LIBRE editable por el usuario (sin enum ni check
//     constraint; `create_category_for_practice(p_category_name text, …)`), está sembrado en inglés
//     ('Partner'/'Manager', 20251204045534) Y en español ('Socio'/'Gerente', 20260130231039), y se
//     duplica por servicio. Renombrar una categoría cambiaría en silencio a quién se le fuerza la
//     asignación: inaceptable para un guard de base de datos.
//   · `categories.display_order`   — ya no expresa jerarquía; es exactamente la trampa que causó
//     0722-162.
//
// `role_key` es el único vocabulario CONTROLADO (FK a `authorization_roles`, 23 filas seedeadas) y
// ya es la autoridad del `isAdmin` del formulario.
//
// Este mapa es ESPEJO del CASE de `enforce_engagement_creator_team()`
// (supabase/migrations/20251204000002_cero_02_functions_tables_views.sql tras la migración cero). Si se toca uno,
// tocar el otro: el test de coherencia estructural de engagementSelfAssignment.test.ts lo verifica
// además contra `ROLE_KEY_TO_GROUPS` de engagementTeamCandidates.ts, así que un rol que se autoasigne
// a un campo para el que no es candidato elegible rompe la suite.
//
// CONSECUENCIA DECLARADA (plan_v2 §Open Questions #1): `engagement.create` lo tienen hoy solo
// `admin`, `manager`, `ita_manager` y `tax_manager` (20260724010000_authz_fase2_seed.sql). Por eso
// la rama Gerente funciona de punta a punta y la rama Socio/Director queda implementada y correcta
// pero SIN camino de UI hasta que la matriz de permisos otorgue `engagement.create` a
// partner/director — cambiar la matriz está fuera del alcance de este fix.

import type { TeamCandidateOption } from "@/lib/engagementTeamCandidates";

/** El campo del bloque Equipo que se autoasigna al creador, o null si no aplica. */
export type SelfAssignedField = "partner_id" | "manager_id" | null;

/** `role_key` que se autoasignan al campo Socio/Director. Subconjunto del grupo partner_director. */
export const SELF_ASSIGN_PARTNER_ROLE_KEYS = ["partner", "director"] as const;

/**
 * `role_key` que se autoasignan al campo Gerente/Supervisor. El rol base, más `hr_manager`
 * (0817-180, decisión del operador 2026-08-27: "no hagamos casos especiales" — Talento Humano
 * crea su encargo y queda autoasignado como manager_id igual que cualquier otro Gerente, así
 * que puede aparecer como aprobador de las horas que se le carguen) y, desde 0828-185,
 * `ita_manager`/`tax_manager` — ya tienen `engagement.create` y ya eran candidatos de
 * Especialista; ahora también se autoasignan como manager_id igual que Gerente, en línea con
 * que 0828-185 los suma al grupo de candidatura 'manager' (doble grupo).
 */
export const SELF_ASSIGN_MANAGER_ROLE_KEYS = ["manager", "hr_manager", "ita_manager", "tax_manager"] as const;

export interface SelfAssignmentInput {
  /** En edición no se autoasigna ni se bloquea: el packet pide la regla solo en creación. */
  isEdit: boolean;
  /** `roleKey === "admin"`. El admin conserva control total sobre ambos campos. */
  isAdmin: boolean;
  /** `roleLoading || currentStaffLoading`: todavía no se sabe qué rol tiene el usuario. */
  classificationPending: boolean;
  roleKey: string | null;
  /** Sin staff vinculado no hay `staff_id` que asignar. */
  hasStaffRecord: boolean;
}

/**
 * ¿Qué campo del Equipo se autoasigna al usuario que está creando el encargo?
 *
 * Fail-closed: ante cualquier duda devuelve null (sin autoasignación y sin bloqueo). Nunca
 * devuelve un campo cuando falta el dato para llenarlo — un campo obligatorio bloqueado y vacío
 * dejaría el formulario sin salida.
 */
export function resolveSelfAssignedTeamField({
  isEdit,
  isAdmin,
  classificationPending,
  roleKey,
  hasStaffRecord,
}: SelfAssignmentInput): SelfAssignedField {
  if (isEdit) return null;
  // Mientras no se sepa el rol no se afirma nada. El formulario deshabilita los dos campos en esta
  // ventana (ver `teamLockPending` en EngagementForm) para no ofrecer una selección que después se
  // sobrescribiría.
  if (classificationPending) return null;
  if (isAdmin) return null;
  if (!hasStaffRecord) return null;
  if (!roleKey) return null;

  if ((SELF_ASSIGN_PARTNER_ROLE_KEYS as readonly string[]).includes(roleKey)) return "partner_id";
  if ((SELF_ASSIGN_MANAGER_ROLE_KEYS as readonly string[]).includes(roleKey)) return "manager_id";
  return null;
}

/**
 * Opción de combobox para el propio creador.
 *
 * Se construye desde `useCurrentStaff` y no desde el RPC de candidatos porque el creador puede no
 * figurar en la lista YA FILTRADA POR SERVICIO (los no-admin reciben `practica` = Auditoría
 * forzada, y su `staff.practica_id` puede ser otro). `serviceId: null` es deliberado: esta opción se
 * inyecta DESPUÉS del filtro por servicio, igual que el histórico de `withSavedStaff`.
 */
export function selfCandidateOption(
  staff: { staff_id: string; first_name: string; last_name: string } | null | undefined
): TeamCandidateOption | null {
  if (!staff?.staff_id) return null;
  return {
    value: staff.staff_id,
    label: `${staff.first_name} ${staff.last_name}`,
    serviceId: null,
  };
}
