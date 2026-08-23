import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 0625-149: useCreateService / useUpdateService
 * Verify the correct table, key invalidation, and toast on success/error.
 */

const {
  mockFrom, mockInsert, mockUpdate, mockSelect, mockSingle,
  mockInvalidate, mockToastSuccess, mockToastError,
} = vi.hoisted(() => {
  const mockSingle       = vi.fn();
  const mockSelect       = vi.fn(() => ({ single: mockSingle }));
  const mockInsert       = vi.fn(() => ({ select: mockSelect }));
  const mockUpdate       = vi.fn(() => ({ eq: vi.fn(() => ({ select: mockSelect })) }));
  const mockFrom         = vi.fn((table: string) => {
    if (table === "practicas") return { insert: mockInsert, update: mockUpdate };
    throw new Error(`unexpected table: ${table}`);
  });
  const mockInvalidate   = vi.fn();
  const mockToastSuccess = vi.fn();
  const mockToastError   = vi.fn();
  return { mockFrom, mockInsert, mockUpdate, mockSelect, mockSingle, mockInvalidate, mockToastSuccess, mockToastError };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mockFrom },
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: ({ mutationFn, onSuccess, onError }: any) => ({
    mutateAsync: async (arg: any) => {
      try {
        const result = await mutationFn(arg);
        onSuccess?.(result);
        return result;
      } catch (err) {
        onError?.(err);
        throw err;
      }
    },
    isPending: false,
  }),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

vi.mock("sonner", () => ({ toast: { success: mockToastSuccess, error: mockToastError } }));
vi.mock("@/i18n", () => ({ default: { t: (k: string) => k } }));
vi.mock("@/lib/error-handler", () => ({
  createMutationErrorHandler: () => () => {},
}));

import { useCreateService, useUpdateService } from "@/hooks/mutations/useServiceMutations";

describe("useCreateService (0625-149)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { practica_id: "s1", name: "Tax", code: 3 }, error: null });
  });

  it("calls supabase.from('practicas').insert().select().single()", async () => {
    const mutation = useCreateService();
    await mutation.mutateAsync({ name: "Tax", code: 3, allows_rates_activities: true, is_active: true });
    expect(mockFrom).toHaveBeenCalledWith("practicas");
    expect(mockInsert).toHaveBeenCalledWith({ name: "Tax", code: 3, allows_rates_activities: true, is_active: true });
  });

  it("invalidates ['services'] on success", async () => {
    const mutation = useCreateService();
    await mutation.mutateAsync({ name: "Tax", code: 3, allows_rates_activities: true, is_active: true });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["services"] });
  });

  it("shows success toast on success", async () => {
    const mutation = useCreateService();
    await mutation.mutateAsync({ name: "Tax", code: 3, allows_rates_activities: true, is_active: true });
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});

describe("useUpdateService (0625-149)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { practica_id: "s1", name: "Tax", code: 3, is_active: false }, error: null });
  });

  it("calls supabase.from('practicas').update().eq('practica_id', id)", async () => {
    const eqMock = vi.fn(() => ({ select: mockSelect }));
    mockUpdate.mockReturnValue({ eq: eqMock });
    const mutation = useUpdateService();
    await mutation.mutateAsync({ id: "s1", data: { is_active: false } });
    expect(mockFrom).toHaveBeenCalledWith("practicas");
    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
    expect(eqMock).toHaveBeenCalledWith("practica_id", "s1");
  });

  it("invalidates ['services'] on success", async () => {
    const eqMock = vi.fn(() => ({ select: mockSelect }));
    mockUpdate.mockReturnValue({ eq: eqMock });
    const mutation = useUpdateService();
    await mutation.mutateAsync({ id: "s1", data: { is_active: false } });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["services"] });
  });
});
