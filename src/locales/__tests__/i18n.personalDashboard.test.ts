import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

// dash_personal (bugs/dashboard/personal/plan_v2.md §8.3/§9.5): verifica la existencia de
// todas las claves nuevas de dashboard.personal.*, paridad de interpolaciones EN/ES, textos
// críticos exactos y la ausencia de "Observado" en los estados de timesheet (decisiones.md:
// el estado es Rechazado, "Observado" pertenece solo al dominio de fondos/gastos).

const personalEs = (es as any).dashboard.personal;
const personalEn = (en as any).dashboard.personal;

const EXPECTED_KEYS = [
  "empty.noStaffRecord",
  "empty.noAttention",
  "empty.noAssignments",
  "empty.noFunds",
  "empty.noDeadlines",
  "empty.noHistorical",
  "header.operationalWindow",
  "header.historicalPeriod",
  "units.hours",
  "attention.title",
  "attention.viewAll",
  "attention.showLess",
  "attention.resolve",
  "attention.timesheetNotSubmitted",
  "attention.timesheetRejected",
  "attention.expenseObserved",
  "attention.expenseRejected",
  "attention.missingReceipt",
  "attention.fundDueToday",
  "attention.fundOverdue",
  "attention.fundDueSoon",
  "kpi.thisWeek",
  "kpi.savedOfPlanned",
  "kpi.forecastHours",
  "kpi.remaining",
  "kpi.weeklyStatus",
  "kpi.approvedHours",
  "kpi.nextAssignment",
  "kpi.startsOn",
  "kpi.hoursPerWeek",
  "kpi.noUpcomingAssignment",
  "kpi.funds",
  "kpi.noFundActions",
  "kpi.expenseIssues",
  "load.title",
  "load.planned",
  "load.saved",
  "load.thisWeek",
  "load.weekPlus",
  "assignments.title",
  "assignments.engagement",
  "assignments.function",
  "assignments.assigned",
  "assignments.saved",
  "assignments.total",
  "assignments.clientTotal",
  "assignments.nonClientTotal",
  "function.administrative",
  "function.client",
  "function.training",
  "function.quality",
  "function.unclassified",
  "compliance.title",
  "compliance.savedHours",
  "compliance.approvedHours",
  "compliance.deadline",
  "compliance.reviewNotes",
  "compliance.openTimesheet",
  "compliance.status.approved",
  "compliance.status.pending",
  "compliance.status.rejected",
  "compliance.status.draft",
  "compliance.status.notSubmitted",
  "compliance.status.notLogged",
  "compliance.status.future",
  "funds.title",
  "funds.currency.bob",
  "funds.currency.usd",
  "funds.disbursed",
  "funds.loaded",
  "funds.pendingAccounting",
  "funds.reviewedAccounting",
  "funds.withoutReceipt",
  "funds.resolve",
  "funds.status.draft",
  "funds.status.pendingApproval",
  "funds.status.pendingAccounting",
  "funds.status.observed",
  "funds.status.rejected",
  "funds.status.delivered",
  "funds.status.inSettlement",
  "funds.status.reviewed",
  "deadlines.title",
  "deadlines.timesheetDue",
  "deadlines.fundDueToday",
  "deadlines.fundDueSoon",
  "deadlines.fundOverdue",
  "deadlines.assignmentStarts",
  "deadlines.assignmentEnds",
  "deadlines.expenseCorrection",
  "management.title",
  "management.approvals",
  "historical.title",
  "historical.savedHours",
  "historical.byEngagement",
];

function getPath(obj: any, path: string): unknown {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]).sort();
}

describe("dashboard.personal.* i18n (dash_personal, plan_v2.md §8.3)", () => {
  it.each(EXPECTED_KEYS)("clave '%s' existe en ES y EN", (path) => {
    expect(getPath(personalEs, path)).toBeTypeOf("string");
    expect(getPath(personalEn, path)).toBeTypeOf("string");
  });

  it("paridad de interpolaciones {{param}} entre ES y EN para cada clave", () => {
    const mismatches: Array<{ path: string; es: string[]; en: string[] }> = [];
    for (const path of EXPECTED_KEYS) {
      const esVal = getPath(personalEs, path) as string;
      const enVal = getPath(personalEn, path) as string;
      const esParams = paramsOf(esVal);
      const enParams = paramsOf(enVal);
      if (JSON.stringify(esParams) !== JSON.stringify(enParams)) {
        mismatches.push({ path, es: esParams, en: enParams });
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("textos críticos exactos (ES)", () => {
    expect(personalEs.compliance.status.rejected).toBe("Rechazado");
    expect(personalEs.deadlines.fundDueToday).toBe("Rendición vence hoy");
    expect(personalEs.funds.status.pendingAccounting).toBe("Pendiente de contabilidad");
    expect(personalEs.funds.pendingAccounting).toBe("Pendiente de contabilidad");
    expect(personalEs.units.hours).toBe("{{hours}} h");
  });

  it("textos críticos exactos (EN)", () => {
    expect(personalEn.compliance.status.rejected).toBe("Rejected");
    expect(personalEn.deadlines.fundDueToday).toBe("Expense report due today");
    expect(personalEn.funds.status.pendingAccounting).toBe("Pending accounting");
    expect(personalEn.units.hours).toBe("{{hours}} h");
  });

  it("ningún estado de timesheet (compliance.status.*) usa la etiqueta 'Observado'/'Observed'", () => {
    const esStatuses = Object.values(personalEs.compliance.status) as string[];
    const enStatuses = Object.values(personalEn.compliance.status) as string[];
    expect(esStatuses.some((s) => /observad/i.test(s))).toBe(false);
    expect(enStatuses.some((s) => /observ/i.test(s))).toBe(false);
  });

  it("aprobado_gerente se presenta como Pendiente de contabilidad, nunca como un estado nuevo inventado", () => {
    // decisiones.md §3: mismo texto tanto en fund_requests.status como en
    // fund_request_expenses.status -- una sola clave de presentación (funds.status.pendingAccounting)
    // reutilizada por ambos dominios en PersonalTab.tsx.
    expect(personalEs.funds.status.pendingAccounting).toBe(personalEs.funds.pendingAccounting);
  });

  it("las claves legacy dashboard.personal.pendingHours.* fueron retiradas", () => {
    expect(personalEs.pendingHours).toBeUndefined();
    expect(personalEn.pendingHours).toBeUndefined();
  });

  it("la clave legacy dashboard.personal.thisMonth fue retirada (KPI 'Este mes' fuera de la vista inicial)", () => {
    expect(personalEs.thisMonth).toBeUndefined();
    expect(personalEn.thisMonth).toBeUndefined();
  });
});
