import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter } from "react-router-dom";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// Identity translation: every t("some.key") renders literally as "some.key", so assertions
// read the raw i18n keys (same convention as TimesheetApprovalDetail.lock-navigation.test.tsx).
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="app-layout">{children}</div>,
}));

const refs = vi.hoisted(() => {
  const onePendingReversal = [
    {
      request_id: "req-1",
      period_id: "per-3",
      scope: "week",
      engagement_id: null,
      requested_by: "s3",
      requested_at: "2026-05-01T10:00:00Z",
      reason: "motivo de la solicitud",
      status: "pending",
      is_direct: false,
      resolved_by: null,
      resolved_at: null,
      resolution_notes: null,
      period: {
        period_id: "per-3",
        week_start_date: "2026-03-02",
        week_number: 10,
        year: 2026,
        staff_id: "s3",
        staff: { staff_id: "s3", first_name: "Cara", last_name: "Diaz", short_name: null },
      },
    },
  ];
  return {
    roleKey: "manager" as string | null,
    canApprove: true,
    requestReversalMutate: vi.fn(),
    executeReversalMutate: vi.fn(),
    rejectReversalMutate: vi.fn(),
    onePendingReversal,
    pendingReversals: onePendingReversal as unknown[],
    myRequests: [] as unknown[],
  };
});

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: (p: string) => (p === "timesheet_approval.approve" ? refs.canApprove : true),
    roleKey: refs.roleKey,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useTimesheetApprovals", () => ({
  usePendingApprovalSummaries: () => ({
    data: [
      {
        period_id: "per-1",
        staff_id: "s1",
        week_start_date: "2026-05-04",
        week_number: 19,
        year: 2026,
        staff: { staff_id: "s1", first_name: "Ana", last_name: "Lopez", short_name: null },
        totalPendingHours: 8,
        pendingLineCount: 1,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useTimesheetReversals", () => ({
  useApprovedApprovalGroups: () => ({
    data: [
      {
        period_id: "per-2",
        engagement_id: "eng-2",
        staff_id: "s2",
        week_start_date: "2026-04-06",
        week_number: 15,
        year: 2026,
        staff: { staff_id: "s2", first_name: "Beto", last_name: "Vera", short_name: null },
        engagement: { engagement_id: "eng-2", engagement_code: "E-2", engagement_name: "Eng Two" },
        approvedLineCount: 3,
      },
    ],
    isLoading: false,
  }),
  useReversalRequests: () => ({ data: refs.pendingReversals, isLoading: false }),
  useMyReversalRequests: () => ({ data: refs.myRequests, isLoading: false }),
  useRequestTimesheetReversal: () => ({ mutate: refs.requestReversalMutate, isPending: false }),
  useExecuteTimesheetReversal: () => ({ mutate: refs.executeReversalMutate, isPending: false }),
  useRejectTimesheetReversal: () => ({ mutate: refs.rejectReversalMutate, isPending: false }),
}));

import TimesheetApprovals from "../TimesheetApprovals";

async function goToApprovedTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("approval.tabs.approved"));
}

describe("TimesheetApprovals reversal tabs (BUG 0923-209)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refs.roleKey = "manager";
    refs.canApprove = true;
    refs.pendingReversals = refs.onePendingReversal;
    refs.myRequests = [];
  });

  // TA1: manager -- "Solicitar reversión" en Aprobadas, sin "Revertir", y ve "Mis solicitudes".
  it("TA1: approver sees requestReversal (not revert) in Approved, and the myRequests tab", async () => {
    const user = userEvent.setup();
    renderWithRouter(<TimesheetApprovals />);
    await goToApprovedTab(user);

    // getAllByText: la fila se renderiza dos veces (tabla >= md y tarjeta < md); jsdom no
    // aplica el CSS que las oculta según el viewport, así que ambas quedan en el DOM (mismo
    // patrón que BenchTable.tsx / gapsComponents.test.tsx).
    expect(screen.getAllByText("approval.requestReversal")[0]).toBeInTheDocument();
    expect(screen.queryByText("approval.revert")).not.toBeInTheDocument();
    expect(screen.getByText("approval.tabs.myRequests")).toBeInTheDocument();
    expect(screen.queryByText("approval.tabs.reversalQueue")).not.toBeInTheDocument();
  });

  // Review iteración 2, hallazgo #4: "Mis solicitudes" vacío usaba el copy genérico de
  // "sin pendientes", impreciso porque esa tab también lista ejecutadas/rechazadas.
  it("TA1b: the empty myRequests tab uses its own copy, not the generic pending one", async () => {
    const user = userEvent.setup();
    renderWithRouter(<TimesheetApprovals />);
    await user.click(screen.getByText("approval.tabs.myRequests"));

    expect(screen.getByText("approval.noReversalRequests")).toBeInTheDocument();
  });

  // TA1c: una solicitud rechazada debe mostrar la nota del admin (resolution_notes) ADEMÁS del
  // motivo original del solicitante (reason), no una en vez de la otra. La corrección de la
  // iteración 3 (hallazgo #6) hacía que la nota del admin reemplazara al motivo; la de la
  // iteración 4 (hallazgo #4) corrigió que eso le escondía al solicitante su propio motivo una
  // vez resuelta la solicitud.
  it("TA1c: a rejected request in myRequests shows both the original reason and the admin's resolution note", async () => {
    refs.myRequests = [
      {
        request_id: "req-9",
        period_id: "per-9",
        scope: "week",
        engagement_id: null,
        requested_by: "me",
        requested_at: "2026-05-01T10:00:00Z",
        reason: "motivo original del solicitante",
        status: "rejected",
        is_direct: false,
        resolved_by: "admin-1",
        resolved_at: "2026-05-02T10:00:00Z",
        resolution_notes: "nota real del administrador",
        period: {
          period_id: "per-9",
          week_start_date: "2026-03-02",
          week_number: 10,
          year: 2026,
          staff_id: "me",
          staff: { staff_id: "me", first_name: "Yo", last_name: "Mismo", short_name: null },
        },
      },
    ];
    const user = userEvent.setup();
    renderWithRouter(<TimesheetApprovals />);
    await user.click(screen.getByText("approval.tabs.myRequests"));

    expect(screen.getAllByText("nota real del administrador")[0]).toBeInTheDocument();
    expect(screen.getAllByText("motivo original del solicitante")[0]).toBeInTheDocument();
  });

  // TA2: admin -- "Revertir" directo en Aprobadas y la cola "Solicitudes de reversión".
  it("TA2: admin sees revert (not requestReversal) in Approved, and the reversal queue tab", async () => {
    refs.roleKey = "admin";
    const user = userEvent.setup();
    renderWithRouter(<TimesheetApprovals />);
    await goToApprovedTab(user);

    expect(screen.getAllByText("approval.revert")[0]).toBeInTheDocument();
    expect(screen.queryByText("approval.requestReversal")).not.toBeInTheDocument();
    // (1): la fixture de useReversalRequests trae una solicitud pending -- el badge "(N)"
    // sólo se agrega cuando N > 0.
    expect(screen.getByText("approval.tabs.reversalQueue (1)")).toBeInTheDocument();
    expect(screen.queryByText("approval.tabs.myRequests")).not.toBeInTheDocument();
  });

  // El "(N)" del badge sólo aparece cuando hay solicitudes pending -- una cola vacía no
  // necesita mostrar "(0)".
  it("TA2b: admin sees no count badge when the reversal queue is empty", async () => {
    refs.roleKey = "admin";
    refs.pendingReversals = [];
    renderWithRouter(<TimesheetApprovals />);

    expect(screen.getByText("approval.tabs.reversalQueue")).toBeInTheDocument();
    expect(screen.queryByText(/approval\.tabs\.reversalQueue \(/)).not.toBeInTheDocument();
  });

  // TA3: sólo .read (director) -- Aprobadas sin ningún botón de acción, sin tercera tab.
  it("TA3: read-only role sees Approved with no action buttons and no third tab", async () => {
    refs.roleKey = "director";
    refs.canApprove = false;
    const user = userEvent.setup();
    renderWithRouter(<TimesheetApprovals />);
    await goToApprovedTab(user);

    expect(screen.queryByText("approval.revert")).not.toBeInTheDocument();
    expect(screen.queryByText("approval.requestReversal")).not.toBeInTheDocument();
    expect(screen.queryByText("approval.tabs.myRequests")).not.toBeInTheDocument();
    expect(screen.queryByText("approval.tabs.reversalQueue")).not.toBeInTheDocument();
    // La fila sigue siendo visible -- sólo falta la acción, no el dato.
    expect(screen.getAllByText("Eng Two", { exact: false })[0]).toBeInTheDocument();
  });

  // TA4: los filtros acotan las filas, también para el perfil de sólo lectura.
  it("TA4: the staff filter narrows the Approved rows (read-only profile included)", async () => {
    refs.roleKey = "director";
    refs.canApprove = false;
    const user = userEvent.setup();
    renderWithRouter(<TimesheetApprovals />);
    await goToApprovedTab(user);

    expect(screen.getAllByText("Beto", { exact: false })[0]).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("approval.searchPlaceholder");
    await user.type(searchInput, "Nobody Matches This Name");

    expect(screen.queryByText("Beto", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText("approval.noPending")).toBeInTheDocument();
  });

  // TA5: admin, cola de reversiones -- rechazar sin notas deja confirmar deshabilitado.
  it("TA5: rejecting a queued request disables confirm until a reason is typed", async () => {
    refs.roleKey = "admin";
    const user = userEvent.setup();
    renderWithRouter(<TimesheetApprovals />);
    await user.click(screen.getByText("approval.tabs.reversalQueue (1)"));

    await user.click(screen.getAllByText("approval.rejectRequest")[0]);

    const dialog = screen.getByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", { name: "approval.rejectRequest" });
    expect(confirmButton).toBeDisabled();

    const textarea = within(dialog).getByPlaceholderText("approval.notesPlaceholder");
    await user.type(textarea, "no corresponde");
    expect(confirmButton).not.toBeDisabled();
  });

  // TA6: la tab "pending" sigue renderizando la tabla de hoy, sin cambios.
  it("TA6: the pending tab still renders today's table unchanged by default", () => {
    renderWithRouter(<TimesheetApprovals />);
    expect(screen.getByText("staff.name")).toBeInTheDocument();
    expect(screen.getByText("Ana Lopez", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("Beto", { exact: false })).not.toBeInTheDocument();
  });

  // TA7 (review iteración 3, hallazgo #7): un Link de React Router (lo que renderiza una
  // notificación) cambia el `?tab=` sin desmontar la pantalla -- con `defaultValue` (no
  // controlado), Radix ignoraba el cambio y la tab visible no seguía a la URL.
  it("TA7: an in-app Link navigation changes the visible tab without remounting the page", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/timesheet/approvals?tab=pending"]}>
        <Link to="/timesheet/approvals?tab=approved">go-to-approved</Link>
        <TimesheetApprovals />
      </MemoryRouter>
    );

    expect(screen.getByText("Ana Lopez", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("Beto", { exact: false })).not.toBeInTheDocument();

    await user.click(screen.getByText("go-to-approved"));

    expect(screen.getAllByText("Beto", { exact: false })[0]).toBeInTheDocument();
  });
});
