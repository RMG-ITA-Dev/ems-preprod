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

const NEW_KEYS_0625_151 = [
  "engagement.contractScanned",
  "engagement.contractRequired",
  "engagement.uploadContract",
  "engagement.contractUploaded",
  "engagement.contractUploadFailed",
  "engagement.contractDownloadFailed",
  "engagement.invalidContractFileType",
  "engagement.contractFileTooLarge",
  "engagement.downloadContract",
  "engagement.removeContract",
];

describe("i18n new keys from bug 0625-151 (contrato escaneado)", () => {
  NEW_KEYS_0625_151.forEach((key) => {
    it(`es.json has key: ${key}`, () => {
      expect(getNestedValue(esJson as Record<string, unknown>, key)).toBeDefined();
    });

    it(`en.json has key: ${key}`, () => {
      expect(getNestedValue(enJson as Record<string, unknown>, key)).toBeDefined();
    });
  });
});

// BUG 0722-162: el aviso de personal faltante en el bloque Equipo pasó a decidirse por ROL
// (user_roles.role_key) en vez de por categoría, así que el texto también cambió — el viejo
// mandaba a agregar categorías en Configuración, lo que ya no habilita el botón Crear.
const NEW_KEYS_0722_162 = ["messages.missingTeamRoles"];

describe("i18n new keys from bug 0722-162 (roles del bloque Equipo)", () => {
  NEW_KEYS_0722_162.forEach((key) => {
    it(`es.json has key: ${key}`, () => {
      expect(getNestedValue(esJson as Record<string, unknown>, key)).toBeDefined();
    });

    it(`en.json has key: ${key}`, () => {
      expect(getNestedValue(enJson as Record<string, unknown>, key)).toBeDefined();
    });
  });

  it("el mensaje dirige a Roles de Usuario, no a agregar categorías", () => {
    expect(esJson.messages.missingTeamRoles).toContain("Roles de Usuario");
    expect(esJson.messages.missingTeamRoles).not.toContain("categorías");
    expect(enJson.messages.missingTeamRoles).toContain("User Roles");
    expect(enJson.messages.missingTeamRoles).not.toContain("categories");
  });

  it("interpola {{roles}}, no {{categories}}", () => {
    expect(esJson.messages.missingTeamRoles).toContain("{{roles}}");
    expect(enJson.messages.missingTeamRoles).toContain("{{roles}}");
  });
});

const REPORT_KEYS_0319_91 = [
  "fundRequestExpense.report.exportButton",
  "fundRequestExpense.report.title",
  "fundRequestExpense.report.sheetName",
  "fundRequestExpense.report.filenamePrefix",
  "fundRequestExpense.report.filenameFallback",
  "fundRequestExpense.report.workOrdersSection",
  "fundRequestExpense.report.engagement",
  "fundRequestExpense.report.allocated",
  "fundRequestExpense.report.allocatedScoped",
  "fundRequestExpense.report.detailSection",
  "fundRequestExpense.report.documentNumber",
  "fundRequestExpense.report.supplier",
  "fundRequestExpense.report.supplierTaxId",
  "fundRequestExpense.report.currency",
  "fundRequestExpense.report.iva",
  "fundRequestExpense.report.total",
  "fundRequestExpense.report.exportError",
];

describe("i18n new keys from bug 0319-91 (expense report export)", () => {
  REPORT_KEYS_0319_91.forEach((key) => {
    it(`es.json has key: ${key}`, () => {
      expect(getNestedValue(esJson as Record<string, unknown>, key)).toBeDefined();
    });

    it(`en.json has key: ${key}`, () => {
      expect(getNestedValue(enJson as Record<string, unknown>, key)).toBeDefined();
    });
  });
});

describe("i18n capitalization — bug 0625-147", () => {
  it("ES userRoles.roles.specialist_tax is 'Especialista Tax'", () => {
    expect((esJson as any).userRoles.roles.specialist_tax).toBe("Especialista Tax");
  });

  it("EN userRoles.roles.specialist_tax is 'Tax Specialist'", () => {
    expect((enJson as any).userRoles.roles.specialist_tax).toBe("Tax Specialist");
  });
});
