import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useCreateEngagement,
  useUpdateEngagement,
} from "../useEngagementMutations";

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

describe("useEngagementMutations approval_required integration (BUG 0220-61)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useCreateEngagement passes approval_required=false in RPC payload", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { engagement_id: "e1", approval_required: false },
      error: null,
    } as any);

    const { result } = renderHook(() => useCreateEngagement(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      engagement_name: "Holiday",
      client_id: "c1",
      oficina: 1,
      practica: 2,
      anio_fiscal: 2027,
      is_internal: true,
      approval_required: false,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.rpc).toHaveBeenCalledWith(
      "create_engagement_with_code",
      expect.objectContaining({ p_approval_required: false })
    );
  });

  it("useCreateEngagement defaults (no approval_required) does not break RPC call", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { engagement_id: "e2" },
      error: null,
    } as any);

    const { result } = renderHook(() => useCreateEngagement(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      engagement_name: "Client Audit",
      client_id: "c2",
      oficina: 1,
      practica: 1,
      anio_fiscal: 2027,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // p_approval_required defaults to true when not provided
    const rpcCall = vi.mocked(supabase.rpc).mock.calls[0][1] as Record<string, unknown>;
    expect(rpcCall.p_approval_required).toBe(true);
  });

  it("useUpdateEngagement passes approval_required in update payload", async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { engagement_id: "e3", approval_required: true },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any);

    const { result } = renderHook(() => useUpdateEngagement(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      id: "e3",
      data: { approval_required: true },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ approval_required: true })
    );
  });
});
