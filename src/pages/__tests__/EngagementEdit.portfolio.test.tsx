import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * BUG 0828-185 (plan_v2 §c.3) — EngagementEdit ya no puede asumir que todo id de la URL está en
 * la lista: `usePortfolioEngagements()` (por rol/creación, no por asignación) hace que un
 * deep-link a un encargo fuera del portafolio del usuario sea COMÚN, no un caso raro. Sin la
 * rama "no encontrado", `engagements?.find(...)` devuelve `undefined`, que EngagementForm
 * interpreta como modo CREACIÓN silencioso — nunca debe pasar en la ruta /engagements/:id.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/hooks/usePageLeaveLock", () => ({
  usePageLeaveLock: () => ({ blocker: { state: "unblocked" as const }, allowNextNavigation: vi.fn() }),
}));

let mockEngagements: Array<{ engagement_id: string }> | undefined;
let mockIsLoading = false;
let mockIsError = false;
const mockRefetch = vi.fn();
vi.mock("@/hooks/usePortfolioEngagements", () => ({
  usePortfolioEngagements: () => ({
    data: mockEngagements,
    isLoading: mockIsLoading,
    isError: mockIsError,
    refetch: mockRefetch,
  }),
}));

const mockEngagementFormProps = vi.fn();
// BUG 0922-195 (review H13): the stub's own React instance identity (a lazy useState initializer,
// computed once per mount) is what proves EngagementEdit.tsx's `key={engagement.engagement_id}"
// actually forces a fresh EngagementForm instance when the route's :id changes — a plain prop
// snapshot (like `mockEngagementFormProps` below) can't distinguish "same instance, new props"
// from "new instance", since `key` itself is stripped by React and never reaches `props`.
let engagementFormInstanceCounter = 0;
vi.mock("@/components/forms/EngagementForm", () => ({
  EngagementForm: (props: any) => {
    mockEngagementFormProps(props);
    const [instanceId] = React.useState(() => ++engagementFormInstanceCounter);
    return (
      <div data-testid="engagement-form-stub" data-instance-id={instanceId}>
        {props.engagement ? props.engagement.engagement_id : "NO-ENGAGEMENT"}
      </div>
    );
  },
}));

import { Link } from "react-router-dom";
import EngagementEdit from "@/pages/EngagementEdit";

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/engagements/${id}`]}>
      <Routes>
        <Route path="/engagements/:id" element={<EngagementEdit />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("EngagementEdit — deep-link fuera del portafolio (0828-185)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoading = false;
    mockIsError = false;
    mockEngagements = [{ engagement_id: "eng-visible" } as any];
  });

  it("mientras carga, no renderiza el formulario ni el aviso de no-disponible", () => {
    mockIsLoading = true;
    renderAt("eng-visible");
    expect(screen.queryByTestId("engagement-form-stub")).not.toBeInTheDocument();
    expect(screen.queryByText("engagement.unavailable")).not.toBeInTheDocument();
  });

  it("id presente en el portafolio: renderiza EngagementForm con el encargo encontrado", () => {
    renderAt("eng-visible");
    expect(screen.getByTestId("engagement-form-stub")).toHaveTextContent("eng-visible");
    expect(mockEngagementFormProps).toHaveBeenCalledWith(
      expect.objectContaining({ engagement: expect.objectContaining({ engagement_id: "eng-visible" }) })
    );
  });

  it("id ausente del portafolio: muestra el aviso de no-disponible, NUNCA el formulario (no cae a modo creación)", () => {
    renderAt("eng-hidden-by-portfolio-rule");
    expect(screen.getByText("engagement.unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("engagement-form-stub")).not.toBeInTheDocument();
    expect(mockEngagementFormProps).not.toHaveBeenCalled();
  });

  it("id ausente: el botón Cancelar navega de vuelta a /engagements", async () => {
    const user = userEvent.setup();
    renderAt("eng-hidden-by-portfolio-rule");
    await user.click(screen.getByText("common.cancel"));
    expect(mockNavigate).toHaveBeenCalledWith("/engagements");
  });

  it("portafolio vacío (sin datos aún resueltos post-loading): también muestra no-disponible, no creación", () => {
    mockEngagements = [];
    renderAt("cualquier-id");
    expect(screen.getByText("engagement.unavailable")).toBeInTheDocument();
    expect(mockEngagementFormProps).not.toHaveBeenCalled();
  });

  // REVIEW 0828-185 (iteración 2, #2): un error transitorio del RPC (red, timeout) deja
  // `engagement` en `undefined` igual que un id fuera de portafolio -- sin distinguirlo, un
  // fallo de red se vería igual que "no tenés acceso", cuando conviene reintentar.
  it("error del RPC: muestra el mensaje reintentable, NUNCA el aviso de no-disponible ni el formulario", () => {
    mockIsError = true;
    mockEngagements = undefined;
    renderAt("eng-visible");
    expect(screen.getByText("engagement.loadError")).toBeInTheDocument();
    expect(screen.queryByText("engagement.unavailable")).not.toBeInTheDocument();
    expect(screen.queryByTestId("engagement-form-stub")).not.toBeInTheDocument();
    expect(mockEngagementFormProps).not.toHaveBeenCalled();
  });

  it("error del RPC: el botón Reintentar llama a refetch()", async () => {
    const user = userEvent.setup();
    mockIsError = true;
    mockEngagements = undefined;
    renderAt("eng-visible");
    await user.click(screen.getByText("engagement.retry"));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("error del RPC: el botón Cancelar navega de vuelta a /engagements", async () => {
    const user = userEvent.setup();
    mockIsError = true;
    mockEngagements = undefined;
    renderAt("eng-visible");
    await user.click(screen.getByText("common.cancel"));
    expect(mockNavigate).toHaveBeenCalledWith("/engagements");
  });
});

/**
 * BUG 0922-195 (review H13) — sin `key={engagement.engagement_id}`, React Router reutilizaba la
 * MISMA instancia de EngagementForm al navegar entre dos encargos que comparten la ruta
 * /engagements/:id (p. ej. desde la campanita de notificaciones, siempre montada en AppHeader,
 * que enlaza directo a /engagements/:otroId sin pasar por la lista) — con eso, `keepDirtyValues`
 * (H5) podía sobrevivir de un encargo a otro. La política del sistema es que salir de un
 * formulario sin guardar (confirmando la advertencia) SIEMPRE pierde el progreso; este caso se
 * escapaba de esa regla por una cuestión técnica (mismo componente, misma posición en el árbol),
 * no por diseño. `key` fuerza un desmontaje/remontaje real cuando cambia el encargo.
 */
describe("EngagementEdit — remonta EngagementForm al cambiar de encargo por la misma ruta (BUG 0922-195, review H13)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    engagementFormInstanceCounter = 0;
    mockIsLoading = false;
    mockIsError = false;
    mockEngagements = [{ engagement_id: "eng-A" }, { engagement_id: "eng-B" }] as any;
  });

  it("navegar de /engagements/eng-A a /engagements/eng-B (misma ruta, otro id) monta una instancia NUEVA de EngagementForm", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/engagements/eng-A"]}>
        {/* Simula el link directo de la campanita de notificaciones (siempre montada en
            AppHeader) a OTRO encargo, sin pasar por la lista de encargos. */}
        <Link to="/engagements/eng-B" data-testid="notification-link-to-other-engagement">
          notificación de eng-B
        </Link>
        <Routes>
          <Route path="/engagements/:id" element={<EngagementEdit />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId("engagement-form-stub")).toHaveTextContent("eng-A");
    const instanceIdOnA = screen.getByTestId("engagement-form-stub").getAttribute("data-instance-id");

    await user.click(screen.getByTestId("notification-link-to-other-engagement"));

    await waitFor(() => {
      expect(screen.getByTestId("engagement-form-stub")).toHaveTextContent("eng-B");
    });
    // Contra el código pre-fix (sin `key`), esto sería el mismo instance-id — misma instancia de
    // React reutilizada con props nuevas, no un desmontaje/remontaje real.
    const instanceIdOnB = screen.getByTestId("engagement-form-stub").getAttribute("data-instance-id");
    expect(instanceIdOnB).not.toBe(instanceIdOnA);
  });
});
