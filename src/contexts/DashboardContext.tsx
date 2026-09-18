import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { 
  FiscalPeriod, 
  PeriodType, 
  QuarterType,
  getFiscalYearPeriod,
  getCustomPeriod,
  formatDateForApi,
} from '@/lib/fiscalCalculations';

export type DashboardTab = 'practica' | 'cartera' | 'encargo' | 'personal' | 'socio';

interface DashboardContextType {
  // Period state
  period: FiscalPeriod;
  periodType: PeriodType;
  selectedYear: number;
  selectedQuarter: QuarterType;
  
  // Period actions
  setYear: (year: number) => void;
  setQuarter: (quarter: QuarterType) => void;
  setCustomRange: (startDate: Date, endDate: Date) => void;
  
  // API-ready date strings
  startDateStr: string;
  endDateStr: string;
  
  // Tab state
  activeTab: DashboardTab;
  setActiveTab: (tab: DashboardTab) => void;
  
  // Engagement selection (for Encargo tab)
  selectedEngagementId: string | null;
  setSelectedEngagementId: (id: string | null) => void;

  // dash_socio: filtros exclusivos de la pestaña Socio. Viven acá (y no en un
  // estado local de PartnerTab) porque la fila de filtros la renderiza Index.tsx
  // en la fila de pestañas, fuera del árbol que Radix desmonta al cambiar de tab.
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
  selectedIndustryId: string | null;
  setSelectedIndustryId: (id: string | null) => void;
  // dash_socio (2026-09-17): filtro de Sociedad, solo visible para admin/senior_partner
  // (los demás roles ya están acotados a su propia sociedad o a sus encargos).
  selectedSocietyId: string | null;
  setSelectedSocietyId: (id: string | null) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

interface DashboardProviderProps {
  children: React.ReactNode;
  defaultTab?: DashboardTab;
}

export function DashboardProvider({ children, defaultTab = 'personal' }: DashboardProviderProps) {
  const today = new Date();
  const currentYear = today.getFullYear(); // Use calendar year (2026)
  
  // Period state - default to current calendar year with YTD
  const [periodType, setPeriodType] = useState<PeriodType>('tax_bolivia');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<QuarterType>('ytd');
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<DashboardTab>(defaultTab);
  
  // Engagement selection
  const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(null);

  // dash_socio: filtros Cliente/Sector, exclusivos de la pestaña Socio. El filtro de
  // Gerente se retiró de la UI (2026-09-16/17, review.md iteración 1 NH-01 lo terminó de
  // limpiar): quedaba redundante con el clic-para-navegar del Bloque E. `p_manager_id`
  // sigue declarado en el contrato del RPC (plan_v2.md §7.1), pero PartnerTab.tsx ya no
  // lee este estado -- le pasa `null` directo.
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedIndustryId, setSelectedIndustryId] = useState<string | null>(null);
  const [selectedSocietyId, setSelectedSocietyId] = useState<string | null>(null);

  // Calculate current period based on selections
  const period = useMemo<FiscalPeriod>(() => {
    if (periodType === 'custom' && customStart && customEnd) {
      return getCustomPeriod(customStart, customEnd);
    }
    
    return getFiscalYearPeriod(selectedYear, selectedQuarter);
  }, [periodType, selectedYear, selectedQuarter, customStart, customEnd]);
  
  // API-ready date strings
  const startDateStr = useMemo(() => formatDateForApi(period.startDate), [period.startDate]);
  const endDateStr = useMemo(() => formatDateForApi(period.endDate), [period.endDate]);
  
  // Actions
  const setYear = useCallback((year: number) => {
    setSelectedYear(year);
    if (periodType === 'custom') {
      setPeriodType('tax_bolivia');
    }
  }, [periodType]);
  
  const setQuarter = useCallback((quarter: QuarterType) => {
    setSelectedQuarter(quarter);
    if (periodType === 'custom') {
      setPeriodType('tax_bolivia');
    }
  }, [periodType]);
  
  const setCustomRange = useCallback((startDate: Date, endDate: Date) => {
    setCustomStart(startDate);
    setCustomEnd(endDate);
    setPeriodType('custom');
  }, []);
  
  const value = useMemo<DashboardContextType>(() => ({
    period,
    periodType,
    selectedYear,
    selectedQuarter,
    setYear,
    setQuarter,
    setCustomRange,
    startDateStr,
    endDateStr,
    activeTab,
    setActiveTab,
    selectedEngagementId,
    setSelectedEngagementId,
    selectedClientId,
    setSelectedClientId,
    selectedIndustryId,
    setSelectedIndustryId,
    selectedSocietyId,
    setSelectedSocietyId,
  }), [
    period,
    periodType,
    selectedYear,
    selectedQuarter,
    setYear,
    setQuarter,
    setCustomRange,
    startDateStr,
    endDateStr,
    activeTab,
    selectedEngagementId,
    selectedClientId,
    selectedIndustryId,
    selectedSocietyId,
  ]);
  
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}