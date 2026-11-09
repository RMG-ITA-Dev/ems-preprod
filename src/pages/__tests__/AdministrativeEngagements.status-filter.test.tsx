import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// 1105-219: Encargos Administrativos no tenía el embudo de estado que sí tiene Encargos.
// Estos tests fijan que la columna Estado lo tenga, con las mismas 8 opciones, y que el
// valor de cada fila coincida con alguna opción (DataTable compara con String(valor)).

const capturedProps: any = {};

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
  };
  return {
    auth: { canCreate: true },
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
  useAuthorization: () => ({ can: () => auth.canCreate, scope: () => null, isLoading: false }),
}));

vi.mock("@/hooks/useAdministrativeEngagements", () => ({
  useAdministrativeEngagements: () => ({ data: adminRows, isLoading: false }),
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

  it("la vista de consulta (sin permiso de crear) no lleva filtro de estado", () => {
    auth.canCreate = false;
    wrap();
    expect(capturedProps.statusFilter).toBeUndefined();
    expect(capturedProps.columns.find((c: any) => c.key === "effective_state")).toBeUndefined();
  });
});
