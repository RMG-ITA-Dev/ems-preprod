import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

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

function renderAtAuth() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
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
});
