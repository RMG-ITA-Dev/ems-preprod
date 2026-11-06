// 1028-213 — detalle /risks/:woId.
//
// Se prueba lo que la pantalla decide por su cuenta: que muestre solo los campos de D-14 (sin
// montos, presupuesto, plan de pagos ni horas), que aprobar/rechazar/emergencia lleguen a los
// hooks de las funciones del servidor, y quién ve el paso 2 de emergencia (risk_partner y admin,
// no risk_supervisor).

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RiskWorkOrderDetail } from "@/lib/workOrderRisk";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="layout" data-title={title}>
      {children}
    </div>
  ),
}));

// Radix Select necesita APIs de PointerEvent que jsdom no trae.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

// WorkOrderForm arrastra todo el formulario de la OT: acá solo importa que el detalle muestre el
// estado de las dos pistas.
vi.mock("@/components/forms/WorkOrderForm", () => ({
  WorkOrderTrackStatus: ({
    approvalStatus,
    riskStatus,
    approvedAt,
  }: {
    approvalStatus: string;
    riskStatus?: string | null;
    approvedAt?: string | null;
  }) => (
    <div data-testid="track-status">
      {`socio:${approvedAt ? "approved" : approvalStatus}|riesgos:${riskStatus ?? ""}`}
    </div>
  ),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate, useParams: () => ({ woId: "wo-1" }) };
});

const hookState = vi.hoisted(() => ({
  data: null as unknown,
  isLoading: false,
  isError: false,
}));
vi.mock("@/hooks/useRiskWorkOrders", () => ({
  useRiskWorkOrder: () => hookState,
}));

const mutate = vi.hoisted(() => ({
  approveRisk: vi.fn(),
  rejectRisk: vi.fn(),
  emergencyReview: vi.fn(),
  emergencyPartner: vi.fn(),
}));
const pending = vi.hoisted(() => ({ approveRisk: false }));
vi.mock("@/hooks/mutations/useWorkOrderMutations", () => ({
  useApproveRisk: () => ({ mutate: mutate.approveRisk, isPending: pending.approveRisk }),
  useRejectRisk: () => ({ mutate: mutate.rejectRisk, isPending: false }),
  useApproveEmergencyReview: () => ({ mutate: mutate.emergencyReview, isPending: false }),
  useApproveEmergencyPartner: () => ({ mutate: mutate.emergencyPartner, isPending: false }),
}));

const auth = vi.hoisted(() => ({ roleKey: "admin" as string, perms: null as null | Set<string> }));
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    roleKey: auth.roleKey,
    can: (p: string) => (auth.perms ? auth.perms.has(p) : true),
  }),
}));

import RiskDetail from "../RiskDetail";

const BASE: RiskWorkOrderDetail = {
  wo_id: "wo-1",
  engagement_id: "eng-1",
  engagement_code: "2027.261.014",
  engagement_name: "Obligaciones - Seguridad Social",
  client_name: "MDGI DRILLING BOLIVIA",
  partner_name: "socio.riesgos",
  manager_name: "gerente.rmg",
  san_approval_id: "11111-11111",
  san_completed_at: "2026-09-11",
  ceac_number: "1111111111",
  ceac_completed_at: "2026-09-10",
  risk_level: "Bajo",
  risk_status: "Pending",
  emergency_review_at: null,
  emergency_partner_at: null,
  emergency_deadline_at: null,
  has_emergency_justification: false,
  engagement_state_override: null,
  approval_status: "Pending_Approval",
  approved_at: null,
  risk_notes: null,
  emergency_justification: null,
  risk_approved_at: null,
  risk_approved_by: null,
  emergency_review_by: null,
  emergency_partner_by: null,
};

const EMERGENCY: Partial<RiskWorkOrderDetail> = {
  san_approval_id: null,
  san_completed_at: null,
  ceac_number: null,
  ceac_completed_at: null,
  risk_level: null,
  emergency_justification: "Cliente urgente, correo del 02/11",
};

const PERMS_RP = new Set(["work_order.risk.read", "work_order.risk.approve", "work_order.risk.emergency_sign"]);
const PERMS_RS = new Set(["work_order.risk.read", "work_order.risk.approve"]);

function show(over: Partial<RiskWorkOrderDetail> = {}) {
  hookState.data = { ...BASE, ...over };
  hookState.isLoading = false;
  hookState.isError = false;
  return render(<RiskDetail />);
}

beforeEach(() => {
  Object.values(mutate).forEach((fn) => fn.mockReset());
  pending.approveRisk = false;
  navigate.mockReset();
  auth.roleKey = "admin";
  auth.perms = null;
  hookState.data = null;
  hookState.isLoading = false;
  hookState.isError = false;
});

describe("RiskDetail — campos de D-14 (AC-15)", () => {
  it("muestra encargo, cliente, estado de las dos pistas, SAN y CEAC, nivel de riesgo", () => {
    show();
    expect(screen.getByText(/2027\.261\.014 - Obligaciones - Seguridad Social/)).toBeInTheDocument();
    expect(screen.getByText("MDGI DRILLING BOLIVIA")).toBeInTheDocument();
    expect(screen.getByTestId("track-status")).toHaveTextContent("socio:Pending_Approval|riesgos:Pending");
    expect(screen.getByText("11111-11111")).toBeInTheDocument();
    expect(screen.getByText("1111111111")).toBeInTheDocument();
    expect(screen.getByText("11/09/2026")).toBeInTheDocument();
    expect(screen.getByText("10/09/2026")).toBeInTheDocument();
    expect(screen.getByText("workOrders.riskLevelBajo")).toBeInTheDocument();
  });

  it("muestra Socio y Gerente a la derecha del encabezado, y el encargo y cliente a la izquierda", () => {
    show();
    const dl = document.querySelector("dl") as HTMLElement;
    expect(within(dl).getByText("risks.partnerLabel:")).toBeInTheDocument();
    expect(within(dl).getByText("socio.riesgos")).toBeInTheDocument();
    expect(within(dl).getByText("risks.managerLabel:")).toBeInTheDocument();
    expect(within(dl).getByText("gerente.rmg")).toBeInTheDocument();
    // La lista de definiciones es el último bloque del encabezado (derecha); el primero trae el encargo.
    const header = dl.parentElement as HTMLElement;
    expect(header.firstElementChild?.textContent).toMatch(/2027\.261\.014/);
    expect(header.lastElementChild).toBe(dl);
  });

  it("no pinta Socio ni Gerente cuando el servidor no los trae", () => {
    show({ partner_name: null, manager_name: null });
    expect(document.querySelector("dl")).toBeNull();
    expect(screen.queryByText("risks.partnerLabel:")).not.toBeInTheDocument();
  });

  it("no expone montos, presupuesto, plan de pagos ni horas", () => {
    const { container } = show();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/budget|presupuesto|payment|plan|installment|cuota|amount|monto|hours|horas|expense|gasto/i);
    expect(container.querySelector("table")).toBeNull();
  });

  it("muestra el motivo de emergencia y la fecha límite cuando aplica", () => {
    show({
      ...EMERGENCY,
      risk_status: "Emergency_Approved",
      emergency_review_at: "2026-11-01T10:00:00Z",
      emergency_partner_at: "2026-11-02T10:00:00Z",
      emergency_deadline_at: "2026-11-12",
    });
    expect(screen.getByText(/Cliente urgente, correo del 02\/11/)).toBeInTheDocument();
    expect(screen.getByText("workOrders.emergencyDeadlineBanner")).toBeInTheDocument();
  });

  it("muestra la nota del último rechazo de Riesgos", () => {
    show({ risk_status: "Rejected", risk_notes: "Falta el CEAC firmado" });
    expect(screen.getByText(/Falta el CEAC firmado/)).toBeInTheDocument();
  });

  it("la tarjeta es de solo lectura: no hay campos editables", () => {
    const { container } = show();
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });
});

describe("RiskDetail — aprobar y rechazar (AC-16, AC-17)", () => {
  it("aprobar llama al hook de la función del servidor con el id de la OT", async () => {
    auth.roleKey = "risk_supervisor";
    auth.perms = PERMS_RS;
    show();

    await userEvent.click(screen.getByText("workOrders.approveRisk"));
    expect(mutate.approveRisk).toHaveBeenCalledWith({ woId: "wo-1" });
  });

  it("rechazar pide notas y llama al hook con el id y las notas recortadas", async () => {
    auth.roleKey = "risk_partner";
    auth.perms = PERMS_RP;
    show();
    const user = userEvent.setup();

    await user.click(screen.getByText("workOrders.rejectRisk"));
    const dialog = screen.getByRole("alertdialog");
    await user.type(within(dialog).getByRole("textbox"), " Falta documentación ");
    await user.click(within(dialog).getByText("workOrders.rejectRisk"));

    expect(mutate.rejectRisk).toHaveBeenCalledWith({ woId: "wo-1", riskNotes: "Falta documentación" });
  });

  it("el supervisor de Riesgos aprueba y rechaza una OT donde no es socio ni gerente", () => {
    auth.roleKey = "risk_supervisor";
    auth.perms = PERMS_RS;
    show();
    expect(screen.getByText("workOrders.approveRisk")).toBeInTheDocument();
    expect(screen.getByText("workOrders.rejectRisk")).toBeInTheDocument();
  });

  it("sin work_order.risk.approve no hay acciones (solo consulta)", () => {
    auth.roleKey = "risk_supervisor";
    auth.perms = new Set(["work_order.risk.read"]);
    show();
    expect(screen.queryByText("workOrders.approveRisk")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.rejectRisk")).not.toBeInTheDocument();
  });

  it("las acciones quedan deshabilitadas mientras una mutación está en curso", () => {
    // LoadingButton reemplaza el texto por un spinner mientras carga: se mira el estado del botón.
    pending.approveRisk = true;
    show();
    const buttons = screen.getAllByRole("button");
    const enabled = buttons.filter((b) => !(b as HTMLButtonElement).disabled);
    expect(enabled.map((b) => b.textContent)).toEqual(["risks.backToList"]);
    expect(buttons.length - enabled.length).toBe(2); // Rechazar y Aprobar
  });
});

describe("RiskDetail — emergencia en dos pasos (AC-18, AC-20, H-6)", () => {
  const step1 = { ...EMERGENCY, risk_status: "Pending" };
  const step2 = { ...step1, emergency_review_at: "2026-11-01T10:00:00Z" };

  it("paso 1: la revisión de Riesgos la hace el supervisor; el paso 2 aún no aparece", async () => {
    auth.roleKey = "risk_supervisor";
    auth.perms = PERMS_RS;
    show(step1);

    expect(screen.queryByText("workOrders.approveRiskPartner")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("workOrders.approveRiskAssistant"));
    expect(mutate.emergencyReview).toHaveBeenCalledWith({ woId: "wo-1" });
  });

  it("paso 2 visible para risk_partner y lo ejecuta", async () => {
    auth.roleKey = "risk_partner";
    auth.perms = PERMS_RP;
    show(step2);

    expect(screen.queryByText("workOrders.approveRiskAssistant")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("workOrders.approveRiskPartner"));
    expect(mutate.emergencyPartner).toHaveBeenCalledWith({ woId: "wo-1" });
  });

  it("paso 2 visible para el admin aunque su matriz no lo liste", () => {
    auth.roleKey = "admin";
    auth.perms = new Set();
    show(step2);
    expect(screen.getByText("workOrders.approveRiskPartner")).toBeInTheDocument();
  });

  it("supervisor con el paso 1 hecho: banner de que falta la firma del Socio de Riesgos y Rechazar sigue visible", () => {
    auth.roleKey = "risk_supervisor";
    auth.perms = PERMS_RS;
    show(step2);
    expect(screen.getByTestId("risk-emergency-awaiting-partner")).toHaveTextContent(
      "workOrders.emergencyAwaitingPartner",
    );
    expect(screen.getByText("workOrders.rejectRisk")).toBeInTheDocument();
  });

  it("sin banner para quien sí puede firmar el paso 2 (risk_partner y admin)", () => {
    auth.roleKey = "risk_partner";
    auth.perms = PERMS_RP;
    const { unmount } = show(step2);
    expect(screen.queryByTestId("risk-emergency-awaiting-partner")).not.toBeInTheDocument();
    unmount();
    auth.roleKey = "admin";
    auth.perms = new Set();
    show(step2);
    expect(screen.queryByTestId("risk-emergency-awaiting-partner")).not.toBeInTheDocument();
  });

  it("sin banner mientras el paso 1 no está hecho", () => {
    auth.roleKey = "risk_supervisor";
    auth.perms = PERMS_RS;
    show(step1);
    expect(screen.queryByTestId("risk-emergency-awaiting-partner")).not.toBeInTheDocument();
  });

  it("paso 2 oculto para risk_supervisor, que conserva Rechazar", () => {
    auth.roleKey = "risk_supervisor";
    auth.perms = PERMS_RS;
    show(step2);
    expect(screen.queryByText("workOrders.approveRiskPartner")).not.toBeInTheDocument();
    expect(screen.getByText("workOrders.rejectRisk")).toBeInTheDocument();
  });
});

describe("RiskDetail — estados", () => {
  it("la OT no disponible (NOT_FOUND del servidor) muestra un aviso y la vuelta a la lista", () => {
    hookState.data = null;
    hookState.isError = true;
    render(<RiskDetail />);
    expect(screen.getByText("risks.detailNotFound")).toBeInTheDocument();
    fireEvent.click(screen.getByText("risks.backToList"));
    expect(navigate).toHaveBeenCalledWith("/risks");
  });

  it("mientras carga no muestra ni acciones ni el aviso de no encontrada", () => {
    hookState.isLoading = true;
    render(<RiskDetail />);
    expect(screen.queryByText("risks.detailNotFound")).not.toBeInTheDocument();
    expect(screen.queryByText("workOrders.approveRisk")).not.toBeInTheDocument();
  });

  it("el enlace de vuelta lleva a /risks", () => {
    show();
    fireEvent.click(screen.getByText("risks.backToList"));
    expect(navigate).toHaveBeenCalledWith("/risks");
  });
});
