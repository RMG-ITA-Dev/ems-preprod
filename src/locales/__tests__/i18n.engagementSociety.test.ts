import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

/**
 * FEAT 0714-155: i18n keys for the "Sociedad" field on Nuevo Encargo. Named "society"
 * (not "firma") to stay consistent with the existing staff.society/staff.selectSociety
 * terminology (0810-173) and avoid introducing a second term for the same concept.
 */

const NEW_KEYS = ["society", "selectSociety", "requiredSociety"] as const;

describe("i18n engagement society keys (FEAT 0714-155)", () => {
  for (const key of NEW_KEYS) {
    it(`EN has engagement.${key}`, () => {
      expect((en as any).engagement[key]).toBeDefined();
      expect(typeof (en as any).engagement[key]).toBe("string");
      expect((en as any).engagement[key].length).toBeGreaterThan(0);
    });

    it(`ES has engagement.${key}`, () => {
      expect((es as any).engagement[key]).toBeDefined();
      expect(typeof (es as any).engagement[key]).toBe("string");
      expect((es as any).engagement[key].length).toBeGreaterThan(0);
    });
  }

  it("EN engagement.society is 'Society'", () => {
    expect((en as any).engagement.society).toBe("Society");
  });

  it("ES engagement.society is 'Sociedad'", () => {
    expect((es as any).engagement.society).toBe("Sociedad");
  });

  it("EN immutabilityHint mentions society", () => {
    expect((en as any).engagement.immutabilityHint).toMatch(/society/i);
  });

  it("ES immutabilityHint mentions sociedad", () => {
    expect((es as any).engagement.immutabilityHint).toMatch(/sociedad/i);
  });
});

/**
 * 0722-157: new keys introduced by the Encargo form reorder — the "Clasificación" section
 * title, the required-fields legend, and the worksheet-engagement combobox's search copy.
 * Global EN/ES parity is already covered by i18n.parity.test.ts; this only asserts presence.
 */
describe("i18n keys for the Encargo form reorder (0722-157)", () => {
  const ENGAGEMENT_KEYS = ["sectionClassification", "requiredFieldsLegend"] as const;

  for (const key of ENGAGEMENT_KEYS) {
    it(`EN has engagement.${key}`, () => {
      expect((en as any).engagement[key]).toBeDefined();
      expect((en as any).engagement[key].length).toBeGreaterThan(0);
    });

    it(`ES has engagement.${key}`, () => {
      expect((es as any).engagement[key]).toBeDefined();
      expect((es as any).engagement[key].length).toBeGreaterThan(0);
    });
  }

  const WORKSHEET_KEYS = ["searchEngagement", "noEngagementResults"] as const;

  for (const key of WORKSHEET_KEYS) {
    it(`EN has worksheet.${key}`, () => {
      expect((en as any).worksheet[key]).toBeDefined();
      expect((en as any).worksheet[key].length).toBeGreaterThan(0);
    });

    it(`ES has worksheet.${key}`, () => {
      expect((es as any).worksheet[key]).toBeDefined();
      expect((es as any).worksheet[key].length).toBeGreaterThan(0);
    });
  }
});

/**
 * BUG 0817-180: sociedad/práctica/oficina se restringen a la ficha del creador restringido —
 * hint de "asignado por tu ficha" en los tres selects, y el detalle de perfil incompleto.
 */
describe("i18n keys for the restricted-creator profile scope (BUG 0817-180)", () => {
  const ENGAGEMENT_KEYS = ["profileScopeHint", "profileMissingStaff"] as const;

  for (const key of ENGAGEMENT_KEYS) {
    it(`EN has engagement.${key}`, () => {
      expect((en as any).engagement[key]).toBeDefined();
      expect(typeof (en as any).engagement[key]).toBe("string");
      expect((en as any).engagement[key].length).toBeGreaterThan(0);
    });

    it(`ES has engagement.${key}`, () => {
      expect((es as any).engagement[key]).toBeDefined();
      expect(typeof (es as any).engagement[key]).toBe("string");
      expect((es as any).engagement[key].length).toBeGreaterThan(0);
    });
  }

  it("EN has messages.profileIncompleteForEngagement with a {{fields}} placeholder", () => {
    expect((en as any).messages.profileIncompleteForEngagement).toBeDefined();
    expect((en as any).messages.profileIncompleteForEngagement).toMatch(/\{\{fields\}\}/);
  });

  it("ES has messages.profileIncompleteForEngagement with a {{fields}} placeholder", () => {
    expect((es as any).messages.profileIncompleteForEngagement).toBeDefined();
    expect((es as any).messages.profileIncompleteForEngagement).toMatch(/\{\{fields\}\}/);
  });
});
