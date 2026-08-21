import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Stubs ─────────────────────────────────────────────────────────────────────

const EXPENSE_FLIGHTS = "exp-type-flights";
const EXPENSE_HOTEL = "exp-type-hotel";
const EXPENSE_MEALS = "exp-type-meals";

const expenseTypes = [
  { expense_type_id: EXPENSE_FLIGHTS, expense_name: "Pasajes Aéreos", default_unit_cost: 0 },
  { expense_type_id: EXPENSE_HOTEL, expense_name: "Hotel", default_unit_cost: 0 },
  { expense_type_id: EXPENSE_MEALS, expense_name: "Viáticos", default_unit_cost: 0 },
];

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [] }),
  useExpenseTypes: () => ({ data: expenseTypes }),
  useSetting: () => null,
}));

vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ currentLanguage: "es" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { language: "es" },
  }),
}));

// Radix Select requires PointerEvent APIs not available in jsdom — replace with
// native elements so JSDOM can render/inspect without polyfills.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange, disabled }: {
    children?: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  }) => (
    <select value={value} onChange={(event) => onValueChange?.(event.target.value)} disabled={disabled}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children, disabled }: { value: string; children?: React.ReactNode; disabled?: boolean }) => (
    <option value={value} disabled={disabled}>{children}</option>
  ),
  SelectGroup: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectLabel: () => null,
  SelectScrollUpButton: () => null,
  SelectScrollDownButton: () => null,
  SelectSeparator: () => null,
}));

beforeAll(() => {
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  (globalThis as any).ResizeObserver = MockResizeObserver;
  (Element.prototype as any).scrollIntoView = vi.fn();
});

// ── Import under test (after all vi.mock hoists) ───────────────────────────────
import { WorkOrderForm } from "../WorkOrderForm";

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeQC = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

const baseProps = {
  currency: "BOB" as const,
  seasonMode: "High" as const,
  approvalStatus: "Draft" as const,
  adjustmentAmount: 0,
  taxRate: 0.13,
  budgetLines: [],
  expenseBudget: [],
  isNew: false,
  isDirty: false,
  onCurrencyChange: vi.fn(),
  onSeasonChange: vi.fn(),
  onAdjustmentChange: vi.fn(),
  onBudgetLinesChange: vi.fn(),
  onExpenseBudgetChange: vi.fn(),
  onSubmit: vi.fn(),
  isLocked: false,
  canApprove: false,
  isSubmitting: false,
};

function renderForm(overrides: Record<string, unknown> = {}) {
  const props = { ...baseProps, ...overrides } as Parameters<typeof WorkOrderForm>[0];
  return render(
    <QueryClientProvider client={makeQC()}>
      <WorkOrderForm {...props} />
    </QueryClientProvider>,
  );
}

describe("WorkOrderForm — Expense Budget type filtering (0722-165)", () => {
  it("EB1: a row keeps its own selected expense type in its own dropdown even when no other row shares it", () => {
    renderForm({
      expenseBudget: [
        { id: "e1", expense_type_id: EXPENSE_FLIGHTS, budgeted_amount: 100 },
      ],
    });
    const [select] = screen.getAllByRole("combobox");
    expect(within(select).getByText("Pasajes Aéreos")).toBeInTheDocument();
  });

  it("EB2: a row excludes expense types already selected by every other row", () => {
    renderForm({
      expenseBudget: [
        { id: "e1", expense_type_id: EXPENSE_FLIGHTS, budgeted_amount: 100 },
        { id: "e2", expense_type_id: EXPENSE_HOTEL, budgeted_amount: 50 },
        { id: "e3", expense_type_id: "", budgeted_amount: 0 },
      ],
    });
    const selects = screen.getAllByRole("combobox");
    const thirdRowSelect = selects[2];
    expect(within(thirdRowSelect).queryByText("Pasajes Aéreos")).not.toBeInTheDocument();
    expect(within(thirdRowSelect).queryByText("Hotel")).not.toBeInTheDocument();
    expect(within(thirdRowSelect).getByText("Viáticos")).toBeInTheDocument();
  });

  it("EB3: with multiple distinct selections, each row keeps its own value but does not see the others' values as options", () => {
    renderForm({
      expenseBudget: [
        { id: "e1", expense_type_id: EXPENSE_FLIGHTS, budgeted_amount: 100 },
        { id: "e2", expense_type_id: EXPENSE_HOTEL, budgeted_amount: 50 },
      ],
    });
    const [row1, row2] = screen.getAllByRole("combobox");

    expect(within(row1).getByText("Pasajes Aéreos")).toBeInTheDocument();
    expect(within(row1).queryByText("Hotel")).not.toBeInTheDocument();

    expect(within(row2).getByText("Hotel")).toBeInTheDocument();
    expect(within(row2).queryByText("Pasajes Aéreos")).not.toBeInTheDocument();
  });

  it("EB4: releasing a selection makes the type available again in a sibling row", () => {
    const ControlledForm = () => {
      const [expenseBudget, setExpenseBudget] = React.useState([
        { id: "e1", expense_type_id: EXPENSE_FLIGHTS, budgeted_amount: 100 },
        { id: "e2", expense_type_id: "", budgeted_amount: 0 },
      ]);
      return (
        <QueryClientProvider client={makeQC()}>
          <WorkOrderForm
            {...(baseProps as any)}
            expenseBudget={expenseBudget}
            onExpenseBudgetChange={setExpenseBudget}
          />
        </QueryClientProvider>
      );
    };
    const { rerender } = render(<ControlledForm />);
    const [, secondRowBefore] = screen.getAllByRole("combobox");
    expect(within(secondRowBefore).queryByText("Pasajes Aéreos")).not.toBeInTheDocument();

    // Simulate the first row's expense type being cleared/changed away from flights.
    rerender(
      <QueryClientProvider client={makeQC()}>
        <WorkOrderForm
          {...(baseProps as any)}
          expenseBudget={[
            { id: "e1", expense_type_id: EXPENSE_HOTEL, budgeted_amount: 100 },
            { id: "e2", expense_type_id: "", budgeted_amount: 0 },
          ]}
          onExpenseBudgetChange={vi.fn()}
        />
      </QueryClientProvider>,
    );
    const [, secondRowAfter] = screen.getAllByRole("combobox");
    expect(within(secondRowAfter).getByText("Pasajes Aéreos")).toBeInTheDocument();
  });
});
