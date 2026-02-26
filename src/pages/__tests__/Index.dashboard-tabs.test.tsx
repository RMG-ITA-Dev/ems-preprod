import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

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
