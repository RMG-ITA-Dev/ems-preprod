import { describe, it, expect } from "vitest";
import { translateWorksheetCellsErrorKey } from "@/hooks/useWorksheetMutations";

// 0825-183: the matrix error translator (review.md iteración 1, #5) must match
// the trigger/RPC's exact codes only — never a partial/interpolated match — and
// ignore DETAIL, which never reaches `error.message` in the first place.
describe("translateWorksheetCellsErrorKey", () => {
  it("maps WORKSHEET_PRACTICE_REQUIRED to its i18n key", () => {
    expect(translateWorksheetCellsErrorKey("WORKSHEET_PRACTICE_REQUIRED")).toBe(
      "workMatrix.errorPracticeRequired"
    );
  });

  it("maps WORKSHEET_CATEGORY_OUT_OF_SCOPE to its i18n key", () => {
    expect(translateWorksheetCellsErrorKey("WORKSHEET_CATEGORY_OUT_OF_SCOPE")).toBe(
      "workMatrix.errorCategoryOutOfScope"
    );
  });

  it("maps WORKSHEET_ACTIVITY_OUT_OF_SCOPE to its i18n key", () => {
    expect(translateWorksheetCellsErrorKey("WORKSHEET_ACTIVITY_OUT_OF_SCOPE")).toBe(
      "workMatrix.errorActivityOutOfScope"
    );
  });

  it("trims surrounding whitespace before matching", () => {
    expect(translateWorksheetCellsErrorKey("  WORKSHEET_PRACTICE_REQUIRED  ")).toBe(
      "workMatrix.errorPracticeRequired"
    );
  });

  it("falls back to null for an unknown message", () => {
    expect(translateWorksheetCellsErrorKey("Some unrelated database error")).toBeNull();
  });

  it("falls back to null for a similar but not exact code", () => {
    expect(translateWorksheetCellsErrorKey("WORKSHEET_ACTIVITY_OUT_OF_SCOPE_V2")).toBeNull();
  });

  it("falls back to null when the code is interpolated with extra text", () => {
    expect(
      translateWorksheetCellsErrorKey("WORKSHEET_ACTIVITY_OUT_OF_SCOPE: activity abc123")
    ).toBeNull();
  });

  it("falls back to null when a diagnostic-looking suffix is appended to the code", () => {
    expect(
      translateWorksheetCellsErrorKey("WORKSHEET_PRACTICE_REQUIRED worksheet_id=abc123")
    ).toBeNull();
  });

  it("falls back to null for undefined/null messages", () => {
    expect(translateWorksheetCellsErrorKey(undefined)).toBeNull();
    expect(translateWorksheetCellsErrorKey(null)).toBeNull();
  });
});
