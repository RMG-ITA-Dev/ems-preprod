import { describe, it, expect } from "vitest";
import {
  classifyWorkOrderListStatus,
  matchesWorkOrderStatusFilter,
  normalizeStatusParam,
  DEFAULT_WO_STATUS_FILTER,
  STATUS_FILTER_OPTIONS,
  type WorkOrderListStatusInput,
} from "@/lib/workOrderListStatus";

// FEAT 1105-219 — clasificación de la OT para el filtro de /work-orders.

const APPROVED_AT = "2026-11-01T12:00:00Z";

const wo = (
  over: Partial<WorkOrderListStatusInput> & {
    override?: number | null;
    funcion?: number | null;
  } = {},
): WorkOrderListStatusInput => {
  const { override = null, funcion = 1, ...rest } = over;
  return {
    approval_status: "Pending_Approval",
    approved_at: null,
    risk_status: "Pending",
    engagement: { engagement_state_override: override, funcion },
    ...rest,
  };
};

describe("classifyWorkOrderListStatus — encargo terminal", () => {
  it.each(["Draft", "Pending_Approval", "Approved", "Rejected"])(
    "override 7 con %s da finalized",
    (approval_status) => {
      expect(classifyWorkOrderListStatus(wo({ approval_status, override: 7 }))).toBe("finalized");
    },
  );

  it.each(["Draft", "Pending_Approval", "Approved", "Rejected"])(
    "override 6 con %s da cancelled",
    (approval_status) => {
      expect(classifyWorkOrderListStatus(wo({ approval_status, override: 6 }))).toBe("cancelled");
    },
  );

  it("override null, otros overrides o sin engagement no son terminales", () => {
    expect(classifyWorkOrderListStatus(wo({ approval_status: "Approved", override: null }))).toBe("approved");
    expect(classifyWorkOrderListStatus(wo({ approval_status: "Approved", override: 4 }))).toBe("approved");
    expect(
      classifyWorkOrderListStatus({ approval_status: "Approved", approved_at: null, risk_status: "Pending" }),
    ).toBe("approved");
    expect(classifyWorkOrderListStatus({ ...wo({ approval_status: "Draft" }), engagement: null })).toBe("draft");
  });
});

describe("classifyWorkOrderListStatus — borrador, rechazo y aprobado", () => {
  it("Draft (o null) da draft aunque queden firmas de un ciclo anterior", () => {
    expect(classifyWorkOrderListStatus(wo({ approval_status: "Draft" }))).toBe("draft");
    expect(classifyWorkOrderListStatus(wo({ approval_status: null }))).toBe("draft");
    expect(
      classifyWorkOrderListStatus(wo({ approval_status: "Draft", risk_status: "Approved", approved_at: APPROVED_AT })),
    ).toBe("draft");
  });

  it("Rejected da rejected; Riesgos rechazado con Pending_Approval también", () => {
    expect(classifyWorkOrderListStatus(wo({ approval_status: "Rejected" }))).toBe("rejected");
    expect(classifyWorkOrderListStatus(wo({ risk_status: "Rejected" }))).toBe("rejected");
    expect(classifyWorkOrderListStatus(wo({ risk_status: "Rejected", approved_at: APPROVED_AT }))).toBe("rejected");
  });

  it("Approved con Riesgos de vuelta en Pending (compleción de emergencia) sigue en approved", () => {
    expect(
      classifyWorkOrderListStatus(wo({ approval_status: "Approved", approved_at: APPROVED_AT, risk_status: "Pending" })),
    ).toBe("approved");
  });

  it("Pending_Approval con ambas pistas firmadas (transitorio) da approved", () => {
    expect(classifyWorkOrderListStatus(wo({ approved_at: APPROVED_AT, risk_status: "Approved" }))).toBe("approved");
  });
});

describe("classifyWorkOrderListStatus — pendientes de OT de cliente", () => {
  it("sin firmas da pending_both", () => {
    expect(classifyWorkOrderListStatus(wo())).toBe("pending_both");
  });

  it("solo Socio firmó da pending_risk", () => {
    expect(classifyWorkOrderListStatus(wo({ approved_at: APPROVED_AT }))).toBe("pending_risk");
  });

  it.each(["Approved", "Emergency_Approved"])("solo Riesgos (%s) da pending_partner", (risk_status) => {
    expect(classifyWorkOrderListStatus(wo({ risk_status }))).toBe("pending_partner");
  });

  it("funcion null (encargo antiguo) se trata como OT de cliente", () => {
    expect(classifyWorkOrderListStatus(wo({ funcion: null }))).toBe("pending_both");
  });
});

describe("classifyWorkOrderListStatus — OT administrativas", () => {
  it("pendiente da pending_partner: el Pending de Riesgos es pista no aplicable", () => {
    expect(classifyWorkOrderListStatus(wo({ funcion: 2 }))).toBe("pending_partner");
    expect(classifyWorkOrderListStatus(wo({ funcion: 0 }))).toBe("pending_partner");
  });

  it("aprobada con risk_status Pending da approved", () => {
    expect(classifyWorkOrderListStatus(wo({ funcion: 2, approval_status: "Approved", approved_at: APPROVED_AT }))).toBe(
      "approved",
    );
  });
});

describe("matchesWorkOrderStatusFilter", () => {
  const finalized = wo({ approval_status: "Approved", override: 7 });
  const cancelled = wo({ approval_status: "Approved", override: 6 });
  const approved = wo({ approval_status: "Approved" });

  it("not_finalized excluye solo override 7 e incluye las canceladas", () => {
    expect(matchesWorkOrderStatusFilter(finalized, "not_finalized")).toBe(false);
    expect(matchesWorkOrderStatusFilter(cancelled, "not_finalized")).toBe(true);
    expect(matchesWorkOrderStatusFilter(approved, "not_finalized")).toBe(true);
  });

  it("all incluye todas", () => {
    for (const w of [finalized, cancelled, approved, wo()]) {
      expect(matchesWorkOrderStatusFilter(w, "all")).toBe(true);
    }
  });

  it("approved no incluye una OT Approved de encargo cancelado", () => {
    expect(matchesWorkOrderStatusFilter(approved, "approved")).toBe(true);
    expect(matchesWorkOrderStatusFilter(cancelled, "approved")).toBe(false);
    expect(matchesWorkOrderStatusFilter(cancelled, "cancelled")).toBe(true);
  });

  it("el alias Pending_Approval filtra por approval_status crudo, igual que el KPI", () => {
    // Las tres variantes pendientes, Riesgos rechazado y encargos terminales: todas cuentan.
    expect(matchesWorkOrderStatusFilter(wo(), "Pending_Approval")).toBe(true);
    expect(matchesWorkOrderStatusFilter(wo({ approved_at: APPROVED_AT }), "Pending_Approval")).toBe(true);
    expect(matchesWorkOrderStatusFilter(wo({ risk_status: "Approved" }), "Pending_Approval")).toBe(true);
    expect(matchesWorkOrderStatusFilter(wo({ risk_status: "Rejected" }), "Pending_Approval")).toBe(true);
    expect(matchesWorkOrderStatusFilter(wo({ override: 7 }), "Pending_Approval")).toBe(true);
    expect(matchesWorkOrderStatusFilter(wo({ override: 6 }), "Pending_Approval")).toBe(true);
    // El resto no.
    expect(matchesWorkOrderStatusFilter(wo({ approval_status: "Draft" }), "Pending_Approval")).toBe(false);
    expect(matchesWorkOrderStatusFilter(approved, "Pending_Approval")).toBe(false);
    expect(matchesWorkOrderStatusFilter(wo({ approval_status: "Rejected" }), "Pending_Approval")).toBe(false);
  });
});

describe("normalizeStatusParam", () => {
  it.each([
    [null, "not_finalized"],
    [undefined, "not_finalized"],
    ["", "not_finalized"],
    ["Pending_Approval", "Pending_Approval"],
    ["Draft", "draft"],
    ["Approved", "approved"],
    ["Rejected", "rejected"],
    ["pending_risk", "pending_risk"],
    ["cancelled", "cancelled"],
    ["all", "all"],
    ["basura", "not_finalized"],
    ["toString", "not_finalized"],
  ])("%s → %s", (param, expected) => {
    expect(normalizeStatusParam(param)).toBe(expected);
  });

  it("el valor por defecto es una opción visible del selector", () => {
    expect(STATUS_FILTER_OPTIONS).toContain(DEFAULT_WO_STATUS_FILTER);
    expect(STATUS_FILTER_OPTIONS).toHaveLength(10);
  });
});
