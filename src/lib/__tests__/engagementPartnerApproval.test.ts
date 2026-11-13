import { describe, it, expect } from "vitest";
import {
  isPartnerSigned,
  needsEngagementPartnerApproval,
  partnerApprovalActions,
} from "@/lib/engagementPartnerApproval";

// 1110-220 plan_v5 — espejo de engagement_partner_signed(), decide_/resubmit_engagement_partner_approval() y del candado.

const noOt = { funcion: 0, work_order_required: false, partner_id: "p", created_by_staff_id: "th" };

describe("needsEngagementPartnerApproval", () => {
  it("solo no-Cliente sin OT", () => {
    expect(needsEngagementPartnerApproval(noOt)).toBe(true);
    expect(needsEngagementPartnerApproval({ funcion: 0, work_order_required: true })).toBe(false);
    expect(needsEngagementPartnerApproval({ funcion: 1, work_order_required: false })).toBe(false);
    expect(needsEngagementPartnerApproval({ funcion: null, work_order_required: false })).toBe(false);
  });
});

describe("isPartnerSigned", () => {
  it("sin OT: la firma del encargo", () => {
    expect(isPartnerSigned({ ...noOt, partner_approval_status: "approved" })).toBe(true);
    expect(isPartnerSigned({ ...noOt, partner_approval_status: "pending" })).toBe(false);
    expect(isPartnerSigned({ ...noOt, partner_approval_status: "rejected" })).toBe(false);
  });

  it("con OT: la OT aprobada y no rechazada por Riesgos", () => {
    const withOt = { ...noOt, work_order_required: true };
    expect(isPartnerSigned(withOt, { approval_status: "Approved", risk_status: null })).toBe(true);
    expect(isPartnerSigned(withOt, { approval_status: "Approved", risk_status: "Rejected" })).toBe(false);
    expect(isPartnerSigned(withOt, { approval_status: "Pending_Approval" })).toBe(false);
    expect(isPartnerSigned(withOt, null)).toBe(false);
  });

  it("Cliente nunca tiene candado", () => {
    expect(isPartnerSigned({ funcion: 1, work_order_required: true }, { approval_status: "Approved" })).toBe(false);
  });
});

describe("partnerApprovalActions", () => {
  it("solo el Socio asignado decide, y solo pendiente", () => {
    expect(partnerApprovalActions({ engagement: { ...noOt, partner_approval_status: "pending" }, myStaffId: "p", roleKey: "partner" }).canDecide).toBe(true);
    expect(partnerApprovalActions({ engagement: { ...noOt, partner_approval_status: "pending" }, myStaffId: "x", roleKey: "admin" }).canDecide).toBe(false);
    expect(partnerApprovalActions({ engagement: { ...noOt, partner_approval_status: "approved" }, myStaffId: "p", roleKey: "partner" }).canDecide).toBe(false);
  });

  it("reenvían admin o el TH creador, solo rechazado; Calidad no la reenvía TH", () => {
    const rejected = { ...noOt, partner_approval_status: "rejected" };
    expect(partnerApprovalActions({ engagement: rejected, myStaffId: "th", roleKey: "hr_analyst" }).canResubmit).toBe(true);
    expect(partnerApprovalActions({ engagement: rejected, myStaffId: "z", roleKey: "admin" }).canResubmit).toBe(true);
    expect(partnerApprovalActions({ engagement: rejected, myStaffId: "other", roleKey: "hr_manager" }).canResubmit).toBe(false);
    expect(partnerApprovalActions({ engagement: { ...rejected, funcion: 3 }, myStaffId: "th", roleKey: "hr_manager" }).canResubmit).toBe(false);
  });

  it("con OT no ofrece nada", () => {
    expect(partnerApprovalActions({ engagement: { ...noOt, work_order_required: true }, myStaffId: "p", roleKey: "partner" })).toEqual({
      canDecide: false,
      canResubmit: false,
    });
  });
});
