// Fase 3 — predicados puros de navegación/acceso del Scheduler.
//
// Sin React ni Supabase: usados por App.tsx (gate en página), AppSidebar,
// MobileMoreDrawer y las 4 páginas del Scheduler, para que la matriz de
// roles autorizados no diverja entre navegación y páginas. La autoridad
// real de datos sigue siendo la RLS/Edge Function — esto solo decide qué
// mostrar en la UI.
//
// Merge con `feat/roles-permisos` (2026-08): antes de esta rama, el rol
// venía de `useUserRole()` → `user_roles.role` (enum legacy: admin, staff,
// viewer, partner, director, manager, senior, semisenior, sqr,
// specialist_it, specialist_tax). `feat/roles-permisos` reemplaza esa
// fuente por `user_roles.role_key` (23 valores) y espeja `role_key` al enum
// legacy vía `legacy_app_role` para compatibilidad de RLS ya existente. Ese
// espejo colapsa 23 roles en 11 valores legacy — bajo el enum, 18 de los 23
// `role_key` heredarían acceso al Scheduler (12 de más: risk_partner,
// it_security_manager, risk_supervisor, accounting_manager, hr_manager,
// ita_manager, tax_manager, accounting_analyst, collections_analyst,
// hr_analyst, ita_senior, tax_senior).
//
// Por eso estos predicados leen `role_key` directamente, no el enum. Es un
// sinónimo exacto de la matriz previa (mismo resultado para
// admin/partner/director/manager/senior), sin necesitar ninguna migración
// nueva ni un catálogo de permisos `scheduler.*` — eso queda para una fase
// posterior, cuando se definan las rutas de roles como ita_manager/
// tax_manager (decisión del operador, 2026-08-06).

/** L1 / L2 / Staff timeline: firmwide + manager + senior. */
export const SCHEDULER_PLANNING_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "senior_partner",
  "partner",
  "director",
  "manager",
  "senior",
]);

/** Gap Reporting: firmwide únicamente (admin/partner/director). */
export const SCHEDULER_GAPS_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "senior_partner",
  "partner",
  "director",
]);

export function canSeePlanning(roleKey: string | null | undefined): boolean {
  return !!roleKey && SCHEDULER_PLANNING_ROLES.has(roleKey);
}

export function canSeeGaps(roleKey: string | null | undefined): boolean {
  return !!roleKey && SCHEDULER_GAPS_ROLES.has(roleKey);
}
