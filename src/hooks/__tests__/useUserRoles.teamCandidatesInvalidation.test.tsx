import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * BUG 0722-162 — los candidatos del bloque Equipo se derivan de `user_roles.role_key`, así que
 * cambiar roles tiene que invalidar `engagement-team-candidates`.
 *
 * Sin esto, el flujo que induce el propio aviso del formulario ("asigne los roles en
 * Configuración → Roles de Usuario") vuelve a /engagements/new dentro del staleTime global de
 * 60s (App.tsx) y sigue viendo el conjunto viejo, con el botón Crear bloqueado.
 */

const mockRpc = vi.fn();
const mockFunctionsInvoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { useUpdateUserRoleKey, useDeleteAuthUser } from "../useUserRoles";

const TEAM_KEY = "engagement-team-candidates";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const spy = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, spy, wrapper };
}

/** Todas las queryKey que la mutación pidió invalidar, aplanadas a strings. */
function invalidatedKeys(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.flatMap((call) => {
    const arg = call[0] as { queryKey?: unknown[] } | undefined;
    return (arg?.queryKey ?? []).map(String);
  });
}

describe("useUpdateUserRoleKey — invalidación de candidatos del Equipo (0722-162)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalida engagement-team-candidates al asignar un role_key", async () => {
    mockRpc.mockResolvedValue({
      data: { success: true, code: "OK", message: "" },
      error: null,
    });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useUpdateUserRoleKey(), { wrapper });

    await result.current.mutateAsync({ userId: "u1", roleKey: "partner" } as never);

    await waitFor(() => expect(invalidatedKeys(spy)).toContain(TEAM_KEY));
    // Sin pisar lo que ya invalidaba antes.
    expect(invalidatedKeys(spy)).toContain("all_user_roles");
    expect(invalidatedKeys(spy)).toContain("authz_context");
  });

  it("no invalida nada si la mutación falla", async () => {
    mockRpc.mockResolvedValue({
      data: { success: false, code: "LAST_ADMIN", message: "" },
      error: null,
    });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useUpdateUserRoleKey(), { wrapper });

    await expect(
      result.current.mutateAsync({ userId: "u1", roleKey: "partner" } as never)
    ).rejects.toThrow();
    expect(invalidatedKeys(spy)).not.toContain(TEAM_KEY);
  });
});

describe("useDeleteAuthUser — invalidación de candidatos del Equipo (0722-162)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invalida engagement-team-candidates al borrar una cuenta", async () => {
    // Borrar la cuenta rompe el vínculo staff.auth_user_id ⇒ deja de ser candidato.
    mockFunctionsInvoke.mockResolvedValue({
      data: { success: true, code: "OK", message: "" },
      error: null,
    });
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useDeleteAuthUser(), { wrapper });

    await result.current.mutateAsync({ userId: "u1" } as never);

    await waitFor(() => expect(invalidatedKeys(spy)).toContain(TEAM_KEY));
    expect(invalidatedKeys(spy)).toContain("all_user_roles");
  });
});
