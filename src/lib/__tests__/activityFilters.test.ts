import { describe, it, expect } from "vitest";
import { filterActivitiesByService } from "@/lib/activityFilters";

type TestActivity = {
  activity_id: string;
  service?: { code: number } | null;
};

const aud1: TestActivity = { activity_id: "aud-1", service: { code: 1 } };
const aud2: TestActivity = { activity_id: "aud-2", service: { code: 1 } };
const tax1: TestActivity = { activity_id: "tax-1", service: { code: 3 } };
const adm: TestActivity = { activity_id: "adm", service: null };
const legacy: TestActivity = { activity_id: "legacy", service: undefined };
const firmwide: TestActivity = { activity_id: "fir-1", service: { code: 0 } };

const all = [aud1, aud2, tax1, adm, legacy, firmwide];

const ids = (list: TestActivity[]) => list.map((a) => a.activity_id);

describe("filterActivitiesByService", () => {
  it("shows only the matching service's activities plus globals", () => {
    // Engagement with practica = 1 (Auditoría) → AUD-* + globals (adm, legacy)
    expect(ids(filterActivitiesByService(all, 1))).toEqual([
      "aud-1",
      "aud-2",
      "adm",
      "legacy",
    ]);
  });

  it("matches a different service code", () => {
    // practica = 3 (Tax) → TAX-* + globals
    expect(ids(filterActivitiesByService(all, 3))).toEqual(["tax-1", "adm", "legacy"]);
  });

  it("treats both null and undefined service as global (always shown)", () => {
    const result = filterActivitiesByService(all, 1);
    expect(ids(result)).toContain("adm"); // service: null
    expect(ids(result)).toContain("legacy"); // service: undefined
  });

  it("handles code 0 (Firmwide → FIR)", () => {
    expect(ids(filterActivitiesByService(all, 0))).toEqual(["adm", "legacy", "fir-1"]);
  });

  it("shows only globals when the engagement has no service (practica = null)", () => {
    expect(ids(filterActivitiesByService(all, null))).toEqual(["adm", "legacy"]);
  });

  it("shows only globals when practica is undefined", () => {
    expect(ids(filterActivitiesByService(all, undefined))).toEqual(["adm", "legacy"]);
  });

  it("keeps the currently-selected activity visible even if it does not match", () => {
    // practica = 3 (Tax) but the current selection is an AUD activity (e.g. service changed)
    const result = filterActivitiesByService(all, 3, "aud-1");
    expect(ids(result)).toEqual(["aud-1", "tax-1", "adm", "legacy"]);
  });

  it("does not duplicate the current selection when it already matches", () => {
    const result = filterActivitiesByService(all, 1, "aud-1");
    expect(ids(result)).toEqual(["aud-1", "aud-2", "adm", "legacy"]);
  });
});
