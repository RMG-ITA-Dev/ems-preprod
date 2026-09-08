import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// BUG 0820-182: el control del rol predeterminado VUELVE al formulario de categoría.
//
// Historia de este archivo: originalmente (0306-73) probaba el select alimentado por el
// enum legacy `app_role`; FASE 3c lo eliminó y el archivo pasó a afirmar que el control
// NO se renderizaba. Ahora se restaura, pero sobre el catálogo `authorization_roles`
// (23 roles) — que es el punto: el enum legacy colapsa siete role_key distintos en
// `manager` (bug 0722-162), así que reponerlo tal cual habría reintroducido ese defecto.
//
// Por eso el catálogo mockeado incluye a propósito `manager` e `ita_manager`, que
// comparten espejo legacy: el Test 8 falla si la UI guarda el nivel en vez del rol.

const createMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

// Mock de Select: un <select> nativo, para poder elegir opciones de verdad en vez de
// inyectar el valor final (un cambio mal propagado por re-render se escaparía).
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
  useCreateCategory: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Referencia estable: el hook es dependencia de render y un array nuevo por render
// dispararía el loop ya documentado en otros tests del repo.
const CATALOG_ROLES = [
  { role_key: "admin", label_key: "authz.role.admin", description: null, is_system: true, display_order: 0 },
  { role_key: "manager", label_key: "authz.role.manager", description: null, is_system: false, display_order: 6 },
  { role_key: "semisenior", label_key: "authz.role.semisenior", description: null, is_system: false, display_order: 8 },
  { role_key: "ita_manager", label_key: "authz.role.ita_manager", description: null, is_system: false, display_order: 10 },
  { role_key: "tax_senior", label_key: "authz.role.tax_senior", description: null, is_system: false, display_order: 14 },
];

vi.mock("@/hooks/useAuthorizationRoles", () => ({
  useAuthorizationRoles: () => ({ data: CATALOG_ROLES, isLoading: false }),
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
  default_app_role: null,
  default_role_key: null,
};

const renderForm = (props: Parameters<typeof CategoryForm>[0]) =>
  render(
    <QueryClientProvider client={makeQC()}>
      <CategoryForm {...props} />
    </QueryClientProvider>
  );

/**
 * El mock de Select aplica a TODOS los <Select> del formulario, y en modo crear hay dos
 * (Práctica y Rol). Se identifica el de rol por su opción centinela "__none__", que el de
 * práctica no tiene — más robusto que depender del orden de render.
 */
const roleSelect = () => {
  const selects = screen.getAllByTestId("role-select") as HTMLSelectElement[];
  const match = selects.find((s) =>
    Array.from(s.options).some((o) => o.value === "__none__")
  );
  if (!match) throw new Error("No se encontró el select de rol predeterminado");
  return match;
};

const fillRequiredRates = async (user: ReturnType<typeof userEvent.setup>) => {
  const numeric = screen.getAllByRole("textbox").filter((el) => el.getAttribute("inputmode"));
  for (const input of numeric) {
    await user.type(input, "100");
  }
};

describe("CategoryForm — rol predeterminado sobre el catálogo (0820-182)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: renderiza sin romperse (modo crear)", () => {
    expect(() =>
      renderForm({ open: true, onOpenChange: vi.fn(), category: null })
    ).not.toThrow();
    expect(screen.getByText("category.newCategory")).toBeInTheDocument();
  });

  it("Test 2: el control de rol predeterminado SÍ se renderiza", () => {
    renderForm({ open: true, onOpenChange: vi.fn(), category: baseCategory });

    expect(screen.getByText("category.editCategory")).toBeInTheDocument();
    expect(screen.getByText("category.defaultAppRole")).toBeInTheDocument();
    expect(screen.getByText("category.defaultAppRoleHelp")).toBeInTheDocument();
    expect(screen.queryByTestId("role-select")).not.toBeNull();
  });

  it("Test 3: ofrece 'Ninguno' + los roles del catálogo, en el orden del hook", () => {
    renderForm({ open: true, onOpenChange: vi.fn(), category: baseCategory });

    const values = Array.from(roleSelect().options).map((o) => o.value);
    expect(values[0]).toBe("__none__");
    expect(values.slice(1)).toEqual(["manager", "semisenior", "ita_manager", "tax_senior"]);
  });

  it("Test 4: 'admin' NO es ofrecible como rol sugerido", () => {
    // Es un rol técnico/de seguridad: sugerirlo por categoría sería una vía de escalada.
    renderForm({ open: true, onOpenChange: vi.fn(), category: baseCategory });

    const values = Array.from(roleSelect().options).map((o) => o.value);
    expect(values).not.toContain("admin");
  });

  it("Test 5: al crear con un rol elegido, el payload lleva ese role_key", async () => {
    const user = userEvent.setup();
    renderForm({ open: true, onOpenChange: vi.fn(), category: null, serviceId: "svc-aud" });

    await user.type(screen.getByPlaceholderText("category.placeholder"), "Gerente ITA");
    await fillRequiredRates(user);
    await user.selectOptions(roleSelect(), "ita_manager");
    await user.click(screen.getByText("category.createCategory"));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync.mock.calls[0][0].default_role_key).toBe("ita_manager");
  });

  it("Test 6: al crear con 'Ninguno', el payload lleva null (nunca el centinela)", async () => {
    const user = userEvent.setup();
    renderForm({ open: true, onOpenChange: vi.fn(), category: null, serviceId: "svc-aud" });

    await user.type(screen.getByPlaceholderText("category.placeholder"), "Sin rol");
    await fillRequiredRates(user);
    await user.click(screen.getByText("category.createCategory"));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync.mock.calls[0][0].default_role_key).toBeNull();
  });

  it("Test 7: al editar, el select llega pre-seleccionado con el valor existente", () => {
    renderForm({
      open: true,
      onOpenChange: vi.fn(),
      category: { ...baseCategory, default_role_key: "ita_manager" },
    });

    expect(roleSelect().value).toBe("ita_manager");
  });

  it("Test 8: guarda el role_key, NO el nivel legacy, y no pisa default_app_role", async () => {
    // `ita_manager` y `manager` comparten legacy_app_role='manager'. Si la UI guardara el
    // enum, este test no distinguiría un rol del otro — que es exactamente el defecto que
    // 0722-162 identificó y por el que no se repuso el control original.
    const user = userEvent.setup();
    renderForm({
      open: true,
      onOpenChange: vi.fn(),
      category: { ...baseCategory, default_app_role: "senior", default_role_key: null },
    });

    await user.selectOptions(roleSelect(), "ita_manager");
    await user.click(screen.getByText("common.saveChanges"));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());

    const { data } = updateMutateAsync.mock.calls[0][0];
    expect(data.default_role_key).toBe("ita_manager");
    // El espejo legacy se arrastra sin cambios: la UI ya no lo edita.
    expect(data.default_app_role).toBe("senior");
  });
});
