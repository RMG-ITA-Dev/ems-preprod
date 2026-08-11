import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

// Fase 7 (plan v2 §C, §D "Tests to Add/Update"): the 10 i18n keys introduced
// to move Auth.tsx's hardcoded strings into i18n resolve to a non-empty
// string in both locales, and the two that interpolate {{domain}} actually
// carry the token.

const DIRECT_KEYS = [
  "brandTagline",
  "firstNamePlaceholder",
  "lastNamePlaceholder",
  "emailPlaceholderWithDomain",
] as const;

const VALIDATION_KEYS = [
  "emailMax",
  "passwordMinSignin",
  "passwordMinSignup",
  "passwordMax",
  "nameMax",
  "emailDomainOnly",
] as const;

const DOMAIN_KEYS = new Set(["emailPlaceholderWithDomain", "auth.validation.emailDomainOnly"]);

describe("i18n new Auth.tsx keys (Fase 7, plan v2 §C)", () => {
  for (const key of DIRECT_KEYS) {
    it(`auth.${key} resolves to a non-empty string in EN and ES`, () => {
      const enVal = (en as any).auth[key];
      const esVal = (es as any).auth[key];
      expect(typeof enVal).toBe("string");
      expect(enVal.trim().length).toBeGreaterThan(0);
      expect(typeof esVal).toBe("string");
      expect(esVal.trim().length).toBeGreaterThan(0);
      if (DOMAIN_KEYS.has(key)) {
        expect(enVal).toContain("{{domain}}");
        expect(esVal).toContain("{{domain}}");
      }
    });
  }

  for (const key of VALIDATION_KEYS) {
    it(`auth.validation.${key} resolves to a non-empty string in EN and ES`, () => {
      const enVal = (en as any).auth.validation[key];
      const esVal = (es as any).auth.validation[key];
      expect(typeof enVal).toBe("string");
      expect(enVal.trim().length).toBeGreaterThan(0);
      expect(typeof esVal).toBe("string");
      expect(esVal.trim().length).toBeGreaterThan(0);
      if (DOMAIN_KEYS.has(`auth.validation.${key}`)) {
        expect(enVal).toContain("{{domain}}");
        expect(esVal).toContain("{{domain}}");
      }
    });
  }
});
