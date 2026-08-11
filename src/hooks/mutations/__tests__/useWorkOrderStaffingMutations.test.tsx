import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { StaffingRequirementInput } from "@/lib/workOrderStaffing";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "viewer-1" } }) }));

import { useSaveWorkOrderStaffing } from "../useWorkOrderStaffingMutations";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

const REQUIREMENTS: StaffingRequirementInput[] = [
  {
    clientKey: "local-1",
    persistedId: null,
    categoryId: "cat-1",
    staffCount: 3,
    skills: [
      {
        clientKey: "local-skill-1",
        persistedId: null,
        skillId: "skill-1",
        minProficiencyLevel: "Advanced",
        isActive: true,
        skillName: null,
      },
    ],
  },
];

describe("useSaveWorkOrderStaffing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes save_wo_staffing exactly once with the built payload, and never touches staffing tables directly", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveWorkOrderStaffing(), { wrapper });

    await result.current.mutateAsync({ woId: "wo-1", requirements: REQUIREMENTS });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith("save_wo_staffing", {
      p_wo_id: "wo-1",
      p_requirements: [
        {
          category_id: "cat-1",
          staff_count: 3,
          skills: [{ skill_id: "skill-1", min_proficiency_level: "Advanced" }],
        },
      ],
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("invalidates the viewer-scoped staffing query exactly once on success", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never);
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveWorkOrderStaffing(), { wrapper });

    await result.current.mutateAsync({ woId: "wo-1", requirements: REQUIREMENTS });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["workOrderStaffingRequirements", "viewer-1", "wo-1"],
    });
  });

  it("parses the RPC's returned persisted state", async () => {
    const persisted = [
      { id: "req-1", category_id: "cat-1", staff_count: 3, skills: [{ skill_id: "skill-1", min_proficiency_level: "Advanced" }] },
    ];
    vi.mocked(supabase.rpc).mockResolvedValue({ data: persisted, error: null } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveWorkOrderStaffing(), { wrapper });

    const returned = await result.current.mutateAsync({ woId: "wo-1", requirements: REQUIREMENTS });
    expect(returned).toEqual(persisted);
  });

  it("a retry after a failed save resends the same payload — the RPC's transactionality prevents duplicates", async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: null, error: new Error("boom") } as never)
      .mockResolvedValueOnce({ data: [], error: null } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveWorkOrderStaffing(), { wrapper });

    await expect(
      result.current.mutateAsync({ woId: "wo-1", requirements: REQUIREMENTS }),
    ).rejects.toThrow();
    await result.current.mutateAsync({ woId: "wo-1", requirements: REQUIREMENTS });

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    const firstCallArgs = vi.mocked(supabase.rpc).mock.calls[0];
    const secondCallArgs = vi.mocked(supabase.rpc).mock.calls[1];
    expect(firstCallArgs).toEqual(secondCallArgs);
  });

  describe.each([
    ["WOS_WO_NOT_FOUND", "workOrders.staffingRequirements.errors.workOrderNotFound"],
    ["WOS_DENIED", "workOrders.staffingRequirements.errors.denied"],
    ["WOS_WO_LOCKED", "workOrders.staffingRequirements.errors.locked"],
    ["WOS_REQUIREMENT_DUPLICATE", "workOrders.staffingRequirements.errors.categoryDuplicate"],
    ["WOS_SKILL_DUPLICATE", "workOrders.staffingRequirements.errors.skillDuplicate"],
    ["WOS_STAFF_COUNT_RANGE", "workOrders.staffingRequirements.errors.staffCountRange"],
    ["WOS_PROFICIENCY_INVALID", "workOrders.staffingRequirements.errors.proficiencyInvalid"],
    ["WOS_CATEGORY_FOREIGN_SERVICE", "workOrders.staffingRequirements.errors.categoryForeignService"],
  ])("known RPC error token %s", (code, i18nKey) => {
    it(`maps to a single translated toast and re-throws so the caller sees the rejection`, async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error(code) } as never);
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useSaveWorkOrderStaffing(), { wrapper });

      await expect(
        result.current.mutateAsync({ woId: "wo-1", requirements: REQUIREMENTS }),
      ).rejects.toThrow();

      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(i18nKey);
    });
  });

  it("maps a plain PostgREST error object by its message", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "WOS_DENIED", code: "42501", details: "", hint: "" },
    } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveWorkOrderStaffing(), { wrapper });

    await expect(
      result.current.mutateAsync({ woId: "wo-1", requirements: REQUIREMENTS }),
    ).rejects.toMatchObject({ message: "WOS_DENIED", code: "42501" });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("workOrders.staffingRequirements.errors.denied");
  });

  it("an unmapped/unknown error falls back to the centralized handler with a single toast (no payload logged)", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error("some_unmapped_db_error") } as never);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveWorkOrderStaffing(), { wrapper });

    await expect(
      result.current.mutateAsync({ woId: "wo-1", requirements: REQUIREMENTS }),
    ).rejects.toThrow();

    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
