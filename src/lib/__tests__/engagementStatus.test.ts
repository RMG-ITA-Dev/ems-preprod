import { describe, it, expect } from "vitest";
import {
  EngagementState,
  deriveEngagementState,
  effectiveEngagementState,
  canLogHours,
  engagementStateI18nKey,
  ENGAGEMENT_STATES,
  type EngagementStateInput,
  type WorkOrderStateInput,
} from "@/lib/engagementStatus";
import esJson from "@/locales/es.json";
import enJson from "@/locales/en.json";

const woRequired: EngagementStateInput = { work_order_required: true };

describe("deriveEngagementState — FEAT 0602-135 (9 estados, flujo paralelo)", () => {
  it("encargo recién creado sin OT → 1 Pendiente", () => {
    expect(deriveEngagementState(woRequired, null)).toBe(EngagementState.Pendiente);
    expect(deriveEngagementState(woRequired, {})).toBe(EngagementState.Pendiente);
  });

  it("OT en borrador/pendiente, ambas pistas Pending → 1 Pendiente", () => {
    const wo: WorkOrderStateInput = {
      approval_status: "Pending_Approval",
      approved_at: null,
      risk_status: "Pending",
    };
    expect(deriveEngagementState(woRequired, wo)).toBe(EngagementState.Pendiente);
  });

  it("Socio aprobó, Riesgos pendiente → 2 Aprobado Socio", () => {
    const wo: WorkOrderStateInput = {
      approval_status: "Pending_Approval",
      approved_at: "2026-07-01T00:00:00Z",
      risk_status: "Pending",
    };
    expect(deriveEngagementState(woRequired, wo)).toBe(EngagementState.AprobadoSocio);
  });

  it("Riesgos aprobó ANTES que Socio → 3 Aprobado Riesgos (no hay secuencia forzada)", () => {
    const wo: WorkOrderStateInput = {
      approval_status: "Pending_Approval",
      approved_at: null,
      risk_status: "Approved",
    };
    expect(deriveEngagementState(woRequired, wo)).toBe(EngagementState.AprobadoRiesgos);
  });

  it("Riesgos en emergencia pero Socio pendiente → 3 Aprobado Riesgos", () => {
    const wo: WorkOrderStateInput = {
      approval_status: "Pending_Approval",
      approved_at: null,
      risk_status: "Emergency_Approved",
    };
    expect(deriveEngagementState(woRequired, wo)).toBe(EngagementState.AprobadoRiesgos);
  });

  it("ambas pistas aprobadas (normal) → 4 Aprobado", () => {
    const wo: WorkOrderStateInput = {
      approval_status: "Approved",
      approved_at: "2026-07-01T00:00:00Z",
      risk_status: "Approved",
    };
    expect(deriveEngagementState(woRequired, wo)).toBe(EngagementState.Aprobado);
  });

  it("aprobado con riesgo en emergencia → 5 Aprobado de emergencia (precede a 4)", () => {
    const wo: WorkOrderStateInput = {
      approval_status: "Approved",
      approved_at: "2026-07-01T00:00:00Z",
      risk_status: "Emergency_Approved",
    };
    expect(deriveEngagementState(woRequired, wo)).toBe(EngagementState.AprobadoEmergencia);
  });

  it("rechazo por el Socio (approval_status=Rejected) → 8 Rechazado", () => {
    const wo: WorkOrderStateInput = { approval_status: "Rejected", risk_status: "Pending" };
    expect(deriveEngagementState(woRequired, wo)).toBe(EngagementState.Rechazado);
  });

  it("rechazo por Riesgos (risk_status=Rejected) → 8 Rechazado", () => {
    const wo: WorkOrderStateInput = { approval_status: "Pending_Approval", risk_status: "Rejected" };
    expect(deriveEngagementState(woRequired, wo)).toBe(EngagementState.Rechazado);
  });

  it("encargo administrativo (work_order_required=false) → 4 Aprobado directo", () => {
    expect(deriveEngagementState({ work_order_required: false }, null)).toBe(
      EngagementState.Aprobado,
    );
  });
});

describe("effectiveEngagementState — override manual gana sobre derivado", () => {
  it("override 9 Congelado gana aunque la OT esté aprobada", () => {
    const eng: EngagementStateInput = { work_order_required: true, engagement_state_override: 9 };
    const wo: WorkOrderStateInput = {
      approval_status: "Approved",
      approved_at: "2026-07-01T00:00:00Z",
      risk_status: "Approved",
    };
    expect(effectiveEngagementState(eng, wo)).toBe(EngagementState.Congelado);
  });

  it("override 6 Cancelado gana sobre un encargo administrativo", () => {
    const eng: EngagementStateInput = { work_order_required: false, engagement_state_override: 6 };
    expect(effectiveEngagementState(eng, null)).toBe(EngagementState.Cancelado);
  });

  it("override 7 Finalizado (escrito por el cron) gana", () => {
    const eng: EngagementStateInput = { work_order_required: true, engagement_state_override: 7 };
    const wo: WorkOrderStateInput = { approval_status: "Approved", approved_at: "x", risk_status: "Approved" };
    expect(effectiveEngagementState(eng, wo)).toBe(EngagementState.Finalizado);
  });

  it("override nulo o fuera de rango → cae al derivado", () => {
    const eng: EngagementStateInput = { work_order_required: true, engagement_state_override: null };
    expect(effectiveEngagementState(eng, null)).toBe(EngagementState.Pendiente);
    const bad: EngagementStateInput = { work_order_required: true, engagement_state_override: 0 };
    expect(effectiveEngagementState(bad, null)).toBe(EngagementState.Pendiente);
  });
});

describe("canLogHours — Política 13: solo 4 Aprobado y 5 Aprobado de emergencia", () => {
  it.each([
    [EngagementState.Aprobado, true],
    [EngagementState.AprobadoEmergencia, true],
    [EngagementState.Pendiente, false],
    [EngagementState.AprobadoSocio, false],
    [EngagementState.AprobadoRiesgos, false],
    [EngagementState.Cancelado, false],
    [EngagementState.Finalizado, false],
    [EngagementState.Rechazado, false],
    [EngagementState.Congelado, false],
  ])("estado %i → canLogHours=%s", (state, expected) => {
    expect(canLogHours(state as EngagementState)).toBe(expected);
  });
});

// Iteración 2 (equipo): "Aprobado de emergencia" (5) debe pasar a "Aprobado" (4) cuando se
// completan los datos de Riesgo (useCompleteRiskAssessment pone risk_status='Pending' y deja
// approval_status='Approved'). Solo entonces el encargo es finalizable. Esta derivación ocurre
// sola; los casos siguientes lo blindan.
describe("transición Aprobado de emergencia (5) → Aprobado (4) al completar datos de Riesgo", () => {
  it("emergencia aprobada (Socio + emergencia) → 5 Aprobado de emergencia", () => {
    expect(
      deriveEngagementState(woRequired, {
        approval_status: "Approved",
        approved_at: "2026-07-01T00:00:00Z",
        risk_status: "Emergency_Approved",
      }),
    ).toBe(EngagementState.AprobadoEmergencia);
  });

  it("tras completar datos de Riesgo (risk_status→Pending, approval sigue Approved) → 4 Aprobado", () => {
    expect(
      deriveEngagementState(woRequired, {
        approval_status: "Approved",
        approved_at: "2026-07-01T00:00:00Z",
        risk_status: "Pending",
      }),
    ).toBe(EngagementState.Aprobado);
  });

  it("Riesgos re-aprueba los datos completos → sigue 4 Aprobado", () => {
    expect(
      deriveEngagementState(woRequired, {
        approval_status: "Approved",
        approved_at: "2026-07-01T00:00:00Z",
        risk_status: "Approved",
      }),
    ).toBe(EngagementState.Aprobado);
  });

  it("solo el estado 4 permite cargar horas; el 5 (emergencia) queda fuera del auto-cierre", () => {
    // El cron finaliza SOLO estado 4; mientras siga en 5 no se auto-cierra (regla del equipo).
    expect(canLogHours(EngagementState.AprobadoEmergencia)).toBe(true);
    expect(canLogHours(EngagementState.Aprobado)).toBe(true);
  });
});

describe("reenvío tras RECHAZO de Riesgos (P1) — NO cargable hasta que Riesgos apruebe", () => {
  // El reenvío tras rechazo baja approval_status a 'Pending_Approval' (approved_at se preserva),
  // a diferencia de la compleción de emergencia que deja approval_status='Approved'. Así se
  // distinguen los dos casos que en la BD comparten risk_status='Pending'.
  it("Socio aprobado + Riesgos rechazado → 8 Rechazado (ventana previa al reenvío)", () => {
    expect(
      deriveEngagementState(woRequired, {
        approval_status: "Approved",
        approved_at: "2026-07-01T00:00:00Z",
        risk_status: "Rejected",
      }),
    ).toBe(EngagementState.Rechazado);
  });

  it("reenvío tras rechazo (approval baja a Pending_Approval, risk→Pending, approved_at intacto) → 2 Aprobado Socio", () => {
    const derived = deriveEngagementState(woRequired, {
      approval_status: "Pending_Approval",
      approved_at: "2026-07-01T00:00:00Z",
      risk_status: "Pending",
    });
    expect(derived).toBe(EngagementState.AprobadoSocio);
    expect(canLogHours(derived)).toBe(false);
  });

  it("Riesgos vuelve a aprobar → cierra a 4 Aprobado (cargable)", () => {
    const derived = deriveEngagementState(woRequired, {
      approval_status: "Approved",
      approved_at: "2026-07-01T00:00:00Z",
      risk_status: "Approved",
    });
    expect(derived).toBe(EngagementState.Aprobado);
    expect(canLogHours(derived)).toBe(true);
  });
});

describe("etiquetas i18n de los 9 estados", () => {
  ENGAGEMENT_STATES.forEach((state) => {
    const key = engagementStateI18nKey(state);
    const leaf = key.split(".")[1];
    it(`es.json tiene ${key}`, () => {
      expect((esJson as { engagementState: Record<string, string> }).engagementState[leaf]).toBeDefined();
    });
    it(`en.json tiene ${key}`, () => {
      expect((enJson as { engagementState: Record<string, string> }).engagementState[leaf]).toBeDefined();
    });
  });
});
