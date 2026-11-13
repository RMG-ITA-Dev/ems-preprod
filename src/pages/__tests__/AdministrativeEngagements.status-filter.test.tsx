import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// 1105-219: Encargos Administrativos no tenía el embudo de estado que sí tiene Encargos.
// Estos tests fijan que la columna Estado lo tenga, con las mismas 8 opciones, y que el
// valor de cada fila coincida con alguna opción (DataTable compara con String(valor)).

const capturedProps: any = {};

vi.mock("@/components/data-table/DataTable", () => ({
  DataTable: (props: any) => {
    Object.assign(capturedProps, props);
    return <div data-testid="data-table-stub">{props.headerActions}</div>;
  },
}));

beforeAll(() => {
  // Radix Select en jsdom.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  Element.prototype.scrollIntoView = vi.fn();
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "es" } }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { auth, adminRows } = vi.hoisted(() => {
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
    work_order_required: true,
    // 1110-220: la pestaña por defecto es "Mis encargos"; las 3 filas son del usuario.
    created_by_staff_id: "me",
  };
  return {
    auth: { canCreate: true, mobile: false, staffId: "me" as string },
    adminRows: [
      // Con OT pendiente → 1 Pendiente.
      {
        ...base,
        engagement_id: "pend",
        engagement_name: "Pendiente",
        engagement_state_override: null,
        work_order: { approval_status: "Pending_Approval", approved_at: null, risk_status: "Pending" },
      },
      // OT aprobada → 4 Aprobado.
      {
        ...base,
        engagement_id: "apr",
        engagement_name: "Aprobado",
        engagement_state_override: null,
        work_order: { approval_status: "Approved", approved_at: "2026-11-01", risk_status: "Pending" },
      },
      // Override manual → 7 Finalizado.
      {
        ...base,
        engagement_id: "fin",
        engagement_name: "Finalizado",
        engagement_state_override: 7,
        work_order: { approval_status: "Approved", approved_at: "2026-11-01", risk_status: "Pending" },
      },
    ],
  };
});

vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ can: () => auth.canCreate, scope: () => null, roleKey: "hr_manager", isLoading: false }),
}));

vi.mock("@/hooks/useMobile", () => ({
  useIsMobile: () => auth.mobile,
}));

vi.mock("@/hooks/useAdministrativeEngagements", () => ({
  useAdministrativeEngagements: () => ({ data: adminRows, isLoading: false }),
}));

vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ data: { staff_id: auth.staffId } }),
}));

vi.mock("@/hooks/usePortfolioEngagements", () => ({
  usePortfolioEngagements: () => ({ data: [], isLoading: false }),
}));

import AdministrativeEngagements from "@/pages/AdministrativeEngagements";

const wrap = () =>
  render(
    <MemoryRouter>
      <AdministrativeEngagements />
    </MemoryRouter>,
  );

beforeEach(() => {
  for (const k of Object.keys(capturedProps)) delete capturedProps[k];
  auth.canCreate = true;
  auth.mobile = false;
  auth.staffId = "me";
});

describe("Encargos Administrativos — filtro de estado (1105-219)", () => {
  it("la columna Estado tiene embudo (filterKey effective_state)", () => {
    wrap();
    const estado = capturedProps.columns.find((c: any) => c.key === "effective_state");
    expect(estado.filterKey).toBe("effective_state");
  });

  it("ofrece los mismos 8 estados que Encargos", () => {
    wrap();
    expect(capturedProps.statusFilter.key).toBe("effective_state");
    expect(capturedProps.statusFilter.options.map((o: any) => o.value)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8",
    ]);
    expect(capturedProps.statusFilter.options[6].label).toBe("engagementState.7");
  });

  it("el estado de cada fila coincide con una opción del filtro", () => {
    wrap();
    const byId = Object.fromEntries(
      capturedProps.data.map((r: any) => [r.engagement_id, String(r.effective_state)]),
    );
    expect(byId).toEqual({ pend: "1", apr: "4", fin: "7" });
  });

  it("en escritorio no agrega Select propio y el embudo usa el estado controlado", () => {
    wrap();
    expect(capturedProps.headerActions).toBeUndefined();
    expect(capturedProps.statusFilterValue).toBe("all");
    expect(typeof capturedProps.onStatusFilterChange).toBe("function");
  });

  it("en móvil el Select de la barra cambia el MISMO estado que usa la tabla", async () => {
    auth.mobile = true;
    const user = userEvent.setup();
    wrap();

    await user.click(screen.getByRole("combobox", { name: "engagement.status" }));
    await user.click(await screen.findByRole("option", { name: "engagementState.7" }));

    // La página no prefiltra: pasa las 3 filas y el valor; DataTable filtra y pagina.
    expect(capturedProps.statusFilterValue).toBe("7");
    expect(capturedProps.data).toHaveLength(3);
  });

  it("un estado elegido en escritorio se ve en el Select al pasar a móvil", () => {
    const { rerender } = wrap();
    // Simula el embudo de escritorio.
    act(() => capturedProps.onStatusFilterChange("4"));
    auth.mobile = true;
    rerender(
      <MemoryRouter>
        <AdministrativeEngagements />
      </MemoryRouter>,
    );
    expect(screen.getByRole("combobox", { name: "engagement.status" })).toHaveTextContent("engagementState.4");
  });

  it("la vista de consulta (sin permiso de crear ni encargos propios) no lleva filtro de estado", () => {
    auth.canCreate = false;
    auth.staffId = "nadie";
    wrap();
    expect(capturedProps.statusFilter).toBeUndefined();
    expect(capturedProps.columns.find((c: any) => c.key === "effective_state")).toBeUndefined();
  });
});
