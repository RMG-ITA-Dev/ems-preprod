import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "../AppSidebar";

// SidebarProvider's useIsMobile (src/hooks/useMobile.tsx) calls
// window.matchMedia, which jsdom does not implement.
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

// Fase 7 (plan v2 §B, "Tests to Add"). Chokepoint #2: with the flag off,
// nav.scheduler and nav.schedulerGaps must both be entirely absent — not
// merely disabled/hidden by CSS — regardless of role.
//
// ⚠️ src/components/layout/__tests__/ did not exist before this file. §2 of
// the issue requires that two specific deleted test names never reappear —
// this file deliberately does not reuse AppHeader.sidebar-trigger.test.tsx
// or AppLayout.sidebar-focus-mode.test.tsx.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => true, roleKey: "admin" }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { staff_id: "staff-1" } }),
}));

vi.mock("@/hooks/useFundRequests", () => ({
  useManagesAnyOt: () => ({ data: false }),
}));

function renderSidebar() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("AppSidebar — Scheduler feature flag (Fase 7, plan v2 §B.4#2)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("flag ON (admin): nav.scheduler and nav.schedulerGaps are both present", () => {
    vi.stubEnv("VITE_SCHEDULER_ENABLED", "true");
    renderSidebar();
    expect(screen.getByText("nav.scheduler")).toBeInTheDocument();
    expect(screen.getByText("nav.schedulerGaps")).toBeInTheDocument();
  });

  it("flag OFF (same admin role): nav.scheduler and nav.schedulerGaps are both absent", () => {
    vi.stubEnv("VITE_SCHEDULER_ENABLED", "false");
    renderSidebar();
    expect(screen.queryByText("nav.scheduler")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.schedulerGaps")).not.toBeInTheDocument();
  });

  it("flag absent (default OFF): nav.scheduler and nav.schedulerGaps are both absent", () => {
    vi.stubEnv("VITE_SCHEDULER_ENABLED", undefined as unknown as string);
    renderSidebar();
    expect(screen.queryByText("nav.scheduler")).not.toBeInTheDocument();
    expect(screen.queryByText("nav.schedulerGaps")).not.toBeInTheDocument();
  });
});
