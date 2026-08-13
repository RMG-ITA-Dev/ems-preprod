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
