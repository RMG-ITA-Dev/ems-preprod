import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDashboard } from '@/contexts/DashboardContext';
import { getAvailableYears, QuarterType } from '@/lib/fiscalCalculations';

const QUARTERS: { value: QuarterType; label: string }[] = [
  { value: 'Q1', label: 'Q1' },
  { value: 'Q2', label: 'Q2' },
  { value: 'Q3', label: 'Q3' },
  { value: 'Q4', label: 'Q4' },
  { value: 'full', label: 'Todo' },
  { value: 'ytd', label: 'YTD' },
];

export function PeriodSelector() {
  const { t } = useTranslation();
  const {
    period,
    periodType,
    selectedYear,
    selectedQuarter,
    setYear,
    setQuarter,
    setCustomRange,
  } = useDashboard();
  
  const [customStartOpen, setCustomStartOpen] = useState(false);
  const [customEndOpen, setCustomEndOpen] = useState(false);
  const [tempCustomStart, setTempCustomStart] = useState<Date | undefined>();
  const [tempCustomEnd, setTempCustomEnd] = useState<Date | undefined>();
  
  const years = getAvailableYears();
  
  return (
    <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-muted/50 backdrop-blur-sm border border-border/50">
      {/* Year Buttons */}
      <div className="flex items-center gap-1">
        {years.map((year) => (
          <Button
            key={year}
            variant={selectedYear === year && periodType !== 'custom' ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'h-8 px-3 text-xs font-medium',
              selectedYear === year && periodType !== 'custom' && 'bg-primary text-primary-foreground'
            )}
            onClick={() => setYear(year)}
          >
            {year}
          </Button>
        ))}
      </div>
      
      {/* Divider */}
      <div className="h-6 w-px bg-border" />
      
      {/* Quarter Buttons */}
      <div className="flex items-center gap-1">
        {QUARTERS.map((q) => (
          <Button
            key={q.value}
            variant={selectedQuarter === q.value && periodType !== 'custom' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn(
              'h-8 px-2 text-xs font-medium',
              selectedQuarter === q.value && periodType !== 'custom' && 'bg-secondary text-secondary-foreground'
            )}
            onClick={() => setQuarter(q.value)}
          >
            {q.label}
          </Button>
        ))}
      </div>
      
      {/* Divider */}
      <div className="h-6 w-px bg-border" />
      
      {/* Custom Date Range */}
      <div className="flex items-center gap-1">
        <Popover open={customStartOpen} onOpenChange={setCustomStartOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-2 text-xs font-medium gap-1',
                periodType === 'custom' && 'bg-secondary text-secondary-foreground'
              )}
            >
              <CalendarIcon className="h-3 w-3" />
              {periodType === 'custom' && period.startDate
                ? format(period.startDate, 'dd MMM', { locale: es })
                : t('dashboard.period.from')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={tempCustomStart}
              onSelect={(date) => {
                setTempCustomStart(date);
                setCustomStartOpen(false);
                if (date && tempCustomEnd && date <= tempCustomEnd) {
                  setCustomRange(date, tempCustomEnd);
                }
              }}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        
        <span className="text-xs text-muted-foreground">-</span>
        
        <Popover open={customEndOpen} onOpenChange={setCustomEndOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 px-2 text-xs font-medium gap-1',
                periodType === 'custom' && 'bg-secondary text-secondary-foreground'
              )}
            >
              {periodType === 'custom' && period.endDate
                ? format(period.endDate, 'dd MMM yyyy', { locale: es })
                : t('dashboard.period.to')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={tempCustomEnd}
              onSelect={(date) => {
                setTempCustomEnd(date);
                setCustomEndOpen(false);
                if (tempCustomStart && date && tempCustomStart <= date) {
                  setCustomRange(tempCustomStart, date);
                }
              }}
              disabled={(date) => tempCustomStart ? date < tempCustomStart : false}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Period Label */}
      <div className="ml-auto text-xs text-muted-foreground font-medium">
        {period.label}
      </div>
    </div>
  );
}