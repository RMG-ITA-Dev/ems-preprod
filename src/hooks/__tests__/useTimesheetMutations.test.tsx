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
});
