import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  aggregateStaffHours,
  groupByCategory,
  downloadXlsx,
  type RawTimeEntryRow,
} from "@/lib/encargoHoursDetailExport";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string | null;
  engagementCode: string;
}

export function StaffHoursDetailDialog({ open, onOpenChange, engagementId, engagementCode }: Props) {
  const { t } = useTranslation();
  const [categoryFilter, setCategoryFilter] = useState<string>('__all__');
  const [nameFilter, setNameFilter] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('__all__');
  const [weekFilter, setWeekFilter] = useState<string>('__all__');
  const [lastWeekOnly, setLastWeekOnly] = useState(true);
  const initialized = useRef(false);

  const { data: rawRows, isLoading } = useQuery({
    queryKey: ['encargo-staff-hours-detail', engagementId],
    queryFn: async () => {
      if (!engagementId) return [];
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          hours_logged,
          staff_id,
          period:timesheet_periods(year, week_number, week_start_date),
          staff:staff(
            first_name, last_name,
            category:categories(category_name, display_order)
          )
        `)
        .eq('engagement_id', engagementId)
        .eq('is_forecast', false);
      if (error) throw error;
      return (data ?? []) as unknown as RawTimeEntryRow[];
    },
    enabled: open && !!engagementId,
  });

  const aggregated = useMemo(() => aggregateStaffHours(rawRows ?? []), [rawRows]);

  const { maxYear, maxWeek } = useMemo(() => {
    const years = aggregated.filter(r => r.year !== null).map(r => r.year as number);
    if (years.length === 0) return { maxYear: null, maxWeek: null };
    const my = Math.max(...years);
    const weeks = aggregated
      .filter(r => r.year === my && r.weekNumber !== null)
      .map(r => r.weekNumber as number);
    return { maxYear: my, maxWeek: weeks.length > 0 ? Math.max(...weeks) : null };
  }, [aggregated]);

  // Auto-initialize year/week to the most recent data on first load
  useEffect(() => {
    if (!open || initialized.current || aggregated.length === 0) return;
    if (maxYear !== null) setYearFilter(String(maxYear));
    if (maxWeek !== null) setWeekFilter(String(maxWeek));
    initialized.current = true;
  }, [open, aggregated, maxYear, maxWeek]);

  // Reset all filters when dialog closes so next open re-initializes
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      setCategoryFilter('__all__');
      setNameFilter('');
      setYearFilter('__all__');
      setWeekFilter('__all__');
      setLastWeekOnly(true);
    }
  }, [open]);

  const categoryOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: string[] = [];
    for (const row of aggregated) {
      if (!seen.has(row.categoryName)) {
        seen.add(row.categoryName);
        options.push(row.categoryName);
      }
    }
    return options;
  }, [aggregated]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const row of aggregated) {
      if (row.year !== null) years.add(row.year);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [aggregated]);

  const weekOptions = useMemo(() => {
    const weeks = new Set<number>();
    for (const row of aggregated) {
      if (row.weekNumber === null) continue;
      if (yearFilter !== '__all__' && row.year !== Number(yearFilter)) continue;
      weeks.add(row.weekNumber);
    }
    return Array.from(weeks).sort((a, b) => a - b);
  }, [aggregated, yearFilter]);

  function handleYearChange(value: string) {
    setLastWeekOnly(false);
    setYearFilter(value);
    if (weekFilter !== '__all__') {
      const availableWeeks = aggregated
        .filter(r => value === '__all__' || r.year === Number(value))
        .filter(r => r.weekNumber !== null)
        .map(r => r.weekNumber as number);
      if (!availableWeeks.includes(Number(weekFilter))) {
        setWeekFilter('__all__');
      }
    }
  }

  function handleWeekChange(value: string) {
    setWeekFilter(value);
    setLastWeekOnly(false);
  }

  const filtered = useMemo(() => {
    return aggregated.filter(row => {
      const matchesCategory = categoryFilter === '__all__' || row.categoryName === categoryFilter;
      const matchesName = nameFilter.trim() === '' ||
        row.staffName.toLowerCase().includes(nameFilter.trim().toLowerCase());
      const matchesYear = yearFilter === '__all__' || (row.year !== null && String(row.year) === yearFilter);
      const matchesWeek = weekFilter === '__all__' || (row.weekNumber !== null && String(row.weekNumber) === weekFilter);
      return matchesCategory && matchesName && matchesYear && matchesWeek;
    });
  }, [aggregated, categoryFilter, nameFilter, yearFilter, weekFilter]);

  function handleExport() {
    const headers = {
      staffName: t('dashboard.encargo.hoursDetail.staffName'),
      category: t('dashboard.encargo.hoursDetail.category'),
      year: t('dashboard.encargo.hoursDetail.year'),
      week: t('dashboard.encargo.hoursDetail.week'),
      loadedHours: t('dashboard.encargo.hoursDetail.loadedHours'),
      subtotal: t('dashboard.encargo.hoursDetail.subtotal'),
      grandTotal: t('dashboard.encargo.hoursDetail.grandTotal'),
    };
    downloadXlsx(filtered, headers, `horas_${engagementCode}_detalle.xlsx`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('dashboard.encargo.hoursDetail.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('dashboard.encargo.hoursDetail.description')}
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-44" aria-label={t('dashboard.encargo.hoursDetail.filterByCategory')}>
              <SelectValue placeholder={t('dashboard.encargo.hoursDetail.filterByCategory')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('dashboard.encargo.hoursDetail.all')}</SelectItem>
              {categoryOptions.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={yearFilter} onValueChange={handleYearChange}>
            <SelectTrigger className="w-full sm:w-28" aria-label={t('dashboard.encargo.hoursDetail.filterByYear')}>
              <SelectValue placeholder={t('dashboard.encargo.hoursDetail.filterByYear')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('dashboard.encargo.hoursDetail.all')}</SelectItem>
              {yearOptions.map(year => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={weekFilter} onValueChange={handleWeekChange}>
            <SelectTrigger className="w-full sm:w-28" aria-label={t('dashboard.encargo.hoursDetail.filterByWeek')}>
              <SelectValue placeholder={t('dashboard.encargo.hoursDetail.filterByWeek')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('dashboard.encargo.hoursDetail.all')}</SelectItem>
              {weekOptions.map(week => (
                <SelectItem key={week} value={String(week)}>{week}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Checkbox
              id="lastWeekOnly"
              checked={lastWeekOnly}
              onCheckedChange={(checked) => {
                const isChecked = checked === true;
                setLastWeekOnly(isChecked);
                if (isChecked) {
                  if (maxYear !== null) setYearFilter(String(maxYear));
                  if (maxWeek !== null) setWeekFilter(String(maxWeek));
                } else {
                  setYearFilter('__all__');
                  setWeekFilter('__all__');
                }
              }}
            />
            <label htmlFor="lastWeekOnly" className="text-sm cursor-pointer">
              {t('dashboard.encargo.hoursDetail.lastWeekOnly')}
            </label>
          </div>

          <Input
            className="w-full sm:flex-1"
            placeholder={t('dashboard.encargo.hoursDetail.filterByStaff')}
            value={nameFilter}
            onChange={e => setNameFilter(e.target.value)}
          />

          <Button
            variant="outline"
            size="sm"
            className="gap-1 shrink-0 sm:ml-auto"
            onClick={handleExport}
          >
            <Download className="h-4 w-4" />
            {t('dashboard.encargo.hoursDetail.exportExcel')}
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto mt-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('dashboard.encargo.hoursDetail.staffName')}</TableHead>
                <TableHead>{t('dashboard.encargo.hoursDetail.category')}</TableHead>
                <TableHead className="text-right">{t('dashboard.encargo.hoursDetail.year')}</TableHead>
                <TableHead className="text-right">{t('dashboard.encargo.hoursDetail.week')}</TableHead>
                <TableHead className="text-right">{t('dashboard.encargo.hoursDetail.loadedHours')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(5)].map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    {t('dashboard.encargo.hoursDetail.noData')}
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {groupByCategory(filtered).flatMap(({ categoryName, rows, subtotal }) => [
                    ...rows.map((row, idx) => (
                      <TableRow key={`${row.staffId}_${row.year}_${row.weekNumber}_${idx}`} className="text-sm">
                        <TableCell className="py-2">{row.staffName}</TableCell>
                        <TableCell className="py-2">{row.categoryName}</TableCell>
                        <TableCell className="py-2 text-right font-mono">
                          {row.year !== null ? row.year : '—'}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono">
                          {row.weekNumber !== null ? row.weekNumber : '—'}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono">
                          {row.hoursLoaded.toFixed(1)}
                        </TableCell>
                      </TableRow>
                    )),
                    <TableRow key={`subtotal-${categoryName}`} className="bg-muted/40 font-semibold text-sm">
                      <TableCell className="py-2" />
                      <TableCell className="py-2">
                        {categoryName} — {t('dashboard.encargo.hoursDetail.subtotal')}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono">—</TableCell>
                      <TableCell className="py-2 text-right font-mono">—</TableCell>
                      <TableCell className="py-2 text-right font-mono">{subtotal.toFixed(1)}</TableCell>
                    </TableRow>,
                  ])}
                  <TableRow className="bg-muted/70 font-bold text-sm border-t-4 border-border">
                    <TableCell className="py-2" />
                    <TableCell className="py-2">
                      {t('dashboard.encargo.hoursDetail.grandTotal')}
                    </TableCell>
                    <TableCell className="py-2 text-right font-mono">—</TableCell>
                    <TableCell className="py-2 text-right font-mono">—</TableCell>
                    <TableCell className="py-2 text-right font-mono">
                      {filtered.reduce((s, r) => s + r.hoursLoaded, 0).toFixed(1)}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
