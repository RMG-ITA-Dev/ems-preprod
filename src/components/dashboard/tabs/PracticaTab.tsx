import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  Users, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle,
  Trophy,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline, SparklineDataPoint } from "@/components/dashboard/Sparkline";
import { format } from 'date-fns';
import {
  bucketHoursByWeek,
  getWeekRange,
  getWeekStamp,
} from "@/components/dashboard/weeklyHoursBucket";
import {
  aggregatePartnerLeaderboard,
  type PartnerMetrics,
  type LeaderboardEngagementRow,
  type LeaderboardTimeEntryRow,
  type LeaderboardWorkOrderRow,
  type LeaderboardBudgetRow,
} from "./practicaLeaderboard";

interface PracticeMetrics {
  totalActiveEngagements: number;
  totalBudgetHours: number;
  totalActualHours: number;
  totalStandardFees: number;
  totalAdjustedFees: number;
  utilizationPercent: number;
  atRiskEngagements: number;
  overBudgetEngagements: number;
  pendingApprovals: number;
}

export function PracticaTab() {
  const { t } = useTranslation();
  const { startDateStr, endDateStr, setActiveTab, setSelectedEngagementId } = useDashboard();

  const handleDrillDown = (engagementId: string) => {
    setSelectedEngagementId(engagementId);
    setActiveTab('encargo');
  };

  // Fetch practice-wide metrics
  const { data: practiceMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['practice-metrics', startDateStr, endDateStr],
    queryFn: async (): Promise<PracticeMetrics> => {
      // Get all active engagements with work orders
      const { data: engagements } = await supabase
        .from('engagements')
        .select(`
          engagement_id,
          status
        `)
        .eq('status', 'active');

      const engagementIds = engagements?.map(e => e.engagement_id) || [];

      // Get work order summaries
      const { data: woSummaries } = await supabase
        .from('work_order_summary')
        .select('total_standard_fee, adjustment_amount')
        .in('engagement_id', engagementIds);

      // Get budget hours by engagement
      const { data: budgetData } = await supabase
        .from('vw_wo_budget_hours_by_category')
        .select('engagement_id, total_budget_hours')
        .in('engagement_id', engagementIds);

      // Get actual hours in period
      const { data: timeEntries } = await supabase
        .from('time_entries')
        .select('engagement_id, hours_logged')
        .in('engagement_id', engagementIds)
        .gte('date_worked', startDateStr)
        .lte('date_worked', endDateStr);

      // Get pending approvals count
      const { count: pendingCount } = await supabase
        .from('timesheet_line_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // Aggregate budget hours by engagement
      const budgetByEngagement = new Map<string, number>();
      budgetData?.forEach(b => {
        const current = budgetByEngagement.get(b.engagement_id!) || 0;
        budgetByEngagement.set(b.engagement_id!, current + Number(b.total_budget_hours || 0));
      });

      // Aggregate actual hours by engagement
      const actualByEngagement = new Map<string, number>();
      timeEntries?.forEach(te => {
        const current = actualByEngagement.get(te.engagement_id) || 0;
        actualByEngagement.set(te.engagement_id, current + Number(te.hours_logged || 0));
      });

      // Calculate totals and risk counts
      let totalBudgetHours = 0;
      let totalActualHours = 0;
      let totalStandardFees = 0;
      let totalAdjustedFees = 0;
      let atRiskCount = 0;
      let overBudgetCount = 0;

      engagementIds.forEach(engId => {
        const budget = budgetByEngagement.get(engId) || 0;
        const actual = actualByEngagement.get(engId) || 0;
        totalBudgetHours += budget;
        totalActualHours += actual;

        const consumption = budget > 0 ? (actual / budget) * 100 : 0;
        if (consumption > 100) overBudgetCount++;
        else if (consumption > 80) atRiskCount++;
      });

      woSummaries?.forEach(wo => {
        totalStandardFees += Number(wo.total_standard_fee || 0);
        const adjustedFee = Number(wo.total_standard_fee || 0) + Number(wo.adjustment_amount || 0);
        totalAdjustedFees += adjustedFee;
      });

      const utilizationPercent = totalBudgetHours > 0 
        ? (totalActualHours / totalBudgetHours) * 100 
        : 0;

      return {
        totalActiveEngagements: engagementIds.length,
        totalBudgetHours,
        totalActualHours,
        totalStandardFees,
        totalAdjustedFees,
        utilizationPercent,
        atRiskEngagements: atRiskCount,
        overBudgetEngagements: overBudgetCount,
        pendingApprovals: pendingCount || 0,
      };
    },
  });

  // Fetch partner leaderboard
  const { data: partnerLeaderboard, isLoading: leaderboardLoading } = useQuery({
    queryKey: ['partner-leaderboard', startDateStr, endDateStr],
    queryFn: async (): Promise<PartnerMetrics[]> => {
      const { data: partners } = await supabase
        .from('staff')
        .select(`
          staff_id,
          first_name,
          last_name,
          short_name,
          initials,
          category:categories!inner(display_order)
        `)
        .lte('categories.display_order', 2)
        .eq('is_active', true);

      if (!partners?.length) return [];

      const partnerIds = partners.map((p) => p.staff_id);

      const { data: engagementRows } = await supabase
        .from('engagements')
        .select('engagement_id, partner_id')
        .in('partner_id', partnerIds)
        .eq('status', 'active');

      const engagements: LeaderboardEngagementRow[] = (engagementRows ?? [])
        .filter((e): e is { engagement_id: string; partner_id: string } => !!e.partner_id)
        .map((e) => ({ engagement_id: e.engagement_id, partner_id: e.partner_id }));

      const engagementIds = engagements.map((e) => e.engagement_id);

      // Empty-array guard: no active engagements means every partner row is zeroed.
      if (engagementIds.length === 0) {
        return aggregatePartnerLeaderboard({
          partners,
          engagements: [],
          timeEntries: [],
          workOrders: [],
          budgets: [],
        });
      }

      const [timeRes, woRes, budgetRes] = await Promise.all([
        supabase
          .from('time_entries')
          .select('engagement_id, hours_logged')
          .in('engagement_id', engagementIds)
          .gte('date_worked', startDateStr)
          .lte('date_worked', endDateStr),
        supabase
          .from('work_order_summary')
          .select('engagement_id, total_standard_fee, adjustment_amount')
          .in('engagement_id', engagementIds),
        supabase
          .from('vw_wo_budget_hours_by_category')
          .select('engagement_id, total_budget_hours')
          .in('engagement_id', engagementIds),
      ]);

      const timeEntries: LeaderboardTimeEntryRow[] = (timeRes.data ?? []).map((t) => ({
        engagement_id: t.engagement_id,
        hours_logged: t.hours_logged,
      }));
      const workOrders: LeaderboardWorkOrderRow[] = (woRes.data ?? [])
        .filter((w): w is { engagement_id: string; total_standard_fee: number | null; adjustment_amount: number | null } => !!w.engagement_id)
        .map((w) => ({
          engagement_id: w.engagement_id,
          total_standard_fee: w.total_standard_fee,
          adjustment_amount: w.adjustment_amount,
        }));
      const budgets: LeaderboardBudgetRow[] = (budgetRes.data ?? [])
        .filter((b): b is { engagement_id: string; total_budget_hours: number | null } => !!b.engagement_id)
        .map((b) => ({
          engagement_id: b.engagement_id,
          total_budget_hours: b.total_budget_hours,
        }));

      return aggregatePartnerLeaderboard({
        partners,
        engagements,
        timeEntries,
        workOrders,
        budgets,
      });
    },
  });

  // Fetch weekly hours trend for sparkline (last 8 weeks, single range fetch)
  const { data: weeklyTrend } = useQuery({
    queryKey: ['practica-weekly-trend', getWeekStamp()],
    queryFn: async (): Promise<SparklineDataPoint[]> => {
      const today = new Date();
      const { rangeStart, rangeEnd } = getWeekRange(today);

      const { data } = await supabase
        .from('time_entries')
        .select('date_worked, hours_logged')
        .gte('date_worked', format(rangeStart, 'yyyy-MM-dd'))
        .lte('date_worked', format(rangeEnd, 'yyyy-MM-dd'));

      return bucketHoursByWeek(data ?? [], today);
    },
  });

  const isLoading = metricsLoading || leaderboardLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card/50 backdrop-blur-sm border-border">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="bg-card/50 backdrop-blur-sm border-border">
            <CardContent className="p-4">
              <Skeleton className="h-6 w-40 mb-4" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur-sm border-border">
            <CardContent className="p-4">
              <Skeleton className="h-6 w-40 mb-4" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const metrics = practiceMetrics || {
    totalActiveEngagements: 0,
    totalBudgetHours: 0,
    totalActualHours: 0,
    totalStandardFees: 0,
    totalAdjustedFees: 0,
    utilizationPercent: 0,
    atRiskEngagements: 0,
    overBudgetEngagements: 0,
    pendingApprovals: 0,
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Building2 className="h-3.5 w-3.5" />
              {t('dashboard.practica.activeEngagements')}
            </div>
            <p className="text-2xl font-semibold font-mono">
              {metrics.totalActiveEngagements}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              {t('dashboard.practica.totalFees')}
            </div>
            <p className="text-2xl font-semibold font-mono">
              {Math.round(metrics.totalAdjustedFees).toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3.5 w-3.5" />
              {t('dashboard.practica.totalHours')}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-2xl font-semibold font-mono">
                {metrics.totalActualHours.toFixed(1)}
                <span className="text-sm text-muted-foreground ml-1">
                  / {metrics.totalBudgetHours.toFixed(0)}
                </span>
              </p>
              {weeklyTrend && weeklyTrend.length >= 2 && (
                <Sparkline data={weeklyTrend} color="primary" height={24} className="w-16" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              {t('dashboard.practica.utilization')}
            </div>
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-2xl font-semibold font-mono",
                metrics.utilizationPercent > 100 && "text-destructive",
                metrics.utilizationPercent > 80 && metrics.utilizationPercent <= 100 && "text-warning"
              )}>
                {metrics.utilizationPercent.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Summary */}
      <div className="grid gap-4 grid-cols-3">
        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-warning/10">
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('dashboard.practica.atRisk')}</p>
              <p className="text-xl font-semibold font-mono">{metrics.atRiskEngagements}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-destructive/10">
              <Target className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('dashboard.practica.overBudget')}</p>
              <p className="text-xl font-semibold font-mono">{metrics.overBudgetEngagements}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10">
              <Users className="h-5 w-5 text-info" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('dashboard.practica.pendingApprovals')}</p>
              <p className="text-xl font-semibold font-mono">{metrics.pendingApprovals}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Partner Leaderboard */}
      <Card className="bg-card/50 backdrop-blur-sm border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            {t('dashboard.practica.partnerLeaderboard')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">{t('common.partner')}</th>
                  <th className="text-right p-3 font-medium">{t('dashboard.practica.engagements')}</th>
                  <th className="text-right p-3 font-medium">{t('dashboard.encargo.actualHours')}</th>
                  <th className="text-right p-3 font-medium">{t('dashboard.cartera.totalFees')}</th>
                  <th className="text-center p-3 font-medium">{t('dashboard.practica.atRisk')}</th>
                  <th className="text-center p-3 font-medium">{t('dashboard.practica.overBudget')}</th>
                </tr>
              </thead>
              <tbody>
                {partnerLeaderboard?.map((partner, index) => (
                  <tr 
                    key={partner.staffId} 
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="p-3">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                        index === 0 && "bg-warning/20 text-warning",
                        index === 1 && "bg-muted text-muted-foreground",
                        index === 2 && "bg-orange-500/20 text-orange-500 dark:text-orange-400",
                        index > 2 && "bg-muted/50 text-muted-foreground"
                      )}>
                        {index + 1}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                          {partner.initials}
                        </div>
                        <span className="font-medium">{partner.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono">{partner.engagementCount}</td>
                    <td className="p-3 text-right font-mono">{partner.totalHours.toFixed(1)}</td>
                    <td className="p-3 text-right font-mono">{Math.round(partner.totalFees).toLocaleString()}</td>
                    <td className="p-3 text-center">
                      {partner.atRiskCount > 0 ? (
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                          {partner.atRiskCount}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                          0
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {partner.overBudgetCount > 0 ? (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                          {partner.overBudgetCount}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                          0
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {(!partnerLeaderboard || partnerLeaderboard.length === 0) && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      {t('common.noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
