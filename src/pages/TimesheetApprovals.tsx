import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, ChevronRight } from "lucide-react";
import { usePendingApprovalSummaries } from "@/hooks/useTimesheetApprovals";
import { useAuthorization } from "@/hooks/useAuthorization";
import { format, addDays } from "date-fns";
import { parseDateLocal } from "@/lib/timesheetUtils";
import { getWeekDisplayInfo } from "@/lib/timesheetWeekDisplay";
import { ApprovedLinesTab } from "@/components/timesheet/ApprovedLinesTab";
import { ReversalRequestsTab } from "@/components/timesheet/ReversalRequestsTab";
import { useReversalRequests } from "@/hooks/useTimesheetReversals";

// 0923-209: la ruta y su permiso (timesheet_approval.read) no cambian -- sólo se agregan
// tabs. "pending" es el contenido de siempre, intacto. "approved"/"my-requests"/"reversals"
// son nuevas y ramifican por perfil (§c.5): sólo-lectura, aprobador (.approve) o admin.
const TimesheetApprovals = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: summaries, isLoading } = usePendingApprovalSummaries();
  const [searchTerm, setSearchTerm] = useState("");
  const { can, roleKey } = useAuthorization();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = roleKey === "admin";
  const canApprove = can("timesheet_approval.approve");
  // Badge del tab "Solicitudes de reversión": sólo se pide cuando importa (admin), y sólo
  // se muestra el "(N)" cuando N > 0 -- una cola vacía no necesita un contador en cero.
  const { data: pendingReversals } = useReversalRequests({ status: "pending", enabled: isAdmin });
  const pendingReversalCount = pendingReversals?.length ?? 0;

  const filteredSummaries = summaries?.filter((summary) => {
    const staffName = summary.staff.short_name || 
      `${summary.staff.first_name} ${summary.staff.last_name}`;
    const searchLower = searchTerm.toLowerCase();
    return staffName.toLowerCase().includes(searchLower);
  });

  const handleRowClick = (periodId: string) => {
    navigate(`/timesheet/approvals/${periodId}`);
  };

  const formatWeekRange = (weekStartDate: string) => {
    const startDate = parseDateLocal(weekStartDate);
    const endDate = addDays(startDate, 4); // Monday to Friday
    return `${format(startDate, "dd/MM/yyyy")} - ${format(endDate, "dd/MM/yyyy")}`;
  };

  if (isLoading) {
    return (
      <AppLayout title={t("approval.title")}>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // Perfil admin: cola de solicitudes ("reversals"). Perfil aprobador (.approve, no admin):
  // seguimiento propio ("my-requests"). Sólo-lectura (.read nada más): sin tercera tab.
  const thirdTab = isAdmin
    ? {
        value: "reversals",
        label: pendingReversalCount > 0
          ? `${t("approval.tabs.reversalQueue")} (${pendingReversalCount})`
          : t("approval.tabs.reversalQueue"),
      }
    : canApprove
      ? { value: "my-requests", label: t("approval.tabs.myRequests") }
      : null;

  // Normaliza un `?tab=` que no existe para este perfil (review iteración 1, hallazgo #9):
  // approval.reversal_executed notifica a gerentes/socios con `?tab=reversals`, una tab que
  // sólo el admin tiene -- sin esto, Radix se quedaba sin ningún tab activo (pantalla en
  // blanco) para cualquiera que llegara con un valor que no le correspondía.
  const requestedTab = searchParams.get("tab") ?? "pending";
  const validTabValues = new Set(["pending", "approved", ...(thirdTab ? [thirdTab.value] : [])]);
  const defaultTab = validTabValues.has(requestedTab) ? requestedTab : "pending";

  const pendingContent = (
      <div className="space-y-6">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("approval.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <Badge variant="secondary" className="text-sm py-1 px-3">
            {t("approval.pendingCount", { count: filteredSummaries?.length || 0 })}
          </Badge>
        </div>

        {/* Pending Timesheets List */}
        {filteredSummaries?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("approval.noPending")}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold text-center border-r border-border">{t("staff.name")}</TableHead>
                  <TableHead className="font-semibold text-center border-r border-border">{t("timesheet.week")}</TableHead>
                  <TableHead className="font-semibold text-center border-r border-border">
                    {t("approval.horasPendientesAprobacion")}
                  </TableHead>
                  <TableHead className="w-10 text-center"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSummaries?.map((summary) => {
                  // Canonical week display — DB week_number/year are non-authoritative for UI
                  const weekDisplay = getWeekDisplayInfo(summary.week_start_date);
                  return (
                  <TableRow
                    key={summary.period_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(summary.period_id)}
                  >
                    <TableCell className="font-medium text-left border-r border-border">
                      {summary.staff.short_name ||
                        `${summary.staff.first_name} ${summary.staff.last_name}`}
                    </TableCell>
                    <TableCell className="text-left border-r border-border">
                      <span className="text-muted-foreground mr-2">
                        {t("timesheet.week")} {weekDisplay.isValid ? weekDisplay.weekNumber : "\u2014"}, {weekDisplay.isValid ? weekDisplay.fiscalYear : "\u2014"}
                      </span>
                      <span className="text-sm">
                        ({formatWeekRange(summary.week_start_date)})
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold border-r border-border">
                      {summary.totalPendingHours}h
                    </TableCell>
                    <TableCell className="text-center">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
  );

  return (
    <AppLayout title={t("approval.title")}>
      <Tabs
        // Controlado, no `defaultValue` (review iteración 3, hallazgo #7): Radix sólo lee
        // `defaultValue` al montar. Con eso, un click en una notificación (navegación de
        // React Router, sin desmontar esta pantalla) cambiaba el `?tab=` de la URL pero
        // dejaba la tab visible sin cambiar. `value` sigue a `defaultTab` en cada render.
        value={defaultTab}
        onValueChange={(value) => setSearchParams({ tab: value })}
      >
        <TabsList>
          <TabsTrigger value="pending">{t("approval.tabs.pending")}</TabsTrigger>
          <TabsTrigger value="approved">{t("approval.tabs.approved")}</TabsTrigger>
          {thirdTab && <TabsTrigger value={thirdTab.value}>{thirdTab.label}</TabsTrigger>}
        </TabsList>
        <TabsContent value="pending">{pendingContent}</TabsContent>
        <TabsContent value="approved">
          <ApprovedLinesTab canRequestReversal={canApprove && !isAdmin} isAdmin={isAdmin} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="reversals">
            <ReversalRequestsTab mode="queue" />
          </TabsContent>
        )}
        {!isAdmin && canApprove && (
          <TabsContent value="my-requests">
            <ReversalRequestsTab mode="mine" />
          </TabsContent>
        )}
      </Tabs>
    </AppLayout>
  );
};

export default TimesheetApprovals;
