import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import { collectKeyPaths } from "./localeKeyHelpers";

// Fase 7 (plan v2 §D.3, §11 "Validar JSON de locales" + §17 "paridad completa
// EN/ES"): a permanent structural guard over both locale files. Both imports
// already fail the whole suite if either JSON is malformed, so "valid JSON"
// needs no separate assertion here.

function collectLeafPaths(node: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      collectLeafPaths(value, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out[prefix] = node;
  }
  return out;
}

function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((m) => m[1]).sort();
}

describe("i18n EN/ES parity (Fase 7, plan v2 §D.3)", () => {
  const enPaths = collectKeyPaths(en);
  const esPaths = collectKeyPaths(es);
  const enLeaves = collectLeafPaths(en);
  const esLeaves = collectLeafPaths(es);

  it("EN and ES expose identical key-path sets (directional diff on failure)", () => {
    const enSet = new Set(enPaths);
    const esSet = new Set(esPaths);
    const missingInEs = enPaths.filter((p) => !esSet.has(p));
    const missingInEn = esPaths.filter((p) => !enSet.has(p));
    expect({ missingInEs, missingInEn }).toEqual({ missingInEs: [], missingInEn: [] });
  });

  it("every shared leaf has the same typeof in both locales", () => {
    const mismatches = Object.keys(enLeaves)
      .filter((path) => path in esLeaves)
      .filter((path) => typeof enLeaves[path] !== typeof esLeaves[path])
      .map((path) => ({ path, en: typeof enLeaves[path], es: typeof esLeaves[path] }));
    expect(mismatches).toEqual([]);
  });

  it("no leaf is an empty or whitespace-only string in either locale", () => {
    const blankIn = (leaves: Record<string, unknown>) =>
      Object.entries(leaves)
        .filter(([, v]) => typeof v === "string" && v.trim() === "")
        .map(([path]) => path);
    expect({ en: blankIn(enLeaves), es: blankIn(esLeaves) }).toEqual({ en: [], es: [] });
  });

  it("every shared leaf interpolates the same {{param}} set in both locales", () => {
    const mismatches: Array<{ path: string; en: string[]; es: string[] }> = [];
    for (const path of Object.keys(enLeaves)) {
      if (!(path in esLeaves)) continue;
      const enVal = enLeaves[path];
      const esVal = esLeaves[path];
      if (typeof enVal !== "string" || typeof esVal !== "string") continue;
      const enParams = paramsOf(enVal);
      const esParams = paramsOf(esVal);
      if (JSON.stringify(enParams) !== JSON.stringify(esParams)) {
        mismatches.push({ path, en: enParams, es: esParams });
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("no array values exist in either locale (would silently escape the leaf assertions above)", () => {
    const findArrays = (node: unknown, prefix = "", out: string[] = []): string[] => {
      if (Array.isArray(node)) {
        out.push(prefix);
      } else if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          findArrays(value, prefix ? `${prefix}.${key}` : key, out);
        }
      }
      return out;
    };
    expect({ en: findArrays(en), es: findArrays(es) }).toEqual({ en: [], es: [] });
  });

  it("the dead 'entities.expenseLog' key (removed Expenses module) is absent from both locales", () => {
    expect("entities.expenseLog" in enLeaves).toBe(false);
    expect("entities.expenseLog" in esLeaves).toBe(false);
  });
});
