import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

/**
 * BUG 0306-82: Verifies all 20 new i18n keys for auto-generated engagement code fields.
 * Includes Plan v3 item 5 (funcion.*), additional locale changes (oficina.ambos,
 * practica.firmwide) and Growth & Strategy (practica.growthStrategy).
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
  "oficina.ambos",
  "practica.auditoria",
  "practica.consultoria",
  "practica.tax",
  "practica.firmwide",
  "practica.growthStrategy",
  "funcion",
  "selectFuncion",
  "funcion.adm",
  "funcion.cli",
  "funcion.cap",
  "funcion.calidad",
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

  it("EN engagement.practica is 'Service'", () => {
    expect((en as any).engagement.practica).toBe("Service");
  });

  it("ES engagement.practica is 'Servicio'", () => {
    expect((es as any).engagement.practica).toBe("Servicio");
  });

  it("EN engagement.anioFiscal is 'Fiscal Year'", () => {
    expect((en as any).engagement.anioFiscal).toBe("Fiscal Year");
  });

  it("ES engagement.anioFiscal is 'Año Fiscal'", () => {
    expect((es as any).engagement.anioFiscal).toBe("Año Fiscal");
  });

  it("EN engagement.oficina.ambos is 'Both Offices'", () => {
    expect((en as any).engagement["oficina.ambos"]).toBe("Both Offices");
  });

  it("ES engagement.oficina.ambos is 'Ambos'", () => {
    expect((es as any).engagement["oficina.ambos"]).toBe("Ambos");
  });

  it("EN engagement.practica.firmwide is 'Firmwide'", () => {
    expect((en as any).engagement["practica.firmwide"]).toBe("Firmwide");
  });

  it("ES engagement.practica.firmwide is 'Firmwide'", () => {
    expect((es as any).engagement["practica.firmwide"]).toBe("Firmwide");
  });

  it("EN engagement.practica.growthStrategy is 'Growth & Strategy'", () => {
    expect((en as any).engagement["practica.growthStrategy"]).toBe("Growth & Strategy");
  });

  it("ES engagement.practica.growthStrategy is 'Growth & Strategy'", () => {
    expect((es as any).engagement["practica.growthStrategy"]).toBe("Growth & Strategy");
  });

  it("EN engagement.funcion is 'Function'", () => {
    expect((en as any).engagement.funcion).toBe("Function");
  });

  it("ES engagement.funcion is 'Función'", () => {
    expect((es as any).engagement.funcion).toBe("Función");
  });

  it("EN engagement.funcion.adm is 'Administrative'", () => {
    expect((en as any).engagement["funcion.adm"]).toBe("Administrative");
  });

  it("ES engagement.funcion.adm is 'Administrativa'", () => {
    expect((es as any).engagement["funcion.adm"]).toBe("Administrativa");
  });

  it("EN engagement.funcion.cli is 'Client'", () => {
    expect((en as any).engagement["funcion.cli"]).toBe("Client");
  });

  it("ES engagement.funcion.cli is 'Cliente'", () => {
    expect((es as any).engagement["funcion.cli"]).toBe("Cliente");
  });

  it("EN engagement.funcion.cap is 'Training'", () => {
    expect((en as any).engagement["funcion.cap"]).toBe("Training");
  });

  it("ES engagement.funcion.cap is 'Capacitación'", () => {
    expect((es as any).engagement["funcion.cap"]).toBe("Capacitación");
  });

  it("EN engagement.funcion.calidad is 'Quality Control'", () => {
    expect((en as any).engagement["funcion.calidad"]).toBe("Quality Control");
  });

  it("ES engagement.funcion.calidad is 'Control de Calidad'", () => {
    expect((es as any).engagement["funcion.calidad"]).toBe("Control de Calidad");
  });
});
