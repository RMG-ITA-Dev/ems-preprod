import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";
import * as z from "zod";

// Radix UI needs ResizeObserver / pointer capture, absent in jsdom.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

/**
 * 0702-152: CategoryForm service linkage.
 * - Create: required service selector; default display_order = service max + 1.
 * - Edit: service is read-only (immutable).
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const mockServices = [
  { service_id: "s1", name: "Auditoría", code: 1, abbreviation: "AUD", allows_rates_activities: true, is_active: true, created_at: "" },
  { service_id: "s2", name: "Tax", code: 3, abbreviation: "TAX", allows_rates_activities: true, is_active: true, created_at: "" },
  { service_id: "s0", name: "Firmwide", code: 0, abbreviation: "FIR", allows_rates_activities: false, is_active: true, created_at: "" },
];

const mockAllCategories = [
  { category_id: "c1", category_name: "Socio", service_id: "s1", display_order: 1, rate_high_bob: 200, rate_low_bob: 150, rate_high_usd: 30, rate_low_usd: 25, can_approve_wo: true, can_approve_timesheets: true, default_app_role: null },
  { category_id: "c2", category_name: "Gerente", service_id: "s1", display_order: 2, rate_high_bob: 150, rate_low_bob: 100, rate_high_usd: 25, rate_low_usd: 20, can_approve_wo: false, can_approve_timesheets: true, default_app_role: null },
];

// Mutable so a test can simulate useCategories() resolving AFTER the form opens.
let mockCategoriesData: typeof mockAllCategories | undefined = mockAllCategories;

vi.mock("@/hooks/useEmsData", () => ({
  useServices: () => ({ data: mockServices }),
  useCategories: () => ({ data: mockCategoriesData }),
}));

import { CategoryForm } from "@/components/forms/CategoryForm";
import type { Category } from "@/hooks/useEmsData";

const editCategory: Category = {
  category_id: "c1",
  category_name: "Socio",
  service_id: "s1",
  display_order: 1,
  rate_high_bob: 200,
  rate_low_bob: 150,
  rate_high_usd: 30,
  rate_low_usd: 25,
  can_approve_wo: true,
  can_approve_timesheets: true,
  default_app_role: null,
  service: mockServices[0] as unknown as Category["service"],
};

// ── Zod schema: service is required on create ──────────────────────────────
describe("CategoryForm — service required (0702-152)", () => {
  const schema = z.object({
    service_id: z.string().min(1, "validation.categoryServiceRequired"),
    category_name: z.string().min(1),
    display_order: z.coerce.number().int().min(1),
  });

  it("rejects an empty service_id", () => {
    const r = schema.safeParse({ service_id: "", category_name: "Socio", display_order: 1 });
    expect(r.success).toBe(false);
  });

  it("accepts a non-empty service_id", () => {
    const r = schema.safeParse({ service_id: "s1", category_name: "Socio", display_order: 1 });
    expect(r.success).toBe(true);
  });
});

// ── Create mode ────────────────────────────────────────────────────────────
describe("CategoryForm — create (0702-152)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCategoriesData = mockAllCategories;
  });

  it("shows the service selector when creating", () => {
    render(<CategoryForm open={true} onOpenChange={vi.fn()} category={null} />);
    expect(screen.getByTestId("category-service-select")).toBeInTheDocument();
    expect(screen.queryByTestId("category-service-readonly")).not.toBeInTheDocument();
  });

  it("defaults display_order to the filtered service's max + 1", () => {
    // s1 has display_order 1 and 2 → next suggested is 3.
    render(<CategoryForm open={true} onOpenChange={vi.fn()} category={null} serviceId="s1" />);
    expect(screen.getByDisplayValue("3")).toBeInTheDocument();
  });

  it("recomputes the suggested order when categories load after the form opens", async () => {
    // Sheet opens before useCategories() resolves → default falls back to 1.
    mockCategoriesData = undefined;
    const { rerender } = render(
      <CategoryForm open={true} onOpenChange={vi.fn()} category={null} serviceId="s1" />
    );
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();

    // Data arrives → the guarded effect updates the suggestion to max + 1 = 3.
    mockCategoriesData = mockAllCategories;
    rerender(<CategoryForm open={true} onOpenChange={vi.fn()} category={null} serviceId="s1" />);
    expect(await screen.findByDisplayValue("3")).toBeInTheDocument();
  });
});

// ── Edit mode ──────────────────────────────────────────────────────────────
describe("CategoryForm — edit (0702-152)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the service as a read-only, disabled input (no selector)", () => {
    render(<CategoryForm open={true} onOpenChange={vi.fn()} category={editCategory} />);
    const readonly = screen.getByTestId("category-service-readonly") as HTMLInputElement;
    expect(readonly).toBeInTheDocument();
    expect(readonly).toBeDisabled();
    expect(readonly.value).toBe("Auditoría");
    expect(screen.queryByTestId("category-service-select")).not.toBeInTheDocument();
  });
});

// ── lockService (0817-177: unified Settings tab) ────────────────────────────
describe("CategoryForm — lockService on create (0817-177)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCategoriesData = mockAllCategories;
  });

  it("renders the práctica read-only (no selector) when lockService is true", () => {
    render(
      <CategoryForm open={true} onOpenChange={vi.fn()} category={null} serviceId="s1" lockService />
    );
    const readonly = screen.getByTestId("category-service-readonly") as HTMLInputElement;
    expect(readonly).toBeInTheDocument();
    expect(readonly).toBeDisabled();
    expect(readonly.value).toBe("Auditoría");
    expect(screen.queryByTestId("category-service-select")).not.toBeInTheDocument();
  });

  it("still shows the selector when lockService is false/absent, even with a serviceId default", () => {
    render(<CategoryForm open={true} onOpenChange={vi.fn()} category={null} serviceId="s1" />);
    expect(screen.getByTestId("category-service-select")).toBeInTheDocument();
    expect(screen.queryByTestId("category-service-readonly")).not.toBeInTheDocument();
  });
});
