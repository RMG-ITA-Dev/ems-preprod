import { useState, useEffect, useMemo, useRef } from "react";
import {
  Bell,
  Briefcase,
  Building2,
  CalendarRange,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  GraduationCap,
  Table2,
  Timer,
  UserCog,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuthorization } from "@/hooks/useAuthorization";
import { isSchedulerEnabled } from "@/lib/schedulerFeature";
import { useStaffingAlerts } from "@/hooks/useStaffingAlerts";
import { useMarkAlertsSeen } from "@/hooks/useMarkAlertsSeen";
import {
  useNotifications,
  useMarkNotificationsRead,
  useDismissNotifications,
} from "@/hooks/useNotifications";
import {
  EMPTY_PAYLOAD,
  alarmEngagements,
  bellCount,
  buildPendingSections,
  canOpenScheduler,
  canOpenTrainingApprovals,
  groupEventsByModule,
  isCodeMeta,
  notificationMeta,
  notificationRoleChange,
  notificationRoute,
  notificationState,
  notificationStateTone,
  pendingApprovalCots,
  unreadIds,
  visibleLegacyAlerts,
  type NotificationEvent,
  type NotificationModule,
  type NotificationStateTone,
  type PendingAlarm,
  type PendingSectionKey,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

/**
 * Campana del dashboard — FEAT 0601-130 + Notificaciones Fase 2.
 *
 * Tres bloques, en este orden:
 *
 * 1. Pendientes — contadores (delivery = 'aggregate') agrupados en las dos secciones del
 *    packet. Responden "que me falta". No tienen leido: bajan cuando el usuario resuelve lo
 *    que los produjo.
 * 2. Novedades — eventos (delivery = 'event') agrupados por modulo. Responden "que paso".
 *    Se marcan leidos al CERRAR el panel. Hoy los alimentan los disparadores de Fondos
 *    (3.a), Ordenes de Trabajo (3.b), Encargos (3.c), Tiempos (3.d), Cuentas/Auth (3.e),
 *    Clientes (3.f) y Hojas de Trabajo (3.g, todavia sin via en el producto).
 * 3. Alertas de staffing — lo que queda del feed historico de vw_staffing_alerts. Cada fila
 *    que gana emisor propio en el catalogo sale de aca (visibleLegacyAlerts): desde la 3.e
 *    ya no se pintan new_user_registered ni engagement_created. Siguen saliendo de la vista
 *    work_order_pending_approval y timesheet_pending_approval.
 *
 * Las alarmas en cero no se pintan y una seccion sin alarmas activas desaparece entera
 * (decision de UX 2026-09-08): la campana se escanea en un segundo, y cada fila en (0)
 * empuja hacia abajo lo que si importa.
 */

function priorityBadge(level: string | null, t: (key: string) => string) {
  const label = t(`notifications.priority.${level?.toLowerCase() ?? "unknown"}`);
  switch (level?.toLowerCase()) {
    case "high":
      return <Badge variant="destructive">{label}</Badge>;
    case "medium":
      return (
        <Badge className="bg-warning/10 text-warning border-warning/30 hover:bg-warning/20">
          {label}
        </Badge>
      );
    case "low":
      return <Badge variant="secondary">{label}</Badge>;
    default:
      return <Badge variant="outline">{label}</Badge>;
  }
}

/** `timesheet.overdue` -> `notifications.alarms.timesheet.overdue`. */
function alarmLabelKey(typeKey: string): string {
  return `notifications.alarms.${typeKey}`;
}

/**
 * Icono por modulo y por seccion de Pendientes. Con cuatro o cinco encabezados apilados, el
 * texto en mayusculas solo no alcanza para escanear: el icono es el ancla visual.
 *
 * Los dos mapas son `Partial`: un modulo o una seccion sin icono cae al generico en vez de
 * romper el render, que es lo que hace falta cuando el catalogo suma una fase nueva.
 */
const MODULE_ICON: Partial<Record<NotificationModule, LucideIcon>> = {
  auth: UserCog,
  client: Building2,
  engagement: Briefcase,
  worksheet: Table2,
  work_order: ClipboardList,
  fund_request: Wallet,
  timesheet: Clock,
  timesheet_approval: CheckCheck,
  tracker: Timer,
  scheduler: CalendarRange,
};

const SECTION_ICON: Partial<Record<PendingSectionKey, LucideIcon>> = {
  time_control: Clock,
  engagement_status: Briefcase,
  fund_request: Wallet,
  payment_plan: Wallet,
  training: GraduationCap,
  coverage: CalendarRange,
};

function SectionHeading({
  children,
  total,
  icon: Icon,
}: {
  children: string;
  total: number;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1">
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="truncate">{children}</span>
      </span>
      {/* Mejora E: subtotal de la seccion. */}
      <span className="text-xs font-medium text-muted-foreground tabular-nums">
        {total}
      </span>
    </div>
  );
}

/**
 * Una fila de contador. Mejora A: toda la fila navega.
 *
 * `onNavigate` cierra el popover. Sin eso el Link navega igual pero la campana queda abierta
 * encima, y desde la vista del usuario el click no hizo nada (reportado 2026-09-10 sobre las
 * cuotas vencidas; le pasaba lo mismo a los contadores de Fondos desde la Fase 3.a).
 */
function AlarmRow({
  alarm,
  onNavigate,
}: {
  alarm: PendingAlarm;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  const cots =
    alarm.typeKey === "timesheet.pending_approval"
      ? pendingApprovalCots(alarm)
      : [];
  const engagements = alarmEngagements(alarm);

  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm leading-snug">
          {t(alarmLabelKey(alarm.typeKey))}
        </span>
        {/* Mejora B: las horas faltantes viajan junto al contador. */}
        {alarm.missingHours !== undefined && (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {t("notifications.missingHours", {
              hours: alarm.missingHours.toFixed(1),
            })}
          </span>
        )}
        <Badge
          variant="outline"
          className="border-destructive/20 bg-destructive/10 px-1.5 py-0 font-mono text-xs text-destructive"
        >
          {alarm.count}
        </Badge>
        {/* La flecha sólo si hay a dónde ir: sin permiso sobre la pantalla destino la fila
            informa el backlog pero no navega. */}
        {alarm.route && (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </div>

      {/* Mejora C: los COT y los encargos como chips, no como texto corrido. */}
      {(cots.length > 0 || engagements.length > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {cots.map((cot) => (
            <Badge
              key={cot}
              variant="secondary"
              className="px-1.5 py-0 font-mono text-[10px]"
            >
              {cot}
            </Badge>
          ))}
          {engagements.map((e) => (
            <Badge
              key={e.id}
              variant="secondary"
              className="px-1.5 py-0 font-mono text-[10px]"
            >
              {e.code}
            </Badge>
          ))}
        </div>
      )}
    </>
  );

  // `last:border-b-0`: la separacion va entre filas, no debajo de la ultima — ahi ya separa
  // el <Separator /> de la zona siguiente y dos lineas juntas se ven como un error.
  const className = cn(
    "block border-b border-border/60 px-4 py-2.5 last:border-b-0",
    alarm.route &&
      "transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
  );

  return alarm.route ? (
    <Link to={alarm.route} onClick={onNavigate} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Clases del badge de estado por tono. Tokens semanticos del design system. */
const STATE_TONE_CLASS: Record<NotificationStateTone, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/20",
  neutral: "bg-muted text-muted-foreground border-border",
};

/**
 * Una fila de Novedades. El estado va como Badge y no interpolado en el texto: se lee de un
 * vistazo y es consistente con como se pintan los estados en el resto del sistema.
 *
 * La fila es <Link> solo si su modulo ya tiene destino (notificationRoute). Mandar a una ruta
 * inventada es peor que no linkear, asi que sin destino se renderiza como texto.
 */
function EventRow({
  event,
  onNavigate,
  onDismiss,
  can,
}: {
  event: NotificationEvent;
  onNavigate: () => void;
  onDismiss: (id: string) => void;
  can: (permission: string) => boolean;
}) {
  const { t } = useTranslation();
  const state = notificationState(event);
  const route = notificationRoute(event, can);

  // El badge va en la MISMA linea que la fecha, a la derecha del texto: puesto debajo
  // agregaba un tercer renglon por fila y la lista se volvia el doble de alta.
  const meta = notificationMeta(event);

  // El cambio de rol se pinta como `anterior -> nuevo` en badges traducidos, en vez de
  // incrustar los role_key crudos en el texto (que ademas partia la fila en dos renglones).
  const roleChange = notificationRoleChange(event);
  const roleLabel = (key: string) =>
    t(`authz.role.${key}`, { defaultValue: key });

  // Dos lineas fijas: accion + fecha arriba, identificadores + estado abajo. Antes el texto
  // llevaba el numero de solicitud incrustado, no entraba en el ancho y partia en dos
  // renglones por su cuenta; asi cada fila tiene una altura predecible.
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm leading-snug">
          {t(event.label_key, {
            ...event.payload,
            defaultValue: t("notifications.genericEvent"),
          })}
        </p>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {format(new Date(event.created_at), "dd/MM/yyyy")}
        </span>
      </div>
      {(meta.length > 0 || state || roleChange) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {meta.map((m) => (
            <Badge
              key={m}
              variant="secondary"
              className={cn(
                "px-1.5 py-0 text-[10px]",
                // Monoespaciado solo para codigos (COT, actividad, FR-xxxx). Un nombre de
                // competencia en mono se lee como si fuera un identificador.
                isCodeMeta(m) ? "font-mono" : "max-w-[12rem] truncate",
              )}
            >
              {m}
            </Badge>
          ))}
          {roleChange && (
            <span className="flex items-center gap-1">
              {roleChange.from && (
                <>
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                  >
                    {roleLabel(roleChange.from)}
                  </Badge>
                  <span aria-hidden="true" className="text-[10px] text-muted-foreground">
                    →
                  </span>
                </>
              )}
              <Badge
                variant="outline"
                className={cn(
                  "px-1.5 py-0 text-[10px] font-medium",
                  STATE_TONE_CLASS.neutral,
                )}
              >
                {roleLabel(roleChange.to)}
              </Badge>
            </span>
          )}
          {state && (
            <Badge
              variant="outline"
              className={cn(
                "px-1.5 py-0 text-[10px] font-medium",
                STATE_TONE_CLASS[notificationStateTone(state)],
              )}
            >
              {t(`notifications.states.${state}`, { defaultValue: state })}
            </Badge>
          )}
        </div>
      )}
    </>
  );

  // `pr-10` reserva el ancho de la "x": el texto y la fecha viven adentro del enlace y la "x"
  // se pinta encima, asi que sin ese hueco se le meterian debajo.
  const interior = cn(
    "block px-4 py-2.5 pr-10",
    route && "transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
  );

  // La "x" es HERMANA del enlace, no hija. Un <button> dentro de un <a> es HTML invalido, y en
  // la practica deja la fila con dos activaciones en conflicto: el lector de pantalla la anuncia
  // como enlace y la "x" queda adentro con semantica ambigua, cuando no directamente sin
  // exponer. Cancelar el click —que es lo que habia— tapa el sintoma del mouse y no la
  // semantica, que es la mitad que le importa a quien navega por teclado.
  //
  // El enlace sigue siendo `block` y ocupa la fila entera, asi que el hover no cambia; lo unico
  // que deja de navegar es el rectangulo de la "x", que es lo correcto.
  return (
    <div
      className={cn(
        "relative border-b border-border/60 last:border-b-0",
        !event.read_at && "bg-primary/5",
      )}
    >
      {route ? (
        <Link to={route} onClick={onNavigate} className={interior}>
          {body}
        </Link>
      ) : (
        <div className={interior}>{body}</div>
      )}

      {/* Descarta SOLO esta fila, y borra de verdad. */}
      <button
        type="button"
        aria-label={t("notifications.dismiss")}
        title={t("notifications.dismiss")}
        className="absolute right-3 top-2.5 rounded p-0.5 text-muted-foreground opacity-60 transition-opacity hover:bg-muted hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
        onClick={() => onDismiss(event.notification_id)}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Una fila del feed legacy. `unseen` la resalta igual que los eventos sin leer de la zona
 * Novedades. No se atenuan las vistas: las que sobreviven al "visto" son accionables y siguen
 * pendientes, asi que bajarles el contraste seria enganoso.
 */
function LegacyAlertRow({
  alert,
  withBorder,
  unseen,
}: {
  alert: Record<string, unknown>;
  withBorder: boolean;
  unseen?: boolean;
}) {
  const { t } = useTranslation();
  const alertType = alert.alert_type as string | null;
  const detectedAt = alert.detected_at as string | null;

  return (
    <div
      className={cn(
        "space-y-1 px-4 py-3",
        withBorder && "border-b border-border",
        unseen && "bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {priorityBadge(alert.priority_level as string | null, t)}
        {detectedAt && (
          <span className="text-xs text-muted-foreground">
            {format(new Date(detectedAt), "dd/MM/yyyy")}
          </span>
        )}
      </div>
      <p className="text-sm leading-snug">
        {alertType
          ? t(`notifications.types.${alertType}`, {
              staff: (alert.staff_name as string) ?? "",
              engagement: (alert.engagement_name as string) ?? "",
              client: (alert.description as string) ?? "",
              subject: (alert.description as string) ?? "",
            })
          : ((alert.description as string) ?? "")}
      </p>
    </div>
  );
}

export function NotificationsPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data: payload = EMPTY_PAYLOAD, isError: notificationsError } =
    useNotifications();
  const markRead = useMarkNotificationsRead();
  const dismiss = useDismissNotifications();

  const { data: rawAlerts, isPending, isError } = useStaffingAlerts();
  const markSeen = useMarkAlertsSeen();

  // `can` decide si cada fila navega o se queda como texto: la matriz de notificaciones y la
  // de permisos son independientes y hoy se contradicen en varios pares rol/pantalla.
  const { can, scope } = useAuthorization();

  // Dos pseudo-permisos que no existen en el catalogo RBAC, cada uno con su predicado:
  //   - `scheduler.view`: ademas del permiso exige que el modulo este encendido. Con el flag
  //     apagado la ruta /scheduler no esta montada en App.tsx y el enlace llevaria a un 404.
  //   - `timesheet_approval.firm_read`: exige el permiso CON alcance firm, porque el contador
  //     de capacitacion cuenta toda la firma y la pantalla muestra lo que el usuario aprueba.
  const canOpenRoute = useMemo(
    () => (permission: string) => {
      if (permission === "scheduler.view") {
        return canOpenScheduler(isSchedulerEnabled(), can);
      }
      if (permission === "timesheet_approval.firm_read") {
        return canOpenTrainingApprovals(scope);
      }
      return can(permission);
    },
    [can, scope],
  );

  const pendingSections = useMemo(
    () => buildPendingSections(payload.aggregates, canOpenRoute),
    [payload.aggregates, canOpenRoute],
  );
  const eventGroups = useMemo(
    () => groupEventsByModule(payload.events),
    [payload.events],
  );

  // Los encargos que ya reporta la seccion nueva no se repiten abajo: quien es a la vez
  // creador y partner_id del mismo encargo veia la misma OT dos veces.
  const pendingEngagementIds = useMemo(() => {
    const ids = new Set<string>();
    for (const section of pendingSections) {
      for (const alarm of section.alarms) {
        for (const e of alarmEngagements(alarm)) ids.add(e.id);
      }
    }
    return ids;
  }, [pendingSections]);

  const alerts = useMemo(
    () =>
      // visibleLegacyAlerts descarta las INFORMATIVAS ya vistas (new_user_registered,
      // engagement_created): comunicaron lo que tenian que comunicar y no piden accion. Las
      // derivadas de estado vivo (work_order_pending_approval, timesheet_pending_approval)
      // se quedan aunque esten vistas, porque el trabajo sigue pendiente.
      //
      // El unico descarte de aca es por DUPLICADO, y exige que el agregado nuevo cubra LA MISMA
      // fila: `engagement.pending_partner_approval` pinta ese encargo, asi que la legacy sobra.
      //
      // `timesheet_pending_approval` NO se descarta, aunque el catalogo tenga un tipo de nombre
      // casi igual: son destinatarios OPUESTOS. La vista le da la fila a `tla.approved_by` —el
      // que REVISA— y `notif_agg_timesheet_pending_approval` filtra por `tp.staff_id`, o sea la
      // boleta PROPIA del que envio. Ningun agregado del catalogo cuenta "lineas que yo tengo
      // que aprobar" (`approval.training_pending` es solo capacitacion, funcion = 2), asi que
      // descartarla dejaba al aprobador sin la fila persistente: solo le quedaba el evento
      // `timesheet.team_submitted_for_approval`, que se lee una vez y desaparece.
      visibleLegacyAlerts(rawAlerts ?? []).filter(
        (a) =>
          !(
            a.alert_type === "work_order_pending_approval" &&
            a.engagement_id &&
            pendingEngagementIds.has(a.engagement_id)
          ),
      ),
    [rawAlerts, pendingEngagementIds],
  );

  // El badge mide lo que RECLAMA atencion, no el historico: una alerta ya vista deja de
  // sumar. `seen_at` lo expone la vista desde 20260909100000_staffing_alerts_seen_at.sql;
  // antes de esa migracion la columna no existia y el contador no bajaba nunca.
  //
  const unseenAlerts = useMemo(() => alerts.filter((a) => !a.seen_at), [alerts]);

  const legacyCount = alerts.length;
  const total = bellCount(payload) + unseenAlerts.length;
  const hasAnything =
    pendingSections.length > 0 || eventGroups.length > 0 || legacyCount > 0;

  // Se marca al CERRAR el panel, no al abrirlo: marcando en la apertura, el refetch mueve
  // las filas al grupo colapsado mientras el usuario todavia las esta leyendo.
  const wasOpen = useRef(false);
  useEffect(() => {
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closing) return;

    // Los eventos del catalogo nuevo se marcan leidos con su propio RPC...
    const ids = unreadIds(payload.events);
    if (ids.length) markRead.mutate(ids);

    // ...y las alertas legacy siguen usando staff_alert_seen. Los contadores NO entran aca:
    // son agregados sin entity_id y romperian el onConflict de la tabla.
    const unseen = unseenAlerts
      .map((a) => ({
        staff_id: a.staff_id as string,
        entity_id: a.entity_id as string,
        alert_type: a.alert_type as string,
      }));
    if (unseen.length) markSeen.mutate(unseen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unseenAlerts, payload.events]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative flex-shrink-0"
          aria-label={t("notifications.count", { count: total })}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {/* El total numerico reemplaza al punto de "no leido": el packet pide el numero. */}
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none tabular-nums text-destructive-foreground">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      {/* El ancho se ata al viewport y recien despues se topea: `w-96` a secas son 384px fijos,
          mas anchos que un telefono de 360 o 375, y el contenido quedaba cortado. En pantalla
          grande el calc da miles de px y manda el max-w, asi que ahi no cambia nada. */}
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-96 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold">
            {t("notifications.title")}
          </span>
          {total > 0 && (
            <Badge variant="secondary" className="text-xs">
              {t("notifications.count", { count: total })}
            </Badge>
          )}
        </div>

        <Separator />

        {/* Un div con overflow, NO el ScrollArea de Radix: su Root queda con altura auto y
            el Viewport interno usa h-full, que contra un padre auto no resuelve — el
            contenido se recortaba sin poder scrollear (visto con 23 alertas, 2026-09-09). */}
        <div className="max-h-96 overflow-y-auto overscroll-contain">
          {/* Pendientes */}
          {pendingSections.length > 0 && (
            <div className="pb-1">
              <div className="px-4 pt-3 pb-0.5">
                <span className="text-sm font-semibold">
                  {t("notifications.pending")}
                </span>
              </div>
              {pendingSections.map((section) => (
                <div key={section.section}>
                  <SectionHeading
                    total={section.total}
                    icon={SECTION_ICON[section.section]}
                  >
                    {t(`notifications.sections.${section.section}`)}
                  </SectionHeading>
                  {section.alarms.map((alarm) => (
                    <AlarmRow
                      key={alarm.typeKey}
                      alarm={alarm}
                      onNavigate={() => setOpen(false)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Novedades */}
          {eventGroups.length > 0 && (
            <div className="pb-1">
              {pendingSections.length > 0 && <Separator />}
              <div className="px-4 pt-3 pb-0.5">
                <span className="text-sm font-semibold">
                  {t("notifications.news")}
                </span>
              </div>
              {eventGroups.map((group) => (
                <div key={group.module}>
                  <SectionHeading
                    total={group.events.length}
                    icon={MODULE_ICON[group.module]}
                  >
                    {t(`notifications.modules.${group.module}`)}
                  </SectionHeading>
                  {group.events.map((event) => (
                    <EventRow
                      key={event.notification_id}
                      event={event}
                      onNavigate={() => setOpen(false)}
                      onDismiss={(id) => dismiss.mutate([id])}
                      can={can}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Alertas de staffing. Una sola lista: las informativas ya vistas ni llegan
              hasta aca (visibleLegacyAlerts las descarta). Lo que queda son las no vistas y
              las accionables que siguen pendientes; las no vistas se resaltan. */}
          {legacyCount > 0 && (
            <div>
              {(pendingSections.length > 0 || eventGroups.length > 0) && (
                <Separator />
              )}
              {alerts.map((alert, idx) => (
                <LegacyAlertRow
                  key={alert.entity_id ?? idx}
                  alert={alert}
                  withBorder={idx < legacyCount - 1}
                  unseen={!alert.seen_at}
                />
              ))}
            </div>
          )}

          {isPending && !hasAnything && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("notifications.loading")}
            </p>
          )}

          {(isError || notificationsError) && !hasAnything && (
            <p className="px-4 py-6 text-center text-sm text-destructive">
              {t("notifications.error")}
            </p>
          )}

          {/* `notificationsError` tambien cuenta, y no solo `isError`: son DOS consultas (la
              bandeja nueva y las alertas legacy) y cualquiera de las dos puede fallar sola.
              Mirando solo `isError`, una bandeja caida con el feed legacy vacio pintaba el
              mensaje de error Y "todo al dia" uno debajo del otro — que es lo contrario de lo
              que se sabe: no se sabe si hay algo pendiente, justamente porque no cargo. */}
          {!isPending && !isError && !notificationsError && !hasAnything && (
            <div className="space-y-1 px-4 py-8 text-center">
              <p className="text-sm font-medium">
                {t("notifications.allClear")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("notifications.allClearDescription")}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
