
# Plan v3 -- BUG: Dashboard Selected Tab Not Readable

## Context

The selected Dashboard tab is visually indistinguishable from unselected tabs because the active state uses `bg-card` which blends into the `bg-muted/50` container.

## Root Cause

In `src/pages/Index.tsx` line 48, the `TabsTrigger` className uses `data-[state=active]:bg-card` which overrides the base component's high-contrast `data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`.

## Scope

**In scope**: Dashboard tab active-state styling fix, render-based regression test, changelog.

**Out of scope**: Other tab groups, backend/DB changes.

## File-by-File Changes

### W1: `src/pages/Index.tsx` -- Fix active tab styling

Line 48: Replace low-contrast active override with high-contrast primary tokens.

Before:
```
"flex items-center gap-2 data-[state=active]:bg-card data-[state=active]:shadow-sm",
```

After:
```
"flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
```

No other changes.

### W2: `src/pages/__tests__/Index.dashboard-tabs.test.tsx` -- Render-based regression test

This test renders the actual `DashboardContent` component (mocking its dependencies) and asserts on the **rendered DOM element's class attribute**, not a hardcoded string.

```ts
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// Mock dependencies (following EngagementSelector.test.tsx pattern)
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/contexts/DashboardContext", () => ({
  DashboardProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDashboard: () => ({
    activeTab: "practica",
    setActiveTab: vi.fn(),
    period: { startDate: new Date(), endDate: new Date() },
    periodType: "tax_bolivia",
    selectedYear: 2026,
    selectedQuarter: "ytd",
    setYear: vi.fn(),
    setQuarter: vi.fn(),
    setCustomRange: vi.fn(),
    startDateStr: "2025-10-01",
    endDateStr: "2026-09-30",
    selectedEngagementId: null,
    setSelectedEngagementId: vi.fn(),
  }),
}));

vi.mock("@/hooks/useDashboardAccess", () => ({
  useDashboardAccess: () => ({
    allowedTabs: ["practica", "cartera", "encargo", "personal"],
    defaultTab: "practica",
    isPartner: true,
    isManager: false,
    isLoading: false,
  }),
}));

// Mock child components to avoid deep dependency chains
vi.mock("@/components/dashboard/PeriodSelector", () => ({
  PeriodSelector: () => <div data-testid="period-selector" />,
}));
vi.mock("@/components/dashboard/tabs", () => ({
  PracticaTab: () => <div data-testid="practica-tab" />,
  CarteraTab: () => <div data-testid="cartera-tab" />,
  EncargoTab: () => <div data-testid="encargo-tab" />,
  PersonalTab: () => <div data-testid="personal-tab" />,
}));
vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import Index from "../Index";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard tab active-state readability", () => {
  it("active tab element contains bg-primary class token", () => {
    render(<Index />, { wrapper: createWrapper() });
    // Radix sets data-state="active" on the selected trigger
    const activeTrigger = document.querySelector('[data-state="active"]');
    expect(activeTrigger).toBeTruthy();
    expect(activeTrigger!.className).toContain("data-[state=active]:bg-primary");
  });

  it("active tab element contains text-primary-foreground class token", () => {
    render(<Index />, { wrapper: createWrapper() });
    const activeTrigger = document.querySelector('[data-state="active"]');
    expect(activeTrigger).toBeTruthy();
    expect(activeTrigger!.className).toContain("data-[state=active]:text-primary-foreground");
  });

  it("active tab does NOT contain low-contrast bg-card override", () => {
    render(<Index />, { wrapper: createWrapper() });
    const activeTrigger = document.querySelector('[data-state="active"]');
    expect(activeTrigger).toBeTruthy();
    expect(activeTrigger!.className).not.toContain("data-[state=active]:bg-card");
  });

  it("renders all four tab triggers", () => {
    render(<Index />, { wrapper: createWrapper() });
    const triggers = document.querySelectorAll('[role="tab"]');
    expect(triggers.length).toBe(4);
  });

  it("inactive tabs do not have data-state=active", () => {
    render(<Index />, { wrapper: createWrapper() });
    const triggers = document.querySelectorAll('[role="tab"]');
    const inactiveTriggers = Array.from(triggers).filter(
      (el) => el.getAttribute("data-state") !== "active"
    );
    expect(inactiveTriggers.length).toBe(3);
  });
});
```

Key difference from v2: This test **renders the actual `Index` component** and queries the **real DOM element's className**, so any regression in the source will fail the test.

### W3: `docs/CHANGELOG-2026-02-24.md` -- Append entry

```markdown
## BUG: Dashboard Selected Tab Not Readable

**Root cause**: Page-level `TabsTrigger` className in `src/pages/Index.tsx` overrode the base active-state with `data-[state=active]:bg-card`, which blends into the `bg-muted/50` TabsList container.

**Fix**: Replaced with `data-[state=active]:bg-primary data-[state=active]:text-primary-foreground` for high-contrast active state.

**Test**: Render-based regression test (`src/pages/__tests__/Index.dashboard-tabs.test.tsx`) asserts on the actual rendered DOM element's class attribute.

**Files changed**: `src/pages/Index.tsx` (1 line).
```

## Acceptance Criteria

1. Selected Dashboard tab displays teal background with white text.
2. Unselected tabs remain visually muted.
3. Icons inherit active foreground color via `currentColor`.
4. Readable in both light and dark modes.
5. On mobile (labels hidden), active tab still distinct via background color.
6. Render-based regression test passes (5 assertions against actual DOM).

## Test Plan

### Automated
- `src/pages/__tests__/Index.dashboard-tabs.test.tsx`: Renders `Index`, queries real DOM elements, asserts active tab has `bg-primary` + `text-primary-foreground`, does NOT have `bg-card`, and all 4 triggers render.

### Manual
1. Open Dashboard, switch across all tabs -- confirm selected tab has strong teal contrast.
2. Toggle dark mode -- confirm active tab remains readable.
3. Resize to mobile -- confirm active tab still obvious.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Icon color not updating | `text-primary-foreground` propagates via `currentColor` |
| Test mocking too fragile | Follows established project pattern (see `EngagementSelector.test.tsx`) |

## Rollback

1. Revert line 48 in `src/pages/Index.tsx` to `data-[state=active]:bg-card`.
2. Remove test file and changelog entry.

## Definition of Done

- `Index.tsx` active tab uses `bg-primary` + `text-primary-foreground`.
- Render-based regression test (5 cases) created and passing.
- Changelog appended.
- No code changes executed in this response -- plan only.
