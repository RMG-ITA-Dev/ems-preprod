import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
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
    activeTab: "cartera",
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
    // dash_socio: filtros exclusivos de la pestaña Socio (Cliente/Sector). El filtro de
    // Gerente se retiró de la UI (review.md iteración 1, NH-01).
    selectedClientId: null,
    setSelectedClientId: vi.fn(),
    selectedIndustryId: null,
    setSelectedIndustryId: vi.fn(),
    selectedSocietyId: null,
    setSelectedSocietyId: vi.fn(),
  }),
}));

// dash_socio: 'practica' se oculta (2026-09-16, decisión del operador) -- ya no aparece en
// allowedTabs; 'socio' toma su lugar visualmente (re-etiquetada "Práctica" en Index.tsx).
vi.mock("@/hooks/useDashboardAccess", () => ({
  useDashboardAccess: () => ({
    allowedTabs: ["cartera", "encargo", "personal", "socio"],
    defaultTab: "cartera",
    isPartner: true,
    isManager: false,
    isLoading: false,
  }),
}));

vi.mock("@/components/dashboard/PeriodSelector", () => ({
  PeriodSelector: () => <div data-testid="period-selector" />,
}));
vi.mock("@/components/dashboard/tabs/PracticaTab", () => ({
  PracticaTab: () => <div data-testid="practica-tab" />,
}));
vi.mock("@/components/dashboard/tabs/CarteraTab", () => ({
  CarteraTab: () => <div data-testid="cartera-tab" />,
}));
vi.mock("@/components/dashboard/tabs/EncargoTab", () => ({
  EncargoTab: () => <div data-testid="encargo-tab" />,
}));
vi.mock("@/components/dashboard/tabs/PersonalTab", () => ({
  PersonalTab: () => <div data-testid="personal-tab" />,
}));
vi.mock("@/components/dashboard/tabs/PartnerTab", () => ({
  PartnerTab: () => <div data-testid="partner-tab" />,
  PartnerFilters: () => null,
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
  it("active tab element contains bg-primary class token", async () => {
    // review.md iteración 1, NH-02: Index.tsx carga cada tab con React.lazy/Suspense --
    // sin envolver el render en act(), la resolución de la promesa del lazy import cae
    // fuera de act y React lo reporta como warning (no afectaba el resultado del test,
    // solo ensuciaba la consola).
    await act(async () => {
      render(<Index />, { wrapper: createWrapper() });
    });
    const activeTrigger = document.querySelector('[data-state="active"]');
    expect(activeTrigger).toBeTruthy();
    expect(activeTrigger!.className).toContain("data-[state=active]:bg-primary");
  });

  it("active tab element contains text-primary-foreground class token", async () => {
    await act(async () => {
      render(<Index />, { wrapper: createWrapper() });
    });
    const activeTrigger = document.querySelector('[data-state="active"]');
    expect(activeTrigger).toBeTruthy();
    expect(activeTrigger!.className).toContain("data-[state=active]:text-primary-foreground");
  });

  it("active tab does NOT contain low-contrast bg-card override", async () => {
    await act(async () => {
      render(<Index />, { wrapper: createWrapper() });
    });
    const activeTrigger = document.querySelector('[data-state="active"]');
    expect(activeTrigger).toBeTruthy();
    expect(activeTrigger!.className).not.toContain("data-[state=active]:bg-card");
  });

  // dash_socio: 'practica' oculto (2026-09-16) -- allowedTabs trae 4 pestañas
  // (cartera/encargo/personal/socio, mock de useDashboardAccess arriba).
  it("renders all four tab triggers", async () => {
    await act(async () => {
      render(<Index />, { wrapper: createWrapper() });
    });
    const triggers = document.querySelectorAll('[role="tab"]');
    expect(triggers.length).toBe(4);
  });

  it("inactive tabs do not have data-state=active", async () => {
    await act(async () => {
      render(<Index />, { wrapper: createWrapper() });
    });
    const triggers = document.querySelectorAll('[role="tab"]');
    const inactiveTriggers = Array.from(triggers).filter(
      (el) => el.getAttribute("data-state") !== "active"
    );
    expect(inactiveTriggers.length).toBe(3);
  });
});
