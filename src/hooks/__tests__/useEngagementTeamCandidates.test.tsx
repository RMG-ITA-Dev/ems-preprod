import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * BUG 0722-162 — agrupación de candidatos del bloque Equipo.
 *
 * El filtro por rol vive en el RPC (no se puede confiar en el cliente); acá se cubre que la
 * agrupación reparte bien las filas, que el error NUNCA degrada a la nómina completa, y que
 * Socio/Director alimenta los dos campos que lo comparten.
 */

const mockRpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

import { useEngagementTeamCandidates } from "../useEngagementTeamCandidates";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const row = (
  staff_id: string,
  display_name: string,
  candidate_group: string | null,
  practica_id: string | null = "svc-audit"
) => ({ staff_id, display_name, candidate_group, practica_id });

// Un candidato por grupo, en el orden por apellido que devuelve el RPC.
const FULL_SET = [
  row("p1", "Ana Alvarez", "partner_director"),
  row("d1", "Beto Blanco", "partner_director"),
  row("m1", "Carla Cruz", "manager"),
  row("s1", "Dario Diaz", "encargado"),
  row("ss1", "Elena Egues", "encargado"),
  row("it1", "Fabio Flores", "specialist_it"),
  row("tx1", "Gina Gomez", "specialist_tax"),
];

async function renderWith(data: unknown[] | null, error: unknown = null) {
  mockRpc.mockResolvedValue({ data, error });
  const view = renderHook(() => useEngagementTeamCandidates(), { wrapper: createWrapper() });
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

describe("useEngagementTeamCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("llama al RPC una sola vez, por nombre", async () => {
    await renderWith(FULL_SET);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("get_engagement_team_candidates");
  });

  it("agrupa las filas en los cinco grupos de candidatura", async () => {
    const { result } = await renderWith(FULL_SET);
    expect(result.current.partnerDirectorOptions.map((o) => o.value)).toEqual(["p1", "d1"]);
    expect(result.current.managerRoleOptions.map((o) => o.value)).toEqual(["m1"]);
    expect(result.current.encargadoOptions.map((o) => o.value)).toEqual(["s1", "ss1"]);
    expect(result.current.specialistItOptions.map((o) => o.value)).toEqual(["it1"]);
    expect(result.current.specialistTaxOptions.map((o) => o.value)).toEqual(["tx1"]);
  });

  it("Socio/Director alimenta el campo Socio y el campo SQR con el mismo conjunto", async () => {
    const { result } = await renderWith(FULL_SET);
    // EngagementForm pasa este mismo array a partner_id y a sqr_id.
    expect(result.current.partnerDirectorOptions).toHaveLength(2);
    expect(result.current.partnerDirectorOptions.map((o) => o.label)).toEqual([
      "Ana Alvarez",
      "Beto Blanco",
    ]);
  });

  it("usa staff_id como value, el nombre completo como label y conserva serviceId", async () => {
    const { result } = await renderWith([row("m1", "Carla Cruz", "manager", "svc-consult")]);
    expect(result.current.managerRoleOptions[0]).toEqual({
      value: "m1",
      label: "Carla Cruz",
      serviceId: "svc-consult",
    });
  });

  it("preserva el orden por apellido que devuelve el RPC", async () => {
    const { result } = await renderWith([
      row("z", "Zulema Zapata", "manager"),
      row("a", "Ana Alvarez", "manager"),
    ]);
    expect(result.current.managerRoleOptions.map((o) => o.value)).toEqual(["z", "a"]);
  });

  it("omite filas con candidate_group nulo o desconocido", async () => {
    const { result } = await renderWith([
      row("ok", "Valido Valido", "manager"),
      row("null", "Sin Grupo", null),
      row("raro", "Grupo Raro", "grupo_inexistente"),
    ]);
    expect(result.current.managerRoleOptions.map((o) => o.value)).toEqual(["ok"]);
    const total = [
      ...result.current.partnerDirectorOptions,
      ...result.current.managerRoleOptions,
      ...result.current.encargadoOptions,
      ...result.current.specialistItOptions,
      ...result.current.specialistTaxOptions,
    ];
    expect(total).toHaveLength(1);
  });

  it("ante error del RPC devuelve los cinco arrays vacíos — nunca la nómina completa", async () => {
    const { result } = await renderWith(null, { message: "permission denied" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.partnerDirectorOptions).toEqual([]);
    expect(result.current.managerRoleOptions).toEqual([]);
    expect(result.current.encargadoOptions).toEqual([]);
    expect(result.current.specialistItOptions).toEqual([]);
    expect(result.current.specialistTaxOptions).toEqual([]);
  });

  it("con data nula (caller sin permiso, fail-closed) devuelve arrays vacíos sin error", async () => {
    const { result } = await renderWith([]);
    expect(result.current.isError).toBe(false);
    expect(result.current.partnerDirectorOptions).toEqual([]);
    expect(result.current.managerRoleOptions).toEqual([]);
  });

  // Review de Codex: el consumidor necesita distinguir "sin datos" de "datos viejos mientras
  // refetchea en background". isLoading solo cubre el primero.
  it("expone isFetching además de isLoading", async () => {
    const { result } = await renderWith(FULL_SET);
    expect(result.current).toHaveProperty("isFetching");
    expect(result.current.isFetching).toBe(false);
  });

  // Review de Codex: el hook NO expone flags de "hay candidatos" — EngagementForm deriva el
  // aviso de "falta personal" directamente de la longitud de estos mismos arrays.
  it("no expone flags globales de presencia de candidatos", async () => {
    const { result } = await renderWith(FULL_SET);
    expect(result.current).not.toHaveProperty("hasPartnerDirectorCandidates");
    expect(result.current).not.toHaveProperty("hasManagerCandidates");
  });
});
