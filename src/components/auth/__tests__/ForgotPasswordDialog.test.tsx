import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ForgotPasswordDialog } from "../ForgotPasswordDialog";

const mockResetPasswordForEmail = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    resetPasswordForEmail: mockResetPasswordForEmail,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// sonner is globally mocked in src/test/setup.ts

describe("ForgotPasswordDialog (bug 0511-107)", () => {
  const mockOuterSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());

  const renderWithOuterForm = (allowedDomain = "ruizmier.com") =>
    render(
      <form onSubmit={mockOuterSubmit}>
        <ForgotPasswordDialog allowedDomain={allowedDomain}>
          <button type="button">Open</button>
        </ForgotPasswordDialog>
      </form>
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("FP-1: opens dialog when trigger is clicked", async () => {
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    expect(screen.getByLabelText("auth.email")).toBeInTheDocument();
  });

  it("FP-2: valid email submission shows the success state and hides the form", async () => {
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "john@ruizmier.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("auth.checkYourEmail")).toBeInTheDocument()
    );
    expect(screen.queryByLabelText("auth.email")).not.toBeInTheDocument();
  });

  it("FP-3: (Regression 0511-107) dialog submission does NOT invoke the outer form's onSubmit", async () => {
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "john@ruizmier.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("auth.checkYourEmail")).toBeInTheDocument()
    );
    expect(mockOuterSubmit).not.toHaveBeenCalled();
  });

  it("FP-4: valid email submission does NOT call toast.error", async () => {
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "john@ruizmier.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("auth.checkYourEmail")).toBeInTheDocument()
    );
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("FP-5: empty email submission shows inline validation error, not a toast, and not the success state", async () => {
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    // Use fireEvent.submit to bypass native HTML5 email/required validation
    // so that Zod validation inside handleSubmit is exercised directly.
    const dialog = screen.getByRole("dialog");
    const innerForm = dialog.querySelector("form")!;
    fireEvent.submit(innerForm);
    await waitFor(() =>
      expect(screen.getByText("errors.invalidEmail")).toBeInTheDocument()
    );
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(screen.queryByText("auth.checkYourEmail")).not.toBeInTheDocument();
  });

  it("FP-6: closing the dialog resets its state", async () => {
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "john@ruizmier.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("auth.checkYourEmail")).toBeInTheDocument()
    );
    await user.click(screen.getByText("common.close"));
    await user.click(screen.getByText("Open"));
    const emailInput = screen.getByLabelText("auth.email");
    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveValue("");
    expect(screen.queryByText("auth.checkYourEmail")).not.toBeInTheDocument();
  });

  it("FP-7: success state is uniform regardless of whether the email exists (anti-enumeration)", async () => {
    // After dropping the staff pre-check, the dialog calls Supabase directly
    // and always shows the success state. This prevents the dialog from
    // revealing whether a given email is registered (CWE-204) and unblocks
    // recovery for bootstrap admins who don't have a staff row yet.
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "any.email@ruizmier.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("auth.checkYourEmail")).toBeInTheDocument()
    );
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("any.email@ruizmier.com");
  });

  it("FP-8: Supabase reset failure is logged but the success state is still shown (anti-enumeration)", async () => {
    // Even if Supabase returns an error (rate limit, unknown email, etc.) the
    // UI must not reveal it — the toast/inline error stays empty and the
    // success state is shown. The error is only logged for monitoring.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockResetPasswordForEmail.mockResolvedValue({ error: new Error("Rate limit") });
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "unknown@ruizmier.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("auth.checkYourEmail")).toBeInTheDocument()
    );
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("FP-9: external email (non-@ruizmier.com) is rejected before reaching Supabase", async () => {
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "user@gmail.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("errors.onlyRuizmierEmail")).toBeInTheDocument()
    );
    expect(screen.queryByText("auth.checkYourEmail")).not.toBeInTheDocument();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });
});
