import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateIndustry,
  useUpdateIndustry,
  useDeleteIndustry,
} from "../useIndustryMutations";

// Create wrapper with fresh QueryClient
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

describe("useIndustryMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCreateIndustry", () => {
    it("should call supabase insert with correct data", async () => {
      const mockData = { industry_id: "1", industry_name: "Tech", fiscal_year_end: "December 31" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateIndustry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ industry_name: "Tech", fiscal_year_end: "December 31" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("industries");
      expect(mockInsert).toHaveBeenCalledWith({ industry_name: "Tech", fiscal_year_end: "December 31" });
      expect(toast.success).toHaveBeenCalled();
    });

    it("should handle errors correctly", async () => {
      const mockError = { message: "Database error" };
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: mockError });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any);

      const { result } = renderHook(() => useCreateIndustry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ industry_name: "Tech", fiscal_year_end: "December 31" });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useUpdateIndustry", () => {
    it("should call supabase update with correct data", async () => {
      const mockData = { industry_id: "1", industry_name: "Updated Tech", fiscal_year_end: "March 31" };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockData, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateIndustry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: "1", data: { industry_name: "Updated Tech" } });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("industries");
      expect(mockUpdate).toHaveBeenCalledWith({ industry_name: "Updated Tech" });
      expect(mockEq).toHaveBeenCalledWith("industry_id", "1");
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe("useDeleteIndustry", () => {
    it("should call supabase delete with correct id", async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ delete: mockDelete } as any);

      const { result } = renderHook(() => useDeleteIndustry(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("industries");
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith("industry_id", "1");
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
