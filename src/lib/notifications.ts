/**
 * NOTIFICACIONES — FASE 1: forma del payload de `get_my_notifications()` y funciones puras
 * para agruparlo.
 *
 * Dos formas de entrega, decididas en la matriz (`docs/matriz-notificaciones.md`, D-16):
 *
 * - **Evento** (`delivery = 'event'`): una fila por suceso, con leído/no leído. Avisa la
 *   TRANSICIÓN — "el Gerente X te rechazó la línea del encargo 1042". Llega una vez y se va.
 * - **Agregado** (`delivery = 'aggregate'`): no se persiste, se calcula al vuelo. Mide el
 *   BACKLOG — "seguís teniendo 3 timesheets revertidos". No se va hasta que lo resuelvas.
 *
 * Un mismo hecho puede tener las dos formas cuando puede apilarse. En el panel nunca aparecen
 * juntos: el evento va en "Novedades", el contador en "Pendientes".
 *
 * Este módulo es puro a propósito (sin React, sin Supabase) — mismo criterio que
 * `src/lib/engagementStatus.ts`: toda la lógica testeable sin levantar nada.
 */

/** Módulos del catálogo. Espejo de `notification_types.module_key`. */
export type NotificationModule =
  | "auth"
  | "client"
  | "engagement"
  | "worksheet"
  | "work_order"
  | "fund_request"
  | "timesheet"
  | "timesheet_approval"
  | "tracker"
  | "scheduler";

/** Una instancia de notificación de tipo evento. */
export interface NotificationEvent {
  notification_id: string;
  type_key: string;
  module_key: NotificationModule;
  /** Clave i18n: `notifications.types.<type_key>`. */
  label_key: string;
  /** Id del objeto que la disparó (encargo, OT, solicitud…). Puede faltar. */
  entity_id: string | null;
  /** Datos para interpolar en la etiqueta. Su forma la define cada disparador. */
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

/** Un contador, con el detalle que el backend pudo aportar. */
export interface AggregateBucket {
  count: number;
  /** Sólo lo trae `timesheet.overdue`. */
  missing_hours?: number;
  items?: Array<Record<string, unknown>>;
}

/** Lo que devuelve el RPC `get_my_notifications()`. */
export interface NotificationsPayload {
  events: NotificationEvent[];
  /** Indexado por `type_key`. Sólo trae los tipos que la matriz le concede al rol. */
  aggregates: Record<string, AggregateBucket>;
  unread_count: number;
}

export const EMPTY_PAYLOAD: NotificationsPayload = {
  events: [],
  aggregates: {},
  unread_count: 0,
};

/**
 * Normaliza lo que llega del RPC. El backend es `SECURITY DEFINER` y siempre devuelve la
 * forma completa, pero un payload a medias (RPC todavía no aplicado, error de red servido
 * desde caché) no debe reventar el panel.
 */
export function normalizePayload(raw: unknown): NotificationsPayload {
  if (!raw || typeof raw !== "object") return EMPTY_PAYLOAD;
  const p = raw as Partial<NotificationsPayload>;
  return {
    events: Array.isArray(p.events) ? p.events : [],
    aggregates:
      p.aggregates && typeof p.aggregates === "object" ? p.aggregates : {},
    unread_count: typeof p.unread_count === "number" ? p.unread_count : 0,
  };
}

/** Suma de todos los contadores activos. */
export function totalAggregateCount(
  aggregates: Record<string, AggregateBucket>,
): number {
  return Object.values(aggregates).reduce(
    (sum, bucket) => sum + (bucket?.count ?? 0),
    0,
  );
}

/**
 * Número que va sobre la campana: eventos sin leer + backlog pendiente.
 *
 * Se usa `unread_count` (que cuenta TODA la bandeja sin leer) y no `events.length`, porque
 * `get_my_notifications()` recorta los eventos a `p_limit`: con 60 sin leer y un límite de
 * 50, el badge debe decir 60, no 50.
 */
export function bellCount(payload: NotificationsPayload): number {
  return payload.unread_count + totalAggregateCount(payload.aggregates);
}

/** Eventos sin leer, más recientes primero. */
export function unreadEvents(
  events: NotificationEvent[],
): NotificationEvent[] {
  return events.filter((e) => !e.read_at);
}

/**
 * Agrupa eventos por módulo conservando el orden de llegada (el RPC ya los devuelve por
 * `created_at DESC`). Devuelve sólo los módulos con al menos un evento, para que el panel no
 * tenga que filtrar encabezados vacíos.
 */
export function groupEventsByModule(
  events: NotificationEvent[],
): Array<{ module: NotificationModule; events: NotificationEvent[] }> {
  const order: NotificationModule[] = [];
  const buckets = new Map<NotificationModule, NotificationEvent[]>();

  for (const event of events) {
    const existing = buckets.get(event.module_key);
    if (existing) {
      existing.push(event);
    } else {
      buckets.set(event.module_key, [event]);
      order.push(event.module_key);
    }
  }

  return order.map((module) => ({
    module,
    events: buckets.get(module) ?? [],
  }));
}

/** Ids de los eventos sin leer — lo que se le pasa a `mark_notifications_read()`. */
export function unreadIds(events: NotificationEvent[]): string[] {
  return unreadEvents(events).map((e) => e.notification_id);
}

/* ------------------------------------------------------------------------- *
 * Zona "Pendientes" del panel — presentación de los contadores.
 * ------------------------------------------------------------------------- */

/**
 * Secciones de la zona Pendientes. Las dos primeras vienen del packet 0601-130; el resto se
 * agrega por modulo a medida que la Fase 3 suma contadores.
 */
export type PendingSectionKey =
  | "time_control"
  | "engagement_status"
  | "fund_request"
  | "payment_plan"
  | "training"
  | "coverage";

export interface AlarmSpec {
  typeKey: string;
  section: PendingSectionKey;
  /** Mejora A: a dónde lleva la fila al hacer click. */
  route: string;
  /**
   * Permiso que `App.tsx` le exige a esa ruta. Sin él, la fila NO linkea.
   *
   * No es paranoia: la matriz de notificaciones y la de permisos son independientes, y hoy
   * se contradicen en dos lugares. `wo.installment.*` va a Contabilidad y Cobranzas, que no
   * tienen `work_order.read`; `fund.*.pending` va también al Analista de Contabilidad, que
   * no tiene `fund_disbursement.read`. Sin este campo, esas personas hacían click en su
   * propio contador y aterrizaban en la pantalla "Sin acceso" — peor que no poder navegar.
   */
  permission: string;
}

/**
 * Orden FIJO por criticidad (mejora D), no por contador: que las filas no salten de lugar
 * entre refrescos es más importante que ver primero la más numerosa.
 *
 * Cubre los 13 `aggregate` de la matriz — todos los que `get_my_notification_aggregates()`
 * calcula.
 */
export const PENDING_ALARMS: readonly AlarmSpec[] = [
  { typeKey: "timesheet.overdue", section: "time_control", route: "/timesheet", permission: "timesheet.read" },
  { typeKey: "timesheet.reverted", section: "time_control", route: "/timesheet", permission: "timesheet.read" },
  { typeKey: "timesheet.pending_approval", section: "time_control", route: "/timesheet", permission: "timesheet.read" },
  { typeKey: "engagement.rejected_by_partner", section: "engagement_status", route: "/engagements", permission: "engagement.read" },
  { typeKey: "engagement.pending_partner_approval", section: "engagement_status", route: "/engagements", permission: "engagement.read" },
  // FASE 3.a — Fondos. Alcance `department`: son la cola de trabajo del area de
  // Contabilidad, no algo del usuario, asi que la ruta lleva a la bandeja del area.
  // Cada contador lleva a SU bandeja del modulo de desembolsos, no a la primera pestania:
  // aprobado_gerente -> to_disburse, en_liquidacion -> in_settlement (mapeo de
  // FundRequestDisbursements.tsx).
  { typeKey: "fund.disbursement.pending", section: "fund_request", route: "/fund-requests/disbursements?tab=to_disburse", permission: "fund_disbursement.read" },
  { typeKey: "fund.expense.review_pending", section: "fund_request", route: "/fund-requests/disbursements?tab=expenses_review", permission: "fund_disbursement.read" },
  { typeKey: "fund.settlement.pending", section: "fund_request", route: "/fund-requests/disbursements?tab=in_settlement", permission: "fund_disbursement.read" },
  { typeKey: "fund.request.closure_pending", section: "fund_request", route: "/fund-requests/disbursements?tab=in_settlement", permission: "fund_disbursement.read" },
  // FASE 3.b — cuotas del plan de pagos. No se solapan: "por vencer" cuenta de hoy al
  // domingo, "vencida" cuenta lo anterior a hoy. La vencida va primero por criticidad.
  //
  // Las dos llevan al listado de OT y no a una OT concreta porque el contador agrega varias,
  // y el listado no acepta filtro por URL: mandar a /work-orders/<algo> seria inventar un
  // destino. Si algun dia el listado toma query params, aca se afina.
  { typeKey: "wo.installment.overdue", section: "payment_plan", route: "/work-orders", permission: "work_order.read" },
  { typeKey: "wo.installment.due_this_week", section: "payment_plan", route: "/work-orders", permission: "work_order.read" },
  // FASE 3.d — capacitacion. Va ultimo: es la cola de UN area (ADM y Talento Humano), no
  // algo del usuario, y no compite en criticidad con lo propio.
  //
  // El enlace exige el permiso CON ALCANCE FIRM, no solo el permiso (D-42). El contador
  // cuenta la capacitacion de toda la firma, y `/timesheet/approvals` muestra lo que el
  // usuario aprueba: si los dos alcances no coinciden, el numero de la campana promete mas
  // de lo que la pantalla entrega.
  //
  //   - admin / senior_partner tienen `timesheet_approval.read` con alcance `firm`, que es
  //     lo que abre las policies "Firm-wide read periods"/"Firm-wide read line approvals".
  //     Para ellos la pantalla si muestra lo que el contador cuenta: linkean.
  //   - hr_manager tiene el permiso con alcance `assigned_engagements` (0817-180): el enlace
  //     lo dejaria entrar, pero a una pantalla con menos filas que el numero. No linkea.
  //   - hr_analyst no tiene el permiso (0817-180 deja fuera a los `*_analyst`). No linkea.
  //
  // Talento Humano ve el contador igual —el backlog existe y es suyo—, solo que sin enlace
  // hasta que exista la pantalla de aprobacion de capacitacion. Ese es el permiso que de
  // verdad le calza, `timesheet_admin_training_approval.manage` (alcance `department`, que
  // ambos ya tienen), y que hoy no consume ninguna pantalla.
  { typeKey: "approval.training_pending", section: "training", route: "/timesheet/approvals", permission: "timesheet_approval.firm_read" },
  // FASE 3.h — cobertura. El destino es el Scheduler, que es donde se asigna gente, y no la
  // pantalla de gaps (que muestra otra cosa: los 4 gaps analiticos de la edge function).
  //
  // `scheduler.view` no es un permiso del catalogo RBAC: es un pseudo-permiso que el panel
  // resuelve como "el modulo esta habilitado Y el usuario puede ver encargos". Con
  // VITE_SCHEDULER_ENABLED apagado la ruta /scheduler no existe en App.tsx, asi que la fila
  // se pinta sin enlace en vez de mandar a un 404.
  { typeKey: "scheduler.coverage_gap", section: "coverage", route: "/scheduler", permission: "scheduler.view" },
];

/**
 * Permiso sintetico del contador de cobertura. Vive aca —y no en el panel— para que el
 * predicado sea testeable sin render: el panel solo compone `can` con esto.
 */
export function canOpenScheduler(
  schedulerEnabled: boolean,
  can: (permission: string) => boolean,
): boolean {
  return schedulerEnabled && can("engagement.read");
}

/**
 * Permiso sintetico del contador de capacitacion (D-42).
 *
 * No alcanza con TENER `timesheet_approval.read`: hace falta tenerlo con alcance `firm`, que
 * es el unico que abre las policies firmwide de `timesheet_periods`/`timesheet_line_approvals`
 * (cero_05). Con `assigned_engagements` la pantalla muestra solo los encargos del usuario,
 * mientras el contador cuenta toda la firma, y el enlace termina desmintiendo al numero.
 */
export function canOpenTrainingApprovals(
  scope: (permission: string) => string | null,
): boolean {
  return scope("timesheet_approval.read") === "firm";
}

export interface PendingAlarm extends Omit<AlarmSpec, "route"> {
  count: number;
  /** `null` cuando el usuario no tiene el permiso de la ruta: la fila se pinta sin enlace. */
  route: string | null;
  /** Sólo `timesheet.overdue`. Mejora B: se muestra junto al contador. */
  missingHours?: number;
  items: Array<Record<string, unknown>>;
}

export interface PendingSection {
  section: PendingSectionKey;
  /** Mejora E: subtotal en el encabezado. */
  total: number;
  alarms: PendingAlarm[];
}

/**
 * Arma la zona "Pendientes".
 *
 * Decisión de UX (2026-09-08): las alarmas en cero **no se muestran**, y una sección sin
 * alarmas activas desaparece entera. La campana se escanea en un segundo; cada fila en `(0)`
 * empuja hacia abajo lo que sí importa. El packet pide "un contador por cada alarma", nunca
 * que las vacías se pinten.
 *
 * El gateo por rol ya viene resuelto del backend: `aggregates` sólo trae los tipos que la
 * matriz le concede al usuario. Si a alguien no le corresponde la sección, sus claves no
 * llegan y la sección no se arma.
 */
export function buildPendingSections(
  aggregates: Record<string, AggregateBucket>,
  can?: (permission: string) => boolean,
): PendingSection[] {
  const sections: PendingSection[] = [];

  for (const spec of PENDING_ALARMS) {
    const bucket = aggregates[spec.typeKey];
    const count = bucket?.count ?? 0;
    if (count <= 0) continue;

    const alarm: PendingAlarm = {
      ...spec,
      // El contador se muestra igual —el backlog existe y es suyo—, pero sin enlace si la
      // pantalla destino le está vedada. Sin `can` (tests, render sin sesión) se linkea todo.
      route: !can || can(spec.permission) ? spec.route : null,
      count,
      items: Array.isArray(bucket?.items) ? bucket.items : [],
    };
    if (typeof bucket?.missing_hours === "number" && bucket.missing_hours > 0) {
      alarm.missingHours = bucket.missing_hours;
    }

    const existing = sections.find((s) => s.section === spec.section);
    if (existing) {
      existing.alarms.push(alarm);
      existing.total += count;
    } else {
      sections.push({ section: spec.section, total: count, alarms: [alarm] });
    }
  }

  return sections;
}

/**
 * Los COT que la alarma `timesheet.pending_approval` reporta, ya aplanados y sin repetir
 * (mejora C: se pintan como chips). El backend ya devuelve `DISTINCT` por período; esto
 * deduplica entre períodos, porque el mismo encargo puede estar pendiente en dos semanas.
 */
export function pendingApprovalCots(alarm: PendingAlarm): string[] {
  const seen = new Set<string>();
  for (const item of alarm.items) {
    const cots = (item as { cots?: unknown }).cots;
    if (!Array.isArray(cots)) continue;
    for (const cot of cots) {
      if (typeof cot === "string" && cot) seen.add(cot);
    }
  }
  return [...seen];
}

/** Encargos que la alarma reporta, para linkear cada uno a su detalle (mejora A/C). */
export function alarmEngagements(
  alarm: PendingAlarm,
): Array<{ id: string; code: string }> {
  const out: Array<{ id: string; code: string }> = [];
  for (const item of alarm.items) {
    const row = item as { engagement_id?: unknown; engagement_code?: unknown };
    if (typeof row.engagement_id === "string" && row.engagement_id) {
      out.push({
        id: row.engagement_id,
        code:
          typeof row.engagement_code === "string" && row.engagement_code
            ? row.engagement_code
            : "—",
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------- *
 * Feed legacy (vw_staffing_alerts) — que se descarta al verlo y que no.
 * ------------------------------------------------------------------------- */

/**
 * Tipos del feed legacy que el catalogo nuevo YA emite, y que por lo tanto no deben pintarse
 * dos veces. Se descartan siempre, vistos o no.
 *
 * `engagement_created` lo cubre `engagement.created` desde la Fase 3.c; `new_user_registered`
 * lo cubre `auth.user.registered` desde la 3.e. Los dos que quedan en la vista
 * (`work_order_pending_approval`, `timesheet_pending_approval`) se DERIVAN DE ESTADO VIVO:
 * existen mientras la OT siga en `Pending_Approval` o queden lineas sin aprobar, asi que no
 * se descartan por "vistos" — eso esconderia trabajo que sigue pendiente.
 *
 * Es el mismo eje que separa `event` de `aggregate` en el catalogo nuevo: informativa = una
 * transicion que se lee una vez; estado vivo = un backlog que persiste hasta resolverse. El
 * feed legacy mezcla las dos porque nacio antes de esa distincion, y se vacia a medida que
 * cada fila gana su emisor.
 */
export const SUPERSEDED_LEGACY_ALERTS: readonly string[] = [
  "engagement_created",
  "new_user_registered",
];

/** Forma minima que necesita el filtro; la vista trae mas columnas. */
export interface LegacyAlertLike {
  alert_type?: string | null;
  seen_at?: string | null;
}

/**
 * Las alertas legacy que siguen mereciendo un lugar en el panel: las que ningun disparador
 * del catalogo emite todavia. `seen_at` no entra en la decision — las que sobreviven son
 * accionables y siguen pendientes, asi que ocultarlas por vistas seria enganoso; el "visto"
 * solo baja el badge.
 */
export function visibleLegacyAlerts<T extends LegacyAlertLike>(
  alerts: T[],
): T[] {
  return alerts.filter(
    (a) => !SUPERSEDED_LEGACY_ALERTS.includes(a.alert_type ?? ""),
  );
}

/* ------------------------------------------------------------------------- *
 * Presentacion de eventos: estado como badge, y destino al hacer click.
 * ------------------------------------------------------------------------- */

/** Tono visual de un estado. El mapeo a clases vive en el panel, no aca. */
export type NotificationStateTone =
  | "success"
  | "warning"
  | "destructive"
  | "neutral";

/**
 * Estados conocidos -> tono. Explicito y no por palabra clave: un `IF texto CONTIENE 'aprob'`
 * parece general hasta que aparece un "no aprobado". Cada modulo de la Fase 3 agrega los
 * suyos aca; lo desconocido cae a `neutral` en vez de pintarse mal.
 */
const STATE_TONES: Record<string, NotificationStateTone> = {
  // Solicitudes de Fondos
  aprobado_gerente: "success",
  cerrado: "success",
  fondos_entregados: "success",
  observado: "warning",
  pendiente_aprobacion: "warning",
  en_liquidacion: "warning",
  rechazado: "destructive",
  cancelado: "destructive",
  // Ordenes de Trabajo (Fase 3.b)
  Approved: "success",
  Emergency_Approved: "success",
  Pending_Approval: "warning",
  Draft: "neutral",
  Rejected: "destructive",
  // Cuotas del plan de pagos. 'Pending' lo comparten la cuota sin facturar y la pista de
  // Riesgos sin veredicto: en los dos casos es "todavia nadie la toco", asi que neutral.
  Pending: "neutral",
  Invoiced: "warning",
  Completed: "success",
  Overdue: "destructive",
};

export function notificationStateTone(state: string): NotificationStateTone {
  return STATE_TONES[state] ?? "neutral";
}

/**
 * El estado que un evento quiere mostrar como badge, si trae alguno.
 *
 * Se buscan tres nombres porque cada modulo nombra distinto lo mismo: `decision` es lo que
 * emite Fondos, `status`/`state` es lo natural en los demas. Un solo lugar para no repetir
 * el criterio en cada disparador.
 */
export function notificationState(event: NotificationEvent): string | null {
  const p = event.payload ?? {};
  for (const key of ["decision", "status", "state"]) {
    const raw = p[key];
    if (typeof raw === "string" && raw) return raw;
  }
  return null;
}

/** Permiso que exige la ruta destino de cada modulo, segun `App.tsx`. */
const MODULE_ROUTE_PERMISSION: Partial<Record<NotificationModule, string>> = {
  fund_request: "fund_request.read",
  work_order: "work_order.read",
  engagement: "engagement.read",
  // El destino de estos tres es la pantalla del PROPIO usuario (su hoja de tiempo, su
  // cronometro), no una bandeja de otros: por eso `timesheet.read` / `time_entry.read`, que
  // los 17 roles que reportan horas tienen con alcance `own`.
  timesheet: "timesheet.read",
  timesheet_approval: "timesheet.read",
  tracker: "time_entry.read",
  client: "client.read",
  // FASE 3.e. El modulo `auth` cubre cuentas Y personal, y las dos mitades terminan en la
  // misma pantalla: la ficha de staff.
  auth: "staff.read",
};

/**
 * Tipos que se apartan del permiso de su modulo, porque su destino es otra pantalla.
 *
 * Los dos eventos de envio AJENO del modulo Timesheets llevan al detalle de aprobacion
 * (`/timesheet/approvals/:periodId`), que exige `timesheet_approval.read` — un permiso que
 * NO tienen los seniors, semis ni asistentes. Sin esta excepcion, el modulo entero se
 * gatearia por `timesheet.read` y esas personas terminarian en "Sin acceso" si algun dia la
 * matriz les concede uno de estos dos tipos.
 */
const TYPE_ROUTE_PERMISSION: Record<string, string> = {
  "timesheet.weekly_submitted": "timesheet_approval.read",
  "timesheet.team_submitted_for_approval": "timesheet_approval.read",
};

/**
 * A donde lleva un evento al hacer click, o `null` si todavia no hay destino para su modulo
 * o si el usuario no puede abrir esa pantalla.
 *
 * Los modulos se van agregando con su fase; devolver `null` hace que la fila se pinte como
 * texto en vez de como enlace, que es preferible a mandar al usuario a una ruta inventada.
 *
 * El chequeo de permiso es la otra mitad, y hace falta desde la Fase 3.c: `engagement.read`
 * NO lo tienen senior/semisenior/assistant ni sus variantes ITA/TAX, que son justamente
 * quienes reciben `engagement.finalized`, `engagement.encargado_assigned` y
 * `engagement.staffing.changed`. Sin esto, "te asignaron al encargo X" los llevaba a una
 * pantalla "Sin acceso" a pantalla completa.
 */
export function notificationRoute(
  event: NotificationEvent,
  can?: (permission: string) => boolean,
): string | null {
  const permission =
    TYPE_ROUTE_PERMISSION[event.type_key] ??
    MODULE_ROUTE_PERMISSION[event.module_key];
  if (can && permission && !can(permission)) return null;

  switch (event.module_key) {
    case "fund_request": {
      // Los eventos de GASTO llevan fre_id en entity_id, que no es parametro de ninguna
      // ruta: el destino es la pantalla de gastos de su solicitud, cuyo id viaja en el
      // payload. Los de SOLICITUD si llevan el fund_request_id directo.
      // El consolidado se emite sobre la SOLICITUD (entity_id = fund_request_id), no sobre
      // un gasto: va al detalle, no a la pantalla de gastos.
      if (event.type_key === "fund.expenses.all_reviewed") {
        return event.entity_id ? `/fund-requests/${event.entity_id}/expenses` : null;
      }
      if (event.type_key.startsWith("fund.expense.")) {
        const requestId = event.payload?.fund_request_id;
        return typeof requestId === "string" && requestId
          ? `/fund-requests/${requestId}/expenses`
          : null;
      }
      // /fund-requests/:id es la vista de revision: es a donde navega la propia pantalla
      // de aprobaciones al hacer click en una fila.
      return event.entity_id ? `/fund-requests/${event.entity_id}` : null;
    }
    case "work_order": {
      // Todos los eventos del modulo llevan wo_id en entity_id, incluidos los de cuota: la
      // cuota no tiene pantalla propia, se edita en la pestania "Plan de pagos" de su OT.
      // Las pestanias no viajan por URL (WorkOrderForm las abre por estado), asi que el
      // destino es la OT y punto.
      return event.entity_id ? `/work-orders/${event.entity_id}` : null;
    }
    case "engagement": {
      // El borrado de encargo es DURO: el trigger corre en TG_OP='DELETE' y emite el id de la
      // fila que acaba de desaparecer, asi que /engagements/:id lleva al cartel
      // `engagement.unavailable`. No hay "pantalla donde mirar que paso" — no quedo nada que
      // mirar, y el aviso ya trae el codigo y el nombre en el payload. Vale la regla de arriba:
      // sin enlace se pinta como texto, que es preferible a mandar a una ruta muerta.
      if (event.type_key === "engagement.deleted") return null;

      // El resto lleva engagement_id en entity_id, incluidos los de staffing: la asignacion no
      // tiene pantalla propia, se edita en el equipo del encargo.
      return event.entity_id ? `/engagements/${event.entity_id}` : null;
    }
    case "timesheet": {
      // Dos destinos, segun de quien sea la boleta. El acuse propio va a MI hoja de tiempo
      // (`/timesheet` no toma la semana por URL: TimeSheet.tsx no lee searchParams, asi que
      // el destino es la pantalla y punto). Los dos avisos sobre la boleta de OTRO van al
      // detalle de aprobacion de ese periodo, que si lo toma por ruta.
      if (event.type_key === "timesheet.own_submit_confirmed") return "/timesheet";
      return event.entity_id
        ? `/timesheet/approvals/${event.entity_id}`
        : null;
    }
    case "timesheet_approval": {
      // El veredicto es sobre una linea MIA: el destino es mi hoja de tiempo, no la bandeja
      // de aprobaciones. `entity_id` es el approval_id, que no es parametro de ninguna ruta.
      return "/timesheet";
    }
    case "tracker": {
      // entity_id = timer_id, que es justo el parametro de /tracker/:id (TrackerEdit): el
      // cronometro que se cerro solo es lo primero que el usuario va a querer corregir.
      return event.entity_id ? `/tracker/${event.entity_id}` : null;
    }
    case "client": {
      // entity_id = client_id, que es el parametro de /clients/:id (ClientEdit).
      return event.entity_id ? `/clients/${event.entity_id}` : null;
    }
    case "auth": {
      // Se rutea por `payload.staff_id` y no por entity_id: los eventos de CUENTA
      // (registro, cambio de rol, borrado) nacen en `user_roles`, donde lo que hay es un
      // user_id. El disparador resuelve la ficha cuando existe y la deja en el payload; sin
      // ficha no hay pantalla a la que ir — es el caso del borrado de cuenta, que solo
      // ocurre cuando NO queda staff vinculado.
      const staffId = event.payload?.staff_id;
      return typeof staffId === "string" && staffId ? `/staff/${staffId}` : null;
    }
    default:
      return null;
  }
}

/**
 * Identificadores cortos que un evento puede mostrar en su segunda linea (numero de
 * solicitud, COT del encargo...). Se pintan como chips debajo del texto.
 *
 * Existe para sacar los identificadores DEL TEXTO: "Contabilidad aprobo tu gasto de BOB 40 ·
 * FR-2026-2027" no entra en el ancho del panel y parte en dos renglones, asi que cada fila
 * ocupaba el doble. El texto se queda con la accion, y la referencia baja a un chip.
 *
 * Es generico a proposito: cada modulo pone en su payload las claves que le sirven, y las que
 * esten se muestran en este orden.
 */
export function notificationMeta(event: NotificationEvent): string[] {
  const p = event.payload ?? {};
  const out: string[] = [];
  // `activity_code` lo traen los eventos de la Fase 3.d: una linea de timesheet se identifica
  // por el par encargo + actividad, y sin el codigo de actividad dos filas del mismo encargo
  // se ven idénticas en el panel.
  //
  // `skill_name` (3.e) no es un codigo sino texto libre; entra igual porque cumple la misma
  // funcion —sacar el identificador DEL TEXTO— y el panel decide la tipografia por la forma
  // del valor, no por la clave.
  for (const key of ["request_number", "engagement_code", "activity_code", "cot", "skill_name"]) {
    const raw = p[key];
    if (typeof raw === "string" && raw.trim()) out.push(raw.trim());
  }
  return out;
}

/** ¿El chip es un codigo (COT, actividad, numero de solicitud) o texto libre? */
export function isCodeMeta(value: string): boolean {
  return /^[\w.\-/]+$/.test(value);
}

/**
 * El cambio de rol de un evento `auth.role.changed`, para pintarlo como badges en vez de
 * incrustarlo en el texto.
 *
 * Sin esto la fila decia "Cambio el rol de Giovanna Callizaya: semisenior -> senior" y partia
 * en dos renglones; ademas mostraba el `role_key` crudo, que es una clave interna. El panel
 * traduce cada uno con `authz.role.<role_key>`, que ya existe para los 23 roles.
 */
export function notificationRoleChange(
  event: NotificationEvent,
): { from: string | null; to: string } | null {
  if (event.type_key !== "auth.role.changed") return null;
  const p = event.payload ?? {};
  const to = p.role_key;
  if (typeof to !== "string" || !to) return null;
  const from = p.previous_role_key;
  return {
    from: typeof from === "string" && from ? from : null,
    to,
  };
}
