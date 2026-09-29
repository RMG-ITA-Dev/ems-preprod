import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StaffFull } from "@/hooks/useEmsData";

// FEAT 0810-173: Sociedad y práctica en el registro de staff.
// Cubre: selects nuevos, filtro de categoría por práctica, reset al cambiar
// práctica, preservación de práctica inactiva en edición, payload de submit,
// y el guard de categoría/práctica desajustada.
//
// NOTA sobre el acceso a los <select>: los mocks de SelectTrigger/Switch en
// esta suite (como en StaffForm.blocked/terminationDate.test.tsx) no reenvían
// el `id` que <FormControl> (Radix Slot) inyecta, así que `getByLabelText` no
// puede resolver los Select. Se accede por orden de aparición en el DOM:
// [0]=city, [1]=society, [2]=practice, [3]=category (las filas de
// competencias agregan más <select> después, pero los fixtures usan
// staff_skills: [] así que no aparecen).

// ─── Hoisted spies ─────────────────────────────────────────────────────────────
const createMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({ staff_id: "new-staff" }));
const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({ staff_id: "s-1" }));

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

const SOCIETIES = [
  { society_id: "soc-pelaez", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "2026-01-01" },
  { society_id: "soc-juaregui", name: "Ruizmier Jauregui S.R.L.", is_active: true, created_at: "2026-01-01" },
];

const SERVICES = [
  { practica_id: "svc-firmwide", name: "Firmwide", code: 0, allows_rates_activities: false, is_active: true, created_at: "2026-01-01" },
  { practica_id: "svc-auditoria", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "2026-01-01" },
  { practica_id: "svc-consultoria", name: "Consultoría", code: 2, allows_rates_activities: true, is_active: true, created_at: "2026-01-01" },
  // Práctica inactiva — solo debe aparecer si un staff en edición ya la tiene asignada.
  { practica_id: "svc-inactive", name: "Servicios Relacionados", code: 7, allows_rates_activities: true, is_active: false, created_at: "2026-01-01" },
];

const CATEGORIES_BY_SERVICE: Record<string, Array<{ category_id: string; category_name: string; practica_id: string; display_order: number }>> = {
  "svc-auditoria": [
    { category_id: "cat-aud-1", category_name: "Socio Auditoría", practica_id: "svc-auditoria", display_order: 1 },
    { category_id: "cat-aud-2", category_name: "Senior Auditoría", practica_id: "svc-auditoria", display_order: 2 },
  ],
  "svc-consultoria": [
    { category_id: "cat-cons-1", category_name: "Socio Consultoría", practica_id: "svc-consultoria", display_order: 1 },
  ],
};

// useCategories mock reacts to the serviceId argument, like the real hook.
vi.mock("@/hooks/useEmsData", () => ({
  useCategories: (serviceId?: string) => ({
    data: serviceId ? CATEGORIES_BY_SERVICE[serviceId] ?? [] : [],
  }),
  useActiveSkills: () => ({ data: [] }),
  useSocieties: () => ({ data: SOCIETIES }),
  useServices: () => ({ data: SERVICES }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateStaff: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateStaff: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeleteStaff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "admin" }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

// Replace Radix Select with native <select>/<option>, forwarding `disabled`
// so the "category disabled until practice chosen" behavior is testable.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    disabled?: boolean;
    children?: React.ReactNode;
  }) => (
    <select value={value ?? ""} disabled={disabled} onChange={(e) => onValueChange?.(e.target.value)}>
      {/* Real Radix Select shows its placeholder without a literal empty
          option; a native <select> falls back to selecting the first real
          <option> when `value` matches none. This blank option keeps an
          unselected/reset value ("") reading back as "" in jsdom. */}
      <option value="" />
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

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <input
      type="checkbox"
      checked={checked ?? false}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
    open ? <>{children}</> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <p>{children}</p>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  AlertDialogTrigger: ({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <button type="button">{children}</button>,
  AlertDialogContent: () => null,
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── JSDOM polyfills ───────────────────────────────────────────────────────────

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
});

// ─── Per-test setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Pre-save duplicate email / id_number checks: .from("staff").select(...).eq(...).is(...).neq(...).limit(1)
  const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
  const neqMock = vi.fn(() => ({ limit: limitMock }));
  const isMock = vi.fn(() => ({ neq: neqMock }));
  const eqMock = vi.fn(() => ({ is: isMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);
  vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any);
});

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const baseStaff: StaffFull = {
  staff_id: "s-1",
  first_name: "Ana",
  last_name: "López",
  short_name: "A. López",
  initials: "AL",
  email: "ana@test.com",
  id_number: "12345",
  aud_reg_number: null,
  category_id: "cat-aud-1",
  society_id: "soc-pelaez",
  practica_id: "svc-auditoria",
  city: "La Paz",
  is_active: true,
  is_blocked: false,
  hire_date: "2020-01-01",
  termination_date: null,
  auth_user_id: null,
  staff_skills: [],
};

const makeQC = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const { StaffForm } = await import("../StaffForm");

const renderNewForm = () =>
  render(
    <QueryClientProvider client={makeQC()}>
      <StaffForm onSaveSuccess={vi.fn()} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );

const renderEditForm = (overrides: Partial<StaffFull> = {}) => {
  const staff = { ...baseStaff, ...overrides };
  return render(
    <QueryClientProvider client={makeQC()}>
      <StaffForm staff={staff} onSaveSuccess={vi.fn()} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
};

// Select order in the DOM: [0]=city, [1]=society, [2]=practice, [3]=category.
const getSelects = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("select")) as HTMLSelectElement[];
const citySelect = (container: HTMLElement) => getSelects(container)[0];
const societySelect = (container: HTMLElement) => getSelects(container)[1];
const practiceSelect = (container: HTMLElement) => getSelects(container)[2];
const categorySelect = (container: HTMLElement) => getSelects(container)[3];

// Llena todos los campos requeridos del alta *excepto* los que se pasen en
// `skip`, para poder aislar qué campo específico bloquea el submit.
const fillRequiredExcept = (container: HTMLElement, skip: Array<"city" | "society" | "practice" | "category"> = []) => {
  fireEvent.change(screen.getByPlaceholderText("John"), { target: { value: "Ana" } });
  fireEvent.change(screen.getByPlaceholderText("Doe"), { target: { value: "López" } });
  fireEvent.change(screen.getByPlaceholderText("john.doe@example.com"), { target: { value: "ana@test.com" } });
  fireEvent.change(screen.getByPlaceholderText("12345678"), { target: { value: "12345" } });
  fireEvent.change(container.querySelector('input[type="date"]')!, { target: { value: "2020-01-01" } });
  if (!skip.includes("city")) fireEvent.change(citySelect(container), { target: { value: "La Paz" } });
  if (!skip.includes("society")) fireEvent.change(societySelect(container), { target: { value: "soc-pelaez" } });
  if (!skip.includes("practice")) fireEvent.change(practiceSelect(container), { target: { value: "svc-auditoria" } });
  if (!skip.includes("category")) fireEvent.change(categorySelect(container), { target: { value: "cat-aud-1" } });
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("StaffForm — sociedad y práctica (FEAT 0810-173)", () => {
  it("1a) Sociedad requerida — submit bloqueado y mensaje específico si falta solo ella", async () => {
    const { container } = renderNewForm();
    await waitFor(() => expect(getSelects(container).length).toBeGreaterThan(0));

    fillRequiredExcept(container, ["society"]);
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(screen.getByText("validation.societyRequired")).toBeInTheDocument();
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("1b) Práctica requerida — submit bloqueado y mensaje específico si falta solo ella", async () => {
    const { container } = renderNewForm();
    await waitFor(() => expect(getSelects(container).length).toBeGreaterThan(0));

    fillRequiredExcept(container, ["practice", "category"]);
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(screen.getByText("validation.practiceRequired")).toBeInTheDocument();
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("1c) Categoría requerida — submit bloqueado y mensaje específico si falta solo ella", async () => {
    const { container } = renderNewForm();
    await waitFor(() => expect(getSelects(container).length).toBeGreaterThan(0));

    fillRequiredExcept(container, ["category"]);
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(screen.getByText("validation.categoryRequired")).toBeInTheDocument();
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
  });

  it("2) ambas sociedades están disponibles en el selector", async () => {
    const { container } = renderNewForm();
    await waitFor(() => expect(getSelects(container).length).toBeGreaterThan(0));

    const optionLabels = Array.from(societySelect(container).querySelectorAll("option")).map(
      (o) => o.textContent
    );
    expect(optionLabels).toContain("Ruizmier Pelaez S.R.L.");
    expect(optionLabels).toContain("Ruizmier Jauregui S.R.L.");
  });

  it("3) la práctica excluye Firmwide (allows_rates_activities=false)", async () => {
    const { container } = renderNewForm();
    await waitFor(() => expect(getSelects(container).length).toBeGreaterThan(0));

    const optionLabels = Array.from(practiceSelect(container).querySelectorAll("option")).map(
      (o) => o.textContent
    );
    expect(optionLabels).not.toContain("Firmwide");
    expect(optionLabels).toContain("Auditoría");
    expect(optionLabels).toContain("Consultoría");
  });

  it("4) la categoría está deshabilitada/vacía hasta elegir práctica; elegir Auditoría muestra solo sus categorías", async () => {
    const { container } = renderNewForm();
    await waitFor(() => expect(getSelects(container).length).toBeGreaterThan(0));

    // Solo la opción vacía del placeholder (ver comentario en el mock de Select).
    expect(categorySelect(container).disabled).toBe(true);
    expect(categorySelect(container).querySelectorAll("option")).toHaveLength(1);

    fireEvent.change(practiceSelect(container), { target: { value: "svc-auditoria" } });

    await waitFor(() => {
      expect(categorySelect(container).disabled).toBe(false);
    });
    const optionLabels = Array.from(categorySelect(container).querySelectorAll("option"))
      .map((o) => o.textContent)
      .filter(Boolean);
    expect(optionLabels).toEqual(["Socio Auditoría", "Senior Auditoría"]);
  });

  it("5) cambiar de práctica reemplaza las opciones de categoría y limpia category_id", async () => {
    const { container } = renderNewForm();
    await waitFor(() => expect(getSelects(container).length).toBeGreaterThan(0));

    fireEvent.change(practiceSelect(container), { target: { value: "svc-auditoria" } });
    await waitFor(() => expect(categorySelect(container).disabled).toBe(false));

    fireEvent.change(categorySelect(container), { target: { value: "cat-aud-1" } });
    expect(categorySelect(container).value).toBe("cat-aud-1");

    fireEvent.change(practiceSelect(container), { target: { value: "svc-consultoria" } });

    await waitFor(() => {
      const optionLabels = Array.from(categorySelect(container).querySelectorAll("option"))
        .map((o) => o.textContent)
        .filter(Boolean);
      expect(optionLabels).toEqual(["Socio Consultoría"]);
    });
    expect(categorySelect(container).value).toBe("");
  });

  it("6) edición hidrata society/practice/category guardados; una práctica inactiva asignada se preserva", async () => {
    const { container } = renderEditForm({ practica_id: "svc-inactive", category_id: "" });

    await waitFor(() => {
      expect(practiceSelect(container).value).toBe("svc-inactive");
    });
    const optionLabels = Array.from(practiceSelect(container).querySelectorAll("option")).map(
      (o) => o.textContent
    );
    expect(optionLabels).toContain("Servicios Relacionados");
    expect(societySelect(container).value).toBe("soc-pelaez");
  });

  it("7) submit envía society_id + practica_id + category_id", async () => {
    const { container } = renderEditForm();

    await waitFor(() => {
      expect(societySelect(container).value).toBe("soc-pelaez");
    });

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const callArg = updateMutateAsync.mock.calls[0][0] as {
      id: string;
      data: { society_id: string; practica_id: string; category_id: string };
    };
    expect(callArg.data.society_id).toBe("soc-pelaez");
    expect(callArg.data.practica_id).toBe("svc-auditoria");
    expect(callArg.data.category_id).toBe("cat-aud-1");
  });

  it("8) un par categoría/práctica desajustado (stale) se rechaza antes de mutar", async () => {
    const { toast } = await import("sonner");
    // category_id "cat-stale" no existe en la lista de svc-auditoria (mockeada arriba).
    const { container } = renderEditForm({ category_id: "cat-stale" });

    await waitFor(() => {
      expect(societySelect(container).value).toBe("soc-pelaez");
    });

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("errors.categoryPracticeMismatch");
    });
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });
});
