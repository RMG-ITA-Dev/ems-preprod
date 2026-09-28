// 0922-190 — "Mis asignaciones": carga, error, vacío, filtros (toggle Vigentes/Históricas/
// Todas + deep-link ?engagementId=), formato de fecha, equivalencia tabla/tarjeta, y el modal
// de notas (incluida la regla: el botón no aparece si `notes` está vacío).

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
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

// Botón invisible que navega DENTRO del mismo MemoryRouter (misma ruta, otro search param) sin
// desmontar MyAssignments — simula un segundo click en otra notificación de staffing mientras
// la pantalla ya está montada (review 2026-09-28).
function NavigateTo({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      navigate-test-helper
    </button>
  );
}

function renderPageWithNavHelper(initialUrl: string, nextUrl: string) {
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <NavigateTo to={nextUrl} />
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

// Vigente por status (CONFIRMED, sin deleted_at) pero con end_date ya vencido respecto al
// "hoy" fijado abajo (2026-09-15) — nadie la movió a COMPLETED a mano (review 2026-09-28,
// MUST FIX: "Vigentes" no consideraba end_date vencido).
const rowExpiredConfirmed: MyAssignmentRow = {
  assignment_id: "a4",
  engagement_id: "e4",
  category_id: "c1",
  start_date: "2026-01-01",
  end_date: "2026-06-30",
  hours_per_week: 40,
  allocation_percent: 100,
  notes: null,
  status: "CONFIRMED",
  deleted_at: null,
  engagement: {
    engagement_id: "e4",
    engagement_code: "0500",
    engagement_name: "Encargo Vencido",
    client: { client_id: "cl4", client_legal_name: "Cliente Vencido SA" },
  },
  category: { category_id: "c1", category_name: "Senior" },
  assigned_hours: 100,
  loaded_hours: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  queryState.data = undefined;
  queryState.isLoading = false;
  queryState.isError = false;
  queryState.refetch = vi.fn();
  // "Hoy" fijo (2026-09-15, en UTC pero al mediodía para caer del lado correcto en
  // cualquier huso horario razonable) — necesario porque isHistorical() ahora depende de la
  // fecha real (review 2026-09-28); sin esto, rowCurrent (termina 2026-09-30) se volvería
  // histórica sola cuando el calendario real pase esa fecha.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
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

  it("muestra el progreso como cargadas / asignadas · pct", () => {
    renderPage();
    // 52/200 = 26%
    expect(screen.getAllByText("52 / 200 h · 26%").length).toBeGreaterThan(0);
  });

  it("la columna Progreso (encabezado y celda) está alineada a la derecha, como toda celda numérica (review 2026-09-28)", () => {
    renderPage();
    const table = screen.getByTestId("my-assignments-table");
    const header = within(table).getByText("myAssignments.table.progress");
    expect(header).toHaveClass("text-right");
    const progressCell = screen.getAllByText("52 / 200 h · 26%")[0].closest("td");
    expect(progressCell).toHaveClass("text-right");
  });

  it("muestra el % de dedicación en cada fila, tenga o no notas (tabla y tarjetas)", () => {
    renderPage();
    fireEvent.click(screen.getByText("myAssignments.filters.toggle.all"));
    const table = screen.getByTestId("my-assignments-table");
    const cards = screen.getByTestId("my-assignments-cards");
    // rowCurrent tiene notas (100%), rowHistorical NO tiene notas (50%) — el dato debe
    // verse en ambas de todos modos, no solo dentro del modal de notas.
    expect(within(table).getByText("100% allocation")).toBeInTheDocument();
    expect(within(table).getByText("50% allocation")).toBeInTheDocument();
    expect(within(cards).getByText("100% allocation")).toBeInTheDocument();
    expect(within(cards).getByText("50% allocation")).toBeInTheDocument();
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

  it("el deep-link ?engagementId= sin match (p.ej. reemplazo de staffing) muestra el mensaje específico, no el genérico (review 2026-09-28)", () => {
    queryState.data = [rowCurrent, { ...rowHistorical, engagement_id: "e1" }];
    renderPage("/timesheet/assignments?engagementId=e2");
    // Ninguna fila del fixture pertenece a e2: la tabla queda vacía por el filtro de encargo,
    // aunque el toggle "Todas" ya esté activo (no cae en "Vigentes" por defecto). En vez del
    // "sin resultados" genérico, se avisa que la asignación referida ya no es visible (caso
    // real: reemplazo de staffing, la fila cambió de dueño y ya no es de este usuario).
    expect(screen.getByTestId("my-assignments-empty")).toHaveTextContent("myAssignments.deepLinkNotFound");
  });

  it("sin engagementId, cero filas siguen mostrando el mensaje genérico de sin resultados", () => {
    queryState.data = [{ ...rowHistorical, assignment_id: "a3" }];
    renderPage();
    expect(screen.getByTestId("my-assignments-empty")).toHaveTextContent("common.noResults");
  });

  it("si el usuario toca un filtro después del deep-link sin match, el mensaje pasa a ser el genérico (review 2026-09-28)", () => {
    // La fila SÍ es del usuario (engagement_id e1), pero el deep-link apunta a e2 — antes de
    // tocar nada, corresponde el mensaje específico.
    queryState.data = [rowCurrent];
    renderPage("/timesheet/assignments?engagementId=e2");
    expect(screen.getByTestId("my-assignments-empty")).toHaveTextContent("myAssignments.deepLinkNotFound");

    // El usuario cambia el toggle por su cuenta: ya no es "el deep-link no encontró nada", es
    // un resultado de filtro común — no corresponde sugerir una reasignación.
    fireEvent.click(screen.getByText("myAssignments.filters.toggle.current"));
    expect(screen.getByTestId("my-assignments-empty")).toHaveTextContent("common.noResults");
  });

  it("el deep-link ?engagementId= muestra la fila histórica (baja) que sí matchea", () => {
    // Caso real: la notificación fue por una baja (unassigned) de una fila que ya quedó
    // histórica/CANCELLED — el toggle debe arrancar en "Todas" (no "Vigentes") para que la
    // fila no quede oculta por el toggle, y el filtro de encargo debe dejarla pasar.
    queryState.data = [rowCurrent, rowHistorical]; // rowHistorical.engagement_id === "e2"
    renderPage("/timesheet/assignments?engagementId=e2");
    const table = screen.getByTestId("my-assignments-table");
    expect(within(table).getByText("0918")).toBeInTheDocument();
    expect(within(table).queryByText("1042")).not.toBeInTheDocument();
    expect(screen.getByText("myAssignments.filters.toggle.all")).toHaveAttribute("data-state", "on");
  });

  it("una fila CONFIRMED con end_date vencido se trata como histórica, no vigente (review 2026-09-28)", () => {
    queryState.data = [rowCurrent, rowExpiredConfirmed];
    renderPage();
    // Toggle por defecto (Vigentes): rowCurrent sí, rowExpiredConfirmed no, aunque su status
    // también sea CONFIRMED — nadie la movió a COMPLETED cuando terminó en junio.
    const table = screen.getByTestId("my-assignments-table");
    expect(within(table).getByText("1042")).toBeInTheDocument();
    expect(within(table).queryByText("0500")).not.toBeInTheDocument();
  });

  it("toggle Históricas SÍ muestra la CONFIRMED vencida (es el complemento exacto de Vigentes)", () => {
    queryState.data = [rowCurrent, rowExpiredConfirmed];
    renderPage();
    fireEvent.click(screen.getByText("myAssignments.filters.toggle.historical"));
    const table = screen.getByTestId("my-assignments-table");
    expect(within(table).getByText("0500")).toBeInTheDocument();
    expect(within(table).queryByText("1042")).not.toBeInTheDocument();
  });

  it("el deep-link ?engagementId= encuentra una asignación de OTRO año calendario (review 2026-09-28)", () => {
    // Antes, dateFrom/dateTo arrancaban en el año calendario actual aunque el toggle ya
    // estuviera en "Todas" — una asignación enteramente en 2024 quedaba afuera del rango pese
    // a que el filtro de encargo la habría dejado pasar.
    const rowOtroAño: MyAssignmentRow = {
      ...rowCurrent,
      assignment_id: "a5",
      engagement_id: "e5",
      start_date: "2024-03-01",
      end_date: "2024-03-31",
      engagement: { ...rowCurrent.engagement!, engagement_id: "e5", engagement_code: "0300" },
    };
    queryState.data = [rowOtroAño];
    renderPage("/timesheet/assignments?engagementId=e5");
    const table = screen.getByTestId("my-assignments-table");
    expect(within(table).getByText("0300")).toBeInTheDocument();
  });
});

describe("filtros de fecha: ignora el input vaciado (review 2026-09-28)", () => {
  it("limpiar el input 'Desde' no rompe la pantalla ni cambia el valor (el input type=date nativo permite value='')", () => {
    queryState.data = [rowCurrent, rowHistorical];
    renderPage();
    fireEvent.click(screen.getByText("myAssignments.filters.toggle.all"));

    const dateFromInput = screen.getByLabelText("myAssignments.filters.dateRangeFrom") as HTMLInputElement;
    const previousValue = dateFromInput.value;
    fireEvent.change(dateFromInput, { target: { value: "" } });

    // El valor controlado se mantiene (el cambio a "" se ignora) y la tabla sigue en pantalla,
    // en vez de caer al estado de error por mandar una fecha inválida a la RPC.
    expect(dateFromInput.value).toBe(previousValue);
    expect(screen.getByTestId("my-assignments-table")).toBeInTheDocument();
    expect(screen.queryByTestId("my-assignments-error")).not.toBeInTheDocument();
  });

  it("limpiar el input 'Hasta' tampoco propaga el valor vacío", () => {
    queryState.data = [rowCurrent, rowHistorical];
    renderPage();
    fireEvent.click(screen.getByText("myAssignments.filters.toggle.all"));

    const dateToInput = screen.getByLabelText("myAssignments.filters.dateRangeTo") as HTMLInputElement;
    const previousValue = dateToInput.value;
    fireEvent.change(dateToInput, { target: { value: "" } });

    expect(dateToInput.value).toBe(previousValue);
    expect(screen.getByTestId("my-assignments-table")).toBeInTheDocument();
  });
});

describe("deep-link: resincroniza al navegar a otro engagementId sin desmontar (review 2026-09-28)", () => {
  it("un segundo aviso de staffing (otro engagementId) actualiza el filtro, no se queda con el primero", () => {
    const rowX: MyAssignmentRow = {
      ...rowCurrent,
      assignment_id: "aX",
      engagement_id: "eX",
      engagement: { ...rowCurrent.engagement!, engagement_id: "eX", engagement_code: "EX01" },
    };
    const rowY: MyAssignmentRow = {
      ...rowCurrent,
      assignment_id: "aY",
      engagement_id: "eY",
      engagement: { ...rowCurrent.engagement!, engagement_id: "eY", engagement_code: "EY01" },
    };
    queryState.data = [rowX, rowY];

    renderPageWithNavHelper(
      "/timesheet/assignments?engagementId=eX",
      "/timesheet/assignments?engagementId=eY",
    );

    const firstTable = screen.getByTestId("my-assignments-table");
    expect(within(firstTable).getByText("EX01")).toBeInTheDocument();
    expect(within(firstTable).queryByText("EY01")).not.toBeInTheDocument();

    // Misma ruta, distinto engagementId — react-router no desmonta MyAssignments.
    fireEvent.click(screen.getByText("navigate-test-helper"));

    const secondTable = screen.getByTestId("my-assignments-table");
    expect(within(secondTable).getByText("EY01")).toBeInTheDocument();
    expect(within(secondTable).queryByText("EX01")).not.toBeInTheDocument();
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

  it("abre el modal con el texto de la nota (el % de dedicación se ve en la fila, no acá)", () => {
    renderPage();
    fireEvent.click(screen.getAllByTestId(`notes-button-${rowCurrent.assignment_id}`)[0]);
    const modal = screen.getByTestId("my-assignments-notes-modal");
    expect(within(modal).getByText(rowCurrent.notes as string)).toBeInTheDocument();
  });
});
