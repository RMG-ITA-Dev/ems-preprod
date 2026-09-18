import { useMemo } from 'react';
import { useAuthorization } from '@/hooks/useAuthorization';
import { DashboardTab } from '@/contexts/DashboardContext';

/**
 * Acceso a los tabs del Panel de Control.
 *
 * FASE 3 (Opción C): ahora se decide por ROL/PERMISO (vía `useAuthorization`),
 * NO por la categoría del staff (`category.display_order`). Cada tab se gobierna
 * por su permiso `dashboard.*`. Esto elimina la divergencia rol vs categoría
 * documentada en `docs/explicacion-permisos.md`.
 *
 * La forma del retorno se mantiene para no romper a los consumidores
 * (`Index.tsx`, `EngagementSelector.tsx`).
 */

const TAB_PERMISSION: Record<DashboardTab, string> = {
  practica: 'dashboard.practice_financials.read',
  cartera: 'dashboard.portfolio.read',
  encargo: 'dashboard.engagement.read',
  personal: 'dashboard.personal.read',
  // dash_socio: nueva pestaña Socio, senior_partner/admin/partner/director/sqr.
  socio: 'dashboard.partner.read',
};

// Orden de privilegio (más amplio primero) para elegir el tab por defecto.
// 'practica' se oculta (2026-09-16, decisión del operador): la vieja pestaña Práctica
// (dashboard.practice_financials.read) deja de mostrarse -- su lugar en la UI lo toma la
// pestaña 'socio', re-etiquetada "Práctica" en Index.tsx (TAB_CONFIG). PracticaTab.tsx, su
// ruta y el permiso dashboard.practice_financials.read NO se tocan (reversible); solo se
// saca 'practica' de este orden para que nunca entre a allowedTabs/defaultTab.
const TAB_ORDER: DashboardTab[] = ['cartera', 'encargo', 'personal', 'socio'];

interface DashboardAccess {
  allowedTabs: DashboardTab[];
  defaultTab: DashboardTab;

  /** Ve TODOS los encargos (alcance `firm` en el dashboard de encargo). */
  isPartner: boolean;
  /** Ve el dashboard de encargo (por asignación o firm). */
  isManager: boolean;
  /** No ve el dashboard de encargo. */
  isStaff: boolean;

  canAccessTab: (tab: DashboardTab) => boolean;
  isLoading: boolean;
}

export function useDashboardAccess(): DashboardAccess {
  const { can, scope, isLoading } = useAuthorization();

  return useMemo(() => {
    // Mientras carga, acceso mínimo (fail-closed).
    if (isLoading) {
      return {
        allowedTabs: ['personal'] as DashboardTab[],
        defaultTab: 'personal' as DashboardTab,
        isPartner: false,
        isManager: false,
        isStaff: true,
        canAccessTab: (tab: DashboardTab) => tab === 'personal',
        isLoading: true,
      };
    }

    const allowedTabs = TAB_ORDER.filter((tab) => can(TAB_PERMISSION[tab]));
    // Piso de seguridad: si no hay ninguno resoluble, dejamos "personal".
    const effectiveTabs = allowedTabs.length ? allowedTabs : (['personal'] as DashboardTab[]);
    const defaultTab = effectiveTabs[0];

    const isPartner = scope('dashboard.engagement.read') === 'firm';
    const isManager = can('dashboard.engagement.read');
    const isStaff = !isManager;

    return {
      allowedTabs: effectiveTabs,
      defaultTab,
      isPartner,
      isManager,
      isStaff,
      canAccessTab: (tab: DashboardTab) => effectiveTabs.includes(tab),
      isLoading: false,
    };
  }, [can, scope, isLoading]);
}
