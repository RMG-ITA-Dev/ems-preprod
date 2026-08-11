// Fase 7 (bugs/scheduler/fase_7/gantt_drag_resize_plan.md) — gate de seguridad: prueba que
// handleBarCommit hace rollback COMPLETO (caché exacta, fechas renderizadas, remount del canvas)
// cuando la RPC transaccional rechaza el commit. Este archivo debe estar verde ANTES de que
// L2StaffGantt.tsx habilite `readonly={!canWrite || isSaving}` (Decisión de la Fase 5 con
// guardia, ahora superada por el plan de la Fase 7).
//
// Límite de jsdom: SVAR (vendor/svar-gantt) no monta su store completo en jsdom, así que
// GanttCanvas se mockea igual que en L2StaffGantt.assignments.test.tsx — el mock expone
// `onBarCommit` directamente (equivalente al evento `update-task` committed que emite el vendor
// real tras un drag/resize) y renderiza las fechas RAW (yyyy-MM-dd) de cada fila para poder
// verificar la restauración visual sin depender del DOM del vendor. Se complementa con una
// prueba manual en navegador (ver el plan, "Verification Steps" §7).

import React, { useRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  SCHEDULER_GAPS_KEY,
  SCHEDULER_L1_KEY,
  SCHEDULER_STAFF_LOAD_KEY,
  SCHEDULER_STAFF_TIMELINE_KEY,
  SCHEDULER_TIMESHEET_AUTHZ_KEY,
} from "@/hooks/scheduler/keys";
import type { EngagementAssignmentRow } from "@/hooks/useEmsData";
import type { GanttBarChange, GanttCanvasRow } from "../GanttCanvas";

if (typeof window !== "undefined") {
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => undefined;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => undefined;
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

const AUTH_USER: { id: string } | null = { id: "viewer-1" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: AUTH_USER }) }));

let mountCounter = 0;
interface CapturedProps {
  rows: GanttCanvasRow[];
  readonly?: boolean;
  onBarCommit?: (change: GanttBarChange) => void;
}
const captured: CapturedProps[] = [];
vi.mock("../GanttCanvas", () => ({
  GanttCanvas: (props: CapturedProps) => {
    captured.push(props);
    const mountId = useRef<number | null>(null);
    if (mountId.current === null) mountId.current = ++mountCounter;
    return (
      <div data-testid="canvas" data-readonly={String(props.readonly)} data-mount-id={mountId.current}>
        {props.rows.map((r) => (
          <div key={r.id} data-testid={`bar-${r.id}`}>
            {r.start} → {r.end}
          </div>
        ))}
      </div>
    );
  },
}));

import { L2StaffGantt } from "../L2StaffGantt";

const ENGAGEMENT_ID = "eng-1";
const ASSIGNMENTS_KEY = ["engagementAssignments", "viewer-1", ENGAGEMENT_ID] as const;

const ENGAGEMENT = { engagement_id: ENGAGEMENT_ID } as unknown as Parameters<
  typeof L2StaffGantt
>[0]["engagement"];

const ROW: EngagementAssignmentRow = {
  assignment_id: "a-1",
  engagement_id: ENGAGEMENT_ID,
  staff_id: "staff-1",
  category_id: "cat-1",
  start_date: "2026-02-01",
  end_date: "2026-06-30",
  hours_per_week: 40,
  allocation_percent: 100,
  notes: null,
  status: "PROPOSED",
  staff: { staff_id: "staff-1", first_name: "Ana", last_name: "Alvarez", short_name: null, category_id: "cat-1" },
  category: { category_id: "cat-1", category_name: "Cat One" } as EngagementAssignmentRow["category"],
};

// Mismo staff que ROW, pero fuera de su rango original — solapa solo si ROW se arrastra hacia
// agosto. Oculta de `assignments` (la vista filtrada) en el test dedicado a ese caso, pero
// SIEMPRE presente en `allAssignments`.
const OTHER_ROW: EngagementAssignmentRow = {
  ...ROW,
  assignment_id: "a-2",
  start_date: "2026-08-01",
  end_date: "2026-09-01",
};

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { queryClient };
}

interface GanttHarnessProps {
  canWrite?: boolean;
  displayAssignments?: EngagementAssignmentRow[];
  onOpenSheet?: (row: EngagementAssignmentRow) => void;
}

function GanttHarness({ canWrite = true, displayAssignments, onOpenSheet = vi.fn() }: GanttHarnessProps) {
  // Misma key que useEngagementAssignments — sin queryFn real: la caché se siembra ANTES del
  // render con queryClient.setQueryData, y `enabled: false` evita que un refetch de fondo la
  // pise durante el test.
  const { data } = useQuery<EngagementAssignmentRow[]>({
    queryKey: ASSIGNMENTS_KEY,
    queryFn: () => Promise.resolve([]),
    enabled: false,
  });
  const all = data ?? [];
  return (
    <L2StaffGantt
      engagement={ENGAGEMENT}
      assignments={displayAssignments ?? all}
      allAssignments={all}
      staffOptions={[]}
      categories={[]}
      requirements={[]}
      loadByStaff={new Map()}
      from="2026-01-01"
      to="2026-12-31"
      zoom="months"
      returnNav={null}
      canWrite={canWrite}
      onOpenSheet={onOpenSheet}
    />
  );
}

function renderHarness(queryClient: QueryClient, props: GanttHarnessProps = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GanttHarness {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Deferred controllable RPC — mimics an in-flight save_engagement_assignments call. */
function pendingRpc() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const latestCommit = () => captured[captured.length - 1]?.onBarCommit;
const latestMountId = () => screen.getByTestId("canvas").getAttribute("data-mount-id");

describe("L2StaffGantt — Fase 7 drag/resize commit gate (rollback transaccional)", () => {
  beforeEach(() => {
    captured.length = 0;
    mountCounter = 0;
    vi.clearAllMocks();
  });

  it("rollback completo: optimista visible, luego revertido a la caché exacta + fechas + remount tras EAS_ENGAGEMENT_RANGE, con un solo toast y exactamente 6 invalidaciones", async () => {
    const { queryClient } = createHarness();
    queryClient.setQueryData(ASSIGNMENTS_KEY, [ROW]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const rpc = pendingRpc();
    vi.mocked(supabase.rpc).mockImplementation(() => rpc.promise as never);

    renderHarness(queryClient);
    const mountIdBefore = latestMountId();

    await act(async () => {
      void latestCommit()!({ id: "a-1", start: "2026-02-10", end: "2026-07-10" });
    });

    // Optimista: la caché ya refleja las fechas nuevas antes de que la RPC resuelva; el bar
    // re-renderiza en un microtask posterior al `setQueryData` (notifyManager de React Query), de
    // ahí el waitFor.
    expect(queryClient.getQueryData(ASSIGNMENTS_KEY)).toEqual([
      { ...ROW, start_date: "2026-02-10", end_date: "2026-07-10" },
    ]);
    await waitFor(() =>
      expect(screen.getByTestId("bar-a-1")).toHaveTextContent("2026-02-10 → 2026-07-10")
    );
    expect(supabase.rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      rpc.reject(new Error("EAS_ENGAGEMENT_RANGE"));
      await rpc.promise.catch(() => {});
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(ASSIGNMENTS_KEY)).toEqual([ROW]);
    });
    await waitFor(() =>
      expect(screen.getByTestId("bar-a-1")).toHaveTextContent("2026-02-01 → 2026-06-30")
    );
    expect(latestMountId()).not.toBe(mountIdBefore);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("engagement.assignments.errors.outOfEngagementRange");

    expect(invalidateSpy).toHaveBeenCalledTimes(6);
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toEqual([
      "engagementAssignments",
      SCHEDULER_L1_KEY,
      SCHEDULER_STAFF_LOAD_KEY,
      SCHEDULER_STAFF_TIMELINE_KEY,
      SCHEDULER_GAPS_KEY,
      SCHEDULER_TIMESHEET_AUTHZ_KEY,
    ]);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("drag válido: éxito mantiene las fechas optimistas y no remonta el canvas", async () => {
    const { queryClient } = createHarness();
    queryClient.setQueryData(ASSIGNMENTS_KEY, [ROW]);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);

    renderHarness(queryClient);
    const mountIdBefore = latestMountId();

    await act(async () => {
      await latestCommit()!({ id: "a-1", start: "2026-03-01", end: "2026-07-15" });
    });

    expect(queryClient.getQueryData(ASSIGNMENTS_KEY)).toEqual([
      { ...ROW, start_date: "2026-03-01", end_date: "2026-07-15" },
    ]);
    // El re-render del bar corre en el microtask del notifyManager de React Query — fuera del
    // batching de `act`, de ahí el waitFor.
    await waitFor(() =>
      expect(screen.getByTestId("bar-a-1")).toHaveTextContent("2026-03-01 → 2026-07-15")
    );
    expect(latestMountId()).toBe(mountIdBefore);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("resize válido: modifica solo el extremo final", async () => {
    const { queryClient } = createHarness();
    queryClient.setQueryData(ASSIGNMENTS_KEY, [ROW]);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);

    renderHarness(queryClient);

    await act(async () => {
      await latestCommit()!({ id: "a-1", start: ROW.start_date, end: "2026-08-31" });
    });

    expect(queryClient.getQueryData(ASSIGNMENTS_KEY)).toEqual([
      { ...ROW, end_date: "2026-08-31" },
    ]);
  });

  it("overlap oculto por filtro (fila presente en allAssignments pero no en la vista filtrada): sin RPC, sin cambio de caché, toast de overlap, remount", async () => {
    const { queryClient } = createHarness();
    queryClient.setQueryData(ASSIGNMENTS_KEY, [ROW, OTHER_ROW]);

    renderHarness(queryClient, { displayAssignments: [ROW] });
    const mountIdBefore = latestMountId();

    // Arrastra ROW hacia el rango de OTHER_ROW (oculto por el filtro de la página).
    await act(async () => {
      void latestCommit()!({ id: "a-1", start: "2026-08-10", end: "2026-08-20" });
    });

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(ASSIGNMENTS_KEY)).toEqual([ROW, OTHER_ROW]);
    expect(toast.error).toHaveBeenCalledWith("scheduler.errors.overlap");
    expect(latestMountId()).not.toBe(mountIdBefore);
  });

  it("canWrite=false: ninguna RPC aunque el callback se invoque directamente", async () => {
    const { queryClient } = createHarness();
    queryClient.setQueryData(ASSIGNMENTS_KEY, [ROW]);

    renderHarness(queryClient, { canWrite: false });
    expect(screen.getByTestId("canvas")).toHaveAttribute("data-readonly", "true");

    await act(async () => {
      void latestCommit()!({ id: "a-1", start: "2026-03-01", end: "2026-07-15" });
    });

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(ASSIGNMENTS_KEY)).toEqual([ROW]);
  });

  it("segundo commit mientras uno está pendiente es rechazado por commitInFlightRef", async () => {
    const { queryClient } = createHarness();
    queryClient.setQueryData(ASSIGNMENTS_KEY, [ROW]);
    const rpc = pendingRpc();
    vi.mocked(supabase.rpc).mockImplementation(() => rpc.promise as never);

    renderHarness(queryClient);

    await act(async () => {
      void latestCommit()!({ id: "a-1", start: "2026-02-10", end: "2026-07-10" });
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      void latestCommit()!({ id: "a-1", start: "2026-02-15", end: "2026-07-20" });
    });
    // El segundo commit fue rechazado — la caché sigue reflejando SOLO el primer optimismo.
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(ASSIGNMENTS_KEY)).toEqual([
      { ...ROW, start_date: "2026-02-10", end_date: "2026-07-10" },
    ]);

    await act(async () => {
      rpc.resolve({ data: [], error: null });
      await rpc.promise.catch(() => {});
    });
  });

  it("fila inexistente en allAssignments: sin RPC, remount, toast partialSave", async () => {
    const { queryClient } = createHarness();
    queryClient.setQueryData(ASSIGNMENTS_KEY, [ROW]);

    renderHarness(queryClient);
    const mountIdBefore = latestMountId();

    await act(async () => {
      void latestCommit()!({ id: "unknown-id", start: "2026-03-01", end: "2026-07-15" });
    });

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("scheduler.errors.partialSave");
    expect(latestMountId()).not.toBe(mountIdBefore);
  });

  it("fechas invertidas (end < start): sin RPC, sin cambio de caché, toast dateRange, remount", async () => {
    const { queryClient } = createHarness();
    queryClient.setQueryData(ASSIGNMENTS_KEY, [ROW]);

    renderHarness(queryClient);
    const mountIdBefore = latestMountId();

    await act(async () => {
      void latestCommit()!({ id: "a-1", start: "2026-07-10", end: "2026-02-10" });
    });

    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(ASSIGNMENTS_KEY)).toEqual([ROW]);
    expect(toast.error).toHaveBeenCalledWith("engagement.assignments.errors.dateRange");
    expect(latestMountId()).not.toBe(mountIdBefore);
  });
});
