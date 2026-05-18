import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

describe("i18n timesheet day lock key (BUG 0423-98)", () => {
  it("EN resolves timesheet.dayNotEnabledForEntry", () => {
    expect((en as any).timesheet.dayNotEnabledForEntry).toBeTruthy();
  });

  it("ES resolves timesheet.dayNotEnabledForEntry", () => {
    expect((es as any).timesheet.dayNotEnabledForEntry).toBeTruthy();
  });

  it("ES value matches the requested copy exactly", () => {
    expect((es as any).timesheet.dayNotEnabledForEntry)
      .toBe("Día no habilitado para registro");
  });
});
