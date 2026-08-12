import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";

// BUG 0723-170: an already-authenticated user hitting /auth (manual navigation,
// refresh, or direct URL entry) must be redirected away instead of seeing the
// login form again. This exercises the guard added directly in Auth.tsx.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

const mockUseAuth = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: () => ({ data: [] }),
}));

vi.mock("@/components/auth/ForgotPasswordDialog", () => ({
  ForgotPasswordDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import Auth from "../Auth";

// Reports whatever state is currently attached to the active history entry, so
// tests can assert that the signing-out flag was consumed (review R3-01).
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="entry-state">{JSON.stringify(location.state ?? null)}</div>;
}

function renderAtAuth(state?: { signingOut?: boolean }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/auth", state }]}>
      <LocationProbe />
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/" element={<div>home-screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Auth — session redirect from /auth (0723-170)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticated user is redirected to / and never sees the form", () => {
    mockUseAuth.mockReturnValue({ signIn: vi.fn(), signUp: vi.fn(), user: { id: "u1" }, loading: false });

    const { container } = renderAtAuth();

    expect(screen.getByText("home-screen")).toBeInTheDocument();
    expect(container.querySelector("#email")).toBeNull();
  });

  it("shows a non-interactive loading state while session is initializing", () => {
    mockUseAuth.mockReturnValue({ signIn: vi.fn(), signUp: vi.fn(), user: null, loading: true });

    const { container } = renderAtAuth();

    expect(screen.queryByText("home-screen")).toBeNull();
    expect(container.querySelector("#email")).toBeNull();
  });

  it("unauthenticated, initialized user still sees the sign-in form", () => {
    mockUseAuth.mockReturnValue({ signIn: vi.fn(), signUp: vi.fn(), user: null, loading: false });

    const { container } = renderAtAuth();

    expect(container.querySelector("#email")).not.toBeNull();
    expect(screen.queryByText("home-screen")).toBeNull();
  });

  // Review R1-01: ProtectedRoute redirects rejected sessions (no staff record /
  // inactive staff) to /auth with `state.signingOut` while its signOut() is
  // still in flight, so `user` is still populated here. The guard must stand
  // down in that window — otherwise the two routes ping-pong, permanently if
  // the sign-out request fails.
  it("keeps a rejected session on the form while sign-out is still in flight", () => {
    mockUseAuth.mockReturnValue({ signIn: vi.fn(), signUp: vi.fn(), user: { id: "u1" }, loading: false });

    const { container } = renderAtAuth({ signingOut: true });

    expect(container.querySelector("#email")).not.toBeNull();
    expect(screen.queryByText("home-screen")).toBeNull();
  });

  // Review R3-01: the flag must not outlive the visit it was issued for. Left on
  // the history entry it would suppress the guard again on a later authenticated
  // return to that entry (Back after a successful re-login), re-exposing the
  // form. Once stripped, such a return is just the case covered by the first
  // test above — authenticated, no flag, redirected.
  it("consumes the signing-out flag so it cannot outlive the current visit", async () => {
    mockUseAuth.mockReturnValue({ signIn: vi.fn(), signUp: vi.fn(), user: { id: "u1" }, loading: false });

    const { container } = renderAtAuth({ signingOut: true });

    await waitFor(() => {
      expect(screen.getByTestId("entry-state").textContent).toBe("null");
    });
    // The escape hatch survives the cleanup: this visit still shows the form.
    expect(container.querySelector("#email")).not.toBeNull();
    expect(screen.queryByText("home-screen")).toBeNull();
  });
});
