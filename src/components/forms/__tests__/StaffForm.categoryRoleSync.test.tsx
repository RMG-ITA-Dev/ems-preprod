import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StaffFull } from "@/hooks/useEmsData";

/**
 * BUG 0820-182 — sincronización categoría → rol, restaurada sobre `role_key`.
 *
 * FASE 3c (commit 750f15dd) eliminó este diálogo junto con el control de rol del
 * formulario de categorías. Vuelve con la misma semántica que tenía —la categoría
 * PROPONE, el admin decide— pero apuntando al catálogo `authorization_roles` en vez del
 * enum legacy, y con un gate de permiso que el flujo original no tenía.
 *
 * Lo que estos tests protegen, en orden de importancia:
 *  · que NUNCA se cambie un rol sin confirmación explícita (tests 3 y 8);
 *  · que un admin no se degrade solo (test 8);
 *  · que el diálogo no aparezca donde no puede funcionar (tests 4-7, 9);
 *  · que el guardado del staff siga ocurriendo ANTES, y que un fallo de competencias
 *    corte el flujo antes del diálogo (test 10).
 */

const updateRoleKeyMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const navigateStub = vi.hoisted(() => vi.fn());
const updateStaffMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const createCompetencyMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const deleteCompetencyMutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateStub,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, params?: Record<string, unknown>) =>
      params?.role ? `${k}:${params.role}` : k,
    i18n: { language: "es" },
  }),
}));

// Dos categorías con rol sugerido distinto + una sin sugerencia, para cubrir los caminos.
const CATEGORIES = [
  {
    category_id: "cat-socio",
    category_name: "Socio",
    practica_id: "svc-1",
    rate_high_bob: 200, rate_low_bob: 150, rate_high_usd: 30, rate_low_usd: 25,
    display_order: 1,
    can_approve_wo: false,
    can_approve_timesheets: false,
    default_app_role: null,
    default_role_key: "partner",
  },
  {
    category_id: "cat-gerente",
    category_name: "Gerente",
    practica_id: "svc-1",
    rate_high_bob: 150, rate_low_bob: 100, rate_high_usd: 25, rate_low_usd: 20,
    display_order: 2,
    can_approve_wo: false,
    can_approve_timesheets: false,
    default_app_role: null,
    default_role_key: "ita_manager",
  },
  {
    // Solo alcanzable por datos heredados: el desplegable no ofrece `admin` y la columna
    // tiene un CHECK que lo prohíbe. Existe en el fixture para probar que, aun así,
    // StaffForm no lo ofrece.
    category_id: "cat-admin",
    category_name: "Administración",
    practica_id: "svc-1",
    rate_high_bob: 0, rate_low_bob: 0, rate_high_usd: 0, rate_low_usd: 0,
    display_order: 4,
    can_approve_wo: false,
    can_approve_timesheets: false,
    default_app_role: null,
    default_role_key: "admin",
  },
  {
    category_id: "cat-sin-rol",
    category_name: "Pasante",
    practica_id: "svc-1",
    rate_high_bob: 0, rate_low_bob: 0, rate_high_usd: 0, rate_low_usd: 0,
    display_order: 3,
    can_approve_wo: false,
    can_approve_timesheets: false,
    default_app_role: null,
    default_role_key: null,
  },
];

const SOCIETIES = [
  { society_id: "soc-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "2026-01-01" },
];
const SERVICES = [
  { practica_id: "svc-1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "2026-01-01" },
];

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: CATEGORIES }),
  useActiveSkills: () => ({ data: [] }),
  useSocieties: () => ({ data: SOCIETIES }),
  useServices: () => ({ data: SERVICES }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateStaff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateStaff: () => ({ mutateAsync: updateStaffMutateAsync, isPending: false }),
  useDeleteStaff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateStaffCompetency: () => ({ mutateAsync: createCompetencyMutateAsync, isPending: false }),
  useUpdateStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteStaffCompetency: () => ({ mutateAsync: deleteCompetencyMutateAsync, isPending: false }),
}));

// isPending controlable: los tests del guard necesitan el diálogo abierto con la mutación
// "en vuelo" sin depender de timing real.
let roleKeyPending = false;
vi.mock("@/hooks/useUserRoles", () => ({
  useSyncUserRoleFromCategory: () => ({
    mutateAsync: updateRoleKeyMutateAsync,
    get isPending() {
      return roleKeyPending;
    },
  }),
}));

// Gate de permiso controlable por test: /staff/:id solo exige staff.read, así que un rol
// sin `user_role.update` puede llegar acá.
let canUpdateRoles = true;
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    can: (permission: string) =>
      permission === "user_role.update" ? canUpdateRoles : true,
    roleKey: "admin",
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

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
    <select value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>
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
  Switch: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (v: boolean) => void }) => (
    <input type="checkbox" checked={checked ?? false} onChange={(e) => onCheckedChange?.(e.target.checked)} />
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  // Se expone un botón que llama a onOpenChange(false): es el equivalente testeable de
  // Escape / click afuera, que es justo el camino que el guard de isPending debe cortar.
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  }) =>
    open ? (
      <>
        <button type="button" data-testid="dialog-dismiss" onClick={() => onOpenChange?.(false)}>
          dismiss
        </button>
        {children}
      </>
    ) : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
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
  AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
});

/** Rol actual del usuario vinculado, que StaffForm lee de `user_roles`. */
let currentRoleKey: string | null = "assistant";
/** Cuando está definido, la SEGUNDA lectura devuelve este valor (simula una carrera). */
let roleKeyOnSecondRead: string | null | undefined;
let roleLookupFails = false;
let roleLookupCalls = 0;

beforeEach(() => {
  vi.clearAllMocks();
  canUpdateRoles = true;
  roleKeyPending = false;
  currentRoleKey = "assistant";
  roleKeyOnSecondRead = undefined;
  roleLookupFails = false;
  roleLookupCalls = 0;
  updateStaffMutateAsync.mockResolvedValue({});
  createCompetencyMutateAsync.mockResolvedValue({});
  deleteCompetencyMutateAsync.mockResolvedValue({});

  // `from()` sirve a dos consumidores con formas distintas: la de horas pendientes
  // (select→eq→is→neq→limit) y la del rol actual (select→eq→single).
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === "user_roles") {
      return {
        select: () => ({
          eq: () => ({
            // StaffForm usa maybeSingle: cero filas es un estado posible, no una excepción.
            maybeSingle: () => {
              roleLookupCalls += 1;
              if (roleLookupFails) {
                return Promise.resolve({ data: null, error: { message: "boom" } });
              }
              // Permite simular que otro admin cambió el rol entre la lectura del submit
              // y la del confirm (la segunda llamada devuelve otro valor).
              const value =
                roleLookupCalls > 1 && roleKeyOnSecondRead !== undefined
                  ? roleKeyOnSecondRead
                  : currentRoleKey;
              return Promise.resolve({ data: { role_key: value }, error: null });
            },
          }),
        }),
      } as any;
    }
    return {
      select: () => ({
        eq: () => ({ is: () => ({ neq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
      }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    } as any;
  });
  vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any);
});

const baseStaff: StaffFull = {
  staff_id: "staff-abc",
  first_name: "Juan",
  last_name: "Pérez",
  short_name: "J. Pérez",
  initials: "JP",
  email: "juan@test.com",
  id_number: "11111",
  aud_reg_number: null,
  category_id: "cat-socio",
  society_id: "soc-1",
  practica_id: "svc-1",
  city: "La Paz",
  is_active: true,
  is_blocked: false,
  hire_date: "2021-01-01",
  termination_date: null,
  auth_user_id: "auth-user-123",
  staff_skills: [],
};

const makeQC = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const { StaffForm } = await import("../StaffForm");

const onSaveSuccess = vi.fn();

const renderForm = (overrides: Partial<StaffFull> = {}) => {
  const staff = { ...baseStaff, ...overrides };
  return render(
    <QueryClientProvider client={makeQC()}>
      <StaffForm staff={staff} onSaveSuccess={onSaveSuccess} onCancel={vi.fn()} />
    </QueryClientProvider>,
  );
};

/** El select de Categoría es el que ofrece las tres categorías del fixture. */
const categorySelect = () => {
  const selects = Array.from(document.querySelectorAll("select")) as HTMLSelectElement[];
  const match = selects.find((s) =>
    Array.from(s.options).some((o) => o.value === "cat-gerente")
  );
  if (!match) throw new Error("No se encontró el select de Categoría");
  return match;
};

/** Cambia la categoría de verdad (no se inyecta el estado final) y guarda. */
const changeCategoryAndSave = async (
  user: ReturnType<typeof userEvent.setup>,
  categoryId: string,
) => {
  await user.selectOptions(categorySelect(), categoryId);
  await user.click(screen.getByText("common.saveChanges"));
  await waitFor(() => expect(updateStaffMutateAsync).toHaveBeenCalled());
};

describe("StaffForm — sync categoría→rol (0820-182)", () => {
  it("Test 1: abre el diálogo al cambiar a una categoría con rol sugerido distinto", async () => {
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");

    expect(await screen.findByText("staff.syncRoleTitle")).toBeTruthy();
    // No navega hasta que el usuario resuelva el diálogo.
    expect(onSaveSuccess).not.toHaveBeenCalled();
  });

  it("Test 2: confirmar llama a la mutación de role_key con el motivo de auditoría", async () => {
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");
    await user.click(await screen.findByText("staff.syncRoleConfirm"));

    await waitFor(() => expect(updateRoleKeyMutateAsync).toHaveBeenCalled());
    // Se manda el STAFF, no el usuario ni el rol ya resueltos: la RPC deriva la cuenta y
    // revalida la sugerencia de la categoría vigente con las filas bloqueadas.
    expect(updateRoleKeyMutateAsync).toHaveBeenCalledWith({
      staffId: "staff-abc",
      expectedRoleKey: "ita_manager",
      // El RPC lo deja en user_lifecycle_audit_log.reason.
      reason: "Category change sync",
    });
    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
  });

  it("Test 3: omitir NO toca el rol, pero sí completa el guardado", async () => {
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");
    await user.click(await screen.findByText("staff.syncRoleSkip"));

    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
  });

  it("Test 4: sin cuenta vinculada nunca ofrece sincronizar", async () => {
    const user = userEvent.setup();
    renderForm({ auth_user_id: null });

    await changeCategoryAndSave(user, "cat-gerente");

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
    expect(screen.queryByText("staff.syncRoleTitle")).toBeNull();
    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
  });

  it("Test 5: categoría destino sin rol sugerido no propone nada", async () => {
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-sin-rol");

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
    expect(screen.queryByText("staff.syncRoleTitle")).toBeNull();
    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
  });

  it("Test 6: si el rol actual ya coincide con el sugerido, no molesta", async () => {
    currentRoleKey = "ita_manager";
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
    expect(screen.queryByText("staff.syncRoleTitle")).toBeNull();
  });

  it("Test 7: guardar sin cambiar de categoría no dispara el diálogo", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByText("common.saveChanges"));
    await waitFor(() => expect(updateStaffMutateAsync).toHaveBeenCalled());

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
    expect(screen.queryByText("staff.syncRoleTitle")).toBeNull();
    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
  });

  it("Test 8: a un admin no se le ofrece degradarse; se avisa y se sigue", async () => {
    currentRoleKey = "admin";
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("staff.adminRoleProtected"));
    expect(screen.queryByText("staff.syncRoleTitle")).toBeNull();
    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
  });

  it("Test 9: sin permiso user_role.update no aparece el diálogo", async () => {
    // Sin este gate, cualquiera de los roles con staff.read vería un diálogo que solo
    // puede terminar en NOT_ADMIN.
    canUpdateRoles = false;
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
    expect(screen.queryByText("staff.syncRoleTitle")).toBeNull();
    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
  });

  it("Test 11: nunca ofrece `admin`, aunque la categoría lo tenga guardado", async () => {
    // Escalada de privilegios: sin este guard, mover a alguien a una categoría cuyo
    // default_role_key quedó en `admin` (p. ej. backfilleado desde el enum legacy en una
    // base actualizada) ofrecería convertirlo en administrador.
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-admin");

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
    expect(screen.queryByText("staff.syncRoleTitle")).toBeNull();
    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
  });

  it("Test 15: si falla la lectura del rol actual, no ofrece nada (fail closed)", async () => {
    // Antes el error se descartaba y roleData quedaba null, que se leía como "el rol
    // difiere" → abría el diálogo. Con el usuario destino siendo admin, eso ofrecía
    // degradarlo: la protección de admin se saltaba sola ante un fallo de red o de RLS.
    roleLookupFails = true;
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");

    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
    expect(screen.queryByText("staff.syncRoleTitle")).toBeNull();
    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
  });

  it("Test 16: la precondición de admin la aplica la RPC, no el cliente", async () => {
    // Antes se releía el rol antes de mutar, lo que seguía siendo una carrera: otro admin
    // podía promover al destino en la ventana entre la lectura y la escritura.
    // `sync_user_role_from_category` evalúa la precondición con la fila bloqueada, así que
    // el cliente ya NO debe interponer su propio chequeo — solo llamar y reportar.
    // Se simula la respuesta ADMIN_PROTECTED del servidor.
    roleKeyOnSecondRead = "admin";
    updateRoleKeyMutateAsync.mockRejectedValueOnce(new Error("ADMIN_PROTECTED"));
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");
    await user.click(await screen.findByText("staff.syncRoleConfirm"));

    // Se llamó a la RPC (no se cortó del lado del cliente)...
    await waitFor(() => expect(updateRoleKeyMutateAsync).toHaveBeenCalled());
    // ...y el rechazo del servidor no retiene al usuario: el staff ya se guardó.
    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalled());
  });

  it("Test 12: descartar el diálogo (Escape/click afuera) equivale a omitir", async () => {
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");
    await user.click(await screen.findByTestId("dialog-dismiss"));

    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaveSuccess).toHaveBeenCalledTimes(1));
  });

  it("Test 13: con la mutación en vuelo, no se puede descartar ni omitir", async () => {
    // Una vez confirmado, la mutación no se puede cancelar. Sin este guard, Escape /
    // Omitir llamarían finishSave() y después el confirm lo llamaría OTRA vez al
    // resolver: doble onSaveSuccess, y el formulario desmontado con el request en vuelo.
    roleKeyPending = true;
    const user = userEvent.setup();
    renderForm();

    await changeCategoryAndSave(user, "cat-gerente");
    expect(await screen.findByText("staff.syncRoleTitle")).toBeTruthy();

    // Omitir está deshabilitado...
    const skip = screen.getByText("staff.syncRoleSkip").closest("button");
    expect(skip).toBeDisabled();

    // ...y descartar no hace nada: el diálogo sigue abierto y no se completó el guardado.
    await user.click(screen.getByTestId("dialog-dismiss"));
    expect(screen.queryByText("staff.syncRoleTitle")).toBeTruthy();
    expect(onSaveSuccess).not.toHaveBeenCalled();
  });

  it("Test 14: si falla el guardado de competencias, corta ANTES del diálogo", async () => {
    // El orden importa: no se debe ofrecer sincronizar un rol sobre un guardado
    // incompleto. Protege el  temprano del handler de submit. Se usa el camino
    // de borrado porque no depende de rellenar un campo nuevo.
    deleteCompetencyMutateAsync.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    renderForm({
      staff_skills: [
        {
          staff_skill_id: "ss-1",
          skill_id: "skill-1",
          proficiency_level: "Beginner",
          last_evaluated_date: "2026-01-01",
        },
      ] as StaffFull["staff_skills"],
    });

    await user.click(await screen.findByLabelText("staff.competencies.remove"));
    await changeCategoryAndSave(user, "cat-gerente");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("staff.competencies.errors.partialSave"),
    );
    expect(screen.queryByText("staff.syncRoleTitle")).toBeNull();
    expect(updateRoleKeyMutateAsync).not.toHaveBeenCalled();
    expect(onSaveSuccess).not.toHaveBeenCalled();
  });
});
