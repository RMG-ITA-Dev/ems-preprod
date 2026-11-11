import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// 1110-220: quien crea encargos ve dos pestañas en Encargos Administrativos. "Mis encargos" (creados,
// gerenciados o donde es Socio: lo que puede editar) es la vista operativa completa. "Todos" es la
// misma vista de consulta que tienen los demás roles: nombre y código, FY vigente o futuro, sin detalle.
// plan_v3: el alta es solo de Sistemas y Talento Humano; quien no crea pero gerencia o firma alguno también
// tiene "Mis encargos" (detalle en solo lectura), sin botón Nuevo.

const capturedProps: any = {};
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: (props: any) => {
    Object.assign(capturedProps, props);
    return <div data-testid="data-table-stub" />;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { state, adminRows } = vi.hoisted(() => {
  const base = {
    engagement_code: null,
    funcion: 0,
    society_id: "s1",
    society_name: "Sociedad",
    client_id: "c1",
    client_name: "Cliente",
    oficina: 1,
    practica: null,
    practica_name: null,
    anio_fiscal: 2099,
    start_date: null,
    end_date: null,
    status: "active",
    work_order_required: false,
    engagement_state_override: null,
    work_order: null,
    created_by_staff_id: "other",
    manager_id: "other",
    partner_id: null,
  };
  return {
    state: { canCreate: true, roleKey: "hr_manager" as string, myStaffId: "me" as string },
    adminRows: [
      { ...base, engagement_id: "creado", engagement_name: "Creado", created_by_staff_id: "me" },
      // Propio pero de un FY pasado: "Mis encargos" conserva el histórico.
      { ...base, engagement_id: "gerenciado", engagement_name: "Gerenciado", manager_id: "me", anio_fiscal: 2000 },
      { ...base, engagement_id: "ajeno", engagement_name: "Ajeno" },
      // Ajeno y de un FY pasado: la vista de consulta no lo muestra.
      { ...base, engagement_id: "ajeno-viejo", engagement_name: "Ajeno viejo", anio_fiscal: 2000 },
    ],
  };
});

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => state.canCreate, scope: () => null, roleKey: state.roleKey, isLoading: false }),
}));
vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useAdministrativeEngagements", () => ({
  useAdministrativeEngagements: () => ({ data: adminRows, isLoading: false }),
}));
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { staff_id: state.myStaffId } }),
}));

import AdministrativeEngagements from "@/pages/AdministrativeEngagements";

const wrap = (url = "/administrative-engagements") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <AdministrativeEngagements />
    </MemoryRouter>,
  );

const ids = () => capturedProps.data.map((r: any) => r.engagement_id);
const columnKeys = () => capturedProps.columns.map((c: any) => c.key);

beforeEach(() => {
  for (const k of Object.keys(capturedProps)) delete capturedProps[k];
  mockNavigate.mockClear();
  state.canCreate = true;
  state.roleKey = "hr_manager";
  state.myStaffId = "me";
});

describe("Encargos Administrativos — pestañas (1110-220)", () => {
  it("abre en Mis encargos: lo propio con histórico, vista completa, detalle y botón Nuevo", () => {
    wrap();
    expect(screen.getByRole("tab", { name: "engagement.administrativeTabMine" })).toHaveAttribute("aria-selected", "true");
    expect(ids()).toEqual(["creado", "gerenciado"]);
    expect(columnKeys()).toContain("effective_state");
    expect(capturedProps.statusFilter).toBeDefined();
    expect(capturedProps.newButtonLabel).toBe("engagement.newAdministrativeEngagement");
    capturedProps.onRowClick(adminRows[1]);
    expect(mockNavigate).toHaveBeenCalledWith("/engagements/gerenciado", {
      state: { returnTo: "/administrative-engagements" },
    });
  });

  it("Todos es la vista de consulta de los demás roles, con el botón Nuevo", async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole("tab", { name: "engagement.administrativeTabAll" }));
    expect(ids()).toEqual(["creado", "ajeno"]);
    expect(columnKeys()).toEqual(["engagement_name"]);
    expect(capturedProps.statusFilter).toBeUndefined();
    expect(capturedProps.onRowClick).toBeUndefined();
    expect(capturedProps.searchKeys).toEqual(["engagement_code", "engagement_name"]);
    expect(capturedProps.newButtonLabel).toBe("engagement.newAdministrativeEngagement");
  });

  it("?tab=all abre directo en Todos", () => {
    wrap("/administrative-engagements?tab=all");
    expect(screen.getByRole("tab", { name: "engagement.administrativeTabAll" })).toHaveAttribute("aria-selected", "true");
    expect(capturedProps.onRowClick).toBeUndefined();
  });

  it("Gerente normal con engagement.create: no da de alta administrativos, pero abre los que gerencia", () => {
    state.roleKey = "manager";
    wrap();
    expect(capturedProps.newButtonLabel).toBeUndefined();
    expect(capturedProps.onNewClick).toBeUndefined();
    expect(screen.getByRole("tab", { name: "engagement.administrativeTabMine" })).toHaveAttribute("aria-selected", "true");
    expect(ids()).toEqual(["creado", "gerenciado"]);
    expect(capturedProps.onRowClick).toBeDefined();
  });

  it("Contabilidad, sin permiso de crear, Gerente elegido de uno: pestaña Mis encargos con detalle", () => {
    state.canCreate = false;
    state.roleKey = "accounting_manager";
    wrap();
    expect(screen.getByRole("tab", { name: "engagement.administrativeTabMine" })).toBeInTheDocument();
    expect(capturedProps.newButtonLabel).toBeUndefined();
    expect(ids()).toEqual(["creado", "gerenciado"]);
  });

  it("sin permiso de crear ni encargos propios: sin pestañas ni botón Nuevo, la misma vista de consulta", () => {
    state.canCreate = false;
    state.roleKey = "assistant";
    state.myStaffId = "nadie";
    wrap();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(capturedProps.newButtonLabel).toBeUndefined();
    expect(ids()).toEqual(["creado", "ajeno"]);
    expect(columnKeys()).toEqual(["engagement_name"]);
    expect(capturedProps.onRowClick).toBeUndefined();
  });
});
