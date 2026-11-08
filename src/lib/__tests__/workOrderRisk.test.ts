import { describe, it, expect } from "vitest";
import {
  defaultRiskFilter,
  filterRiskRows,
  isEmergencyTrack,
  isRiskAllEmpty,
  isRiskApprovalReady,
  isRiskSubmitAllowed,
  riskListGroups,
  showEmergencyPartner,
  showEmergencyReview,
  showNormalRiskApprove,
  type RiskWorkOrderRow,
} from "../workOrderRisk";

const FULL = {
  ceacCompletedAt: "2026-05-01",
  ceacNumber: "CEAC-1",
  sanCompletedAt: "2026-04-15",
  sanApprovalId: "SAN/1",
  riskLevel: "Bajo",
};

function row(over: Partial<RiskWorkOrderRow> = {}): RiskWorkOrderRow {
  return {
    wo_id: "wo-1",
    engagement_id: "eng-1",
    engagement_code: "2027.100.001",
    engagement_name: "Auditoría",
    client_name: "Cliente",
    partner_name: "Socio",
    manager_name: "Gerente",
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

/** Una OT de emergencia recién enviada: los 5 campos vacíos, pista Pendiente. */
const emergencyRow = (over: Partial<RiskWorkOrderRow> = {}) =>
  row({
    san_approval_id: null,
    san_completed_at: null,
    ceac_number: null,
    ceac_completed_at: null,
    risk_level: null,
    ...over,
  });

const groupsOf = (r: RiskWorkOrderRow) => [...riskListGroups(r)].sort();

describe("workOrderRisk — predicados todo-o-nada (D-03, AC-03)", () => {
  it("5 llenos = camino normal; 5 vacíos = emergencia; parcial se bloquea", () => {
    expect(isRiskApprovalReady(FULL)).toBe(true);
    expect(isRiskAllEmpty(FULL)).toBe(false);
    expect(isRiskSubmitAllowed(FULL)).toBe(true);

    expect(isRiskAllEmpty({})).toBe(true);
    expect(isRiskApprovalReady({})).toBe(false);
    expect(isRiskSubmitAllowed({})).toBe(true);

    // 1 a 4 llenos: ni normal ni emergencia → bloqueado.
    const partials = [
      { ceacCompletedAt: "2026-05-01" },
      { ...FULL, riskLevel: null },
      { ...FULL, sanApprovalId: null },
      { ...FULL, ceacNumber: "", sanCompletedAt: null },
    ];
    for (const p of partials) {
      expect(isRiskApprovalReady(p)).toBe(false);
      expect(isRiskAllEmpty(p)).toBe(false);
      expect(isRiskSubmitAllowed(p)).toBe(false);
    }
  });

  it("SAN y CEAC aceptan cualquier texto sin espacios: letras, guiones y símbolos (D-01, AC-01)", () => {
    for (const code of ["ABC-123", "#!/x_y.9", "55120-77001", "x"]) {
      expect(isRiskApprovalReady({ ...FULL, sanApprovalId: code, ceacNumber: code })).toBe(true);
    }
  });

  it("un código vacío o de solo espacios no cuenta como lleno (D-02, AC-02)", () => {
    expect(isRiskApprovalReady({ ...FULL, sanApprovalId: "   " })).toBe(false);
    expect(isRiskApprovalReady({ ...FULL, ceacNumber: "" })).toBe(false);
  });

  it("el nivel de riesgo debe ser uno del catálogo", () => {
    expect(isRiskApprovalReady({ ...FULL, riskLevel: "Extremo" })).toBe(false);
  });

  it("una OT administrativa siempre puede enviarse", () => {
    expect(isRiskSubmitAllowed({ ceacCompletedAt: "2026-05-01" }, true)).toBe(true);
  });
});

describe("workOrderRisk — acciones de Riesgos", () => {
  it("aprobación normal: datos completos y NO mientras siga Emergency_Approved", () => {
    expect(showNormalRiskApprove({ ...FULL, riskStatus: "Pending" })).toBe(true);
    expect(showNormalRiskApprove({ ...FULL, riskStatus: "Emergency_Approved" })).toBe(false);
    expect(showNormalRiskApprove({ riskStatus: "Pending" })).toBe(false);
    expect(showNormalRiskApprove({ ...FULL, riskStatus: "Pending" }, false)).toBe(false);
  });

  it("emergencia paso 1: campos vacíos, sin revisión previa", () => {
    expect(showEmergencyReview({ riskStatus: "Pending" })).toBe(true);
    expect(showEmergencyReview({ riskStatus: "Pending", emergencyReviewAt: "2026-06-19T10:00:00Z" })).toBe(false);
    expect(showEmergencyReview({ ...FULL, riskStatus: "Pending" })).toBe(false);
  });

  it("emergencia paso 2: solo tras el paso 1 y mientras no esté firmado (la primera gana)", () => {
    const afterStep1 = { riskStatus: "Pending", emergencyReviewAt: "2026-06-19T10:00:00Z" };
    expect(showEmergencyPartner({ riskStatus: "Pending" })).toBe(false);
    expect(showEmergencyPartner(afterStep1)).toBe(true);
    expect(showEmergencyPartner({ ...afterStep1, emergencyPartnerAt: "2026-06-19T11:00:00Z" })).toBe(false);
    expect(showEmergencyPartner({ ...afterStep1, riskStatus: "Emergency_Approved" })).toBe(false);
  });
});

describe("workOrderRisk — pista de emergencia", () => {
  it("Pendiente con los 5 campos vacíos es emergencia", () => {
    expect(isEmergencyTrack({ riskStatus: "Pending" })).toBe(true);
  });

  it("Emergency_Approved sigue siendo emergencia (D-46)", () => {
    expect(isEmergencyTrack({ ...FULL, riskStatus: "Emergency_Approved" })).toBe(true);
  });

  it("firmas pendientes con datos aún vacíos cuentan como emergencia", () => {
    expect(isEmergencyTrack({ riskStatus: "Pending", emergencyReviewAt: "2026-06-19T10:00:00Z" })).toBe(true);
  });

  it("una vez Approved (normalización posterior) la emergencia quedó resuelta", () => {
    expect(isEmergencyTrack({ riskStatus: "Approved", emergencyPartnerAt: "2026-06-20T10:00:00Z" })).toBe(false);
  });

  it("una OT normal pendiente no es emergencia", () => {
    expect(isEmergencyTrack({ ...FULL, riskStatus: "Pending" })).toBe(false);
  });
});

describe("workOrderRisk — grupos de la lista /risks (D-10…D-12, D-46)", () => {
  it("cada risk_status cae en su grupo", () => {
    expect(groupsOf(row({ risk_status: "Pending" }))).toEqual(["pending"]);
    expect(groupsOf(row({ risk_status: "Rejected" }))).toEqual(["rejected"]);
    expect(groupsOf(row({ risk_status: "Approved" }))).toEqual(["approved"]);
  });

  it("Emergency_Approved entra en Emergencia y NO en Aprobado por Riesgos ni en Pendiente (D-46)", () => {
    const g = riskListGroups(
      row({ risk_status: "Emergency_Approved", emergency_deadline_at: "2026-11-12" }),
    );
    expect(g.has("emergency")).toBe(true);
    expect(g.has("approved")).toBe(false);
    expect(g.has("pending")).toBe(false);
  });

  it("emergencia con pasos pendientes está en Emergencia Y en Pendiente de aprobación (D-10)", () => {
    expect(groupsOf(emergencyRow())).toEqual(["emergency", "pending"]);
    expect(groupsOf(emergencyRow({ emergency_review_at: "2026-06-19T10:00:00Z" }))).toEqual([
      "emergency",
      "pending",
    ]);
  });

  it("un encargo finalizado (override 7) prevalece: solo Finalizado (D-12, AC-12)", () => {
    for (const status of ["Pending", "Rejected", "Approved", "Emergency_Approved"]) {
      expect(groupsOf(row({ risk_status: status, engagement_state_override: 7 }))).toEqual([
        "finalized",
      ]);
    }
    expect(groupsOf(emergencyRow({ engagement_state_override: 7 }))).toEqual(["finalized"]);
  });

  it("otros overrides no cambian los grupos", () => {
    expect(groupsOf(row({ risk_status: "Pending", engagement_state_override: 4 }))).toEqual(["pending"]);
  });

  // Review 1028-213, R7-1: risk_status es nullable y el servidor lo trata como 'Pending' (COALESCE).
  it("un risk_status nulo se trata como Pendiente, igual que en el servidor (R7-1)", () => {
    expect(groupsOf(row({ risk_status: null }))).toEqual(["pending"]);
  });

  it("un risk_status nulo con los 5 campos vacíos es Emergencia y Pendiente (R7-1)", () => {
    expect(groupsOf(emergencyRow({ risk_status: null }))).toEqual(["emergency", "pending"]);
  });

  it("un risk_status nulo hace que el filtro por defecto sea Emergencia si hay una emergencia (R7-1)", () => {
    expect(defaultRiskFilter([row({ risk_status: "Approved" }), emergencyRow({ risk_status: null })])).toBe(
      "emergency",
    );
    expect(defaultRiskFilter([row({ risk_status: null })])).toBe("pending");
  });

  it("un encargo finalizado con risk_status nulo sigue siendo solo Finalizado (R7-1)", () => {
    expect(groupsOf(row({ risk_status: null, engagement_state_override: 7 }))).toEqual(["finalized"]);
  });
});

describe("workOrderRisk — filtro por defecto (D-11, AC-09)", () => {
  it("Emergencia si existe al menos una OT de emergencia", () => {
    expect(defaultRiskFilter([row(), emergencyRow({ wo_id: "wo-2" })])).toBe("emergency");
  });

  it("una OT con Emergency_Approved también basta para abrir en Emergencia", () => {
    expect(defaultRiskFilter([row({ risk_status: "Emergency_Approved" })])).toBe("emergency");
  });

  it("Pendiente de aprobación si no hay ninguna emergencia", () => {
    expect(defaultRiskFilter([row(), row({ wo_id: "wo-2", risk_status: "Rejected" })])).toBe("pending");
    expect(defaultRiskFilter([])).toBe("pending");
  });

  it("una emergencia de un encargo finalizado no cuenta", () => {
    expect(defaultRiskFilter([emergencyRow({ engagement_state_override: 7 })])).toBe("pending");
  });
});

describe("workOrderRisk — filterRiskRows", () => {
  const rows = [
    row({ wo_id: "a", engagement_code: "A", risk_status: "Pending" }),
    emergencyRow({ wo_id: "b", engagement_code: "B" }),
    row({ wo_id: "c", engagement_code: "C", risk_status: "Approved" }),
    row({ wo_id: "d", engagement_code: "D", risk_status: "Rejected" }),
    row({ wo_id: "e", engagement_code: "E", risk_status: "Approved", engagement_state_override: 7 }),
  ];
  const ids = (f: Parameters<typeof filterRiskRows>[1]) => filterRiskRows(rows, f).map((r) => r.wo_id);

  it("conserva siempre el orden del servidor, con cualquier filtro incluido Todas (D-39, AC-10)", () => {
    expect(ids("all")).toEqual(["a", "b", "c", "d", "e"]);
    expect(ids("pending")).toEqual(["a", "b"]);
    expect(ids("emergency")).toEqual(["b"]);
    expect(ids("approved")).toEqual(["c"]);
    expect(ids("rejected")).toEqual(["d"]);
    expect(ids("finalized")).toEqual(["e"]);
  });

  it("no muta la lista de entrada", () => {
    const copy = [...rows];
    filterRiskRows(rows, "all");
    expect(rows).toEqual(copy);
  });
});
