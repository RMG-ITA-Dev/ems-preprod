import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// FEAT 1105-219: filtro por estado de lista en /work-orders. Abre en "No finalizadas",
// distingue qué pista falta (Socio / Riesgos / ambas), separa Cancelado y Finalizado, y
// conserva el enlace del tablero de Socio ?status=Pending_Approval con su conjunto crudo.

const setViewport = (mobile: boolean) => {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: mobile ? 500 : 1280,
  });
  matchMediaMock(mobile);
};

const matchMediaMock = (matches: boolean) =>
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;

  if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (typeof Element !== "undefined") {
    Element.prototype.scrollIntoView = vi.fn();
  }

  matchMediaMock(false);
});

afterEach(() => setViewport(false));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "es" },
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, scope: () => null, isLoading: false }),
}));

const { workOrders } = vi.hoisted(() => {
  const APPROVED_AT = "2026-11-01T12:00:00Z";
  const make = (
    id: string,
    name: string,
    wo: {
      approval_status: "Draft" | "Pending_Approval" | "Approved" | "Rejected";
      approved_at?: string | null;
      risk_status?: string;
      override?: number | null;
      funcion?: number;
      currency?: "BOB" | "USD" | "USDT";
    },
  ) => ({
    wo_id: id,
    engagement_id: `eng-${id}`,
    currency: wo.currency ?? "BOB",
    season_mode: "High" as const,
    tax_rate: 0.13,
    adjustment_amount: 0,
    approval_status: wo.approval_status,
    approved_by: null,
    approved_at: wo.approved_at ?? null,
    risk_status: wo.risk_status ?? "Pending",
    notes: null,
    budget_lines: [],
    expense_budget: [],
    engagement: {
      engagement_id: `eng-${id}`,
      engagement_code: `C-${id}`,
      engagement_name: name,
      partner_id: "p1",
      manager_id: "m1",
      funcion: wo.funcion ?? 1,
      engagement_state_override: wo.override ?? null,
      client: { client_id: "cl1", client_legal_name: "Cliente S.A." },
      partner: { staff_id: "p1", short_name: "Socio", first_name: "S", last_name: "S" },
      manager: { staff_id: "m1", short_name: "Gerente", first_name: "G", last_name: "G" },
    },
  });

  return {
    workOrders: [
      make("draft", "OT Borrador", { approval_status: "Draft" }),
      make("both", "OT Pendiente Ambos", { approval_status: "Pending_Approval" }),
      make("risk", "OT Pendiente Riesgos", { approval_status: "Pending_Approval", approved_at: APPROVED_AT }),
      make("partner", "OT Pendiente Socio", { approval_status: "Pending_Approval", risk_status: "Approved" }),
      make("admin", "OT Administrativa Pendiente", { approval_status: "Pending_Approval", funcion: 2 }),
      make("approved", "OT Aprobada", { approval_status: "Approved", approved_at: APPROVED_AT, risk_status: "Approved" }),
      make("rejected", "OT Rechazada", { approval_status: "Rejected" }),
      make("cancelled", "OT Cancelada", { approval_status: "Approved", approved_at: APPROVED_AT, override: 6 }),
      make("finalized", "OT Finalizada", { approval_status: "Approved", approved_at: APPROVED_AT, override: 7 }),
      make("usd", "OT Pendiente USD", { approval_status: "Pending_Approval", currency: "USD" }),
    ],
  };
});

vi.mock("@/hooks/useEmsData", () => ({
  useWorkOrders: () => ({ data: workOrders, isLoading: false }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [] }),
}));

import WorkOrders from "@/pages/WorkOrders";

function renderPage(url = "/work-orders") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <WorkOrders />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const BOB_NAMES = [
  "OT Borrador",
  "OT Pendiente Ambos",
  "OT Pendiente Riesgos",
  "OT Pendiente Socio",
  "OT Administrativa Pendiente",
  "OT Aprobada",
  "OT Rechazada",
  "OT Cancelada",
  "OT Finalizada",
];

const visibleNames = () => BOB_NAMES.filter((n) => screen.queryByText(n) !== null);

const statusSelect = () => screen.getByRole("combobox", { name: "workOrders.statusColumn" });

async function pickStatus(user: ReturnType<typeof userEvent.setup>, optionKey: string) {
  // El filtro de estado vive en la barra superior, visible en escritorio y en móvil.
  await user.click(statusSelect());
  await user.click(await screen.findByRole("option", { name: optionKey }));
}

describe("WorkOrders — filtro de estado (FEAT 1105-219)", () => {
  it("sin ?status= abre en «No finalizadas»: oculta la finalizada y deja la cancelada", () => {
    renderPage();
    expect(statusSelect()).toHaveTextContent("workOrders.listStatus.notFinalized");
    expect(visibleNames()).toEqual(BOB_NAMES.filter((n) => n !== "OT Finalizada"));
  });

  it("el filtro ya no está escondido en la cabecera «Total c/IVA»", () => {
    renderPage();
    const headers = within(screen.getAllByRole("rowgroup")[0]).getAllByRole("columnheader");
    expect(within(headers[headers.length - 1]).queryByRole("button")).toBeNull();
  });

  it("?status=Pending_Approval conserva el conjunto crudo del KPI (las cuatro pendientes en BOB)", () => {
    renderPage("/work-orders?status=Pending_Approval");
    // El Select muestra la etiqueta del alias, no queda en blanco.
    expect(statusSelect()).toHaveTextContent("workOrders.status.pending");
    expect(visibleNames()).toEqual([
      "OT Pendiente Ambos",
      "OT Pendiente Riesgos",
      "OT Pendiente Socio",
      "OT Administrativa Pendiente",
    ]);
  });

  it("?status= desconocido cae al valor por defecto", () => {
    renderPage("/work-orders?status=foo");
    expect(visibleNames()).toEqual(BOB_NAMES.filter((n) => n !== "OT Finalizada"));
  });

  it.each([
    ["workOrders.listStatus.pendingPartner", ["OT Pendiente Socio", "OT Administrativa Pendiente"]],
    ["workOrders.listStatus.pendingRisk", ["OT Pendiente Riesgos"]],
    ["workOrders.listStatus.pendingBoth", ["OT Pendiente Ambos"]],
    ["workOrders.listStatus.approved", ["OT Aprobada"]],
    ["workOrders.listStatus.cancelled", ["OT Cancelada"]],
    ["workOrders.listStatus.finalized", ["OT Finalizada"]],
  ])("elegir %s muestra solo sus filas", async (optionKey, expected) => {
    const user = userEvent.setup();
    renderPage();
    await pickStatus(user, optionKey);
    expect(visibleNames()).toEqual(expected);
  });

  it("«Todas» vuelve a mostrar la finalizada", async () => {
    const user = userEvent.setup();
    renderPage();
    await pickStatus(user, "workOrders.listStatus.all");
    expect(visibleNames()).toEqual(BOB_NAMES);
  });

  it("volver a «No finalizadas» oculta otra vez la finalizada", async () => {
    const user = userEvent.setup();
    renderPage();
    await pickStatus(user, "workOrders.listStatus.finalized");
    expect(visibleNames()).toEqual(["OT Finalizada"]);

    await pickStatus(user, "workOrders.listStatus.notFinalized");
    expect(visibleNames()).toEqual(BOB_NAMES.filter((n) => n !== "OT Finalizada"));
  });

  it("se combina con la moneda: en USD el alias muestra solo la pendiente en USD", async () => {
    const user = userEvent.setup();
    renderPage("/work-orders?status=Pending_Approval");
    expect(screen.queryByText("OT Pendiente USD")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "USD" }));
    expect(screen.getByText("OT Pendiente USD")).toBeInTheDocument();
    expect(visibleNames()).toEqual([]);
  });
});

describe("WorkOrders — filtro de estado en móvil (FEAT 1105-219)", () => {
  it("el mismo Select de la barra funciona sobre las cards y permite ver las finalizadas", async () => {
    setViewport(true);
    const user = userEvent.setup();
    renderPage();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("OT Finalizada")).toBeNull();
    expect(screen.getByText("OT Cancelada")).toBeInTheDocument();

    await pickStatus(user, "workOrders.listStatus.finalized");

    expect(visibleNames()).toEqual(["OT Finalizada"]);
  });
});
