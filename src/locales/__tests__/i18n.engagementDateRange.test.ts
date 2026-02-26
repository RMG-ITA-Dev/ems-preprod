import { describe, it, expect } from "vitest";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

describe("i18n engagement date range keys (BUG 0220-63)", () => {
  it("EN resolves timesheet.dateOutsideEngagementRange", () => {
    expect((en as any).timesheet.dateOutsideEngagementRange).toBeTruthy();
  });

  it("ES resolves timesheet.dateOutsideEngagementRange", () => {
    expect((es as any).timesheet.dateOutsideEngagementRange).toBeTruthy();
  });

  it("EN resolves timesheet.cellOutsideEngagementDates", () => {
    expect((en as any).timesheet.cellOutsideEngagementDates).toBeTruthy();
  });

  it("ES resolves timesheet.cellOutsideEngagementDates", () => {
    expect((es as any).timesheet.cellOutsideEngagementDates).toBeTruthy();
  });

  it("EN resolves timesheet.submitDateRangeViolation", () => {
    expect((en as any).timesheet.submitDateRangeViolation).toBeTruthy();
  });

  it("ES resolves timesheet.submitDateRangeViolation", () => {
    expect((es as any).timesheet.submitDateRangeViolation).toBeTruthy();
  });
});
