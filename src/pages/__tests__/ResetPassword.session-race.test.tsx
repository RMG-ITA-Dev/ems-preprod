import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResetPassword from "@/pages/ResetPassword";

// Llegando desde el enlace del correo, supabase-js tiene que canjear el codigo de la URL contra
// el servidor antes de que exista la sesion. Durante ese viaje de red `session` es null, que NO
// es lo mismo que "el enlace no sirve": mostrar ahi la pantalla de enlace invalido manda al
// usuario de vuelta a /auth con un enlace que estaba perfecto.

const mockUseAuth = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (clave: string) => clave }),
}));

const renderizar = () =>
  render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>,
  );

describe("ResetPassword — carrera entre el enlace y la sesion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mientras la sesion se resuelve no acusa el enlace de invalido", () => {
    mockUseAuth.mockReturnValue({
      updatePassword: vi.fn(),
      session: null,
      loading: true,
    });

    renderizar();

    expect(screen.queryByText("auth.invalidResetLink")).not.toBeInTheDocument();
    expect(screen.queryByText("auth.backToSignIn")).not.toBeInTheDocument();
    // Tampoco el formulario: todavia no se sabe si corresponde.
    expect(screen.queryByLabelText("auth.newPassword")).not.toBeInTheDocument();
  });

  it("resuelto y sin sesion, el enlace si es invalido", () => {
    mockUseAuth.mockReturnValue({
      updatePassword: vi.fn(),
      session: null,
      loading: false,
    });

    renderizar();

    expect(screen.getByText("auth.invalidResetLink")).toBeInTheDocument();
    expect(screen.getByText("auth.backToSignIn")).toBeInTheDocument();
  });

  it("con sesion muestra el formulario de contrasena nueva", () => {
    mockUseAuth.mockReturnValue({
      updatePassword: vi.fn(),
      session: { user: { id: "user-1" } },
      loading: false,
    });

    renderizar();

    expect(screen.getByLabelText("auth.newPassword")).toBeInTheDocument();
    expect(screen.getByLabelText("auth.confirmPassword")).toBeInTheDocument();
    expect(screen.queryByText("auth.invalidResetLink")).not.toBeInTheDocument();
  });
});
