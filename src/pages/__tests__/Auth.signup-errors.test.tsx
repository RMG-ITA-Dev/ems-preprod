import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * El alta dejó de pasar por `supabase.auth.signUp()` y pasa por la edge function
 * `register-user`, que devuelve CÓDIGOS (`INTERNAL_ERROR`, `INVALID_DOMAIN`, ...) en vez de
 * mensajes. `useAuth.signUp()` los envuelve en `new Error(codigo)`, así que el `else` que antes
 * mostraba la prosa de GoTrue pasó a mostrarle al usuario una palabra en mayúsculas que no
 * significa nada — en español y en inglés por igual (regla 5 de AGENTS.md).
 *
 * Acá se fija que cada código conocido tenga su mensaje traducido y que el resto caiga en uno
 * genérico, nunca en el código crudo.
 */

// t devuelve la clave, para poder afirmar sobre claves y no sobre traducciones.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockSignUp = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ signIn: vi.fn(), signUp: mockSignUp }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: () => ({ data: [] }),
}));

vi.mock("@/components/auth/ForgotPasswordDialog", () => ({
  ForgotPasswordDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

import Auth from "../Auth";

function registrarse() {
  const utils = render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );

  // "auth.signUp" rotula dos cosas: la pestaña de modo y el botón de envío. La pestaña va
  // primera en el DOM.
  fireEvent.click(screen.getAllByRole("button", { name: "auth.signUp" })[0]);

  fireEvent.change(utils.container.querySelector("#firstName")!, {
    target: { value: "Ana" },
  });
  fireEvent.change(utils.container.querySelector("#lastName")!, {
    target: { value: "Perez" },
  });
  fireEvent.change(utils.container.querySelector("#email")!, {
    target: { value: "ana@ruizmier.com" },
  });
  fireEvent.change(utils.container.querySelector("#password")!, {
    target: { value: "password123" },
  });
  fireEvent.submit(utils.container.querySelector("form")!);
  return utils;
}

describe("Auth — el alta nunca muestra el codigo crudo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("un fallo del servicio cae en un mensaje traducido, no en INTERNAL_ERROR", async () => {
    // El caso realista: Graph caido, o `generateLink` que falla. Antes salia el token tal cual.
    mockSignUp.mockResolvedValue({ error: new Error("INTERNAL_ERROR") });

    registrarse();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("auth.signupFailed");
    });
    expect(toast.error).not.toHaveBeenCalledWith("INTERNAL_ERROR");
  });

  it("tampoco con un codigo que el formulario no conoce", async () => {
    // El contrato puede crecer. Un codigo nuevo tiene que caer al generico igual, no filtrarse.
    mockSignUp.mockResolvedValue({ error: new Error("ALGO_NUEVO") });

    registrarse();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("auth.signupFailed");
    });
    expect(toast.error).not.toHaveBeenCalledWith("ALGO_NUEVO");
  });

  it("los codigos de validacion conservan su mensaje propio", async () => {
    // El generico es la red de contencion, no el unico mensaje: lo que el usuario puede
    // corregir por su cuenta tiene que seguir diciendole QUE corregir.
    mockSignUp.mockResolvedValue({ error: new Error("INVALID_PASSWORD") });

    registrarse();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("auth.validation.passwordMinSignup");
    });
    expect(toast.error).not.toHaveBeenCalledWith("auth.signupFailed");
  });
});
