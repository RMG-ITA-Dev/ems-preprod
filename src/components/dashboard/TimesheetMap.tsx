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
  weekNumber: number;
  status: 'submitted' | 'draft' | 'overdue' | 'not_started';
  totalHours: number;
}

export function TimesheetMap({ staffId }: TimesheetMapProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'es' ? es : enUS;

  const { data: weeksData, isLoading } = useQuery({
    queryKey: ['timesheet-status-map', staffId],
    queryFn: async (): Promise<WeekStatus[]> => {
      const today = new Date();
      const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
      
      // Get 12 weeks of data
      const weeks: WeekStatus[] = [];
      for (let i = 11; i >= 0; i--) {
        const weekStart = subWeeks(currentWeekStart, i);
        weeks.push({
          weekStart,
          weekNumber: 12 - i,
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

      // Mark past weeks without periods as overdue
      weeks.forEach((week, idx) => {
        if (week.status === 'not_started' && idx < 11) {
          // Past week with no period = overdue
          week.status = 'overdue';
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

  if (isLoading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border-border">
        <CardContent className="p-3">
          <div className="h-8 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {t('dashboard.personal.timeActivity')} ({t('dashboard.personal.weeksLabel')})
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <TooltipProvider>
          <div className="flex items-center gap-1">
            {weeksData?.map((week, idx) => (
              <Tooltip key={idx}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "w-6 h-6 rounded-sm cursor-default transition-all",
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
          
          {/* Compact Legend */}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-success" />
              {t('dashboard.personal.mapLegend.submitted')}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-warning" />
              {t('dashboard.personal.mapLegend.draft')}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-muted" />
              {t('dashboard.personal.mapLegend.notStarted')}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-destructive" />
              {t('dashboard.personal.mapLegend.overdue')}
            </span>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
