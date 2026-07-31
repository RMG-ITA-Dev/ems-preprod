// Fase 3 — predicados puros de navegación/acceso del Scheduler.
//
// Sin React ni Supabase: usados por App.tsx (gate en página), AppSidebar,
// MobileMoreDrawer y las 4 páginas del Scheduler, para que la matriz de
// roles autorizados no diverja entre navegación y páginas. La autoridad
// real de datos sigue siendo la RLS/Edge Function — esto solo decide qué
// mostrar en la UI.

export interface SchedulerAccessRoleFlags {
  isAdmin: boolean;
  isPartner: boolean;
  isDirector: boolean;
  isManager: boolean;
  isSenior: boolean;
}

/** L1 / L2 / Staff timeline: firmwide + manager + senior. */
export function canSeePlanning(flags: SchedulerAccessRoleFlags): boolean {
  return (
    flags.isAdmin ||
    flags.isPartner ||
    flags.isDirector ||
    flags.isManager ||
    flags.isSenior
  );
}

/** Gap Reporting: firmwide únicamente (admin/partner/director). */
export function canSeeGaps(flags: SchedulerAccessRoleFlags): boolean {
  return flags.isAdmin || flags.isPartner || flags.isDirector;
}
