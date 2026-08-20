import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// Bug 0722-158: la tabla de Ordenes de Trabajo pasa de 14 a 9 columnas. «Encargo»
// absorbe codigo + el chip de Temporada/Estado; «Cliente» absorbe Socio y Gerente
// como chips. La fusion NO puede costar capacidades: estos tests fijan el conteo de
// columnas, la agrupacion visual, y sobre todo que los DOS filtros y los CINCO
// ordenamientos sobrevivan.

// useIsMobile() decide con window.innerWidth (no con matchMedia.matches), pero se
// suscribe al matchMedia; hay que falsear ambos.
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
  // Radix Select llama scrollIntoView al abrir; jsdom no lo tiene.
  if (typeof Element !== "undefined") {
    Element.prototype.scrollIntoView = vi.fn();
  }

  matchMediaMock(false); // desktop por defecto: renderiza la tabla, no las cards
});

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
  const makeWorkOrder = (
    id: string,
    code: string,
    name: string,
    client: string,
    partner: { id: string; short: string; first: string; last: string },
    manager: { id: string; short: string; first: string; last: string },
  ) => ({
    wo_id: id,
    engagement_id: `eng-${id}`,
    currency: "BOB" as const,
    season_mode: "High" as const,
    tax_rate: 0.13,
    adjustment_amount: 0,
    approval_status: "Approved" as const,
    approved_by: null,
    approved_at: null,
    notes: null,
    budget_lines: [
      { wo_line_id: `bl-${id}`, wo_id: id, category_id: "c1", budgeted_hours: 10, standard_rate: 100 },
    ],
    expense_budget: [],
    engagement: {
      engagement_id: `eng-${id}`,
      engagement_code: code,
      engagement_name: name,
      partner_id: partner.id,
      manager_id: manager.id,
      client: { client_id: "cl1", client_legal_name: client },
      partner: {
        staff_id: partner.id,
        short_name: partner.short,
        first_name: partner.first,
        last_name: partner.last,
      },
      manager: {
        staff_id: manager.id,
        short_name: manager.short,
        first_name: manager.first,
        last_name: manager.last,
      },
    },
  });

  const pagano = { id: "p1", short: "Juan Jose Pagano", first: "Juan Jose", last: "Pagano" };
  const pelaez = { id: "p2", short: "Victor Pelaez M.", first: "Victor", last: "Pelaez" };
  const cori = { id: "m1", short: "Isaac Cori A.", first: "Isaac", last: "Cori" };
  const espejo = { id: "m2", short: "Pamela Espejo Q.", first: "Pamela", last: "Espejo" };

  return {
    workOrders: [
      makeWorkOrder("wo-b", "ZZZ-001", "Auditoria Zeta", "Banco FIE S.A.", pagano, cori),
      makeWorkOrder("wo-a", "AAA-002", "Auditoria Alfa", "Entel S.A.", pelaez, espejo),
    ],
  };
});

vi.mock("@/hooks/useEmsData", () => ({
  useWorkOrders: () => ({ data: workOrders, isLoading: false }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({
    partnerOptions: [
      { value: "p1", label: "Juan Jose Pagano" },
      { value: "p2", label: "Victor Pelaez M." },
    ],
    managerOptions: [
      { value: "m1", label: "Isaac Cori A." },
      { value: "m2", label: "Pamela Espejo Q." },
    ],
  }),
}));

import WorkOrders from "@/pages/WorkOrders";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorkOrders />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const headerCells = () => within(screen.getAllByRole("rowgroup")[0]).getAllByRole("columnheader");
const dataRows = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

describe("WorkOrders — columnas agrupadas (bug 0722-158)", () => {
  it("la cabecera tiene 9 columnas (antes 14)", () => {
    renderPage();
    expect(headerCells()).toHaveLength(9);
  });

  it("Temporada y Estado van como badges etiquetados DENTRO de «Encargo»", () => {
    renderPage();
    // Ya no hay columna propia para ellos: la primera columna es «Encargo».
    expect(screen.queryByText("T/E")).toBeNull();
    expect(within(headerCells()[0]).getByText("engagement.name")).toBeInTheDocument();

    const encargo = within(dataRows()[0]).getAllByRole("cell")[0];
    expect(within(encargo).getByText("ZZZ-001")).toBeInTheDocument();

    // Cada badge dice QUE es, no solo el icono: feedback de 0722-158.
    expect(within(encargo).getByText("workOrders.season")).toBeInTheDocument();
    expect(within(encargo).getByText("workOrders.statusColumn")).toBeInTheDocument();
    // wo-b: season High + Approved.
    expect(within(encargo).getByText("workOrders.seasonHighShort")).toBeInTheDocument();
    expect(within(encargo).getByText("workOrders.status.approved")).toBeInTheDocument();

    // El icono conserva el color de la temporada y el punto el del estado.
    expect(encargo.querySelector("svg")?.getAttribute("class")).toContain("text-warning");
    expect(encargo.querySelector(".rounded-full.bg-success")).toBeTruthy();
  });

  it("«Encargo» agrupa nombre y codigo en la MISMA celda", () => {
    renderPage();
    const encargo = within(dataRows()[0]).getAllByRole("cell")[0];
    expect(within(encargo).getByText("Auditoria Zeta")).toBeInTheDocument();
    expect(within(encargo).getByText("ZZZ-001")).toBeInTheDocument();
  });

  const chips = () => {
    const cliente = within(dataRows()[0]).getAllByRole("cell")[1];
    return {
      cliente,
      socio: within(cliente).getByTitle("engagement.partner: Juan Jose Pagano"),
      gerente: within(cliente).getByTitle("engagement.manager: Isaac Cori"),
    };
  };

  it("«Cliente» agrupa cliente + chips de Socio y Gerente en la MISMA celda", () => {
    renderPage();
    const { cliente, socio, gerente } = chips();
    expect(within(cliente).getByText("Banco FIE S.A.")).toBeInTheDocument();
    expect(socio).toHaveTextContent("Juan Jose Pagano");
    expect(gerente).toHaveTextContent("Isaac Cori A.");
  });

  it("los chips son neutros: mismo estilo para Socio y Gerente", () => {
    // Guarda anti-regresion del bug 0603-138 (mapa de color por rol).
    renderPage();
    const { socio, gerente } = chips();
    expect(socio.className).toBe(gerente.className);
  });

  it("cada chip dice QUE rol es, no solo el nombre", () => {
    // Feedback de 0722-158: dos nombres seguidos no decian quien era Socio y quien
    // Gerente. La etiqueta va visible en el chip; el title suma el nombre completo,
    // que difiere del short_name mostrado ("Isaac Cori" vs "Isaac Cori A.").
    renderPage();
    const { socio, gerente } = chips();
    expect(socio).toHaveTextContent("common.partner");
    expect(gerente).toHaveTextContent("common.manager");
    expect(socio).toHaveTextContent("Juan Jose Pagano");
    expect(gerente).toHaveTextContent("Isaac Cori A.");
  });

  it("el filtro de Socio sobrevive a la fusion y sigue filtrando", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(dataRows()).toHaveLength(2);

    // Los dos triggers de filtro viven ahora en la cabecera «Cliente».
    const clienteHeader = headerCells()[1];
    const socioFilter = within(clienteHeader).getAllByRole("button")[0];
    await user.click(socioFilter);

    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Victor Pelaez M." }));

    expect(dataRows()).toHaveLength(1);
    expect(screen.getByText("Auditoria Alfa")).toBeInTheDocument();
    expect(screen.queryByText("Auditoria Zeta")).toBeNull();
  });

  it("el filtro de Gerente sobrevive a la fusion y sigue filtrando", async () => {
    const user = userEvent.setup();
    renderPage();
    const clienteHeader = headerCells()[1];
    const gerenteFilter = within(clienteHeader).getAllByRole("button")[1];
    await user.click(gerenteFilter);

    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Isaac Cori A." }));

    expect(dataRows()).toHaveLength(1);
    expect(screen.getByText("Auditoria Zeta")).toBeInTheDocument();
  });

  it("el ordenamiento por Nombre sigue accesible desde «Encargo»", () => {
    renderPage();
    const encargoHeader = headerCells()[0];
    expect(within(dataRows()[0]).getAllByRole("cell")[0]).toHaveTextContent("Auditoria Zeta");

    fireEvent.click(within(encargoHeader).getByText("engagement.name"));

    expect(within(dataRows()[0]).getAllByRole("cell")[0]).toHaveTextContent("Auditoria Alfa");
  });

  it("el ordenamiento por Codigo sigue accesible desde «Encargo»", () => {
    renderPage();
    const encargoHeader = headerCells()[0];
    fireEvent.click(within(encargoHeader).getByText("engagement.code"));

    expect(within(dataRows()[0]).getAllByRole("cell")[0]).toHaveTextContent("AAA-002");
  });

  it("la fila de «sin resultados» abarca las 9 columnas", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText("workOrders.searchPlaceholder"), "no-existe-nada");

    const empty = screen.getByText("common.noResults");
    expect(empty.closest("td")).toHaveAttribute("colspan", "9");
  });
});

describe("WorkOrders — barra superior de scroll (bug 0722-158)", () => {
  it("la franja NO cuelga del contenedor overflow-hidden (dejaria el sticky inerte)", () => {
    const { container } = renderPage();
    const marco = container.querySelector(".overflow-hidden");
    expect(marco).toBeTruthy();
    expect(marco!.querySelector(".table-top-scrollbar")).toBeNull();
  });
});

describe("WorkOrders — vista mobile intacta (bug 0722-158)", () => {
  it("por debajo del breakpoint sigue renderizando cards, no la tabla", () => {
    setViewport(true);
    renderPage();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("Auditoria Zeta")).toBeInTheDocument();
    setViewport(false);
  });
});
