import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useCategories,
  useIndustries,
  useStaff,
  useClients,
  useEngagements,
  useActivityCodes,
  useAllActivityCodes,
  useExpenseTypes,
  useGlobalSettings,
  useWorkOrderStaffingRequirements,
  useSocieties,
} from "../useEmsData";

// Controllable auth identity for the viewer-keyed cache isolation tests below
// (Fase 4 — useWorkOrderStaffingRequirements). Declared before vi.mock so the
// hoisted factory can close over it.
const auth: { user: { id: string } | null } = { user: { id: "viewer-a" } };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Extended mock for supabase
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("useEmsData hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useCategories", () => {
    it("fetches categories ordered by display_order", async () => {
      const mockCategories = [
        { category_id: "1", category_name: "Partner", display_order: 1 },
        { category_id: "2", category_name: "Manager", display_order: 3 },
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockCategories,
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useCategories(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("categories");
      expect(mockOrder).toHaveBeenCalledWith("display_order");
      expect(result.current.data).toEqual(mockCategories);
    });

    it("scopes to a service via .eq('service_id', serviceId) when a serviceId is given", async () => {
      const mockCategories = [
        { category_id: "1", category_name: "Socio", display_order: 1, service_id: "svc-aud" },
      ];

      const mockOrder = vi.fn().mockResolvedValue({ data: mockCategories, error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useCategories("svc-aud"), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("categories");
      expect(mockEq).toHaveBeenCalledWith("service_id", "svc-aud");
      expect(mockOrder).toHaveBeenCalledWith("display_order");
      expect(result.current.data).toEqual(mockCategories);
    });

    it("handles errors", async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Database error" },
      });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useCategories(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useIndustries", () => {
    it("fetches industries ordered by industry_name", async () => {
      const mockIndustries = [
        { industry_id: "1", industry_name: "Banking", fiscal_year_end: "12-31" },
        { industry_id: "2", industry_name: "Retail", fiscal_year_end: "06-30" },
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockIndustries,
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useIndustries(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("industries");
      expect(result.current.data).toHaveLength(2);
    });
  });

  describe("useStaff", () => {
    it("fetches active staff with category join", async () => {
      const mockStaff = [
        {
          staff_id: "1",
          first_name: "John",
          last_name: "Doe",
          is_active: true,
          society_id: "soc-1",
          service_id: "svc-1",
          category: { category_id: "1", category_name: "Partner" },
        },
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockStaff,
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useStaff(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("staff");
      expect(mockEq).toHaveBeenCalledWith("is_active", true);
      expect(result.current.data?.[0].category?.category_name).toBe("Partner");
      // FEAT 0810-173: society_id/service_id are selected and passed through.
      const selectArg = mockSelect.mock.calls[0][0] as string;
      expect(selectArg).toContain("society_id");
      expect(selectArg).toContain("service_id");
      expect(result.current.data?.[0].society_id).toBe("soc-1");
      expect(result.current.data?.[0].service_id).toBe("svc-1");
    });
  });

  describe("useSocieties (FEAT 0810-173)", () => {
    it("fetches active societies ordered by name", async () => {
      const mockSocieties = [
        { society_id: "soc-1", name: "Ruizmier Juaregui S.R.L.", is_active: true, created_at: "2026-01-01" },
        { society_id: "soc-2", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "2026-01-01" },
      ];

      const mockOrder = vi.fn().mockResolvedValue({ data: mockSocieties, error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useSocieties(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("society");
      expect(mockEq).toHaveBeenCalledWith("is_active", true);
      expect(mockOrder).toHaveBeenCalledWith("name");
      expect(result.current.data).toEqual(mockSocieties);
    });
  });

  describe("useClients", () => {
    it("fetches clients from clients_directory with industry join", async () => {
      const mockClients = [
        {
          client_id: "1",
          client_legal_name: "Acme Corp",
          // Note: unique_tax_id is NOT in the directory view for security
          industry: { industry_id: "1", industry_name: "Tech" },
        },
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockClients,
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useClients(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Queries base clients table with explicit non-sensitive columns
      expect(supabase.from).toHaveBeenCalledWith("clients");
      expect(result.current.data?.[0].industry?.industry_name).toBe("Tech");
    });
  });

  describe("useEngagements", () => {
    it("fetches engagements with client and staff joins", async () => {
      const mockEngagements = [
        {
          engagement_id: "1",
          engagement_name: "Audit 2024",
          client: { client_id: "1", client_legal_name: "Acme" },
          partner: { staff_id: "1", first_name: "Jane", last_name: "Partner" },
          manager: { staff_id: "2", first_name: "Bob", last_name: "Manager" },
        },
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockEngagements,
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useEngagements(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("engagements");
      expect(result.current.data?.[0].client?.client_legal_name).toBe("Acme");
    });
  });

  describe("useActivityCodes", () => {
    it("fetches active activity codes ordered by code", async () => {
      const mockCodes = [
        { activity_id: "1", activity_code: "A100", description: "Planning", is_active: true },
        { activity_id: "2", activity_code: "A200", description: "Execution", is_active: true },
      ];

      const mockEq = vi.fn().mockResolvedValue({ data: mockCodes, error: null });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useActivityCodes(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("activity_codes");
      expect(mockEq).toHaveBeenCalledWith("is_active", true);
    });
  });

  describe("useAllActivityCodes (0513-114)", () => {
    it("fetches ALL activity codes without is_active filter (for admin)", async () => {
      const mockCodes = [
        { activity_id: "1", activity_code: "AUD-A1", description: "Planning", is_active: true, service_id: "s1", entity_type: "A", service: { service_id: "s1", name: "Auditoría", abbreviation: "AUD" } },
        { activity_id: "2", activity_code: "AUD-AX", description: "Old Step", is_active: false, service_id: "s1", entity_type: "A", service: { service_id: "s1", name: "Auditoría", abbreviation: "AUD" } },
        { activity_id: "3", activity_code: "100-PLA", description: "Legacy Plan", is_active: true, service_id: null, entity_type: "A", service: null },
      ];

      const mockSelect = vi.fn().mockResolvedValue({ data: mockCodes, error: null });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useAllActivityCodes(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("activity_codes");
      // Must NOT filter by is_active — all 3 rows returned including the inactive AX one
      expect(result.current.data).toHaveLength(3);
    });

    it("does NOT call .eq('is_active', true)", async () => {
      const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useAllActivityCodes(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // select is called directly — no .eq() filter applied
      expect(mockSelect).toHaveBeenCalled();
      // The mock has no .eq — if the hook called .eq() it would throw and isSuccess would be false
    });
  });

  describe("useExpenseTypes", () => {
    it("fetches expense types ordered by name", async () => {
      const mockTypes = [
        { expense_type_id: "1", expense_name: "Lodging", default_unit_cost: 150 },
        { expense_type_id: "2", expense_name: "Travel", default_unit_cost: 100 },
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockTypes,
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useExpenseTypes(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("expense_types");
    });
  });

  describe("useGlobalSettings", () => {
    it("fetches all global settings", async () => {
      const mockSettings = [
        { setting_key: "LANGUAGE", setting_value: "es", description: "UI language" },
        { setting_key: "WORK_DAYS", setting_value: "5", description: "Work days per week" },
      ];

      const mockSelect = vi.fn().mockResolvedValue({
        data: mockSettings,
        error: null,
      });
      vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);

      const { result } = renderHook(() => useGlobalSettings(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(supabase.from).toHaveBeenCalledWith("global_settings");
      expect(result.current.data).toHaveLength(2);
    });
  });
});

// Fase 4 — hardening del hook de lectura de staffing: key viewer-scoped, columnas
// explícitas, abort signal, orden estable, errores propagados, aislamiento de caché.
describe("useWorkOrderStaffingRequirements (Fase 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: "viewer-a" };
  });

  function mockSupabaseResolvedTo(data: unknown, error: unknown = null) {
    const mockAbortSignal = vi.fn().mockResolvedValue({ data, error });
    const mockEq = vi.fn().mockReturnValue({ abortSignal: mockAbortSignal });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any);
    return { mockAbortSignal, mockEq, mockSelect };
  }

  it("is disabled (idle, no fetch) when there is no authenticated viewer", () => {
    auth.user = null;
    const { result } = renderHook(() => useWorkOrderStaffingRequirements("wo-1"), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("is disabled (idle, no fetch) when there is no workOrderId", () => {
    const { result } = renderHook(() => useWorkOrderStaffingRequirements(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("selects explicit columns (never '*') and scopes by wo_id, with an abort signal", async () => {
    const { mockSelect, mockEq, mockAbortSignal } = mockSupabaseResolvedTo([]);
    const { result } = renderHook(() => useWorkOrderStaffingRequirements("wo-1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledWith("wo_staffing_requirements");
    const selectArg = mockSelect.mock.calls[0][0] as string;
    expect(selectArg).not.toBe("*");
    expect(selectArg).toContain("category_id");
    expect(selectArg).toContain("staff_count");
    expect(selectArg).toContain("requirement_skills");
    expect(mockEq).toHaveBeenCalledWith("wo_id", "wo-1");
    expect(mockAbortSignal).toHaveBeenCalledTimes(1);
  });

  it("orders categories by display_order and skills by name, regardless of fetch order", async () => {
    mockSupabaseResolvedTo([
      {
        id: "req-2",
        wo_id: "wo-1",
        category_id: "cat-2",
        staff_count: 1,
        category: { category_id: "cat-2", category_name: "Manager", service_id: "svc-1", display_order: 2 },
        requirement_skills: [
          { id: "rs-2", skill_id: "s2", min_proficiency_level: "Beginner", skill: { skill_id: "s2", name: "Zebra", is_active: true } },
          { id: "rs-1", skill_id: "s1", min_proficiency_level: "Advanced", skill: { skill_id: "s1", name: "Alpha", is_active: true } },
        ],
      },
      {
        id: "req-1",
        wo_id: "wo-1",
        category_id: "cat-1",
        staff_count: 2,
        category: { category_id: "cat-1", category_name: "Senior", service_id: "svc-1", display_order: 1 },
        requirement_skills: [],
      },
    ]);
    const { result } = renderHook(() => useWorkOrderStaffingRequirements("wo-1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((r) => r.id)).toEqual(["req-1", "req-2"]);
    expect(result.current.data?.[1].requirement_skills.map((s) => s.skill_id)).toEqual(["s1", "s2"]);
  });

  it("propagates a non-schema error (isError, empty data untouched)", async () => {
    mockSupabaseResolvedTo(null, { code: "42501", message: "insufficient_privilege" });
    const { result } = renderHook(() => useWorkOrderStaffingRequirements("wo-1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it.each(["42P01", "42703", "PGRST200"])("propagates schema-not-ready error %s instead of fabricating an empty list", async (code) => {
    mockSupabaseResolvedTo(null, { code, message: "schema not ready" });
    const { result } = renderHook(() => useWorkOrderStaffingRequirements("wo-1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it("a viewer switch (same QueryClient) never reuses another viewer's cached staffing rows", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    mockSupabaseResolvedTo([{ id: "req-a", wo_id: "wo-1", category_id: "cat-1", staff_count: 1, category: {}, requirement_skills: [] }]);
    const first = renderHook(() => useWorkOrderStaffingRequirements("wo-1"), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    auth.user = { id: "viewer-b" };
    mockSupabaseResolvedTo([{ id: "req-b", wo_id: "wo-1", category_id: "cat-2", staff_count: 2, category: {}, requirement_skills: [] }]);
    const second = renderHook(() => useWorkOrderStaffingRequirements("wo-1"), { wrapper });

    // Not served from viewer-a's cache — must show nothing until viewer-b's own fetch resolves.
    expect(second.result.current.data).toBeUndefined();
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));
    expect(second.result.current.data?.[0].id).toBe("req-b");
    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});
