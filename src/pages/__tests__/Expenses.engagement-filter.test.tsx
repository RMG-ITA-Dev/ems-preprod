import { describe, it, expect, vi } from "vitest";
import { render } from "@/test/utils";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Polyfill matchMedia for jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Polyfills required by Radix UI Select in jsdom
window.HTMLElement.prototype.hasPointerCapture = vi.fn();
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Avoid full layout rendering (sidebar, header, NavLink etc.)
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/expenses" }) };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, session: { user: { id: "user-1" } } }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: "staff-1" }, isLoading: false }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

// Controlled flag: set per test before rendering
let isMobileValue = false;
vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => isMobileValue,
}));

const EXPENSES = [
  {
    expense_log_id: "exp-1",
    date_incurred: "2024-01-10",
    amount: 100,
    currency: "BOB",
    engagement_id: "eng-1",
    expense_type_id: "type-1",
    description: "Office supplies",
    receipt_url: null,
    engagement: { engagement_id: "eng-1", engagement_name: "Audit ACME", engagement_code: "A001" },
    expense_type: { expense_type_id: "type-1", expense_name: "Materials" },
    created_by_staff: null,
  },
  {
    expense_log_id: "exp-2",
    date_incurred: "2024-01-11",
    amount: 200,
    currency: "BOB",
    engagement_id: "eng-2",
    expense_type_id: "type-1",
    description: "Travel costs",
    receipt_url: null,
    engagement: { engagement_id: "eng-2", engagement_name: "Tax Consulting", engagement_code: "T001" },
    expense_type: { expense_type_id: "type-1", expense_name: "Materials" },
    created_by_staff: null,
  },
];

vi.mock("@/hooks/useEmsData", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useAllExpenseLogs: () => ({ data: EXPENSES, isLoading: false }),
    useExpenseTypes: () => ({ data: [] }),
  };
});

// Lazy import after all mocks
import Expenses from "../Expenses";

describe("Expenses engagement filter (0319-90)", () => {
  it("EF1: engagement Select is directly visible in the toolbar without opening a popover", () => {
    isMobileValue = false;
    render(<Expenses />);
    // The trigger (role=combobox) must be present without any prior click
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toBeVisible();
  });

  it("EF2: selecting an engagement hides non-matching rows in desktop table view", async () => {
    isMobileValue = false;
    const user = userEvent.setup();
    render(<Expenses />);

    // Both engagements appear in the table before filtering
    expect(screen.getByText("Audit ACME")).toBeInTheDocument();
    expect(screen.getByText("Tax Consulting")).toBeInTheDocument();

    // Open the engagement Select and choose "Audit ACME"
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Audit ACME" }));

    // Only "Audit ACME" remains (appears in both trigger value and table row; Tax Consulting is gone)
    expect(screen.getAllByText("Audit ACME").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tax Consulting")).not.toBeInTheDocument();
  });

  it("EF3: selecting an engagement hides non-matching cards in mobile card view", async () => {
    isMobileValue = true;
    const user = userEvent.setup();
    render(<Expenses />);

    // Both engagement names appear as card headings before filtering
    expect(screen.getAllByText("Audit ACME").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tax Consulting").length).toBeGreaterThan(0);

    // Open the engagement Select and choose "Tax Consulting"
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Tax Consulting" }));

    // Only "Tax Consulting" card should remain
    expect(screen.getAllByText("Tax Consulting").length).toBeGreaterThan(0);
    expect(screen.queryByText("Audit ACME")).not.toBeInTheDocument();
  });
});
