import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * Los dos campos de la sección "Notificaciones" (0601-130) se guardaban pero no contaban para el
 * estado sucio: `isGlobalDirty` no los miraba y su lista de dependencias no los incluía. Si eran
 * lo ÚNICO editado, `usePageLeaveLock` seguía en false y navegar se llevaba el cambio sin que
 * apareciera el `LeavePageDialog` — la regla 9 de AGENTS.md.
 *
 * No son simétricos, y por eso hay un caso para cada uno:
 *
 *   * `alertWindowWeeks` nunca se hidrata desde `global_settings` (el input cae al persistido en
 *     su `value`), así que vacío significa "sin tocar", igual que el resto de los numéricos.
 *   * `trackingStartDate` sí se hidrata, porque el guardado compara contra lo persistido para
 *     permitir GUARDAR EL VACÍO: dejar el campo en blanco es como se desactiva el recorte por
 *     fecha de arranque. Ahí vaciar un valor guardado ES un cambio.
 */

const mockBlocker = { state: "unblocked" as const, reset: vi.fn(), proceed: vi.fn() };
let capturedLockArgs: any = {};

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: (args: any) => {
    capturedLockArgs = args;
    return { blocker: mockBlocker, allowNextNavigation: vi.fn(), isDirty: false };
  },
}));

// Referencias ESTABLES. Settings hidrata su estado local en un `useEffect` con `[settings]` de
// dependencia; devolviendo un array nuevo en cada render, ese efecto corre en cada render y pisa
// lo que el usuario acaba de escribir — el campo vuelve solo a su valor persistido y el test
// mide un bug del mock, no del componente. En produccion `data` viene de react-query y es
// estable entre renders.
const AJUSTES = [
  { setting_key: "LANGUAGE", setting_value: "en" },
  { setting_key: "ALLOW_WEEKEND_TRACKING", setting_value: "false" },
  { setting_key: "COMPACT_FONT", setting_value: "false" },
  { setting_key: "ALLOWED_EMAIL_DOMAIN", setting_value: "" },
  { setting_key: "TAX_RATE", setting_value: "0.13" },
  { setting_key: "REALIZATION_LIMIT", setting_value: "75" },
  { setting_key: "DAILY_MIN", setting_value: "8" },
  { setting_key: "DAILY_MAX", setting_value: "8" },
  { setting_key: "WEEKLY_MIN", setting_value: "40" },
  { setting_key: "WEEKLY_MAX", setting_value: "40" },
  // Los dos del módulo de notificaciones, ya persistidos.
  { setting_key: "TS_ALERT_WINDOW_WEEKS", setting_value: "4" },
  { setting_key: "TS_TRACKING_START_DATE", setting_value: "2026-01-01" },
];
const VACIO: unknown[] = [];

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: VACIO, isLoading: false }),
  useIndustries: () => ({ data: VACIO, isLoading: false }),
  useGlobalSettings: () => ({ data: AJUSTES, isLoading: false }),
  useActivityCodes: () => ({ data: VACIO, isLoading: false }),
  useAllActivityCodes: () => ({ data: VACIO, isLoading: false }),
  useExpenseTypes: () => ({ data: VACIO, isLoading: false }),
  useSkills: () => ({ data: VACIO, isLoading: false }),
  useEngagements: () => ({ data: VACIO }),
  useServices: () => ({ data: VACIO, isLoading: false }),
  useTaxonomies: () => ({ data: VACIO, isLoading: false }),
}));
vi.mock("@/hooks/mutations", () => ({
  useUpdateGlobalSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderServiceActivity: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useMoveCategory: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCopyCategories: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "admin" }),
}));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ currentLanguage: "en" }) }));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, focusMode }: any) => (
    <div data-testid="app-layout" data-focus-mode={focusMode}>{children}</div>
  ),
}));
vi.mock("@/components/ui/leave-page-dialog", () => ({
  LeavePageDialog: ({ isDirty }: any) => (
    <div data-testid="leave-page-dialog" data-is-dirty={isDirty} />
  ),
}));
// El idioma es mutable para poder probar el calendario en los dos: `vi.mock` se iza, asi que el
// factory tiene que leer de un objeto creado con `vi.hoisted` en vez de una constante del modulo.
const sesion = vi.hoisted(() => ({ idioma: "en" }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: sesion.idioma } }),
}));
vi.mock("@/components/settings/UserRolesManager", () => ({ UserRolesManager: () => <div /> }));
vi.mock("@/components/settings/ChangePasswordCard", () => ({ ChangePasswordCard: () => <div /> }));
vi.mock("@/components/settings/HolidaysManager", () => ({ HolidaysManager: () => <div /> }));

import Settings from "../Settings";

describe("Settings — los campos de notificaciones cuentan para el estado sucio (0601-130)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    sesion.idioma = "en";
    vi.clearAllMocks();
    capturedLockArgs = {};
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  const abrirGlobal = async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Settings />
      </QueryClientProvider>
    );
    const user = userEvent.setup();
    await user.click(screen.getByText("settings.globalSettings"));
    return user;
  };

  it("arranca limpio con lo persistido cargado", async () => {
    await abrirGlobal();
    expect(capturedLockArgs.locked).toBe(true);
    expect(capturedLockArgs.isDirty).toBe(false);
    // La fecha SÍ se hidrata; la ventana cae al persistido por el `value` del input. El campo
    // de fecha es un calendario y no un `<input type="date">`, así que lo persistido se lee del
    // texto del disparador, ya en DD/MM/YYYY (regla 3 de AGENTS.md).
    expect(screen.getByLabelText("settings.trackingStartDate")).toHaveTextContent("01/01/2026");
    expect((screen.getByLabelText("settings.alertWindowWeeks") as HTMLInputElement).value)
      .toBe("4");
  });

  // Los dos casos de la ventana usan `fireEvent.change` con el valor entero, igual que
  // src/components/ui/__tests__/NumericInput.test.tsx. Lo que se mide aca es la lista de
  // dependencias de `isGlobalDirty`, no el tecleo: el manejo tecla por tecla de NumericInput
  // —con su borrador intermedio y el `value || persistido` del padre, que hace que vaciar el
  // campo lo devuelva al persistido— ya tiene su propia suite.
  it("cambiar SOLO la ventana de alarmas ensucia el formulario", async () => {
    await abrirGlobal();
    const input = screen.getByLabelText("settings.alertWindowWeeks") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "8" } });

    expect(input.value).toBe("8");
    expect(capturedLockArgs.isDirty).toBe(true);
  });

  it("volver la ventana a su valor persistido deja el formulario limpio", async () => {
    await abrirGlobal();
    const input = screen.getByLabelText("settings.alertWindowWeeks") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "8" } });
    expect(capturedLockArgs.isDirty).toBe(true);

    fireEvent.change(input, { target: { value: "4" } });
    expect(input.value).toBe("4");
    expect(capturedLockArgs.isDirty).toBe(false);
  });

  it("cambiar SOLO la fecha de arranque ensucia el formulario", async () => {
    const user = await abrirGlobal();
    const disparador = screen.getByLabelText("settings.trackingStartDate");

    await user.click(disparador);
    // El calendario abre en el mes de lo persistido (enero 2026), asi que el dia esta a la vista
    // sin navegar meses.
    await user.click(within(await screen.findByRole("dialog")).getByText("15"));

    expect(disparador).toHaveTextContent("15/01/2026");
    expect(capturedLockArgs.isDirty).toBe(true);
  });

  it("BORRAR la fecha de arranque tambien ensucia: el vacio es un valor que se guarda", async () => {
    const user = await abrirGlobal();
    const disparador = screen.getByLabelText("settings.trackingStartDate");

    await user.click(disparador);
    const calendario = await screen.findByRole("dialog");

    // Se elige un dia y se vuelve a hacer clic en el MISMO: `mode="single"` sin `required`
    // deselecciona, y esa es la unica forma de vaciar el ajuste desde la interfaz. Se pasa por el
    // 15 en vez de deseleccionar el 1 persistido porque el 1 aparece dos veces en la grilla de
    // enero 2026 (el propio y el 1 de febrero, que el calendario muestra como dia de afuera).
    await user.click(within(calendario).getByText("15"));
    await user.click(within(calendario).getByText("15"));

    expect(disparador).toHaveTextContent("common.pickDate");
    expect(capturedLockArgs.isDirty).toBe(true);
  });

  it("el calendario se muestra en el idioma de la sesion", async () => {
    // `react-day-picker` cae a ingles si nadie le pasa locale, y el wrapper de ui/calendar.tsx no
    // elige ninguno: el calendario mostraba "January" y "Mo Tu We" en una sesion en espanol.
    sesion.idioma = "es";
    const user = await abrirGlobal();

    await user.click(screen.getByLabelText("settings.trackingStartDate"));
    const calendario = await screen.findByRole("dialog");

    // Enero 2026 es el mes de lo persistido, asi que es el que abre.
    expect(within(calendario).getByText(/enero/i)).toBeInTheDocument();
    expect(within(calendario).queryByText(/january/i)).not.toBeInTheDocument();
  });

  it("y en ingles cuando la sesion es en ingles", async () => {
    sesion.idioma = "en";
    const user = await abrirGlobal();

    await user.click(screen.getByLabelText("settings.trackingStartDate"));
    const calendario = await screen.findByRole("dialog");

    expect(within(calendario).getByText(/january/i)).toBeInTheDocument();
  });

  it("Cancelar devuelve los dos campos a lo persistido y limpia el estado sucio", async () => {
    const user = await abrirGlobal();
    const semanas = screen.getByLabelText("settings.alertWindowWeeks") as HTMLInputElement;
    const fecha = screen.getByLabelText("settings.trackingStartDate");

    fireEvent.change(semanas, { target: { value: "12" } });
    await user.click(fecha);
    await user.click(within(await screen.findByRole("dialog")).getByText("20"));
    expect(capturedLockArgs.isDirty).toBe(true);

    await user.click(screen.getByText("common.cancel"));

    // Cancelar vuelve a la pestaña de cuenta; se reabre Global para inspeccionar los campos.
    await user.click(screen.getByText("settings.globalSettings"));
    expect((screen.getByLabelText("settings.alertWindowWeeks") as HTMLInputElement).value)
      .toBe("4");
    expect(screen.getByLabelText("settings.trackingStartDate")).toHaveTextContent("01/01/2026");
    expect(capturedLockArgs.isDirty).toBe(false);
  });
});
