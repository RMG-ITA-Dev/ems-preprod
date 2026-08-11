import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SCHEDULER_STAFF_TIMELINE_KEY } from "@/hooks/scheduler/keys";
import type { AssignmentDraft, PersistedAssignment } from "@/lib/engagementAssignments";
import { useSaveEngagementAssignments } from "../useEngagementAssignmentMutations";

/**
 * Fase 5 (plan_v2.md "Files to Change" — Nuevos): archivo dedicado a
 * SCHEDULER_STAFF_TIMELINE_KEY, pedido explícitamente por el plan y por el review #M5. La
 * invalidación en sí vive en un único `onSettled` incondicional (ver
 * useEngagementAssignmentMutations.test.tsx, "invalidates every scheduler cache family exactly
 * once") — este archivo documenta y fija ese contrato específicamente para el timeline del staff,
 * ejercitando cada forma del diff (insert/update/soft-delete) y el camino de fallo por separado.
 */

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

const PERSISTED: PersistedAssignment = {
  assignment_id: "a-1",
  staff_id: "staff-1",
  category_id: "cat-1",
  start_date: "2026-01-01",
  end_date: "2026-06-30",
  hours_per_week: 40,
  allocation_percent: 100,
  notes: null,
};

const NEW_DRAFT: AssignmentDraft = {
  key: "client-uuid-1",
  staff_id: "staff-2",
  category_id: "cat-1",
  start_date: "2026-02-01",
  end_date: "2026-03-01",
  hours_per_week: 20,
  allocation_percent: 50,
  notes: "",
};

const UPDATED_DRAFT: AssignmentDraft = {
  key: "a-1",
  assignment_id: "a-1",
  staff_id: "staff-1",
  category_id: "cat-1",
  start_date: "2026-01-01",
  end_date: "2026-06-30",
  hours_per_week: 35,
  allocation_percent: 80,
  notes: "updated",
};

function timelineInvalidationCount(invalidateSpy: ReturnType<typeof vi.spyOn>): number {
  return invalidateSpy.mock.calls.filter(
    (c) => (c[0] as { queryKey: unknown[] }).queryKey[0] === SCHEDULER_STAFF_TIMELINE_KEY
  ).length;
}

describe("useSaveEngagementAssignments — SCHEDULER_STAFF_TIMELINE_KEY invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates the staff timeline exactly once on an INSERT", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    await result.current.saveAssignments({
      engagementId: "eng-1",
      current: [NEW_DRAFT],
      original: [],
      deletedIds: [],
    });

    expect(timelineInvalidationCount(invalidateSpy)).toBe(1);
  });

  it("invalidates the staff timeline exactly once on an UPDATE", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    await result.current.saveAssignments({
      engagementId: "eng-1",
      current: [UPDATED_DRAFT],
      original: [PERSISTED],
      deletedIds: [],
    });

    expect(timelineInvalidationCount(invalidateSpy)).toBe(1);
  });

  it("invalidates the staff timeline exactly once on an explicit SOFT-DELETE", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    await result.current.saveAssignments({
      engagementId: "eng-1",
      current: [],
      original: [PERSISTED],
      deletedIds: ["a-1"],
    });

    expect(timelineInvalidationCount(invalidateSpy)).toBe(1);
  });

  it("still invalidates the staff timeline exactly once when the RPC fails (a partial server-side write may have occurred upstream)", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("EAS_OVERLAP") } as never);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    await expect(
      result.current.saveAssignments({
        engagementId: "eng-1",
        current: [NEW_DRAFT],
        original: [],
        deletedIds: [],
      })
    ).rejects.toThrow();

    expect(timelineInvalidationCount(invalidateSpy)).toBe(1);
  });

  it("never invalidates the staff timeline from inside a loop — one call regardless of payload size", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    const manyDrafts: AssignmentDraft[] = Array.from({ length: 5 }, (_, i) => ({
      ...NEW_DRAFT,
      key: `client-uuid-${i}`,
    }));

    await result.current.saveAssignments({
      engagementId: "eng-1",
      current: manyDrafts,
      original: [],
      deletedIds: [],
    });

    expect(timelineInvalidationCount(invalidateSpy)).toBe(1);
  });
});
