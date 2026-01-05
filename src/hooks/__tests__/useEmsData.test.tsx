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
  useExpenseTypes,
  useGlobalSettings,
} from "../useEmsData";

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
    });
  });

  describe("useClients", () => {
    it("fetches clients with industry join", async () => {
      const mockClients = [
        {
          client_id: "1",
          client_legal_name: "Acme Corp",
          unique_tax_id: "123456",
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

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockCodes,
        error: null,
      });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
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
