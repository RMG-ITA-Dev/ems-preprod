import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDashboard } from "@/contexts/DashboardContext";
import { EngagementSelector } from "@/components/dashboard/EngagementSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  DollarSign,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Layers,
  FolderKanban,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StaffHoursDetailDialog } from "@/components/dashboard/StaffHoursDetailDialog";

interface EngagementDataWithWorkOrder {
  work_order?: {
    currency: "BOB" | "USD" | null;
  } | null;
}

export function EncargoTab() {
  const { t, i18n } = useTranslation();
  const { selectedEngagementId, startDateStr, endDateStr } = useDashboard();
  const [detailOpen, setDetailOpen] = useState(false);
  const locale = i18n.language === 'es' ? 'es-BO' : 'en-US';

  // Fetch engagement details with work order
  const { data: engagementData, isLoading: engagementLoading } = useQuery({
    queryKey: ['encargo-detail', selectedEngagementId],
    queryFn: async () => {
      if (!selectedEngagementId) return null;

      const { data, error } = await supabase
        .from('engagements')
        .select(`
          engagement_id,
          engagement_code,
          engagement_name,
          status,
          client:clients(client_legal_name),
          partner:staff!engagements_partner_id_fkey(short_name, first_name, last_name),
          manager:staff!engagements_manager_id_fkey(short_name, first_name, last_name),
          work_order:work_orders(
            wo_id,
            currency,
            season_mode,
            approval_status,
            adjustment_amount,
            tax_rate
          )
        `)
        .eq('engagement_id', selectedEngagementId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!selectedEngagementId,
  });

  // Fetch budget vs actual from the view
  const { data: budgetData, isLoading: budgetLoading } = useQuery({
    queryKey: ['encargo-budget', selectedEngagementId],
    queryFn: async () => {
      if (!selectedEngagementId) return null;

      const { data, error } = await supabase
        .from('vw_budget_vs_actual_hours_by_category_activity')
        .select('*')
        .eq('engagement_id', selectedEngagementId)
        .order('category_display_order')
        .order('activity_code');

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedEngagementId,
  });

  // Fetch work order summary for financial data
  const { data: woSummary, isLoading: woLoading } = useQuery({
    queryKey: ['encargo-wo-summary', selectedEngagementId],
    queryFn: async () => {
      if (!selectedEngagementId) return null;

      const { data, error } = await supabase
        .from('work_order_summary')
        .select('*')
        .eq('engagement_id', selectedEngagementId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    },
    enabled: !!selectedEngagementId,
  });

  // Fetch budget lines for category totals
  const { data: categoryBudget, isLoading: categoryLoading } = useQuery({
    queryKey: ['encargo-category-budget', selectedEngagementId],
    queryFn: async () => {
      if (!selectedEngagementId) return [];

      const { data, error } = await supabase
        .from('vw_wo_budget_hours_by_category')
        .select('*')
        .eq('engagement_id', selectedEngagementId)
        .order('category_display_order');

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedEngagementId,
  });

  // Fetch actual hours by category (aggregate from time_entries)
  const { data: actualByCategory, isLoading: actualLoading } = useQuery({
    queryKey: ['encargo-actual-category', selectedEngagementId, startDateStr, endDateStr],
    queryFn: async () => {
      if (!selectedEngagementId) return [];

      const { data, error } = await supabase
        .from('vw_actual_hours_by_category_activity')
        .select('*')
        .eq('engagement_id', selectedEngagementId);

      if (error) throw error;

      // Aggregate by category
      const categoryMap = new Map<string, { category_id: string; category_name: string; actual_hours: number; display_order: number }>();
      data?.forEach(row => {
        const key = row.category_id!;
        if (!categoryMap.has(key)) {
          categoryMap.set(key, {
            category_id: key,
            category_name: row.category_name || '',
            actual_hours: 0,
            display_order: row.category_display_order || 99
          });
        }
        categoryMap.get(key)!.actual_hours += Number(row.actual_hours || 0);
      });

      return Array.from(categoryMap.values()).sort((a, b) => a.display_order - b.display_order);
    },
    enabled: !!selectedEngagementId,
  });

  // BUG #35: Fetch hours by approval status using direct query
  const { data: hoursByStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['encargo-hours-by-status', selectedEngagementId],
    queryFn: async () => {
      if (!selectedEngagementId) return { approved: 0, pending: 0 };

      // Get time entries with their approval status
      const { data: entries, error: entriesError } = await supabase
        .from('time_entries')
        .select(`
          hours_logged,
          period_id
        `)
        .eq('engagement_id', selectedEngagementId)
        .eq('is_forecast', false);

      if (entriesError) throw entriesError;
      if (!entries || entries.length === 0) return { approved: 0, pending: 0 };

      // Get unique period IDs
      const periodIds = [...new Set(entries.filter(e => e.period_id).map(e => e.period_id!))] as string[];
      
      if (periodIds.length === 0) {
        // No periods = all pending
        const totalHours = entries.reduce((sum, e) => sum + Number(e.hours_logged), 0);
        return { approved: 0, pending: totalHours };
      }

      // Get line approvals for this engagement
      const { data: approvals, error: approvalsError } = await supabase
        .from('timesheet_line_approvals')
        .select('period_id, status')
        .eq('engagement_id', selectedEngagementId)
        .in('period_id', periodIds);

      if (approvalsError) throw approvalsError;

      // Map period_id to approval status
      const approvalMap = new Map<string, string>();
      approvals?.forEach(a => approvalMap.set(a.period_id, a.status));

      // Sum hours by status
      let approved = 0;
      let pending = 0;
      entries.forEach(entry => {
        const status = entry.period_id ? approvalMap.get(entry.period_id) : null;
        if (status === 'approved') {
          approved += Number(entry.hours_logged);
        } else {
          pending += Number(entry.hours_logged);
        }
      });

      return { approved, pending };
    },
    enabled: !!selectedEngagementId,
  });

  const isLoading = engagementLoading || budgetLoading || woLoading || categoryLoading || actualLoading || statusLoading;

  // Calculate totals
  const totalBudgetHours = categoryBudget?.reduce((sum, c) => sum + Number(c.total_budget_hours || 0), 0) || 0;
  const totalActualHours = actualByCategory?.reduce((sum, c) => sum + Number(c.actual_hours || 0), 0) || 0;
  const budgetConsumedPercent = totalBudgetHours > 0 ? Math.round((totalActualHours / totalBudgetHours) * 100) : 0;
  const varianceHours = totalBudgetHours - totalActualHours;

  const currency = (engagementData as EngagementDataWithWorkOrder | null)?.work_order?.currency || 'BOB';
  const agreedFee = woSummary?.fee_with_tax_gross_up || 0;
  const standardFee = woSummary?.total_standard_fee || 0;
  const realizationPercent = woSummary?.realization_percent || 100;
  const marginPercent = standardFee > 0 ? ((agreedFee - standardFee) / standardFee) * 100 : 0;

  // Format currency
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(amount));
  };

  // Merge category budget and actual
  const categoryBreakdown = categoryBudget?.map(budget => {
    const actual = actualByCategory?.find(a => a.category_id === budget.category_id);
    const budgetHours = Number(budget.total_budget_hours || 0);
    const actualHours = Number(actual?.actual_hours || 0);
    const variance = budgetHours - actualHours;
    const consumedPercent = budgetHours > 0 ? (actualHours / budgetHours) * 100 : 0;

    return {
      category_id: budget.category_id,
      category_name: budget.category_name,
      budget_hours: budgetHours,
      actual_hours: actualHours,
      variance,
      consumed_percent: consumedPercent
    };
  }) || [];

  // Activity breakdown (top 10 by hours)
  const activityBreakdown = budgetData
    ?.filter(a => Number(a.actual_hours || 0) > 0 || Number(a.budget_hours || 0) > 0)
    .sort((a, b) => Number(b.actual_hours || 0) - Number(a.actual_hours || 0))
    .slice(0, 10) || [];

  // Risk status
  const isAtRisk = budgetConsumedPercent > 80 || marginPercent < 0;
  const isOverBudget = budgetConsumedPercent > 100;

  if (!selectedEngagementId) {
    return (
      <div className="space-y-4">
        <EngagementSelector />
        <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-12 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground">{t('dashboard.encargo.selectEngagement')}</h3>
          <p className="text-muted-foreground mt-2">{t('dashboard.encargo.noSelection')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <EngagementSelector />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Engagement Selector */}
      <EngagementSelector />

      {/* Top Row: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Budget Hours */}
        <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t('dashboard.encargo.budgetHours')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-foreground font-mono">{totalBudgetHours.toFixed(0)}</span>
              <span className="text-sm text-muted-foreground mb-1">h</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t('dashboard.encargo.standardFee')}: {currency} {formatAmount(standardFee)}
            </p>
          </CardContent>
        </Card>

        {/* Actual Hours - BUG #35: Show approved vs pending breakdown */}
        <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              {t('dashboard.encargo.actualHours')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className={cn(
                "text-3xl font-bold font-mono",
                isOverBudget ? "text-destructive" : "text-foreground"
              )}>
                {totalActualHours.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground mb-1">h</span>
            </div>
            {/* Approved vs Pending breakdown */}
            <div className="flex gap-3 mt-2 text-xs">
              <span className="text-success flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {(hoursByStatus?.approved || 0).toFixed(1)}h {t('dashboard.encargo.approved')}
              </span>
              {(hoursByStatus?.pending || 0) > 0 && (
                <span className="text-warning flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {(hoursByStatus?.pending || 0).toFixed(1)}h {t('dashboard.encargo.pending')}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Realization */}
        <Card className="bg-card/80 backdrop-blur-sm border-border hover:shadow-lg hover:border-primary/30 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              {t('dashboard.encargo.realization')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className={cn(
                "text-3xl font-bold font-mono",
                realizationPercent >= 100 ? "text-success" : 
                realizationPercent >= 80 ? "text-foreground" : "text-warning"
              )}>
                {realizationPercent.toFixed(0)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t('dashboard.encargo.agreedFee')}: {currency} {formatAmount(agreedFee)}
            </p>
          </CardContent>
        </Card>

        {/* Status */}
        <Card className={cn(
          "bg-card/80 backdrop-blur-sm border-border hover:shadow-lg transition-all duration-300",
          isAtRisk ? "hover:border-warning/30" : "hover:border-success/30"
        )}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {isAtRisk ? (
                <AlertTriangle className="h-4 w-4 text-warning" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-success" />
              )}
              {t('dashboard.encargo.status')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className={cn(
                "text-lg font-semibold",
                isOverBudget ? "text-destructive" : 
                isAtRisk ? "text-warning" : "text-success"
              )}>
                {isOverBudget 
                  ? t('dashboard.encargo.overBudget')
                  : isAtRisk 
                    ? t('dashboard.encargo.atRisk')
                    : t('dashboard.encargo.onTrack')
                }
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {budgetConsumedPercent}% {t('dashboard.encargo.consumed')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget Consumption Progress */}
      <Card className="bg-card/80 backdrop-blur-sm border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            {t('dashboard.encargo.budgetConsumption')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress 
              value={Math.min(budgetConsumedPercent, 100)} 
              className={cn(
                "h-4 flex-1",
                isOverBudget ? "[&>div]:bg-destructive" : 
                budgetConsumedPercent > 80 ? "[&>div]:bg-warning" : ""
              )}
            />
            <span className={cn(
              "text-lg font-bold font-mono min-w-[60px] text-right",
              isOverBudget ? "text-destructive" : 
              budgetConsumedPercent > 80 ? "text-warning" : "text-foreground"
            )}>
              {budgetConsumedPercent}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{totalActualHours.toFixed(1)}h {t('dashboard.encargo.used')}</span>
            <span>{totalBudgetHours.toFixed(0)}h {t('dashboard.encargo.budgeted')}</span>
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout: Category & Activity Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category Breakdown */}
        <Card className="bg-card/80 backdrop-blur-sm border-border">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">
              {t('dashboard.encargo.categoryBreakdown')}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1 shrink-0"
              onClick={() => setDetailOpen(true)}
            >
              <Users className="h-3 w-3" />
              {t('dashboard.encargo.viewHoursDetail')}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">{t('category.name')}</TableHead>
                  <TableHead className="text-xs text-right">{t('dashboard.encargo.budget')}</TableHead>
                  <TableHead className="text-xs text-right">{t('dashboard.encargo.actual')}</TableHead>
                  <TableHead className="text-xs text-right">{t('dashboard.encargo.variance')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryBreakdown.length > 0 ? (
                  categoryBreakdown.map((cat) => (
                    <TableRow key={cat.category_id} className="text-sm">
                      <TableCell className="py-2">{cat.category_name}</TableCell>
                      <TableCell className="py-2 text-right font-mono">{cat.budget_hours.toFixed(0)}</TableCell>
                      <TableCell className="py-2 text-right font-mono">{cat.actual_hours.toFixed(1)}</TableCell>
                      <TableCell className={cn(
                        "py-2 text-right font-mono font-semibold",
                        cat.variance >= 0 ? "text-success" : "text-destructive"
                      )}>
                        {cat.variance >= 0 ? '+' : ''}{cat.variance.toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                      {t('dashboard.encargo.noData')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Activity Breakdown */}
        <Card className="bg-card/80 backdrop-blur-sm border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              {t('dashboard.encargo.activityBreakdown')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">{t('activity.code')}</TableHead>
                  <TableHead className="text-xs">{t('activity.description')}</TableHead>
                  <TableHead className="text-xs text-right">{t('workOrders.hours')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activityBreakdown.length > 0 ? (
                  activityBreakdown.map((act, idx) => (
                    <TableRow key={`${act.activity_id}-${idx}`} className="text-sm">
                      <TableCell className="py-2 font-medium text-primary">
                        {act.activity_code}
                      </TableCell>
                      <TableCell className="py-2 truncate max-w-[150px]">
                        {act.activity_description}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono">
                        {Number(act.actual_hours || 0).toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                      {t('dashboard.encargo.noData')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <StaffHoursDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        engagementId={selectedEngagementId}
        engagementCode={engagementData?.engagement_code ?? ''}
      />
    </div>
  );
}
