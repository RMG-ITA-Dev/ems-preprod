import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDashboard } from '@/contexts/DashboardContext';
import { useCurrentStaff } from '@/hooks/useCurrentStaff';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Briefcase, TrendingUp, AlertTriangle, Clock, DollarSign, Users } from 'lucide-react';
import { Sparkline, SparklineDataPoint } from '@/components/dashboard/Sparkline';
import { format } from 'date-fns';
import {
  bucketHoursByWeek,
  getWeekRange,
  getWeekStamp,
} from '@/components/dashboard/weeklyHoursBucket';
import {
  aggregateHoursByPeriodAndEngagement,
  compositeKey,
} from '@/components/dashboard/pendingApprovalsAggregation';
import { hasItems } from '@/lib/queryHelpers';
import { parseDateLocal } from '@/lib/timesheetUtils';

interface EngagementWithMetrics {
  engagement_id: string;
  engagement_code: string;
  engagement_name: string;
  client_name: string;
  budget_hours: number;
  actual_hours: number;
  variance_hours: number;
  consumption_percent: number;
  standard_fee: number;
  realization_percent: number;
  status: 'on_track' | 'at_risk' | 'over_budget';
}

interface PendingApproval {
  approval_id: string;
  period_id: string;
  engagement_id: string;
  engagement_code: string;
  engagement_name: string;
  staff_name: string;
  week_start_date: string;
  hours: number;
}

export function CarteraTab() {
  const { t } = useTranslation();
  const { startDateStr, endDateStr, setActiveTab, setSelectedEngagementId } = useDashboard();
  const { staffRecord } = useCurrentStaff();

  // Fetch portfolio engagements where user is partner or manager
  const { data: portfolio, isLoading: loadingPortfolio } = useQuery({
    queryKey: ['portfolio-engagements', staffRecord?.staff_id, startDateStr, endDateStr],
    queryFn: async ({ signal }) => {
      if (!staffRecord?.staff_id) return [];

      // Get engagements where user is partner or manager
      const { data: engagements, error: engError } = await supabase
        .from('engagements')
        .select(`
          engagement_id,
          engagement_code,
          engagement_name,
          status,
          client:clients(client_legal_name)
        `)
        .or(`partner_id.eq.${staffRecord.staff_id},manager_id.eq.${staffRecord.staff_id}`)
        .eq('status', 'active')
        .abortSignal(signal);

      if (engError) throw engError;
      if (!hasItems(engagements)) return [];

      const engagementIds = engagements.map(e => e.engagement_id);

      // Get budget data from work_order_summary
      const { data: workOrders } = await supabase
        .from('work_order_summary')
        .select('engagement_id, total_standard_fee, realization_percent')
        .in('engagement_id', engagementIds)
        .abortSignal(signal);

      // Get budget hours by category
      const { data: budgetData } = await supabase
        .from('vw_wo_budget_hours_by_category')
        .select('engagement_id, total_budget_hours')
        .in('engagement_id', engagementIds)
        .abortSignal(signal);

      // Get actual hours from time_entries in period
      const { data: actualData } = await supabase
        .from('time_entries')
        .select('engagement_id, hours_logged')
        .in('engagement_id', engagementIds)
        .gte('date_worked', startDateStr)
        .lte('date_worked', endDateStr)
        .abortSignal(signal);

      // Aggregate data
      const budgetByEngagement = new Map<string, number>();
      budgetData?.forEach(b => {
        const current = budgetByEngagement.get(b.engagement_id!) || 0;
        budgetByEngagement.set(b.engagement_id!, current + (b.total_budget_hours || 0));
      });

      const actualByEngagement = new Map<string, number>();
      actualData?.forEach(a => {
        const current = actualByEngagement.get(a.engagement_id) || 0;
        actualByEngagement.set(a.engagement_id, current + a.hours_logged);
      });

      const woByEngagement = new Map(workOrders?.map(w => [w.engagement_id, w]) || []);

      const result: EngagementWithMetrics[] = engagements.map(eng => {
        const budget = budgetByEngagement.get(eng.engagement_id) || 0;
        const actual = actualByEngagement.get(eng.engagement_id) || 0;
        const variance = budget - actual;
        const consumption = budget > 0 ? (actual / budget) * 100 : 0;
        const wo = woByEngagement.get(eng.engagement_id);

        let status: 'on_track' | 'at_risk' | 'over_budget' = 'on_track';
        if (consumption > 100) status = 'over_budget';
        else if (consumption > 80) status = 'at_risk';

        return {
          engagement_id: eng.engagement_id,
          engagement_code: eng.engagement_code || '',
          engagement_name: eng.engagement_name,
          client_name: eng.client?.client_legal_name || '',
          budget_hours: budget,
          actual_hours: actual,
          variance_hours: variance,
          consumption_percent: consumption,
          standard_fee: wo?.total_standard_fee || 0,
          realization_percent: (wo?.realization_percent || 1) * 100,
          status,
        };
      });

      return result.sort((a, b) => b.consumption_percent - a.consumption_percent);
    },
    enabled: !!staffRecord?.staff_id,
  });

  // Fetch pending approvals for this manager
  const { data: pendingApprovals, isLoading: loadingApprovals } = useQuery({
    queryKey: ['pending-approvals', staffRecord?.staff_id],
    queryFn: async ({ signal }) => {
      if (!staffRecord?.staff_id) return [];

      // Get engagements where user is manager/partner
      const { data: myEngagements } = await supabase
        .from('engagements')
        .select('engagement_id, engagement_code, engagement_name')
        .or(`partner_id.eq.${staffRecord.staff_id},manager_id.eq.${staffRecord.staff_id}`)
        .abortSignal(signal);

      if (!hasItems(myEngagements)) return [];

      const engagementIds = myEngagements.map(e => e.engagement_id);
      const engMap = new Map(myEngagements.map(e => [e.engagement_id, e]));

      // Get pending line approvals
      const { data: approvals } = await supabase
        .from('timesheet_line_approvals')
        .select(`
          approval_id,
          period_id,
          engagement_id,
          period:timesheet_periods(
            week_start_date,
            staff:staff(first_name, last_name, short_name)
          )
        `)
        .in('engagement_id', engagementIds)
        .eq('status', 'pending')
        .abortSignal(signal);

      if (!hasItems(approvals)) return [];

      // Bulk-fetch all time entries for the unique (period, engagement) pairs in one round-trip.
      const periodIds = Array.from(new Set(approvals.map((a) => a.period_id)));
      const approvalEngagementIds = Array.from(
        new Set(approvals.map((a) => a.engagement_id)),
      );

      const { data: entries } = await supabase
        .from('time_entries')
        .select('period_id, engagement_id, hours_logged')
        .in('period_id', periodIds)
        .in('engagement_id', approvalEngagementIds)
        .abortSignal(signal);

      const hoursByPair = aggregateHoursByPeriodAndEngagement(entries ?? []);

      const result: PendingApproval[] = approvals.map((approval) => {
        const eng = engMap.get(approval.engagement_id);
        const period = approval.period as {
          week_start_date: string;
          staff: { first_name: string; last_name: string; short_name: string } | null;
        } | null;
        const staff = period?.staff;
        const totalHours =
          hoursByPair.get(compositeKey(approval.period_id, approval.engagement_id)) ?? 0;

        return {
          approval_id: approval.approval_id,
          period_id: approval.period_id,
          engagement_id: approval.engagement_id,
          engagement_code: eng?.engagement_code || '',
          engagement_name: eng?.engagement_name || '',
          staff_name: staff?.short_name || `${staff?.first_name} ${staff?.last_name}` || '',
          week_start_date: period?.week_start_date || '',
          hours: totalHours,
        };
      });

      return result;
    },
    enabled: !!staffRecord?.staff_id,
  });

  // Fetch weekly hours trend for sparkline (last 8 weeks, single range fetch)
  const { data: weeklyTrend } = useQuery({
    queryKey: ['cartera-weekly-trend', staffRecord?.staff_id, getWeekStamp()],
    queryFn: async ({ signal }): Promise<SparklineDataPoint[]> => {
      if (!staffRecord?.staff_id) return [];

      const today = new Date();

      // Get engagements where user is partner or manager
      const { data: engagements } = await supabase
        .from('engagements')
        .select('engagement_id')
        .or(`partner_id.eq.${staffRecord.staff_id},manager_id.eq.${staffRecord.staff_id}`)
        .eq('status', 'active')
        .abortSignal(signal);

      const engagementIds = engagements?.map((e) => e.engagement_id) ?? [];

      // Empty-array guard: skip the .in() round-trip; render flat 8-bucket sparkline.
      if (!hasItems(engagementIds)) {
        return bucketHoursByWeek([], today);
      }

      const { rangeStart, rangeEnd } = getWeekRange(today);

      const { data } = await supabase
        .from('time_entries')
        .select('date_worked, hours_logged')
        .in('engagement_id', engagementIds)
        .gte('date_worked', format(rangeStart, 'yyyy-MM-dd'))
        .lte('date_worked', format(rangeEnd, 'yyyy-MM-dd'))
        .abortSignal(signal);

      return bucketHoursByWeek(data ?? [], today);
    },
    enabled: !!staffRecord?.staff_id,
  });

  const handleDrillDown = (engagementId: string) => {
    setSelectedEngagementId(engagementId);
    setActiveTab('encargo');
  };

  // Calculate portfolio totals
  const totals = portfolio?.reduce(
    (acc, eng) => ({
      activeCount: acc.activeCount + 1,
      totalBudget: acc.totalBudget + eng.budget_hours,
      totalActual: acc.totalActual + eng.actual_hours,
      totalFees: acc.totalFees + eng.standard_fee,
    }),
    { activeCount: 0, totalBudget: 0, totalActual: 0, totalFees: 0 }
  ) || { activeCount: 0, totalBudget: 0, totalActual: 0, totalFees: 0 };

  const portfolioUtilization = totals.totalBudget > 0 
    ? (totals.totalActual / totals.totalBudget) * 100 
    : 0;

  const atRiskEngagements = portfolio?.filter(e => e.status !== 'on_track') || [];

  if (loadingPortfolio) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Briefcase className="h-3.5 w-3.5" />
              {t('dashboard.cartera.activeEngagements')}
            </div>
            <div className="text-2xl font-bold">{totals.activeCount}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              {t('dashboard.cartera.totalFees')}
            </div>
            <div className="text-2xl font-bold">
              {totals.totalFees.toLocaleString('es-BO', { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3.5 w-3.5" />
              {t('dashboard.cartera.totalHours')}
            </div>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">
                {totals.totalActual.toLocaleString('es-BO', { maximumFractionDigits: 1 })}
                <span className="text-sm text-muted-foreground font-normal ml-1">
                  / {totals.totalBudget.toLocaleString('es-BO', { maximumFractionDigits: 0 })}
                </span>
              </div>
              {weeklyTrend && weeklyTrend.length >= 2 && (
                <Sparkline data={weeklyTrend} color="primary" height={24} className="w-16" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/80 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              {t('dashboard.cartera.portfolioUtilization')}
            </div>
            <div className="text-2xl font-bold">
              <span className={portfolioUtilization > 100 ? 'text-destructive' : portfolioUtilization > 80 ? 'text-warning' : ''}>
                {portfolioUtilization.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profitability Table */}
        <Card className="lg:col-span-2 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t('dashboard.cartera.profitabilityTable')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {portfolio?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {t('dashboard.cartera.noEngagements')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="table-dense">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t('dashboard.cartera.engagement')}</TableHead>
                      <TableHead className="text-xs">{t('dashboard.cartera.client')}</TableHead>
                      <TableHead className="text-xs text-right">{t('dashboard.encargo.budgetHours')}</TableHead>
                      <TableHead className="text-xs text-right">{t('dashboard.encargo.actualHours')}</TableHead>
                      <TableHead className="text-xs text-center">{t('dashboard.cartera.consumption')}</TableHead>
                      <TableHead className="text-xs text-center">{t('common.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolio?.map((eng) => (
                      <TableRow 
                        key={eng.engagement_id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleDrillDown(eng.engagement_id)}
                      >
                        <TableCell className="text-xs font-medium">
                          {eng.engagement_code || eng.engagement_name}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                          {eng.client_name}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {eng.budget_hours.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {eng.actual_hours.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-2">
                            <Progress 
                              value={Math.min(eng.consumption_percent, 100)} 
                              className={`h-1.5 w-16 ${
                                eng.consumption_percent > 100 ? '[&>div]:bg-destructive' : 
                                eng.consumption_percent > 80 ? '[&>div]:bg-warning' : ''
                              }`}
                            />
                            <span className="font-mono w-12 text-right">
                              {eng.consumption_percent.toFixed(0)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            variant={
                              eng.status === 'over_budget' ? 'destructive' : 
                              eng.status === 'at_risk' ? 'secondary' : 
                              'default'
                            }
                            className="text-[10px] px-1.5"
                          >
                            {t(`dashboard.encargo.${eng.status === 'on_track' ? 'onTrack' : eng.status === 'at_risk' ? 'atRisk' : 'overBudget'}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Risks + Approvals */}
        <div className="space-y-6">
          {/* Risk List */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                {t('dashboard.cartera.topRisks')}
                {atRiskEngagements.length > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {atRiskEngagements.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {atRiskEngagements.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  {t('dashboard.cartera.noRisks')}
                </div>
              ) : (
                <div className="space-y-2">
                  {atRiskEngagements.slice(0, 5).map((eng) => (
                    <div 
                      key={eng.engagement_id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleDrillDown(eng.engagement_id)}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">
                          {eng.engagement_code || eng.engagement_name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {eng.client_name}
                        </div>
                      </div>
                      <Badge 
                        variant={eng.status === 'over_budget' ? 'destructive' : 'secondary'}
                        className="text-[10px] shrink-0 ml-2"
                      >
                        {eng.consumption_percent.toFixed(0)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Approval Queue */}
          <Card className="bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t('dashboard.cartera.approvalQueue')}
                {(pendingApprovals?.length || 0) > 0 && (
                  <Badge variant="default" className="ml-auto text-[10px]">
                    {pendingApprovals?.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingApprovals ? (
                <Skeleton className="h-20" />
              ) : pendingApprovals?.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  {t('dashboard.cartera.noApprovals')}
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingApprovals?.slice(0, 5).map((approval) => (
                    <div 
                      key={approval.approval_id}
                      className="flex items-center justify-between p-2 rounded-md bg-muted/30"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">
                          {approval.staff_name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {approval.engagement_code} · Sem {parseDateLocal(approval.week_start_date).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
                        </div>
                      </div>
                      <div className="text-xs font-mono shrink-0 ml-2">
                        {approval.hours.toFixed(1)}h
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
