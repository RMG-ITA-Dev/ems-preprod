import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";

/**
 * 1110-220 (review de Codex) — el Socio asignado puede editar un no-Cliente pendiente. Si aprueba con cambios sin guardar,
 * firma la versión guardada y después el candado ya no le deja guardar lo que ve. Rechazar también decidiría sobre la
 * versión guardada. Con cambios sin guardar, Aprobar y Rechazar quedan deshabilitados hasta guardar.
 */

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

const { decideMutate, resubmitMutate } = vi.hoisted(() => ({ decideMutate: vi.fn(), resubmitMutate: vi.fn() }));
vi.mock("@/hooks/mutations/useEngagementPartnerApprovalMutations", () => ({
  useDecideEngagementPartnerApproval: () => ({ mutate: decideMutate, isPending: false }),
  useResubmitEngagementPartnerApproval: () => ({ mutate: resubmitMutate, isPending: false }),
}));

import { EngagementPartnerApprovalCard } from "@/components/engagements/EngagementPartnerApprovalCard";

const pending = {
  engagement_id: "eng-1",
  funcion: 0,
  work_order_required: false,
  partner_id: "staff-partner",
  created_by_staff_id: "staff-hr",
  partner_approval_status: "pending",
};

beforeEach(() => {
  decideMutate.mockReset();
  resubmitMutate.mockReset();
});

describe("EngagementPartnerApprovalCard — decidir con cambios sin guardar", () => {
  it("sin cambios pendientes, el Socio aprueba", () => {
    render(<EngagementPartnerApprovalCard engagement={pending} myStaffId="staff-partner" roleKey="partner" />);
    const approve = screen.getByRole("button", { name: "engagement.partnerApproval.approve" });
    expect(approve).not.toBeDisabled();
    expect(screen.queryByText("engagement.partnerApproval.saveBeforeDecide")).not.toBeInTheDocument();
    approve.click();
    expect(decideMutate).toHaveBeenCalledWith({ engagementId: "eng-1", approve: true });
  });

  it("con cambios sin guardar, Aprobar y Rechazar quedan deshabilitados y se dice por qué", () => {
    render(
      <EngagementPartnerApprovalCard engagement={pending} myStaffId="staff-partner" roleKey="partner" hasUnsavedChanges />,
    );
    const approve = screen.getByRole("button", { name: "engagement.partnerApproval.approve" });
    expect(approve).toBeDisabled();
    const reject = screen.getByRole("button", { name: "engagement.partnerApproval.reject" });
    expect(reject).toBeDisabled();
    reject.click();
    expect(screen.queryByText("engagement.partnerApproval.rejectTitle")).not.toBeInTheDocument();
    expect(screen.getByText("engagement.partnerApproval.saveBeforeDecide")).toBeInTheDocument();
    approve.click();
    expect(decideMutate).not.toHaveBeenCalled();
  });

  it("si los cambios aparecen con el diálogo de rechazo abierto, confirmar queda deshabilitado", () => {
    const { rerender } = render(
      <EngagementPartnerApprovalCard engagement={pending} myStaffId="staff-partner" roleKey="partner" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "engagement.partnerApproval.reject" }));
    fireEvent.change(screen.getByLabelText("engagement.partnerApproval.reasonLabel"), { target: { value: "falta detalle" } });
    const confirm = () =>
      screen.getAllByRole("button", { name: "engagement.partnerApproval.reject" }).find((b) => b.closest('[role="dialog"]'))!;
    expect(confirm()).not.toBeDisabled();

    rerender(<EngagementPartnerApprovalCard engagement={pending} myStaffId="staff-partner" roleKey="partner" hasUnsavedChanges />);
    expect(confirm()).toBeDisabled();
    fireEvent.click(confirm());
    expect(decideMutate).not.toHaveBeenCalled();
  });

  it("quien no decide no ve el aviso aunque haya cambios sin guardar", () => {
    render(<EngagementPartnerApprovalCard engagement={pending} myStaffId="staff-hr" roleKey="hr_manager" hasUnsavedChanges />);
    expect(screen.queryByText("engagement.partnerApproval.saveBeforeDecide")).not.toBeInTheDocument();
  });
});
