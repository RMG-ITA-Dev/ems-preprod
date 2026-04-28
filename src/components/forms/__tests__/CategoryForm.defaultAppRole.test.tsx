import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

<<<<<<< HEAD
// Stable spy referenced by the vi.mock factory below — must be hoisted so it
// exists before module-level mock factories are evaluated.
const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

// Replace the Radix Select family with native <select>/<option> elements.
// This lets JSDOM reliably interact with the role dropdown without pointer-
// event polyfills, while still exercising CategoryForm's onValueChange
// sentinel mapping and the submit handler's "" → null conversion.
// The real Radix SelectItem rendering (the value="" crash fix) is covered by
// the Settings integration tests (Tests 5–6 in Settings.category-rates-form).
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  }) => (
    <select
      data-testid="role-select"
      value={value ?? ""}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectLabel: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  SelectScrollUpButton: () => null,
  SelectScrollDownButton: () => null,
  SelectSeparator: () => null,
}));

=======
const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

>>>>>>> origin/desarrollo_temp
beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = MockResizeObserver;
<<<<<<< HEAD
});

const TRANSLATIONS: Record<string, string> = {
  "common.none": "None",
  "userRoles.roles.senior": "Senior",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => TRANSLATIONS[k] ?? k }),
=======

  // Radix Select requires these in JSDOM
  window.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
>>>>>>> origin/desarrollo_temp
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

<<<<<<< HEAD
  it("Test 2: Edit mode with default_app_role null shows 'None' in the select", () => {
    renderForm({
      open: true,
      onOpenChange: vi.fn(),
      category: { ...baseCategory, default_app_role: null },
    });
    expect(screen.getByText("category.editCategory")).toBeInTheDocument();
    const select = screen.getByTestId("role-select") as HTMLSelectElement;
    expect(select.value).toBe("__none__");
    const noneOption = screen.getByRole("option", { name: "None" }) as HTMLOptionElement;
    expect(noneOption.selected).toBe(true);
  });

  it("Test 3: Edit mode with default_app_role 'senior' shows 'Senior' in the select", () => {
    renderForm({
      open: true,
      onOpenChange: vi.fn(),
      category: { ...baseCategory, default_app_role: "senior" },
    });
    expect(screen.getByText("category.editCategory")).toBeInTheDocument();
    const select = screen.getByTestId("role-select") as HTMLSelectElement;
    expect(select.value).toBe("senior");
    const seniorOption = screen.getByRole("option", { name: "Senior" }) as HTMLOptionElement;
    expect(seniorOption.selected).toBe(true);
  });

  it("Test 4: Selecting 'None' maps the sentinel to null in the submitted payload", async () => {
=======
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
>>>>>>> origin/desarrollo_temp
    const user = userEvent.setup();
    renderForm({
      open: true,
      onOpenChange: vi.fn(),
      // Start with a real role so the Select has a non-None value to change from
      category: { ...baseCategory, default_app_role: "senior" },
    });

<<<<<<< HEAD
    // Change role to the "__none__" sentinel via the native select.
    // CategoryForm's onValueChange maps "__none__" → "" in form state.
    await user.selectOptions(screen.getByTestId("role-select"), "__none__");

    // Submit — all required rate fields are pre-filled from baseCategory
=======
    // The trigger renders as role=combobox; the inner span has pointer-events:none so we target the button.
    await user.click(screen.getByRole("combobox"));
    // Pick the sentinel "None" item — use role=option to avoid matching the hidden native <option>
    await user.click(screen.getByRole("option", { name: "common.none" }));
    // Submit — all required fields are pre-filled from baseCategory
>>>>>>> origin/desarrollo_temp
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());

<<<<<<< HEAD
    // Submit handler converts "" → null; sentinel must not leak into the DB
=======
    // The sentinel must NOT leak: mutation must receive null, not "__none__"
>>>>>>> origin/desarrollo_temp
    const [callArg] = updateMutateAsync.mock.calls[0];
    expect(callArg.data.default_app_role).toBeNull();
  });
});
