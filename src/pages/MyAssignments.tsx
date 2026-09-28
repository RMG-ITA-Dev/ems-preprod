import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, StickyNote } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useMyAssignments,
  clampProgressForBar,
  progressPercent,
  type MyAssignmentRow,
  type MyAssignmentsToggle,
} from "@/hooks/useMyAssignments";

type ToggleValue = MyAssignmentsToggle;

// Review 2026-09-28 (MUST FIX): además de baja explícita (deleted_at) o CANCELLED, una fila
// cuyo end_date ya pasó es histórica aunque nadie la haya movido a COMPLETED a mano — no hay
// ningún trigger que haga esa transición automáticamente. "Histórica" queda definida como el
// complemento exacto de "vigente": nada queda fuera de ambos toggles.
function isHistorical(row: MyAssignmentRow, todayISO: string): boolean {
  return row.deleted_at !== null || row.status === "CANCELLED" || row.end_date < todayISO;
}

// Fecha de hoy en America/La_Paz (no UTC) — mismo criterio que get_week_statuses/
// get_my_pending_hours (supabase/migrations/20260911100600_fecha_local_current_date.sql),
// para no adelantar el día a partir de las 20:00 hora local.
function todayInLaPaz(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date());
}

// Deep-link de notificación (review 2026-09-28, MUST FIX): rango sin límite práctico para que
// una asignación de CUALQUIER año sea encontrada — engagementFilter ya acota el resultado a
// una fila puntual, así que ensanchar la fecha acá no reintroduce el problema de rendimiento
// que el acotador de año calendario buscaba evitar (plan_v2.md §"Filtro de fecha por defecto").
const DEEP_LINK_DATE_FROM = "2000-01-01";
const DEEP_LINK_DATE_TO = "2100-01-01";

function formatDate(dateString: string): string {
  try {
    return format(new Date(`${dateString}T00:00:00`), "dd/MM/yyyy");
  } catch {
    return "-";
  }
}

const MyAssignments = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const engagementIdParam = searchParams.get("engagementId");

  // Deep-link de notificación (engagement.staffing.changed, context assigned/unassigned):
  // la fila puede haber quedado histórica (baja) si el hecho fue una baja, así que el toggle
  // arranca en "all" cuando llega con engagementId — plan_v2.md §"Notificaciones". El rango de
  // fecha también arranca sin límite práctico en vez del año calendario (review 2026-09-28,
  // MUST FIX): si la asignación notificada es de otro año, el año calendario por defecto la
  // dejaba afuera pese a que el toggle ya estaba en "Todas".
  const [toggle, setToggle] = useState<ToggleValue>(engagementIdParam ? "all" : "current");
  const [engagementFilter, setEngagementFilter] = useState<string>(engagementIdParam ?? "all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Review 2026-09-28 (P2): año en America/La_Paz (via todayInLaPaz()), no el del navegador —
  // mismo criterio que el resto del archivo. Se usa solo como valor inicial del useState; el
  // reset de más abajo vuelve a calcularlo en el momento, sin depender de esta variable.
  const [dateFrom, setDateFrom] = useState(
    engagementIdParam ? DEEP_LINK_DATE_FROM : `${todayInLaPaz().slice(0, 4)}-01-01`,
  );
  const [dateTo, setDateTo] = useState(
    engagementIdParam ? DEEP_LINK_DATE_TO : `${todayInLaPaz().slice(0, 4)}-12-31`,
  );

  const [notesRow, setNotesRow] = useState<MyAssignmentRow | null>(null);

  // Review 2026-09-28 (P2): distingue "el deep-link no encontró nada" de "el usuario cambió un
  // filtro y por eso no ve la fila" — sin esto, tocar cualquier filtro después de abrir una
  // notificación seguía mostrando "ya no es visible / te reasignaron" aunque la fila siguiera
  // siendo del usuario, solo oculta por su propio filtro.
  const [filtersTouchedByUser, setFiltersTouchedByUser] = useState(false);

  // Review 2026-09-28 (MUST FIX): los useState de arriba solo leen engagementId una vez, en el
  // primer render. La ruta no cambia entre dos avisos de staffing distintos (misma
  // /timesheet/assignments), así que sin este efecto un segundo click en otra notificación
  // deja el filtro/rango pisados por el primero. Reacciona a cada cambio real del search param.
  //
  // Review 2026-09-28 (P2): un `categoryFilter` viejo (puesto antes de abrir la notificación)
  // podía tapar la fila enlazada igual que ya se corrigió para `engagementFilter` — se resetea
  // acá con el mismo criterio.
  //
  // Review 2026-09-28 (P2): la transición INVERSA (de un engagementId puntual a ningún
  // parámetro, ej. clic en el ítem normal del sidebar sin desmontar la página) no reseteaba
  // nada — quedaban el toggle "Todas", el encargo/categoría y el rango 2000-2100 del deep-link
  // anterior pisando la vista por defecto. Ahora el `else` vuelve explícitamente a Vigentes/año
  // calendario actual.
  //
  // Review 2026-09-28 (P2): el año de reset se calcula ACÁ ADENTRO (no via una variable de
  // nivel de componente en las dependencias) — con la pestaña abierta, cualquier re-render
  // después de medianoche del 31/12 recalculaba esa variable y, al estar en el array de
  // dependencias, disparaba este efecto solo por el cambio de año, descartando en silencio los
  // filtros que el usuario ya había elegido (Vigentes/Históricas/Todas no debe resetearse por
  // eso — solo debe reaccionar a un cambio real de `engagementIdParam`). De paso, usa
  // `todayInLaPaz()` (America/La_Paz) en vez de la hora del navegador, mismo criterio que
  // `isHistorical()`.
  useEffect(() => {
    if (engagementIdParam) {
      setToggle("all");
      setEngagementFilter(engagementIdParam);
      setCategoryFilter("all");
      setDateFrom(DEEP_LINK_DATE_FROM);
      setDateTo(DEEP_LINK_DATE_TO);
    } else {
      const resetYear = todayInLaPaz().slice(0, 4);
      setToggle("current");
      setEngagementFilter("all");
      setCategoryFilter("all");
      setDateFrom(`${resetYear}-01-01`);
      setDateTo(`${resetYear}-12-31`);
    }
    setFiltersTouchedByUser(false);
  }, [engagementIdParam]);

  const { data: rows, isLoading, isError, refetch } = useMyAssignments({
    toggle,
    dateFrom,
    dateTo,
    engagementId: engagementFilter,
  });

  const engagementOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows ?? []) {
      if (row.engagement) {
        map.set(row.engagement_id, row.engagement.engagement_code ?? row.engagement.engagement_name);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows ?? []) {
      if (row.category) map.set(row.category_id, row.category.category_name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const todayISO = todayInLaPaz();
    return (rows ?? []).filter((row) => {
      const historical = isHistorical(row, todayISO);
      if (toggle === "current" && historical) return false;
      if (toggle === "historical" && !historical) return false;
      // Acotador de año calendario: solo narrow en Históricas/Todas (rendimiento), nunca en
      // Vigentes — plan_v2.md §"Filtro de fecha por defecto".
      if (toggle !== "current" && (row.end_date < dateFrom || row.start_date > dateTo)) {
        return false;
      }
      if (engagementFilter !== "all" && row.engagement_id !== engagementFilter) return false;
      if (categoryFilter !== "all" && row.category_id !== categoryFilter) return false;
      return true;
    });
  }, [rows, toggle, dateFrom, dateTo, engagementFilter, categoryFilter]);

  const renderProgress = (row: MyAssignmentRow) => {
    const pct = progressPercent(row.loaded_hours, row.assigned_hours);
    const isOver = pct > 100;
    return (
      <div className="flex items-center justify-end gap-2">
        <Progress
          value={clampProgressForBar(pct)}
          title={isOver ? t("myAssignments.progress.over") : undefined}
          className={cn("h-2 w-24 shrink-0", isOver ? "[&>div]:bg-destructive" : undefined)}
        />
        <span className="text-xs font-mono whitespace-nowrap">
          {t("myAssignments.progressText", {
            loaded: Math.round(row.loaded_hours),
            assigned: Math.round(row.assigned_hours),
            pct,
          })}
        </span>
      </div>
    );
  };

  const renderAllocation = (row: MyAssignmentRow) => (
    <div className="text-xs text-muted-foreground">
      {t("myAssignments.allocation", { percent: Math.round(row.allocation_percent) })}
    </div>
  );

  const renderNotesButton = (row: MyAssignmentRow) => {
    if (!row.notes || !row.notes.trim()) return null;
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-11 w-11 sm:h-7 sm:w-7"
        aria-label={t("myAssignments.notesModal.title")}
        data-testid={`notes-button-${row.assignment_id}`}
        onClick={() => setNotesRow(row)}
      >
        <StickyNote className="h-4 w-4" />
      </Button>
    );
  };

  return (
    <AppLayout title={t("myAssignments.title")}>
      <div className="space-y-4">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={engagementFilter}
            onValueChange={(v) => {
              setFiltersTouchedByUser(true);
              setEngagementFilter(v);
            }}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder={t("myAssignments.filters.engagement")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("myAssignments.filters.allEngagements")}</SelectItem>
              {engagementOptions.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(v) => {
              setFiltersTouchedByUser(true);
              setCategoryFilter(v);
            }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t("myAssignments.filters.category")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("myAssignments.filters.allCategories")}</SelectItem>
              {categoryOptions.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ToggleGroup
            type="single"
            value={toggle}
            onValueChange={(v) => {
              if (!v) return;
              setFiltersTouchedByUser(true);
              setToggle(v as ToggleValue);
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="current" aria-label={t("myAssignments.filters.toggle.current")}>
              {t("myAssignments.filters.toggle.current")}
            </ToggleGroupItem>
            <ToggleGroupItem value="historical" aria-label={t("myAssignments.filters.toggle.historical")}>
              {t("myAssignments.filters.toggle.historical")}
            </ToggleGroupItem>
            <ToggleGroupItem value="all" aria-label={t("myAssignments.filters.toggle.all")}>
              {t("myAssignments.filters.toggle.all")}
            </ToggleGroupItem>
          </ToggleGroup>

          {toggle !== "current" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => {
                  // Review 2026-09-28 (P2): un input type="date" nativo se puede limpiar a "" con
                  // el botón del navegador — "" no es una fecha válida para la RPC (p_date_from
                  // exige `date`) y rompía toda la pantalla al estado de error. Se ignora el
                  // cambio en vez de propagar un valor vacío.
                  if (!e.target.value) return;
                  // Review 2026-09-28 (P2): un rango invertido (Desde > Hasta) no lo valida
                  // ningún lado — el predicado de solape de list_my_assignments deja de
                  // representar lo que el usuario quiso filtrar y la pantalla muestra resultados
                  // vacíos/engañosos sin avisar. `max` ya restringe el picker nativo; este guard
                  // cubre también la entrada manual por teclado.
                  if (e.target.value > dateTo) return;
                  setFiltersTouchedByUser(true);
                  setDateFrom(e.target.value);
                }}
                className="w-40"
                aria-label={t("myAssignments.filters.dateRangeFrom")}
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => {
                  if (!e.target.value) return;
                  if (e.target.value < dateFrom) return;
                  setFiltersTouchedByUser(true);
                  setDateTo(e.target.value);
                }}
                className="w-40"
                aria-label={t("myAssignments.filters.dateRangeTo")}
              />
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2" data-testid="my-assignments-loading">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive" data-testid="my-assignments-error">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{t("myAssignments.loadError")}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t("myAssignments.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : filteredRows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm" data-testid="my-assignments-empty">
            {/* Review 2026-09-28 (P2): el deep-link de un aviso de staffing puede apuntar a una
                fila que ya no es del usuario (reemplazo de staffing) — sin este mensaje, esa
                lista vacía se veía igual que "no tenés asignaciones", sin ninguna pista de por
                qué el enlace no trajo nada. Solo se muestra mientras el usuario no haya tocado
                ningún filtro (review 2026-09-28, P2): si después de abrir la notificación el
                usuario cambia categoría/toggle/fecha/encargo y eso oculta una fila que sigue
                siendo suya, no corresponde decirle "te reasignaron" por un resultado de filtro. */}
            {engagementIdParam && !filtersTouchedByUser
              ? t("myAssignments.deepLinkNotFound")
              : rows?.length === 0
                ? t("myAssignments.empty")
                : t("common.noResults")}
          </p>
        ) : (
          <>
            {/* Tabla (>= md) */}
            <div className="hidden md:block border border-border rounded-lg overflow-hidden" data-testid="my-assignments-table">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t("myAssignments.table.engagement")}</TableHead>
                    <TableHead>{t("myAssignments.table.client")}</TableHead>
                    <TableHead>{t("myAssignments.table.role")}</TableHead>
                    <TableHead>{t("myAssignments.table.period")}</TableHead>
                    <TableHead>{t("myAssignments.table.status")}</TableHead>
                    {/* Review 2026-09-28 (P2): convención de celdas numéricas del repo (AGENTS.md
                        regla 4 / docs/skills/design-system.md) — alineadas a la derecha. */}
                    <TableHead className="text-right">{t("myAssignments.table.progress")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.assignment_id}>
                      <TableCell>
                        <div className="font-medium">{row.engagement?.engagement_code ?? row.engagement?.engagement_name ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{row.engagement?.engagement_name}</div>
                      </TableCell>
                      <TableCell>{row.engagement?.client?.client_legal_name ?? "-"}</TableCell>
                      <TableCell>
                        <div>{row.category?.category_name ?? "-"}</div>
                        {renderAllocation(row)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.start_date)} – {formatDate(row.end_date)}
                      </TableCell>
                      <TableCell>{t(`myAssignments.status.${row.status}`)}</TableCell>
                      <TableCell className="text-right">{renderProgress(row)}</TableCell>
                      <TableCell>{renderNotesButton(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Tarjetas (< md) */}
            <div className="md:hidden space-y-2" data-testid="my-assignments-cards">
              {filteredRows.map((row) => (
                <div key={row.assignment_id} className="rounded-md border border-border p-3 text-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{row.engagement?.engagement_code ?? row.engagement?.engagement_name ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{row.engagement?.client?.client_legal_name ?? "-"}</div>
                    </div>
                    {renderNotesButton(row)}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{row.category?.category_name ?? "-"}</span>
                    <span>{t(`myAssignments.status.${row.status}`)}</span>
                  </div>
                  {renderAllocation(row)}
                  <div className="text-xs text-muted-foreground">
                    {formatDate(row.start_date)} – {formatDate(row.end_date)}
                  </div>
                  {renderProgress(row)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={notesRow !== null} onOpenChange={(open) => !open && setNotesRow(null)}>
        <DialogContent data-testid="my-assignments-notes-modal">
          <DialogHeader>
            <DialogTitle>{t("myAssignments.notesModal.title")}</DialogTitle>
            <DialogDescription className="sr-only">{t("myAssignments.notesModal.title")}</DialogDescription>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{notesRow?.notes}</p>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default MyAssignments;
