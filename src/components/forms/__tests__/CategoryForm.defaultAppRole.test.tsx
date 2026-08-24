import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// FASE 3c (Opción C): el control de `default_app_role` se ELIMINÓ del formulario
// — la categoría ya no dicta el rol del usuario. Este archivo (antes BUG 0306-73,
// que probaba el select) ahora verifica: (1) que el control ya no se renderiza, y
// (2) que el valor existente de default_app_role se CONSERVA en el payload al
// editar (no se nulifica), evitando efectos colaterales en datos.

const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

// Se conserva el mock de Select (inofensivo aunque el control se haya quitado).
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
  (globalThis as any).ResizeObserver = MockResizeObserver;
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "en" },
  }),
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
  practica_id: "svc-aud",
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

describe("CategoryForm — default_app_role sin control (FASE 3c, Opción C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: renderiza sin romperse (modo crear)", () => {
    expect(() =>
      renderForm({ open: true, onOpenChange: vi.fn(), category: null })
    ).not.toThrow();
    expect(screen.getByText("category.newCategory")).toBeInTheDocument();
  });

  it("Test 2: el control de rol por defecto YA NO se renderiza", () => {
    renderForm({
      open: true,
      onOpenChange: vi.fn(),
      category: { ...baseCategory, default_app_role: "senior" },
    });
    expect(screen.getByText("category.editCategory")).toBeInTheDocument();
    // El select de default_app_role fue removido en Fase 3c.
    expect(screen.queryByTestId("role-select")).toBeNull();
    expect(screen.queryByText("category.defaultAppRole")).toBeNull();
  });

  it("Test 3: al editar, se CONSERVA el default_app_role existente en el payload", async () => {
    const user = userEvent.setup();
    renderForm({
      open: true,
      onOpenChange: vi.fn(),
      category: { ...baseCategory, default_app_role: "senior" },
    });

    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());

    // El formulario ya no edita el campo, pero lo arrastra sin cambios:
    // "senior" debe preservarse (no nulificarse) al guardar.
    const [callArg] = updateMutateAsync.mock.calls[0];
    expect(callArg.data.default_app_role).toBe("senior");
  });
});
