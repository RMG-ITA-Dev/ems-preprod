import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "../AppSidebar";

// Decisión del operador 2026-10-27: el Analista de Talento Humano no ve encargos de Cliente.
// "Encargos" (/engagements) se le oculta aunque tenga engagement.read; trabaja desde
// "Encargos Administrativos".

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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { staff_id: "staff-1" } }),
}));

vi.mock("@/hooks/useFundRequests", () => ({
  useManagesAnyOt: () => ({ data: false }),
}));

// Rol mutable por test — mismo patrón que AppSidebar.schedulerFlag.test.tsx.
const authState: { can: () => boolean; roleKey: string } = { can: () => false, roleKey: "assistant" };
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => authState,
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

describe("AppSidebar — Encargos para el Analista de Talento Humano", () => {
  it("oculta Encargos y deja Encargos Administrativos para hr_analyst", () => {
    Object.assign(authState, { can: () => true, roleKey: "hr_analyst" });
    renderSidebar();
    expect(screen.queryByText("nav.engagements")).not.toBeInTheDocument();
    expect(screen.getByText("nav.administrativeEngagements")).toBeInTheDocument();
  });

  it("muestra Encargos a hr_manager con engagement.read", () => {
    Object.assign(authState, { can: () => true, roleKey: "hr_manager" });
    renderSidebar();
    expect(screen.getByText("nav.engagements")).toBeInTheDocument();
  });
});
