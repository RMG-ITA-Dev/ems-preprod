import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

// Login con Microsoft (docs/plan-entra-id-consolidado.md, Entrega 1): /auth muestra el formulario
// de contraseña o solo el botón de Microsoft según AUTH_MODE, y /login-rm (forcePasswordLogin)
// muestra siempre el formulario.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

const mockSignInWithMicrosoft = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signUp: vi.fn(),
    signInWithMicrosoft: mockSignInWithMicrosoft,
    user: null,
    loading: false,
  }),
}));

const mockRefetch = vi.fn();
let settingsQuery: {
  data?: Array<{ setting_key: string; setting_value: string }>;
  isLoading?: boolean;
  isError?: boolean;
} = {};
vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: () => ({ ...settingsQuery, refetch: mockRefetch }),
}));

vi.mock("@/components/auth/ForgotPasswordDialog", () => ({
  ForgotPasswordDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import Auth from "../Auth";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search + location.hash}</div>;
}

const withMode = (value: string) => ({ data: [{ setting_key: "AUTH_MODE", setting_value: value }] });

function renderAuth(forcePasswordLogin = false) {
  return render(
    <MemoryRouter>
      <Auth forcePasswordLogin={forcePasswordLogin} />
    </MemoryRouter>,
  );
}

const passwordForm = (container: HTMLElement) => container.querySelector("#password");
const microsoftButton = () => screen.queryByRole("button", { name: /auth.signInWithCorporateEmail/ });

describe("Auth — AUTH_MODE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsQuery = {};
  });

  it("sin la clave AUTH_MODE muestra el formulario de siempre", () => {
    settingsQuery = { data: [] };
    const { container } = renderAuth();
    expect(passwordForm(container)).not.toBeNull();
    expect(microsoftButton()).toBeNull();
  });

  it("password: formulario, sin botón de Microsoft", () => {
    settingsQuery = withMode("password");
    const { container } = renderAuth();
    expect(passwordForm(container)).not.toBeNull();
    expect(screen.getAllByText("auth.signUp").length).toBeGreaterThan(0);
    expect(microsoftButton()).toBeNull();
  });

  it("entra: el subtítulo nombra el dominio corporativo y avisa que se abre Microsoft", () => {
    settingsQuery = {
      data: [
        { setting_key: "AUTH_MODE", setting_value: "entra" },
        { setting_key: "ALLOWED_EMAIL_DOMAIN", setting_value: "ruizmier.com" },
      ],
    };
    renderAuth();
    expect(screen.getByText("auth.corporateSignInWithDomainPrefix", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("@ruizmier.com")).toBeInTheDocument();
    expect(screen.getByText("auth.microsoftRedirectNotice")).toBeInTheDocument();
  });

  it("entra sin dominio configurado: subtítulo genérico", () => {
    settingsQuery = withMode("entra");
    renderAuth();
    expect(screen.getByText("auth.corporateSignInDescription")).toBeInTheDocument();
  });

  it("entra: solo el botón de Microsoft, sin contraseña ni registro", () => {
    settingsQuery = withMode("entra");
    const { container } = renderAuth();
    expect(microsoftButton()).not.toBeNull();
    expect(passwordForm(container)).toBeNull();
    expect(container.querySelector("#email")).toBeNull();
    expect(screen.queryByText("auth.signUp")).toBeNull();
  });

  it("entra + /login-rm: formulario de siempre, con registro", () => {
    settingsQuery = withMode("entra");
    const { container } = renderAuth(true);
    expect(passwordForm(container)).not.toBeNull();
    expect(screen.getAllByText("auth.signUp").length).toBeGreaterThan(0);
    expect(microsoftButton()).toBeNull();
  });

  it("valor inválido: aviso de configuración, nunca el formulario", () => {
    settingsQuery = withMode("both");
    const { container } = renderAuth();
    expect(screen.getByText("auth.invalidAuthModeTitle")).toBeInTheDocument();
    expect(passwordForm(container)).toBeNull();
    expect(microsoftButton()).toBeNull();
  });

  it("error al leer los ajustes: pantalla de reintento, nunca el formulario", () => {
    settingsQuery = { isError: true };
    const { container } = renderAuth();
    expect(screen.getByText("auth.settingsLoadFailedTitle")).toBeInTheDocument();
    expect(passwordForm(container)).toBeNull();
    fireEvent.click(screen.getByText("common.retry"));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("error al leer los ajustes en /login-rm: formulario igual", () => {
    settingsQuery = { isError: true };
    const { container } = renderAuth(true);
    expect(passwordForm(container)).not.toBeNull();
  });

  it("mientras cargan los ajustes no muestra ninguna de las dos pantallas", () => {
    settingsQuery = { isLoading: true };
    const { container } = renderAuth();
    expect(passwordForm(container)).toBeNull();
    expect(microsoftButton()).toBeNull();
  });

  it("el botón llama a signInWithMicrosoft", async () => {
    settingsQuery = withMode("entra");
    mockSignInWithMicrosoft.mockResolvedValue({ error: null });
    renderAuth();
    fireEvent.click(microsoftButton()!);
    await waitFor(() => expect(mockSignInWithMicrosoft).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("al volver de Microsoft cancelado avisa y limpia la URL", async () => {
    settingsQuery = withMode("entra");
    render(
      <MemoryRouter initialEntries={["/auth?error=access_denied&error_description=user%20cancelled"]}>
        <LocationProbe />
        <Auth />
      </MemoryRouter>,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("auth.microsoftSignInFailed", { id: "microsoft-sign-in-return" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/auth"));
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("cualquier error de regreso usa el mismo aviso, sin detalles de configuración", async () => {
    settingsQuery = withMode("entra");
    render(
      <MemoryRouter initialEntries={["/auth#error=server_error&error_description=AADSTS65001"]}>
        <Auth />
      </MemoryRouter>,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("auth.microsoftSignInFailed", { id: "microsoft-sign-in-return" }));
  });

  it.each([
    ["NO_STAFF_RECORD", "messages.noStaffRecord"],
    ["ACCOUNT_INACTIVE", "messages.accountInactive"],
  ])("sesión rechazada por ProtectedRoute (%s): avisa el motivo", async (reason, message) => {
    settingsQuery = withMode("entra");
    render(
      <MemoryRouter initialEntries={[{ pathname: "/auth", state: { signingOut: true, reason } }]}>
        <Auth />
      </MemoryRouter>,
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message, { id: "session-rejected" }));
  });

  it("si Microsoft no arranca, avisa y rehabilita el botón", async () => {
    settingsQuery = withMode("entra");
    mockSignInWithMicrosoft.mockResolvedValue({ error: new Error("provider is not enabled") });
    renderAuth();
    fireEvent.click(microsoftButton()!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("auth.microsoftSignInFailed"));
    expect(microsoftButton()).not.toBeDisabled();
  });
});
