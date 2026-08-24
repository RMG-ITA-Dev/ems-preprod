import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * 0602-136: useCreateTaxonomy / useUpdateTaxonomy
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
    if (table === "servicios") return { insert: mockInsert, update: mockUpdate };
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

import { useCreateTaxonomy, useUpdateTaxonomy } from "@/hooks/mutations/useTaxonomyMutations";

describe("useCreateTaxonomy (0602-136)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { taxonomy_id: "t1", code: "AA1006", name: "Audit" }, error: null });
  });

  it("calls supabase.from('servicios').insert().select().single()", async () => {
    const mutation = useCreateTaxonomy();
    await mutation.mutateAsync({ code: "AA1006", name: "Audit", practica_id: null, is_active: true });
    expect(mockFrom).toHaveBeenCalledWith("servicios");
    expect(mockInsert).toHaveBeenCalledWith({ code: "AA1006", name: "Audit", practica_id: null, is_active: true });
  });

  it("invalidates ['taxonomies'] on success", async () => {
    const mutation = useCreateTaxonomy();
    await mutation.mutateAsync({ code: "AA1006", name: "Audit", practica_id: null, is_active: true });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["taxonomies"] });
  });

  it("shows success toast on success", async () => {
    const mutation = useCreateTaxonomy();
    await mutation.mutateAsync({ code: "AA1006", name: "Audit", practica_id: null, is_active: true });
    expect(mockToastSuccess).toHaveBeenCalled();
  });
});

describe("useUpdateTaxonomy (0602-136)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { taxonomy_id: "t1", is_active: false }, error: null });
  });

  it("calls supabase.from('servicios').update().eq('taxonomy_id', id)", async () => {
    const eqMock = vi.fn(() => ({ select: mockSelect }));
    mockUpdate.mockReturnValue({ eq: eqMock });
    const mutation = useUpdateTaxonomy();
    await mutation.mutateAsync({ id: "t1", data: { is_active: false } });
    expect(mockFrom).toHaveBeenCalledWith("servicios");
    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
    expect(eqMock).toHaveBeenCalledWith("taxonomy_id", "t1");
  });

  it("invalidates ['taxonomies'] on success", async () => {
    const eqMock = vi.fn(() => ({ select: mockSelect }));
    mockUpdate.mockReturnValue({ eq: eqMock });
    const mutation = useUpdateTaxonomy();
    await mutation.mutateAsync({ id: "t1", data: { is_active: false } });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["taxonomies"] });
  });
});
