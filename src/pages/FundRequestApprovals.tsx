import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DataTable, Column } from "@/components/data-table/DataTable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FundRequestStatusBadge } from "@/components/fund-requests/FundRequestStatusBadge";
import { ExpenseActionBadge } from "@/components/fund-requests/ExpenseActionBadge";
import { useFundRequests, type FundRequest } from "@/hooks/useFundRequests";
import { useFundRequestExpenseCounts } from "@/hooks/useFundRequestExpenseCounts";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

const formatCurrency = (n: number, currency: "BOB" | "USD") =>
  Math.round(n).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    maximumFractionDigits: 0,
  });

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const staffName = (s?: { first_name?: string; last_name?: string; short_name?: string | null }) =>
  s ? s.short_name || `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() : "-";

type Tab = "pending" | "approved" | "returned" | "expenses";
type DecisionTab = "pending" | "approved" | "returned";

const FundRequestApprovals = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useFundRequests();
  const { data: expenseCounts } = useFundRequestExpenseCounts();
  const { staffRecord } = useCurrentStaff();
  const [tab, setTab] = useState<Tab>("pending");

  // Solicitudes donde gestiono al menos una OT (modelo de aprobación por OT).
  const myAssigned = useMemo(() => {
    if (!data || !staffRecord) return [];
    return data.filter((fr) =>
      (fr.fund_request_work_orders ?? []).some(
        (o) => o.manager_staff_id === staffRecord.staff_id,
      ),
    );
  }, [data, staffRecord]);

  // Clasifica la solicitud según el estado de MIS OTs (no el estado agregado de
  // la solicitud): en multi-gerente, ya aprobé mi parte aunque otra OT siga
  // pendiente. Prioridad: alguna mía pendiente → "por aprobar"; alguna mía
  // observada/rechazada (o solicitud cancelada) → "regresadas"; todas mías
  // aprobadas → "aprobadas".
  const myDecisionTab = useMemo(() => {
    const myStaffId = staffRecord?.staff_id;
    return (fr: FundRequest): DecisionTab | null => {
      // Un borrador no enviado nunca entra a la cola de aprobación (puede verse
      // si el gerente es también el solicitante de su propio borrador).
      if (fr.status === "borrador") return null;
      if (fr.status === "cancelado") return "returned";
      const myOts = (fr.fund_request_work_orders ?? []).filter(
        (o) => o.manager_staff_id === myStaffId,
      );
      if (myOts.length === 0) return null;
      if (myOts.some((o) => o.approval_status === "pendiente")) return "pending";
      if (myOts.some((o) => o.approval_status === "observado" || o.approval_status === "rechazado"))
        return "returned";
      return "approved";
    };
  }, [staffRecord]);

  // Solicitudes con gastos pendientes de MI aprobación (el conteo ya viene
  // filtrado por RLS a las OTs que gestiono).
  const withExpensesToApprove = useMemo(
    () =>
      myAssigned.filter(
        (fr) => (expenseCounts?.[fr.fund_request_id]?.pendiente_aprobacion ?? 0) > 0,
      ),
    [myAssigned, expenseCounts],
  );

  const filtered = useMemo(() => {
    if (tab === "expenses") return withExpensesToApprove;
    return myAssigned.filter((fr) => myDecisionTab(fr) === tab);
  }, [myAssigned, tab, withExpensesToApprove, myDecisionTab]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { pending: 0, approved: 0, returned: 0, expenses: 0 };
    for (const fr of myAssigned) {
      const k = myDecisionTab(fr);
      if (k) c[k] += 1;
    }
    c.expenses = withExpensesToApprove.length;
    return c;
  }, [myAssigned, withExpensesToApprove, myDecisionTab]);

  const columns: Column<FundRequest>[] = [
    {
      key: "request_number",
      label: t("fundRequest.requestNumber"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => <span className="font-mono font-medium">{row.request_number}</span>,
    },
    {
      key: "requester.last_name",
      label: t("fundRequest.requester"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => staffName(row.requester),
    },
    {
      key: "purpose",
      label: t("fundRequest.purpose"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) => (
        <span className="text-muted-foreground line-clamp-1">{row.purpose || "-"}</span>
      ),
    },
    {
      key: "total_requested_amount",
      label: t("fundRequest.totalRequested"),
      sortable: true,
      mobilePriority: "primary",
      className: "text-right",
      render: (row) => (
        <span className="font-mono">
          {formatCurrency(Number(row.total_requested_amount), row.currency)} {row.currency}
        </span>
      ),
    },
    {
      key: tab === "pending" ? "submitted_at" : "manager_decided_at",
      label: tab === "pending" ? t("fundRequest.submittedAt") : t("fundRequest.managerDecidedAt"),
      sortable: true,
      mobilePriority: "secondary",
      render: (row) =>
        tab === "pending" ? formatDate(row.submitted_at) : formatDate(row.manager_decided_at),
    },
    {
      key: "expenses",
      label: t("fundRequestExpense.expensesColumn"),
      mobilePriority: "secondary",
      render: (row) => {
        const pending = expenseCounts?.[row.fund_request_id]?.pendiente_aprobacion ?? 0;
        if (pending === 0) return null;
        // Se muestra como un solo lote ("Por aprobar"), no el número de gastos.
        return (
          <ExpenseActionBadge
            label={t("fundRequestExpense.indicators.toApprove")}
            tone="warning"
          />
        );
      },
    },
    {
      key: "status",
      label: t("common.status"),
      sortable: true,
      mobilePriority: "primary",
      render: (row) => <FundRequestStatusBadge status={row.status} />,
    },
  ];

  return (
    <AppLayout title={t("fundRequest.approvalsQueue")}>
      <div className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="pending">
              {t("fundRequest.tabs.pending")} ({counts.pending})
            </TabsTrigger>
            <TabsTrigger value="approved">
              {t("fundRequest.tabs.approved")} ({counts.approved})
            </TabsTrigger>
            <TabsTrigger value="returned">
              {t("fundRequest.tabs.returned")} ({counts.returned})
            </TabsTrigger>
            <TabsTrigger value="expenses">
              {t("fundRequest.tabs.expensesToApprove")} ({counts.expenses})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <DataTable
          data={filtered}
          columns={columns}
          searchPlaceholder={t("fundRequest.searchPlaceholder")}
          searchKeys={["request_number", "purpose"]}
          isLoading={isLoading}
          onRowClick={(row) =>
            navigate(
              tab === "expenses"
                ? `/fund-requests/${row.fund_request_id}/expenses`
                : `/fund-requests/${row.fund_request_id}`,
            )
          }
          getRowId={(row) => row.fund_request_id}
        />
      </div>
    </AppLayout>
  );
};

export default FundRequestApprovals;
