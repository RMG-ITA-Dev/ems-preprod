import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

/**
 * BUG 0220-61: Verifies i18n key resolution for approval_required labels.
 */
describe("i18n approval_required keys (BUG 0220-61)", () => {
  it("EN resolves engagement.approvalRequired", () => {
    expect((en as any).engagement.approvalRequired).toBe("Approval Required");
  });

  it("EN resolves engagement.approvalRequiredHelp", () => {
    expect((en as any).engagement.approvalRequiredHelp).toContain(
      "auto-approved"
    );
  });

  it("ES resolves engagement.approvalRequired", () => {
    expect((es as any).engagement.approvalRequired).toBe(
      "Requiere Aprobación"
    );
  });

  it("ES resolves engagement.approvalRequiredHelp", () => {
    expect((es as any).engagement.approvalRequiredHelp).toContain(
      "automáticamente"
    );
  });
});
