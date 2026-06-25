import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// BUG 0625-146: the /auth call sites must map login outcomes to the right toast
// severity — invalid credentials => warning (with the attempts counter), account
// lockout => error, successful login => success. The hook transport is covered in
// useAuth.test.tsx (AL-1..AL-4); this page-level test exercises the symptom from
// the JSON packet directly: which toast.* variant the Auth page actually calls.

// t returns the key verbatim (ignoring interpolation options) so assertions can
// match on the i18n key without depending on the translated string.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockSignIn = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: vi.fn() }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: () => ({ data: [] }),
}));

vi.mock("@/components/auth/ForgotPasswordDialog", () => ({
  ForgotPasswordDialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Hoisted so the vi.mock factory (lifted to the top of the file) can reference it.
const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

import Auth from "../Auth";

function renderAuth() {
  const utils = render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>
  );
  // Fill valid credentials so zod validation passes and signIn is reached.
  fireEvent.change(utils.container.querySelector("#email")!, {
    target: { value: "user@example.com" },
  });
  fireEvent.change(utils.container.querySelector("#password")!, {
    target: { value: "password123" },
  });
  const form = utils.container.querySelector("form")!;
  fireEvent.submit(form);
  return utils;
}

describe("Auth — toast severity per outcome (0625-146)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invalid credentials with remaining attempts => toast.warning with counter key", async () => {
    mockSignIn.mockResolvedValue({ error: new Error("INVALID_CREDENTIALS:3") });

    renderAuth();

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith("messages.invalidCredentialsWithAttempts");
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("invalid credentials fallback (no counter) => toast.warning", async () => {
    mockSignIn.mockResolvedValue({ error: new Error("Invalid login credentials") });

    renderAuth();

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith("messages.invalidCredentials");
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("account lockout => toast.error", async () => {
    mockSignIn.mockResolvedValue({ error: new Error("ACCOUNT_LOCKED:900") });

    renderAuth();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("messages.accountLocked");
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("successful login => toast.success and navigates home", async () => {
    mockSignIn.mockResolvedValue({ error: null });

    renderAuth();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("messages.welcomeBack");
    });
    expect(mockNavigate).toHaveBeenCalledWith("/");
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
