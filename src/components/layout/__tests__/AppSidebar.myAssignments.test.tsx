import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "../AppSidebar";

// 0922-190: "Mis asignaciones" debe aparecer para CUALQUIER rol — no depende de ningún
// permiso de módulo, a diferencia del resto de operationsItems. La RLS ea_select_own acota
// los DATOS a la fila propia; la pantalla no está gateada.

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

// Rol mutable por test — mismo patrón que AppSidebar.schedulerFlag.test.tsx: `can` en
// false para probar que "Mis asignaciones" no depende de NINGÚN permiso.
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

describe("AppSidebar — Mis asignaciones (0922-190)", () => {
  it("aparece aunque el rol no tenga ningún permiso de operaciones", () => {
    Object.assign(authState, { can: () => false, roleKey: "assistant" });
    renderSidebar();
    expect(screen.getByText("nav.myAssignments")).toBeInTheDocument();
  });

  it("aparece igual para un rol con todos los permisos (admin)", () => {
    Object.assign(authState, { can: () => true, roleKey: "admin" });
    renderSidebar();
    expect(screen.getByText("nav.myAssignments")).toBeInTheDocument();
  });
});
