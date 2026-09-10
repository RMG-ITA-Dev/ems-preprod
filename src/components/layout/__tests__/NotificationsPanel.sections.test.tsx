import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NotificationsPanel } from "../NotificationsPanel";
import { EMPTY_PAYLOAD, type NotificationsPayload } from "@/lib/notifications";

// i18n: devuelve la clave, para poder afirmar sobre claves y no sobre traducciones.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && "defaultValue" in opts) return key;
      if (opts && Object.keys(opts).length > 0) {
        const pairs = Object.entries(opts)
          .map(([k, v]) => `${k}=${v}`)
          .join(",");
        return `${key}(${pairs})`;
      }
      return key;
    },
    i18n: { language: "es" },
  }),
}));

const mockUseNotifications = vi.fn();
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => mockUseNotifications(),
  useMarkNotificationsRead: () => ({ mutate: mockMarkRead }),
}));

const mockUseStaffingAlerts = vi.fn();
vi.mock("@/hooks/useStaffingAlerts", () => ({
  useStaffingAlerts: () => mockUseStaffingAlerts(),
}));

const mockMarkRead = vi.fn();
const mockMarkSeen = vi.fn();
vi.mock("@/hooks/useMarkAlertsSeen", () => ({
  useMarkAlertsSeen: () => ({ mutate: mockMarkSeen }),
}));

// El panel consulta permisos para decidir si cada fila navega: sin permiso sobre la pantalla
// destino se pinta como texto en vez de mandar al usuario a un "Sin acceso".
const mockCan = vi.fn((_permission: string) => true);
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: mockCan }),
}));

type LegacyAlert = Record<string, unknown>;

function setup(
  payload: Partial<NotificationsPayload> = {},
  legacy: LegacyAlert[] = [],
) {
  mockUseNotifications.mockReturnValue({
    data: { ...EMPTY_PAYLOAD, ...payload },
  });
  mockUseStaffingAlerts.mockReturnValue({
    data: legacy,
    isPending: false,
    isError: false,
  });
  return render(
    <MemoryRouter>
      <NotificationsPanel />
    </MemoryRouter>,
  );
}

/** El marcado de visto/leido ocurre al CERRAR el panel, no al abrirlo. */
const closePanel = async () => {
  await userEvent.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByText("notifications.title")).not.toBeInTheDocument(),
  );
};

const openPanel = async () => {
  await userEvent.click(screen.getByRole("button"));
  await waitFor(() =>
    expect(screen.getByText("notifications.title")).toBeInTheDocument(),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  // Por defecto, con permiso sobre todo: cada test que quiera probar la falta de permiso
  // lo restringe explicitamente.
  mockCan.mockImplementation(() => true);
});

describe("NotificationsPanel — gateo de secciones", () => {
  it("muestra Control de Tiempo y NO Encargos cuando solo llegan contadores de timesheet", async () => {
    setup({ aggregates: { "timesheet.overdue": { count: 3 } } });
    await openPanel();

    expect(
      screen.getByText("notifications.sections.time_control"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("notifications.sections.engagement_status"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("notifications.alarms.timesheet.overdue"),
    ).toBeInTheDocument();
  });

  it("muestra Encargos Generados cuando llegan sus contadores", async () => {
    setup({
      aggregates: {
        "engagement.rejected_by_partner": { count: 1 },
        "engagement.pending_partner_approval": { count: 2 },
      },
    });
    await openPanel();

    expect(
      screen.getByText("notifications.sections.engagement_status"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("notifications.alarms.engagement.rejected_by_partner"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "notifications.alarms.engagement.pending_partner_approval",
      ),
    ).toBeInTheDocument();
  });

  it("un perfil que reporta horas Y genera encargos ve las dos secciones", async () => {
    setup({
      aggregates: {
        "timesheet.reverted": { count: 1 },
        "engagement.pending_partner_approval": { count: 1 },
      },
    });
    await openPanel();

    expect(
      screen.getByText("notifications.sections.time_control"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("notifications.sections.engagement_status"),
    ).toBeInTheDocument();
  });

  it("sin contadores no se muestra ninguna seccion, pero el feed legacy sigue vivo", async () => {
    setup({}, [
      {
        alert_type: "new_user_registered",
        entity_id: "s1",
        staff_id: "me",
        priority_level: "medium",
        detected_at: "2026-09-08T10:00:00Z",
        description: "Alguien",
      },
    ]);
    await openPanel();

    expect(
      screen.queryByText("notifications.sections.time_control"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("notifications.sections.engagement_status"),
    ).not.toBeInTheDocument();
    // new_user_registered no se pierde al reestructurar el panel.
    expect(
      screen.getByText(/notifications\.types\.new_user_registered/),
    ).toBeInTheDocument();
  });
});

describe("NotificationsPanel — contadores y badge", () => {
  it("las alarmas en cero no se pintan", async () => {
    setup({
      aggregates: {
        "timesheet.overdue": { count: 0 },
        "timesheet.reverted": { count: 2 },
      },
    });
    await openPanel();

    expect(
      screen.queryByText("notifications.alarms.timesheet.overdue"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("notifications.alarms.timesheet.reverted"),
    ).toBeInTheDocument();
  });

  it("el badge de la campana suma contadores, eventos sin leer y alertas legacy", async () => {
    setup(
      {
        aggregates: { "timesheet.overdue": { count: 3 } },
        unread_count: 2,
      },
      [
        {
          alert_type: "new_user_registered",
          entity_id: "s1",
          staff_id: "me",
          priority_level: "low",
        },
      ],
    );
    // 3 + 2 + 1 = 6, numerico, no un punto.
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("sin nada pendiente no hay badge", async () => {
    setup();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("recorta el badge a 99+", async () => {
    setup({ aggregates: { "timesheet.overdue": { count: 150 } } });
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("muestra las horas faltantes junto al contador (mejora B)", async () => {
    setup({
      aggregates: { "timesheet.overdue": { count: 2, missing_hours: 62.5 } },
    });
    await openPanel();

    expect(
      screen.getByText("notifications.missingHours(hours=62.5)"),
    ).toBeInTheDocument();
  });

  it("muestra el subtotal de la seccion (mejora E)", async () => {
    // Con una alerta legacy el total de la campana (8) se separa del subtotal (7), asi la
    // asercion no puede pasar por accidente contra el badge.
    setup(
      {
        aggregates: {
          "timesheet.overdue": { count: 3 },
          "timesheet.reverted": { count: 4 },
        },
      },
      [
        {
          alert_type: "new_user_registered",
          entity_id: "s1",
          staff_id: "me",
          priority_level: "low",
        },
      ],
    );
    await openPanel();

    expect(screen.getByText("8")).toBeInTheDocument();  // badge de la campana
    expect(screen.getByText("7")).toBeInTheDocument();  // subtotal de Control de Tiempo
  });
});

describe("NotificationsPanel — el contador baja", () => {
  it("una alerta legacy ya vista NO suma al badge, pero sigue listada", async () => {
    setup({}, [
      {
        alert_type: "new_user_registered",
        entity_id: "s1",
        staff_id: "me",
        priority_level: "low",
        seen_at: "2026-09-09T10:00:00Z",
      },
      {
        alert_type: "new_user_registered",
        entity_id: "s2",
        staff_id: "me",
        priority_level: "low",
        seen_at: null,
      },
    ]);

    // 2 alertas, 1 vista -> el badge dice 1, no 2. Asi baja al abrir el panel.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("2")).not.toBeInTheDocument();

    await openPanel();
    // La informativa ya vista desaparece; solo queda la no vista.
    expect(
      screen.getAllByText(/notifications\.types\.new_user_registered/),
    ).toHaveLength(1);
  });

  it("con las informativas vistas el panel queda vacio de verdad", async () => {
    setup({}, [
      {
        alert_type: "new_user_registered",
        entity_id: "s1",
        staff_id: "me",
        priority_level: "low",
        seen_at: "2026-09-09T10:00:00Z",
      },
    ]);
    await openPanel();

    // Es el caso del admin con 23 altas ya vistas: la lista se vacia.
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/notifications\.types\.new_user_registered/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("notifications.allClear")).toBeInTheDocument();
  });

  it("una OT pendiente ya vista NO desaparece: el trabajo sigue abierto", async () => {
    setup({}, [
      {
        alert_type: "work_order_pending_approval",
        entity_id: "wo-1",
        staff_id: "me",
        engagement_id: "eng-1",
        priority_level: "medium",
        seen_at: "2026-09-09T10:00:00Z",
      },
    ]);
    await openPanel();

    expect(
      screen.getByText(/notifications\.types\.work_order_pending_approval/),
    ).toBeInTheDocument();
    // Vista, asi que no suma al badge, pero sigue listada.
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("notifications.allClear")).not.toBeInTheDocument();
  });

  it("markSeen solo recibe las NO vistas, y al cerrar el panel", async () => {
    setup({}, [
      {
        alert_type: "new_user_registered",
        entity_id: "s1",
        staff_id: "me",
        priority_level: "low",
        seen_at: "2026-09-09T10:00:00Z",
      },
      {
        alert_type: "new_user_registered",
        entity_id: "s2",
        staff_id: "me",
        priority_level: "low",
        seen_at: null,
      },
    ]);
    await openPanel();
    // Abrir NO marca: si marcara, el refetch moveria las filas al grupo colapsado
    // mientras el usuario todavia las esta leyendo.
    expect(mockMarkSeen).not.toHaveBeenCalled();

    await closePanel();
    await waitFor(() => expect(mockMarkSeen).toHaveBeenCalled());
    const [rows] = mockMarkSeen.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(rows).toHaveLength(1);
    expect(rows[0].entity_id).toBe("s2");
  });

  it("un fallo del RPC de notificaciones se muestra, no deja el panel en blanco", async () => {
    mockUseNotifications.mockReturnValue({ data: undefined, isError: true });
    mockUseStaffingAlerts.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    render(
      <MemoryRouter>
        <NotificationsPanel />
      </MemoryRouter>,
    );
    await openPanel();

    expect(screen.getByText("notifications.error")).toBeInTheDocument();
  });
});

describe("NotificationsPanel — COT y navegacion", () => {
  it("pinta los COT de las aprobaciones pendientes como chips, sin repetir", async () => {
    setup({
      aggregates: {
        "timesheet.pending_approval": {
          count: 2,
          items: [
            { week_start: "2026-08-31", cots: ["1042", "1077"] },
            // El mismo COT en otra semana: se deduplica.
            { week_start: "2026-08-24", cots: ["1042"] },
          ],
        },
      },
    });
    await openPanel();

    expect(screen.getByText("1042")).toBeInTheDocument();
    expect(screen.getByText("1077")).toBeInTheDocument();
    expect(screen.getAllByText("1042")).toHaveLength(1);
  });

  it("cada fila de contador navega a su modulo (mejora A)", async () => {
    setup({
      aggregates: {
        "timesheet.overdue": { count: 1 },
        "engagement.rejected_by_partner": { count: 1 },
      },
    });
    await openPanel();

    const timesheetRow = screen
      .getByText("notifications.alarms.timesheet.overdue")
      .closest("a");
    const engagementRow = screen
      .getByText("notifications.alarms.engagement.rejected_by_partner")
      .closest("a");

    expect(timesheetRow).toHaveAttribute("href", "/timesheet");
    expect(engagementRow).toHaveAttribute("href", "/engagements");
  });
});

describe("NotificationsPanel — regresiones de 'visto'", () => {
  it("markSeen recibe SOLO filas legacy, nunca los contadores agregados", async () => {
    setup(
      { aggregates: { "timesheet.overdue": { count: 3 } } },
      [
        {
          alert_type: "new_user_registered",
          entity_id: "s1",
          staff_id: "me",
          priority_level: "low",
          seen_at: null,
        },
      ],
    );
    await openPanel();
    await closePanel();

    await waitFor(() => expect(mockMarkSeen).toHaveBeenCalled());
    const [rows] = mockMarkSeen.mock.calls[0] as [
      Array<Record<string, unknown>>,
    ];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      staff_id: "me",
      entity_id: "s1",
      alert_type: "new_user_registered",
    });
    // Un agregado no tiene entity_id: si entrara aca romperia el onConflict de
    // staff_alert_seen (staff_id, entity_id, alert_type).
    expect(
      rows.some((r) => r.alert_type === "timesheet.overdue"),
    ).toBe(false);
  });

  it("marca leidos los eventos nuevos con su propio RPC al cerrar", async () => {
    setup({
      events: [
        {
          notification_id: "n1",
          type_key: "wo.rejected_partner",
          module_key: "work_order",
          label_key: "notifications.types.wo.rejected_partner",
          entity_id: "e1",
          payload: {},
          created_at: "2026-09-08T10:00:00Z",
          read_at: null,
        },
        {
          notification_id: "n2",
          type_key: "wo.approved_partner",
          module_key: "work_order",
          label_key: "notifications.types.wo.approved_partner",
          entity_id: "e2",
          payload: {},
          created_at: "2026-09-07T10:00:00Z",
          read_at: "2026-09-07T12:00:00Z",
        },
      ],
      unread_count: 1,
    });
    await openPanel();
    expect(mockMarkRead).not.toHaveBeenCalled();

    await closePanel();
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith(["n1"]));
  });

  it("no llama a ningun marcador cuando no hay nada sin leer", async () => {
    setup({ aggregates: { "timesheet.overdue": { count: 3 } } });
    await openPanel();
    await closePanel();

    expect(mockMarkRead).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });
});

describe("NotificationsPanel — eventos y dedup", () => {
  it("agrupa los eventos por modulo bajo Novedades", async () => {
    setup({
      events: [
        {
          notification_id: "n1",
          type_key: "wo.rejected_partner",
          module_key: "work_order",
          label_key: "notifications.types.wo.rejected_partner",
          entity_id: "e1",
          payload: {},
          created_at: "2026-09-08T10:00:00Z",
          read_at: "2026-09-08T11:00:00Z",
        },
      ],
    });
    await openPanel();

    expect(screen.getByText("notifications.news")).toBeInTheDocument();
    expect(
      screen.getByText("notifications.modules.work_order"),
    ).toBeInTheDocument();
  });

  it("no repite la OT legacy cuando el mismo encargo ya esta en la seccion nueva", async () => {
    setup(
      {
        aggregates: {
          "engagement.pending_partner_approval": {
            count: 1,
            items: [
              {
                engagement_id: "eng-1",
                engagement_code: "1088",
                engagement_name: "Encargo",
              },
            ],
          },
        },
      },
      [
        {
          alert_type: "work_order_pending_approval",
          entity_id: "wo-1",
          staff_id: "me",
          engagement_id: "eng-1",
          priority_level: "medium",
        },
      ],
    );
    await openPanel();

    expect(
      screen.queryByText(/notifications\.types\.work_order_pending_approval/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "notifications.alarms.engagement.pending_partner_approval",
      ),
    ).toBeInTheDocument();
  });

  it("conserva la OT legacy de un encargo que NO esta en la seccion nueva", async () => {
    setup({}, [
      {
        alert_type: "work_order_pending_approval",
        entity_id: "wo-9",
        staff_id: "me",
        engagement_id: "eng-9",
        priority_level: "medium",
      },
    ]);
    await openPanel();

    expect(
      screen.getByText(/notifications\.types\.work_order_pending_approval/),
    ).toBeInTheDocument();
  });
});

describe("NotificationsPanel - estado como badge y navegacion del evento", () => {
  const fundEvent = (overrides: Record<string, unknown> = {}) => ({
    notification_id: "n1",
    type_key: "fund.request.decided",
    module_key: "fund_request" as const,
    label_key: "notifications.types.fund.request.decided",
    entity_id: "fr-1",
    payload: { decision: "rechazado", request_number: "FR-2026-2026" },
    created_at: "2026-09-09T10:00:00Z",
    read_at: null,
    ...overrides,
  });

  it("pinta el estado como badge en vez de interpolarlo en el texto", async () => {
    setup({ events: [fundEvent()], unread_count: 1 });
    await openPanel();

    expect(screen.getByText("notifications.states.rechazado")).toBeInTheDocument();
  });

  it("un evento sin estado no pinta badge", async () => {
    setup({ events: [fundEvent({ payload: { request_number: "FR-1" } })] });
    await openPanel();

    expect(screen.queryByText(/notifications\.states\./)).not.toBeInTheDocument();
  });

  it("la fila del evento lleva a la vista de revision de esa solicitud", async () => {
    setup({ events: [fundEvent()], unread_count: 1 });
    await openPanel();

    const row = screen
      .getByText("notifications.types.fund.request.decided")
      .closest("a");
    expect(row).toHaveAttribute("href", "/fund-requests/fr-1");
  });

  it("un evento de gasto lleva a la pantalla de gastos de su solicitud", async () => {
    setup({
      events: [
        fundEvent({
          type_key: "fund.expense.decided",
          label_key: "notifications.types.fund.expense.decided",
          entity_id: "fre-9",
          payload: { fund_request_id: "fr-1", decision: "observado" },
        }),
      ],
      unread_count: 1,
    });
    await openPanel();

    const row = screen
      .getByText("notifications.types.fund.expense.decided")
      .closest("a");
    expect(row).toHaveAttribute("href", "/fund-requests/fr-1/expenses");
  });

  it("el numero de solicitud va como chip, no dentro del texto", async () => {
    setup({ events: [fundEvent()], unread_count: 1 });
    await openPanel();

    // El texto lleva la accion; el identificador baja a su propio chip para que la fila no
    // parta en dos renglones sola.
    expect(screen.getByText("FR-2026-2026")).toBeInTheDocument();
  });

  it("un evento de OT lleva a su orden de trabajo (FASE 3.b)", async () => {
    setup({
      events: [
        fundEvent({
          type_key: "wo.rejected_partner",
          module_key: "work_order" as const,
          label_key: "notifications.types.wo.rejected_partner",
          entity_id: "wo-7",
          payload: { status: "Rejected" },
        }),
      ],
    });
    await openPanel();

    const row = screen
      .getByText("notifications.types.wo.rejected_partner")
      .closest("a");
    expect(row).toHaveAttribute("href", "/work-orders/wo-7");
  });

  it("un evento de Encargo lleva al encargo (FASE 3.c)", async () => {
    setup({
      events: [
        fundEvent({
          type_key: "engagement.staffing.changed",
          module_key: "engagement" as const,
          label_key: "notifications.types.engagement.staffing.changed",
          entity_id: "eng-3",
          payload: { context: "assigned", engagement_code: "9F01" },
        }),
      ],
    });
    await openPanel();

    const row = screen
      .getByText(/notifications\.types\.engagement\.staffing\.changed/)
      .closest("a");
    expect(row).toHaveAttribute("href", "/engagements/eng-3");
  });

  it("sin engagement.read la fila NO navega: iria a un 'Sin acceso'", async () => {
    // Es el caso real de un Asistente al que asignaron a un encargo: recibe el aviso pero
    // no tiene permiso sobre la pantalla de encargos.
    mockCan.mockImplementation((p: string) => p !== "engagement.read");
    setup({
      events: [
        fundEvent({
          type_key: "engagement.staffing.changed",
          module_key: "engagement" as const,
          label_key: "notifications.types.engagement.staffing.changed",
          entity_id: "eng-3",
          payload: { context: "assigned" },
        }),
      ],
    });
    await openPanel();

    const row = screen
      .getByText(/notifications\.types\.engagement\.staffing\.changed/)
      .closest("a");
    expect(row).toBeNull();
  });

  it("un evento de un modulo sin destino se renderiza sin enlace", async () => {
    // Tracker no tiene disparadores todavia: mandar a una ruta inventada es peor que no
    // linkear, asi que la fila se pinta como texto.
    setup({
      events: [
        fundEvent({
          type_key: "tracker.timer.auto_stopped",
          module_key: "tracker" as const,
          label_key: "notifications.types.tracker.timer.auto_stopped",
          payload: {},
        }),
      ],
    });
    await openPanel();

    const row = screen
      .getByText("notifications.types.tracker.timer.auto_stopped")
      .closest("a");
    expect(row).toBeNull();
  });
});

describe("NotificationsPanel — estados", () => {
  it("muestra el estado vacio unico cuando no hay nada", async () => {
    setup();
    await openPanel();

    expect(screen.getByText("notifications.allClear")).toBeInTheDocument();
    expect(
      screen.getByText("notifications.allClearDescription"),
    ).toBeInTheDocument();
  });

  it("el error del feed legacy no tapa los contadores que si llegaron", async () => {
    mockUseNotifications.mockReturnValue({
      data: { ...EMPTY_PAYLOAD, aggregates: { "timesheet.overdue": { count: 2 } } },
    });
    mockUseStaffingAlerts.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    });
    render(
      <MemoryRouter>
        <NotificationsPanel />
      </MemoryRouter>,
    );
    await openPanel();

    expect(
      screen.getByText("notifications.alarms.timesheet.overdue"),
    ).toBeInTheDocument();
    expect(screen.queryByText("notifications.error")).not.toBeInTheDocument();
  });
});
