import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FundRequestExpenseStatusBadge } from "@/components/fund-requests/FundRequestExpenseStatusBadge";
import {
  useWorkOrderExpenseDetail,
  type WorkOrderBudgetLine,
  type WorkOrderExpense,
} from "@/hooks/useWorkOrderExpenses";
import {
  budgetUsage,
  distinctOptions,
  downloadWorkOrderReportXlsx,
  filterWorkOrderExpenses,
  groupExpensesByRequest,
  workOrderExpenseTotals,
  type WorkOrderExpenseFilters,
} from "@/lib/workOrderExpenses";
import { formatDateDMY } from "@/lib/fundRequestCalendar";
import { cn } from "@/lib/utils";

const money = (n: number) =>
  Number(n).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Valor centinela de los Select: shadcn no admite "" como valor de un ítem.
const ALL = "__all__";

/**
 * Detalle de gastos de UNA OT (docs/plan-contabilidad-gastos.md, Fase 5): lista plana de los
 * gastos enviados de todas sus solicitudes, con la opción de agruparlos por solicitud; filtros
 * por período, solicitante, tipo y estado; totales (asignado / gastado / en proceso / diferencia)
 * y presupuesto vs gastado por tipo. Export a Excel. Solo Contabilidad.
 */
const FundRequestWorkOrderExpenses = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { woId } = useParams<{ woId: string }>();
  const { data: detail, isLoading } = useWorkOrderExpenseDetail(woId);

  const [filters, setFilters] = useState<WorkOrderExpenseFilters>({});
  const [grouped, setGrouped] = useState(false);

  const expenses = useMemo(() => detail?.expenses ?? [], [detail]);
  const filtered = useMemo(() => filterWorkOrderExpenses(expenses, filters), [expenses, filters]);
  const filteredTotals = useMemo(() => workOrderExpenseTotals(filtered), [filtered]);
  const groups = useMemo(() => groupExpensesByRequest(filtered), [filtered]);
  const requesterOptions = useMemo(
    () => distinctOptions(expenses, (e) => e.requester_staff_id, (e) => e.requester_name),
    [expenses],
  );
  const typeOptions = useMemo(
    () => distinctOptions(expenses, (e) => e.expense_type_id, (e) => e.expense_type_name),
    [expenses],
  );
  const statusOptions = useMemo(
    () =>
      [...new Set(expenses.map((e) => e.status))].map((s) => ({
        value: s,
        label: t(`fundRequestExpense.status.${s}`),
      })),
    [expenses, t],
  );

  const setFilter = (patch: Partial<WorkOrderExpenseFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));

  const title = detail?.work_order
    ? `${t("workOrderExpenses.title")} — ${detail.work_order.engagement_code ?? ""}`
    : t("workOrderExpenses.title");

  const handleExport = async () => {
    if (!detail) return;
    try {
      await downloadWorkOrderReportXlsx(
        detail,
        filtered,
        {
          title: t("workOrderExpenses.title"),
          sheetName: t("workOrderExpenses.report.sheetName"),
          summary: {
            assigned: t("workOrderExpenses.assigned"),
            spent: t("workOrderExpenses.spent"),
            inProcess: t("workOrderExpenses.inProcess"),
            difference: t("workOrderExpenses.difference"),
            budget: t("workOrderExpenses.budget"),
          },
          budget: {
            section: t("workOrderExpenses.budgetSection"),
            type: t("fundRequestExpense.expenseType"),
            budgeted: t("workOrderExpenses.budget"),
            spent: t("workOrderExpenses.spent"),
            inProcess: t("workOrderExpenses.inProcess"),
            usage: t("workOrderExpenses.usage"),
          },
          detail: {
            section: t("workOrderExpenses.expensesSection"),
            date: t("fundRequestExpense.expenseDate"),
            request: t("workOrderExpenses.request"),
            requester: t("fundRequest.requester"),
            type: t("fundRequestExpense.expenseType"),
            description: t("fundRequestExpense.description"),
            document: t("fundRequestExpense.documentNumber"),
            amount: t("fundRequestExpense.amount"),
            status: t("common.status"),
          },
          noType: t("workOrderExpenses.noType"),
          statusLabel: (s) => t(`fundRequestExpense.status.${s}`),
        },
        `${t("workOrderExpenses.report.filenamePrefix")}_${(detail.work_order?.engagement_code ?? "OT").replace(/[^a-zA-Z0-9._-]+/g, "_")}.xlsx`,
      );
    } catch {
      toast.error(t("fundRequestExpense.report.exportError"));
    }
  };

  const expenseColumns: Column<WorkOrderExpense>[] = [
    {
      key: "expense_date",
      label: t("fundRequestExpense.expenseDate"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => formatDateDMY(row.expense_date),
    },
    {
      key: "request_number",
      label: t("workOrderExpenses.request"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => <span className="font-mono text-xs">{row.request_number ?? "-"}</span>,
    },
    {
      key: "requester_name",
      label: t("fundRequest.requester"),
      sortable: true,
      mobilePriority: "secondary",
    },
    {
      key: "expense_type_name",
      label: t("fundRequestExpense.expenseType"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => row.expense_type_name ?? t("workOrderExpenses.noType"),
    },
    {
      key: "description",
      label: t("fundRequestExpense.description"),
      mobilePriority: "secondary",
      render: (row) => (
        <span className="text-muted-foreground line-clamp-1">{row.description || "-"}</span>
      ),
    },
    {
      key: "amount",
      label: `${t("fundRequestExpense.amount")} (BOB)`,
      sortable: true,
      mobilePriority: "primary",
      className: "text-right",
      render: (row) => <span className="font-mono">{money(row.amount)}</span>,
    },
    {
      key: "status",
      label: t("common.status"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => <FundRequestExpenseStatusBadge status={row.status} />,
    },
  ];

  const budgetColumns: Column<WorkOrderBudgetLine>[] = [
    {
      key: "expense_type_name",
      label: t("fundRequestExpense.expenseType"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => row.expense_type_name ?? t("workOrderExpenses.noType"),
    },
    {
      key: "budgeted",
      label: `${t("workOrderExpenses.budget")} (BOB)`,
      sortable: true,
      mobilePriority: "primary",
      className: "text-right",
      render: (row) => <span className="font-mono">{money(row.budgeted)}</span>,
    },
    {
      key: "spent",
      label: `${t("workOrderExpenses.spent")} (BOB)`,
      sortable: true,
      mobilePriority: "primary",
      className: "text-right",
      render: (row) => <span className="font-mono">{money(row.spent)}</span>,
    },
    {
      key: "in_process",
      label: `${t("workOrderExpenses.inProcess")} (BOB)`,
      sortable: true,
      mobilePriority: "secondary",
      className: "text-right",
      render: (row) => <span className="font-mono text-muted-foreground">{money(row.in_process)}</span>,
    },
    {
      key: "usage",
      label: t("workOrderExpenses.usage"),
      mobilePriority: "secondary",
      className: "text-right",
      render: (row) => {
        const usage = budgetUsage(Number(row.spent), Number(row.budgeted));
        return usage === null ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className={cn("font-mono", usage > 100 && "text-destructive")}>{usage}%</span>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <AppLayout title={t("workOrderExpenses.title")} focusMode>
        <Skeleton className="h-64 w-full" />
      </AppLayout>
    );
  }

  if (!detail?.work_order) {
    return (
      <AppLayout title={t("workOrderExpenses.title")} focusMode>
        <div className="text-center py-12 text-muted-foreground">{t("common.noResults")}</div>
      </AppLayout>
    );
  }

  const totals = detail.totals;
  const difference = Number(totals.assigned) - Number(totals.spent);
  const usage = budgetUsage(Number(totals.spent), Number(totals.budget));

  return (
    <AppLayout title={title} focusMode>
      <div className="space-y-6">
        {/* OT + totales */}
        <Card className="bg-muted/30">
          <CardContent className="py-4 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="font-semibold">
                  <span className="font-mono">{detail.work_order.engagement_code}</span>{" "}
                  {detail.work_order.engagement_name}
                </p>
                {detail.work_order.client_name && (
                  <p className="text-sm text-muted-foreground">{detail.work_order.client_name}</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <Button variant="cancel" onClick={() => navigate(-1)}>
                  {t("common.back")}
                </Button>
                <Button variant="outline" onClick={handleExport} disabled={filtered.length === 0}>
                  <Download className="h-4 w-4 mr-1" />
                  {t("fundRequestExpense.report.exportButton")}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
              {[
                { label: t("workOrderExpenses.assigned"), value: Number(totals.assigned) },
                { label: t("workOrderExpenses.spent"), value: Number(totals.spent) },
                { label: t("workOrderExpenses.inProcess"), value: Number(totals.in_process), muted: true },
                { label: t("workOrderExpenses.difference"), value: difference, negative: difference < 0 },
                { label: t("workOrderExpenses.budget"), value: Number(totals.budget), usage },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-muted-foreground">{item.label}</p>
                  <p
                    className={cn(
                      "font-mono font-semibold",
                      item.muted && "text-muted-foreground",
                      item.negative && "text-destructive",
                    )}
                  >
                    {money(item.value)} BOB
                    {item.usage !== undefined && item.usage !== null && (
                      <span className={cn("ml-2 text-xs", item.usage > 100 && "text-destructive")}>
                        {item.usage}%
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Presupuesto vs gastado por tipo */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium">{t("workOrderExpenses.budgetSection")}</h2>
          <DataTable
            data={detail.budget_by_type}
            columns={budgetColumns}
            searchKeys={["expense_type_name"]}
            getRowId={(row) => row.expense_type_id ?? "sin-tipo"}
          />
        </div>

        {/* Gastos */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium">{t("workOrderExpenses.expensesSection")}</h2>
          <Card>
            <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <div className="space-y-1">
                <Label htmlFor="wo-from">{t("workOrderExpenses.filters.from")}</Label>
                <Input
                  id="wo-from"
                  type="date"
                  value={filters.from ?? ""}
                  onChange={(e) => setFilter({ from: e.target.value || undefined })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wo-to">{t("workOrderExpenses.filters.to")}</Label>
                <Input
                  id="wo-to"
                  type="date"
                  value={filters.to ?? ""}
                  onChange={(e) => setFilter({ to: e.target.value || undefined })}
                />
              </div>
              {[
                { id: "wo-requester", label: t("fundRequest.requester"), key: "requesterId" as const, options: requesterOptions },
                { id: "wo-type", label: t("fundRequestExpense.expenseType"), key: "expenseTypeId" as const, options: typeOptions },
                { id: "wo-status", label: t("common.status"), key: "status" as const, options: statusOptions },
              ].map((f) => (
                <div key={f.id} className="space-y-1">
                  <Label htmlFor={f.id}>{f.label}</Label>
                  <Select
                    value={filters[f.key] ?? ALL}
                    onValueChange={(v) => setFilter({ [f.key]: v === ALL ? undefined : v })}
                  >
                    <SelectTrigger id={f.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("workOrderExpenses.filters.all")}</SelectItem>
                      {f.options.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="flex items-center gap-2 pb-2">
                <Switch id="wo-grouped" checked={grouped} onCheckedChange={setGrouped} />
                <Label htmlFor="wo-grouped">{t("workOrderExpenses.groupByRequest")}</Label>
              </div>
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground">
            {t("workOrderExpenses.filteredSummary", {
              count: filtered.length,
              spent: money(filteredTotals.spent),
              inProcess: money(filteredTotals.inProcess),
            })}
          </p>

          {grouped ? (
            <div className="space-y-4">
              {groups.map((g) => (
                <Card key={g.fundRequestId}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <button
                        type="button"
                        className="font-mono text-sm font-semibold text-primary hover:underline"
                        onClick={() => navigate(`/fund-requests/${g.fundRequestId}/expenses`)}
                      >
                        {g.requestNumber ?? "-"}
                      </button>
                      <span className="text-sm text-muted-foreground">{g.requesterName}</span>
                      <span className="text-sm font-mono">
                        {t("workOrderExpenses.spent")}: {money(g.spent)} · {t("workOrderExpenses.inProcess")}:{" "}
                        {money(g.inProcess)}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("fundRequestExpense.expenseDate")}</TableHead>
                            <TableHead>{t("fundRequestExpense.expenseType")}</TableHead>
                            <TableHead>{t("fundRequestExpense.description")}</TableHead>
                            <TableHead className="text-right">{t("fundRequestExpense.amount")} (BOB)</TableHead>
                            <TableHead>{t("common.status")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.expenses.map((e) => (
                            <TableRow key={e.fre_id}>
                              <TableCell>{formatDateDMY(e.expense_date)}</TableCell>
                              <TableCell>{e.expense_type_name ?? t("workOrderExpenses.noType")}</TableCell>
                              <TableCell className="text-muted-foreground">{e.description || "-"}</TableCell>
                              <TableCell className="text-right font-mono">{money(e.amount)}</TableCell>
                              <TableCell>
                                <FundRequestExpenseStatusBadge status={e.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {groups.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">{t("common.noResults")}</p>
              )}
            </div>
          ) : (
            <DataTable
              data={filtered}
              columns={expenseColumns}
              searchPlaceholder={t("fundRequestExpense.searchPlaceholder")}
              searchKeys={["description", "document_number", "supplier_name", "request_number"]}
              getRowId={(row) => row.fre_id}
              onRowClick={(row) => navigate(`/fund-requests/${row.fund_request_id}/expenses`)}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default FundRequestWorkOrderExpenses;
