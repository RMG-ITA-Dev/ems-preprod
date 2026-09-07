import { describe, it, expect } from "vitest";
import { filterActivitiesForEngagement, filterWorksheetActivitiesByPractice } from "@/lib/activityFilters";

type TestActivity = {
  activity_id: string;
  is_system: boolean;
  service?: { code: number } | null;
};

const aud1: TestActivity = { activity_id: "aud-1", is_system: false, service: { code: 1 } };
const aud2: TestActivity = { activity_id: "aud-2", is_system: false, service: { code: 1 } };
const tax1: TestActivity = { activity_id: "tax-1", is_system: false, service: { code: 3 } };
const adm: TestActivity = { activity_id: "adm", is_system: true, service: null };

const all = [aud1, aud2, tax1, adm];

const ids = (list: TestActivity[]) => list.map((a) => a.activity_id);

describe("filterActivitiesForEngagement", () => {
  describe("funcion === 1 (cliente)", () => {
    it("shows only the matching practica's activities, excluding ADM", () => {
      expect(ids(filterActivitiesForEngagement(all, 1, 1))).toEqual(["aud-1", "aud-2"]);
    });

    it("matches a different practica code", () => {
      expect(ids(filterActivitiesForEngagement(all, 1, 3))).toEqual(["tax-1"]);
    });

    it("excludes activities from another practica", () => {
      const result = filterActivitiesForEngagement(all, 1, 1);
      expect(ids(result)).not.toContain("tax-1");
    });

    it("returns an empty list when practica is null", () => {
      expect(filterActivitiesForEngagement(all, 1, null)).toEqual([]);
    });

    it("returns an empty list when practica is undefined", () => {
      expect(filterActivitiesForEngagement(all, 1, undefined)).toEqual([]);
    });

    it("keeps the currently-selected activity visible even if it does not match", () => {
      // practica = 3 (Tax) but the current selection is an AUD activity (e.g. practica changed)
      const result = filterActivitiesForEngagement(all, 1, 3, "aud-1");
      expect(ids(result)).toEqual(["aud-1", "tax-1"]);
    });

    it("does not duplicate the current selection when it already matches", () => {
      const result = filterActivitiesForEngagement(all, 1, 1, "aud-1");
      expect(ids(result)).toEqual(["aud-1", "aud-2"]);
    });

    it("keeps the current selection visible even when it is ADM (stale from a funcion change)", () => {
      const result = filterActivitiesForEngagement(all, 1, 1, "adm");
      expect(ids(result)).toEqual(["aud-1", "aud-2", "adm"]);
    });
  });

  describe("funcion 0/2/3 (administrativa/capacitación/calidad)", () => {
    it("shows only ADM for funcion = 0", () => {
      expect(ids(filterActivitiesForEngagement(all, 0, null))).toEqual(["adm"]);
    });

    it("shows only ADM for funcion = 2, regardless of practica", () => {
      expect(ids(filterActivitiesForEngagement(all, 2, 1))).toEqual(["adm"]);
    });

    it("shows only ADM for funcion = 3", () => {
      expect(ids(filterActivitiesForEngagement(all, 3, null))).toEqual(["adm"]);
    });
  });

  describe("funcion == null (legacy, fail-closed)", () => {
    it("returns an empty list", () => {
      expect(filterActivitiesForEngagement(all, null, 1)).toEqual([]);
    });

    it("returns an empty list when funcion is undefined", () => {
      expect(filterActivitiesForEngagement(all, undefined, 1)).toEqual([]);
    });

    it("still keeps the currently-selected activity visible", () => {
      const result = filterActivitiesForEngagement(all, null, 1, "aud-1");
      expect(ids(result)).toEqual(["aud-1"]);
    });
  });
});

// 0825-183: strict practice scope for the work-order budget matrix — unlike
// filterActivitiesForEngagement, global/system activities (e.g. ADM) are never included.
type PracticeActivity = { activity_id: string; practica_id: string | null; is_system: boolean };

const AUD_ID = "practica-aud";
const TAX_ID = "practica-tax";

const pAud1: PracticeActivity = { activity_id: "aud-1", practica_id: AUD_ID, is_system: false };
const pTax1: PracticeActivity = { activity_id: "tax-1", practica_id: TAX_ID, is_system: false };
const pAdm: PracticeActivity = { activity_id: "adm", practica_id: null, is_system: true };
const pGlobalNonSystem: PracticeActivity = { activity_id: "legacy-global", practica_id: null, is_system: false };

const practiceAll = [pAud1, pTax1, pAdm, pGlobalNonSystem];
const practiceIds = (list: PracticeActivity[]) => list.map((a) => a.activity_id);

describe("filterWorksheetActivitiesByPractice", () => {
  it("shows only the matching practice's activities", () => {
    expect(practiceIds(filterWorksheetActivitiesByPractice(practiceAll, AUD_ID))).toEqual(["aud-1"]);
  });

  it("excludes activities from another practice", () => {
    const result = filterWorksheetActivitiesByPractice(practiceAll, AUD_ID);
    expect(practiceIds(result)).not.toContain("tax-1");
  });

  it("excludes ADM (system, practica_id null)", () => {
    const result = filterWorksheetActivitiesByPractice(practiceAll, AUD_ID);
    expect(practiceIds(result)).not.toContain("adm");
  });

  it("excludes any activity with practica_id null, global or not", () => {
    const result = filterWorksheetActivitiesByPractice(practiceAll, AUD_ID);
    expect(practiceIds(result)).not.toContain("legacy-global");
  });

  it("excludes system activities even when practica_id would otherwise match", () => {
    const systemWithPractica: PracticeActivity = { activity_id: "sys-aud", practica_id: AUD_ID, is_system: true };
    const result = filterWorksheetActivitiesByPractice([...practiceAll, systemWithPractica], AUD_ID);
    expect(practiceIds(result)).not.toContain("sys-aud");
  });

  it("returns an empty list when the practice is null", () => {
    expect(filterWorksheetActivitiesByPractice(practiceAll, null)).toEqual([]);
  });

  it("returns an empty list when the practice is undefined", () => {
    expect(filterWorksheetActivitiesByPractice(practiceAll, undefined)).toEqual([]);
  });
});
