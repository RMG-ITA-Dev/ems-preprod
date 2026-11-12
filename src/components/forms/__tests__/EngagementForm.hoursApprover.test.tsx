import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/utils";
import userEvent from "@testing-library/user-event";

/**
 * 1110-220 (plan_v5) — en un encargo no-Cliente el campo `manager_id` es el "Aprobador de horas" (Rol → Persona entre
 * 14 roles); después de la aprobación del Socio el encargo queda en solo lectura salvo para admin (con aviso); y un
 * no-Cliente sin OT muestra la tarjeta de aprobación del Socio con sus acciones.
 */

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const stableClients = [{ client_id: "client-1", client_legal_name: "Test Client", is_active: true }];
const stableEmpty: never[] = [];
let mockSocieties: { society_id: string; name: string; is_active: boolean }[] = [];
vi.mock("@/hooks/useEmsData", () => ({
  useClientDirectory: () => ({ data: stableClients }),
  useServices: () => ({ data: stableEmpty }),
  useTaxonomies: () => ({ data: stableEmpty }),
  useSocieties: () => ({ data: mockSocieties }),
  useEngagementAssignments: () => ({ data: stableEmpty, isLoading: false, isError: false }),
  useEngagementAggregatedRequirements: () => ({ data: stableEmpty }),
  useActiveStaffWithSkills: () => ({ data: stableEmpty }),
  useCategories: () => ({ data: stableEmpty }),
}));

vi.mock("@/hooks/useCategoryStaff", () => ({
  useCategoryStaff: () => ({ partnerOptions: [], managerOptions: [], partners: [], managers: [] }),
}));

const { updateMutateAsync } = vi.hoisted(() => ({ updateMutateAsync: vi.fn() }));
vi.mock("@/hooks/mutations", () => ({
  useCreateEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEngagement: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDeleteEngagement: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveEngagementAssignments: () => ({ saveAssignments: vi.fn(), isSaving: false }),
}));

const { decideMutate, resubmitMutate } = vi.hoisted(() => ({ decideMutate: vi.fn(), resubmitMutate: vi.fn() }));
vi.mock("@/hooks/mutations/useEngagementPartnerApprovalMutations", () => ({
  useDecideEngagementPartnerApproval: () => ({ mutate: decideMutate, isPending: false }),
  useResubmitEngagementPartnerApproval: () => ({ mutate: resubmitMutate, isPending: false }),
}));

vi.mock("@/components/engagements/StaffAssignmentsCard", () => ({
  StaffAssignmentsCard: () => null,
}));

let mockRoleKey = "hr_manager";
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({
    scope: () => "assigned_engagements",
    can: () => true,
    roleKey: mockRoleKey,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

vi.mock("@/lib/fiscalCalculations", () => ({
  getUpcomingClosingDates: () => [
    { value: "2027-09-30", key: "September 30", year: 2027, date: new Date(2027, 8, 30) },
  ],
  getFiscalYearForDate: () => 2027,
}));

const { approvers } = vi.hoisted(() => ({
  approvers: {
    candidates: [
      { staff_id: "m1", display_name: "Ana Manager", role_key: "manager", society_id: "soc-1" },
      { staff_id: "s9", display_name: "Sergio Senior", role_key: "senior", society_id: "soc-1" },
      // De otra sociedad: nunca se ofrece (el Aprobador es de la sociedad del encargo).
      { staff_id: "x1", display_name: "Otra Sociedad", role_key: "director", society_id: "soc-2" },
    ],
    isLoading: false,
    isFetching: false,
    isError: false,
  },
}));
vi.mock("@/hooks/useHoursApproverCandidates", () => ({
  useHoursApproverCandidates: () => approvers,
}));

let mockStaffId = "staff-hr";
vi.mock("@/hooks/useCurrentStaff", () => ({
  useCurrentStaff: () => ({ staffRecord: { staff_id: mockStaffId } }),
}));

import { EngagementForm } from "@/components/forms/EngagementForm";
import type { Engagement } from "@/hooks/useEmsData";

// Radix Select en jsdom (mismo shim que EngagementForm.society.test.tsx).
if (typeof (globalThis as any).PointerEvent === "undefined") {
  (globalThis as any).PointerEvent = MouseEvent;
}
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const base: Engagement = {
  engagement_id: "eng-1110",
  client_id: "client-1",
  engagement_name: "Capacitación 2027",
  engagement_code: "2027.120.001",
  partner_id: "staff-partner",
  manager_id: "m1",
  status: "active",
  start_date: "2026-10-01",
  end_date: "2027-09-30",
  created_at: "2026-05-22T00:00:00Z",
  work_order_required: false,
  activity_required: false,
  is_internal: true,
  approval_required: true,
  oficina: 1,
  practica: 2,
  funcion: 2,
  anio_fiscal: 2027,
  anio_fiscal_override: false,
  fecha_cierre: "2027-09-30",
  sqr_id: null,
  encargado_id: null,
  specialist_it_id: null,
  specialist_tax_id: null,
  taxonomy_id: null,
  contract_file_path: null,
  society_id: "soc-1",
  engagement_state_override: null,
  created_by_staff_id: "staff-hr",
  partner_approval_status: "pending",
  work_order: null,
};

beforeEach(() => {
  mockRoleKey = "hr_manager";
  mockStaffId = "staff-hr";
  mockSocieties = [];
  approvers.isError = false;
  decideMutate.mockReset();
  updateMutateAsync.mockReset();
  resubmitMutate.mockReset();
});

describe("Aprobador de horas (Rol → Persona)", () => {
  it("en Cliente el campo sigue siendo Gerente, sin selector de rol", () => {
    mockRoleKey = "admin";
    render(<EngagementForm engagement={{ ...base, funcion: 1, work_order_required: true, partner_approval_status: null }} />);
    expect(document.getElementById("hours-approver-role")).toBeNull();
    expect(screen.queryByText("engagement.hoursApprover")).not.toBeInTheDocument();
  });

  it("en no-Cliente muestra Rol → Persona y deduce el rol de la persona guardada", () => {
    render(<EngagementForm engagement={base} />);
    const roleTrigger = document.getElementById("hours-approver-role");
    expect(roleTrigger).not.toBeNull();
    expect(roleTrigger).toHaveTextContent("authz.role.manager");
    expect(screen.getByText("engagement.hoursApproverRole")).toBeInTheDocument();
    expect(screen.getAllByText("engagement.hoursApprover").length).toBeGreaterThan(0);
  });

  it("en no-Cliente oculta SQR, Encargado y Especialistas; en Cliente siguen", () => {
    const { unmount } = render(<EngagementForm engagement={base} />);
    for (const key of ["engagement.sqr", "engagement.encargado", "engagement.specialistIt1", "engagement.specialistTax1"]) {
      expect(screen.queryByText(key)).not.toBeInTheDocument();
    }
    unmount();
    mockRoleKey = "admin";
    render(<EngagementForm engagement={{ ...base, funcion: 1, work_order_required: true, partner_approval_status: null }} />);
    expect(screen.getByText("engagement.sqr")).toBeInTheDocument();
    expect(screen.getByText("engagement.encargado")).toBeInTheDocument();
  });

  it("admin cambia la sociedad al editar: se limpian rol y persona (el Aprobador es de la sociedad del encargo)", async () => {
    mockRoleKey = "admin";
    mockSocieties = [
      { society_id: "soc-1", name: "Sociedad Uno", is_active: true },
      { society_id: "soc-2", name: "Sociedad Dos", is_active: true },
    ];
    const user = userEvent.setup();
    render(<EngagementForm engagement={base} />);
    // Al hidratar no se limpia: la sociedad del encargo no cuenta como cambio.
    await waitFor(() => expect(document.getElementById("hours-approver-role")).toHaveTextContent("authz.role.manager"));

    await user.click(screen.getByLabelText(/engagement\.society/));
    await user.click(await screen.findByRole("option", { name: "Sociedad Dos" }));

    // El Aprobador guardado (m1, de soc-1) ya no viaja: guardar pide elegir uno de la sociedad nueva.
    await user.click(screen.getByRole("button", { name: "common.saveChanges" }));
    expect(await screen.findByText("engagement.requiredManager")).toBeInTheDocument();
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("si el catálogo falla, lo dice y no habilita elegir el rol", () => {
    approvers.isError = true;
    render(<EngagementForm engagement={base} />);
    expect(screen.getByText("engagement.hoursApproverLoadError")).toBeInTheDocument();
    expect(document.getElementById("hours-approver-role")).toBeDisabled();
  });
});

describe("Candado después de la aprobación del Socio (Q4/Q5)", () => {
  it("sin OT y aprobado: el TH creador lo ve en solo lectura con el aviso de firma", () => {
    render(<EngagementForm engagement={{ ...base, partner_approval_status: "approved" }} />);
    expect(screen.getByText("engagement.lockedBySignatureNotice")).toBeInTheDocument();
    expect(screen.queryByText("common.saveChanges")).not.toBeInTheDocument();
  });

  it("con OT aprobada: también queda en solo lectura", () => {
    render(
      <EngagementForm
        engagement={{
          ...base,
          work_order_required: true,
          partner_approval_status: null,
          work_order: { approval_status: "Approved", approved_at: "2026-11-01T00:00:00Z", risk_status: null },
        } as Engagement}
      />,
    );
    expect(screen.getByText("engagement.lockedBySignatureNotice")).toBeInTheDocument();
  });

  it("pendiente: el TH creador lo edita", () => {
    render(<EngagementForm engagement={base} />);
    expect(screen.queryByText("engagement.lockedBySignatureNotice")).not.toBeInTheDocument();
    expect(screen.getByText("common.saveChanges")).toBeInTheDocument();
  });

  it("admin edita uno aprobado con advertencia", () => {
    mockRoleKey = "admin";
    render(<EngagementForm engagement={{ ...base, partner_approval_status: "approved" }} />);
    expect(screen.getByText("engagement.adminEditSignedWarning")).toBeInTheDocument();
    expect(screen.queryByText("engagement.lockedBySignatureNotice")).not.toBeInTheDocument();
  });

  it("Cliente con OT aprobada no tiene candado", () => {
    mockRoleKey = "manager";
    mockStaffId = "m1";
    render(
      <EngagementForm
        engagement={{
          ...base,
          funcion: 1,
          work_order_required: true,
          partner_approval_status: null,
          work_order: { approval_status: "Approved", approved_at: "2026-11-01T00:00:00Z", risk_status: null },
        } as Engagement}
      />,
    );
    expect(screen.queryByText("engagement.lockedBySignatureNotice")).not.toBeInTheDocument();
  });
});

describe("Tarjeta de aprobación del Socio (sin OT)", () => {
  it("el Socio asignado ve Aprobar y Rechazar mientras está pendiente", () => {
    mockRoleKey = "partner";
    mockStaffId = "staff-partner";
    render(<EngagementForm engagement={base} />);
    expect(screen.getByText("engagement.partnerApproval.status.pending")).toBeInTheDocument();
    screen.getByText("engagement.partnerApproval.approve").click();
    expect(decideMutate).toHaveBeenCalledWith({ engagementId: "eng-1110", approve: true });
    expect(screen.getAllByText("engagement.partnerApproval.reject").length).toBeGreaterThan(0);
  });

  it("quien no es el Socio no ve las acciones de firma", () => {
    render(<EngagementForm engagement={base} />);
    expect(screen.getByText("engagement.partnerApproval.title")).toBeInTheDocument();
    expect(screen.queryByText("engagement.partnerApproval.approve")).not.toBeInTheDocument();
  });

  it("rechazado: muestra el motivo y el TH creador lo reenvía", () => {
    render(
      <EngagementForm
        engagement={{ ...base, partner_approval_status: "rejected", partner_approval_reason: "falta detalle" }}
      />,
    );
    expect(screen.getByText("falta detalle")).toBeInTheDocument();
    screen.getByText("engagement.partnerApproval.resubmit").click();
    expect(resubmitMutate).toHaveBeenCalledWith("eng-1110");
  });

  it("con OT no hay tarjeta: firma la OT", () => {
    render(<EngagementForm engagement={{ ...base, work_order_required: true, partner_approval_status: null }} />);
    expect(screen.queryByText("engagement.partnerApproval.title")).not.toBeInTheDocument();
  });
});
