import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Download, MessageSquare, CalendarClock, Search, Receipt } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuthorization } from "@/hooks/useAuthorization";
import { canDoCollections } from "@/lib/collectionsAccess";
import {
  useCollections,
  useCollectionsFilterOptions,
  totalsList,
  type CollectionsRow,
  type CollectionsTab,
} from "@/hooks/useCollections";
import { exportCollectionsToExcel } from "@/lib/collectionsExport";

const TABS: CollectionsTab[] = ["por_facturar", "por_cobrar", "en_mora", "cobradas"];
const PAGE_SIZE = 50;
/** El valor que usan los selectores para "sin filtro": Radix Select no admite un value vacío. */
const ALL = "__all__";

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const fmtAmount = (amount: number | null, currency: string): string =>
  Number(amount ?? 0).toLocaleString(currency === "BOB" ? "es-BO" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

/**
 * Cobranzas Fase 8 (issue #352) — la pantalla del día a día de cobranzas.
 *
 * Responde de un vistazo las dos preguntas con las que arranca el día (decisión del operador
 * 2026-10-20): qué hay que facturar esta semana y qué vence pronto. Por eso abre en "Por
 * facturar" y ordena por la fecha que importa en cada etapa.
 *
 * Todo el filtrado, el orden, la paginación y los totales ocurren en el servidor: la cartera
 * de la firma no cabe en el navegador. La tabla muestra lo que la RPC devolvió, sin recalcular
 * nada — en particular, sin reinventar el criterio de mora.
 */
export default function Collections() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { roleKey, isLoading: roleLoading, isError: roleError, refetch: refetchRole } = useAuthorization();
  const canView = canDoCollections(roleKey);

  const [tab, setTab] = useState<CollectionsTab>("por_facturar");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [societyId, setSocietyId] = useState<string>(ALL);
  const [practica, setPractica] = useState<string>(ALL);
  const [managerId, setManagerId] = useState<string>(ALL);
  const [currency, setCurrency] = useState<string>(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeExpenseRows, setIncludeExpenseRows] = useState(true);
  const [groupByClient, setGroupByClient] = useState(false);

  // Cualquier cambio de filtro vuelve a la primera página: quedarse en la página 4 de un
  // resultado que ahora tiene una sola deja la tabla vacía sin explicar por qué.
  const onFilterChange = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };

  const filters = useMemo(
    () => ({
      tab,
      societyId: societyId === ALL ? null : societyId,
      practica: practica === ALL ? null : Number(practica),
      managerId: managerId === ALL ? null : managerId,
      currency: currency === ALL ? null : currency,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      search: search.trim() || null,
      includeExpenseRows,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [tab, societyId, practica, managerId, currency, dateFrom, dateTo, search, includeExpenseRows, page],
  );

  const enabled = !roleLoading && !roleError && canView;
  const { data, isLoading, isError } = useCollections(filters, enabled);
  const { data: options } = useCollectionsFilterOptions(enabled);

  const rows = data?.rows ?? [];
  const totalCount = data?.total_count ?? 0;
  const pageCount = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);

  const statusLabel = (row: CollectionsRow): string =>
    row.calendar_state === "overdue"
      ? t("collections.statusOverdue")
      : t(`workOrders.paymentPlan.status${row.status}`);

  const handleExport = () => {
    void exportCollectionsToExcel(
      rows,
      {
        client: t("collections.colClient"),
        taxId: t("collections.colTaxId"),
        engagement: t("collections.colEngagement"),
        manager: t("collections.colManager"),
        installment: t("collections.colInstallment"),
        type: t("collections.colType"),
        amount: t("collections.colAmount"),
        toCollect: t("collections.colToCollect"),
        exchangeDifference: t("collections.colExchangeDifference"),
        currency: t("collections.colCurrency"),
        agreedDate: t("collections.colAgreedDate"),
        currentDate: t("collections.colCurrentDate"),
        status: t("collections.colStatus"),
        daysOverdue: t("collections.colDaysOverdue"),
        contactName: t("collections.colContactName"),
        contactEmail: t("collections.colContactEmail"),
        contactPhone: t("collections.colContactPhone"),
        sheetName: t("collections.title"),
        typeFee: t("collections.typeFee"),
        typeExpense: t("collections.typeExpense"),
        statusLabel,
      },
      `cobranzas-${tab}-${data?.today ?? ""}.xlsx`,
    );
  };

  // Agrupar por cliente es un interruptor de presentación sobre la MISMA página que trajo el
  // servidor: no reordena ni junta filas de otras páginas, para que lo que se ve siga
  // cuadrando con el paginador y con el archivo exportado.
  const grouped = useMemo(() => {
    if (!groupByClient) return null;
    const map = new Map<string, CollectionsRow[]>();
    for (const row of rows) {
      const key = row.client_legal_name ?? "";
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return [...map.entries()];
  }, [groupByClient, rows]);

  const totalsCard = (titleKey: string, totals: Record<string, number> | undefined) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{t(titleKey)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {/* Un subtotal POR MONEDA. Nunca se suman Bs y USD: ese número no significaría nada. */}
        {totalsList(totals).length === 0 ? (
          <p className="font-mono text-lg">—</p>
        ) : (
          totalsList(totals).map(({ currency: cur, amount }) => (
            <p key={cur} className="font-mono text-lg">
              <span className="mr-2 text-xs font-normal text-muted-foreground">{cur}</span>
              {fmtAmount(amount, cur)}
            </p>
          ))
        )}
      </CardContent>
    </Card>
  );

  const renderRow = (row: CollectionsRow) => (
    <TableRow
      key={row.installment_id}
      className="cursor-pointer hover:bg-muted/30"
      onClick={() => navigate(`/work-orders/${row.wo_id}`)}
    >
      <TableCell className="font-medium">{row.client_legal_name}</TableCell>
      <TableCell className="text-sm">
        <div>{row.engagement_code ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{row.engagement_name}</div>
      </TableCell>
      <TableCell className="text-sm">{row.manager_name ?? "—"}</TableCell>
      <TableCell className="text-center">
        {row.installment_type === "expense_reimbursement" ? (
          // Las filas de gastos ejecutados (Fase 7) se cobran igual que una cuota, así que
          // están acá; el distintivo evita confundirlas con una cuota de honorarios.
          <span
            title={t("collections.typeExpense")}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
          >
            <Receipt className="h-3 w-3" />
            {t("collections.typeExpenseShort")}
          </span>
        ) : (
          row.installment_number
        )}
      </TableCell>
      <TableCell className="text-right font-mono">
        <span className="mr-2 text-xs text-muted-foreground">{row.currency}</span>
        {fmtAmount(row.amount, row.currency)}
        {/* Cobranzas Fase 9: arriba el monto acordado, debajo lo que queda por cobrar. Mostrar
            solo el acordado diría que el cliente debe más de lo que se le va a cobrar, justo
            en la pantalla que existe para saber cuánto falta. */}
        {row.adjustments_total !== 0 && (
          <div
            className="text-xs font-normal text-muted-foreground"
            title={t("collections.adjustedTooltip")}
          >
            {t("collections.colToCollect")}: {fmtAmount(row.amount_effective, row.currency)}
          </div>
        )}
        {row.exchange_difference_bob !== 0 && (
          <div className="text-xs font-normal text-muted-foreground">
            {t("collections.colExchangeDifference")}: BOB{" "}
            {fmtAmount(row.exchange_difference_bob, "BOB")}
          </div>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {fmtDate(row.fecha_relevante)}
        {row.was_rescheduled && (
          <span title={t("collections.rescheduledTooltip")} className="ml-1 inline-flex align-middle text-warning">
            <CalendarClock className="h-3 w-3" />
          </span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {row.days_overdue > 0 ? (
          <span className="font-semibold text-destructive">{row.days_overdue}</span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            row.calendar_state === "overdue"
              ? "bg-destructive/15 text-destructive"
              : row.status === "Completed"
                ? "bg-success/15 text-success"
                : row.status === "Invoiced"
                  ? "bg-info/15 text-info"
                  : "bg-muted/60 text-muted-foreground",
          )}
        >
          {statusLabel(row)}
        </span>
        {row.has_notes && (
          <span title={t("collections.hasNotesTooltip")} className="ml-1 inline-flex align-middle text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
          </span>
        )}
      </TableCell>
      <TableCell className="text-xs">
        {row.contact ? (
          <>
            <div>{row.contact.full_name}</div>
            <div className="text-muted-foreground">{row.contact.email ?? row.contact.phone ?? ""}</div>
          </>
        ) : (
          // Sin contacto no hay a quién llamar: se dice, en vez de dejar la celda vacía.
          <span className="text-warning">{t("collections.noContact")}</span>
        )}
      </TableCell>
    </TableRow>
  );

  // Escalera de estados: el rol primero, para no mostrar un "no autorizado" mientras carga.
  let content: React.ReactNode;
  if (roleLoading) {
    content = <Skeleton className="h-64 w-full" />;
  } else if (roleError) {
    content = (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between gap-2">
          {t("collections.roleLoadFailed")}
          <Button variant="outline" size="sm" onClick={() => refetchRole()}>
            {t("common.retry")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (!canView) {
    content = (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{t("collections.forbidden")}</AlertDescription>
      </Alert>
    );
  } else {
    content = (
      <>
        <div className="grid gap-4 sm:grid-cols-3">
          {totalsCard("collections.totalToBillThisMonth", data?.totals.por_facturar_mes)}
          {totalsCard("collections.totalBilledUncollected", data?.totals.facturado_sin_cobrar)}
          {totalsCard("collections.totalOverdue", data?.totals.en_mora)}
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as CollectionsTab);
            setPage(0);
          }}
        >
          <TabsList>
            {TABS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`collections.tab_${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <Label className="text-xs">{t("collections.search")}</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => onFilterChange(setSearch)(e.target.value)}
                    placeholder={t("collections.searchPlaceholder")}
                    className="h-9 pl-8"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">{t("collections.filterSociety")}</Label>
                <Select value={societyId} onValueChange={onFilterChange(setSocietyId)}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("collections.filterAll")}</SelectItem>
                    {(options?.societies ?? []).map((s) => (
                      <SelectItem key={s.society_id} value={s.society_id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">{t("collections.filterPractice")}</Label>
                <Select value={practica} onValueChange={onFilterChange(setPractica)}>
                  <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("collections.filterAll")}</SelectItem>
                    {(options?.practicas ?? []).map((p) => (
                      <SelectItem key={p.code} value={String(p.code)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">{t("collections.filterManager")}</Label>
                <Select value={managerId} onValueChange={onFilterChange(setManagerId)}>
                  <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("collections.filterAll")}</SelectItem>
                    {(options?.managers ?? []).map((m) => (
                      <SelectItem key={m.staff_id} value={m.staff_id}>{m.name ?? "—"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">{t("collections.filterCurrency")}</Label>
                <Select value={currency} onValueChange={onFilterChange(setCurrency)}>
                  <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t("collections.filterAll")}</SelectItem>
                    {(options?.currencies ?? []).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">{t("collections.filterDateFrom")}</Label>
                <Input
                  type="date"
                  lang="es-BO"
                  value={dateFrom}
                  onChange={(e) => onFilterChange(setDateFrom)(e.target.value)}
                  className="h-9 w-40"
                />
              </div>
              <div>
                <Label className="text-xs">{t("collections.filterDateTo")}</Label>
                <Input
                  type="date"
                  lang="es-BO"
                  value={dateTo}
                  onChange={(e) => onFilterChange(setDateTo)(e.target.value)}
                  className="h-9 w-40"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="group-by-client"
                    checked={groupByClient}
                    onCheckedChange={setGroupByClient}
                  />
                  <Label htmlFor="group-by-client" className="text-xs">
                    {t("collections.groupByClient")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="include-expense-rows"
                    checked={includeExpenseRows}
                    onCheckedChange={onFilterChange(setIncludeExpenseRows)}
                  />
                  <Label htmlFor="include-expense-rows" className="text-xs">
                    {t("collections.includeExpenseRows")}
                  </Label>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rows.length === 0}
                onClick={handleExport}
              >
                <Download className="mr-1 h-4 w-4" />
                {t("collections.export")}
              </Button>
            </div>

            {isError ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t("collections.loadFailed")}</AlertDescription>
              </Alert>
            ) : isLoading && rows.length === 0 ? (
              <Skeleton className="h-48 w-full" />
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("collections.empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("collections.colClient")}</TableHead>
                      <TableHead>{t("collections.colEngagement")}</TableHead>
                      <TableHead>{t("collections.colManager")}</TableHead>
                      <TableHead className="text-center">{t("collections.colInstallment")}</TableHead>
                      <TableHead className="text-right">{t("collections.colAmount")}</TableHead>
                      <TableHead>{t("collections.colCurrentDate")}</TableHead>
                      <TableHead className="text-right">{t("collections.colDaysOverdue")}</TableHead>
                      <TableHead>{t("collections.colStatus")}</TableHead>
                      <TableHead>{t("collections.colContact")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grouped
                      ? grouped.map(([client, clientRows]) => (
                          <>
                            <TableRow key={`group-${client}`} className="bg-muted/40 hover:bg-muted/40">
                              <TableCell colSpan={9} className="py-2 text-xs font-semibold uppercase tracking-wide">
                                {client} · {clientRows.length}
                              </TableCell>
                            </TableRow>
                            {clientRows.map(renderRow)}
                          </>
                        ))
                      : rows.map(renderRow)}
                  </TableBody>
                </Table>
              </div>
            )}

            {totalCount > PAGE_SIZE && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("collections.pageOf", { page: page + 1, pages: pageCount, total: totalCount })}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(p - 1, 0))}
                  >
                    {t("common.previous")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= pageCount}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("common.next")}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("collections.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("collections.subtitle")}</p>
        </div>
        {content}
      </div>
    </AppLayout>
  );
}
