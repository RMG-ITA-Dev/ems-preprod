// Fase 3 — permisos de navegación del Scheduler. Los mismos predicados
// gatean App.tsx (en página), AppSidebar y MobileMoreDrawer; esta prueba
// fija la matriz de roles para que no diverjan entre sí.

import { describe, it, expect } from "vitest";
import { canSeeGaps, canSeePlanning, type SchedulerAccessRoleFlags } from "@/lib/schedulerAccess";

const flags = (over: Partial<SchedulerAccessRoleFlags> = {}): SchedulerAccessRoleFlags => ({
  isAdmin: false,
  isPartner: false,
  isDirector: false,
  isManager: false,
  isSenior: false,
  ...over,
});

describe("canSeePlanning — L1/L2/Staff timeline: firmwide + manager + senior", () => {
  it.each([
    ["isAdmin", flags({ isAdmin: true })],
    ["isPartner", flags({ isPartner: true })],
    ["isDirector", flags({ isDirector: true })],
    ["isManager", flags({ isManager: true })],
    ["isSenior", flags({ isSenior: true })],
  ])("%s → true", (_label, f) => {
    expect(canSeePlanning(f)).toBe(true);
  });

  it("ningún rol → false", () => {
    expect(canSeePlanning(flags())).toBe(false);
  });

  it("semisenior/staff/viewer (todos los flags en false) → false", () => {
    expect(canSeePlanning(flags())).toBe(false);
  });
});

describe("canSeeGaps — Gap Reporting: firmwide únicamente (admin/partner/director)", () => {
  it.each([
    ["isAdmin", flags({ isAdmin: true })],
    ["isPartner", flags({ isPartner: true })],
    ["isDirector", flags({ isDirector: true })],
  ])("%s → true", (_label, f) => {
    expect(canSeeGaps(f)).toBe(true);
  });

  it("manager → false (no es firmwide)", () => {
    expect(canSeeGaps(flags({ isManager: true }))).toBe(false);
  });

  it("senior → false (no es firmwide)", () => {
    expect(canSeeGaps(flags({ isSenior: true }))).toBe(false);
  });

  it("ningún rol → false", () => {
    expect(canSeeGaps(flags())).toBe(false);
  });
});
