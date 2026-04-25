import { useTranslation } from "react-i18next";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { PendingHoursAlert } from "@/components/dashboard/PendingHoursAlert";
import { useDashboard } from "@/contexts/DashboardContext";
import { RecentTimeEntries } from "@/components/dashboard/RecentTimeEntries";
import { Sparkline, SparklineDataPoint } from "@/components/dashboard/Sparkline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock, Target, Calendar, CheckCircle2, AlertCircle, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, parseISO, differenceInDays, startOfMonth, endOfMonth } from "date-fns";
import {
  bucketHoursByWeek,
  getWeekRange,
  getWeekStamp,
} from "@/components/dashboard/weeklyHoursBucket";
import { es, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';

export function PersonalTab() {
  const { t, i18n } = useTranslation();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { startDateStr, endDateStr } = useDashboard();
  const dateLocale = i18n.language === 'es' ? es : enUS;

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  // Fetch this week's time entries
  const { data: weekTimeEntries, isLoading: entriesLoading } = useQuery({
    queryKey: ['personal-week-entries', staffRecord?.staff_id, format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return [];
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          time_id,
          date_worked,
          hours_logged,
          description,
          engagement:engagements(engagement_id, engagement_code, engagement_name),
          activity:activity_codes(activity_code, description)
        `)
        .eq('staff_id', staffRecord.staff_id)
        .gte('date_worked', format(weekStart, 'yyyy-MM-dd'))
        .lte('date_worked', format(weekEnd, 'yyyy-MM-dd'))
        .order('date_worked', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!staffRecord?.staff_id,
  });

  // Fetch last 8 weeks trend for sparkline (single range fetch)
  const { data: weeklyTrend } = useQuery({
    queryKey: ['personal-weekly-trend', staffRecord?.staff_id, getWeekStamp()],
    queryFn: async (): Promise<SparklineDataPoint[]> => {
      if (!staffRecord?.staff_id) return [];

      const { rangeStart, rangeEnd } = getWeekRange(today);

      const { data } = await supabase
        .from('time_entries')
        .select('date_worked, hours_logged')
        .eq('staff_id', staffRecord.staff_id)
        .gte('date_worked', format(rangeStart, 'yyyy-MM-dd'))
        .lte('date_worked', format(rangeEnd, 'yyyy-MM-dd'));

      return bucketHoursByWeek(data ?? [], today);
    },
    enabled: !!staffRecord?.staff_id,
  });

  // Fetch this month's hours
  const { data: monthHours } = useQuery({
    queryKey: ['personal-month-hours', staffRecord?.staff_id, format(monthStart, 'yyyy-MM')],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return 0;
      const { data, error } = await supabase
        .from('time_entries')
        .select('hours_logged')
        .eq('staff_id', staffRecord.staff_id)
        .gte('date_worked', format(monthStart, 'yyyy-MM-dd'))
        .lte('date_worked', format(monthEnd, 'yyyy-MM-dd'));
      
      if (error) throw error;
      return data?.reduce((sum, e) => sum + Number(e.hours_logged), 0) || 0;
    },
    enabled: !!staffRecord?.staff_id,
  });

  // Fetch pending approvals count (if user can approve)
  const { data: pendingApprovals } = useQuery({
    queryKey: ['personal-pending-approvals', staffRecord?.staff_id],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return 0;
      const { count, error } = await supabase
        .from('timesheet_line_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!staffRecord?.staff_id,
  });

  // Fetch hours by engagement for the selected period
  const { data: engagementHours } = useQuery({
    queryKey: ['personal-engagement-hours', staffRecord?.staff_id, startDateStr, endDateStr],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return [];
      
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          engagement_id,
          hours_logged,
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name
          )
        `)
        .eq('staff_id', staffRecord.staff_id)
        .gte('date_worked', startDateStr)
        .lte('date_worked', endDateStr);
      
      if (error) throw error;

      // Aggregate by engagement
      const engagementMap = new Map<string, { code: string; name: string; hours: number }>();
      data?.forEach(entry => {
        const eng = entry.engagement as any;
        if (!eng) return;
        const engId = entry.engagement_id;
        if (!engagementMap.has(engId)) {
          engagementMap.set(engId, {
            code: eng.engagement_code || '—',
            name: eng.engagement_name || '—',
            hours: 0
          });
        }
        engagementMap.get(engId)!.hours += Number(entry.hours_logged);
      });

      return Array.from(engagementMap.values())
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 7);
    },
    enabled: !!staffRecord?.staff_id,
  });

  // Fetch timesheet status for current week
  const { data: timesheetPeriod } = useQuery({
    queryKey: ['personal-timesheet-period', staffRecord?.staff_id, format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return null;
      const { data, error } = await supabase
        .from('timesheet_periods')
        .select('*')
        .eq('staff_id', staffRecord.staff_id)
        .eq('week_start_date', format(weekStart, 'yyyy-MM-dd'))
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!staffRecord?.staff_id,
  });

  if (staffLoading || entriesLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-xl" />
        ))}
      </div>
    );
  }

  // Calculate metrics
  const weeklyCapacity = 40;
  const weekHoursLogged = weekTimeEntries?.reduce((sum, e) => sum + Number(e.hours_logged), 0) || 0;
  const utilizationPercent = Math.round((weekHoursLogged / weeklyCapacity) * 100);

  // Days until deadline
  const deadline = timesheetPeriod?.deadline 
    ? parseISO(timesheetPeriod.deadline) 
    : new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000);
  const daysUntilDeadline = differenceInDays(deadline, today);

  // Check if user can approve timesheets
  const canApprove = (staffRecord?.category as any)?.can_approve_timesheets === true;

  // Transform entries for RecentTimeEntries component
  const recentEntriesFormatted = (weekTimeEntries || []).slice(0, 6).map(entry => ({
    id: entry.time_id,
    date: entry.date_worked,
    hours: Number(entry.hours_logged),
    engagement: (entry.engagement as any)?.engagement_code || '—',
    activity: (entry.activity as any)?.description || entry.description || '—',
  }));

  // Bar chart colors
  const barColors = [
    'hsl(var(--primary))',
    'hsl(var(--info))',
    'hsl(var(--success))',
    'hsl(var(--warning))',
    'hsl(var(--accent))',
    'hsl(var(--muted-foreground))',
    'hsl(var(--secondary))',
  ];

  return (
    <div className="space-y-4">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Esta Semana */}
        <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t('dashboard.personal.thisWeek')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-end justify-between">
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold text-foreground font-mono">{weekHoursLogged.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground mb-1">/ {weeklyCapacity}h</span>
              </div>
              <span className={cn(
                "text-sm font-semibold font-mono",
                utilizationPercent >= 80 ? "text-success" : 
                utilizationPercent >= 50 ? "text-warning" : "text-muted-foreground"
              )}>
                {utilizationPercent}%
              </span>
            </div>
            <Progress value={Math.min(utilizationPercent, 100)} className="h-1.5" />
            {weeklyTrend && weeklyTrend.length > 1 && (
              <Sparkline data={weeklyTrend} color={utilizationPercent >= 80 ? 'success' : 'primary'} height={24} />
            )}
          </CardContent>
        </Card>

        {/* Este Mes */}
        <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              {t('dashboard.personal.thisMonth')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold text-foreground font-mono">{(monthHours || 0).toFixed(1)}</span>
              <span className="text-xs text-muted-foreground mb-1">h</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {format(monthStart, 'MMMM yyyy', { locale: dateLocale })}
            </p>
          </CardContent>
        </Card>

        {/* Deadline */}
        <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {t('dashboard.personal.deadline')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1">
              <span className={cn(
                "text-2xl font-bold font-mono",
                daysUntilDeadline <= 1 ? "text-destructive" :
                daysUntilDeadline <= 3 ? "text-warning" : "text-foreground"
              )}>
                {daysUntilDeadline === 0 ? t('dashboard.personal.today') : 
                 daysUntilDeadline < 0 ? t('dashboard.personal.overdue') :
                 daysUntilDeadline}
              </span>
              {daysUntilDeadline > 0 && (
                <span className="text-xs text-muted-foreground mb-1">{t('dashboard.personal.days')}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {format(deadline, 'EEEE, d MMM', { locale: dateLocale })}
            </p>
          </CardContent>
        </Card>

        {/* Timesheet Status / Pending Approvals */}
        {canApprove && pendingApprovals && pendingApprovals > 0 ? (
          <Card className="bg-card/80 backdrop-blur-sm border-warning/20 hover:shadow-lg hover:border-warning/40 transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                {t('dashboard.personal.pendingApprovals')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold text-warning font-mono">{pendingApprovals}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('dashboard.personal.awaitingReview')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {t('dashboard.personal.timesheetStatus')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {timesheetPeriod?.submitted_at ? (
                <span className="text-lg font-semibold text-success">{t('dashboard.personal.submitted')}</span>
              ) : (
                <span className="text-lg font-semibold text-muted-foreground">{t('dashboard.personal.draft')}</span>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {t('dashboard.personal.weekOf', { 
                  date: format(weekStart, 'd MMM', { locale: dateLocale }) 
                })}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pending Hours Alert */}
      <PendingHoursAlert />

      {/* Row 2: Charts and Recent Entries */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Hours by Engagement - Bar Chart */}
        <Card className="lg:col-span-2 bg-card/80 backdrop-blur-sm border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              {t('dashboard.personal.hoursByEngagement')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {engagementHours && engagementHours.length > 0 ? (
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    layout="vertical" 
                    data={engagementHours}
                    margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="code" 
                      width={80}
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(1)}h`, 'Horas']}
                      labelFormatter={(label) => {
                        const eng = engagementHours?.find(e => e.code === label);
                        return eng?.name || label;
                      }}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px'
                      }}
                    />
                    <Bar 
                      dataKey="hours" 
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                    >
                      {engagementHours.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[240px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">{t('dashboard.personal.noEngagements')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Time Entries */}
        <RecentTimeEntries entries={recentEntriesFormatted} />
      </div>
    </div>
  );
}
