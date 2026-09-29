import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useApprovedApprovalGroups,
  useRequestTimesheetReversal,
  useExecuteTimesheetReversal,
  useRejectTimesheetReversal,
} from "../useTimesheetReversals";

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

describe("useTimesheetReversals (BUG 0923-209)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useApprovedApprovalGroups", () => {
    it("groups approved lines by (period, engagement) and counts lines per group", async () => {
      const rows = [
        {
          period_id: "p1",
          engagement_id: "eng-1",
          status: "approved",
          period: {
            period_id: "p1",
            week_start_date: "2026-05-04",
            week_number: 19,
            year: 2026,
            staff_id: "staff-1",
            staff: { staff_id: "staff-1", first_name: "Ana", last_name: "Lopez", short_name: null },
          },
          engagement: { engagement_id: "eng-1", engagement_code: "E-1", engagement_name: "Engagement One" },
        },
        {
          // Second line, same (period, engagement) group -> approvedLineCount should be 2.
          period_id: "p1",
          engagement_id: "eng-1",
          status: "approved",
          period: {
            period_id: "p1",
            week_start_date: "2026-05-04",
            week_number: 19,
            year: 2026,
            staff_id: "staff-1",
            staff: { staff_id: "staff-1", first_name: "Ana", last_name: "Lopez", short_name: null },
          },
          engagement: { engagement_id: "eng-1", engagement_code: "E-1", engagement_name: "Engagement One" },
        },
      ];
      const mockGte = vi.fn().mockResolvedValue({ data: rows, error: null });
      const mockEq = vi.fn().mockReturnValue({ gte: mockGte });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useApprovedApprovalGroups(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toHaveLength(1);
      expect(result.current.data?.[0].approvedLineCount).toBe(2);
      expect(result.current.data?.[0].staff.first_name).toBe("Ana");
    });

    it("returns an empty array without throwing when there are no approved lines", async () => {
      const mockGte = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockEq = vi.fn().mockReturnValue({ gte: mockGte });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useApprovedApprovalGroups(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([]);
    });
  });

  describe("useRequestTimesheetReversal", () => {
    it("calls request_timesheet_reversal with the exact RPC arguments", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: "req-1", error: null } as any);

      const { result } = renderHook(() => useRequestTimesheetReversal(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        periodId: "p1",
        scope: "week",
        engagementId: null,
        reason: "necesito corregir horas",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("request_timesheet_reversal", {
        p_period_id: "p1",
        p_scope: "week",
        p_engagement_id: null,
        p_reason: "necesito corregir horas",
      });
      expect(toast.success).toHaveBeenCalledWith("timesheet.reversalRequested");
    });

    it("maps REVERSAL_NOT_FULLY_APPROVED to its i18n key instead of the generic handler", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "REVERSAL_NOT_FULLY_APPROVED" },
      } as any);

      const { result } = renderHook(() => useRequestTimesheetReversal(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ periodId: "p1", scope: "week", engagementId: null, reason: "x" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("approval.reversalErrors.notFullyApproved");
    });
  });

  describe("useExecuteTimesheetReversal", () => {
    it("calls execute_timesheet_reversal with the exact RPC arguments", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: "req-1", error: null } as any);

      const { result } = renderHook(() => useExecuteTimesheetReversal(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        periodId: "p1",
        scope: "engagement",
        engagementId: "eng-1",
        reason: "reversion directa",
        requestId: null,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("execute_timesheet_reversal", {
        p_period_id: "p1",
        p_scope: "engagement",
        p_engagement_id: "eng-1",
        p_reason: "reversion directa",
        p_request_id: null,
      });
    });

    it("maps REVERSAL_NOT_ADMIN to its i18n key", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "REVERSAL_NOT_ADMIN" },
      } as any);

      const { result } = renderHook(() => useExecuteTimesheetReversal(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ periodId: "p1", scope: "week", reason: "x" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("approval.reversalErrors.notAdmin");
    });
  });

  describe("useRejectTimesheetReversal", () => {
    it("calls reject_timesheet_reversal with the exact RPC arguments", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);

      const { result } = renderHook(() => useRejectTimesheetReversal(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ requestId: "req-1", notes: "no corresponde" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(supabase.rpc).toHaveBeenCalledWith("reject_timesheet_reversal", {
        p_request_id: "req-1",
        p_notes: "no corresponde",
      });
    });

    it("maps REVERSAL_REJECT_NOTES_REQUIRED to its i18n key", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "REVERSAL_REJECT_NOTES_REQUIRED" },
      } as any);

      const { result } = renderHook(() => useRejectTimesheetReversal(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ requestId: "req-1", notes: "" });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("approval.reversalErrors.rejectNotesRequired");
    });
  });
});
