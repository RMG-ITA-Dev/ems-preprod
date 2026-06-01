import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCreateEngagement } from "../useEngagementMutations";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useCreateEngagement — code generation (BUG 0306-82)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls supabase.rpc with create_engagement_with_code and all 15 params", async () => {
    const mockData = {
      engagement_id: "eng-100",
      engagement_name: "Audit FY2027",
      engagement_code: "2027.121.001",
    };
    vi.mocked(supabase.rpc).mockResolvedValue({ data: mockData, error: null } as any);

    const { result } = renderHook(() => useCreateEngagement(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      engagement_name: "Audit FY2027",
      client_id: "client-uuid",
      partner_id: "partner-uuid",
      manager_id: "manager-uuid",
      start_date: "2027-01-01",
      end_date: "2027-09-30",
      status: "active",
      oficina: 1,
      practica: 2,
      funcion: 1,
      anio_fiscal: 2027,
      work_order_required: true,
      activity_required: true,
      is_internal: false,
      approval_required: true,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.rpc).toHaveBeenCalledWith("create_engagement_with_code", {
      p_engagement_name:     "Audit FY2027",
      p_client_id:           "client-uuid",
      p_partner_id:          "partner-uuid",
      p_manager_id:          "manager-uuid",
      p_start_date:          "2027-01-01",
      p_end_date:            "2027-09-30",
      p_status:              "active",
      p_oficina:             1,
      p_practica:            2,
      p_funcion:             1,
      p_anio_fiscal:         2027,
      p_work_order_required: true,
      p_activity_required:   true,
      p_is_internal:         false,
      p_approval_required:   true,
    });
  });

  it("surfaces an RPC error as a rejected mutation", async () => {
    const rpcError = { message: "Correlativo error", code: "P0001" };
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: rpcError } as any);

    const onError = vi.fn();
    const { result } = renderHook(() => useCreateEngagement(), {
      wrapper: createWrapper(),
    });

    result.current.mutate(
      {
        engagement_name: "Bad Engagement",
        client_id: "client-uuid",
        oficina: 1,
        practica: 1,
        anio_fiscal: 2027,
      },
      { onError }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onError).toHaveBeenCalledWith(rpcError, expect.anything(), undefined);
  });
});
