import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { StaffFull } from "@/hooks/useEmsData";

// ─── Hoisted spies ────────────────────────────────────────────────────────────
const updateMutateAsync = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ staff_id: "s-1" })
);

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({
    data: [
      {
        category_id: "cat-1",
        category_name: "Socio",
        service_id: "svc-1",
        rate_high_bob: 200,
        rate_low_bob: 150,
        rate_high_usd: 30,
        rate_low_usd: 25,
        display_order: 1,
        can_approve_wo: false,
        can_approve_timesheets: false,
        default_app_role: null,
      },
    ],
  }),
  useActiveSkills: () => ({ data: [] }),
  useSocieties: () => ({
    data: [{ society_id: "soc-1", name: "Ruizmier Pelaez S.R.L.", is_active: true, created_at: "2026-01-01" }],
  }),
  useServices: () => ({
    data: [
      { service_id: "svc-1", name: "Auditoría", code: 1, allows_rates_activities: true, is_active: true, created_at: "2026-01-01" },
    ],
  }),
}));

vi.mock("@/hooks/mutations", () => ({
  useCreateStaff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateStaff: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeleteStaff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteStaffCompetency: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useUserRoles", () => ({
  useUpdateUserRole: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// BUG 0601-132: StaffForm now calls useUserRole to gate the security section.
// Mock it here so the test doesn't need an AuthProvider wrapper.
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: false, isLoading: false }),
}));

// FASE 5: StaffForm deriva isAdmin y el botón eliminar de useAuthorization.
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => false, roleKey: "senior" }),
}));

// Replace Radix Select with native <select>/<option> so JSDOM can resolve values.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  }) => (
    <select
      value={value ?? ""}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children?: React.ReactNode;
  }) => <option value={value}>{children}</option>,
  SelectGroup: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectLabel: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
  SelectScrollUpButton: () => null,
  SelectScrollDownButton: () => null,
  SelectSeparator: () => null,
}));

// Replace Radix Switch with a native checkbox so JSDOM handles it without PointerEvent.
vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    disabled,
  }: {
    checked?: boolean;
    onCheckedChange?: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <input
      type="checkbox"
      checked={checked ?? false}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

// Simplify Radix Dialog to avoid portal/PointerEvent issues.
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open?: boolean;
    children?: React.ReactNode;
  }) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: { children?: React.ReactNode }) => (
    <div role="dialog">{children}</div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  DialogDescription: ({
    children,
    asChild,
  }: {
    children?: React.ReactNode;
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <p>{children}</p>),
  DialogFooter: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Simplify Radix AlertDialog to avoid portal issues; content is never shown in tests.
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  AlertDialogTrigger: ({
    children,
    asChild,
  }: {
    children?: React.ReactNode;
    asChild?: boolean;
  }) => (asChild ? <>{children}</> : <button type="button">{children}</button>),
  AlertDialogContent: () => null,
  AlertDialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children?: React.ReactNode }) => (
    <p>{children}</p>
  ),
  AlertDialogFooter: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

// ─── JSDOM polyfills ──────────────────────────────────────────────────────────

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockResizeObserver;
});

// ─── Per-test setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Mock supabase.from for the pre-save email / id_number duplicate checks
  // (both call: .from("staff").select(...).eq(...).is(...).neq(...).limit(1))
  const limitMock = vi.fn().mockResolvedValue({ data: [], error: null });
  const neqMock = vi.fn(() => ({ limit: limitMock }));
  const isMock = vi.fn(() => ({ neq: neqMock }));
  const eqMock = vi.fn(() => ({ is: isMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as any);
  vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any);
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseStaff: StaffFull = {
  staff_id: "ffe9692f-753a-47f2-9cd0-ee23e4739e2f",
  first_name: "Ana",
  last_name: "López",
  short_name: "A. López",
  initials: "AL",
  email: "ana@test.com",
  id_number: "12345",
  aud_reg_number: null,
  category_id: "cat-1",
  society_id: "soc-1",
  service_id: "svc-1",
  city: "La Paz",
  is_active: true,
  is_blocked: false,
  hire_date: "2020-01-01",
  termination_date: null,
  auth_user_id: null,
  staff_skills: [],
};

const makeQC = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Lazy import after mocks are registered.
const { StaffForm } = await import("../StaffForm");

const renderForm = (overrides: Partial<StaffFull> = {}) => {
  const staff = { ...baseStaff, ...overrides };
  return render(
    <QueryClientProvider client={makeQC()}>
      <StaffForm staff={staff} onSaveSuccess={vi.fn()} onCancel={vi.fn()} />
    </QueryClientProvider>
  );
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StaffForm termination_date (BUG 0508-104)", () => {
  it("TD-1: field is empty when staff has no exit date (null)", async () => {
    renderForm({ termination_date: null });

    const input = await waitFor(() =>
      screen.getByLabelText("staff.terminationDate") as HTMLInputElement
    );

    // After effects flush, the field must be empty — not today's ISO date.
    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("TD-2: field shows stored date and is NOT replaced by today's date", async () => {
    renderForm({ termination_date: "2026-04-30" });

    const input = await waitFor(() =>
      screen.getByLabelText("staff.terminationDate") as HTMLInputElement
    );

    await waitFor(() => {
      expect(input.value).toBe("2026-04-30");
    });
  });

  it("TD-3: submitting with an entered date calls mutation with that date (regression 0508-104)", async () => {
    const { container } = renderForm({ termination_date: null });

    // Wait for form initialization from the staff prop
    await waitFor(() => {
      const termInput = screen.getByLabelText(
        "staff.terminationDate"
      ) as HTMLInputElement;
      expect(termInput).toBeInTheDocument();
    });

    // Set termination_date to a new value
    const termInput = screen.getByLabelText(
      "staff.terminationDate"
    ) as HTMLInputElement;
    fireEvent.change(termInput, { target: { value: "2026-05-15" } });
    expect(termInput.value).toBe("2026-05-15");

    // Submit the form
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    // Assert mutation received the correct termination_date
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const callArg = updateMutateAsync.mock.calls[0][0] as {
      id: string;
      data: { termination_date: string | null };
    };
    expect(callArg.data.termination_date).toBe("2026-05-15");
  });

  it("TD-4: clearing the date and saving sends termination_date: null", async () => {
    const { container } = renderForm({ termination_date: "2026-04-30" });

    // Wait for form initialization — field should show the stored date
    await waitFor(() => {
      const termInput = screen.getByLabelText(
        "staff.terminationDate"
      ) as HTMLInputElement;
      expect(termInput.value).toBe("2026-04-30");
    });

    // Clear the date field
    const termInput = screen.getByLabelText(
      "staff.terminationDate"
    ) as HTMLInputElement;
    fireEvent.change(termInput, { target: { value: "" } });
    expect(termInput.value).toBe("");

    // Submit
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    // Assert mutation received null for termination_date
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const callArg = updateMutateAsync.mock.calls[0][0] as {
      id: string;
      data: { termination_date: string | null };
    };
    expect(callArg.data.termination_date).toBeNull();
  });

  it("TD-5: termination_date submission is correct when deactivating (regression 0508-104)", async () => {
    // This test covers the deactivation path where termination_date is required
    const { container } = renderForm({
      is_active: true,
      termination_date: null,
    });

    // Wait for form initialization
    await waitFor(() => {
      expect(screen.getByLabelText("staff.terminationDate")).toBeInTheDocument();
    });

    // Enter a termination date (typical deactivation flow)
    const termInput = screen.getByLabelText(
      "staff.terminationDate"
    ) as HTMLInputElement;
    fireEvent.change(termInput, { target: { value: "2026-05-31" } });
    expect(termInput.value).toBe("2026-05-31");

    // Submit the form
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    // Assert mutation was called with the termination_date
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const callArg = updateMutateAsync.mock.calls[0][0] as {
      id: string;
      data: { termination_date: string | null };
    };
    expect(callArg.data.termination_date).toBe("2026-05-31");
  });
});

describe("StaffForm reactivation guard (BUG 0511-109/110)", () => {
  it("RG-1: never-terminated inactive staff can be activated", async () => {
    const { container } = renderForm({
      is_active: false,
      termination_date: null,
    });

    // Wait for the form to hydrate from the staff prop.
    await waitFor(() => {
      expect(
        screen.getByLabelText("staff.terminationDate")
      ).toBeInTheDocument();
    });

    // The mocked Switch renders as the only checkbox in the form.
    const activeSwitch = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(activeSwitch).toBeInTheDocument();
    expect(activeSwitch.disabled).toBe(false);

    // The "no reingreso" copy must NOT appear for a never-terminated row.
    expect(screen.queryByText("errors.noReingreso")).not.toBeInTheDocument();

    // Toggle activation on.
    fireEvent.click(activeSwitch);
    expect(activeSwitch.checked).toBe(true);

    // Submit the form.
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    // Assert the update mutation receives is_active=true and termination_date=null.
    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const callArg = updateMutateAsync.mock.calls[0][0] as {
      id: string;
      data: { is_active: boolean; termination_date: string | null };
    };
    expect(callArg.data.is_active).toBe(true);
    expect(callArg.data.termination_date).toBeNull();
  });

  it("RG-2 (BUG 0526-123 rewrite): terminated inactive staff can be reactivated via confirmation dialog", async () => {
    const { container } = renderForm({
      is_active: false,
      termination_date: "2026-04-30",
    });

    // Wait for the form to hydrate; termination_date should show the stored value.
    await waitFor(() => {
      const termInput = screen.getByLabelText(
        "staff.terminationDate"
      ) as HTMLInputElement;
      expect(termInput.value).toBe("2026-04-30");
    });

    const activeSwitch = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(activeSwitch).toBeInTheDocument();
    // After 0526-123 the switch is editable regardless of termination_date.
    expect(activeSwitch.disabled).toBe(false);
    // The misleading legend is gone.
    expect(screen.queryByText("errors.noReingreso")).not.toBeInTheDocument();

    // OFF -> ON should NOT commit immediately. Instead it opens the dialog.
    fireEvent.click(activeSwitch);
    expect(screen.getByText("staff.reactivateTitle")).toBeInTheDocument();
    // The controlled checkbox stays unchecked while the dialog is open.
    expect(activeSwitch.checked).toBe(false);
  });

  it("RG-3 (BUG 0526-123): confirming reactivation preserves termination_date and commits is_active=true", async () => {
    const { container } = renderForm({
      is_active: false,
      termination_date: "2026-04-30",
    });

    await waitFor(() => {
      const termInput = screen.getByLabelText(
        "staff.terminationDate"
      ) as HTMLInputElement;
      expect(termInput.value).toBe("2026-04-30");
    });

    const activeSwitch = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;

    // Open the dialog.
    fireEvent.click(activeSwitch);
    expect(screen.getByText("staff.reactivateTitle")).toBeInTheDocument();

    // Confirm reactivation — scope to the dialog to avoid matching the form footer.
    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByText("staff.reactivateConfirm");
    fireEvent.click(confirmBtn);

    // Dialog closes; the switch reflects the new value.
    await waitFor(() => {
      expect(screen.queryByText("staff.reactivateTitle")).not.toBeInTheDocument();
    });
    expect(activeSwitch.checked).toBe(true);

    // Submit; mutation receives is_active=true and termination_date preserved.
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const callArg = updateMutateAsync.mock.calls[0][0] as {
      id: string;
      data: { is_active: boolean; termination_date: string | null };
    };
    expect(callArg.data.is_active).toBe(true);
    expect(callArg.data.termination_date).toBe("2026-04-30");
  });

  it("RG-5 (BUG 0526-123): clearing the date and then activating still opens the dialog and restores the date on confirm", async () => {
    const { container } = renderForm({
      is_active: false,
      termination_date: "2026-04-30",
    });

    // Wait for hydration.
    await waitFor(() => {
      const termInput = screen.getByLabelText(
        "staff.terminationDate"
      ) as HTMLInputElement;
      expect(termInput.value).toBe("2026-04-30");
    });

    // Admin clears the termination_date input — this is the bypass attempt.
    const termInput = screen.getByLabelText(
      "staff.terminationDate"
    ) as HTMLInputElement;
    fireEvent.change(termInput, { target: { value: "" } });
    expect(termInput.value).toBe("");

    // Toggle the switch ON. Detection should use the SAVED staff prop, not
    // the live form value, so the dialog must still open.
    const activeSwitch = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    fireEvent.click(activeSwitch);
    expect(screen.getByText("staff.reactivateTitle")).toBeInTheDocument();

    // Confirm. The handler should restore the original termination_date so
    // the DB guard (TERMINATION_DATE_IMMUTABLE during reactivation) does not
    // reject the save.
    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByText("staff.reactivateConfirm");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText("staff.reactivateTitle")).not.toBeInTheDocument();
    });
    expect(activeSwitch.checked).toBe(true);

    // The date input should now show the restored value.
    await waitFor(() => {
      expect(
        (screen.getByLabelText("staff.terminationDate") as HTMLInputElement).value
      ).toBe("2026-04-30");
    });

    // Submit; mutation receives both is_active=true and the preserved date.
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const callArg = updateMutateAsync.mock.calls[0][0] as {
      id: string;
      data: { is_active: boolean; termination_date: string | null };
    };
    expect(callArg.data.is_active).toBe(true);
    expect(callArg.data.termination_date).toBe("2026-04-30");
  });

  it("RG-6 (Codex P2): confirming reactivation respects a corrected non-empty termination_date", async () => {
    const { container } = renderForm({
      is_active: false,
      termination_date: "2026-04-30",
    });

    await waitFor(() => {
      const termInput = screen.getByLabelText(
        "staff.terminationDate"
      ) as HTMLInputElement;
      expect(termInput.value).toBe("2026-04-30");
    });

    // Admin corrects the date to a different non-empty value before activating.
    const termInput = screen.getByLabelText(
      "staff.terminationDate"
    ) as HTMLInputElement;
    fireEvent.change(termInput, { target: { value: "2026-05-15" } });
    expect(termInput.value).toBe("2026-05-15");

    const activeSwitch = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    fireEvent.click(activeSwitch);
    expect(screen.getByText("staff.reactivateTitle")).toBeInTheDocument();

    // Confirm — the corrected date must NOT be overwritten with the DB value.
    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByText("staff.reactivateConfirm");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText("staff.reactivateTitle")).not.toBeInTheDocument();
    });
    expect(activeSwitch.checked).toBe(true);

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    const callArg = updateMutateAsync.mock.calls[0][0] as {
      id: string;
      data: { is_active: boolean; termination_date: string | null };
    };
    expect(callArg.data.is_active).toBe(true);
    expect(callArg.data.termination_date).toBe("2026-05-15");
  });

  it("RG-4 (BUG 0526-123): cancelling the dialog leaves the switch OFF", async () => {
    const { container } = renderForm({
      is_active: false,
      termination_date: "2026-04-30",
    });

    await waitFor(() => {
      const termInput = screen.getByLabelText(
        "staff.terminationDate"
      ) as HTMLInputElement;
      expect(termInput.value).toBe("2026-04-30");
    });

    const activeSwitch = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;

    // Open the dialog.
    fireEvent.click(activeSwitch);
    expect(screen.getByText("staff.reactivateTitle")).toBeInTheDocument();

    // Cancel — scope to the dialog because "common.cancel" also appears in the form footer.
    const dialog = screen.getByRole("dialog");
    const cancelBtn = within(dialog).getByText("common.cancel");
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByText("staff.reactivateTitle")).not.toBeInTheDocument();
    });
    expect(activeSwitch.checked).toBe(false);
  });
});
