import { describe, it, expect } from "vitest";
import esJson from "@/locales/es.json";
import enJson from "@/locales/en.json";

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((current: unknown, key) => {
    if (current && typeof current === "object") {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

const NEW_KEYS = [
  "tracker.exportBlockedDbError",
  "tracker.dbErrorReasonApprovedLine",
  "tracker.dbErrorReasonGeneric",
];

describe("i18n new keys from bug 0306-77", () => {
  NEW_KEYS.forEach((key) => {
    it(`es.json has key: ${key}`, () => {
      expect(getNestedValue(esJson as Record<string, unknown>, key)).toBeDefined();
    });

    it(`en.json has key: ${key}`, () => {
      expect(getNestedValue(enJson as Record<string, unknown>, key)).toBeDefined();
    });
  });
});
