// Fase 3 (plan v2 §1) — prueba de paridad: los dos módulos byte-sincronizados
// supabase/functions/{scheduler-data,scheduler-gaps}/engagementState.ts deben
// producir EXACTAMENTE el mismo resultado que la fuente de verdad
// src/lib/engagementStatus.ts (development) para los 8 estados, y ser
// idénticos entre sí (evita que las dos copias diverjan con el tiempo).
//
// También cubre los escenarios explícitos del issue: legado "active" con
// override no activo, AprobadoEmergencia, rechazado, cancelado,
// finalizado.

import { describe, it, expect } from "vitest";
import {
  EngagementState as DevEngagementState,
  deriveEngagementState as devDerive,
  effectiveEngagementState as devEffective,
  canLogHours as devCanLogHours,
  type EngagementStateInput,
  type WorkOrderStateInput,
} from "@/lib/engagementStatus";
import * as schedulerData from "../../../supabase/functions/scheduler-data/engagementState.ts";
import * as schedulerGaps from "../../../supabase/functions/scheduler-gaps/engagementState.ts";

const copies = [
  { name: "scheduler-data", mod: schedulerData },
  { name: "scheduler-gaps", mod: schedulerGaps },
] as const;

const woRequired: EngagementStateInput = { work_order_required: true };

const scenarios: Array<{
  label: string;
  engagement: EngagementStateInput;
  wo: WorkOrderStateInput | null;
  expected: DevEngagementState;
}> = [
  { label: "sin OT → Pendiente", engagement: woRequired, wo: null, expected: DevEngagementState.Pendiente },
  {
    label: "Socio aprobó, Riesgos pendiente → AprobadoSocio",
    engagement: woRequired,
    wo: { approval_status: "Pending_Approval", approved_at: "2026-07-01T00:00:00Z", risk_status: "Pending" },
    expected: DevEngagementState.AprobadoSocio,
  },
  {
    label: "Riesgos aprobó antes que Socio → AprobadoRiesgos",
    engagement: woRequired,
    wo: { approval_status: "Pending_Approval", approved_at: null, risk_status: "Approved" },
    expected: DevEngagementState.AprobadoRiesgos,
  },
  {
    label: "ambas pistas aprobadas → Aprobado",
    engagement: woRequired,
    wo: { approval_status: "Approved", approved_at: "2026-07-01T00:00:00Z", risk_status: "Approved" },
    expected: DevEngagementState.Aprobado,
  },
  {
    label: "aprobado con riesgo en emergencia → AprobadoEmergencia (precede a Aprobado)",
    engagement: woRequired,
    wo: { approval_status: "Approved", approved_at: "2026-07-01T00:00:00Z", risk_status: "Emergency_Approved" },
    expected: DevEngagementState.AprobadoEmergencia,
  },
  {
    label: "rechazo del Socio → Rechazado",
    engagement: woRequired,
    wo: { approval_status: "Rejected", risk_status: "Pending" },
    expected: DevEngagementState.Rechazado,
  },
  {
    label: "rechazo de Riesgos → Rechazado",
    engagement: woRequired,
    wo: { approval_status: "Pending_Approval", risk_status: "Rejected" },
    expected: DevEngagementState.Rechazado,
  },
  {
    label: "administrativo (work_order_required=false) → Aprobado directo",
    engagement: { work_order_required: false },
    wo: null,
    expected: DevEngagementState.Aprobado,
  },
];

describe("engagementState.ts (scheduler-data / scheduler-gaps) — paridad con src/lib/engagementStatus.ts", () => {
  it("el enum EngagementState es idéntico (valores 1-8) en las 3 copias", () => {
    const names = [
      "Pendiente", "AprobadoSocio", "AprobadoRiesgos", "Aprobado", "AprobadoEmergencia",
      "Cancelado", "Finalizado", "Rechazado",
    ] as const;
    for (const name of names) {
      for (const { name: copyName, mod } of copies) {
        expect(
          (mod.EngagementState as unknown as Record<string, number>)[name],
          `${copyName}.EngagementState.${name}`
        ).toBe((DevEngagementState as unknown as Record<string, number>)[name]);
      }
    }
    // BUG 0817-179: y el miembro retirado no debe reaparecer en ninguna de las 3 copias.
    for (const { name: copyName, mod } of copies) {
      expect(
        (mod.EngagementState as unknown as Record<string, number>).Congelado,
        `${copyName}.EngagementState.Congelado debe estar retirado (0817-179)`
      ).toBeUndefined();
    }
    expect(
      (DevEngagementState as unknown as Record<string, number>).Congelado,
      "src/lib.EngagementState.Congelado debe estar retirado (0817-179)"
    ).toBeUndefined();
  });

  describe.each(copies)("$name/engagementState.ts", ({ mod }) => {
    it.each(scenarios.map((s) => [s.label, s] as const))(
      "deriveEngagementState: %s",
      (_label, s) => {
        const devResult = devDerive(s.engagement, s.wo);
        const copyResult = mod.deriveEngagementState(s.engagement, s.wo);
        expect(copyResult).toBe(devResult);
        expect(copyResult).toBe(s.expected);
      }
    );

    it("effectiveEngagementState: override 9 (estado retirado, 0817-179) cae al derivado", () => {
      const eng: EngagementStateInput = { work_order_required: true, engagement_state_override: 9 };
      const wo: WorkOrderStateInput = {
        approval_status: "Approved",
        approved_at: "2026-07-01T00:00:00Z",
        risk_status: "Approved",
      };
      expect(mod.effectiveEngagementState(eng, wo)).toBe(devEffective(eng, wo));
      expect(mod.effectiveEngagementState(eng, wo)).toBe(DevEngagementState.Aprobado);
    });

    it("effectiveEngagementState: override Cancelado(6) gana sobre administrativo", () => {
      const eng: EngagementStateInput = { work_order_required: false, engagement_state_override: 6 };
      expect(mod.effectiveEngagementState(eng, null)).toBe(devEffective(eng, null));
      expect(mod.effectiveEngagementState(eng, null)).toBe(DevEngagementState.Cancelado);
    });

    it("effectiveEngagementState: override Finalizado(7, cron) gana", () => {
      const eng: EngagementStateInput = { work_order_required: true, engagement_state_override: 7 };
      const wo: WorkOrderStateInput = { approval_status: "Approved", approved_at: "x", risk_status: "Approved" };
      expect(mod.effectiveEngagementState(eng, wo)).toBe(devEffective(eng, wo));
      expect(mod.effectiveEngagementState(eng, wo)).toBe(DevEngagementState.Finalizado);
    });

    it("effectiveEngagementState: legado 'active' con override NO activo (6/7) nunca se cuenta como activo", () => {
      // El escenario del issue §10: un engagement con status legacy 'active'
      // pero override en un estado terminal/pausado NUNCA debe bucketizarse
      // como "active" — el bucket depende SOLO del estado efectivo.
      for (const override of [6, 7] as const) {
        const eng: EngagementStateInput = { work_order_required: true, engagement_state_override: override };
        const wo: WorkOrderStateInput = {
          approval_status: "Approved",
          approved_at: "2026-07-01T00:00:00Z",
          risk_status: "Approved",
        };
        const state = mod.effectiveEngagementState(eng, wo);
        expect(state).toBe(devEffective(eng, wo));
        expect(mod.engagementStateBucket(state)).not.toBe("active");
        expect(devCanLogHours(state)).toBe(false);
      }
    });

    it("effectiveEngagementState: override nulo/fuera de rango cae al derivado", () => {
      const eng: EngagementStateInput = { work_order_required: true, engagement_state_override: null };
      expect(mod.effectiveEngagementState(eng, null)).toBe(devEffective(eng, null));
      const bad: EngagementStateInput = { work_order_required: true, engagement_state_override: 0 };
      expect(mod.effectiveEngagementState(bad, null)).toBe(devEffective(bad, null));
    });

    it("engagementStateBucket: solo Aprobado(4)/AprobadoEmergencia(5) bucketizan 'active' — coherente con canLogHours", () => {
      for (let state = 1; state <= 8; state++) {
        const bucket = mod.engagementStateBucket(state as DevEngagementState);
        const isActiveBucket = bucket === "active";
        expect(isActiveBucket).toBe(devCanLogHours(state as DevEngagementState));
      }
    });

    it("engagementStateBucket: 9 (estado retirado, 0817-179) → 'unknown'; el bucket 'frozen' ya no existe", () => {
      expect(mod.engagementStateBucket(9 as DevEngagementState)).toBe("unknown");
    });

    it("engagementStateBucket: Rechazado(8) y Cancelado(6) → 'cancelled'", () => {
      expect(mod.engagementStateBucket(DevEngagementState.Rechazado)).toBe("cancelled");
      expect(mod.engagementStateBucket(DevEngagementState.Cancelado)).toBe("cancelled");
    });

    it("engagementStateBucket: Finalizado(7) → 'completed'", () => {
      expect(mod.engagementStateBucket(DevEngagementState.Finalizado)).toBe("completed");
    });

    it("engagementStateBucket: estado desconocido/null → 'unknown' (representación segura)", () => {
      expect(mod.engagementStateBucket(null)).toBe("unknown");
      expect(mod.engagementStateBucket(undefined)).toBe("unknown");
    });
  });

  it("las dos copias (scheduler-data y scheduler-gaps) nunca divergen entre sí", () => {
    for (const s of scenarios) {
      const [a, b] = copies.map(({ mod }) => mod.deriveEngagementState(s.engagement, s.wo));
      expect(a).toBe(b);
    }
    for (let state = 1; state <= 8; state++) {
      const [a, b] = copies.map(({ mod }) => mod.engagementStateBucket(state as DevEngagementState));
      expect(a).toBe(b);
    }
  });
});
