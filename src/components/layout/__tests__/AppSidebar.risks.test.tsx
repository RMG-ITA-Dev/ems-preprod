import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "../AppSidebar";

// 1028-213 (D-07, D-17, D-24): la entrada "Riesgos" aparece solo con el permiso propio
// `work_order.risk.read` (no por nombre de rol), y la de "Órdenes de trabajo" sigue gateada por
// `work_order.read`, que el risk_supervisor ya no tiene.

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

const authState: { perms: Set<string>; roleKey: string } = { perms: new Set(), roleKey: "manager" };
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: (p: string) => authState.perms.has(p), roleKey: authState.roleKey }),
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

function as(roleKey: string, perms: string[]) {
  authState.roleKey = roleKey;
  authState.perms = new Set(perms);
}

describe("AppSidebar — módulo de Riesgos (1028-213)", () => {
  it("risk_supervisor ve Riesgos y no ve Órdenes de trabajo (AC-07, AC-22)", () => {
    as("risk_supervisor", ["work_order.risk.read", "work_order.risk.approve"]);
    renderSidebar();
    expect(screen.getByText("nav.risks")).toBeInTheDocument();
    expect(screen.queryByText("nav.workOrders")).not.toBeInTheDocument();
  });

  it("risk_partner ve Riesgos y Órdenes de trabajo (en esta última solo las suyas, lo acota la RLS)", () => {
    as("risk_partner", ["work_order.risk.read", "work_order.read"]);
    renderSidebar();
    expect(screen.getByText("nav.risks")).toBeInTheDocument();
    expect(screen.getByText("nav.workOrders")).toBeInTheDocument();
  });

  it("el admin ve ambas entradas", () => {
    as("admin", ["work_order.risk.read", "work_order.read"]);
    renderSidebar();
    expect(screen.getByText("nav.risks")).toBeInTheDocument();
    expect(screen.getByText("nav.workOrders")).toBeInTheDocument();
  });

  it.each(["manager", "ita_manager", "tax_manager", "director", "partner"])(
    "%s no ve Riesgos aunque vea Órdenes de trabajo",
    (roleKey) => {
      as(roleKey, ["work_order.read"]);
      renderSidebar();
      expect(screen.queryByText("nav.risks")).not.toBeInTheDocument();
      expect(screen.getByText("nav.workOrders")).toBeInTheDocument();
    },
  );

  it("la entrada depende del permiso, no del nombre del rol", () => {
    as("risk_partner", ["work_order.read"]); // un rol de Riesgos al que se le quitó el permiso
    renderSidebar();
    expect(screen.queryByText("nav.risks")).not.toBeInTheDocument();

    as("some_new_role", ["work_order.risk.read"]);
    renderSidebar();
    expect(screen.getAllByText("nav.risks").length).toBeGreaterThan(0);
  });
});
