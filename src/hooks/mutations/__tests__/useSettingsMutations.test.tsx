import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUpdateGlobalSetting } from "../useSettingsMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useSettingsMutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useUpdateGlobalSetting", () => {
    it("calls supabase update with key and value", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { setting_key: "language", setting_value: "es" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateGlobalSetting(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ key: "language", value: "es" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("global_settings");
      expect(mockUpdate).toHaveBeenCalledWith({ setting_value: "es" });
      expect(mockEq).toHaveBeenCalledWith("setting_key", "language");
      expect(toast.success).toHaveBeenCalled();
    });

    it("updates different setting keys", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { setting_key: "work_days", setting_value: "6" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

      const { result } = renderHook(() => useUpdateGlobalSetting(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ key: "work_days", value: "6" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockEq).toHaveBeenCalledWith("setting_key", "work_days");
    });
  });
});
