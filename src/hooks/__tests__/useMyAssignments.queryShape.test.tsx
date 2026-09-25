import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Review 2026-09-25 (SHOULD FIX): antes, la query de `engagement_assignments` (y la de
 * `time_entries` derivada) no acotaba nada por fecha — el filtro de año calendario del toggle
 * Históricas/Todas solo recortaba en el cliente DESPUÉS de traer todo. Estos tests prueban la
 * forma de la query (qué filtros llegan a Supabase, no el resultado), para que ese acotador de
 * rendimiento (plan_v2.md §"Filtro de fecha por defecto") de verdad reduzca lo que viaja del
 * servidor.
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
  for (const method of ["select", "eq", "neq", "is", "gte", "lte", "or", "in", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => void) => resolve(result);
  return { builder, calls };
}

const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
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

function setupMocks() {
  const assignments = makeQueryBuilder({ data: [], error: null });
  const entries = makeQueryBuilder({ data: [], error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === "engagement_assignments") return assignments.builder;
    if (table === "time_entries") return entries.builder;
    throw new Error(`tabla inesperada en el mock: ${table}`);
  });
  return { assignmentsCalls: assignments.calls, entriesCalls: entries.calls };
}

function methodArgs(calls: { method: string; args: unknown[] }[], method: string) {
  return calls.filter((c) => c.method === method).map((c) => c.args);
}

describe("useMyAssignments — forma de la query por toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Vigentes: filtra por deleted_at/status, sin acotar por fecha", async () => {
    const { assignmentsCalls } = setupMocks();
    renderHook(
      () => useMyAssignments({ toggle: "current", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(assignmentsCalls.some((c) => c.method === "order")).toBe(true));

    expect(methodArgs(assignmentsCalls, "is")).toEqual([["deleted_at", null]]);
    expect(methodArgs(assignmentsCalls, "neq")).toEqual([["status", "CANCELLED"]]);
    expect(methodArgs(assignmentsCalls, "gte")).toEqual([]);
    expect(methodArgs(assignmentsCalls, "lte")).toEqual([]);
    expect(methodArgs(assignmentsCalls, "or")).toEqual([]);
  });

  it("Históricas: acota por rango de fecha Y por deleted_at/status vía OR", async () => {
    const { assignmentsCalls } = setupMocks();
    renderHook(
      () => useMyAssignments({ toggle: "historical", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(assignmentsCalls.some((c) => c.method === "order")).toBe(true));

    expect(methodArgs(assignmentsCalls, "gte")).toEqual([["end_date", "2026-01-01"]]);
    expect(methodArgs(assignmentsCalls, "lte")).toEqual([["start_date", "2026-12-31"]]);
    expect(methodArgs(assignmentsCalls, "or")).toEqual([["deleted_at.not.is.null,status.eq.CANCELLED"]]);
    expect(methodArgs(assignmentsCalls, "is")).toEqual([]);
  });

  it("Todas: acota por rango de fecha, sin el OR de histórico (trae vigentes + históricas del período)", async () => {
    const { assignmentsCalls } = setupMocks();
    renderHook(
      () => useMyAssignments({ toggle: "all", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(assignmentsCalls.some((c) => c.method === "order")).toBe(true));

    expect(methodArgs(assignmentsCalls, "gte")).toEqual([["end_date", "2026-01-01"]]);
    expect(methodArgs(assignmentsCalls, "lte")).toEqual([["start_date", "2026-12-31"]]);
    expect(methodArgs(assignmentsCalls, "or")).toEqual([]);
    expect(methodArgs(assignmentsCalls, "is")).toEqual([]);
  });

  it("no consulta time_entries si no hay asignaciones (sin engagementIds)", async () => {
    const { entriesCalls } = setupMocks();
    const { result } = renderHook(
      () => useMyAssignments({ toggle: "current", dateFrom: "2026-01-01", dateTo: "2026-12-31" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(entriesCalls.length).toBe(0);
  });
});
