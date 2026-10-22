import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { useIsMobile } from "@/hooks/useMobile";
import { useAuthorization } from "@/hooks/useAuthorization";
import { canDoCollections } from "@/lib/collectionsAccess";
import {
  useCollections,
  useCollectionsFilterOptions,
  type CollectionsRow,
  type CollectionsTab,
} from "@/hooks/useCollections";
import { exportCollectionsToExcel } from "@/lib/collectionsExport";

const TABS: CollectionsTab[] = ["por_facturar", "por_cobrar", "en_mora", "cobradas"];
type GroupBy = "ot" | "cliente" | "ninguno";
const NO_ROWS: CollectionsRow[] = [];
const PAGE_SIZE = 50;
/** El valor que usan los selectores para "sin filtro": Radix Select no admite un value vacío. */
const ALL = "__all__";

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Excepción deliberada a la regla de montos de AGENTS.md (cero decimales, moneda en el
// encabezado de la columna): acá se factura y se cobra, y la factura va al centavo —el IVA y la
// liquidación redondean a 2—, así que esconder los centavos mostraría un monto distinto del que
// lleva la factura. Y la moneda va en cada celda porque una misma columna mezcla monedas: la
// cuota puede ir en otra moneda que su OT (Q29) y la fila de gastos nace en Bs.
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
  const isMobile = useIsMobile();
  const { roleKey, isLoading: roleLoading, isError: roleError, refetch: refetchRole } = useAuthorization();
  const canView = canDoCollections(roleKey);

  // Todo el estado de la vista vive en la URL, no en useState. Dos motivos: al volver desde
  // una OT se recupera exactamente lo que se estaba mirando —pestaña, filtros y página—, y el
  // enlace se puede compartir ("mirá lo que está en mora de este cliente").
  const [params, setParams] = useSearchParams();

  const tab = (TABS.includes(params.get("tab") as CollectionsTab)
    ? params.get("tab")
    : "por_facturar") as CollectionsTab;
  const page = Math.max(Number(params.get("page") ?? 0), 0);
  const search = params.get("q") ?? "";
  const societyId = params.get("sociedad") ?? ALL;
  const practica = params.get("practica") ?? ALL;
  const managerId = params.get("gerente") ?? ALL;
  const currency = params.get("moneda") ?? ALL;
  const dateFrom = params.get("desde") ?? "";
  const dateTo = params.get("hasta") ?? "";
  const includeExpenseRows = params.get("gastos") !== "0";
  // Agrupado por OT de entrada: quien cobra trabaja orden por orden, no cuota suelta por
  // cuota suelta (decisión del operador 2026-10-21).
  const groupBy = (params.get("agrupar") ?? "ot") as GroupBy;

  // Escribe en la URL con replace para no llenar el historial: volver atrás tiene que salir de
  // Cobranzas, no deshacer filtro por filtro.
  const setParam = (key: string, value: string | null, resetPage = true) => {
    const next = new URLSearchParams(params);
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    // Cualquier cambio de filtro vuelve a la primera página: quedarse en la página 4 de un
    // resultado que ahora tiene una sola deja la tabla vacía sin explicar por qué.
    if (resetPage) next.delete("page");
    setParams(next, { replace: true });
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
      // Agrupar por OT sólo sirve si el servidor devuelve juntas las cuotas de cada orden.
      order: groupBy === "ot" ? ("ot" as const) : ("fecha" as const),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [tab, societyId, practica, managerId, currency, dateFrom, dateTo, search, includeExpenseRows, groupBy, page],
  );

  const enabled = !roleLoading && !roleError && canView;
  const { data, isLoading, isError } = useCollections(filters, enabled);
  const { data: options } = useCollectionsFilterOptions(enabled);

  // Referencia ESTABLE mientras no hay datos: `?? []` creaba un arreglo nuevo en cada render y
  // el agrupado (useMemo sobre `rows`) se recalculaba siempre.
  const rows = data?.rows ?? NO_ROWS;
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

  // Agrupar es presentación sobre la MISMA página que trajo el servidor: no junta filas de
  // otras páginas, para que lo que se ve siga cuadrando con el paginador y con el export. Lo
  // que SÍ cambia en el servidor es el orden (`order`): por 'ot' la RPC además arma la página
  // por órdenes enteras, así que una orden de 12 cuotas nunca queda partida entre dos páginas.
  // Por cliente no hay esa garantía: es solo presentación sobre la página.
  const grouped = useMemo(() => {
    if (groupBy === "ninguno") return null;
    const map = new Map<string, { label: string; rows: CollectionsRow[] }>();
    for (const row of rows) {
      const key = groupBy === "ot" ? row.wo_id : row.client_legal_name ?? "";
      const label =
        groupBy === "ot"
          ? [row.client_legal_name, row.engagement_code].filter(Boolean).join(" · ")
          : row.client_legal_name ?? "";
      const entry = map.get(key);
      if (entry) entry.rows.push(row);
      else map.set(key, { label, rows: [row] });
    }
    return [...map.entries()];
  }, [groupBy, rows]);

  // Las monedas que las tres tarjetas muestran, en común: la unión de las que aparecen en
  // cualquiera de los tres totales. Así las tres tienen las MISMAS filas y se pueden comparar
  // de un vistazo, y un 0 dice "no hay nada pendiente en esa moneda", que es distinto de que
  // esa moneda no exista en la cartera. Sale de los datos y no de una lista fija, para que el
  // día que entre una OT en USDT aparezca sola en las tres.
  const headerCurrencies = useMemo(() => {
    const totals = data?.totals;
    if (!totals) return [];
    return [...new Set([
      ...Object.keys(totals.por_facturar_mes ?? {}),
      ...Object.keys(totals.facturado_sin_cobrar ?? {}),
      ...Object.keys(totals.en_mora ?? {}),
    ])].sort();
  }, [data?.totals]);

  const totalsCard = (titleKey: string, totals: Record<string, number> | undefined) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{t(titleKey)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {/* Un subtotal POR MONEDA. Nunca se suman Bs y USD: ese número no significaría nada. */}
        {headerCurrencies.length === 0 ? (
          <p className="font-mono text-lg">—</p>
        ) : (
          headerCurrencies.map((cur) => (
            <p key={cur} className="font-mono text-lg">
              <span className="mr-2 text-xs font-normal text-muted-foreground">{cur}</span>
              {fmtAmount(totals?.[cur] ?? 0, cur)}
            </p>
          ))
        )}
      </CardContent>
    </Card>
  );

  // Piezas de una fila que comparten la tabla (escritorio) y la tarjeta (móvil), para que las
  // dos vistas no se desincronicen cuando cambie una de ellas.
  const typeBadge = (row: CollectionsRow) =>
    row.installment_type === "expense_reimbursement" ? (
      // Las filas de gastos ejecutados (Fase 7) se cobran igual que una cuota, así que
      // están acá; el distintivo evita confundirlas con una cuota de honorarios.
      <span
        title={t("collections.typeExpense")}
        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
      >
        <Receipt className="h-3 w-3" />
        {t("collections.typeExpenseShort")}
      </span>
    ) : null;

  const amountDetail = (row: CollectionsRow) => (
    <>
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
    </>
  );

  const rescheduledMark = (row: CollectionsRow) =>
    row.was_rescheduled ? (
      <span title={t("collections.rescheduledTooltip")} className="ml-1 inline-flex align-middle text-warning">
        <CalendarClock className="h-3 w-3" />
      </span>
    ) : null;

  const statusChip = (row: CollectionsRow) => (
    <>
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
    </>
  );

  const contactBlock = (row: CollectionsRow) =>
    row.contact ? (
      <>
        <div>{row.contact.full_name}</div>
        <div className="text-muted-foreground">{row.contact.email ?? row.contact.phone ?? ""}</div>
      </>
    ) : (
      // Sin contacto no hay a quién llamar: se dice, en vez de dejar la celda vacía.
      <span className="text-warning">{t("collections.noContact")}</span>
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
        {typeBadge(row) ?? row.installment_number}
      </TableCell>
      <TableCell className="text-right font-mono">
        <span className="mr-2 text-xs text-muted-foreground">{row.currency}</span>
        {fmtAmount(row.amount, row.currency)}
        {amountDetail(row)}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {fmtDate(row.fecha_relevante)}
        {rescheduledMark(row)}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        {row.days_overdue > 0 ? (
          <span className="font-semibold text-destructive">{row.days_overdue}</span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        {statusChip(row)}
      </TableCell>
      <TableCell className="text-xs">
        {contactBlock(row)}
      </TableCell>
    </TableRow>
  );

  // Móvil (AGENTS.md, regla 7): la tabla de 9 columnas no entra en un teléfono, así que cada
  // cuota se vuelve una tarjeta con lo mismo: quién debe, cuánto, para cuándo y a quién llamar.
  const renderCard = (row: CollectionsRow) => (
    <button
      key={row.installment_id}
      type="button"
      data-testid="collections-card"
      onClick={() => navigate(`/work-orders/${row.wo_id}`)}
      className="w-full space-y-2 rounded-md border bg-card p-3 text-left hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{row.client_legal_name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {row.engagement_code ?? "—"} · {row.engagement_name}
          </div>
        </div>
        <div className="shrink-0">
          {typeBadge(row) ?? (
            <span className="text-xs text-muted-foreground">
              {t("collections.colInstallment")} {row.installment_number}
            </span>
          )}
        </div>
      </div>
      <div className="font-mono">
        <span className="mr-2 text-xs text-muted-foreground">{row.currency}</span>
        {fmtAmount(row.amount, row.currency)}
        {amountDetail(row)}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-mono">
          {fmtDate(row.fecha_relevante)}
          {rescheduledMark(row)}
        </span>
        {row.days_overdue > 0 && (
          <span className="font-semibold text-destructive">
            {t("collections.colDaysOverdue")}: {row.days_overdue}
          </span>
        )}
        <span>{statusChip(row)}</span>
      </div>
      <div className="text-xs">{contactBlock(row)}</div>
    </button>
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
            setParam("tab", v);
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
                    onChange={(e) => setParam("q", e.target.value)}
                    placeholder={t("collections.searchPlaceholder")}
                    className="h-9 pl-8"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">{t("collections.filterSociety")}</Label>
                <Select value={societyId} onValueChange={(v) => setParam("sociedad", v === ALL ? null : v)}>
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
                <Select value={practica} onValueChange={(v) => setParam("practica", v === ALL ? null : v)}>
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
                <Select value={managerId} onValueChange={(v) => setParam("gerente", v === ALL ? null : v)}>
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
                <Select value={currency} onValueChange={(v) => setParam("moneda", v === ALL ? null : v)}>
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
                  onChange={(e) => setParam("desde", e.target.value)}
                  className="h-9 w-40"
                />
              </div>
              <div>
                <Label className="text-xs">{t("collections.filterDateTo")}</Label>
                <Input
                  type="date"
                  lang="es-BO"
                  value={dateTo}
                  onChange={(e) => setParam("hasta", e.target.value)}
                  className="h-9 w-40"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">{t("collections.groupBy")}</Label>
                  <Select value={groupBy} onValueChange={(v) => setParam("agrupar", v)}>
                    <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ot">{t("collections.groupByWorkOrder")}</SelectItem>
                      <SelectItem value="cliente">{t("collections.groupByClient")}</SelectItem>
                      <SelectItem value="ninguno">{t("collections.groupByNone")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="include-expense-rows"
                    checked={includeExpenseRows}
                    onCheckedChange={(v) => setParam("gastos", v ? null : "0")}
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
            ) : isMobile ? (
              <div className="space-y-2">
                {grouped
                  ? grouped.map(([key, group]) => (
                      <div key={`group-${key}`} className="space-y-2">
                        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group.label} · {t("collections.groupRowCount", { count: group.rows.length })}
                        </p>
                        {group.rows.map(renderCard)}
                      </div>
                    ))
                  : rows.map(renderCard)}
              </div>
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
                      ? grouped.map(([key, group]) => (
                          <React.Fragment key={`group-${key}`}>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                              <TableCell colSpan={9} className="py-2 text-xs font-semibold uppercase tracking-wide">
                                {/* "· 3" suelto se lee como el número de algo, no como un
                                    conteo — y al lado de la columna "Cuota", que lleva el
                                    número de cuota, la confusión es inmediata. */}
                                {group.label} · {t("collections.groupRowCount", { count: group.rows.length })}
                              </TableCell>
                            </TableRow>
                            {group.rows.map(renderRow)}
                          </React.Fragment>
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
                    onClick={() => setParam("page", String(Math.max(page - 1, 0)), false)}
                  >
                    {t("common.previous")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= pageCount}
                    onClick={() => setParam("page", String(page + 1), false)}
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
