import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// BUG 0817-178: en un encargo 7 Finalizado el Gerente no-admin ya no puede APROBAR la OT de una
// solicitud de fondos; observar y rechazar siguen. El admin conserva Aprobar.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "es" } }),
}));

const authz = { roleKey: "manager" as string | undefined };
vi.mock("@/hooks/useAuthorization", () => ({
  useAuthorization: () => ({ roleKey: authz.roleKey, can: () => true }),
}));

vi.mock("@/hooks/mutations/useFundRequestMutations", () => ({
  useDecideWorkOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/fund-requests/ApprovalDecisionDialog", () => ({
  ApprovalDecisionDialog: () => null,
}));

import { OtApprovalList } from "../OtApprovalList";
import type { FundRequest } from "@/hooks/useFundRequests";

const MANAGER = "staff-manager-1";

function makeFr(override: number | null): FundRequest {
  return {
    fund_request_id: "fr-1",
    currency: "BOB",
    status: "pendiente_aprobacion",
    fund_request_work_orders: [
      {
        fr_wo_id: "frwo-1",
        fund_request_id: "fr-1",
        wo_id: "wo-1",
        allocated_amount: 100,
        created_at: "2026-11-01T00:00:00Z",
        manager_staff_id: MANAGER,
        approval_status: "pendiente",
        manager_notes: null,
        rejection_reason: null,
        manager_decided_at: null,
        work_order: {
          wo_id: "wo-1",
          engagement: {
            engagement_id: "eng-1",
            engagement_code: "E-1",
            engagement_name: "Encargo",
            engagement_state_override: override,
          },
        },
      },
    ],
  } as unknown as FundRequest;
}

describe("OtApprovalList — encargo Finalizado (0817-178)", () => {
  beforeEach(() => {
    authz.roleKey = "manager";
  });

  it("oculta solo Aprobar al Gerente no-admin y muestra el aviso", () => {
    render(<OtApprovalList fr={makeFr(7)} myStaffId={MANAGER} />);
    expect(screen.queryByText("fundRequest.actions.approve")).toBeNull();
    expect(screen.getByText("fundRequest.actions.observe")).toBeInTheDocument();
    expect(screen.getByText("fundRequest.actions.reject")).toBeInTheDocument();
    expect(screen.getByText("fundRequest.otApproval.finalizedApproveBlocked")).toBeInTheDocument();
  });

  it("el admin conserva Aprobar en un encargo Finalizado", () => {
    authz.roleKey = "admin";
    render(<OtApprovalList fr={makeFr(7)} myStaffId={MANAGER} />);
    expect(screen.getByText("fundRequest.actions.approve")).toBeInTheDocument();
    expect(screen.queryByText("fundRequest.otApproval.finalizedApproveBlocked")).toBeNull();
  });

  it.each([null, 4, 6])("encargo con override %s: sin cambios (Aprobar visible)", (override) => {
    render(<OtApprovalList fr={makeFr(override)} myStaffId={MANAGER} />);
    expect(screen.getByText("fundRequest.actions.approve")).toBeInTheDocument();
    expect(screen.queryByText("fundRequest.otApproval.finalizedApproveBlocked")).toBeNull();
  });

  it("mientras el rol carga (roleKey undefined) el bloqueo aplica", () => {
    authz.roleKey = undefined;
    render(<OtApprovalList fr={makeFr(7)} myStaffId={MANAGER} />);
    expect(screen.queryByText("fundRequest.actions.approve")).toBeNull();
  });
});
