import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CalendarDays } from 'lucide-react';
import { format, subWeeks, startOfWeek, addDays, isSameDay, eachDayOfInterval, subDays } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface TimesheetMapProps {
  staffId: string;
}

interface DayData {
  date: Date;
  hours: number;
}

export function TimesheetMap({ staffId }: TimesheetMapProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'es' ? es : enUS;

  const { data: dayData, isLoading } = useQuery({
    queryKey: ['timesheet-activity-map', staffId],
    queryFn: async (): Promise<DayData[]> => {
      const today = new Date();
      // Get 52 weeks of data (1 year)
      const startDate = subWeeks(startOfWeek(today, { weekStartsOn: 0 }), 52);
      const endDate = today;

      // Generate all days in the range
      const allDays = eachDayOfInterval({ start: startDate, end: endDate });
      const dayMap = new Map<string, number>();
      allDays.forEach(day => {
        dayMap.set(format(day, 'yyyy-MM-dd'), 0);
      });

      // Fetch time entries for the period
      const { data: entries } = await supabase
        .from('time_entries')
        .select('date_worked, hours_logged')
        .eq('staff_id', staffId)
        .gte('date_worked', format(startDate, 'yyyy-MM-dd'))
        .lte('date_worked', format(endDate, 'yyyy-MM-dd'));

      // Aggregate hours by day
      entries?.forEach(entry => {
        const current = dayMap.get(entry.date_worked) || 0;
        dayMap.set(entry.date_worked, current + Number(entry.hours_logged));
      });

      return allDays.map(date => ({
        date,
        hours: dayMap.get(format(date, 'yyyy-MM-dd')) || 0,
      }));
    },
    enabled: !!staffId,
  });

  // Get intensity level (0-4) based on hours
  const getIntensityLevel = (hours: number): number => {
    if (hours === 0) return 0;
    if (hours <= 2) return 1;
    if (hours <= 4) return 2;
    if (hours <= 6) return 3;
    return 4;
  };

  const getIntensityColor = (level: number): string => {
    switch (level) {
      case 0: return 'bg-muted';
      case 1: return 'bg-success/25';
      case 2: return 'bg-success/45';
      case 3: return 'bg-success/65';
      case 4: return 'bg-success/85';
      default: return 'bg-muted';
    }
  };

  // Organize data into weeks (columns) with days (rows)
  const getWeeksGrid = () => {
    if (!dayData) return [];
    
    const weeks: DayData[][] = [];
    let currentWeek: DayData[] = [];
    
    dayData.forEach((day, index) => {
      const dayOfWeek = day.date.getDay(); // 0 = Sunday
      
      // Start new week on Sunday
      if (dayOfWeek === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      
      currentWeek.push(day);
      
      // Push last week
      if (index === dayData.length - 1) {
        weeks.push(currentWeek);
      }
    });
    
    return weeks;
  };

  // Get month labels for the top
  const getMonthLabels = () => {
    if (!dayData || dayData.length === 0) return [];
    
    const months: { label: string; colSpan: number }[] = [];
    let currentMonth = -1;
    let colCount = 0;
    
    const weeks = getWeeksGrid();
    
    weeks.forEach((week) => {
      const firstDay = week[0];
      const month = firstDay.date.getMonth();
      
      if (month !== currentMonth) {
        if (currentMonth !== -1) {
          months.push({
            label: format(subDays(firstDay.date, 7), 'MMM', { locale: dateLocale }),
            colSpan: colCount,
          });
        }
        currentMonth = month;
        colCount = 1;
      } else {
        colCount++;
      }
    });
    
    // Push last month
    if (colCount > 0 && dayData.length > 0) {
      months.push({
        label: format(dayData[dayData.length - 1].date, 'MMM', { locale: dateLocale }),
        colSpan: colCount,
      });
    }
    
    return months;
  };

  const weeks = getWeeksGrid();
  const monthLabels = getMonthLabels();
  const today = new Date();

  const dayLabels = i18n.language === 'es' 
    ? ['', 'Lun', '', 'Mié', '', 'Vie', '']
    : ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  if (isLoading) {
    return (
      <Card className="bg-card/80 backdrop-blur-sm border-border">
        <CardContent className="p-4">
          <div className="h-[120px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 backdrop-blur-sm border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {t('dashboard.personal.timeActivity')}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <TooltipProvider>
          {/* Month labels */}
          <div className="flex text-xs text-muted-foreground mb-1">
            <div className="w-7 shrink-0" /> {/* Spacer for day labels */}
            {monthLabels.map((month, idx) => (
              <div 
                key={idx} 
                className="text-center"
                style={{ width: `${month.colSpan * 12}px` }}
              >
                {month.colSpan >= 3 ? month.label : ''}
              </div>
            ))}
          </div>

          {/* Grid container */}
          <div className="flex">
            {/* Day labels */}
            <div className="flex flex-col gap-[2px] mr-1 shrink-0">
              {dayLabels.map((label, idx) => (
                <div key={idx} className="h-[10px] text-[9px] text-muted-foreground leading-[10px] w-6 text-right pr-1">
                  {label}
                </div>
              ))}
            </div>

            {/* Week columns */}
            <div className="flex gap-[2px]">
              {weeks.map((week, weekIdx) => (
                <div key={weekIdx} className="flex flex-col gap-[2px]">
                  {/* Pad incomplete first week */}
                  {weekIdx === 0 && week[0].date.getDay() !== 0 && (
                    Array.from({ length: week[0].date.getDay() }).map((_, i) => (
                      <div key={`pad-${i}`} className="w-[10px] h-[10px]" />
                    ))
                  )}
                  {week.map((day, dayIdx) => {
                    const level = getIntensityLevel(day.hours);
                    const isToday = isSameDay(day.date, today);
                    
                    return (
                      <Tooltip key={dayIdx}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "w-[10px] h-[10px] rounded-sm cursor-default transition-all",
                              getIntensityColor(level),
                              isToday && "ring-1 ring-primary ring-offset-1 ring-offset-background"
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          <div>
                            {day.hours.toFixed(1)} {t('dashboard.personal.hoursOn')} {format(day.date, 'd MMM yyyy', { locale: dateLocale })}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex justify-end items-center gap-1 mt-3 text-xs text-muted-foreground">
            <span>{t('dashboard.personal.less')}</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={cn(
                  "w-[10px] h-[10px] rounded-sm",
                  getIntensityColor(level)
                )}
              />
            ))}
            <span>{t('dashboard.personal.more')}</span>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}
