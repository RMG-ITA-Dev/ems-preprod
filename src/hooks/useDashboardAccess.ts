import { useMemo } from 'react';
import { useCurrentStaff } from '@/hooks/useCurrentStaff';
import { DashboardTab } from '@/contexts/DashboardContext';

interface DashboardAccess {
  // Which tabs the user can see
  allowedTabs: DashboardTab[];
  
  // Default tab for this user
  defaultTab: DashboardTab;
  
  // Role indicators
  isPartner: boolean;      // display_order <= 2 (Partner/Director)
  isManager: boolean;      // display_order <= 4 (Manager/Supervisor)
  isStaff: boolean;        // display_order > 4 (Staff/Senior/Junior)
  
  // Helper to check if a tab is allowed
  canAccessTab: (tab: DashboardTab) => boolean;
  
  // Loading state
  isLoading: boolean;
}

/**
 * Hook to determine dashboard tab access based on user's staff category
 * 
 * Access rules:
 * - Partner/Director (display_order ≤ 2): All tabs [Práctica, Cartera, Encargo, Personal]
 * - Manager/Supervisor (display_order ≤ 4): [Cartera, Encargo, Personal]
 * - Staff/Senior/Junior (display_order > 4): [Encargo, Personal]
 */
export function useDashboardAccess(): DashboardAccess {
  const { staffRecord, isLoading } = useCurrentStaff();
  
  return useMemo(() => {
    // Default to most restrictive access while loading
    if (isLoading || !staffRecord) {
      return {
        allowedTabs: ['personal'] as DashboardTab[],
        defaultTab: 'personal' as DashboardTab,
        isPartner: false,
        isManager: false,
        isStaff: true,
        canAccessTab: (tab: DashboardTab) => tab === 'personal',
        isLoading,
      };
    }
    
    const displayOrder = staffRecord.category?.display_order ?? 999;
    
    // Partner/Director: display_order ≤ 2
    const isPartner = displayOrder <= 2;
    
    // Manager/Supervisor: display_order ≤ 4 (includes partners)
    const isManager = displayOrder <= 4;
    
    // Staff level: display_order > 4
    const isStaff = displayOrder > 4;
    
    // Determine allowed tabs based on role
    let allowedTabs: DashboardTab[];
    let defaultTab: DashboardTab;
    
    if (isPartner) {
      // Partners see all tabs, default to firm-wide view
      allowedTabs = ['practica', 'cartera', 'encargo', 'personal'];
      defaultTab = 'practica';
    } else if (isManager) {
      // Managers see portfolio and below, default to portfolio
      allowedTabs = ['cartera', 'encargo', 'personal'];
      defaultTab = 'cartera';
    } else {
      // Staff see engagement and personal, default to personal
      allowedTabs = ['encargo', 'personal'];
      defaultTab = 'personal';
    }
    
    const canAccessTab = (tab: DashboardTab) => allowedTabs.includes(tab);
    
    return {
      allowedTabs,
      defaultTab,
      isPartner,
      isManager,
      isStaff,
      canAccessTab,
      isLoading,
    };
  }, [staffRecord, isLoading]);
}
