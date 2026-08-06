import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { UserRolesManager } from "../UserRolesManager";

// ---------------------------------------------------------------------------
// Hoisted mock handles — must be hoisted so the vi.mock factory can capture them
// ---------------------------------------------------------------------------
const { mockUseAllUserRoles, mockUpdateRoleKey, CATALOG_ROLE_KEYS } = vi.hoisted(() => ({
  mockUseAllUserRoles: vi.fn(),
  mockUpdateRoleKey: vi.fn(),
  // Los 23 roles de authorization_roles (Fase 1 seed), en display_order.
  CATALOG_ROLE_KEYS: [
    "admin", "it_security_manager", "senior_partner", "partner", "sqr",
    "director", "manager", "senior", "semisenior", "assistant",
    "ita_manager", "ita_senior", "ita_assistant",
    "tax_manager", "tax_senior", "tax_assistant",
    "accounting_manager", "accounting_analyst", "collections_analyst",
    "risk_partner", "risk_supervisor", "hr_manager", "hr_analyst",
  ],
}));

vi.mock("@/hooks/useUserRoles", () => ({
  useAllUserRoles: () => mockUseAllUserRoles(),
  useUpdateUserRoleKey: () => ({ mutate: mockUpdateRoleKey, isPending: false }),
  useDeleteAuthUser: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useAuthorizationRoles", () => ({
  useAuthorizationRoles: () => ({
    data: CATALOG_ROLE_KEYS.map((role_key, i) => ({
      role_key,
      label_key: `authz.role.${role_key}`,
      description: null,
      is_system: role_key === "admin",
      display_order: i,
    })),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "self-user-id" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return {
    ...actual,
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [k: string]: unknown }) =>
      React.createElement("a", { href: String(to), ...props }, children),
  };
});

// Radix Popover relies on floating-ui positioning which needs real browser geometry.
// Render PopoverContent unconditionally so filter Select is always in the DOM.
vi.mock("@/components/ui/popover", async () => {
  const R = await import("react");
  return {
    Popover: ({ children }: { children: R.ReactNode }) =>
      R.createElement(R.Fragment, null, children),
    PopoverTrigger: ({ children, asChild }: { children: R.ReactNode; asChild?: boolean }) =>
      asChild ? (children as R.ReactElement) : R.createElement("button", null, children),
    PopoverContent: ({ children, className }: { children: R.ReactNode; className?: string }) =>
      R.createElement("div", { "data-testid": "popover-content", className }, children),
  };
});

// Radix Select v2 calls hasPointerCapture / setPointerCapture which JSDOM lacks.
// Replace with native <select>/<option> so filter interactions work without patching JSDOM.
vi.mock("@/components/ui/select", async () => {
  const R = await import("react");
  return {
    Select: ({ children, value, onValueChange, disabled }: {
      children: R.ReactNode; value?: string; onValueChange?: (v: string) => void; disabled?: boolean;
    }) =>
      R.createElement(
        "select",
        {
          role: "combobox",
          value: value ?? "",
          disabled,
          onChange: (e: R.ChangeEvent<HTMLSelectElement>) => onValueChange?.(e.target.value),
        },
        children
      ),
    SelectTrigger: ({ children }: { children: R.ReactNode }) => children,
    SelectValue: ({ children }: { children?: R.ReactNode }) => children ?? null,
    SelectContent: ({ children }: { children: R.ReactNode }) => children,
    SelectItem: ({ value, children }: { value: string; children: R.ReactNode }) =>
      R.createElement("option", { value }, children),
    SelectGroup: ({ children }: { children: R.ReactNode }) => children,
    SelectLabel: ({ children }: { children: R.ReactNode }) => children,
  };
});

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------
interface MockRow {
  role_id: string;
  user_id: string;
  email: string;
  /** Enum legacy (espejo). */
  role: string;
  /** Autoridad del motor: es lo que la tabla muestra, ordena y filtra. */
  role_key: string | null;
  staff_name: string | null;
  created_at: string;
}

const makeRow = (i: number, overrides: Partial<MockRow> = {}): MockRow => ({
  role_id: `role-${i}`,
  user_id: `user-${i}`,
  email: `user${i}@example.com`,
  role: "staff",
  role_key: "assistant",
  staff_name: `Staff Member ${i}`,
  created_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

const baseRows: MockRow[] = [
  makeRow(1, { email: "susy@example.com", staff_name: "Susy Test", role: "admin", role_key: "admin" }),
  makeRow(2, { email: "bob@example.com", staff_name: "Bob Smith", role: "staff", role_key: "assistant" }),
  // `viewer` no está en el catálogo: ejercita el fallback de label al enum legacy.
  makeRow(3, { email: "orphan@example.com", staff_name: null, role: "viewer", role_key: "viewer" }),
  makeRow(4, { user_id: "self-user-id", email: "self@example.com", staff_name: "Current User", role: "admin", role_key: "admin" }),
];

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe("UserRolesManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAllUserRoles.mockReturnValue({ data: baseRows, isLoading: false });
  });

  // UR1 -----------------------------------------------------------------------
  it("UR1: renders a search input above the table", () => {
    render(<UserRolesManager />);
    expect(screen.getByPlaceholderText("common.search")).toBeInTheDocument();
  });

  // UR2 -----------------------------------------------------------------------
  it("UR2: typing part of a known email filters visible rows to only the matching row", async () => {
    const user = userEvent.setup();
    render(<UserRolesManager />);

    // All rows visible before typing
    expect(screen.getByText("susy@example.com")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("common.search"), "susy");

    expect(screen.getByText("susy@example.com")).toBeInTheDocument();
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
  });

  it("UR2b: typing part of a staff member name filters visible rows to only the matching row", async () => {
    const user = userEvent.setup();
    render(<UserRolesManager />);

    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("susy@example.com")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("common.search"), "Bob");

    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.queryByText("susy@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("orphan@example.com")).not.toBeInTheDocument();
  });

  // UR3 -----------------------------------------------------------------------
  it("UR3: clearing the search input restores all rows", async () => {
    const user = userEvent.setup();
    render(<UserRolesManager />);

    await user.type(screen.getByPlaceholderText("common.search"), "susy");
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText("common.search"));

    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("orphan@example.com")).toBeInTheDocument();
  });

  // UR4 -----------------------------------------------------------------------
  it("UR4: clicking role column sort once renders rows sorted ascending by role_key string", async () => {
    const user = userEvent.setup();
    render(<UserRolesManager />);

    // The role column header contains a sortable span with the role label text
    const roleLabel = screen.getByText("userRoles.currentRole");
    await user.click(roleLabel);

    // After ascending sort: admin < assistant < viewer (alphabetical role_key)
    const dataRows = screen
      .getAllByRole("row")
      .filter((row) => row.querySelectorAll("td").length > 0);

    const emailAt = (idx: number) =>
      dataRows[idx].querySelectorAll("td")[0].textContent?.trim() ?? "";

    const adminEmails = ["susy@example.com", "self@example.com"];
    expect(adminEmails).toContain(emailAt(0)); // first row is admin
    expect(emailAt(dataRows.length - 1)).toBe("orphan@example.com"); // last row is viewer
  });

  // UR5 -----------------------------------------------------------------------
  it("UR5: role filter popover lists every catalog role; selecting one leaves only rows with that role", () => {
    render(<UserRolesManager />);

    // The filter Select is inside the always-visible PopoverContent mock.
    // Scope to data-testid to avoid ambiguity with change_role column Selects.
    const filterSelect = within(screen.getByTestId("popover-content")).getByRole("combobox");

    // 23 catalog roles + 1 "all" option
    const options = within(filterSelect).getAllByRole("option");
    expect(options.length).toBe(CATALOG_ROLE_KEYS.length + 1);

    // Select "admin" — triggers onValueChange which updates DataTable filterValues
    fireEvent.change(filterSelect, { target: { value: "admin" } });

    // Only admin rows should remain visible
    expect(screen.getByText("susy@example.com")).toBeInTheDocument();
    expect(screen.getByText("self@example.com")).toBeInTheDocument();
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("orphan@example.com")).not.toBeInTheDocument();
  });

  // UR6 -----------------------------------------------------------------------
  it("UR6: clearing the role filter restores all rows", async () => {
    const user = userEvent.setup();
    render(<UserRolesManager />);

    // Apply the admin filter
    const filterSelect = within(screen.getByTestId("popover-content")).getByRole("combobox");
    fireEvent.change(filterSelect, { target: { value: "admin" } });
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();

    // "common.clear" button appears when filterActive=true; clicking it resets the filter
    await user.click(within(screen.getByTestId("popover-content")).getByText("common.clear"));

    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.getByText("orphan@example.com")).toBeInTheDocument();
  });

  // UR7 -----------------------------------------------------------------------
  it("UR7: when dataset has > 20 rows, next-page navigation hides page-1 rows and shows the page-2 row", async () => {
    const user = userEvent.setup();
    const manyRows = Array.from({ length: 21 }, (_, i) => makeRow(i + 10));
    mockUseAllUserRoles.mockReturnValue({ data: manyRows, isLoading: false });
    render(<UserRolesManager />);

    // Page counter and showing-text render
    expect(screen.getByText("common.page")).toBeInTheDocument();
    expect(screen.getByText("common.showing")).toBeInTheDocument();
    expect(screen.getByText("user10@example.com")).toBeInTheDocument();
    expect(screen.getByText("user29@example.com")).toBeInTheDocument();
    expect(screen.queryByText("user30@example.com")).not.toBeInTheDocument();

    // With 21 rows and default rowsPerPage=20 → totalPages=2 → next button enabled
    const allButtons = screen.getAllByRole("button") as HTMLButtonElement[];
    const previousPageButton = allButtons[allButtons.length - 2];
    const nextPageButton = allButtons[allButtons.length - 1];

    expect(previousPageButton).toBeDisabled();
    expect(nextPageButton).toBeEnabled();

    await user.click(nextPageButton);

    expect(screen.queryByText("user10@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("user29@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("user30@example.com")).toBeInTheDocument();
    expect(previousPageButton).toBeEnabled();
    expect(nextPageButton).toBeDisabled();
  });

  // UR8 -----------------------------------------------------------------------
  it("UR8: orphan rows render an AlertTriangle icon in the staff name cell", () => {
    render(<UserRolesManager />);
    expect(screen.getByText("userRoles.orphan")).toBeInTheDocument();
  });

  // UR9 -----------------------------------------------------------------------
  it("UR9: self row shows cannotChangeSelf text instead of a <Select>", () => {
    render(<UserRolesManager />);
    expect(screen.getByText("userRoles.cannotChangeSelf")).toBeInTheDocument();
    // Self row email is still visible
    expect(screen.getByText("self@example.com")).toBeInTheDocument();
  });

  // UR10 ----------------------------------------------------------------------
  it("UR10: loading state renders skeleton elements and no data rows", () => {
    mockUseAllUserRoles.mockReturnValue({ data: undefined, isLoading: true });
    render(<UserRolesManager />);

    // No data row emails should be visible
    expect(screen.queryByText("susy@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();

    // DataTable renders 5 skeleton rows in desktop mode when isLoading=true
    const skeletons = document.querySelectorAll("[class*='animate-pulse']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // UR11 ----------------------------------------------------------------------
  it("UR11: the change-role select offers the specialized catalog roles absent from the legacy enum", () => {
    render(<UserRolesManager />);

    // Any non-self row's change_role select (skip the filter select in the popover)
    const selects = screen
      .getAllByRole("combobox")
      .filter((el) => !screen.getByTestId("popover-content").contains(el));
    const values = within(selects[0])
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);

    // These 4 have no app_role counterpart, so the old hardcoded list could not show them
    expect(values).toContain("ita_manager");
    expect(values).toContain("collections_analyst");
    expect(values).toContain("hr_analyst");
    expect(values).toContain("senior_partner");
    expect(values).toHaveLength(CATALOG_ROLE_KEYS.length);
  });

  // UR12 ----------------------------------------------------------------------
  it("UR12: selecting a specialized role calls the mutation with that role_key", () => {
    render(<UserRolesManager />);

    const selects = screen
      .getAllByRole("combobox")
      .filter((el) => !screen.getByTestId("popover-content").contains(el));

    fireEvent.change(selects[0], { target: { value: "tax_manager" } });

    expect(mockUpdateRoleKey).toHaveBeenCalledTimes(1);
    expect(mockUpdateRoleKey).toHaveBeenCalledWith({
      userId: expect.any(String),
      newRoleKey: "tax_manager",
    });
  });

  // UR13 ----------------------------------------------------------------------
  it("UR13: a user without role_key renders the no-role label instead of a blank badge", () => {
    mockUseAllUserRoles.mockReturnValue({
      data: [makeRow(9, { email: "norole@example.com", role_key: null })],
      isLoading: false,
    });
    render(<UserRolesManager />);

    expect(screen.getByText("norole@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("userRoles.noRoleAssigned").length).toBeGreaterThan(0);
  });
});
