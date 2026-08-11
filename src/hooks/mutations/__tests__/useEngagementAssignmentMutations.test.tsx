import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  SCHEDULER_GAPS_KEY,
  SCHEDULER_L1_KEY,
  SCHEDULER_STAFF_LOAD_KEY,
  SCHEDULER_STAFF_TIMELINE_KEY,
  SCHEDULER_TIMESHEET_AUTHZ_KEY,
} from "@/hooks/scheduler/keys";
import type { AssignmentDraft, PersistedAssignment } from "@/lib/engagementAssignments";
import { useSaveEngagementAssignments } from "../useEngagementAssignmentMutations";

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

describe("useSaveEngagementAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes save_engagement_assignments exactly once with the full diff, inserts carrying the client key as assignment_id, and never touches the table directly", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    await result.current.saveAssignments({
      engagementId: "eng-1",
      current: [UPDATED_DRAFT, NEW_DRAFT],
      original: [PERSISTED],
      deletedIds: [],
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("save_engagement_assignments", {
      p_engagement_id: "eng-1",
      p_upserts: [
        {
          assignment_id: "a-1",
          staff_id: "staff-1",
          category_id: "cat-1",
          start_date: "2026-01-01",
          end_date: "2026-06-30",
          hours_per_week: 35,
          allocation_percent: 80,
          notes: "updated",
        },
        {
          assignment_id: "client-uuid-1",
          staff_id: "staff-2",
          category_id: "cat-1",
          start_date: "2026-02-01",
          end_date: "2026-03-01",
          hours_per_week: 20,
          allocation_percent: 50,
          notes: null,
        },
      ],
      p_deleted_ids: [],
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("never sends status or created_by", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    await result.current.saveAssignments({
      engagementId: "eng-1",
      current: [NEW_DRAFT],
      original: [],
      deletedIds: [],
    });

    const [, payload] = vi.mocked(supabase.rpc).mock.calls[0];
    const row = (payload as { p_upserts: Record<string, unknown>[] }).p_upserts[0];
    expect(row).not.toHaveProperty("status");
    expect(row).not.toHaveProperty("created_by");
  });

  it("sends explicit soft-deletes separately from upserts", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    await result.current.saveAssignments({
      engagementId: "eng-1",
      current: [],
      original: [PERSISTED],
      deletedIds: ["a-1"],
    });

    expect(supabase.rpc).toHaveBeenCalledWith("save_engagement_assignments", {
      p_engagement_id: "eng-1",
      p_upserts: [],
      p_deleted_ids: ["a-1"],
    });
  });

  it("adopts the RPC's authoritative returned rows", async () => {
    const returned = [
      {
        assignment_id: "a-1",
        staff_id: "staff-1",
        category_id: "cat-1",
        start_date: "2026-01-01",
        end_date: "2026-06-30",
        hours_per_week: 35,
        allocation_percent: 80,
        status: "PROPOSED",
        notes: "updated",
      },
    ];
    vi.mocked(supabase.rpc).mockResolvedValue({ data: returned, error: null } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    const out = await result.current.saveAssignments({
      engagementId: "eng-1",
      current: [UPDATED_DRAFT],
      original: [PERSISTED],
      deletedIds: [],
    });
    expect(out).toEqual(returned);
  });

  it("invalidates every scheduler cache family exactly once, on success and on failure, by prefix (never inside a loop)", async () => {
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

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toEqual([
      "engagementAssignments",
      SCHEDULER_L1_KEY,
      SCHEDULER_STAFF_LOAD_KEY,
      SCHEDULER_STAFF_TIMELINE_KEY,
      SCHEDULER_GAPS_KEY,
      SCHEDULER_TIMESHEET_AUTHZ_KEY,
    ]);
    expect(invalidateSpy).toHaveBeenCalledTimes(6);

    invalidateSpy.mockClear();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("boom") } as never);
    await expect(
      result.current.saveAssignments({
        engagementId: "eng-1",
        current: [NEW_DRAFT],
        original: [],
        deletedIds: [],
      })
    ).rejects.toThrow();
    expect(invalidateSpy).toHaveBeenCalledTimes(6);
  });

  it("preserves dirty state on failure — the caller must not clear drafts (error propagates, no partial-save toast masking)", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("EAS_OVERLAP") } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    await expect(
      result.current.saveAssignments({
        engagementId: "eng-1",
        current: [NEW_DRAFT],
        original: [],
        deletedIds: [],
      })
    ).rejects.toThrow();
  });

  describe.each([
    ["EAS_ENGAGEMENT_NOT_FOUND", "engagement.assignments.errors.engagementNotFound"],
    ["EAS_DENIED", "engagement.assignments.errors.denied"],
    ["EAS_ENGAGEMENT_LOCKED", "engagement.assignments.errors.locked"],
    ["EAS_MISSING_FIELD", "engagement.assignments.errors.requiredFields"],
    ["EAS_DATE_RANGE", "engagement.assignments.errors.dateRange"],
    ["EAS_ENGAGEMENT_RANGE", "engagement.assignments.errors.outOfEngagementRange"],
    ["EAS_HOURS_RANGE", "engagement.assignments.errors.numericRange"],
    ["EAS_ALLOCATION_RANGE", "engagement.assignments.errors.numericRange"],
    ["EAS_CATEGORY_FOREIGN_SERVICE", "engagement.assignments.errors.categoryForeignService"],
    ["EAS_STAFF_INELIGIBLE", "engagement.assignments.errors.staffIneligible"],
    ["EAS_OVERLAP", "scheduler.errors.overlap"],
  ])("known RPC error token %s", (code, i18nKey) => {
    it("maps to a single translated toast and re-throws", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error(code) } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

      await expect(
        result.current.saveAssignments({
          engagementId: "eng-1",
          current: [NEW_DRAFT],
          original: [],
          deletedIds: [],
        })
      ).rejects.toThrow();

      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(i18nKey);
    });
  });

  it("an unmapped/unknown error falls back to the centralized handler with a single toast", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("some_unmapped_db_error") } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveEngagementAssignments(), { wrapper });

    await expect(
      result.current.saveAssignments({
        engagementId: "eng-1",
        current: [NEW_DRAFT],
        original: [],
        deletedIds: [],
      })
    ).rejects.toThrow();

    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
