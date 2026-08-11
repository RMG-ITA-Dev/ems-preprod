import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Fase 7 (plan v2 §C, "Tests to Add"). Same mock stack as
// Auth.toast-severity.test.tsx:14-44, but `t` interpolates `domain` so
// assertions can pin the exact param passed to auth.validation.emailDomainOnly.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.domain ? `${k}:${o.domain}` : k),
    i18n: { language: "es" },
  }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: mockSignUp }),
}));

let settingsData: Array<{ setting_key: string; setting_value: string }> = [];
vi.mock("@/hooks/useEmsData", () => ({
  useGlobalSettings: () => ({ data: settingsData }),
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

function renderAuth() {
  return render(
    <MemoryRouter>
      <Auth />
    </MemoryRouter>,
  );
}

function switchToSignup(container: HTMLElement) {
  // Two elements render the "auth.signUp" key in sign-in mode: the mode
  // toggle button and the "don't have an account?" link — the toggle is
  // the first one in document order.
  fireEvent.click(screen.getAllByText("auth.signUp")[0]);
  return container;
}

describe("Auth — schema messages resolve as i18n keys, never prose (Fase 7, plan v2 §C)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsData = [];
  });

  it("(1) invalid email on sign-in => toast.error with the validation.emailInvalid KEY", async () => {
    const { container } = renderAuth();
    fireEvent.change(container.querySelector("#email")!, { target: { value: "not-an-email" } });
    fireEvent.change(container.querySelector("#password")!, { target: { value: "password123" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("validation.emailInvalid"));
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("(2) too-short password on sign-in => toast.error with auth.validation.passwordMinSignin", async () => {
    const { container } = renderAuth();
    fireEvent.change(container.querySelector("#email")!, { target: { value: "user@example.com" } });
    fireEvent.change(container.querySelector("#password")!, { target: { value: "abc" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("auth.validation.passwordMinSignin"),
    );
  });

  it("(3) signup + configured domain + wrong domain => auth.validation.emailDomainOnly:ruizmier.com", async () => {
    settingsData = [{ setting_key: "ALLOWED_EMAIL_DOMAIN", setting_value: "ruizmier.com" }];
    const { container } = renderAuth();
    switchToSignup(container);

    fireEvent.change(container.querySelector("#firstName")!, { target: { value: "Ana" } });
    fireEvent.change(container.querySelector("#lastName")!, { target: { value: "Perez" } });
    fireEvent.change(container.querySelector("#email")!, { target: { value: "ana@gmail.com" } });
    fireEvent.change(container.querySelector("#password")!, { target: { value: "password123" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("auth.validation.emailDomainOnly:ruizmier.com"),
    );
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("(4) signup without a configured domain + malformed email => validation.emailInvalid, never prose", async () => {
    settingsData = [];
    const { container } = renderAuth();
    switchToSignup(container);

    fireEvent.change(container.querySelector("#firstName")!, { target: { value: "Ana" } });
    fireEvent.change(container.querySelector("#lastName")!, { target: { value: "Perez" } });
    fireEvent.change(container.querySelector("#email")!, { target: { value: "not-an-email" } });
    fireEvent.change(container.querySelector("#password")!, { target: { value: "password123" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("validation.emailInvalid"));
    const [message] = toast.error.mock.calls[0];
    expect(message).not.toMatch(/[a-z]{4,}\s[a-z]{4,}/i); // no multi-word prose slipped through
  });

  it("(5) firstName/lastName placeholders resolve through i18n keys", () => {
    const { container } = renderAuth();
    switchToSignup(container);
    expect(container.querySelector("#firstName")).toHaveAttribute("placeholder", "auth.firstNamePlaceholder");
    expect(container.querySelector("#lastName")).toHaveAttribute("placeholder", "auth.lastNamePlaceholder");
  });

  it("(6) brand tagline renders through the auth.brandTagline key", () => {
    const { container } = renderAuth();
    expect(container.textContent).toContain("auth.brandTagline");
  });
});
