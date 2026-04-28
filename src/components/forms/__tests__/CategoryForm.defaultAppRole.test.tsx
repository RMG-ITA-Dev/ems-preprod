import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Stable spy referenced by the vi.mock factory below — must be hoisted so it
// exists before module-level mock factories are evaluated.
const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

// Replace the Radix Select family with native <select>/<option> elements so
// JSDOM can interact with the dropdown without PointerEvent polyfills.
// The real Radix SelectItem path is exercised by Settings integration tests
// (Tests 5–6 in Settings.category-rates-form).
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

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = MockResizeObserver;
});

const TRANSLATIONS: Record<string, string> = {
  "common.none": "None",
  "userRoles.roles.senior": "Senior",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => TRANSLATIONS[k] ?? k }),
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
    const user = userEvent.setup();
    renderForm({
      open: true,
      onOpenChange: vi.fn(),
      // Start with a real role so the Select has a non-None value to change from
      category: { ...baseCategory, default_app_role: "senior" },
    });

    // Select the "__none__" sentinel via the native select
    await user.selectOptions(screen.getByTestId("role-select"), "__none__");

    // Submit — all required rate fields are pre-filled from baseCategory
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());

    // onSubmit converts "__none__" → null; sentinel must not leak into the DB
    const [callArg] = updateMutateAsync.mock.calls[0];
    expect(callArg.data.default_app_role).toBeNull();
  });
});
