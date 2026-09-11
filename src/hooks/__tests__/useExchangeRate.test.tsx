import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLatestExchangeRate } from "../useExchangeRate";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn() },
}));

describe("useLatestExchangeRate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects explicit columns, orders by fecha_vigencia desc, limits to 1", async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { fecha_vigencia: "2026-08-26", compra: 11.57, venta: 11.67, fuente: "BCB", estado: "vigente" },
      error: null,
    });
    const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useLatestExchangeRate(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledWith("exchange_rate_history");
    expect(mockSelect).toHaveBeenCalledWith("fecha_vigencia,compra,venta,fuente,estado");
    expect(mockOrder).toHaveBeenCalledWith("fecha_vigencia", { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(1);
    expect(result.current.data).toEqual({
      fecha_vigencia: "2026-08-26", compra: 11.57, venta: 11.67, fuente: "BCB", estado: "vigente",
    });
  });

  it("returns null when the table is empty", async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useLatestExchangeRate(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("propagates a query error", async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "relation does not exist" },
    });
    const mockLimit = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

    const { result } = renderHook(() => useLatestExchangeRate(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeTruthy();
  });
});
