// 0922-190 — "Mis asignaciones": carga, error, vacío, filtros (toggle Vigentes/Históricas/
// Todas + deep-link ?engagementId=), formato de fecha, equivalencia tabla/tarjeta, y el modal
// de notas (incluida la regla: el botón no aparece si `notes` está vacío).

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { MyAssignmentRow } from "@/hooks/useMyAssignments";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === "myAssignments.progressText" && opts) {
        return `${opts.loaded} / ${opts.assigned} h · ${opts.pct}%`;
      }
      if (key === "myAssignments.allocation" && opts) {
        return `${opts.percent}% allocation`;
      }
      return key;
    },
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const queryState = {
  data: undefined as MyAssignmentRow[] | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/hooks/useMyAssignments", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMyAssignments")>(
    "@/hooks/useMyAssignments",
  );
  return {
    ...actual,
    useMyAssignments: () => queryState,
  };
});

import MyAssignments from "../MyAssignments";

function renderPage(url = "/timesheet/assignments") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/timesheet/assignments" element={<MyAssignments />} />
      </Routes>
    </MemoryRouter>,
  );
}

// Vigente, con notas.
const rowCurrent: MyAssignmentRow = {
  assignment_id: "a1",
  engagement_id: "e1",
  category_id: "c1",
  start_date: "2026-09-01",
  end_date: "2026-09-30",
  hours_per_week: 40,
  allocation_percent: 100,
  notes: "Cobertura especial durante la migración.",
  status: "CONFIRMED",
  deleted_at: null,
  engagement: {
    engagement_id: "e1",
    engagement_code: "1042",
    engagement_name: "Auditoría Café del Valle",
    client: { client_id: "cl1", client_legal_name: "Café del Valle SA" },
  },
  category: { category_id: "c1", category_name: "Senior" },
  assigned_hours: 200,
  loaded_hours: 52,
};

// Histórica (CANCELLED), sin notas.
const rowHistorical: MyAssignmentRow = {
  assignment_id: "a2",
  engagement_id: "e2",
  category_id: "c2",
  start_date: "2026-03-01",
  end_date: "2026-03-31",
  hours_per_week: 20,
  allocation_percent: 50,
  notes: null,
  status: "CANCELLED",
  deleted_at: null,
  engagement: {
    engagement_id: "e2",
    engagement_code: "0918",
    engagement_name: "Consultoría ACME",
    client: { client_id: "cl2", client_legal_name: "ACME SA" },
  },
  category: { category_id: "c2", category_name: "Semi Senior" },
  assigned_hours: 100,
  loaded_hours: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  queryState.data = undefined;
  queryState.isLoading = false;
  queryState.isError = false;
  queryState.refetch = vi.fn();
});

describe("estado 1 — carga", () => {
  it("muestra el esqueleto, sin tabla/tarjetas/error/vacío", () => {
    queryState.isLoading = true;
    renderPage();
    expect(screen.getByTestId("my-assignments-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("my-assignments-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("my-assignments-cards")).not.toBeInTheDocument();
    expect(screen.queryByTestId("my-assignments-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("my-assignments-empty")).not.toBeInTheDocument();
  });
});

describe("estado 2 — error", () => {
  it("muestra la alerta destructiva con un Retry conectado a refetch()", () => {
    queryState.isError = true;
    renderPage();
    expect(screen.getByTestId("my-assignments-error")).toBeInTheDocument();
    expect(screen.getByText("myAssignments.loadError")).toBeInTheDocument();
    fireEvent.click(screen.getByText("myAssignments.retry"));
    expect(queryState.refetch).toHaveBeenCalledTimes(1);
  });
});

describe("estado 3 — vacío", () => {
  it("sin ninguna asignación muestra el mensaje vacío específico", () => {
    queryState.data = [];
    renderPage();
    expect(screen.getByTestId("my-assignments-empty")).toHaveTextContent("myAssignments.empty");
  });

  it("con filas pero ningún match de filtro muestra el mensaje de sin resultados", () => {
    // Ambas filas quedan fuera del toggle por defecto ("current") si las dos son históricas.
    queryState.data = [{ ...rowHistorical, assignment_id: "a3" }];
    renderPage();
    expect(screen.getByTestId("my-assignments-empty")).toHaveTextContent("common.noResults");
  });
});

describe("estado 4 — datos: tabla y tarjetas, formato de fecha, filtro por defecto", () => {
  beforeEach(() => {
    queryState.data = [rowCurrent, rowHistorical];
  });

  it("el toggle por defecto (Vigentes) muestra la fila CONFIRMED y oculta la CANCELLED", () => {
    renderPage();
    const table = screen.getByTestId("my-assignments-table");
    expect(within(table).getByText("1042")).toBeInTheDocument();
    expect(within(table).queryByText("0918")).not.toBeInTheDocument();
  });

  it("tabla y tarjetas muestran la misma fila (equivalencia)", () => {
    renderPage();
    const table = screen.getByTestId("my-assignments-table");
    const cards = screen.getByTestId("my-assignments-cards");
    expect(within(table).getByText("1042")).toBeInTheDocument();
    expect(within(cards).getByText("1042")).toBeInTheDocument();
    expect(within(table).getByText("Café del Valle SA")).toBeInTheDocument();
    expect(within(cards).getByText("Café del Valle SA")).toBeInTheDocument();
  });

  it("formatea el período como dd/MM/yyyy – dd/MM/yyyy", () => {
    renderPage();
    const table = screen.getByTestId("my-assignments-table");
    expect(within(table).getByText("01/09/2026 – 30/09/2026")).toBeInTheDocument();
  });

  it("muestra el progreso como {{cargadas}} / {{asignadas}} h · {{pct}}%", () => {
    renderPage();
    // 52/200 = 26%
    expect(screen.getAllByText("52 / 200 h · 26%").length).toBeGreaterThan(0);
  });

  it("toggle Históricas oculta la vigente y muestra la CANCELLED", () => {
    renderPage();
    fireEvent.click(screen.getByText("myAssignments.filters.toggle.historical"));
    const table = screen.getByTestId("my-assignments-table");
    expect(within(table).getByText("0918")).toBeInTheDocument();
    expect(within(table).queryByText("1042")).not.toBeInTheDocument();
  });

  it("toggle Todas muestra ambas filas", () => {
    renderPage();
    fireEvent.click(screen.getByText("myAssignments.filters.toggle.all"));
    const table = screen.getByTestId("my-assignments-table");
    expect(within(table).getByText("1042")).toBeInTheDocument();
    expect(within(table).getByText("0918")).toBeInTheDocument();
  });

  it("el deep-link ?engagementId= arranca en Todas y filtra a ese encargo (notificación de staffing)", () => {
    queryState.data = [rowCurrent, { ...rowHistorical, engagement_id: "e1" }];
    renderPage("/timesheet/assignments?engagementId=e2");
    // Ninguna fila del fixture pertenece a e2: la tabla queda vacía por el filtro de encargo,
    // aunque el toggle "Todas" ya esté activo (no cae en "Vigentes" por defecto).
    expect(screen.getByTestId("my-assignments-empty")).toHaveTextContent("common.noResults");
  });
});

describe("modal de notas", () => {
  beforeEach(() => {
    queryState.data = [rowCurrent, rowHistorical];
  });

  it("el botón de notas solo aparece en la fila que tiene notes", () => {
    renderPage();
    fireEvent.click(screen.getByText("myAssignments.filters.toggle.all"));
    expect(screen.getAllByTestId(`notes-button-${rowCurrent.assignment_id}`).length).toBeGreaterThan(0);
    expect(screen.queryByTestId(`notes-button-${rowHistorical.assignment_id}`)).not.toBeInTheDocument();
  });

  it("abre el modal con el texto de la nota y el % de dedicación", () => {
    renderPage();
    fireEvent.click(screen.getAllByTestId(`notes-button-${rowCurrent.assignment_id}`)[0]);
    const modal = screen.getByTestId("my-assignments-notes-modal");
    expect(within(modal).getByText(rowCurrent.notes as string)).toBeInTheDocument();
    expect(within(modal).getByText("100% allocation")).toBeInTheDocument();
  });
});
