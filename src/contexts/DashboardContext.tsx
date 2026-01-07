import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { 
  FiscalPeriod, 
  PeriodType, 
  QuarterType,
  getFiscalYearPeriod,
  getCustomPeriod,
  formatDateForApi,
} from '@/lib/fiscalCalculations';

export type DashboardTab = 'practica' | 'cartera' | 'encargo' | 'personal';

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