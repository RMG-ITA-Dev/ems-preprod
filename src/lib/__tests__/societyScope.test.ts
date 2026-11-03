import { describe, it, expect } from "vitest";
import { isSocietyScopedRole, societyScopeErrorKey } from "../societyScope";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

// Espejo de public.is_society_scoped_role_key(): si una lista cambia sin la otra, la pantalla
// muestra filtros que el servidor ignora (o esconde los que sí aplican).
describe("isSocietyScopedRole", () => {
  it("los tres roles de Contabilidad y Cobranzas están limitados a su sociedad", () => {
    expect(isSocietyScopedRole("accounting_manager")).toBe(true);
    expect(isSocietyScopedRole("accounting_analyst")).toBe(true);
    expect(isSocietyScopedRole("collections_analyst")).toBe(true);
  });

  it("admin, socios y el resto no", () => {
    for (const role of ["admin", "partner", "senior_partner", "manager", null, undefined, ""]) {
      expect(isSocietyScopedRole(role)).toBe(false);
    }
  });
});

describe("societyScopeErrorKey", () => {
  it("reconoce los tres rechazos del servidor por su prefijo", () => {
    expect(societyScopeErrorKey("SOCIETY_SCOPE_FORBIDDEN: la orden de trabajo no pertenece a su sociedad"))
      .toBe("errors.societyScopeForbidden");
    expect(societyScopeErrorKey("FUND_REQUEST_SOCIETY_MISMATCH: solo se pueden pedir fondos ..."))
      .toBe("errors.fundRequestSocietyMismatch");
    expect(societyScopeErrorKey("ENGAGEMENT_SOCIETY_LOCKED: el encargo tiene solicitudes ..."))
      .toBe("errors.engagementSocietyLocked");
  });

  it("reconoce el rechazo por no ser del equipo ni estar asignado al encargo (0923-202)", () => {
    expect(societyScopeErrorKey("FUND_REQUEST_ENGAGEMENT_FORBIDDEN: solo se pueden pedir fondos ..."))
      .toBe("errors.fundRequestEngagementForbidden");
  });

  it("cualquier otro mensaje no es un rechazo por sociedad", () => {
    expect(societyScopeErrorKey("new row violates row-level security policy")).toBeNull();
    expect(societyScopeErrorKey("CONTACT_FORBIDDEN: no tiene acceso")).toBeNull();
    expect(societyScopeErrorKey(undefined)).toBeNull();
  });
});

describe("traducciones de los rechazos por sociedad", () => {
  it("las tres claves existen en inglés y en español", () => {
    for (const key of ["societyScopeForbidden", "fundRequestSocietyMismatch", "engagementSocietyLocked",
                       "fundRequestEngagementForbidden"]) {
      expect((en.errors as Record<string, string>)[key]).toBeTruthy();
      expect((es.errors as Record<string, string>)[key]).toBeTruthy();
    }
  });
});
