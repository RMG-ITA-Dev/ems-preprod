import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PermissionRoute } from "../PermissionRoute";

// Reviews iteración 5 (P2): isError debe distinguirse de "no tiene el permiso" — can() es
// fail-closed en ambos casos (useAuthorization.ts), así que sin este chequeo un fallo transitorio
// de get_my_authorization_context() se veía igual que un 403 real, sin forma de reintentar.
const { mockUseAuthorization, mockRefetch } = vi.hoisted(() => ({
  mockUseAuthorization: vi.fn(),
  mockRefetch: vi.fn(),
}));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => mockUseAuthorization(),
}));

function renderRoute(redirectTo?: string) {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/protected"
          element={
            <PermissionRoute permission="client.read" redirectTo={redirectTo}>
              <div>Protected content</div>
            </PermissionRoute>
          }
        />
        <Route path="/fallback" element={<div>Fallback page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PermissionRoute", () => {
  it("shows a loading state while useAuthorization is loading", () => {
    mockUseAuthorization.mockReturnValue({
      can: () => false,
      isLoading: true,
      isError: false,
      refetch: mockRefetch,
    });
    renderRoute();
    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("shows a retry option on isError, distinct from a permission denial, and retries via refetch", async () => {
    mockRefetch.mockClear();
    mockUseAuthorization.mockReturnValue({
      can: () => false,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });
    renderRoute();
    expect(screen.getByText(/no se pudo verificar tus permisos/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin acceso/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows the 403 access-denied screen when resolved (not loading/error) and can() is false", () => {
    mockUseAuthorization.mockReturnValue({
      can: () => false,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    renderRoute();
    expect(screen.getByText(/sin acceso/i)).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("redirects instead of showing an inline 403 when redirectTo is set and denied", () => {
    mockUseAuthorization.mockReturnValue({
      can: () => false,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    renderRoute("/fallback");
    expect(screen.getByText("Fallback page")).toBeInTheDocument();
    expect(screen.queryByText(/sin acceso/i)).not.toBeInTheDocument();
  });

  it("renders children when resolved and can() is true", () => {
    mockUseAuthorization.mockReturnValue({
      can: () => true,
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    });
    renderRoute();
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
});
