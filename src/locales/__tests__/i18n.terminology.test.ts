import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import { collectStrings } from "./localeKeyHelpers";

/**
 * BUG 0723-168: Renombrar "Servicio" -> "Práctica" y "Taxonomía" -> "Servicio" (solo i18n).
 * Guards the terminology swap: keys are unchanged, only the visible ES/EN values move.
 */

describe("i18n terminology rename (BUG 0723-168)", () => {
  it("EN entities.service/services renamed to Practice/Practices", () => {
    expect((en as any).entities.service).toBe("Practice");
    expect((en as any).entities.services).toBe("Practices");
  });

  it("ES entities.service/services renamed to Práctica/Prácticas", () => {
    expect((es as any).entities.service).toBe("Práctica");
    expect((es as any).entities.services).toBe("Prácticas");
  });

  it("EN entities.taxonomy/taxonomies renamed to Service/Services", () => {
    expect((en as any).entities.taxonomy).toBe("Service");
    expect((en as any).entities.taxonomies).toBe("Services");
  });

  it("ES entities.taxonomy/taxonomies renamed to Servicio/Servicios", () => {
    expect((es as any).entities.taxonomy).toBe("Servicio");
    expect((es as any).entities.taxonomies).toBe("Servicios");
  });

  it("EN settings.services/taxonomies renamed to Practices/Services", () => {
    expect((en as any).settings.services).toBe("Practices");
    expect((en as any).settings.taxonomies).toBe("Services");
  });

  it("ES settings.services/taxonomies renamed to Prácticas/Servicios", () => {
    expect((es as any).settings.services).toBe("Prácticas");
    expect((es as any).settings.taxonomies).toBe("Servicios");
  });

  it("EN engagement.practica/taxonomy renamed to Practice/Service", () => {
    expect((en as any).engagement.practica).toBe("Practice");
    expect((en as any).engagement.taxonomy).toBe("Service");
  });

  it("ES engagement.practica/taxonomy renamed to Práctica/Servicio", () => {
    expect((es as any).engagement.practica).toBe("Práctica");
    expect((es as any).engagement.taxonomy).toBe("Servicio");
  });

  it("EN taxonomy.service cross-reference renamed to Practice", () => {
    expect((en as any).taxonomy.service).toBe("Practice");
  });

  it("ES taxonomy.service cross-reference renamed to Práctica", () => {
    expect((es as any).taxonomy.service).toBe("Práctica");
  });

  it("EN engagement.codePreviewIncomplete uses 'practice', not 'service'/'taxonomy'", () => {
    const value = (en as any).engagement.codePreviewIncomplete as string;
    expect(value.toLowerCase()).toContain("practice");
    expect(value.toLowerCase()).not.toContain("service");
    expect(value.toLowerCase()).not.toContain("taxonom");
  });

  it("ES engagement.codePreviewIncomplete uses 'práctica', not 'servicio'/'taxonomía'", () => {
    const value = (es as any).engagement.codePreviewIncomplete as string;
    expect(value.toLowerCase()).toContain("práctica");
    expect(value.toLowerCase()).not.toContain("servicio");
    expect(value.toLowerCase()).not.toContain("taxonom");
  });

  const ENGAGEMENT_PRACTICE_KEYS = ["selectPractica", "requiredPractica"] as const;
  const ENGAGEMENT_SERVICE_KEYS = [
    "selectTaxonomy",
    "searchTaxonomy",
    "noMatchingTaxonomies",
    "requiredTaxonomyCliente",
  ] as const;

  for (const key of ENGAGEMENT_PRACTICE_KEYS) {
    it(`EN engagement.${key} carries the new "practice" terminology`, () => {
      expect((en as any).engagement[key].toLowerCase()).toContain("practice");
    });

    it(`ES engagement.${key} carries the new "práctica" terminology`, () => {
      expect((es as any).engagement[key].toLowerCase()).toContain("práctica");
    });
  }

  for (const key of ENGAGEMENT_SERVICE_KEYS) {
    it(`EN engagement.${key} carries the new "service" terminology`, () => {
      expect((en as any).engagement[key].toLowerCase()).toContain("service");
    });

    it(`ES engagement.${key} carries the new "servicio" terminology`, () => {
      expect((es as any).engagement[key].toLowerCase()).toContain("servicio");
    });
  }

  it("EN activityServiceMismatch/noServiceOnEngagement/categoryServiceRequired use 'practice'", () => {
    expect((en as any).tracker.activityServiceMismatch.toLowerCase()).toContain("practice");
    expect((en as any).workMatrix.noServiceOnEngagement.toLowerCase()).toContain("practice");
    expect((en as any).validation.categoryServiceRequired.toLowerCase()).toContain("practice");
  });

  it("ES activityServiceMismatch/noServiceOnEngagement/categoryServiceRequired use 'práctica'", () => {
    expect((es as any).tracker.activityServiceMismatch.toLowerCase()).toContain("práctica");
    expect((es as any).workMatrix.noServiceOnEngagement.toLowerCase()).toContain("práctica");
    expect((es as any).validation.categoryServiceRequired.toLowerCase()).toContain("práctica");
  });

  it("EN engagement.codeCreatedDescription uses 'practice', not 'service'", () => {
    const value = (en as any).engagement.codeCreatedDescription as string;
    expect(value.toLowerCase()).toContain("practice");
    expect(value.toLowerCase()).not.toContain("service");
  });

  it("ES engagement.codeCreatedDescription uses 'práctica', not 'servicio'", () => {
    const value = (es as any).engagement.codeCreatedDescription as string;
    expect(value.toLowerCase()).toContain("práctica");
    expect(value.toLowerCase()).not.toContain("servicio");
  });

  it("EN activity.formDescription uses 'practice linkage', not 'service linkage'", () => {
    const value = (en as any).activity.formDescription as string;
    expect(value.toLowerCase()).toContain("practice linkage");
    expect(value.toLowerCase()).not.toContain("service linkage");
  });

  it("EN dashboard.tabs.practica remains 'Practice' (unchanged)", () => {
    expect((en as any).dashboard.tabs.practica).toBe("Practice");
  });

  it("ES dashboard.tabs.practica remains 'Práctica' (unchanged)", () => {
    expect((es as any).dashboard.tabs.practica).toBe("Práctica");
  });

  it("no visible 'Taxonomía'/'Taxonomías' token remains in ES string values", () => {
    const offenders = collectStrings(es).filter((s) => /taxonom/i.test(s));
    expect(offenders).toEqual([]);
  });

  it("no visible 'Taxonomy'/'Taxonomies' token remains in EN string values", () => {
    const offenders = collectStrings(en).filter((s) => /taxonom/i.test(s));
    expect(offenders).toEqual([]);
  });

  // EN/ES key-shape parity moved to src/locales/__tests__/i18n.parity.test.ts
  // (Fase 7, plan v2 §D.2) — that suite owns the full structural contract.
});
