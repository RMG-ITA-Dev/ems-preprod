// 0922-190 — review 2026-09-28 (P2, iteración 7): el useEffect que reacciona a
// ?engagementId= debe resetear TODOS los filtros manuales (no solo engagementFilter), tanto al
// entrar a un deep-link (categoryFilter viejo no debe tapar la fila enlazada) como al salir de
// uno (volver a la ruta plana /timesheet/assignments sin desmontar debe volver a la vista por
// defecto, no quedarse con el toggle/rango/encargo del deep-link anterior).
//
// Archivo separado del resto de MyAssignments.states.test.tsx porque necesita mockear
// @/components/ui/select como un <select> nativo (mismo patrón que
// TrackerEdit.activity-scope.test.tsx) para poder manipular categoryFilter desde el test —
// mockearlo en el archivo principal arriesgaba los tests ya en verde que no lo necesitan.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { MyAssignmentRow, MyAssignmentsFilter } from "@/hooks/useMyAssignments";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// select nativo simplificado, directamente consultable/editable en jsdom.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  }) => (
    <select value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const queryState = {
  data: undefined as MyAssignmentRow[] | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

let lastFilter: MyAssignmentsFilter | undefined;

vi.mock("@/hooks/useMyAssignments", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useMyAssignments")>(
    "@/hooks/useMyAssignments",
  );
  return {
    ...actual,
    useMyAssignments: (filter: MyAssignmentsFilter) => {
      lastFilter = filter;
      return queryState;
    },
  };
});

import MyAssignments from "../MyAssignments";

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

const rowSenior: MyAssignmentRow = {
  assignment_id: "a1",
  engagement_id: "e1",
  category_id: "c-senior",
  start_date: "2026-09-01",
  end_date: "2026-09-30",
  hours_per_week: 40,
  allocation_percent: 100,
  notes: null,
  status: "CONFIRMED",
  deleted_at: null,
  engagement: {
    engagement_id: "e1",
    engagement_code: "1042",
    engagement_name: "Auditoría Café del Valle",
    client: { client_id: "cl1", client_legal_name: "Café del Valle SA" },
  },
  category: { category_id: "c-senior", category_name: "Senior" },
  assigned_hours: 160,
  loaded_hours: 52,
};

const rowSqr: MyAssignmentRow = {
  ...rowSenior,
  assignment_id: "a2",
  engagement_id: "e2",
  category_id: "c-sqr",
  category: { category_id: "c-sqr", category_name: "SQR" },
  engagement: {
    engagement_id: "e2",
    engagement_code: "0918",
    engagement_name: "Consultoría ACME",
    client: { client_id: "cl2", client_legal_name: "ACME SA" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  queryState.data = undefined;
  queryState.isLoading = false;
  queryState.isError = false;
  queryState.refetch = vi.fn();
  lastFilter = undefined;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("deep-link: resetea categoryFilter al entrar (review 2026-09-28, iteración 7)", () => {
  it("un categoryFilter viejo no tapa la fila enlazada de otra categoría", () => {
    queryState.data = [rowSenior, rowSqr];
    renderPageWithNavHelper("/timesheet/assignments", "/timesheet/assignments?engagementId=e2");

    // El usuario deja puesto el filtro de categoría "Senior" ANTES de recibir la notificación.
    const categorySelect = screen.getByDisplayValue("myAssignments.filters.allCategories");
    fireEvent.change(categorySelect, { target: { value: "c-senior" } });

    // Navega vía la notificación a e2 (SQR, otra categoría), sin desmontar la página.
    fireEvent.click(screen.getByText("navigate-test-helper"));

    // Sin el reset, categoryFilter seguiría en "c-senior" y ocultaría la fila SQR enlazada,
    // mostrando el mensaje falso de reasignación en vez de la fila.
    const table = screen.getByTestId("my-assignments-table");
    expect(within(table).getByText("0918")).toBeInTheDocument();
    expect(screen.queryByTestId("my-assignments-empty")).not.toBeInTheDocument();
  });
});

describe("deep-link → ruta plana: resetea todos los filtros al salir (review 2026-09-28, iteración 7)", () => {
  it("navegar de ?engagementId= a la ruta plana vuelve a Vigentes/año calendario/sin encargo ni categoría", () => {
    queryState.data = [rowSenior];
    renderPageWithNavHelper("/timesheet/assignments?engagementId=e1", "/timesheet/assignments");

    // Estado inicial (deep-link): toggle "Todas", rango sin límite práctico.
    expect(lastFilter?.toggle).toBe("all");
    expect(lastFilter?.engagementId).toBe("e1");

    // El usuario también deja puesto un filtro de categoría antes de salir del deep-link.
    const categorySelect = screen.getByDisplayValue(/myAssignments\.filters\./);
    fireEvent.change(categorySelect, { target: { value: "c-senior" } });

    // Navega a la ruta plana (ej. clic en el ítem normal del sidebar) sin desmontar la página.
    fireEvent.click(screen.getByText("navigate-test-helper"));

    // Vuelve a la vista por defecto: Vigentes, año calendario actual, sin encargo ni categoría.
    expect(lastFilter?.toggle).toBe("current");
    expect(lastFilter?.engagementId).toBe("all");
    expect(lastFilter?.dateFrom).toBe("2026-01-01");
    expect(lastFilter?.dateTo).toBe("2026-12-31");
    expect(screen.getByDisplayValue("myAssignments.filters.allCategories")).toBeInTheDocument();
    expect(screen.getByText("myAssignments.filters.toggle.current")).toHaveAttribute("data-state", "on");
  });
});
