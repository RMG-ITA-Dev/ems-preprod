// Fase 7 (plan v2 §D.1): extracted verbatim from i18n.terminology.test.ts so
// i18n.parity.test.ts can share them without duplicating the traversal logic.
// Safe as a non-suite file: vitest.config.ts only includes `*.{test,spec}.*`.

export function collectStrings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
  } else if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectStrings(value, out);
  }
  return out;
}

export function collectKeyPaths(node: unknown, prefix = "", out: string[] = []): string[] {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.push(path);
      collectKeyPaths(value, path, out);
    }
  }
  return out;
}
