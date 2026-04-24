import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = MockResizeObserver;

  // Radix Select requires these in JSDOM
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateCategory: () => ({ mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { CategoryForm } from "../CategoryForm";

const makeQC = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const baseCategory = {
  category_id: "cat-1",
  category_name: "Socio",
  display_order: 1,
  rate_high_bob: 200,
  rate_low_bob: 150,
  rate_high_usd: 30,
  rate_low_usd: 25,
  can_approve_wo: false,
  can_approve_timesheets: false,
};

const renderForm = (props: Parameters<typeof CategoryForm>[0]) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <CategoryForm {...props} />
    </QueryClientProvider>
  );

describe("CategoryForm default_app_role (BUG 0306-73)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: Nueva Categoría renders without crashing (create mode)", () => {
    expect(() =>
      renderForm({ open: true, onOpenChange: vi.fn(), category: null })
    ).not.toThrow();
    expect(screen.getByText("category.newCategory")).toBeInTheDocument();
  });

  it("Test 2: Edit mode with default_app_role null renders without crashing", () => {
    expect(() =>
      renderForm({
        open: true,
        onOpenChange: vi.fn(),
        category: { ...baseCategory, default_app_role: null },
      })
    ).not.toThrow();
    expect(screen.getByText("category.editCategory")).toBeInTheDocument();
  });

  it("Test 3: Edit mode with default_app_role 'senior' renders without crashing", () => {
    expect(() =>
      renderForm({
        open: true,
        onOpenChange: vi.fn(),
        category: { ...baseCategory, default_app_role: "senior" },
      })
    ).not.toThrow();
    expect(screen.getByText("category.editCategory")).toBeInTheDocument();
  });

  it("Test 4: Selecting 'None' in the Select maps the sentinel to null on submit", async () => {
    const user = userEvent.setup();
    renderForm({
      open: true,
      onOpenChange: vi.fn(),
      // Start with a real role so the Select has a non-None value to change from
      category: { ...baseCategory, default_app_role: "senior" },
    });

    // The trigger renders as role=combobox; the inner span has pointer-events:none so we target the button.
    await user.click(screen.getByRole("combobox"));
    // Pick the sentinel "None" item — use role=option to avoid matching the hidden native <option>
    await user.click(screen.getByRole("option", { name: "common.none" }));
    // Submit — all required fields are pre-filled from baseCategory
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());

    // The sentinel must NOT leak: mutation must receive null, not "__none__"
    const [callArg] = updateMutateAsync.mock.calls[0];
    expect(callArg.data.default_app_role).toBeNull();
  });
});
