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
  isDismissedLegacyAlert,
  notificationState,
  notificationStateTone,
  notificationRoute,
  notificationMeta,
  type NotificationEvent,
  type NotificationModule,
} from "../notifications";

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
      alert("new_user_registered"),
      alert("engagement_created"),
      alert("work_order_pending_approval"),
    ];
    expect(visibleLegacyAlerts(rows)).toHaveLength(3);
  });

  it("descarta las informativas ya vistas", () => {
    const rows = [
      alert("new_user_registered", true),
      alert("engagement_created", true),
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

  it("mezcla: solo caen las informativas vistas", () => {
    const rows = [
      alert("new_user_registered", true),
      alert("new_user_registered", false),
      alert("work_order_pending_approval", true),
    ];
    const result = visibleLegacyAlerts(rows);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.alert_type)).toEqual([
      "new_user_registered",
      "work_order_pending_approval",
    ]);
  });

  it("un alert_type desconocido se trata como accionable (no se descarta)", () => {
    // Fail-safe: si aparece un tipo nuevo en la vista, se muestra en vez de desaparecer.
    expect(visibleLegacyAlerts([alert("tipo_futuro", true)])).toHaveLength(1);
  });

  it("isDismissedLegacyAlert no descarta nada sin seen_at", () => {
    expect(isDismissedLegacyAlert({ alert_type: "new_user_registered" })).toBe(
      false,
    );
    expect(
      isDismissedLegacyAlert({
        alert_type: "new_user_registered",
        seen_at: "2026-09-09T10:00:00Z",
      }),
    ).toBe(true);
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

  it("sin `can` se rutea igual: los tests y el render sin sesion no deben perder el enlace", () => {
    const e = { ...event("n1", "work_order"), type_key: "wo.approved_partner",
                entity_id: "wo-7" };
    expect(notificationRoute(e)).toBe("/work-orders/wo-7");
  });

  it("un modulo sin destino todavia devuelve null en vez de inventar una ruta", () => {
    expect(notificationRoute(event("n2", "auth"))).toBeNull();
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

  it("devuelve vacio cuando no hay identificadores", () => {
    expect(notificationMeta(withPayload({ amount: 40 }))).toEqual([]);
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
