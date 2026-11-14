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
    it("calls supabase upsert with key and value", async () => {
      // Upsert, not update-only (PR #310 review): a missing key must not abort the save.
      const mockSingle = vi.fn().mockResolvedValue({
        data: { setting_key: "language", setting_value: "es" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any);

      const { result } = renderHook(() => useUpdateGlobalSetting(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ key: "language", value: "es" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("global_settings");
      expect(mockUpsert).toHaveBeenCalledWith(
        { setting_key: "language", setting_value: "es" },
        { onConflict: "setting_key" }
      );
      // 1028-215: the caller shows one toast for the whole save, not one per key.
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("updates different setting keys", async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { setting_key: "work_days", setting_value: "6" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any);

      const { result } = renderHook(() => useUpdateGlobalSetting(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ key: "work_days", value: "6" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mockUpsert).toHaveBeenCalledWith(
        { setting_key: "work_days", setting_value: "6" },
        { onConflict: "setting_key" }
      );
    });

    it("creates the row when the key does not exist yet (missing-seed regression)", async () => {
      // Before the fix, a plain .update() on a non-existent key returned 0 rows and
      // .single() threw — this is exactly the scenario that broke every Settings save
      // for LANGUAGE/ALLOW_WEEKEND_TRACKING before they were added to cero_16.
      const mockSingle = vi.fn().mockResolvedValue({
        data: { setting_key: "ALLOW_WEEKEND_TRACKING", setting_value: "true" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any);

      const { result } = renderHook(() => useUpdateGlobalSetting(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ key: "ALLOW_WEEKEND_TRACKING", value: "true" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(mockSingle).toHaveBeenCalled();
    });

    // 1112-227: la ventana de alarmas recorta los contadores de la campana, asi que guardarla
    // tiene que refrescar tambien las notificaciones, no solo global_settings.
    describe("refresco de la campana", () => {
      function setup(ok = true) {
        const mockSingle = vi.fn().mockResolvedValue(
          ok ? { data: {}, error: null } : { data: null, error: { message: "boom" } }
        );
        const mockUpsert = vi.fn().mockReturnValue({ select: () => ({ single: mockSingle }) });
        vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any);

        const queryClient = new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        });
        const invalidate = vi.spyOn(queryClient, "invalidateQueries");
        const wrapper = ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        );
        const { result } = renderHook(() => useUpdateGlobalSetting(), { wrapper });
        return { result, invalidate };
      }

      const keysInvalidadas = (invalidate: ReturnType<typeof vi.spyOn>) =>
        invalidate.mock.calls.map((c: any[]) => c[0]?.queryKey?.[0]);

      it.each(["TS_ALERT_WINDOW_WEEKS", "TS_TRACKING_START_DATE"])(
        "guardar %s invalida global_settings y notifications",
        async (key) => {
          const { result, invalidate } = setup();
          result.current.mutate({ key, value: "8" });
          await waitFor(() => expect(result.current.isSuccess).toBe(true));

          expect(keysInvalidadas(invalidate)).toEqual(
            expect.arrayContaining(["global_settings", "notifications"])
          );
        }
      );

      it("guardar otra clave no toca las notificaciones", async () => {
        const { result, invalidate } = setup();
        result.current.mutate({ key: "LANGUAGE", value: "es" });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(keysInvalidadas(invalidate)).toContain("global_settings");
        expect(keysInvalidadas(invalidate)).not.toContain("notifications");
      });

      it("si el guardado falla, no refresca la campana", async () => {
        const { result, invalidate } = setup(false);
        result.current.mutate({ key: "TS_ALERT_WINDOW_WEEKS", value: "8" });
        await waitFor(() => expect(result.current.isError).toBe(true));

        expect(keysInvalidadas(invalidate)).not.toContain("notifications");
      });
    });
  });
});
