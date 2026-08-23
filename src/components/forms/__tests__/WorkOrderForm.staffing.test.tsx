import React from "react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createEmptyRequirement,
  createEmptySkill,
  hydrateFromPersisted,
  type StaffingRequirementInput,
} from "@/lib/workOrderStaffing";

// ── Stubs ─────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useEmsData", () => ({
  useCategories: () => ({ data: [] }),
  useExpenseTypes: () => ({ data: [] }),
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

const CAT_AUDIT = "cat-audit";
const CAT_TAX = "cat-tax";
const SKILL_IFRS = "skill-ifrs";
const SKILL_TAX_LAW = "skill-tax-law";

const staffingCategories = [
  { category_id: CAT_AUDIT, category_name: "Auditor Senior", practica_id: "svc-audit", display_order: 1 },
  { category_id: CAT_TAX, category_name: "Tax Senior", practica_id: "svc-audit", display_order: 2 },
] as any;

const activeSkills = [
  { skill_id: SKILL_IFRS, name: "IFRS", category: "Technical" },
  { skill_id: SKILL_TAX_LAW, name: "Tax Law", category: "Technical" },
];

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

describe("WorkOrderForm — Staffing Requirements (Fase 4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("SF1: isNew renders the disabled 'available after create' card, with no editable controls", () => {
    renderForm({
      isNew: true,
      onStaffingRequirementsChange: vi.fn(),
      staffingRequirements: [],
      staffingCategories,
      activeSkills,
    });
    expect(screen.getByText("workOrders.staffingRequirements.title")).toBeInTheDocument();
    expect(screen.getByText("workOrders.staffingRequirements.availableAfterCreate")).toBeInTheDocument();
    expect(screen.queryByTestId("staffing-add-category")).not.toBeInTheDocument();
  });

  it("SF2: !isNew with no onStaffingRequirementsChange wired renders nothing for the section (e.g. a caller that never passes it)", () => {
    renderForm({ isNew: false });
    expect(screen.queryByText("workOrders.staffingRequirements.title")).not.toBeInTheDocument();
  });

  it("SF3: shows a loading state while staffingLoading", () => {
    renderForm({ onStaffingRequirementsChange: vi.fn(), staffingLoading: true });
    expect(screen.getByText("workOrders.staffingRequirements.loading")).toBeInTheDocument();
  });

  it("SF4: shows an error state on staffingError, without rendering the empty state or Add button", () => {
    renderForm({ onStaffingRequirementsChange: vi.fn(), staffingError: true });
    expect(screen.getByText("workOrders.staffingRequirements.errorLoading")).toBeInTheDocument();
    expect(screen.queryByTestId("staffing-add-category")).not.toBeInTheDocument();
  });

  it("SF5: shows the empty state when there are no requirements yet", () => {
    renderForm({ onStaffingRequirementsChange: vi.fn(), staffingRequirements: [], staffingCategories });
    expect(screen.getByText("workOrders.staffingRequirements.empty")).toBeInTheDocument();
  });

  it("SF6: shows the service-not-resolved banner when staffingServiceResolved is false", () => {
    renderForm({
      onStaffingRequirementsChange: vi.fn(),
      staffingServiceResolved: false,
      staffingCategories: [],
    });
    expect(screen.getByText("workOrders.staffingRequirements.serviceNotResolved")).toBeInTheDocument();
  });

  it("SF7: clicking 'Add Category' appends a new empty requirement", () => {
    const onChange = vi.fn();
    renderForm({ onStaffingRequirementsChange: onChange, staffingRequirements: [], staffingCategories });
    fireEvent.click(screen.getByTestId("staffing-add-category"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0] as [StaffingRequirementInput[]];
    expect(next).toHaveLength(1);
    expect(next[0].categoryId).toBeNull();
    expect(next[0].staffCount).toBe(1);
  });

  it("SF8: 'Add Category' is disabled once every scoped category is already used", () => {
    const used: StaffingRequirementInput[] = staffingCategories.map((c: { category_id: string }) => ({
      ...createEmptyRequirement(),
      categoryId: c.category_id,
    }));
    renderForm({ onStaffingRequirementsChange: vi.fn(), staffingRequirements: used, staffingCategories });
    expect(screen.getByTestId("staffing-add-category")).toBeDisabled();
  });

  it("SF9: excludes categories already used by OTHER rows from a row's own options, but keeps its own selection", () => {
    const reqs: StaffingRequirementInput[] = [
      { ...createEmptyRequirement(), clientKey: "r1", categoryId: CAT_AUDIT },
      { ...createEmptyRequirement(), clientKey: "r2", categoryId: null },
    ];
    renderForm({ onStaffingRequirementsChange: vi.fn(), staffingRequirements: reqs, staffingCategories });

    const row1 = screen.getByTestId("staffing-requirement-r1");
    // Row 1 keeps its own current selection (Auditor Senior) as an option.
    expect(within(row1).getByText("Auditor Senior")).toBeInTheDocument();

    const row2 = screen.getByTestId("staffing-requirement-r2");
    // Row 2 (unselected) must NOT offer the category already taken by row 1.
    expect(within(row2).queryByText("Auditor Senior")).not.toBeInTheDocument();
    expect(within(row2).getByText("Tax Senior")).toBeInTheDocument();
  });

  it("SF10: removing a category requirement calls onStaffingRequirementsChange without it", () => {
    const onChange = vi.fn();
    const reqs: StaffingRequirementInput[] = [{ ...createEmptyRequirement(), clientKey: "r1", categoryId: CAT_AUDIT }];
    renderForm({ onStaffingRequirementsChange: onChange, staffingRequirements: reqs, staffingCategories });
    fireEvent.click(screen.getByTestId("staffing-remove-requirement-r1"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("SF11: changing staff_count calls onStaffingRequirementsChange with the updated count", () => {
    const onChange = vi.fn();
    const reqs: StaffingRequirementInput[] = [{ ...createEmptyRequirement(), clientKey: "r1", categoryId: CAT_AUDIT, staffCount: 1 }];
    renderForm({ onStaffingRequirementsChange: onChange, staffingRequirements: reqs, staffingCategories });
    fireEvent.change(screen.getByTestId("staffing-count-r1"), { target: { value: "7" } });
    const [next] = onChange.mock.calls[0] as [StaffingRequirementInput[]];
    expect(next[0].staffCount).toBe(7);
  });

  it("SF11a: numeric input rejects decimals/overflow and normalizes non-positive values on blur", () => {
    const onChange = vi.fn();
    const initial: StaffingRequirementInput[] = [{ ...createEmptyRequirement(), clientKey: "r1", categoryId: CAT_AUDIT, staffCount: 1 }];
    const ControlledForm = () => {
      const [requirements, setRequirements] = React.useState(initial);
      return (
        <QueryClientProvider client={makeQC()}>
          <WorkOrderForm
            {...(baseProps as any)}
            staffingRequirements={requirements}
            staffingCategories={staffingCategories}
            onStaffingRequirementsChange={(next) => { setRequirements(next); onChange(next); }}
          />
        </QueryClientProvider>
      );
    };
    render(<ControlledForm />);
    const input = screen.getByTestId("staffing-count-r1");

    fireEvent.change(input, { target: { value: "1000" } });
    fireEvent.change(input, { target: { value: "2.5" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);
    expect((onChange.mock.calls.at(-1)?.[0] as StaffingRequirementInput[])[0].staffCount).toBe(1);
  });

  it("SF11b: category, skill and proficiency selections drive their controlled callbacks", () => {
    const onChange = vi.fn();
    const reqs: StaffingRequirementInput[] = [{
      ...createEmptyRequirement(),
      clientKey: "r1",
      skills: [{ ...createEmptySkill(), clientKey: "s1" }],
    }];
    renderForm({ onStaffingRequirementsChange: onChange, staffingRequirements: reqs, staffingCategories, activeSkills });

    const requirement = screen.getByTestId("staffing-requirement-r1");
    const selects = within(requirement).getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: CAT_AUDIT } });
    expect((onChange.mock.calls[0][0] as StaffingRequirementInput[])[0].categoryId).toBe(CAT_AUDIT);

    fireEvent.change(selects[1], { target: { value: SKILL_IFRS } });
    expect((onChange.mock.calls[1][0] as StaffingRequirementInput[])[0].skills[0].skillId).toBe(SKILL_IFRS);

    fireEvent.change(selects[2], { target: { value: "Advanced" } });
    expect((onChange.mock.calls[2][0] as StaffingRequirementInput[])[0].skills[0].minProficiencyLevel).toBe("Advanced");
  });

  it("SF12: adding a skill row appends an empty skill to that requirement only", () => {
    const onChange = vi.fn();
    const reqs: StaffingRequirementInput[] = [
      { ...createEmptyRequirement(), clientKey: "r1", categoryId: CAT_AUDIT, skills: [] },
      { ...createEmptyRequirement(), clientKey: "r2", categoryId: CAT_TAX, skills: [] },
    ];
    renderForm({ onStaffingRequirementsChange: onChange, staffingRequirements: reqs, staffingCategories, activeSkills });
    fireEvent.click(screen.getByTestId("staffing-add-skill-r1"));
    const [next] = onChange.mock.calls[0] as [StaffingRequirementInput[]];
    expect(next.find((r) => r.clientKey === "r1")?.skills).toHaveLength(1);
    expect(next.find((r) => r.clientKey === "r2")?.skills).toHaveLength(0);
  });

  it("SF13: removing a skill row calls onStaffingRequirementsChange without it", () => {
    const onChange = vi.fn();
    const skill = createEmptySkill();
    const reqs: StaffingRequirementInput[] = [
      { ...createEmptyRequirement(), clientKey: "r1", categoryId: CAT_AUDIT, skills: [skill] },
    ];
    renderForm({ onStaffingRequirementsChange: onChange, staffingRequirements: reqs, staffingCategories, activeSkills });
    fireEvent.click(screen.getByTestId(`staffing-remove-skill-${skill.clientKey}`));
    const [next] = onChange.mock.calls[0] as [StaffingRequirementInput[]];
    expect(next[0].skills).toEqual([]);
  });

  it("SF14: a persisted-but-now-inactive skill is shown with the inactive badge, and is not one of the selectable active options", () => {
    const [hydrated] = hydrateFromPersisted([
      {
        id: "req-1",
        category_id: CAT_AUDIT,
        staff_count: 2,
        requirement_skills: [
          { id: "rs-1", skill_id: "skill-retired", min_proficiency_level: "Advanced", skill: { name: "Retired Skill", is_active: false } },
        ],
      },
    ]);
    renderForm({
      onStaffingRequirementsChange: vi.fn(),
      staffingRequirements: [hydrated],
      staffingCategories,
      activeSkills, // does NOT include "skill-retired"
    });
    expect(screen.getByText("Retired Skill")).toBeInTheDocument();
    expect(screen.getByText("workOrders.staffingRequirements.inactiveSkillBadge")).toBeInTheDocument();
  });

  it("SF15: an active skill never shows the inactive badge", () => {
    const reqs: StaffingRequirementInput[] = [
      {
        ...createEmptyRequirement(),
        clientKey: "r1",
        categoryId: CAT_AUDIT,
        skills: [{ clientKey: "s1", persistedId: "s1", skillId: SKILL_IFRS, minProficiencyLevel: "Advanced", isActive: true, skillName: "IFRS" }],
      },
    ];
    renderForm({ onStaffingRequirementsChange: vi.fn(), staffingRequirements: reqs, staffingCategories, activeSkills });
    expect(screen.queryByText("workOrders.staffingRequirements.inactiveSkillBadge")).not.toBeInTheDocument();
  });

  it("SF15b: a skill already used by a sibling row is not offered again", () => {
    const reqs: StaffingRequirementInput[] = [{
      ...createEmptyRequirement(),
      clientKey: "r1",
      categoryId: CAT_AUDIT,
      skills: [
        { ...createEmptySkill(), clientKey: "s1", skillId: SKILL_IFRS, minProficiencyLevel: "Advanced" },
        { ...createEmptySkill(), clientKey: "s2" },
      ],
    }];
    renderForm({ onStaffingRequirementsChange: vi.fn(), staffingRequirements: reqs, staffingCategories, activeSkills });
    expect(within(screen.getByTestId("staffing-skill-s2")).queryByText("IFRS")).not.toBeInTheDocument();
  });

  it.each(["Pending_Approval", "Approved", "Rejected"] as const)("SF16: %s Work Orders show data but no editable staffing controls", (approvalStatus) => {
    const reqs: StaffingRequirementInput[] = [
      {
        ...createEmptyRequirement(),
        clientKey: "r1",
        categoryId: CAT_AUDIT,
        skills: [{ clientKey: "s1", persistedId: "s1", skillId: SKILL_IFRS, minProficiencyLevel: "Advanced", isActive: true, skillName: "IFRS" }],
      },
    ];
    renderForm({
      onStaffingRequirementsChange: vi.fn(),
      staffingRequirements: reqs,
      staffingCategories,
      activeSkills,
      approvalStatus,
      isLocked: true,
    });
    expect(screen.getByText("Auditor Senior")).toBeInTheDocument();
    expect(screen.queryByTestId("staffing-add-category")).not.toBeInTheDocument();
    expect(screen.queryByTestId("staffing-remove-requirement-r1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("staffing-add-skill-r1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("staffing-remove-skill-s1")).not.toBeInTheDocument();
  });

  it("SF16b: replacing an incompatible historical category refreshes metadata and clears its warning", () => {
    const initialRequirements: StaffingRequirementInput[] = [{
      ...createEmptyRequirement(),
      clientKey: "r1",
      categoryId: "cat-historical-tax",
      categoryName: "Tax histórico",
      categoryServiceId: "svc-tax",
    }];
    const ControlledForm = () => {
      const [requirements, setRequirements] = React.useState(initialRequirements);
      return (
        <QueryClientProvider client={makeQC()}>
          <WorkOrderForm
            {...(baseProps as any)}
            staffingRequirements={requirements}
            staffingCategories={[staffingCategories[0]]}
            staffingServiceId="svc-audit"
            onStaffingRequirementsChange={setRequirements}
          />
        </QueryClientProvider>
      );
    };
    render(<ControlledForm />);
    expect(screen.getByText("Tax histórico")).toBeInTheDocument();
    expect(screen.getByText("workOrders.staffingRequirements.historicalCategoryIncompatible")).toBeInTheDocument();

    fireEvent.change(within(screen.getByTestId("staffing-requirement-r1")).getByRole("combobox"), {
      target: { value: CAT_AUDIT },
    });

    expect(screen.queryByText("workOrders.staffingRequirements.historicalCategoryIncompatible")).not.toBeInTheDocument();
  });

  it("SF16c: a resolved service with no categories explains why adding is unavailable", () => {
    renderForm({ onStaffingRequirementsChange: vi.fn(), staffingRequirements: [], staffingCategories: [] });
    expect(screen.getByText("workOrders.staffingRequirements.noCategoriesForService")).toBeInTheDocument();
  });

  it("SF17: staffingFocusSignal scrolls the section into view (best-effort focus on validation error)", () => {
    const { rerender } = renderForm({ onStaffingRequirementsChange: vi.fn(), staffingFocusSignal: 0 });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    rerender(
      <QueryClientProvider client={makeQC()}>
        <WorkOrderForm {...(baseProps as any)} onStaffingRequirementsChange={vi.fn()} staffingFocusSignal={1} />
      </QueryClientProvider>,
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("SF18: the requirement row layout stacks on mobile and lays out inline from the md breakpoint up", () => {
    const reqs: StaffingRequirementInput[] = [{ ...createEmptyRequirement(), clientKey: "r1", categoryId: CAT_AUDIT }];
    renderForm({ onStaffingRequirementsChange: vi.fn(), staffingRequirements: reqs, staffingCategories });
    const row = screen.getByTestId("staffing-requirement-r1").querySelector(":scope > div");
    expect(row?.className).toContain("flex-col");
    expect(row?.className).toContain("md:flex-row");
  });
});
