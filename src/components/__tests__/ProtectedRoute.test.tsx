import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

// Las dos compuertas de ProtectedRoute (sin ficha, ficha inactiva) con una sesión de Microsoft:
// ese ingreso no pasa por signIn(), así que ProtectedRoute es quien la rechaza, y tiene que
// mandar el motivo a /auth para que la persona sepa qué pasó (docs/plan-entra-id-consolidado.md).

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

const mockSignOut = vi.fn();
const microsoftUser = { id: "u1", email: "ana@ruizmier.com", app_metadata: { provider: "azure" } };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: microsoftUser, loading: false, signOut: mockSignOut }),
}));

let staff: { is_active: boolean } | null = null;
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: staff, isLoading: false }),
}));

let admin = false;
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: admin, isLoading: false }),
}));

vi.mock("@/hooks/useInactivityTimeout", () => ({ useInactivityTimeout: () => {} }));
vi.mock("@/hooks/useEmsData", () => ({ useSetting: () => undefined }));

import { ProtectedRoute } from "../ProtectedRoute";

function AuthProbe() {
  const location = useLocation();
  return <div data-testid="auth-state">{JSON.stringify(location.state ?? null)}</div>;
}

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<ProtectedRoute><div>app</div></ProtectedRoute>} />
        <Route path="/auth" element={<AuthProbe />} />
        <Route path="/bootstrap" element={<div>bootstrap</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute — sesión de Microsoft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    staff = null;
    admin = false;
  });

  it("sin ficha: cierra sesión y manda a /auth con el motivo NO_STAFF_RECORD", async () => {
    renderProtected();
    expect(JSON.parse(screen.getByTestId("auth-state").textContent!)).toEqual({
      signingOut: true,
      reason: "NO_STAFF_RECORD",
    });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it("ficha inactiva: cierra sesión y manda a /auth con el motivo ACCOUNT_INACTIVE", async () => {
    staff = { is_active: false };
    renderProtected();
    expect(JSON.parse(screen.getByTestId("auth-state").textContent!)).toEqual({
      signingOut: true,
      reason: "ACCOUNT_INACTIVE",
    });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it("admin sin ficha: va a /bootstrap sin cerrar sesión", () => {
    admin = true;
    renderProtected();
    expect(screen.getByText("bootstrap")).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("ficha activa: entra a la app", () => {
    staff = { is_active: true };
    renderProtected();
    expect(screen.getByText("app")).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
