// Component sanity suite: BenchTable navigation gating, aria labeling,
// the as-of-today caption, SkillShortageTable truncation footer, the md
// table-to-card rule and zero-decimal right-aligned numerics.
//
// Fase 3 (plan v2 §3, issue §11): BenchRow/CompetencyShortageRow ahora
// incluyen serviceId/serviceName/displayOrder (agrupación por servicio).

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BenchTable } from "../BenchTable";
import { gapLabel, type CategoryGapDatum } from "../gapChartLabel";
import { GapKpiStrip } from "../GapKpiStrip";
import { SkillShortageTable } from "../SkillShortageTable";
import type {
  BenchRow,
  CompetencyShortageRow,
} from "@/hooks/scheduler/schedulerGapsData";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<object>("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}|${opts.name}|${opts.allocation}` : key,
    i18n: { language: "en" },
  }),
}));

const STAFF_A = "33333333-3333-4333-8333-333333333333";

const benchRow = (overrides: Partial<BenchRow> = {}): BenchRow => ({
  staffId: STAFF_A,
  staffName: "Ana Alfa",
  serviceId: null,
  serviceName: null,
  categoryName: "Senior",
  currentAllocationPct: 37.5,
  topSkills: ["IFRS", "Tax"],
  ...overrides,
});

const shortageRow = (
  overrides: Partial<CompetencyShortageRow> = {}
): CompetencyShortageRow => ({
  categoryId: "11111111-1111-4111-8111-111111111111",
  categoryName: "Senior",
  serviceId: "44444444-4444-4444-8444-444444444444",
  serviceName: "Audit",
  displayOrder: 1,
  skillId: "22222222-2222-4222-8222-222222222222",
  skillName: "IFRS",
  minLevel: "Advanced",
  demandCount: 5,
  supplyCount: 2,
  deficit: 3,
  ...overrides,
});

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <TooltipProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </TooltipProvider>
  );
}

beforeEach(() => {
  navigateSpy.mockClear();
});

describe("BenchTable — admin navigation", () => {
  it("admin rows are keyboard-focusable, carry the benchRowAria label with interpolated datum, and navigate on click", () => {
    renderWithProviders(<BenchTable rows={[benchRow()]} canNavigate />);
    // The label lives on the focusable element itself; allocation is
    // interpolated ZERO-DECIMAL (37.5 → 38).
    const interactive = screen.getAllByLabelText(
      "scheduler.gaps.benchRowAria|Ana Alfa|38"
    );
    expect(interactive.length).toBeGreaterThan(0);
    const row = interactive[0];
    expect(row).toHaveAttribute("tabindex", "0");
    fireEvent.click(row);
    expect(navigateSpy).toHaveBeenCalledWith(`/staff/${STAFF_A}`);
    fireEvent.keyDown(row, { key: "Enter" });
    expect(navigateSpy).toHaveBeenCalledTimes(2);
  });

  it("partner/director rows expose NO navigation affordance — no handler, no cursor-pointer, no tab stop, no focus styling", () => {
    const { container } = renderWithProviders(
      <BenchTable rows={[benchRow()]} canNavigate={false} />
    );
    expect(
      screen.queryByLabelText("scheduler.gaps.benchRowAria|Ana Alfa|38")
    ).not.toBeInTheDocument();
    expect(container.querySelector('[tabindex="0"]')).toBeNull();
    expect(container.querySelector(".cursor-pointer")).toBeNull();
    expect(container.querySelector('[role="button"]')).toBeNull();
    expect(container.querySelector('[class*="focus-visible"]')).toBeNull();
    // Clicking a row navigates nowhere.
    fireEvent.click(screen.getAllByText("Ana Alfa")[0]);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("admin rows carry the token-based focus-visible ring on BOTH responsive variants (design-system focus rule)", () => {
    const { container } = renderWithProviders(
      <BenchTable rows={[benchRow()]} canNavigate />
    );
    const focusable = [...container.querySelectorAll('[tabindex="0"]')];
    expect(focusable.length).toBe(2); // desktop row + mobile card
    for (const el of focusable) {
      expect(el.className).toContain("focus-visible:outline-none");
      expect(el.className).toContain("focus-visible:ring-2");
      expect(el.className).toContain("focus-visible:ring-ring");
    }
  });

  it("renders the benchAsOfToday caption", () => {
    renderWithProviders(<BenchTable rows={[benchRow()]} canNavigate={false} />);
    expect(screen.getByText("scheduler.gaps.benchAsOfToday")).toBeInTheDocument();
  });

  it("renders table layout above md and card layout below it, with right-aligned zero-decimal numerics (37.5 → 38)", () => {
    const { container } = renderWithProviders(
      <BenchTable rows={[benchRow()]} canNavigate={false} />
    );
    const desktop = container.querySelector(".hidden.md\\:block");
    const mobile = container.querySelector(".md\\:hidden");
    expect(desktop).not.toBeNull();
    expect(mobile).not.toBeNull();
    expect(desktop!.querySelector("table")).not.toBeNull();
    expect(mobile!.querySelector("table")).toBeNull(); // cards, not a scrolled table
    const cell = desktop!.querySelector("td.text-right.font-mono");
    expect(cell).not.toBeNull();
    expect(cell!.textContent).toBe("38"); // zero decimals
  });
});

describe("GapKpiStrip — accessible basis tooltips", () => {
  it("the headcount and hours tooltips hang off REAL labeled buttons with a tab stop and the token focus ring", () => {
    renderWithProviders(
      <GapKpiStrip headcountGap={1.4} hoursGap={160} skillsUnderSupplied={3} benchCount={2} />
    );
    for (const label of [
      "scheduler.gaps.headcountBasisTooltip",
      "scheduler.gaps.hoursProjectionTooltip",
    ]) {
      const trigger = screen.getByLabelText(label);
      expect(trigger.tagName).toBe("BUTTON"); // native tab stop
      expect(trigger.className).toContain("focus-visible:ring-2");
      expect(trigger.className).toContain("focus-visible:ring-ring");
    }
  });

  it("KPI values render zero-decimal", () => {
    renderWithProviders(
      <GapKpiStrip headcountGap={1.4} hoursGap={160.6} skillsUnderSupplied={3} benchCount={2} />
    );
    expect(screen.getByText("1")).toBeInTheDocument(); // 1.4 → 1
    expect(screen.getByText("161")).toBeInTheDocument(); // 160.6 → 161
  });
});

describe("SkillShortageTable", () => {
  it("renders the truncation footer iff truncated", () => {
    const { rerender } = renderWithProviders(
      <SkillShortageTable rows={[shortageRow()]} truncated={false} />
    );
    expect(screen.queryByText("scheduler.gaps.truncated")).not.toBeInTheDocument();
    rerender(
      <TooltipProvider>
        <MemoryRouter>
          <SkillShortageTable rows={[shortageRow()]} truncated />
        </MemoryRouter>
      </TooltipProvider>
    );
    expect(screen.getByText("scheduler.gaps.truncated")).toBeInTheDocument();
  });

  it("renders both responsive layouts and keeps the server's total order on ties (client re-sort mirrors the server)", () => {
    // Same (category, skill, service), equal deficit, three thresholds —
    // the strictest threshold must sort first even when the input arrives
    // reversed.
    const rows = [
      shortageRow({ minLevel: "Beginner", demandCount: 3, supplyCount: 2, deficit: 1 }),
      shortageRow({ minLevel: "Intermediate", demandCount: 2, supplyCount: 1, deficit: 1 }),
      shortageRow({ minLevel: "Advanced", demandCount: 1, supplyCount: 0, deficit: 1 }),
    ];
    const { container } = renderWithProviders(
      <SkillShortageTable rows={rows} truncated={false} />
    );
    const desktop = container.querySelector(".hidden.md\\:block");
    const mobile = container.querySelector(".md\\:hidden");
    expect(desktop).not.toBeNull();
    expect(mobile).not.toBeNull();
    expect(mobile!.querySelector("table")).toBeNull();
    const levelCells = [...desktop!.querySelectorAll("tbody tr td:nth-child(3)")].map(
      (td) => td.textContent
    );
    expect(levelCells).toEqual([
      "staff.competencies.levels.advanced",
      "staff.competencies.levels.intermediate",
      "staff.competencies.levels.beginner",
    ]);
  });

  it("gapLabel keys the destructive accent off the ROUNDED gap: an FP-residue or sub-half gap never paints a red −0", () => {
    const datum = (gap: number): CategoryGapDatum[] => [
      { categoryId: "c", categoryName: "Senior", demand: 10, supply: 10, gap },
    ];
    const at = { x: 0, y: 0, width: 40, height: 12, index: 0 };
    // Real residue on a fully staffed category: must render NO accent.
    expect(gapLabel({ ...at, data: datum(2.842170943040401e-14) })).toBeNull();
    // A gap that would DISPLAY as 0 gets no accent either.
    expect(gapLabel({ ...at, data: datum(0.4) })).toBeNull();
    expect(gapLabel({ ...at, data: datum(0) })).toBeNull();
    expect(gapLabel({ ...at, data: datum(-3) })).toBeNull();
    // A real deficit renders the zero-decimal accent.
    const label = gapLabel({ ...at, data: datum(1.2) });
    expect(label).not.toBeNull();
    render(<svg>{label}</svg>);
    expect(screen.getByText("−1")).toBeInTheDocument();
  });

  it("numeric cells render right-aligned zero-decimal values", () => {
    const { container } = renderWithProviders(
      <SkillShortageTable
        rows={[shortageRow({ demandCount: 5, supplyCount: 2, deficit: 3 })]}
        truncated={false}
      />
    );
    const numeric = [...container.querySelectorAll("td.text-right.font-mono, td.text-right")]
      .map((td) => td.textContent)
      .filter((s) => s && /^\d+$/.test(s));
    expect(numeric).toEqual(expect.arrayContaining(["5", "2", "3"]));
  });
});
