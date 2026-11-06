// 1028-213 — lista /risks.
//
// Se prueban las decisiones que la pantalla toma por su cuenta: qué columnas muestra (sin montos
// ni horas), qué filtro abre por defecto (y que lo fije UNA vez tras la primera carga), que el
// orden sea siempre el del servidor, la etiqueta de emergencia con su fecha límite, y que la lista
// sea de consulta (sin botones; abrir una fila lleva al detalle).

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { RiskWorkOrderRow } from "@/lib/workOrderRisk";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) =>
      opts?.date ? `${key}(${opts.date})` : key,
  }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Select nativo: en jsdom el de Radix no se puede manipular directamente.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  }) => (
    <select value={value ?? ""} onChange={(e) => onValueChange?.(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock("@/hooks/useMobile", () => ({ useIsMobile: () => false }));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

type HookState = {
  data: RiskWorkOrderRow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};
let hookState: HookState;
vi.mock("@/hooks/useRiskWorkOrders", () => ({
  useRiskWorkOrders: () => hookState,
}));

import Risks from "../Risks";

function wo(over: Partial<RiskWorkOrderRow> & { wo_id: string; engagement_code: string }): RiskWorkOrderRow {
  return {
    engagement_id: `eng-${over.wo_id}`,
    engagement_name: `Encargo ${over.engagement_code}`,
    client_name: `Cliente ${over.engagement_code}`,
    partner_name: `Socio ${over.engagement_code}`,
    manager_name: `Gerente ${over.engagement_code}`,
    san_approval_id: "SAN-1",
    san_completed_at: "2026-04-15",
    ceac_number: "CEAC-1",
    ceac_completed_at: "2026-05-01",
    risk_level: "Bajo",
    risk_status: "Pending",
    emergency_review_at: null,
    emergency_partner_at: null,
    emergency_deadline_at: null,
    has_emergency_justification: false,
    engagement_state_override: null,
    ...over,
  };
}

const NO_DATA = {
  san_approval_id: null,
  san_completed_at: null,
  ceac_number: null,
  ceac_completed_at: null,
  risk_level: null,
};

// Orden del servidor: por código de encargo.
const ROWS: RiskWorkOrderRow[] = [
  wo({ wo_id: "w1", engagement_code: "2027.100.001", risk_status: "Pending" }),
  wo({ wo_id: "w2", engagement_code: "2027.100.002", risk_status: "Pending", ...NO_DATA }), // emergencia pendiente
  wo({
    wo_id: "w3",
    engagement_code: "2027.100.003",
    risk_status: "Emergency_Approved",
    emergency_review_at: "2026-11-01T10:00:00Z",
    emergency_partner_at: "2026-11-02T10:00:00Z",
    emergency_deadline_at: "2026-11-12",
  }),
  wo({ wo_id: "w4", engagement_code: "2027.100.004", risk_status: "Approved" }),
  wo({ wo_id: "w5", engagement_code: "2027.100.005", risk_status: "Rejected" }),
  wo({ wo_id: "w6", engagement_code: "2027.100.006", risk_status: "Approved", engagement_state_override: 7 }),
];

const NO_EMERGENCY = ROWS.filter((r) => !["w2", "w3"].includes(r.wo_id));

const CODE = /^2027\.100\.\d{3}$/;
const shownCodes = () => screen.queryAllByText(CODE).map((el) => el.textContent);
const filterSelect = () =>
  screen
    .getAllByRole("combobox")
    .find((el) => el.querySelector('option[value="emergency"]')) as HTMLSelectElement;

function loaded(data: RiskWorkOrderRow[]): HookState {
  return { data, isLoading: false, isError: false, refetch: vi.fn() };
}

beforeEach(() => {
  navigate.mockReset();
  hookState = loaded(ROWS);
});

describe("Risks — columnas (D-08, AC-08)", () => {
  it("muestra encargo, cliente, SAN, CEAC, nivel y estado, con SAN antes que CEAC", () => {
    render(<Risks />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual([
      "risks.columns.engagement",
      "risks.columns.client",
      "risks.columns.san",
      "risks.columns.ceac",
      "risks.columns.level",
      "risks.columns.status",
    ]);
  });

  it("no muestra montos ni horas: ni columnas ni valores", () => {
    hookState = loaded(NO_EMERGENCY);
    render(<Risks />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/budget|presupuesto|amount|monto|hours|horas|fee|honorario/i);
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
  });

  it("muestra código y fecha DD/MM/AAAA de SAN y de CEAC", () => {
    // Pendiente, para que el filtro por defecto (sin emergencias) lo muestre.
    hookState = loaded([wo({ wo_id: "w1", engagement_code: "2027.100.001", risk_status: "Pending" })]);
    render(<Risks />);
    expect(screen.getByText("SAN-1")).toBeInTheDocument();
    expect(screen.getByText("CEAC-1")).toBeInTheDocument();
    expect(screen.getByText("15/04/2026")).toBeInTheDocument();
    expect(screen.getByText("01/05/2026")).toBeInTheDocument();
    expect(screen.getByText("workOrders.riskLevelBajo")).toBeInTheDocument();
  });
});

describe("Risks — filtro por defecto (D-11, AC-09)", () => {
  it("abre en Emergencia si existe al menos una OT de emergencia", () => {
    render(<Risks />);
    expect(filterSelect().value).toBe("emergency");
    expect(shownCodes()).toEqual(["2027.100.002", "2027.100.003"]);
  });

  it("abre en Pendiente de aprobación si no hay ninguna emergencia", () => {
    hookState = loaded(NO_EMERGENCY);
    render(<Risks />);
    expect(filterSelect().value).toBe("pending");
    expect(shownCodes()).toEqual(["2027.100.001"]);
  });

  it("el filtro inicial sale de los datos DESPUÉS de la carga asíncrona, no del estado vacío", () => {
    hookState = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    const { rerender } = render(<Risks />);
    expect(shownCodes()).toEqual([]);

    hookState = loaded(ROWS);
    rerender(<Risks />);
    expect(filterSelect().value).toBe("emergency");
    expect(shownCodes()).toEqual(["2027.100.002", "2027.100.003"]);
  });

  it("un refetch conserva la selección de la persona aunque el filtro por defecto cambie", () => {
    const { rerender } = render(<Risks />);
    expect(filterSelect().value).toBe("emergency");

    fireEvent.change(filterSelect(), { target: { value: "approved" } });
    expect(shownCodes()).toEqual(["2027.100.004"]);

    // Llegan datos nuevos (nueva referencia) y ya no hay emergencias: el default sería Pendiente.
    hookState = loaded([...NO_EMERGENCY]);
    rerender(<Risks />);
    expect(filterSelect().value).toBe("approved");
    expect(shownCodes()).toEqual(["2027.100.004"]);
  });

  it("el filtro ofrece Emergencia, Pendiente, Rechazado, Aprobado por Riesgos, Finalizado y Todas", () => {
    render(<Risks />);
    const options = Array.from(filterSelect().querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual([
      "risks.filter.emergency",
      "risks.filter.pending",
      "risks.filter.rejected",
      "risks.filter.approved",
      "risks.filter.finalized",
      "risks.filter.all",
    ]);
  });
});

describe("Risks — orden y grupos (D-10, D-12, D-39, D-46, AC-10…AC-12)", () => {
  const show = (value: string) => {
    fireEvent.change(filterSelect(), { target: { value } });
    return shownCodes();
  };

  it("conserva el orden del servidor con cualquier filtro, incluido Todas", () => {
    render(<Risks />);
    expect(show("all")).toEqual([
      "2027.100.001",
      "2027.100.002",
      "2027.100.003",
      "2027.100.004",
      "2027.100.005",
      "2027.100.006",
    ]);
    expect(show("pending")).toEqual(["2027.100.001", "2027.100.002"]);
    expect(show("emergency")).toEqual(["2027.100.002", "2027.100.003"]);
  });

  it("no reordena por su cuenta: respeta el orden recibido aunque no sea alfabético", () => {
    hookState = loaded([ROWS[3], ROWS[0], ROWS[4]].map((r) => ({ ...r, risk_status: "Pending" })));
    render(<Risks />);
    expect(shownCodes()).toEqual(["2027.100.004", "2027.100.001", "2027.100.005"]);
  });

  it("Pendiente incluye las emergencias con pasos pendientes (D-10)", () => {
    render(<Risks />);
    expect(show("pending")).toContain("2027.100.002");
  });

  it("Emergency_Approved NO aparece en Aprobado por Riesgos, sí en Emergencia y Todas (D-46)", () => {
    render(<Risks />);
    expect(show("approved")).not.toContain("2027.100.003");
    expect(show("emergency")).toContain("2027.100.003");
    expect(show("all")).toContain("2027.100.003");
  });

  it("un encargo finalizado aparece solo en Finalizado (D-12, AC-12)", () => {
    render(<Risks />);
    expect(show("finalized")).toEqual(["2027.100.006"]);
    expect(show("approved")).not.toContain("2027.100.006");
    expect(show("pending")).not.toContain("2027.100.006");
  });

  it("Rechazado muestra solo las OT con la pista rechazada", () => {
    render(<Risks />);
    expect(show("rejected")).toEqual(["2027.100.005"]);
  });
});

describe("Risks — etiqueta de emergencia (D-11, AC-13)", () => {
  const rowOf = (code: string) => screen.getByText(code).closest("tr") as HTMLElement;

  it("una emergencia con pasos pendientes muestra la etiqueta sin fecha límite", () => {
    render(<Risks />);
    const row = rowOf("2027.100.002");
    expect(within(row).getByText(/risks\.emergency/)).toBeInTheDocument();
    expect(within(row).queryByText(/risks\.dueOn/)).not.toBeInTheDocument();
  });

  it("una OT con los dos pasos firmados sigue en Emergencia y muestra 'vence dd/mm/aaaa'", () => {
    render(<Risks />);
    const row = rowOf("2027.100.003");
    expect(within(row).getByText(/risks\.emergency/)).toBeInTheDocument();
    expect(within(row).getByText(/risks\.dueOn\(12\/11\/2026\)/)).toBeInTheDocument();
    // Y no se rotula como "Aprobado por Riesgos".
    expect(within(row).queryByText("risks.filter.approved")).not.toBeInTheDocument();
  });
});

describe("Risks — colores del estado y chips (seguimiento de 1028-213)", () => {
  const rowOf = (code: string) => screen.getByText(code).closest("tr") as HTMLElement;

  it("cada estado lleva su color del sistema: pendiente warning, aprobado success, rechazado destructive tenue, finalizado muted", () => {
    render(<Risks />);
    fireEvent.change(filterSelect(), { target: { value: "all" } });
    expect(within(rowOf("2027.100.001")).getByText("risks.filter.pending").className).toMatch(/text-warning/);
    expect(within(rowOf("2027.100.004")).getByText("risks.filter.approved").className).toMatch(/text-success/);
    const rejected = within(rowOf("2027.100.005")).getByText("risks.filter.rejected").className;
    expect(rejected).toMatch(/text-destructive/);
    expect(rejected).not.toMatch(/\bbg-destructive\b(?!\/)/);
    expect(within(rowOf("2027.100.006")).getByText("risks.filter.finalized").className).toMatch(/text-muted-foreground/);
  });

  it("la emergencia conserva su estilo claro original (borde y letra naranja sobre fondo tenue), distinto del Rechazado", () => {
    render(<Risks />);
    fireEvent.change(filterSelect(), { target: { value: "all" } });
    const emergency = within(rowOf("2027.100.002")).getByText(/risks\.emergency/);
    const badge = emergency.closest("div.inline-flex") as HTMLElement;
    expect(badge.className).toMatch(/border-orange-300/);
    expect(badge.className).toMatch(/bg-orange-50/);
    expect(badge.className).toMatch(/text-orange-800/);
    expect(badge.className).not.toMatch(/\bbg-destructive\b(?!\/)/);
  });

  it("con dos chips (estado + Emergencia con 'vence …') el contenedor hace wrap", () => {
    render(<Risks />);
    fireEvent.change(filterSelect(), { target: { value: "all" } });
    const due = within(rowOf("2027.100.003")).getByText(/risks\.dueOn/);
    const container = due.closest("div.flex") as HTMLElement;
    expect(container.className).toMatch(/flex-wrap/);
    expect(container.className).toMatch(/gap-/);
  });

  it("la columna Cliente muestra los chips Socio · nombre y Gerente · nombre bajo el cliente", () => {
    render(<Risks />);
    fireEvent.change(filterSelect(), { target: { value: "all" } });
    const row = rowOf("2027.100.001");
    expect(within(row).getByText("Cliente 2027.100.001")).toBeInTheDocument();
    expect(within(row).getByText("Socio 2027.100.001")).toBeInTheDocument();
    expect(within(row).getByText("Gerente 2027.100.001")).toBeInTheDocument();
    expect(within(row).getAllByText("risks.partnerLabel").length).toBeGreaterThan(0);
    expect(within(row).getAllByText("risks.managerLabel").length).toBeGreaterThan(0);
  });

  it("no crea una columna nueva ni un chip vacío cuando el nombre es null", () => {
    hookState = loaded([
      wo({ wo_id: "n1", engagement_code: "2027.100.001", partner_name: null, manager_name: "Solo Gerente" }),
      wo({ wo_id: "n2", engagement_code: "2027.100.002", partner_name: null, manager_name: null }),
    ]);
    render(<Risks />);
    fireEvent.change(filterSelect(), { target: { value: "all" } });
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
    const first = rowOf("2027.100.001");
    expect(within(first).queryByText("risks.partnerLabel")).not.toBeInTheDocument();
    expect(within(first).getByText("Solo Gerente")).toBeInTheDocument();
    const second = rowOf("2027.100.002");
    expect(within(second).queryByText("risks.partnerLabel")).not.toBeInTheDocument();
    expect(within(second).queryByText("risks.managerLabel")).not.toBeInTheDocument();
  });
});

describe("Risks — lista de consulta (D-13, AC-14)", () => {
  it("no hay botones de aprobar/rechazar en las filas", () => {
    render(<Risks />);
    fireEvent.change(filterSelect(), { target: { value: "all" } });
    const body = document.querySelector("tbody") as HTMLElement;
    expect(within(body).queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText("workOrders.approveRisk")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.rejectRisk")).not.toBeInTheDocument();
  });

  it("abrir una fila lleva a /risks/:woId", () => {
    render(<Risks />);
    fireEvent.click(screen.getByText("2027.100.002"));
    expect(navigate).toHaveBeenCalledWith("/risks/w2");
  });
});

describe("Risks — estados", () => {
  it("un error de la RPC se ve como error con reintento, no como 'sin resultados'", () => {
    const refetch = vi.fn();
    hookState = { data: undefined, isLoading: false, isError: true, refetch };
    render(<Risks />);
    expect(screen.getByText("risks.loadError")).toBeInTheDocument();
    fireEvent.click(screen.getByText("risks.retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
