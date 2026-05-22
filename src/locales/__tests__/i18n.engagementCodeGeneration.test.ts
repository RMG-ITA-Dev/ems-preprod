import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

/**
 * BUG 0306-82: Verifies all 11 new i18n keys for auto-generated engagement code fields.
 */

const NEW_KEYS = [
  "oficina",
  "selectOficina",
  "practica",
  "selectPractica",
  "anioFiscal",
  "selectAnioFiscal",
  "oficina.laPaz",
  "oficina.santaCruz",
  "practica.auditoria",
  "practica.consultoria",
  "practica.tax",
] as const;

describe("i18n engagement code-generation keys (BUG 0306-82)", () => {
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

  it("EN engagement.oficina is 'Office'", () => {
    expect((en as any).engagement.oficina).toBe("Office");
  });

  it("ES engagement.oficina is 'Oficina'", () => {
    expect((es as any).engagement.oficina).toBe("Oficina");
  });

  it("EN engagement.practica is 'Practice'", () => {
    expect((en as any).engagement.practica).toBe("Practice");
  });

  it("ES engagement.practica is 'Práctica'", () => {
    expect((es as any).engagement.practica).toBe("Práctica");
  });

  it("EN engagement.anioFiscal is 'Fiscal Year'", () => {
    expect((en as any).engagement.anioFiscal).toBe("Fiscal Year");
  });

  it("ES engagement.anioFiscal is 'Año Fiscal'", () => {
    expect((es as any).engagement.anioFiscal).toBe("Año Fiscal");
  });
});
