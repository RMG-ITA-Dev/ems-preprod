import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateStaff,
  useUpdateStaff,
  useDeleteStaff,
} from "../useStaffMutations";

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

describe("useStaffMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateStaff", () => {
    it("should create a staff member with required fields", async () => {
      const mockData = {
        staff_id: "staff-1",
        first_name: "John",
        last_name: "Doe",
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateStaff(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        first_name: "John",
        last_name: "Doe",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("staff");
      expect(mockInsert).toHaveBeenCalledWith({
        first_name: "John",
        last_name: "Doe",
      });
      expect(toast.success).toHaveBeenCalled();
    });

    it("should create a staff member with optional fields", async () => {
      const mockData = {
        staff_id: "staff-1",
        first_name: "John",
        last_name: "Doe",
        email: "john@example.com",
        category_id: "cat-1",
        is_active: true,
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateStaff(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        first_name: "John",
        last_name: "Doe",
        email: "john@example.com",
        category_id: "cat-1",
        is_active: true,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
    });

    it("passes through society_id and service_id unchanged (FEAT 0810-173)", async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: { staff_id: "staff-1" }, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateStaff(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        first_name: "John",
        last_name: "Doe",
        society_id: "soc-1",
        service_id: "svc-1",
        category_id: "cat-1",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ society_id: "soc-1", service_id: "svc-1" })
      );
    });
  });

  describe("useUpdateStaff", () => {
    it("should update staff fields", async () => {
      const mockData = { staff_id: "1", is_active: false };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateStaff(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "1", data: { is_active: false } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("staff");
      expect(mockEq).toHaveBeenCalledWith("staff_id", "1");
      expect(toast.success).toHaveBeenCalled();
    });

    it("passes through society_id and service_id unchanged (FEAT 0810-173)", async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: { staff_id: "1" }, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateStaff(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "1", data: { society_id: "soc-2", service_id: "svc-2" } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpdate).toHaveBeenCalledWith({ society_id: "soc-2", service_id: "svc-2" });
    });
  });

  describe("useDeleteStaff", () => {
    afterEach(() => {
      vi.mocked(supabase.from).mockReset();  // HC-02: prevent leakage
    });

    it("should delete a staff member by id (hard delete, no dependencies)", async () => {
      const mockDeleteEq = vi.fn().mockResolvedValue({ error: null });  // HC-01: named ref
      const mockDeleteFn = vi.fn().mockReturnValue({ eq: mockDeleteEq });

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (["time_entries", "timer_entries", "timesheet_periods", "engagements"].includes(table)) {
          const base = { limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue(base),
              or: vi.fn().mockReturnValue(base),
            }),
          } as any;
        }
        if (table === "staff") {
          return {
            delete: mockDeleteFn,
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          } as any;
        }
        throw new Error(`Unexpected table: ${table}`);
      });

      const { result } = renderHook(() => useDeleteStaff(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("staff-123");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("staff");
      expect(mockDeleteEq).toHaveBeenCalledWith("staff_id", "staff-123");  // HC-01: strong assertion
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
