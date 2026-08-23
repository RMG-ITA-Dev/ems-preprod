import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * BUG 0722-162 — los candidatos del bloque Equipo se filtran por `is_active`, `deleted_at` y
 * `practica_id` del personal, así que cualquier alta/edición/baja cambia ese conjunto.
 *
 * Sin invalidar `engagement-team-candidates`, un admin que desactiva o mueve de servicio a
 * alguien y vuelve a /engagements/new dentro del staleTime global de 60s (App.tsx) sigue
 * viéndolo ofrecido — y el write path del encargo no revalida esos atributos, así que la
 * asignación obsoleta se persiste.
 */

const mockSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/i18n", () => ({ default: { t: (k: string) => k } }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useCreateStaff, useUpdateStaff, useDeleteStaff } from "../useStaffMutations";

const TEAM_KEY = "engagement-team-candidates";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { spy, wrapper };
}

function invalidatedKeys(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.flatMap((call) => {
    const arg = call[0] as { queryKey?: unknown[] } | undefined;
    return (arg?.queryKey ?? []).map(String);
  });
}

/** Builder chainable de supabase-js, terminal en `.single()` o al await. */
function chain(result: { data?: unknown; error?: unknown }) {
  const obj: Record<string, unknown> = {};
  // Cubre toda la cadena que usan las tres mutaciones (useDeleteStaff sondea referencias
  // con select().or().limit() antes de decidir hard vs soft delete).
  for (const m of [
    "insert", "update", "delete", "select", "eq", "is", "in",
    "limit", "order", "not", "or", "neq", "gte", "lte",
  ]) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }
  obj.single = mockSingle.mockResolvedValue(result);
  obj.maybeSingle = vi.fn().mockResolvedValue(result);
  (obj as { then?: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return obj;
}

describe("mutaciones de personal — invalidación de candidatos del Equipo (0722-162)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockImplementation(() => chain({ data: { staff_id: "s1" }, error: null }));
  });

  it("useCreateStaff invalida engagement-team-candidates", async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useCreateStaff(), { wrapper });

    await result.current.mutateAsync({ first_name: "Ana", last_name: "Nueva" });

    await waitFor(() => expect(invalidatedKeys(spy)).toContain(TEAM_KEY));
    // Sin pisar lo que ya invalidaba.
    expect(invalidatedKeys(spy)).toContain("staff");
    expect(invalidatedKeys(spy)).toContain("staff_full");
    expect(invalidatedKeys(spy)).toContain("current_staff");
  });

  it("useUpdateStaff invalida engagement-team-candidates", async () => {
    // Cambiar practica_id o is_active mueve a la persona de conjunto.
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useUpdateStaff(), { wrapper });

    await result.current.mutateAsync({
      id: "s1",
      data: { is_active: false },
    } as never);

    await waitFor(() => expect(invalidatedKeys(spy)).toContain(TEAM_KEY));
    expect(invalidatedKeys(spy)).toContain("staff");
  });

  it("useDeleteStaff invalida engagement-team-candidates", async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useDeleteStaff(), { wrapper });

    await result.current.mutateAsync("s1" as never);

    await waitFor(() => expect(invalidatedKeys(spy)).toContain(TEAM_KEY));
    expect(invalidatedKeys(spy)).toContain("staff");
  });
});
