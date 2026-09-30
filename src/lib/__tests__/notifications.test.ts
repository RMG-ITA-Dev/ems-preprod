import { describe, it, expect } from "vitest";
import {
  EMPTY_PAYLOAD,
  PENDING_ALARMS,
  bellCount,
  buildPendingSections,
  groupEventsByModule,
  normalizePayload,
  totalAggregateCount,
  unreadEvents,
  unreadIds,
  visibleLegacyAlerts,
  notificationState,
  notificationStateTone,
  notificationRoute,
  notificationMeta,
  notificationRoleChange,
  isCodeMeta,
  canOpenScheduler,
  canOpenTrainingApprovals,
  alarmEngagements,
  type NotificationEvent,
  type NotificationModule,
} from "../notifications";
import { canSeePlanning } from "@/lib/schedulerAccess";

function event(
  id: string,
  module: NotificationModule,
  opts: { read?: boolean; type?: string; created?: string } = {},
): NotificationEvent {
  return {
    notification_id: id,
    type_key: opts.type ?? `${module}.something`,
    module_key: module,
    label_key: `notifications.types.${opts.type ?? `${module}.something`}`,
    entity_id: null,
    payload: {},
    created_at: opts.created ?? "2026-09-08T10:00:00Z",
    read_at: opts.read ? "2026-09-08T11:00:00Z" : null,
  };
}

describe("normalizePayload", () => {
  it("devuelve el payload vacío ante null/undefined/primitivos", () => {
    expect(normalizePayload(null)).toEqual(EMPTY_PAYLOAD);
    expect(normalizePayload(undefined)).toEqual(EMPTY_PAYLOAD);
    expect(normalizePayload("nope")).toEqual(EMPTY_PAYLOAD);
  });

  it("rellena las claves que falten sin perder las que sí vienen", () => {
    const result = normalizePayload({ unread_count: 3 });
    expect(result.events).toEqual([]);
    expect(result.aggregates).toEqual({});
    expect(result.unread_count).toBe(3);
  });

  it("descarta un events que no sea array", () => {
    expect(normalizePayload({ events: "boom" }).events).toEqual([]);
  });

  it("conserva un payload completo", () => {
    const raw = {
      events: [event("n1", "timesheet")],
      aggregates: { "timesheet.overdue": { count: 2 } },
      unread_count: 1,
    };
    expect(normalizePayload(raw)).toEqual(raw);
  });
});

describe("totalAggregateCount", () => {
  it("es 0 sin contadores", () => {
    expect(totalAggregateCount({})).toBe(0);
  });

  it("suma todos los contadores", () => {
    expect(
      totalAggregateCount({
        "timesheet.overdue": { count: 3 },
        "timesheet.reverted": { count: 1 },
        "engagement.rejected_by_partner": { count: 2 },
      }),
    ).toBe(6);
  });

  it("cuenta los buckets en cero sin romperse", () => {
    expect(
      totalAggregateCount({
        "timesheet.overdue": { count: 0 },
        "timesheet.reverted": { count: 4 },
      }),
    ).toBe(4);
  });
});

describe("bellCount", () => {
  it("es 0 con la bandeja limpia", () => {
    expect(bellCount(EMPTY_PAYLOAD)).toBe(0);
  });

  it("suma eventos sin leer y backlog", () => {
    expect(
      bellCount({
        events: [event("n1", "timesheet")],
        aggregates: { "timesheet.overdue": { count: 3 } },
        unread_count: 2,
      }),
    ).toBe(5);
  });

  it("usa unread_count y no events.length, porque el RPC recorta a p_limit", () => {
    // 60 sin leer pero sólo 50 eventos servidos: el badge debe decir 60.
    const events = Array.from({ length: 50 }, (_, i) =>
      event(`n${i}`, "timesheet"),
    );
    expect(bellCount({ events, aggregates: {}, unread_count: 60 })).toBe(60);
  });

  it("cuenta el backlog aunque no haya ningún evento sin leer", () => {
    expect(
      bellCount({
        events: [event("n1", "timesheet", { read: true })],
        aggregates: { "timesheet.reverted": { count: 2 } },
        unread_count: 0,
      }),
    ).toBe(2);
  });
});

describe("unreadEvents / unreadIds", () => {
  const events = [
    event("n1", "timesheet"),
    event("n2", "engagement", { read: true }),
    event("n3", "work_order"),
  ];

  it("filtra los ya leídos", () => {
    expect(unreadEvents(events).map((e) => e.notification_id)).toEqual([
      "n1",
      "n3",
    ]);
  });

  it("unreadIds devuelve sólo los ids sin leer", () => {
    expect(unreadIds(events)).toEqual(["n1", "n3"]);
  });

  it("devuelve vacío cuando está todo leído", () => {
    expect(unreadIds([event("n1", "timesheet", { read: true })])).toEqual([]);
  });
});

describe("groupEventsByModule", () => {
  it("devuelve vacío sin eventos", () => {
    expect(groupEventsByModule([])).toEqual([]);
  });

  it("agrupa por módulo y omite los módulos sin eventos", () => {
    const result = groupEventsByModule([
      event("n1", "timesheet"),
      event("n2", "work_order"),
      event("n3", "timesheet"),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].module).toBe("timesheet");
    expect(result[0].events.map((e) => e.notification_id)).toEqual(["n1", "n3"]);
    expect(result[1].module).toBe("work_order");
  });

  it("conserva el orden de llegada del RPC (created_at DESC), no un orden alfabético", () => {
    // El RPC ya ordena; agrupar no debe reordenar ni los módulos ni los eventos.
    const result = groupEventsByModule([
      event("n1", "work_order", { created: "2026-09-08T12:00:00Z" }),
      event("n2", "auth", { created: "2026-09-08T11:00:00Z" }),
      event("n3", "work_order", { created: "2026-09-08T10:00:00Z" }),
    ]);

    expect(result.map((g) => g.module)).toEqual(["work_order", "auth"]);
    expect(result[0].events.map((e) => e.notification_id)).toEqual(["n1", "n3"]);
  });

  it("no pierde eventos: la suma de los grupos es el total", () => {
    const events = [
      event("n1", "timesheet"),
      event("n2", "fund_request"),
      event("n3", "timesheet"),
      event("n4", "scheduler"),
      event("n5", "fund_request"),
    ];
    const result = groupEventsByModule(events);
    expect(result.reduce((n, g) => n + g.events.length, 0)).toBe(events.length);
  });
});

describe("buildPendingSections", () => {
  it("no arma nada sin contadores", () => {
    expect(buildPendingSections({})).toEqual([]);
  });

  it("omite las alarmas en cero, y la seccion entera si todas lo estan", () => {
    expect(
      buildPendingSections({
        "timesheet.overdue": { count: 0 },
        "timesheet.reverted": { count: 0 },
      }),
    ).toEqual([]);
  });

  it("agrupa por seccion y suma el subtotal", () => {
    const result = buildPendingSections({
      "timesheet.overdue": { count: 2 },
      "timesheet.reverted": { count: 1 },
      "engagement.rejected_by_partner": { count: 5 },
    });
    expect(result.map((s) => s.section)).toEqual([
      "time_control",
      "engagement_status",
    ]);
    expect(result[0].total).toBe(3);
    expect(result[1].total).toBe(5);
  });

  it("arma la seccion Plan de Pagos con las cuotas (FASE 3.b)", () => {
    const result = buildPendingSections({
      "wo.installment.due_this_week": { count: 4 },
      "wo.installment.overdue": { count: 2 },
    });
    expect(result).toHaveLength(1);
    expect(result[0].section).toBe("payment_plan");
    expect(result[0].total).toBe(6);
    // Orden fijo por criticidad, no por contador: la vencida primero aunque sea la menor.
    expect(result[0].alarms.map((a) => a.typeKey)).toEqual([
      "wo.installment.overdue",
      "wo.installment.due_this_week",
    ]);
    expect(result[0].alarms[0].route).toBe("/work-orders");
  });

  it("los items de una cuota vencida llegan al panel para pintarse como chips", () => {
    // El backend solo los manda en el alcance `assigned` (los encargos del gerente).
    const result = buildPendingSections({
      "wo.installment.overdue": {
        count: 1,
        items: [{ engagement_id: "e-1", engagement_code: "1042" }],
      },
    });
    expect(result[0].alarms[0].items).toHaveLength(1);
  });

  it("arma la seccion Capacitacion con su contador (FASE 3.d)", () => {
    const result = buildPendingSections({
      "approval.training_pending": { count: 3 },
    });
    expect(result).toHaveLength(1);
    expect(result[0].section).toBe("training");
    expect(result[0].alarms[0].route).toBe("/timesheet/approvals");
  });

  it("arma la seccion Cobertura con su contador (FASE 3.h)", () => {
    const result = buildPendingSections({
      "scheduler.coverage_gap": {
        count: 3,
        items: [{ engagement_id: "eng-9", engagement_code: "9F09" }],
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].section).toBe("coverage");
    expect(result[0].alarms[0].route).toBe("/scheduler");
    // El COT llega como item para pintarse de chip.
    expect(alarmEngagements(result[0].alarms[0])).toEqual([
      { id: "eng-9", code: "9F09" },
    ]);
  });

  it("con el Scheduler apagado, el contador de cobertura no navega (FASE 3.h)", () => {
    // /scheduler no esta montada en App.tsx si VITE_SCHEDULER_ENABLED no es "true".
    const result = buildPendingSections(
      { "scheduler.coverage_gap": { count: 3 } },
      (p) => (p === "scheduler.view" ? canOpenScheduler(false, "admin") : true),
    );
    expect(result[0].alarms[0].count).toBe(3);
    expect(result[0].alarms[0].route).toBeNull();
  });

  it("el contador de capacitacion solo linkea con el permiso en alcance firm (D-42)", () => {
    // El contador cuenta la capacitacion de TODA la firma. Solo el alcance firm abre las
    // policies firmwide de timesheet_periods/timesheet_line_approvals, asi que solo ahi la
    // pantalla muestra lo que el numero promete.
    const routeFor = (scopeOf: (p: string) => string | null) =>
      buildPendingSections({ "approval.training_pending": { count: 4 } }, (p) =>
        p === "timesheet_approval.firm_read"
          ? canOpenTrainingApprovals(scopeOf)
          : true,
      )[0].alarms[0].route;

    // admin / senior_partner
    expect(routeFor(() => "firm")).toBe("/timesheet/approvals");
    // hr_manager: tiene el permiso, pero acotado a sus encargos
    expect(routeFor(() => "assigned_engagements")).toBeNull();
    // hr_analyst: no lo tiene
    expect(routeFor(() => null)).toBeNull();
  });

  it("el contador de capacitacion se muestra aunque no linkee (D-42)", () => {
    // Lo que se retira es el enlace, no el aviso: el backlog existe y es de Talento Humano.
    const result = buildPendingSections(
      { "approval.training_pending": { count: 4 } },
      (p) => p !== "timesheet_approval.firm_read",
    );
    expect(result[0].section).toBe("training");
    expect(result[0].alarms[0].count).toBe(4);
    expect(result[0].alarms[0].route).toBeNull();
  });

  it("cada alarma del catalogo declara seccion, ruta y permiso", () => {
    // Una alarma sin ruta rompe el <Link> del panel en tiempo de render, no de tipos; una
    // sin permiso manda al usuario a un 403 en vez de no navegar.
    for (const spec of PENDING_ALARMS) {
      expect(spec.section).toBeTruthy();
      expect(spec.route.startsWith("/")).toBe(true);
      expect(spec.permission).toBeTruthy();
    }
  });

  it("sin el permiso de la ruta, la alarma se muestra pero no navega", () => {
    // Caso real: Contabilidad recibe wo.installment.overdue pero NO tiene work_order.read.
    const result = buildPendingSections(
      { "wo.installment.overdue": { count: 3 } },
      (p) => p !== "work_order.read",
    );
    expect(result[0].alarms[0].count).toBe(3);
    expect(result[0].alarms[0].route).toBeNull();
  });

  it("con el permiso, la alarma conserva su ruta", () => {
    const result = buildPendingSections(
      { "wo.installment.overdue": { count: 3 } },
      () => true,
    );
    expect(result[0].alarms[0].route).toBe("/work-orders");
  });
});

describe("visibleLegacyAlerts", () => {
  const alert = (alert_type: string, seen = false) => ({
    alert_type,
    seen_at: seen ? "2026-09-09T10:00:00Z" : null,
  });

  it("conserva todo lo no visto", () => {
    const rows = [
      alert("work_order_pending_approval"),
      alert("timesheet_pending_approval"),
    ];
    expect(visibleLegacyAlerts(rows)).toHaveLength(2);
  });

  it("descarta las que el catalogo nuevo ya emite, vistas o no (FASE 3.e)", () => {
    // engagement_created lo cubre engagement.created desde 3.c; new_user_registered lo
    // cubre auth.user.registered desde 3.e. Pintarlas seria duplicar la misma novedad.
    const rows = [
      alert("new_user_registered", true),
      alert("new_user_registered", false),
      alert("engagement_created", false),
    ];
    expect(visibleLegacyAlerts(rows)).toEqual([]);
  });

  it("conserva las derivadas de estado vivo aunque esten vistas", () => {
    // La OT sigue en Pending_Approval: descartarla esconderia trabajo pendiente.
    const rows = [
      alert("work_order_pending_approval", true),
      alert("timesheet_pending_approval", true),
    ];
    expect(visibleLegacyAlerts(rows)).toHaveLength(2);
  });

  it("mezcla: caen las superadas, queda el estado vivo", () => {
    const rows = [
      alert("new_user_registered", true),
      alert("new_user_registered", false),
      alert("work_order_pending_approval", true),
    ];
    const result = visibleLegacyAlerts(rows);
    expect(result).toHaveLength(1);
    expect(result.map((r) => r.alert_type)).toEqual([
      "work_order_pending_approval",
    ]);
  });

  it("un alert_type desconocido se trata como accionable (no se descarta)", () => {
    // Fail-safe: si aparece un tipo nuevo en la vista, se muestra en vez de desaparecer.
    expect(visibleLegacyAlerts([alert("tipo_futuro", true)])).toHaveLength(1);
  });

  it("el `visto` ya no oculta nada: solo baja el badge (FASE 3.e)", () => {
    // Las dos filas informativas del feed tienen emisor propio y se descartan siempre; las
    // que sobreviven son de estado vivo y deben listarse aunque esten vistas.
    expect(
      visibleLegacyAlerts([
        alert("work_order_pending_approval", true),
        alert("timesheet_pending_approval", true),
      ]),
    ).toHaveLength(2);
  });

});

describe("notificationState / notificationStateTone", () => {
  const withPayload = (payload: Record<string, unknown>) => ({
    ...event("n1", "fund_request"),
    payload,
  });

  it("lee decision, status o state, en ese orden", () => {
    expect(notificationState(withPayload({ decision: "rechazado" }))).toBe("rechazado");
    expect(notificationState(withPayload({ status: "Approved" }))).toBe("Approved");
    expect(notificationState(withPayload({ state: "cerrado" }))).toBe("cerrado");
    expect(notificationState(withPayload({ decision: "a", status: "b" }))).toBe("a");
  });

  it("devuelve null cuando no hay estado que mostrar", () => {
    expect(notificationState(withPayload({}))).toBeNull();
    expect(notificationState(withPayload({ decision: "" }))).toBeNull();
    expect(notificationState(withPayload({ decision: 42 }))).toBeNull();
  });

  it("mapea los estados de Fondos a su tono", () => {
    expect(notificationStateTone("aprobado_gerente")).toBe("success");
    expect(notificationStateTone("observado")).toBe("warning");
    expect(notificationStateTone("rechazado")).toBe("destructive");
    expect(notificationStateTone("cancelado")).toBe("destructive");
  });

  it("mapea los estados de Orden de Trabajo", () => {
    expect(notificationStateTone("Approved")).toBe("success");
    expect(notificationStateTone("Pending_Approval")).toBe("warning");
    expect(notificationStateTone("Rejected")).toBe("destructive");
    expect(notificationStateTone("Emergency_Approved")).toBe("success");
  });

  it("mapea los estados de una cuota del plan de pagos", () => {
    expect(notificationStateTone("Pending")).toBe("neutral");
    expect(notificationStateTone("Invoiced")).toBe("warning");
    expect(notificationStateTone("Completed")).toBe("success");
    expect(notificationStateTone("Overdue")).toBe("destructive");
  });

  it("un estado desconocido cae a neutral, no a un color equivocado", () => {
    expect(notificationStateTone("estado_del_futuro")).toBe("neutral");
    expect(notificationStateTone("")).toBe("neutral");
  });
});

describe("notificationRoute", () => {
  it("un evento de solicitud lleva a su vista de revision", () => {
    const e = { ...event("n1", "fund_request"), type_key: "fund.request.submitted_for_approval",
                entity_id: "fr-1" };
    expect(notificationRoute(e)).toBe("/fund-requests/fr-1");
  });

  it("el borrado de un encargo NO rutea: la fila que nombra ya no existe", () => {
    // El trigger corre en TG_OP='DELETE' y emite el id de la fila que acaba de desaparecer, asi
    // que /engagements/:id solo puede mostrar `engagement.unavailable`. El aviso ya trae codigo
    // y nombre en el payload, y sin ruta la fila se pinta como texto, que es la regla del modulo.
    const e = { ...event("n1", "engagement"), type_key: "engagement.deleted",
                entity_id: "eng-1", payload: { engagement_code: "9F01" } };
    expect(notificationRoute(e)).toBeNull();
  });

  it("la asignacion de especialista NO rutea: la RLS no lo reconoce como asignado", () => {
    // El encargo existe, pero no entra en el portafolio del destinatario:
    // `list_portfolio_engagements()` (BUG 0828-185) resuelve a ita_manager/tax_manager por
    // `manager_id`, y ninguno de sus 4 buckets mira `specialist_it_id` ni `specialist_tax_id`.
    // Sin la fila, EngagementEdit cae en `engagement.unavailable`. El chequeo de permiso no lo
    // ataja, y por eso el `can` de abajo devuelve true: `ita_manager` y `tax_manager` SI tienen
    // `engagement.read`; lo que les falta es la FILA.
    const e = { ...event("n1", "engagement"), type_key: "engagement.specialist_assigned",
                entity_id: "eng-1",
                payload: { context: "it", engagement_code: "12-06" } };
    expect(notificationRoute(e, () => true)).toBeNull();
  });

  it("el resto de los eventos de encargo si rutea al detalle", () => {
    // Las excepciones son el borrado y la asignacion de especialista, y ninguna mas: nulear el
    // modulo entero se llevaria puestos los avisos de encargos que si existen.
    const e = { ...event("n1", "engagement"), type_key: "engagement.finalized",
                entity_id: "eng-1" };
    expect(notificationRoute(e)).toBe("/engagements/eng-1");
  });

  it("0922-190: la version PROPIA de staffing.changed (assigned) lleva a Mis Asignaciones, sin permiso", () => {
    // senior/semisenior/assistant reciben este aviso y NO tienen engagement.read: el `can`
    // de abajo devuelve false a propósito para probar que esta rama no pasa por ese gate.
    const e = { ...event("n1", "engagement"), type_key: "engagement.staffing.changed",
                entity_id: "eng-9", payload: { context: "assigned" } };
    expect(notificationRoute(e, () => false)).toBe("/timesheet/assignments?engagementId=eng-9");
  });

  it("0922-190: la baja PROPIA (unassigned) rutea igual, también sin permiso", () => {
    const e = { ...event("n1", "engagement"), type_key: "engagement.staffing.changed",
                entity_id: "eng-9", payload: { context: "unassigned" } };
    expect(notificationRoute(e, () => false)).toBe("/timesheet/assignments?engagementId=eng-9");
  });

  it("0922-190: sin entity_id la version propia no rutea", () => {
    const e = { ...event("n1", "engagement"), type_key: "engagement.staffing.changed",
                entity_id: null, payload: { context: "assigned" } };
    expect(notificationRoute(e)).toBeNull();
  });

  it("0922-190: la version de EQUIPO (team_assigned/team_unassigned) sigue yendo al encargo, y sigue exigiendo engagement.read", () => {
    const teamAssigned = { ...event("n1", "engagement"), type_key: "engagement.staffing.changed",
                entity_id: "eng-9", payload: { context: "team_assigned" } };
    const teamUnassigned = { ...event("n2", "engagement"), type_key: "engagement.staffing.changed",
                entity_id: "eng-9", payload: { context: "team_unassigned" } };
    expect(notificationRoute(teamAssigned)).toBe("/engagements/eng-9");
    expect(notificationRoute(teamUnassigned)).toBe("/engagements/eng-9");
    expect(notificationRoute(teamAssigned, () => false)).toBeNull();
    expect(notificationRoute(teamAssigned, (p) => p === "engagement.read")).toBe("/engagements/eng-9");
  });

  it("un evento de gasto lleva a la pantalla de gastos de SU solicitud", () => {
    // entity_id es el fre_id, que no es parametro de ninguna ruta: el destino se arma con
    // el fund_request_id del payload.
    const e = { ...event("n1", "fund_request"), type_key: "fund.expense.decided",
                entity_id: "fre-9", payload: { fund_request_id: "fr-1" } };
    expect(notificationRoute(e)).toBe("/fund-requests/fr-1/expenses");
  });

  it("un gasto sin fund_request_id en el payload no rutea", () => {
    const e = { ...event("n1", "fund_request"), type_key: "fund.expense.decided",
                entity_id: "fre-9", payload: {} };
    expect(notificationRoute(e)).toBeNull();
  });

  it("una solicitud sin entity_id no rutea", () => {
    const e = { ...event("n1", "fund_request"), type_key: "fund.request.closed",
                entity_id: null };
    expect(notificationRoute(e)).toBeNull();
  });

  it("un evento de OT lleva a su orden de trabajo", () => {
    const e = { ...event("n1", "work_order"), type_key: "wo.approved_partner",
                entity_id: "wo-7" };
    expect(notificationRoute(e)).toBe("/work-orders/wo-7");
  });

  it("un evento de CUOTA tambien lleva a la OT: la cuota no tiene pantalla propia", () => {
    const e = { ...event("n1", "work_order"), type_key: "wo.installment.status_changed",
                entity_id: "wo-7", payload: { installment_id: "i-3" } };
    expect(notificationRoute(e)).toBe("/work-orders/wo-7");
  });

  it("una OT sin entity_id no rutea", () => {
    expect(notificationRoute(event("n1", "work_order"))).toBeNull();
  });

  it("la hoja enviada a calidad lleva a su hoja (FASE 3.g)", () => {
    // /worksheets/:id existe desde antes que el modulo (App.tsx) y exige `worksheet.read`, que
    // es justo el permiso de los cinco roles que pueden ocupar la funcion SQR (D-07). Sin el
    // case, el modulo caia al `default` y la fila se pintaba como texto muerto.
    //
    // Hoy el evento no se emite —ninguna via del producto escribe
    // `activity_worksheets.status = 'approved'` (D-38)—, asi que esto cubre el dia que exista.
    const e = { ...event("n1", "worksheet"), type_key: "worksheet.sent_to_quality",
                entity_id: "ws-4" };
    expect(notificationRoute(e)).toBe("/worksheets/ws-4");
    expect(notificationRoute(e, (p) => p === "worksheet.read")).toBe("/worksheets/ws-4");
  });

  it("sin worksheet.read la hoja no rutea, y sin entity_id tampoco", () => {
    const e = { ...event("n1", "worksheet"), type_key: "worksheet.sent_to_quality",
                entity_id: "ws-4" };
    expect(notificationRoute(e, () => false)).toBeNull();
    expect(notificationRoute({ ...event("n2", "worksheet"),
                               type_key: "worksheet.sent_to_quality" })).toBeNull();
  });

  it("un evento de Encargo lleva a su encargo (FASE 3.c)", () => {
    const e = { ...event("n1", "engagement"), type_key: "engagement.finalized",
                entity_id: "eng-3" };
    expect(notificationRoute(e)).toBe("/engagements/eng-3");
  });

  it("sin el permiso de la pantalla destino no rutea, en vez de mandar a un 403", () => {
    // senior/semisenior/assistant reciben engagement.* pero NO tienen engagement.read.
    const e = { ...event("n1", "engagement"), type_key: "engagement.encargado_assigned",
                entity_id: "eng-3" };
    expect(notificationRoute(e, () => false)).toBeNull();
    expect(notificationRoute(e, (p) => p === "engagement.read")).toBe("/engagements/eng-3");
  });

  it("el acuse de la boleta propia lleva a MI hoja de tiempo (FASE 3.d)", () => {
    const e = { ...event("n1", "timesheet"), type_key: "timesheet.own_submit_confirmed",
                entity_id: "per-1" };
    expect(notificationRoute(e)).toBe("/timesheet");
  });

  it("la boleta de OTRO lleva al detalle de aprobacion de ese periodo (FASE 3.d)", () => {
    const enviada = { ...event("n1", "timesheet"), type_key: "timesheet.weekly_submitted",
                      entity_id: "per-1" };
    const aprobar = { ...event("n2", "timesheet"),
                      type_key: "timesheet.team_submitted_for_approval",
                      entity_id: "per-1" };
    expect(notificationRoute(enviada)).toBe("/timesheet/approvals/per-1");
    expect(notificationRoute(aprobar)).toBe("/timesheet/approvals/per-1");
  });

  it("la boleta ajena exige timesheet_approval.read, no timesheet.read (FASE 3.d)", () => {
    // Los dos avisos sobre la boleta de otro caen en la pantalla de aprobaciones, que
    // seniors/semis/asistentes no pueden abrir: el permiso del tipo pisa al del modulo.
    const e = { ...event("n1", "timesheet"), type_key: "timesheet.team_submitted_for_approval",
                entity_id: "per-1" };
    expect(notificationRoute(e, (p) => p === "timesheet.read")).toBeNull();
    expect(notificationRoute(e, (p) => p === "timesheet_approval.read"))
      .toBe("/timesheet/approvals/per-1");
  });

  it("un veredicto sobre mi linea lleva a mi hoja de tiempo (FASE 3.d)", () => {
    // entity_id es el approval_id, que no es parametro de ninguna ruta.
    const e = { ...event("n1", "timesheet_approval"), type_key: "approval.line_rejected",
                entity_id: "appr-9" };
    expect(notificationRoute(e)).toBe("/timesheet");
    expect(notificationRoute(e, (p) => p === "timesheet.read")).toBe("/timesheet");
    expect(notificationRoute(e, () => false)).toBeNull();
  });

  it("0923-209: solicitar una reversion va a la cola de reversiones (sólo el admin la recibe), exigiendo timesheet_approval.read", () => {
    const requested = { ...event("n1", "timesheet_approval"),
                         type_key: "approval.reversal_requested", entity_id: "req-1" };
    expect(notificationRoute(requested, (p) => p === "timesheet.read")).toBeNull();
    expect(notificationRoute(requested, (p) => p === "timesheet_approval.read"))
      .toBe("/timesheet/approvals?tab=reversals");
  });

  // Review iteración 1, hallazgo #9: approval.reversal_executed lo reciben gerentes/socios,
  // NO el admin -- la tab "reversals" no existe para ellos. Antes ruteaba ahí también y
  // Radix se quedaba sin ningún tab activo (pantalla en blanco). "pending" sí existe para
  // cualquier perfil con timesheet_approval.read.
  it("0923-209: ejecutar una reversion va a la tab pending, alcanzable por cualquier perfil con timesheet_approval.read", () => {
    const executed = { ...event("n2", "timesheet_approval"),
                        type_key: "approval.reversal_executed", entity_id: "per-1" };
    expect(notificationRoute(executed, (p) => p === "timesheet.read")).toBeNull();
    expect(notificationRoute(executed, (p) => p === "timesheet_approval.read"))
      .toBe("/timesheet/approvals?tab=pending");
  });

  it("0923-209: el rechazo de MI solicitud cae al default del modulo (timesheet.read), no timesheet_approval.read", () => {
    const e = { ...event("n1", "timesheet_approval"), type_key: "approval.reversal_rejected",
                entity_id: "req-2" };
    expect(notificationRoute(e, (p) => p === "timesheet.read")).toBe("/timesheet");
    expect(notificationRoute(e, (p) => p === "timesheet_approval.read")).toBeNull();
  });

  it("el timer cerrado solo lleva a ESE registro del tracker (FASE 3.d)", () => {
    const e = { ...event("n1", "tracker"), type_key: "tracker.timer.auto_stopped",
                entity_id: "timer-4" };
    expect(notificationRoute(e)).toBe("/tracker/timer-4");
    expect(notificationRoute(e, (p) => p === "time_entry.read")).toBe("/tracker/timer-4");
    expect(notificationRoute({ ...e, entity_id: null })).toBeNull();
  });

  it("un evento de cliente lleva a su ficha (FASE 3.f)", () => {
    const e = { ...event("n1", "client"), type_key: "client.deactivated",
                entity_id: "cli-3", payload: { client_legal_name: "ACME SA" } };
    expect(notificationRoute(e)).toBe("/clients/cli-3");
    expect(notificationRoute(e, (p) => p === "client.read")).toBe("/clients/cli-3");
    expect(notificationRoute(e, () => false)).toBeNull();
  });

  it("un evento de cuenta o de personal lleva a la ficha de staff (FASE 3.e)", () => {
    // Se rutea por payload.staff_id: los eventos de cuenta nacen en user_roles, donde solo
    // hay un user_id, y el disparador resuelve la ficha cuando existe.
    const e = { ...event("n1", "auth"), type_key: "auth.role.changed",
                entity_id: "st-7", payload: { staff_id: "st-7", role_key: "senior" } };
    expect(notificationRoute(e)).toBe("/staff/st-7");
    expect(notificationRoute(e, (p) => p === "staff.read")).toBe("/staff/st-7");
    expect(notificationRoute(e, () => false)).toBeNull();
  });

  it("una cuenta sin ficha de staff no rutea (FASE 3.e)", () => {
    // Caso real del borrado: manage-auth-user solo borra cuentas SIN staff vinculado.
    const e = { ...event("n1", "auth"), type_key: "auth.account.deleted",
                entity_id: "user-9", payload: { user_id: "user-9", email: "x@y.com" } };
    expect(notificationRoute(e)).toBeNull();
  });

  it("sin `can` se rutea igual: los tests y el render sin sesion no deben perder el enlace", () => {
    const e = { ...event("n1", "work_order"), type_key: "wo.approved_partner",
                entity_id: "wo-7" };
    expect(notificationRoute(e)).toBe("/work-orders/wo-7");
  });

  it("un modulo sin destino todavia devuelve null en vez de inventar una ruta", () => {
    expect(notificationRoute(event("n2", "worksheet"))).toBeNull();
    expect(notificationRoute(event("n3", "scheduler"))).toBeNull();
  });
});

describe("notificationMeta", () => {
  const withPayload = (payload: Record<string, unknown>) => ({
    ...event("n1", "fund_request"),
    payload,
  });

  it("devuelve los identificadores que trae el payload, en orden fijo", () => {
    expect(
      notificationMeta(
        withPayload({ engagement_code: "1042", request_number: "FR-1" }),
      ),
    ).toEqual(["FR-1", "1042"]);
  });

  it("el cliente encabeza los chips del encargo", () => {
    // Va primero porque es lo que ubica al encargo: el nombre se repite entre clientes. Importa
    // sobre todo en las filas que no llevan a ninguna pantalla —`engagement.specialist_assigned`,
    // `engagement.deleted`—, donde el texto de la fila es todo lo que se puede leer del hecho.
    expect(
      notificationMeta(
        withPayload({ engagement_code: "12-06", client_name: "ACME S.A." }),
      ),
    ).toEqual(["ACME S.A.", "12-06"]);
    // Y se pinta como texto libre, no como codigo.
    expect(isCodeMeta("ACME S.A.")).toBe(false);
  });

  it("devuelve vacio cuando no hay identificadores", () => {
    expect(notificationMeta(withPayload({ amount: 40 }))).toEqual([]);
  });

  it("el nombre de una competencia tambien baja a chip (FASE 3.e)", () => {
    expect(
      notificationMeta(withPayload({ skill_name: "Claude para Excel" })),
    ).toEqual(["Claude para Excel"]);
  });

  it("isCodeMeta separa codigos de texto libre: decide la tipografia del chip", () => {
    expect(isCodeMeta("9F01")).toBe(true);
    expect(isCodeMeta("FR-2026-0001")).toBe(true);
    expect(isCodeMeta("AUD-A1")).toBe(true);
    expect(isCodeMeta("Claude para Excel")).toBe(false);
  });

  it("una linea de timesheet se identifica por encargo Y actividad (FASE 3.d)", () => {
    // Sin el codigo de actividad, dos lineas del mismo encargo se ven identicas en el panel.
    expect(
      notificationMeta(
        withPayload({ activity_code: "9F1", engagement_code: "1042" }),
      ),
    ).toEqual(["1042", "9F1"]);
  });

  it("ignora valores vacios o que no sean texto", () => {
    expect(
      notificationMeta(withPayload({ request_number: "", engagement_code: 42 })),
    ).toEqual([]);
    expect(notificationMeta(withPayload({ request_number: "   " }))).toEqual([]);
  });

  it("recorta los espacios del identificador", () => {
    expect(notificationMeta(withPayload({ request_number: " FR-1 " }))).toEqual([
      "FR-1",
    ]);
  });
});

describe("notificationRoleChange", () => {
  const roleEvent = (payload: Record<string, unknown>, type = "auth.role.changed") => ({
    ...event("n1", "auth"),
    type_key: type,
    payload,
  });

  it("devuelve el rol anterior y el nuevo para pintarlos como badges (FASE 3.e)", () => {
    expect(
      notificationRoleChange(
        roleEvent({ role_key: "senior", previous_role_key: "semisenior" }),
      ),
    ).toEqual({ from: "semisenior", to: "senior" });
  });

  it("sin rol anterior devuelve solo el nuevo: el badge se pinta igual", () => {
    // Es el caso de un rol que nace vacio (role_key NULL antes del cambio).
    expect(
      notificationRoleChange(roleEvent({ role_key: "senior", previous_role_key: "" })),
    ).toEqual({ from: null, to: "senior" });
  });

  it("ignora cualquier otro tipo, aunque traiga role_key en el payload", () => {
    // auth.user.registered tambien lleva role_key, y ahi el badge no aplica.
    expect(
      notificationRoleChange(
        roleEvent({ role_key: "assistant" }, "auth.user.registered"),
      ),
    ).toBeNull();
  });

  it("sin role_key no hay badge en vez de uno vacio", () => {
    expect(notificationRoleChange(roleEvent({}))).toBeNull();
  });
});

describe("canOpenScheduler", () => {
  it("exige las DOS condiciones: modulo encendido y rol con acceso al Scheduler", () => {
    expect(canOpenScheduler(true, "admin")).toBe(true);
    expect(canOpenScheduler(false, "admin")).toBe(false);
    expect(canOpenScheduler(true, "assistant")).toBe(false);
    expect(canOpenScheduler(true, null)).toBe(false);
  });

  // LA REGRESION, y fallaba en las dos direcciones. Antes aproximaba con `engagement.read`
  // ("puede ver encargos"), que no es el mismo conjunto que "puede abrir el Scheduler":
  // `canSeePlanning` decide por role_key y no hay permisos `scheduler.*` en el catalogo RBAC.
  it.each(["sqr", "ita_manager", "tax_manager"])(
    "%s recibe el contador y tiene engagement.read, pero NO entra al Scheduler",
    (rol) => {
      // Con el predicado viejo el enlace se pintaba y /scheduler —que no tiene guard de ruta—
      // les mostraba el estado de sin acceso.
      expect(canOpenScheduler(true, rol)).toBe(false);
    },
  );

  it("senior SI entra, aunque no tenga engagement.read", () => {
    // Tiene `dashboard.engagement.read`, que es otro permiso (cero_13). Con el predicado viejo
    // se le ocultaba un enlace a una pantalla que abre bien.
    expect(canOpenScheduler(true, "senior")).toBe(true);
  });

  it("coincide con el predicado que gobierna la pantalla", () => {
    // La afirmacion de fondo: enlace y puerta son el MISMO conjunto. Si alguien cambia
    // SCHEDULER_PLANNING_ROLES, esto sigue siendo cierto sin tocar nada.
    for (const rol of [
      "admin", "senior_partner", "partner", "director", "manager", "senior",
      "sqr", "ita_manager", "tax_manager", "assistant", "hr_manager", null,
    ]) {
      expect(canOpenScheduler(true, rol)).toBe(canSeePlanning(rol));
    }
  });
});
