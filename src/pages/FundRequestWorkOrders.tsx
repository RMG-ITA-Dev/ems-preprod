import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { useWorkOrderExpenseSummary, type WorkOrderExpenseSummary } from "@/hooks/useWorkOrderExpenses";
import { budgetUsage } from "@/lib/workOrderExpenses";
import { cn } from "@/lib/utils";

const money = (n: number) =>
  Number(n).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Gastos por OT (docs/plan-contabilidad-gastos.md, Fase 5): una fila por OT con solicitudes de
 * fondos en la fase contable — asignado, gastado (validado), en proceso, diferencia y
 * presupuesto de gastos. Click → detalle de la OT. Solo Contabilidad (expense_settlement.read);
 * la ruta y la RPC lo exigen. Montos en BOB: el módulo de fondos solo maneja bolivianos.
 */
const FundRequestWorkOrders = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useWorkOrderExpenseSummary();

  const columns: Column<WorkOrderExpenseSummary>[] = [
    {
      key: "engagement_code",
      label: t("workOrderExpenses.workOrder"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => <span className="font-mono text-xs">{row.engagement_code ?? "-"}</span>,
    },
    {
      key: "engagement_name",
      label: t("workOrderExpenses.engagement"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => (
        <div className="min-w-0">
          <p className="line-clamp-1">{row.engagement_name ?? "-"}</p>
          {row.client_name && <p className="text-xs text-muted-foreground line-clamp-1">{row.client_name}</p>}
        </div>
      ),
    },
    {
      key: "request_count",
      label: t("workOrderExpenses.requests"),
      sortable: true,
      mobilePriority: "secondary",
      className: "text-right",
      render: (row) => <span className="font-mono">{row.request_count}</span>,
    },
    {
      key: "assigned",
      label: `${t("workOrderExpenses.assigned")} (BOB)`,
      sortable: true,
      mobilePriority: "secondary",
      className: "text-right",
      render: (row) => <span className="font-mono">{money(row.assigned)}</span>,
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
      key: "difference",
      label: `${t("workOrderExpenses.difference")} (BOB)`,
      mobilePriority: "secondary",
      className: "text-right",
      render: (row) => {
        const diff = row.assigned - row.spent;
        return <span className={cn("font-mono", diff < 0 && "text-destructive")}>{money(diff)}</span>;
      },
    },
    {
      key: "budget",
      label: t("workOrderExpenses.budgetUsage"),
      sortable: true,
      mobilePriority: "secondary",
      className: "text-right",
      render: (row) => {
        const usage = budgetUsage(row.spent, row.budget);
        return usage === null ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <span className={cn("font-mono", usage > 100 && "text-destructive")}>
            {usage}% · {money(row.budget)}
          </span>
        );
      },
    },
  ];

  // Sin esto, una RPC caída se ve igual que "No hay resultados" y Contabilidad concluye que
  // ninguna OT tiene gastos.
  if (isError) {
    return (
      <AppLayout title={t("workOrderExpenses.title")}>
        <div className="space-y-2">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{t("workOrderExpenses.loadError")}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => refetch()}>
            {t("workOrderExpenses.retry")}
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={t("workOrderExpenses.title")}>
      <DataTable
        data={data ?? []}
        columns={columns}
        searchPlaceholder={t("workOrderExpenses.searchPlaceholder")}
        searchKeys={["engagement_code", "engagement_name", "client_name"]}
        isLoading={isLoading}
        getRowId={(row) => row.wo_id}
        onRowClick={(row) => navigate(`/fund-requests/work-orders/${row.wo_id}`)}
      />
    </AppLayout>
  );
};

export default FundRequestWorkOrders;
