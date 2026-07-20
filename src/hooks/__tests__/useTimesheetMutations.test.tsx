import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDeleteTimeEntry, useUpsertTimeEntry } from "../useTimesheetMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useTimesheetMutations (BUG 0220-45)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useDeleteTimeEntry", () => {
    it("allows deletion of time entries that are not exported", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);

      const { result } = renderHook(() => useDeleteTimeEntry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("time-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.from).toHaveBeenCalledWith("time_entries");
      expect(mockEq).toHaveBeenCalledWith("time_id", "time-123");
    });

    it("shows error toast when deletion fails (e.g. locked period)", async () => {
      const error = { message: "APPROVED_LINE_LOCKED: Cannot delete" };
      const mockEq = vi.fn().mockResolvedValue({ error });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);

      const { result } = renderHook(() => useDeleteTimeEntry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("time-locked");

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe("useUpsertTimeEntry", () => {
    it("shows APPROVED_LINE_LOCKED toast when trying to edit approved line", async () => {
      const error = { message: "APPROVED_LINE_LOCKED: Cannot modify" };
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpsertTimeEntry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        staffId: "staff-1",
        engagementId: "eng-1",
        activityId: "act-1",
        dateWorked: new Date("2026-01-15"),
        hours: 8,
        periodId: "period-1",
        existingEntryId: "time-1",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("timesheet.approvedLineCannotEdit");
    });
  });

  // ── BUG 0220-51: Submit/Unsubmit Tests ────────────────────────

  describe("useSubmitTimesheet (BUG 0220-51)", () => {
    it("T1: calls submit_timesheet_safe RPC with correct params", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { period_id: "p1", preserved_approved: 0, reset_to_pending: 0, kept_rejected: 0, new_pending: 2, new_auto_approved: 0, guarded_update_skips: 0 },
        error: null,
      } as any);

      const { useSubmitTimesheet } = await import("../useTimesheetMutations");
      const { result } = renderHook(() => useSubmitTimesheet(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        periodId: "period-1",
        staffId: "staff-1",
        engagementActivityPairs: [
          { engagementId: "eng-1", activityId: "act-1" },
          { engagementId: "eng-2", activityId: "act-2" },
        ],
        isAutoApproved: false,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("submit_timesheet_safe", {
        p_period_id:        "period-1",
        p_staff_id:         "staff-1",
        p_engagement_ids:   ["eng-1", "eng-2"],
        p_activity_ids:     ["act-1", "act-2"],
        p_is_auto_approved: false,
      });
    });

    it("T3: shows auto-approved toast when isAutoApproved=true", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { new_auto_approved: 2 },
        error: null,
      } as any);

      const { useSubmitTimesheet } = await import("../useTimesheetMutations");
      const { result } = renderHook(() => useSubmitTimesheet(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        periodId: "p1",
        staffId: "s1",
        engagementActivityPairs: [{ engagementId: "e1", activityId: "act-1" }],
        isAutoApproved: true,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(toast.success).toHaveBeenCalledWith("timesheet.autoApproved");
    });

    // REVIEW (0526-122 review cycle): the holiday-engagement line validates dynamically
    // per date inside submit_timesheet_safe now, so an auto-approved staff can still end
    // up with a pending line (invalid holiday date). The toast must reflect what the RPC
    // actually did, not just echo the isAutoApproved flag we sent it.
    it("T3b: shows submitted (not auto-approved) toast when isAutoApproved=true but the RPC left a holiday line pending", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { new_pending: 1, new_auto_approved: 1 },
        error: null,
      } as any);

      const { useSubmitTimesheet } = await import("../useTimesheetMutations");
      const { result } = renderHook(() => useSubmitTimesheet(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        periodId: "p1",
        staffId: "s1",
        engagementActivityPairs: [
          { engagementId: "e1", activityId: "act-1" },
          { engagementId: "holiday-eng", activityId: "act-adm" },
        ],
        isAutoApproved: true,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(toast.success).toHaveBeenCalledWith("timesheet.submitted");
      expect(toast.success).not.toHaveBeenCalledWith("timesheet.autoApproved");
    });

    it("T4: handles SUBMIT_NO_ENTRIES error", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "SUBMIT_NO_ENTRIES: Cannot submit" },
      } as any);

      const { useSubmitTimesheet } = await import("../useTimesheetMutations");
      const { result } = renderHook(() => useSubmitTimesheet(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        periodId: "p1",
        staffId: "s1",
        engagementActivityPairs: [{ engagementId: "e1", activityId: "act-1" }],
        isAutoApproved: false,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("timesheet.submitNoEntries");
    });

    it("T-MIN: shows weekly min error toast", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "WEEKLY_MIN_NOT_MET:actual=32,min=40" },
      } as any);

      const { useSubmitTimesheet } = await import("../useTimesheetMutations");
      const { result } = renderHook(() => useSubmitTimesheet(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        periodId: "p1",
        staffId: "s1",
        engagementActivityPairs: [{ engagementId: "e1", activityId: "act-1" }],
        isAutoApproved: false,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("timesheet.weeklyMinNotMet");
    });

    it("T-MAX: shows weekly max error toast", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "WEEKLY_MAX_EXCEEDED:actual=48,max=40" },
      } as any);

      const { useSubmitTimesheet } = await import("../useTimesheetMutations");
      const { result } = renderHook(() => useSubmitTimesheet(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        periodId: "p1",
        staffId: "s1",
        engagementActivityPairs: [{ engagementId: "e1", activityId: "act-1" }],
        isAutoApproved: false,
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("timesheet.weeklyMaxExceeded");
    });

    it("T7: deduplicates engagement IDs before RPC call", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { new_pending: 2 },
        error: null,
      } as any);

      const { useSubmitTimesheet } = await import("../useTimesheetMutations");
      const { result } = renderHook(() => useSubmitTimesheet(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        periodId: "p1",
        staffId: "s1",
        engagementActivityPairs: [
          { engagementId: "eng-1", activityId: "act-1" },
          { engagementId: "eng-1", activityId: "act-1" },
          { engagementId: "eng-2", activityId: "act-2" },
        ],
        isAutoApproved: false,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("submit_timesheet_safe", expect.objectContaining({
        p_engagement_ids: ["eng-1", "eng-2"],
        p_activity_ids:   ["act-1", "act-2"],
      }));
    });
  });

  describe("useUnsubmitTimesheet (BUG 0220-51 / BUG 0508-105)", () => {
    it("T2: calls unsubmit_timesheet_safe RPC and does not directly touch timesheet_periods or line_approvals", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);

      const { useUnsubmitTimesheet } = await import("../useTimesheetMutations");
      const { result } = renderHook(() => useUnsubmitTimesheet(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ periodId: "period-1" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("unsubmit_timesheet_safe", {
        p_period_id: "period-1",
      });
      expect(supabase.from).not.toHaveBeenCalledWith("timesheet_periods");
      expect(supabase.from).not.toHaveBeenCalledWith("timesheet_line_approvals");
    });

    it("T2-err: shows approvedRecallWindowClosed toast when RPC rejects out-of-window recall", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "APPROVED_WEEK_RECALL_WINDOW_CLOSED" },
      } as any);

      const { useUnsubmitTimesheet } = await import("../useTimesheetMutations");
      const { result } = renderHook(() => useUnsubmitTimesheet(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ periodId: "period-1" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("timesheet.approvedRecallWindowClosed");
    });
  });
});
