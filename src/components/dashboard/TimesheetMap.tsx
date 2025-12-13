import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, subWeeks, startOfWeek, addDays, isBefore, parseISO } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface TimesheetMapProps {
  staffId: string;
}

interface WeekStatus {
  weekStart: Date;
  status: 'submitted' | 'draft' | 'overdue' | 'not_started';
  totalHours: number;
}

export function TimesheetMap({ staffId }: TimesheetMapProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'es' ? es : enUS;

  const { data: weeksData, isLoading } = useQuery({
    queryKey: ['timesheet-status-map-52', staffId],
    queryFn: async (): Promise<WeekStatus[]> => {
      const today = new Date();
      const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
      
      // Get 52 weeks of data (full year)
      const weeks: WeekStatus[] = [];
      for (let i = 51; i >= 0; i--) {
        const weekStart = subWeeks(currentWeekStart, i);
        weeks.push({
          weekStart,
          status: 'not_started',
          totalHours: 0,
        });
      }

      // Fetch timesheet periods for this staff
      const startDate = format(weeks[0].weekStart, 'yyyy-MM-dd');
      const endDate = format(currentWeekStart, 'yyyy-MM-dd');
      
      const { data: periods } = await supabase
        .from('timesheet_periods')
        .select('week_start_date, submitted_at, total_hours, deadline')
        .eq('staff_id', staffId)
        .gte('week_start_date', startDate)
        .lte('week_start_date', endDate);

      // Map periods to weeks
      periods?.forEach(period => {
        const periodWeekStart = parseISO(period.week_start_date);
        const weekIdx = weeks.findIndex(w => 
          format(w.weekStart, 'yyyy-MM-dd') === period.week_start_date
        );
        
        if (weekIdx !== -1) {
          weeks[weekIdx].totalHours = Number(period.total_hours || 0);
          
          if (period.submitted_at) {
            weeks[weekIdx].status = 'submitted';
          } else {
            // Check if overdue (past deadline and not submitted)
            const deadline = period.deadline 
              ? parseISO(period.deadline) 
              : addDays(periodWeekStart, 7);
            
            if (isBefore(deadline, today)) {
              weeks[weekIdx].status = 'overdue';
            } else {
              weeks[weekIdx].status = 'draft';
            }
          }
        }
      });

      // Mark past weeks without periods as overdue (except current week)
      weeks.forEach((week, idx) => {
        if (week.status === 'not_started' && idx < 51) {
          const weekEnd = addDays(week.weekStart, 6);
          if (isBefore(weekEnd, today)) {
            week.status = 'overdue';
          }
        }
      });

      return weeks;
    },
    enabled: !!staffId,
  });

  const getStatusColor = (status: WeekStatus['status']): string => {
    switch (status) {
      case 'submitted': return 'bg-success';
      case 'draft': return 'bg-warning';
      case 'overdue': return 'bg-destructive';
      case 'not_started': return 'bg-muted';
      default: return 'bg-muted';
    }
  };

  const getStatusLabel = (status: WeekStatus['status']): string => {
    switch (status) {
      case 'submitted': return t('dashboard.personal.mapLegend.submitted');
      case 'draft': return t('dashboard.personal.mapLegend.draft');
      case 'overdue': return t('dashboard.personal.mapLegend.overdue');
      case 'not_started': return t('dashboard.personal.mapLegend.notStarted');
      default: return '';
    }
  };

  // Get month labels for the 52 weeks
  const getMonthLabels = () => {
    if (!weeksData) return [];
    
    const months: { label: string; colStart: number }[] = [];
    let currentMonth = -1;
    
    weeksData.forEach((week, idx) => {
      const month = week.weekStart.getMonth();
      if (month !== currentMonth) {
        currentMonth = month;
        months.push({
          label: format(week.weekStart, 'MMM', { locale: dateLocale }),
          colStart: idx,
        });
      }
    });
    
    return months;
  };

  if (isLoading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border-border">
        <CardContent className="p-4">
          <div className="h-24 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  const monthLabels = getMonthLabels();

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t('dashboard.personal.timeActivity')} ({t('dashboard.personal.weeksLabel')})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <TooltipProvider>
          {/* Month labels */}
          <div className="flex text-[10px] text-muted-foreground mb-1 ml-0">
            {monthLabels.map((month, idx) => (
              <div 
                key={idx} 
                className="flex-shrink-0"
                style={{ 
                  marginLeft: idx === 0 ? 0 : `${(month.colStart - (monthLabels[idx-1]?.colStart || 0) - 1) * 12}px`,
                  width: 'auto'
                }}
              >
                {month.label}
              </div>
            ))}
          </div>
          
          {/* Week grid - single row of 52 weeks */}
          <div className="flex items-center gap-[2px] overflow-x-auto pb-2">
            {weeksData?.map((week, idx) => (
              <Tooltip key={idx}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "w-[10px] h-[10px] rounded-[2px] cursor-default transition-all flex-shrink-0",
                      "hover:ring-1 hover:ring-foreground/30",
                      getStatusColor(week.status)
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  <div className="font-medium">{getStatusLabel(week.status)}</div>
                  <div className="text-muted-foreground">
                    {format(week.weekStart, 'd MMM', { locale: dateLocale })} - {week.totalHours.toFixed(1)}h
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          
          {/* Status Legend */}
          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <div className="w-[10px] h-[10px] rounded-[2px] bg-success" />
              {t('dashboard.personal.mapLegend.submitted')}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-[10px] h-[10px] rounded-[2px] bg-warning" />
              {t('dashboard.personal.mapLegend.draft')}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-[10px] h-[10px] rounded-[2px] bg-muted border border-border" />
              {t('dashboard.personal.mapLegend.notStarted')}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-[10px] h-[10px] rounded-[2px] bg-destructive" />
              {t('dashboard.personal.mapLegend.overdue')}
            </span>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
