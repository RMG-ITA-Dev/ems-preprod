import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockRpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { useAdministrativeEngagements } from "../useAdministrativeEngagements";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useAdministrativeEngagements", () => {
  it("loads the all-user administrative list RPC", async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ engagement_id: "admin-1", funcion: 0 }], error: null });

    const { result } = renderHook(() => useAdministrativeEngagements(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockRpc).toHaveBeenCalledWith("list_administrative_engagements");
    expect(result.current.data).toEqual([{ engagement_id: "admin-1", funcion: 0 }]);
  });
});
