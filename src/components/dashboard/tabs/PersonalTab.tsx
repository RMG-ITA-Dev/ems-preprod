import { useTranslation } from "react-i18next";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useDashboard } from "@/contexts/DashboardContext";
import { RecentTimeEntries } from "@/components/dashboard/RecentTimeEntries";
import { TimesheetMap } from "@/components/dashboard/TimesheetMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Clock, Target, TrendingUp, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, parseISO, differenceInDays } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function PersonalTab() {
  const { t, i18n } = useTranslation();
  const { staffRecord, isLoading: staffLoading } = useCurrentStaff();
  const { startDateStr, endDateStr } = useDashboard();
  const dateLocale = i18n.language === 'es' ? es : enUS;

  // Fetch this week's time entries for the current staff
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

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

  // Fetch assigned engagements
  const { data: assignedEngagements } = useQuery({
    queryKey: ['personal-engagements', staffRecord?.staff_id, startDateStr, endDateStr],
    queryFn: async () => {
      if (!staffRecord?.staff_id) return [];
      
      // Get engagements where staff has logged time in the period
      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          engagement_id,
          hours_logged,
          engagement:engagements(
            engagement_id,
            engagement_code,
            engagement_name,
            status,
            client:clients(client_legal_name)
          )
        `)
        .eq('staff_id', staffRecord.staff_id)
        .gte('date_worked', startDateStr)
        .lte('date_worked', endDateStr);
      
      if (error) throw error;

      // Aggregate by engagement
      const engagementMap = new Map<string, { engagement: any; totalHours: number }>();
      data?.forEach(entry => {
        const engId = entry.engagement_id;
        if (!engagementMap.has(engId)) {
          engagementMap.set(engId, {
            engagement: entry.engagement,
            totalHours: 0
          });
        }
        engagementMap.get(engId)!.totalHours += Number(entry.hours_logged);
      });

      return Array.from(engagementMap.values())
        .sort((a, b) => b.totalHours - a.totalHours)
        .slice(0, 5);
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
  const hoursRemaining = Math.max(0, weeklyCapacity - weekHoursLogged);

  // Days until deadline (usually Monday for previous week)
  const deadline = timesheetPeriod?.deadline 
    ? parseISO(timesheetPeriod.deadline) 
    : new Date(weekEnd.getTime() + 24 * 60 * 60 * 1000); // Day after week end
  const daysUntilDeadline = differenceInDays(deadline, today);

  // Check if user can approve timesheets based on category
  const canApprove = (staffRecord?.category as any)?.can_approve_timesheets === true;

  // Transform entries for RecentTimeEntries component
  const recentEntriesFormatted = (weekTimeEntries || []).slice(0, 6).map(entry => ({
    id: entry.time_id,
    date: entry.date_worked,
    hours: Number(entry.hours_logged),
    engagement: (entry.engagement as any)?.engagement_code || '—',
    activity: (entry.activity as any)?.description || entry.description || '—',
  }));

  return (
    <div className="space-y-6">
      {/* Top Row: North Star Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Weekly Hours */}
        <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t('dashboard.personal.weeklyHours')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-foreground font-mono">{weekHoursLogged.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground mb-1">/ {weeklyCapacity}h</span>
            </div>
            <Progress 
              value={Math.min(utilizationPercent, 100)} 
              className="h-2 mt-3"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {hoursRemaining > 0 
                ? t('dashboard.personal.hoursRemaining', { hours: hoursRemaining.toFixed(1) })
                : t('dashboard.personal.capacityReached')
              }
            </p>
          </CardContent>
        </Card>

        {/* Utilization */}
        <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              {t('dashboard.personal.utilization')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className={cn(
                "text-3xl font-bold font-mono",
                utilizationPercent >= 80 ? "text-success" : 
                utilizationPercent >= 50 ? "text-warning" : "text-muted-foreground"
              )}>
                {utilizationPercent}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {utilizationPercent >= 80 ? t('dashboard.personal.onTrack') : 
               utilizationPercent >= 50 ? t('dashboard.personal.progressing') : 
               t('dashboard.personal.needsAttention')}
            </p>
          </CardContent>
        </Card>

        {/* Deadline */}
        <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {t('dashboard.personal.deadline')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className={cn(
                "text-3xl font-bold font-mono",
                daysUntilDeadline <= 1 ? "text-destructive" :
                daysUntilDeadline <= 3 ? "text-warning" : "text-foreground"
              )}>
                {daysUntilDeadline >= 0 ? daysUntilDeadline : 0}
              </span>
              <span className="text-sm text-muted-foreground mb-1">{t('dashboard.personal.days')}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {format(deadline, 'EEEE, d MMM', { locale: dateLocale })}
            </p>
          </CardContent>
        </Card>

        {/* Timesheet Status / Pending Approvals */}
        {canApprove && pendingApprovals && pendingApprovals > 0 ? (
          <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-warning/30 transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                {t('dashboard.personal.pendingApprovals')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-warning font-mono">{pendingApprovals}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {t('dashboard.personal.awaitingReview')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {t('dashboard.personal.timesheetStatus')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {timesheetPeriod?.submitted_at ? (
                  <span className="text-lg font-semibold text-success">{t('dashboard.personal.submitted')}</span>
                ) : (
                  <span className="text-lg font-semibold text-muted-foreground">{t('dashboard.personal.draft')}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                {t('dashboard.personal.weekOf', { 
                  date: format(weekStart, 'd MMM', { locale: dateLocale }) 
                })}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Timesheet Map - Compact, higher position */}
      {staffRecord?.staff_id && (
        <TimesheetMap staffId={staffRecord.staff_id} />
      )}

      {/* Middle Row: Engagements & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* My Engagements */}
        <Card className="bg-card/80 backdrop-blur-sm border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {t('dashboard.personal.myEngagements')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {assignedEngagements && assignedEngagements.length > 0 ? (
              assignedEngagements.map((item) => (
                <div 
                  key={item.engagement.engagement_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-primary">
                        {item.engagement.engagement_code || '—'}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.engagement.engagement_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.engagement.client?.client_legal_name || '—'}
                    </p>
                  </div>
                  <div className="text-right ml-3">
                    <span className="text-lg font-semibold text-foreground font-mono">
                      {item.totalHours.toFixed(1)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-1">h</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {t('dashboard.personal.noEngagements')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Time Entries */}
        <RecentTimeEntries entries={recentEntriesFormatted} />
      </div>
    </div>
  );
}
