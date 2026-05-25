import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ForgotPasswordDialog } from "../ForgotPasswordDialog";

const mockResetPasswordForEmail = vi.fn();
const mockCheckUserExists = vi.fn();

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    resetPasswordForEmail: mockResetPasswordForEmail,
    checkUserExists: mockCheckUserExists,
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
    mockCheckUserExists.mockResolvedValue({ exists: true, error: null });
  });

  it("FP-1: opens dialog when trigger is clicked", async () => {
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    expect(screen.getByLabelText("auth.email")).toBeInTheDocument();
  });

  it("FP-2: valid email submission shows the success state and hides the form", async () => {
    const user = userEvent.setup();
    mockCheckUserExists.mockResolvedValue({ exists: true, error: null });
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
    mockCheckUserExists.mockResolvedValue({ exists: true, error: null });
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
    mockCheckUserExists.mockResolvedValue({ exists: true, error: null });
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
    mockCheckUserExists.mockResolvedValue({ exists: true, error: null });
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

  it("FP-7: @ruizmier.com email with existing user shows success state", async () => {
    const user = userEvent.setup();
    mockCheckUserExists.mockResolvedValue({ exists: true, error: null });
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "john@ruizmier.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("auth.checkYourEmail")).toBeInTheDocument()
    );
    expect(mockCheckUserExists).toHaveBeenCalledWith("john@ruizmier.com");
  });

  it("FP-8: @ruizmier.com email with non-existing user shows error", async () => {
    const user = userEvent.setup();
    mockCheckUserExists.mockResolvedValue({ exists: false, error: null });
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "nonexistent@ruizmier.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("errors.userNotFound")).toBeInTheDocument()
    );
    expect(screen.queryByText("auth.checkYourEmail")).not.toBeInTheDocument();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("FP-9: @ruizmier.com email with check error shows error message", async () => {
    const user = userEvent.setup();
    mockCheckUserExists.mockResolvedValue({ exists: false, error: new Error("DB error") });
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "test@ruizmier.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("errors.checkUserError")).toBeInTheDocument()
    );
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("FP-10: external email (non-@ruizmier.com) is rejected", async () => {
    const user = userEvent.setup();
    renderWithOuterForm();
    await user.click(screen.getByText("Open"));
    await user.type(screen.getByLabelText("auth.email"), "user@gmail.com");
    await user.click(screen.getByText("auth.sendResetLink"));
    await waitFor(() =>
      expect(screen.getByText("errors.onlyRuizmierEmail")).toBeInTheDocument()
    );
    expect(screen.queryByText("auth.checkYourEmail")).not.toBeInTheDocument();
    expect(mockCheckUserExists).not.toHaveBeenCalled();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });
});
