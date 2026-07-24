import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

/**
 * BUG 0306-82: Verifies i18n keys for auto-generated engagement code fields.
 * practica_* keys removed (0625-149): service names now come from the DB catalog.
 */

const NEW_KEYS = [
  "oficina",
  "selectOficina",
  "practica",
  "selectPractica",
  "anioFiscal",
  "selectAnioFiscal",
  "oficina_laPaz",
  "oficina_santaCruz",
  "oficina_ambos",
  "funcion",
  "selectFuncion",
  "funcion_adm",
  "funcion_cli",
  "funcion_cap",
  "funcion_calidad",
  // BUG 0603-140: engagement code visibility (preview + post-create confirmation modal)
  "codePreviewHelp",
  "codePreviewIncomplete",
  "codeCreatedTitle",
  "codeCreatedDescription",
  "copyCode",
  "codeCopied",
  "codeCopyError",
  // BUG 0603-140 (enhancement): enriched post-creation modal
  "codeGeneratedLabel",
  "summaryTitle",
  "createAnother",
  "goToWorkMatrix",
  // BUG 0604-143: closing date drives the derived Año Fiscal
  "closingDate",
  "selectClosingDate",
  "closingDate_otro",
  "closingDateCustom",
  "fiscalYearHelper",
  "fiscalYearOverride",
  "immutabilityHint",
  "requiredClosingDate",
  "requiredClosingDateCustom",
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

  // 0625-149: service names come from the catalog — practica_* keys deleted
  it("EN engagement no longer has practica_firmwide (catalog-driven)", () => {
    expect((en as any).engagement["practica_firmwide"]).toBeUndefined();
  });

  it("EN engagement.anioFiscal is 'Fiscal Year'", () => {
    expect((en as any).engagement.anioFiscal).toBe("Fiscal Year");
  });

  it("ES engagement.anioFiscal is 'Año Fiscal'", () => {
    expect((es as any).engagement.anioFiscal).toBe("Año Fiscal");
  });

  it("EN engagement.oficina_ambos is 'Both Offices'", () => {
    expect((en as any).engagement["oficina_ambos"]).toBe("Both Offices");
  });

  it("ES engagement.oficina_ambos is 'Ambos'", () => {
    expect((es as any).engagement["oficina_ambos"]).toBe("Ambos");
  });

  it("EN engagement.funcion is 'Function'", () => {
    expect((en as any).engagement.funcion).toBe("Function");
  });

  it("ES engagement.funcion is 'Función'", () => {
    expect((es as any).engagement.funcion).toBe("Función");
  });

  it("EN engagement.funcion_adm is 'Administrative'", () => {
    expect((en as any).engagement["funcion_adm"]).toBe("Administrative");
  });

  it("ES engagement.funcion_adm is 'Administrativa'", () => {
    expect((es as any).engagement["funcion_adm"]).toBe("Administrativa");
  });

  it("EN engagement.funcion_cli is 'Client'", () => {
    expect((en as any).engagement["funcion_cli"]).toBe("Client");
  });

  it("ES engagement.funcion_cli is 'Cliente'", () => {
    expect((es as any).engagement["funcion_cli"]).toBe("Cliente");
  });

  it("EN engagement.funcion_cap is 'Training'", () => {
    expect((en as any).engagement["funcion_cap"]).toBe("Training");
  });

  it("ES engagement.funcion_cap is 'Capacitación'", () => {
    expect((es as any).engagement["funcion_cap"]).toBe("Capacitación");
  });

  it("EN engagement.funcion_calidad is 'Quality Control'", () => {
    expect((en as any).engagement["funcion_calidad"]).toBe("Quality Control");
  });

  it("ES engagement.funcion_calidad is 'Control de Calidad'", () => {
    expect((es as any).engagement["funcion_calidad"]).toBe("Control de Calidad");
  });
});
