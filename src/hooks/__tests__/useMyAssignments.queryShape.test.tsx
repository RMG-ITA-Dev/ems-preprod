import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Review 2026-09-25.
 *
 * SHOULD FIX (iteración 1): antes, la query de `engagement_assignments` (y la de
 * `time_entries` derivada) no acotaba nada por fecha — el filtro de año calendario del toggle
 * Históricas/Todas solo recortaba en el cliente DESPUÉS de traer todo. Los tests de "forma de
 * la query" prueban qué parámetros llegan a la RPC `list_my_assignments` por cada toggle.
 *
 * MUST FIX (iteración 2): la query original traía encargo/cliente con un embed anidado de
 * PostgREST (engagement:engagements(...), client:clients(...)), que depende de las policies
 * SELECT de esas tablas (engagement.read/client.read) — permiso que los roles destinatarios
 * del aviso de staffing no siempre tienen, así que la fila se veía pero encargo/cliente
 * llegaban null. Ahora `useMyAssignments` llama a la RPC `list_my_assignments` (SECURITY
 * DEFINER, gate propio `staff_id = get_my_staff_id()`) que devuelve las etiquetas en columnas
 * planas; los tests de "mapeo de fila" prueban que esas columnas planas se reconstruyen en el
 * objeto anidado `engagement`/`category` que consume MyAssignments.tsx, sin depender de ningún
 * embed ni de ningún permiso adicional.
 *
 * SHOULD FIX (iteración 3): la query de `time_entries` no paginaba — si el número de filas del
 * staff alcanzaba el límite por página de PostgREST, el resto se truncaba en silencio y
 * `loaded_hours` quedaba subestimado sin ningún error. Los tests de "paginación" prueban que,
 * cuando una página vuelve completa (== TIME_ENTRIES_PAGE_SIZE filas), se pide la página
 * siguiente con el offset correcto, y que el total sumado incluye ambas páginas.
 */

vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("../useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { staff_id: "staff-1" }, staffRecord: { staff_id: "staff-1" } }),
}));

function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: any = {};
  for (const method of ["select", "eq", "neq", "is", "gte", "lte", "or", "in", "order", "range"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void) => resolve(result);
  return { builder, calls };
}

function makeEntryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    engagement_id: "e1",
    date_worked: "2026-09-10",
    hours_logged: 1,
    ...overrides,
  };
}

function makeAssignmentRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    assignment_id: "a1",
    engagement_id: "e1",
    category_id: "c1",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
    hours_per_week: 40,
    allocation_percent: 100,
    notes: null,
    status: "CONFIRMED",
    deleted_at: null,
    engagement_code: "1042",
    engagement_name: "Auditoría Café del Valle",
    client_id: "cl1",
    client_legal_name: "Café del Valle SA",
    category_name: "Senior",
    ...overrides,
  };
}

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import { useMyAssignments } from "../useMyAssignments";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function setupMocks(rows: ReturnType<typeof makeAssignmentRow>[] = []) {
  mockRpc.mockResolvedValue({ data: rows, error: null });
  const entries = makeQueryBuilder({ data: [], error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === "time_entries") return entries.builder;
    throw new Error(`tabla inesperada en el mock: ${table}`);
  });
  return { entriesCalls: entries.calls };
}

// Cada iteración del loop de paginación llama a supabase.from("time_entries") de nuevo, así
// que el mock sirve una página distinta por invocación (en vez de un único builder fijo).
function setupPaginationMocks(pages: ReturnType<typeof makeEntryRow>[][]) {
  mockRpc.mockResolvedValue({ data: [makeAssignmentRow()], error: null });
  let pageIndex = 0;
  const callsPerPage: { method: string; args: unknown[] }[][] = [];
  mockFrom.mockImplementation((table: string) => {
    if (table !== "time_entries") throw new Error(`tabla inesperada en el mock: ${table}`);
    const pageData = pages[pageIndex] ?? [];
    pageIndex += 1;
    const { builder, calls } = makeQueryBuilder({ data: pageData, error: null });
    callsPerPage.push(calls);
    return builder;
  });
  return { callsPerPage };
}

describe("useMyAssignments — parámetros de la RPC list_my_assignments por toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Vigentes: llama a la RPC con p_toggle='current'", async () => {
    setupMocks();
    const { result } = renderHook(
      () => useMyAssignments({ toggle: "current", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith("list_my_assignments", {
      p_toggle: "current",
      p_date_from: "2026-01-01",
      p_date_to: "2026-12-31",
    });
  });

  it("Históricas: llama a la RPC con p_toggle='historical' y el rango elegido", async () => {
    setupMocks();
    const { result } = renderHook(
      () => useMyAssignments({ toggle: "historical", dateFrom: "2025-01-01", dateTo: "2025-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith("list_my_assignments", {
      p_toggle: "historical",
      p_date_from: "2025-01-01",
      p_date_to: "2025-12-31",
    });
  });

  it("Todas: llama a la RPC con p_toggle='all'", async () => {
    setupMocks();
    const { result } = renderHook(
      () => useMyAssignments({ toggle: "all", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith("list_my_assignments", {
      p_toggle: "all",
      p_date_from: "2026-01-01",
      p_date_to: "2026-12-31",
    });
  });

  it("no consulta time_entries si la RPC no devuelve asignaciones", async () => {
    const { entriesCalls } = setupMocks([]);
    const { result } = renderHook(
      () => useMyAssignments({ toggle: "current", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(entriesCalls.length).toBe(0);
  });
});

describe("useMyAssignments — mapeo de columnas planas de la RPC a engagement/category anidados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconstruye engagement (con client anidado) y category desde las columnas planas de la RPC", async () => {
    setupMocks([makeAssignmentRow()]);
    const { result } = renderHook(
      () => useMyAssignments({ toggle: "current", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const row = result.current.data![0];
    expect(row.engagement).toEqual({
      engagement_id: "e1",
      engagement_code: "1042",
      engagement_name: "Auditoría Café del Valle",
      client: { client_id: "cl1", client_legal_name: "Café del Valle SA" },
    });
    expect(row.category).toEqual({ category_id: "c1", category_name: "Senior" });
  });

  it("no depende de ningún embed/permiso adicional: sin engagement_name la fila queda con engagement null en vez de reventar", async () => {
    // Caso defensivo (no debería ocurrir con la RPC real, que hace LEFT JOIN sobre una FK
    // NOT NULL) pero el mapeo debe degradar con gracia, igual que antes hacía el embed nulo.
    setupMocks([makeAssignmentRow({ engagement_name: null, engagement_code: null, client_id: null, client_legal_name: null })]);
    const { result } = renderHook(
      () => useMyAssignments({ toggle: "current", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data![0].engagement).toBeNull();
  });
});

describe("useMyAssignments — paginación de time_entries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pide una segunda página cuando la primera vuelve completa (== TIME_ENTRIES_PAGE_SIZE), y suma ambas", async () => {
    const PAGE_SIZE = 1000;
    const fullPage = Array.from({ length: PAGE_SIZE }, () => makeEntryRow({ hours_logged: 1 }));
    const lastPage = [makeEntryRow({ date_worked: "2026-09-11", hours_logged: 5 })];
    const { callsPerPage } = setupPaginationMocks([fullPage, lastPage]);

    const { result } = renderHook(
      () => useMyAssignments({ toggle: "current", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(callsPerPage.length).toBe(2);
    const rangeArgs = (calls: { method: string; args: unknown[] }[]) =>
      calls.find((c) => c.method === "range")?.args;
    expect(rangeArgs(callsPerPage[0])).toEqual([0, PAGE_SIZE - 1]);
    expect(rangeArgs(callsPerPage[1])).toEqual([PAGE_SIZE, 2 * PAGE_SIZE - 1]);

    // 1000 horas de la primera página + 5 de la segunda = 1005.
    expect(result.current.data![0].loaded_hours).toBe(1005);
  });

  it("no pide una segunda página si la primera vuelve incompleta (< TIME_ENTRIES_PAGE_SIZE)", async () => {
    const shortPage = [makeEntryRow({ hours_logged: 8 })];
    const { callsPerPage } = setupPaginationMocks([shortPage]);

    const { result } = renderHook(
      () => useMyAssignments({ toggle: "current", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(callsPerPage.length).toBe(1);
    expect(result.current.data![0].loaded_hours).toBe(8);
  });

  // Review 2026-09-28 (P1): ordenar solo por date_worked no es un orden estable entre llamadas
  // cuando hay filas empatadas en esa fecha justo en el borde de una página — podían quedar
  // salteadas o contadas dos veces entre una página y la siguiente.
  it("ordena por date_worked y por time_id (desempate) antes de paginar", async () => {
    const shortPage = [makeEntryRow({ hours_logged: 8 })];
    const { callsPerPage } = setupPaginationMocks([shortPage]);

    const { result } = renderHook(
      () => useMyAssignments({ toggle: "current", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const orderCalls = callsPerPage[0].filter((c) => c.method === "order").map((c) => c.args[0]);
    expect(orderCalls).toEqual(["date_worked", "time_id"]);
  });
});

describe("useMyAssignments — acota time_entries al encargo seleccionado (deep-link/filtro manual)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("con engagementId acota engagementIds/minStart/maxEnd a las filas de ese encargo, no a todo el historial", async () => {
    const rowOther = makeAssignmentRow({
      assignment_id: "a-other",
      engagement_id: "e-other",
      start_date: "2010-01-01",
      end_date: "2010-01-31",
    });
    const rowTarget = makeAssignmentRow({
      assignment_id: "a-target",
      engagement_id: "e-target",
      start_date: "2026-09-01",
      end_date: "2026-09-30",
    });
    const { entriesCalls } = setupMocks([rowOther, rowTarget]);

    const { result } = renderHook(
      () =>
        useMyAssignments({
          toggle: "all",
          dateFrom: "2000-01-01",
          dateTo: "2100-01-01",
          engagementId: "e-target",
        }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Ambas filas siguen presentes en el resultado (dropdowns/filtros del cliente las siguen
    // necesitando), pero time_entries solo se consulta para el encargo seleccionado.
    expect(result.current.data).toHaveLength(2);
    const inArgs = entriesCalls.find((c) => c.method === "in")?.args;
    expect(inArgs).toEqual(["engagement_id", ["e-target"]]);
    const gteArgs = entriesCalls.find((c) => c.method === "gte")?.args;
    expect(gteArgs).toEqual(["date_worked", "2026-09-01"]);
  });

  it("sin engagementId (o 'all') sigue acotando a todos los encargos devueltos", async () => {
    const rowA = makeAssignmentRow({ assignment_id: "a1", engagement_id: "e1" });
    const rowB = makeAssignmentRow({ assignment_id: "a2", engagement_id: "e2" });
    const { entriesCalls } = setupMocks([rowA, rowB]);

    const { result } = renderHook(
      () =>
        useMyAssignments({
          toggle: "all",
          dateFrom: "2000-01-01",
          dateTo: "2100-01-01",
          engagementId: "all",
        }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const inArgs = entriesCalls.find((c) => c.method === "in")?.args;
    expect(inArgs).toEqual(["engagement_id", ["e1", "e2"]]);
  });
});
