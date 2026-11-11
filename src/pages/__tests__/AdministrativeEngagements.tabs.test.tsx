import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// 1110-220: quien crea encargos ve dos pestañas en Encargos Administrativos: "Mis encargos" (creados,
// gerenciados o donde es Socio: lo que puede editar) y "Todos" (consulta). La fila solo abre el detalle
// si list_portfolio_engagements la trae; si no, el detalle diría "no está disponible para usted".

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
    state: { canCreate: true, portfolioIds: ["creado", "gerenciado"] as string[] },
    adminRows: [
      { ...base, engagement_id: "creado", engagement_name: "Creado", created_by_staff_id: "me" },
      { ...base, engagement_id: "gerenciado", engagement_name: "Gerenciado", manager_id: "me" },
      { ...base, engagement_id: "ajeno", engagement_name: "Ajeno" },
    ],
  };
});

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => state.canCreate, scope: () => null, isLoading: false }),
}));
vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useAdministrativeEngagements", () => ({
  useAdministrativeEngagements: () => ({ data: adminRows, isLoading: false }),
}));
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { staff_id: "me" } }),
}));
vi.mock("@/hooks/usePortfolioEngagements", () => ({
  usePortfolioEngagements: () => ({
    data: state.portfolioIds.map((engagement_id) => ({ engagement_id })),
    isLoading: false,
  }),
}));

import AdministrativeEngagements from "@/pages/AdministrativeEngagements";

const wrap = (url = "/administrative-engagements") =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <AdministrativeEngagements />
    </MemoryRouter>,
  );

const ids = () => capturedProps.data.map((r: any) => r.engagement_id);

beforeEach(() => {
  for (const k of Object.keys(capturedProps)) delete capturedProps[k];
  mockNavigate.mockClear();
  state.canCreate = true;
  state.portfolioIds = ["creado", "gerenciado"];
});

describe("Encargos Administrativos — pestañas (1110-220)", () => {
  it("abre en Mis encargos: solo los creados o gerenciados, con el botón Nuevo", () => {
    wrap();
    expect(screen.getByRole("tab", { name: "engagement.administrativeTabMine" })).toHaveAttribute("aria-selected", "true");
    expect(ids()).toEqual(["creado", "gerenciado"]);
    expect(capturedProps.newButtonLabel).toBe("engagement.newAdministrativeEngagement");
  });

  it("Todos lista también los ajenos y mantiene el botón Nuevo", async () => {
    const user = userEvent.setup();
    wrap();
    await user.click(screen.getByRole("tab", { name: "engagement.administrativeTabAll" }));
    expect(ids()).toEqual(["creado", "gerenciado", "ajeno"]);
    expect(capturedProps.newButtonLabel).toBe("engagement.newAdministrativeEngagement");
  });

  it("?tab=all abre directo en Todos y el detalle vuelve a la misma pestaña", () => {
    state.portfolioIds = ["creado", "gerenciado", "ajeno"];
    wrap("/administrative-engagements?tab=all");
    expect(ids()).toHaveLength(3);
    capturedProps.onRowClick(adminRows[2]);
    expect(mockNavigate).toHaveBeenCalledWith("/engagements/ajeno", {
      state: { returnTo: "/administrative-engagements?tab=all" },
    });
  });

  it("una fila que el portafolio no trae no navega (evita 'no está disponible para usted')", () => {
    wrap("/administrative-engagements?tab=all");
    capturedProps.onRowClick(adminRows[2]);
    expect(mockNavigate).not.toHaveBeenCalled();
    capturedProps.onRowClick(adminRows[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/engagements/creado", {
      state: { returnTo: "/administrative-engagements?tab=all" },
    });
  });

  it("desde Mis encargos el detalle vuelve a Mis encargos", () => {
    wrap();
    capturedProps.onRowClick(adminRows[1]);
    expect(mockNavigate).toHaveBeenCalledWith("/engagements/gerenciado", {
      state: { returnTo: "/administrative-engagements" },
    });
  });

  it("sin permiso de crear no hay pestañas, ni botón Nuevo, y se listan todos", () => {
    state.canCreate = false;
    wrap();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(capturedProps.newButtonLabel).toBeUndefined();
    expect(ids()).toEqual(["creado", "gerenciado", "ajeno"]);
  });
});
