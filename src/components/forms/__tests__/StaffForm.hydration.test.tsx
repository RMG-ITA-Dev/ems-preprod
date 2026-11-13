import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StaffFull } from "@/hooks/useEmsData";

// BUG 1112-223: la ficha de personal mostraba Sociedad, Práctica y Categoría vacías de forma
// intermitente. Causa: el formulario sembraba los ids guardados ANTES de que los catálogos
// (useSocieties / useServices / useCategories) resolvieran, y Radix Select —al no encontrar
// un <SelectItem> para ese value— emitía onValueChange(""), que borraba el valor del
// formulario (y el handler de Práctica además vaciaba la Categoría).
//
// A diferencia del resto de las suites de StaffForm, esta usa el Radix Select REAL: los mocks
// con <select> nativo no reproducen el "" espurio, que es justo el mecanismo del bug.
// El patrón de catálogos mutables + rerender es el de EngagementForm.society.test.tsx (0922-195).

// ─── JSDOM polyfills para Radix ────────────────────────────────────────────────
if (typeof (globalThis as any).PointerEvent === "undefined") {
  (globalThis as any).PointerEvent = MouseEvent;
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
Element.prototype.scrollIntoView = () => {};
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ─── Hoisted spies ─────────────────────────────────────────────────────────────
const updateMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({ staff_id: "s-1" }));
const canMock = vi.hoisted(() => vi.fn((_perm: string) => true));

// ─── Catálogos mutables ────────────────────────────────────────────────────────
type QueryState<T> = { data: T | undefined; isLoading?: boolean; isError?: boolean };

const SOCIETIES = [
  { society_id: "soc-pelaez", name: "Ruizmier Pelaez", is_active: true, created_at: "2026-01-01" },
  { society_id: "soc-jauregui", name: "Ruizmier Jauregui", is_active: true, created_at: "2026-01-01" },
];

const SERVICES = [
  { practica_id: "svc-auditoria", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "2026-01-01" },
  { practica_id: "svc-consultoria", name: "Consultoría", code: 2, allows_rates_activities: true, is_active: true, created_at: "2026-01-01" },
];

const CATEGORIES: Record<string, Array<{ category_id: string; category_name: string; practica_id: string; display_order: number }>> = {
  "svc-auditoria": [
    { category_id: "cat-asistente", category_name: "Asistente", practica_id: "svc-auditoria", display_order: 1 },
    { category_id: "cat-senior", category_name: "Senior", practica_id: "svc-auditoria", display_order: 2 },
  ],
  "svc-consultoria": [
    { category_id: "cat-consultor", category_name: "Consultor", practica_id: "svc-consultoria", display_order: 1 },
  ],
};

let societiesState: QueryState<typeof SOCIETIES>;
let servicesState: QueryState<typeof SERVICES>;
let categoriesState: Record<string, QueryState<(typeof CATEGORIES)[string]>>;

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: (serviceId?: string) =>
    serviceId ? categoriesState[serviceId] ?? { data: [] } : { data: [] },
  useActiveSkills: () => ({ data: [] }),
  useSocieties: () => societiesState,
  useServices: () => servicesState,
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateStaff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateStaff: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeleteStaff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: canMock, roleKey: "admin" }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
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
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// ─── Supabase: staff (chequeo de duplicados) y society (lectura puntual) ───────
const societyMaybeSingle = vi.fn();
const societyEq = vi.fn(() => ({ maybeSingle: societyMaybeSingle }));
const societySelect = vi.fn((_cols: string) => ({ eq: societyEq }));

beforeEach(() => {
  vi.clearAllMocks();
  canMock.mockImplementation(() => true);

  societiesState = { data: SOCIETIES };
  servicesState = { data: SERVICES };
  categoriesState = {
    "svc-auditoria": { data: CATEGORIES["svc-auditoria"] },
    "svc-consultoria": { data: CATEGORIES["svc-consultoria"] },
  };

  const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
  const neqMock = vi.fn(() => ({ limit: limitMock }));
  const isMock = vi.fn(() => ({ neq: neqMock }));
  const eqMock = vi.fn(() => ({ is: isMock }));
  const staffSelect = vi.fn(() => ({ eq: eqMock }));
  societyMaybeSingle.mockResolvedValue({ data: null, error: null });
  vi.mocked(supabase.from).mockImplementation(((table: string) =>
    table === "society" ? { select: societySelect } : { select: staffSelect }) as any);
  vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
});

// ─── Fixtures y helpers ────────────────────────────────────────────────────────
const baseStaff: StaffFull = {
  staff_id: "s-1",
  first_name: "Lizeth",
  last_name: "Aduviri",
  short_name: "lizeth",
  initials: "LA",
  email: "lizeth@test.com",
  id_number: "13494565",
  aud_reg_number: null,
  category_id: "cat-asistente",
  society_id: "soc-pelaez",
  practica_id: "svc-auditoria",
  city: "La Paz",
  is_active: true,
  is_blocked: false,
  hire_date: "2025-10-06",
  termination_date: null,
  auth_user_id: null,
  staff_skills: [],
};

const makeQC = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const { StaffForm } = await import("../StaffForm");

const renderForm = (staff: StaffFull) => {
  const qc = makeQC();
  const ui = (s: StaffFull) => (
    <QueryClientProvider client={qc}>
      <StaffForm staff={s} onSaveSuccess={vi.fn()} onCancel={vi.fn()} />
    </QueryClientProvider>
  );
  const utils = render(ui(staff));
  return { ...utils, rerenderWith: (s: StaffFull) => utils.rerender(ui(s)) };
};

// Orden de los triggers en el DOM: [0]=ciudad, [1]=sociedad, [2]=práctica, [3]=categoría.
const triggers = () => screen.getAllByRole("combobox");
const societyTrigger = () => triggers()[1];
const practiceTrigger = () => triggers()[2];
const categoryTrigger = () => triggers()[3];
const saveButton = () => screen.getByText("common.saveChanges").closest("button")!;

const expectSavedLabels = async () => {
  await waitFor(() => {
    expect(societyTrigger()).toHaveTextContent("Ruizmier Pelaez");
    expect(practiceTrigger()).toHaveTextContent("Auditoría");
    expect(categoryTrigger()).toHaveTextContent("Asistente");
  });
  expect(categoryTrigger()).not.toBeDisabled();
};

const lastUpdatePayload = () =>
  (updateMutateAsync.mock.calls.at(-1)![0] as { data: Record<string, unknown> }).data;

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe("StaffForm — hidratación de Sociedad/Práctica/Categoría (BUG 1112-223)", () => {
  it("1) la ficha llega antes que los catálogos: los tres campos terminan con sus valores guardados", async () => {
    societiesState = { data: undefined, isLoading: true };
    servicesState = { data: undefined, isLoading: true };
    categoriesState = { "svc-auditoria": { data: undefined, isLoading: true } };
    const { rerenderWith } = renderForm(baseStaff);

    await waitFor(() => expect(triggers().length).toBeGreaterThanOrEqual(4));

    societiesState = { data: SOCIETIES };
    servicesState = { data: SERVICES };
    rerenderWith(baseStaff);

    categoriesState = { "svc-auditoria": { data: CATEGORIES["svc-auditoria"] } };
    rerenderWith(baseStaff);

    await expectSavedLabels();
  });

  it("2) catálogos en caché (presentes desde el primer render): mismas tres etiquetas", async () => {
    renderForm(baseStaff);
    await expectSavedLabels();
  });

  it("3) orden distinto: prácticas antes que sociedades y categorías al final", async () => {
    societiesState = { data: undefined, isLoading: true };
    servicesState = { data: undefined, isLoading: true };
    categoriesState = { "svc-auditoria": { data: undefined, isLoading: true } };
    const { rerenderWith } = renderForm(baseStaff);
    await waitFor(() => expect(triggers().length).toBeGreaterThanOrEqual(4));

    servicesState = { data: SERVICES };
    rerenderWith(baseStaff);
    societiesState = { data: SOCIETIES };
    rerenderWith(baseStaff);
    categoriesState = { "svc-auditoria": { data: CATEGORIES["svc-auditoria"] } };
    rerenderWith(baseStaff);

    await expectSavedLabels();
  });

  it("4) submit tras la carrera envía los tres ids guardados", async () => {
    societiesState = { data: undefined, isLoading: true };
    servicesState = { data: undefined, isLoading: true };
    categoriesState = { "svc-auditoria": { data: undefined, isLoading: true } };
    const { rerenderWith, container } = renderForm(baseStaff);
    await waitFor(() => expect(triggers().length).toBeGreaterThanOrEqual(4));

    societiesState = { data: SOCIETIES };
    servicesState = { data: SERVICES };
    categoriesState = { "svc-auditoria": { data: CATEGORIES["svc-auditoria"] } };
    rerenderWith(baseStaff);
    await expectSavedLabels();

    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(lastUpdatePayload()).toMatchObject({
      society_id: "soc-pelaez",
      practica_id: "svc-auditoria",
      category_id: "cat-asistente",
    });
  });

  it("5) mientras un catálogo carga, Guardar está deshabilitado y el submit no muta", async () => {
    servicesState = { data: undefined, isLoading: true };
    const { container } = renderForm(baseStaff);
    await waitFor(() => expect(triggers().length).toBeGreaterThanOrEqual(4));

    expect(saveButton()).toBeDisabled();
    fireEvent.submit(container.querySelector("form")!);
    // Dejar correr el handleSubmit async de RHF antes de afirmar la ausencia de la mutación.
    await new Promise((r) => setTimeout(r, 50));
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("6) error sin datos: aviso visible, Guardar deshabilitado y el valor se conserva al recuperar", async () => {
    servicesState = { data: undefined, isError: true };
    const { rerenderWith } = renderForm(baseStaff);

    expect(await screen.findByText("staff.catalogLoadError")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    servicesState = { data: SERVICES };
    rerenderWith(baseStaff);

    await expectSavedLabels();
    expect(screen.queryByText("staff.catalogLoadError")).toBeNull();
    expect(saveButton()).not.toBeDisabled();
  });

  it("7) error con datos previos (refresco fallido): no hay aviso y Guardar sigue habilitado", async () => {
    servicesState = { data: SERVICES, isError: true };
    renderForm(baseStaff);

    await expectSavedLabels();
    expect(screen.queryByText("staff.catalogLoadError")).toBeNull();
    expect(saveButton()).not.toBeDisabled();
  });

  it("8) un refetch del mismo registro conserva lo editado y actualiza lo no tocado", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderForm(baseStaff);
    await expectSavedLabels();

    const shortName = screen.getByPlaceholderText("staff.shortNamePlaceholder") as HTMLInputElement;
    await user.clear(shortName);
    await user.type(shortName, "lizeth editado");
    expect(shortName.value).toBe("lizeth editado");

    // Refetch de staff_full: objeto nuevo, mismo staff_id, iniciales cambiadas por otra vía.
    rerenderWith({ ...baseStaff, initials: "LAM" });

    await waitFor(() => {
      expect((screen.getByPlaceholderText("staff.initialsPlaceholder") as HTMLInputElement).value).toBe("LAM");
    });
    expect(shortName.value).toBe("lizeth editado");
    await expectSavedLabels();
  });

  it("9) cambiar de staff_id resiembra todo el formulario", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderForm(baseStaff);
    await expectSavedLabels();

    const shortName = screen.getByPlaceholderText("staff.shortNamePlaceholder") as HTMLInputElement;
    await user.clear(shortName);
    await user.type(shortName, "editado");

    rerenderWith({
      ...baseStaff,
      staff_id: "s-2",
      short_name: "otro",
      society_id: "soc-jauregui",
      practica_id: "svc-consultoria",
      category_id: "cat-consultor",
    });

    await waitFor(() => {
      expect(shortName.value).toBe("otro");
      expect(societyTrigger()).toHaveTextContent("Ruizmier Jauregui");
      expect(practiceTrigger()).toHaveTextContent("Consultoría");
      expect(categoryTrigger()).toHaveTextContent("Consultor");
    });
  });

  it("10) consulta (sin staff.update): las tres etiquetas se ven tras la carrera", async () => {
    canMock.mockImplementation((perm: string) => perm !== "staff.update");
    societiesState = { data: undefined, isLoading: true };
    servicesState = { data: undefined, isLoading: true };
    categoriesState = { "svc-auditoria": { data: undefined, isLoading: true } };
    const { rerenderWith } = renderForm(baseStaff);
    await waitFor(() => expect(triggers().length).toBeGreaterThanOrEqual(4));

    societiesState = { data: SOCIETIES };
    servicesState = { data: SERVICES };
    categoriesState = { "svc-auditoria": { data: CATEGORIES["svc-auditoria"] } };
    rerenderWith(baseStaff);

    await waitFor(() => {
      expect(societyTrigger()).toHaveTextContent("Ruizmier Pelaez");
      expect(practiceTrigger()).toHaveTextContent("Auditoría");
      expect(categoryTrigger()).toHaveTextContent("Asistente");
    });
  });

  it("11) sociedad inactiva asignada: se muestra su nombre y se guarda su id", async () => {
    societyMaybeSingle.mockResolvedValue({
      data: { society_id: "soc-inactiva", name: "Sociedad Histórica", is_active: false },
      error: null,
    });
    const staff = { ...baseStaff, society_id: "soc-inactiva" };
    const { container } = renderForm(staff);

    await waitFor(() => expect(societyTrigger()).toHaveTextContent("Sociedad Histórica"));
    expect(societySelect).toHaveBeenCalledWith("society_id, name, is_active");
    expect(societyEq).toHaveBeenCalledWith("society_id", "soc-inactiva");

    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(lastUpdatePayload().society_id).toBe("soc-inactiva");
  });

  it("12) con la sociedad activa en el catálogo no se hace ningún GET extra a society", async () => {
    renderForm(baseStaff);
    await expectSavedLabels();
    // `society` no está en types.ts (StaffForm la consulta con `supabase as any`), de ahí el cast.
    expect(vi.mocked(supabase.from).mock.calls.some(([table]) => (table as string) === "society")).toBe(false);
  });

  it("13) si falla la lectura puntual: aviso visible, pero se puede guardar con el id original", async () => {
    societyMaybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const staff = { ...baseStaff, society_id: "soc-inactiva" };
    const { container } = renderForm(staff);

    expect(await screen.findByText("staff.catalogLoadError")).toBeInTheDocument();
    await waitFor(() => expect(saveButton()).not.toBeDisabled());

    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(lastUpdatePayload().society_id).toBe("soc-inactiva");
  });
});
